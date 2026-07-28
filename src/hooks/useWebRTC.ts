// ============================================================================
// src/hooks/useWebRTC.ts
// ----------------------------------------------------------------------------
// React hook for WebRTC peer connection management.
// Handles:
//   - RTCPeerConnection creation with STUN/TURN config
//   - SDP offer/answer exchange via the signaling backend
//   - ICE candidate exchange
//   - MediaStream track sending (host) and receiving (client)
//   - Connection lifecycle: start, stop, error recovery
//
// Requires the backend signaling channel (TCP) to be established before use.
// ============================================================================

import { useRef, useState, useCallback, useEffect } from 'react'
import type { SignalPayload } from '../../electron/common/ipc-contract'
import { useRemotePlayStore } from '../stores/useRemotePlayStore'

// ── STUN/TURN servers ─────────────────────────────────────────────────────
// Google's public STUN servers for LAN-assisted NAT traversal.
// For LAN-only streaming, STUN is sufficient since both peers are on the
// same subnet and can connect directly.

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
]

// ── WebRTC Configuration ──────────────────────────────────────────────────

const RTCPEER_CONFIG: RTCConfiguration = {
  iceServers: ICE_SERVERS,
  iceCandidatePoolSize: 5,
  // Bundle all media tracks into a single transport
  bundlePolicy: 'max-bundle',
  // Use RTC for media, not data channels
  rtcpMuxPolicy: 'require',
}

// ── Reconnection constants ─────────────────────────────────────────────
// Ramp-up strategy:
//   1st attempt → ICE restart on existing PC (fast, <50ms to initiate),
//                 wait 500ms for recovery; if timeout → escalate
//   2nd attempt → full reconnect (new PC + renegotiation) after 1s
//   3rd attempt → full reconnect after 2s
//   After 3 total attempts → give up with final error
//
// ICE restart is MUCH cheaper than a full reconnection: it generates new
// ICE credentials (ufrag/pwd) without recreating the PC, renegotiating
// SDP media sections, or re-adding tracks. Takes <50ms on the initiator.
// If the peer is still on the network (transient NAT/switch issue), ICE
// restart can recover in one RTT without the overhead of a new PC.
const MAX_RECONNECT_ATTEMPTS = 3
const RECONNECT_DELAYS = [1000, 2000, 4000]
const ICE_RESTART_TIMEOUT_MS = 500

// ── H264 codec preference ─────────────────────────────────────────────
// Safari on iOS (and Chrome iOS, which uses the same WebKit engine) does
// NOT support VP8 or VP9 for WebRTC video — it only supports H264. The
// host's Chromium defaults to VP8/VP9, so the SDP offer lists those first,
// the mobile client rejects them all, and the resulting answer has NO video
// track → black screen on the phone even though signaling and ICE complete.
//
// The fix: reorder codecs in the offer so H264 is preferred. We use the
// standard RTCRtpTransceiver.setCodecPreferences() API (Chrome 96+ /
// Electron 20+ / Chromium 96+). If the API is unavailable (older Electron),
// the offer falls back to the browser default (VP8/VP9) — desktop-to-desktop
// streaming still works, only mobile clients get no video.

function setH264Preference(pc: RTCPeerConnection): void {
  try {
    const videoSender = pc.getSenders().find((s) => s.track?.kind === 'video')
    if (!videoSender) return
    const transceiver = pc.getTransceivers().find((t) => t.sender === videoSender)
    if (!transceiver || typeof transceiver.setCodecPreferences !== 'function') return

    const caps = RTCRtpSender.getCapabilities('video')
    if (!caps?.codecs?.length) return

    // Split H.264 from everything else
    const h264 = caps.codecs.filter((c) =>
      c.mimeType.toUpperCase().includes('H264'),
    )
    const rest = caps.codecs.filter(
      (c) => !c.mimeType.toUpperCase().includes('H264'),
    )

    // Prefer H264 (put it first), then all other codecs in their original
    // order. This makes the SDP offer list H264 as the primary codec.
    // Safari/Chrome iOS will pick H264; desktop clients can still pick
    // VP8/VP9 from the rest.
    transceiver.setCodecPreferences([...h264, ...rest])
  } catch (err: any) {
    // setCodecPreferences can throw if called at the wrong signaling state.
    // This is non-fatal — the offer just uses the default codec order.
    // eslint-disable-next-line no-console
    console.warn('[WebRTC] setH264Preference failed (non-fatal):', err?.message)
  }
}

