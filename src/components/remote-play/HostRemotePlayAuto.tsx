// ============================================================================
// src/components/remote-play/HostRemotePlayAuto.tsx
// ----------------------------------------------------------------------------
// Headless host-side manager for "phone launched a game" flows.
//
// When a mobile browser (#/remote-mobile) taps a game, the main process runs
// `launchFromMobile` (electron/services/remote-play.service.ts) which:
//   1. Starts hosting (if not already)
//   2. Launches the requested appId via Steam
//   3. Broadcasts `remotePlay:mobileLaunch` IPC to every BrowserWindow
//   4. Returns the session so the mobile client knows where to connect
//
// This component listens for that IPC and bridges the missing pieces that
// the desktop user would normally do by clicking "Iniciar transmisión" on
// RemotePlayPage: start screen capture (without a user gesture — uses the
// Electron desktopCapturer fallback in useScreenCapture), start the TCP
// signaling listener (streamPort+1), and own a WebRTC peer in host mode
// that answers the mobile client's `request` signal with an SDP offer.
//
// Why a SEPARATE component (not inside RemotePlayPage):
//   The user might be on Library / Store / Settings when the mobile taps a
//   game. RemotePlayPage is NOT mounted there, so its hooks wouldn't run.
//   Mounting this in AppShell guarantees the auto-host is alive regardless
//   of the current route.
//
// Why an INNER component gated by useLocation:
//   When the user IS on /remote-play, RemotePlayPage's HostTab already owns
//   the capture + WebRTC hooks. Mounting both would race over the capture
//   device, fire two offers on the same signaling port, and double-dispatch
//   input frames. The inner component therefore short-circuits when the
//   pathname starts with `/remote-play`.
// ============================================================================

import { useEffect, useCallback, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useScreenCapture } from '../../hooks/useScreenCapture'
import { useWebRTC } from '../../hooks/useWebRTC'
import { remotePlayService } from '../../services/remote-play.service'
import { useToastStore } from '../../stores/useToastStore'
import type { SignalPayload } from '../../../electron/common/ipc-contract'
import { HOST_RENDERER_FROM } from '../../../electron/common/ipc-contract'

/**
 * Outer component — decides whether to mount the headless manager.
 * Returns null when RemotePlayPage's HostTab is already in charge.
 */
export function HostRemotePlayAuto() {
  const location = useLocation()
  if (location.pathname.startsWith('/remote-play')) return null
  return <HostRemotePlayAutoInner />
}