// ── Bitrate cap ────────────────────────────────────────────────────────
// Applies the user's configured maxBitrate (Kbps, from Settings) to the
// outgoing video encoding via RTCRtpSender.setParameters(). Without this,
// Chromium's default bandwidth estimation is uncapped/unconfigured and the
// Settings slider had no actual effect on the stream.

async function applyMaxBitrate(pc: RTCPeerConnection): Promise<void> {
  try {
    const videoSender = pc.getSenders().find((s) => s.track?.kind === 'video')
    if (!videoSender) return
    const maxBitrateKbps = useRemotePlayStore.getState().settings.maxBitrate
    if (!maxBitrateKbps || maxBitrateKbps <= 0) return

    const params = videoSender.getParameters()
    if (!params.encodings || params.encodings.length === 0) {
      params.encodings = [{}]
    }
    params.encodings[0].maxBitrate = maxBitrateKbps * 1000
    await videoSender.setParameters(params)
  } catch (err: any) {
    // eslint-disable-next-line no-console
    console.warn('[WebRTC] applyMaxBitrate failed (non-fatal):', err?.message)
  }
}

// ── Types ─────────────────────────────────────────────────────────────────

/**
 * Inferred cause of the last WebRTC disconnection, used by the UI to show
 * contextual messaging in the reconnection overlay and session badges.
 *
 * - `'peer_closed'`: Remote peer sent a 'bye' signal (intentional disconnect).
 * - `'network_blip'`: ICE restart recovered the connection in <500ms. The peer
 *   was still reachable; likely a transient NAT / switch / Wi-Fi hiccup.
 * - `'connection_dropped'`: Required full reconnect (new PC + renegotiation).
 *   Indicates a more serious drop — peer may have restarted the app, the
 *   network path may have changed, or the ICE restart timed out.
 * - `'reconnect_failed'`: All 3 reconnection attempts exhausted without recovery.
 * - `null`: No disconnection has occurred yet (initial state).
 */
export type ReconnectCausedBy =
  | 'peer_closed'
  | 'network_blip'
  | 'connection_dropped'
  | 'reconnect_failed'
  | null

export interface WebRTCControls {
  /** Current connection state */
  connectionState: RTCPeerConnectionState | 'new'
  /** ICE connection state */
  iceConnectionState: RTCIceConnectionState | 'new'
  /** The remote MediaStream (client side — populated when ontrack fires) */
  remoteStream: MediaStream | null
  /** Error message if something failed */
  error: string | null
  /** Whether the connection is established and streaming */
  streaming: boolean
  /** Peer connection stats (RTT, bitrate, etc.) updated periodically */
  stats: WebRTCStats | null
  /** Whether the input data channel is open and ready */
  inputChannelOpen: boolean
  /** Whether a reconnection attempt is in progress */
  reconnecting: boolean
  /** Current reconnection attempt number (0 = not reconnecting, 1-3 = attempts) */
  reconnectAttempt: number
  /** Inferred cause of the last disconnect (null = no disconnect yet) */
  lastDisconnectCause: ReconnectCausedBy

  /** Start the connection: host creates offer, client sends request */
  startConnection: () => Promise<void>
  /** Stop the connection and cleanup */
  stopConnection: () => void
  /** Send a signaling message to the remote peer */
  sendSignal: (signal: SignalPayload) => void
  /** Handle an incoming signaling message from the remote peer */
  handleIncomingSignal: (signal: SignalPayload) => void
  /**
   * Send an input event over the WebRTC data channel (client → host).
   * Returns true if the frame was queued for delivery, false if the channel
   * is not yet open. The binary format is defined in
   * `electron/modules/input-bridge.ts`.
   */
  sendInput: (frame: Uint8Array) => boolean
  /** Register a callback for inbound input frames (host side) */
  setOnInput: (cb: ((frame: Uint8Array) => void) | null) => void
}

export interface WebRTCStats {
  rttMs: number | null
  bitrateKbps: number | null
  packetsLost: number | null
  resolution: string | null
  framerate: number | null
}