function HostRemotePlayAutoInner() {
  const capture = useScreenCapture()
  // Destructured out so the mobileLaunch effect below can depend on this
  // stable function reference instead of the whole `capture` object, which
  // useScreenCapture() returns as a fresh literal every render.
  const { startCapture: captureStartCapture } = capture
  const { showToast } = useToastStore()
  const [autoActive, setAutoActive] = useState(false)
  // Track latest incoming signal so a `request` arriving before capture is
  // ready still triggers startConnection() once capture becomes active.
  // Mirrors RemotePlayPage's HostTab `remoteSignal` state pattern.
  const [pendingRequest, setPendingRequest] = useState<SignalPayload | null>(null)
  // Guard so the mobileLaunch handler doesn't double-fire if Electron
  // broadcasts to multiple windows or React StrictMode re-runs the effect.
  const inFlightRef = useRef(false)

  // ── sendSignal fans the outbound WebRTC signal to every reachable peer ────
  // The previous implementation called `remotePlayService.sendSignal(host, port,
  // signal)`, which mapped to `sendSignalToHost` — opens a fresh throwaway TCP
  // socket to host:streamPort+1, writes the JSON line, then `socket.destroy()`s
  // it. The server-side TCP socket was created, the signalingServer's
  // connection handler replaced the existing `signalingClientSocket` (closing
  // the mobile's bridge-side leg in the process), parsed the line, called
  // `onSignalCallback`, which fired IPC back to the host's OWN renderer. In
  // host mode `useWebRTC` early-returns on 'offer', so the answer was that
  // nothing actually reached the phone but the mobile's TCP was destroyed.
  //
  // `broadcastSignal(signal)` fans the SAME envelope out to:
  //   • the live LAN TCP `signalingClientSocket` (peer desktop)
  //   • every BrowserBridge WS client subscribed to `remotePlay:signal` (mobile)
  //   • every BrowserWindow (defense — surface signals to dev-tools/splash too)
  // Whoever the actual peer is receives the frame.
  const sendSignal = useCallback(async (signal: SignalPayload) => {
    try {
      await remotePlayService.broadcastSignal(signal)
    } catch (err: any) {
      // eslint-disable-next-line no-console
      console.warn('[HostRemotePlayAuto] broadcastSignal failed:', err?.message)
    }
  }, [])

  const webrtc = useWebRTC({
    mode: 'host',
    captureStream: capture.state.stream,
    onSendSignal: sendSignal,
  })

  // ── Forward incoming signals to the webrtc hook ────────────────────────
  useEffect(() => {
    const unsub = remotePlayService.onSignal((signal) => {
      // Drop our own self-echo. broadcastSignal() tags every IPC envelope
      // with `from: 'host-renderer'` and fans out to every BrowserWindow,
      // INCLUDING the one that just produced the signal. Without this filter
      // the WebRTC hook would addIceCandidate(host's own candidate) on
      // every ICE trickle, bloating pendingCandidatesRef and potentially
      // tripping the 'bye' handler into stopping our own session.
      if (!signal || (signal as any).from === HOST_RENDERER_FROM) return
      // Track 'request' so we can fire startConnection() once capture is
      // ready. Other signal types are forwarded directly.
      if (signal?.type === 'request') {
        setPendingRequest(signal)
      }
      webrtc.handleIncomingSignal(signal)
    })
    return unsub
  }, [webrtc.handleIncomingSignal])

  // ── Wire input bridge so mobile frames dispatch to win32 SendInput ─────
  useEffect(() => {
    webrtc.setOnInput((frame) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const bridge = (window as any).steamtools?.inputBridge
      if (!bridge?.dispatch) return
      bridge.dispatch(frame).catch(() => undefined)
    })
    return () => webrtc.setOnInput(null)
  }, [webrtc])

  // ── React to `request` + capture-ready → start the WebRTC host peer ────
  // We deliberately do NOT fire an offer proactively. The mobile client
  // (PlayView in mobile.tsx) sends a 'request' via sendSignalToHost AFTER
  // its own WebRTC module has loaded. Firing the offer earlier would race
  // the mobile into answering before its peer is alive, dropping the offer
  // on the floor. This is the same convention RemotePlayPage's HostTab uses.
  //
  // We only call startConnection() once BOTH the 'request' has arrived AND
  // capture is active. The host peer attaches the capture tracks during
  // startConnection(); calling it without a stream would create a useless
  // audio/video-less peer.
  useEffect(() => {
    if (!autoActive) return
    if (!pendingRequest) return
    if (!capture.state.active) return
    if (webrtc.connectionState !== 'new') return
    void webrtc.startConnection()
    // `webrtc` (the whole hook return value) is a fresh object every render,
    // not just when connectionState/startConnection actually change — depending
    // on it here re-ran this effect on unrelated re-renders (e.g. a stats-poll
    // tick) and could call startConnection() again mid-handshake, tearing down
    // and recreating the RTCPeerConnection. Depend on the specific values used.
  }, [autoActive, pendingRequest, capture.state.active, webrtc.connectionState, webrtc.startConnection])

  // ── Listen for `remotePlay:mobileLaunch` IPC from main ─────────────────
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const api = (window as any).steamtools
    if (!api?.onMobileLaunch) return

    const unsub = api.onMobileLaunch(
      async ({ appId, sessionId }: { appId: string; sessionId: string }) => {
        if (inFlightRef.current) {
          // eslint-disable-next-line no-console
          console.info('[HostRemotePlayAuto] mobileLaunch ignored: another launch is in flight')
          return
        }
        inFlightRef.current = true
        try {
          // 1. Start capture. The desktopCapturer fallback inside
          //    useScreenCapture means no user gesture is required — it
          //    auto-picks the primary monitor and feeds
          //    chromeMediaSourceId to getUserMedia.
          try {
            await captureStartCapture({ preferAudio: true })
          } catch (err: any) {
            // eslint-disable-next-line no-console
            console.error('[HostRemotePlayAuto] capture failed:', err?.message ?? err)
            showToast(
              'error',
              'No se pudo capturar la pantalla. Verificá que Y-Core tenga permiso de grabación.',
            )
            return
          }

          // 2. Start TCP signaling listener (port+1). The mobile client's
          //    'request' signal arrives here once its WebRTC module is ready.
          try {
            await remotePlayService.startSignalingListener()
          } catch (err: any) {
            // eslint-disable-next-line no-console
            console.warn('[HostRemotePlayAuto] signaling listener:', err?.message ?? err)
          }

          setAutoActive(true)
          // eslint-disable-next-line no-console
          console.info(`[HostRemotePlayAuto] auto-host active for appId=${appId} sessionId=${sessionId}`)
        } finally {
          inFlightRef.current = false
        }
      },
    )
    return unsub
  }, [captureStartCapture, showToast])

  return null
}

export default HostRemotePlayAuto