interface UseWebRTCOptions {
  /** Host or client mode */
  mode: 'host' | 'client'
  /** Host: the captured MediaStream to send to the client */
  captureStream?: MediaStream | null
  /** Host: the remote peer's signaling address */
  remoteHost?: string
  /** Host: the remote peer's signaling port */
  remotePort?: number
  /** Client: host's listen port (discovered via UDP) */
  hostPort?: number
  /** Function to send signals via the backend signaling channel */
  onSendSignal: (signal: SignalPayload) => Promise<void> | void
}

// ── Hook ──────────────────────────────────────────────────────────────────

export function useWebRTC(options: UseWebRTCOptions): WebRTCControls {
  const { mode, captureStream, hostPort, onSendSignal } = options

  const pcRef = useRef<RTCPeerConnection | null>(null)
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([])
  const remoteDescSetRef = useRef(false)
  const statsIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  // Previous (timestamp, bytes) sample for bitrate delta calculation —
  // outbound bytesSent on host, inbound bytesReceived on client.
  const prevBitrateSampleRef = useRef<{ timestampMs: number; bytes: number } | null>(null)
  // Use ref for onSendSignal to avoid stale closures in PC event handlers
  const onSendSignalRef = useRef(onSendSignal)
  onSendSignalRef.current = onSendSignal

  // ── Input data channel (client → host) ─────────────────────────────────
  const inputChannelRef = useRef<RTCDataChannel | null>(null)
  const onInputCallbackRef = useRef<((frame: Uint8Array) => void) | null>(null)
  const [inputChannelOpen, setInputChannelOpen] = useState(false)

  const [connectionState, setConnectionState] = useState<RTCPeerConnectionState | 'new'>('new')
  const [iceConnectionState, setIceConnectionState] = useState<RTCIceConnectionState | 'new'>('new')
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [streaming, setStreaming] = useState(false)
  const [stats, setStats] = useState<WebRTCStats | null>(null)

  // ── Reconnection state ─────────────────────────────────────────────────
  // Tracks whether we're in the middle of auto-reconnecting after a
  // connection drop. reset on manual stopConnection() or successful connect.
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const iceRestartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reconnectCountRef = useRef(0)
  const wasConnectedRef = useRef(false)
  const [reconnecting, setReconnecting] = useState(false)
  const [reconnectAttempt, setReconnectAttempt] = useState(0)
  const [lastDisconnectCause, setLastDisconnectCause] = useState<ReconnectCausedBy>(null)
  const iceRestartAttemptedRef = useRef(false)

  // ── Stats polling ───────────────────────────────────────────────────────
  const stopStatsPolling = useCallback(() => {
    if (statsIntervalRef.current) {
      clearInterval(statsIntervalRef.current)
      statsIntervalRef.current = null
    }
    prevBitrateSampleRef.current = null
  }, [])

  const startStatsPolling = useCallback((pc: RTCPeerConnection) => {
    stopStatsPolling()
    statsIntervalRef.current = setInterval(async () => {
      try {
        const report = await pc.getStats()
        let rttMs: number | null = null
        let bitrateKbps: number | null = null
        let packetsLost: number | null = null
        let resolution: string | null = null
        let framerate: number | null = null

        let sampleTimestampMs: number | null = null
        let sampleBytes: number | null = null

        // Plain for-of (not report.forEach(cb)) so the compiler can track
        // narrowing on the outer `let`s without the closure-boundary quirk
        // that widens reassigned variables back to their initial type.
        for (const stat of report.values()) {
          if (stat.type === 'candidate-pair' && (stat as any).state === 'succeeded') {
            rttMs = (stat as any).currentRoundTripTime != null
              ? Math.round((stat as any).currentRoundTripTime * 1000)
              : rttMs
          }
          if (stat.type === 'inbound-rtp' && (stat as any).kind === 'video') {
            const s = stat as any
            packetsLost = s.packetsLost ?? packetsLost
            framerate = s.framesPerSecond ?? framerate
            if (s.frameWidth && s.frameHeight) {
              resolution = `${s.frameWidth}×${s.frameHeight}`
            }
            if (typeof s.bytesReceived === 'number') {
              sampleTimestampMs = s.timestamp
              sampleBytes = s.bytesReceived
            }
          }
          if (stat.type === 'outbound-rtp' && (stat as any).kind === 'video') {
            const s = stat as any
            framerate = s.framesPerSecond ?? framerate
            if (s.frameWidth && s.frameHeight) {
              resolution = `${s.frameWidth}×${s.frameHeight}`
            }
            if (typeof s.bytesSent === 'number') {
              sampleTimestampMs = s.timestamp
              sampleBytes = s.bytesSent
            }
          }
        }

        const sample = (sampleTimestampMs !== null && sampleBytes !== null)
          ? { timestampMs: sampleTimestampMs, bytes: sampleBytes }
          : null
        if (sample) {
          const prev = prevBitrateSampleRef.current
          if (prev && sample.timestampMs > prev.timestampMs) {
            const deltaBytes = sample.bytes - prev.bytes
            const deltaSeconds = (sample.timestampMs - prev.timestampMs) / 1000
            if (deltaBytes >= 0 && deltaSeconds > 0) {
              bitrateKbps = Math.round((deltaBytes * 8) / deltaSeconds / 1000)
            }
          }
          prevBitrateSampleRef.current = sample
        }

        setStats({
          rttMs,
          bitrateKbps,
          packetsLost,
          resolution,
          framerate,
        })
      } catch {
        // Stats collection failed silently
      }
    }, 2000)
  }, [stopStatsPolling])

  // ── Create PeerConnection ───────────────────────────────────────────────
  const createPeerConnection = useCallback(() => {
    if (pcRef.current) {
      pcRef.current.close()
      pcRef.current = null
    }

    try {
      const pc = new RTCPeerConnection(RTCPEER_CONFIG)
      pcRef.current = pc

      pc.onconnectionstatechange = () => {
        const state = pc.connectionState
        setConnectionState(state)

        if (state === 'connected') {
          setStreaming(true)
          setError(null)
          // Read BEFORE overwriting: this flag distinguishes "first-ever
          // connect this session" (false) from "reconnected after a drop"
          // (true). Setting it to true first would make every first
          // connect look like a recovery from a drop that never happened.
          const wasConnectedBefore = wasConnectedRef.current
          wasConnectedRef.current = true
          // Reset reconnection state on successful connect
          cancelReconnect()
          setReconnecting(false)
          setReconnectAttempt(0)
          reconnectCountRef.current = 0
          // Infer cause: if ICE restart was attempted before this
          // successful connection, it was a fast recovery (network_blip).
          // Otherwise, only call it a recovery if we were connected before.
          if (iceRestartAttemptedRef.current) {
            setLastDisconnectCause('network_blip')
          } else if (wasConnectedBefore) {
            setLastDisconnectCause('connection_dropped')
          }
          iceRestartAttemptedRef.current = false
          startStatsPolling(pc)
        } else if (state === 'failed') {
          setStreaming(false)
          setError('Connection failed — peer may have disconnected')
          stopStatsPolling()
          // Auto-reconnect only if we had a successful connection before
          if (wasConnectedRef.current) {
            scheduleReconnect()
          }
        } else if (state === 'disconnected') {
          setStreaming(false)
          stopStatsPolling()
          // disconnection may be transient — retry if we were connected
          if (wasConnectedRef.current) {
            scheduleReconnect()
          }
        } else if (state === 'closed') {
          setStreaming(false)
          stopStatsPolling()
        }
      }

      pc.oniceconnectionstatechange = () => {
        setIceConnectionState(pc.iceConnectionState)
      }

      // ICE candidate handler (uses ref to avoid stale closure)
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          onSendSignalRef.current({
            type: 'ice',
            data: event.candidate.toJSON(),
          })
        }
      }

      // Track handler (client side: receive remote stream)
      pc.ontrack = (event) => {
        if (mode === 'client' && event.streams && event.streams.length > 0) {
          // eslint-disable-next-line no-console
          console.log('[WebRTC] ontrack received:', {
            kind: event.track?.kind,
            streams: event.streams.length,
            trackId: event.track?.id,
            streamId: event.streams[0]?.id,
          })
          setRemoteStream(event.streams[0])
          setStreaming(true)
          setError(null)
        }
      }

      // Data channel handler (client side: receive the host's input channel)
      pc.ondatachannel = (event) => {
        const ch = event.channel
        ch.binaryType = 'arraybuffer'
        inputChannelRef.current = ch
        ch.onopen = () => setInputChannelOpen(true)
        ch.onclose = () => setInputChannelOpen(false)
        ch.onerror = (err: any) => {
          // eslint-disable-next-line no-console
          console.warn('[WebRTC] input data-channel error:', err)
          setInputChannelOpen(false)
        }
        ch.onmessage = (msg) => {
          // Inbound input frame from client — only meaningful on host.
          if (mode !== 'host') return
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const cb = onInputCallbackRef.current
          if (!cb) return
          const data = msg.data
          if (data instanceof ArrayBuffer) {
            cb(new Uint8Array(data))
          } else if (ArrayBuffer.isView(data)) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            cb(new Uint8Array((data as any).buffer, (data as any).byteOffset, (data as any).byteLength))
          }
        }
      }

      return pc
    } catch (err: any) {
      setError(`Failed to create peer connection: ${err.message}`)
      return null
    }
  }, [mode, startStatsPolling, stopStatsPolling])

  // ── Add local tracks (host side) ────────────────────────────────────────
  useEffect(() => {
    if (mode === 'host' && captureStream && pcRef.current) {
      const pc = pcRef.current
      // Remove existing senders first
      pc.getSenders().forEach((s) => pc.removeTrack(s))

      for (const track of captureStream.getTracks()) {
        if (track.kind === 'video' || track.kind === 'audio') {
          try {
            pc.addTrack(track, captureStream)
          } catch (err: any) {
            console.warn(`[WebRTC] Failed to add track ${track.kind}: ${err.message}`)
          }
        }
      }
      applyMaxBitrate(pc)
    }
  }, [mode, captureStream])

  // ── Ramp-up reconnection helpers ─────────────────────────────────────
  // Cancel any pending reconnection timer and reset retry state. Called
  // from stopConnection() and when a new connection succeeds. Safe to call
  // when no reconnection is in flight (no-ops). Also cancels an in-flight
  // ICE restart timeout so escalation stops cleanly.
  const cancelReconnect = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current)
      reconnectTimerRef.current = null
    }
    if (iceRestartTimerRef.current) {
      clearTimeout(iceRestartTimerRef.current)
      iceRestartTimerRef.current = null
    }
  }, [])

  // Attempt an ICE restart on the EXISTING peer connection. This generates
  // new ICE credentials (ufrag/pwd) but keeps the same SDP media sections
  // and transceivers. Returns true if the restart offer was sent; false if
  // the PC is closed / signaling state prevents it.
  //
  // Called by scheduleReconnect on the FIRST attempt only — ICE restart
  // is orders of magnitude cheaper than a full reconnection and can recover
  // a dropped peer in <1 RTT if the network issue was transient.
  const attemptIceRestart = useCallback(async (): Promise<boolean> => {
    const pc = pcRef.current
    if (!pc || pc.connectionState === 'closed') return false
    // ICE restart requires 'stable' signaling state. If the PC is mid-
    // negotiation (have-local-offer, have-remote-offer), we can't restart.
    if (pc.signalingState !== 'stable') return false

    try {
      // createOffer with iceRestart:true generates new ICE credentials
      // but preserves existing transceivers, tracks, and data channels.
      const offer = await pc.createOffer({ iceRestart: true })
      await pc.setLocalDescription(offer)
      onSendSignal({ type: 'offer', data: offer })
      return true
    } catch (err: any) {
      // eslint-disable-next-line no-console
      console.warn('[WebRTC] ICE restart failed:', err?.message)
      return false
    }
  }, [onSendSignal])

  // Ref to capture latest attemptIceRestart for use inside setTimeout closures
  // without stale deps. Updated on every render.
  const attemptIceRestartRef = useRef(attemptIceRestart)
  attemptIceRestartRef.current = attemptIceRestart

  // Schedule the next reconnection attempt with ramp-up:
  //   attempt 0 → ICE restart (fast, on existing PC) with 500ms escalation timer
  //   attempt 1 → full reconnect after 1s
  //   attempt 2 → full reconnect after 2s
  //   attempt 3 → full reconnect after 4s
  //   attempt 4+ → give up
  const scheduleReconnect = useCallback(() => {
    cancelReconnect()

    const attempt = reconnectCountRef.current
    if (attempt >= MAX_RECONNECT_ATTEMPTS) {
      setError(`Reconnection failed after ${MAX_RECONNECT_ATTEMPTS} attempts`)
      setLastDisconnectCause('reconnect_failed')
      setReconnecting(false)
      setReconnectAttempt(0)
      reconnectCountRef.current = 0
      return
    }

    const delay = attempt === 0 ? 0 : (RECONNECT_DELAYS[attempt] ?? 4000)
    reconnectCountRef.current = attempt + 1
    setReconnecting(true)
    setReconnectAttempt(attempt + 1)

    reconnectTimerRef.current = setTimeout(() => {
      reconnectTimerRef.current = null

      if (attempt === 0 && mode === 'host' && pcRef.current) {
        // RAMP-UP STEP 1: try ICE restart on the existing PC.
        // If the peer is still reachable (transient network blip), this
        // recovers in one RTT without recreating the PC. If the PC is
        // in a bad state or the peer is truly gone, escalate below.
        iceRestartAttemptedRef.current = true
        attemptIceRestartRef.current().then((restarted) => {
          if (restarted) {
            // ICE restart offer was sent. Wait 500ms for the connection
            // to recover. If it does, onconnectionstatechange fires
            // 'connected' and cancels all timers. If not, escalate.
            iceRestartTimerRef.current = setTimeout(() => {
              iceRestartTimerRef.current = null
              // ICE restart timed out — escalate to full reconnect
              startConnectionRef.current()
            }, ICE_RESTART_TIMEOUT_MS)
          } else {
            // ICE restart not possible (PC closed, wrong signaling
            // state) — escalate immediately to full reconnection
            startConnectionRef.current()
          }
        })
      } else {
        // Full reconnection path (creates new PC + renegotiates SDP)
        startConnectionRef.current()
      }
    }, delay)
  }, [cancelReconnect, mode])

  const startConnection = useCallback(async () => {
    setError(null)
    pendingCandidatesRef.current = []
    remoteDescSetRef.current = false

    const pc = createPeerConnection()
    if (!pc) return

    // Add local tracks (host side)
    if (mode === 'host' && captureStream) {
      for (const track of captureStream.getTracks()) {
        if (track.kind === 'video' || track.kind === 'audio') {
          try {
            pc.addTrack(track, captureStream)
          } catch {}
        }
      }
      applyMaxBitrate(pc)
    }

    if (mode === 'host') {
      // Set H264 codec preference so the SDP offer (created later on
      // 'request') includes H264 as the preferred codec. Without this,
      // Electron's Chromium defaults to VP8/VP9, which Safari/Chrome on
      // iOS don't support for WebRTC → no video track in the answer →
      // black screen on the phone.
      setH264Preference(pc)

      // Host creates the input data channel so the SDP includes the
      // `m=application` section that the client can match on. The data
      // channel is created here (before 'request' arrives), not lazily,
      // so the transceiver is established and gets included in the offer.
      try {
        const ch = pc.createDataChannel('ycore-input', { ordered: true })
        ch.binaryType = 'arraybuffer'
        inputChannelRef.current = ch
        ch.onopen = () => setInputChannelOpen(true)
        ch.onclose = () => setInputChannelOpen(false)
      } catch (err: any) {
        // eslint-disable-next-line no-console
        console.warn('[WebRTC] failed to create input data channel:', err)
      }

      // NOTE: We deliberately do NOT create an offer here. An eager offer
      // would leave signalingState='have-local-offer', and when a mobile
      // (or any second) peer later sends a 'request' signal, the handler
      // would silently ignore it because the guard requires 'stable'
      // signaling state before creating a new offer.
      //
      // Instead, the host waits for the first 'request' from the peer
      // (see handleIncomingSignal → case 'request') and creates the offer
      // at that point. This works for BOTH the desktop BrowseTab (which
      // sends 'request' via TCP signaling) and the mobile browser (which
      // sends 'request' via the WS bridge).
      //
      // RECONNECTION TIMING NOTE: In the reconnect path, the host depends
      // on the client sending a fresh 'request' after detecting the old
      // connection died. If the client exhausts its retry attempts before
      // the host finishes creating the new PC, the reconnection silently
      // stalls. In practice this is mitigated by ICE restart (attempt 0,
      // 500ms timeout) before escalating to full reconnect, plus 3 client
      // retries with 1s/2s/4s backoff. If reconnections seem stuck, check
      // that the client's 'request' arrives after the host's PC is ready.
      // eslint-disable-next-line no-console
      console.log(`[trace] host startConnection: PC ready (no eager offer), waiting for 'request' signal`)
    } else {
      // Client: send connection request to host
      // eslint-disable-next-line no-console
      console.log('[trace] client startConnection: sending REQUEST to host')
      onSendSignal({ type: 'request', data: null })
    }
  }, [mode, captureStream, createPeerConnection, onSendSignal])

  // Ref to capture the latest startConnection — used by scheduleReconnect's
  // setTimeout callback to avoid stale closures. Declared AFTER the
  // useCallback so the initial value argument doesn't trigger a ReferenceError
  // (const temporal dead zone). Updated on every render to stay fresh.
  const startConnectionRef = useRef(startConnection)
  startConnectionRef.current = startConnection

  // ── Handle incoming signals ────────────────────────────────────────────
  const handleIncomingSignal = useCallback(async (signal: SignalPayload) => {
    const pc = pcRef.current
    if (!pc) {
      // eslint-disable-next-line no-console
      console.warn(`[WebRTC] handleIncomingSignal(${signal.type}): no PC yet — caller should retry later or startConnection first`)
      return
    }

    try {
      switch (signal.type) {
        case 'request': {
          // Host receives a connection request from a client
          if (mode !== 'host') return

          // eslint-disable-next-line no-console
          console.log(`[trace] host handleIncomingSignal(request): signalingState=${pc.signalingState}`)

          // Guard: signaling must be 'stable' before creating an offer.
          // If it's not (e.g., a negotiation is already in flight), drop
          // this request — the client should retry or wait. This prevents
          // the 'InvalidStateError: Cannot create offer in state
          // have-local-offer' error that would occur if we tried to create
          // a new offer while a previous one was still outstanding.
          //
          // In host mode, startConnection() does NOT create an eager offer
          // anymore (it only adds tracks + creates the data channel), so
          // signalingState should always be 'stable' when a 'request'
          // arrives here. If it's not, log and skip.
          if (pc.signalingState !== 'stable') {
            // eslint-disable-next-line no-console
            console.warn(`[WebRTC] handleIncomingSignal(request): ignoring — signalingState=${pc.signalingState} (expected 'stable')`)
            return
          }
          // Set H264 preference before creating the offer, same reason
          // as in startConnection(). The transceiver already exists at
          // this point because tracks were added in startConnection.
          setH264Preference(pc)
          const offer = await pc.createOffer({
            offerToReceiveVideo: false,
            offerToReceiveAudio: false,
          })
          await pc.setLocalDescription(offer)
          // eslint-disable-next-line no-console
          console.log(`[trace] host sent OFFER (signalState=${pc.signalingState})`)
          onSendSignal({ type: 'offer', data: offer })
          break
        }

        case 'offer': {
          // Client receives an offer from the host
          if (mode !== 'client' || !signal.data) {
            // eslint-disable-next-line no-console
            console.warn(`[WebRTC] offer ignored: mode=${mode} hasData=${!!signal.data}`)
            return
          }
          const offerDesc = new RTCSessionDescription(signal.data)
          // eslint-disable-next-line no-console
          console.log(`[WebRTC] received OFFER, setting remote desc (currentState=${pc.signalingState})`)
          await pc.setRemoteDescription(offerDesc)
          remoteDescSetRef.current = true

          // Flush any pending ICE candidates
          for (const candidate of pendingCandidatesRef.current) {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(candidate))
            } catch {}
          }
          pendingCandidatesRef.current = []

          const answer = await pc.createAnswer()
          await pc.setLocalDescription(answer)
          // eslint-disable-next-line no-console
          console.log(`[WebRTC] sent ANSWER (signalingState=${pc.signalingState})`)
          onSendSignal({ type: 'answer', data: answer })
          break
        }

        case 'answer': {
          // Host receives an answer from a client
          if (mode !== 'host' || !signal.data) {
            // eslint-disable-next-line no-console
            console.warn(`[WebRTC] answer ignored: mode=${mode} hasData=${!!signal.data}`)
            return
          }
          // eslint-disable-next-line no-console
          console.log(`[trace] host received ANSWER (currentState=${pc.signalingState}), setting remote desc...`)
          const answerDesc = new RTCSessionDescription(signal.data)
          await pc.setRemoteDescription(answerDesc)
          remoteDescSetRef.current = true

          // Flush any pending ICE candidates
          for (const candidate of pendingCandidatesRef.current) {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(candidate))
            } catch {}
          }
          pendingCandidatesRef.current = []
          break
        }

        case 'ice': {
          // Both sides: handle ICE candidate
          if (!signal.data) return
          if (remoteDescSetRef.current) {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(signal.data))
            } catch {}
          } else {
            // Queue candidate until remote description is set
            pendingCandidatesRef.current.push(signal.data)
          }
          break
        }

        case 'bye': {
          // Remote peer intentionally disconnected.
          // stopConnection() resets lastDisconnectCause → null, so
          // we must set the cause AFTER stopConnection(), not before.
          // eslint-disable-next-line no-console
          console.log('[WebRTC] received BYE — stopping connection')
          stopConnection()
          setLastDisconnectCause('peer_closed')
          setError('Remote peer disconnected')
          break
        }
      }
    } catch (err: any) {
      // eslint-disable-next-line no-console
      console.error(`[WebRTC] Signal handling error (${signal.type}):`, err?.message, err?.stack)
      setError(`Signal handling error (${signal.type}): ${err.message}`)
    }
  }, [mode, onSendSignal])

  // ── Send signal ─────────────────────────────────────────────────────────
  const sendSignal = useCallback((signal: SignalPayload) => {
    onSendSignal(signal)
  }, [onSendSignal])

  // ── Stop connection ────────────────────────────────────────────────────
  const stopConnection = useCallback(() => {
    // Cancel any in-flight reconnection attempt
    cancelReconnect()

    stopStatsPolling()
    pendingCandidatesRef.current = []
    remoteDescSetRef.current = false

    if (inputChannelRef.current) {
      try { inputChannelRef.current.close() } catch { /* ignore */ }
      inputChannelRef.current = null
    }
    onInputCallbackRef.current = null

    if (pcRef.current) {
      pcRef.current.close()
      pcRef.current = null
    }

    setConnectionState('new')
    setIceConnectionState('new')
    setRemoteStream(null)
    setStreaming(false)
    setError(null)
    setStats(null)
    setInputChannelOpen(false)
    setReconnecting(false)
    setReconnectAttempt(0)
    setLastDisconnectCause(null)
    reconnectCountRef.current = 0
    wasConnectedRef.current = false
    iceRestartAttemptedRef.current = false
  }, [stopStatsPolling, cancelReconnect])

  // ── sendInput (client → host) ───────────────────────────────────────────
  const sendInput = useCallback((frame: Uint8Array): boolean => {
    const ch = inputChannelRef.current
    if (!ch || ch.readyState !== 'open') return false
    try {
      // RTCDataChannel.send() expects ArrayBufferView backed by ArrayBuffer
      // (not SharedArrayBuffer). Recent lib.dom.d.ts widens the parameter
      // type to `ArrayBufferView<ArrayBuffer>`, so we slice the frame into
      // a fresh ArrayBuffer-backed view. Cost: one ~10-byte allocation per
      // frame (mobile joystick peaks at 30Hz, so trivial GC pressure).
      ch.send(frame.slice())
      return true
    } catch {
      return false
    }
  }, [])

  // ── setOnInput (register host-side handler) ─────────────────────────────
  const setOnInput = useCallback((cb: ((frame: Uint8Array) => void) | null) => {
    onInputCallbackRef.current = cb
  }, [])

  // ── Cleanup on unmount ─────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      stopConnection()
    }
  }, [stopConnection])

  return {
    connectionState,
    iceConnectionState,
    remoteStream,
    error,
    streaming,
    stats,
    inputChannelOpen,
    reconnecting,
    reconnectAttempt,
    lastDisconnectCause,
    startConnection,
    stopConnection,
    sendSignal,
    handleIncomingSignal,
    sendInput,
    setOnInput,
  }
}
