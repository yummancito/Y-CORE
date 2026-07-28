// ============================================================================
// src/pages/remote-play/StreamPlayer.tsx
// ----------------------------------------------------------------------------
// Stream Player — renders a remote video stream when connected to a host.
// Supports both real WebRTC remote streams and placeholder state.
// Shows connection quality, stream stats, and input controls.
//
// Used in the Browse tab when actively connected to a remote host.
// ============================================================================

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Monitor,
  Wifi,
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
  XCircle,
  Zap,
  Clock,
  Signal,
  Loader2,
  RefreshCw,
} from 'lucide-react'
import type { RemotePlaySession } from '../../../electron/common/ipc-contract'
import type { WebRTCStats, ReconnectCausedBy } from '../../hooks/useWebRTC'
import MobileControls from '../../components/remote-play/MobileControls'

// ── Props ──────────────────────────────────────────────────────────────────

interface StreamPlayerProps {
  session: RemotePlaySession
  onDisconnect: () => void
  connecting?: boolean
  /** Real remote MediaStream from WebRTC (when connected) */
  remoteStream?: MediaStream | null
  /** Real WebRTC stats (when connected) */
  webrtcStats?: WebRTCStats | null
  /** Real connection state */
  webrtcState?: string
  /** Emit an input frame over the WebRTC data channel. If provided, the
   *  mobile controls overlay is rendered while streaming. */
  onFrame?: (frame: Uint8Array) => boolean
  /** Whether the input data channel is currently open (drives UI badge) */
  inputChannelOpen?: boolean
  /** Whether a reconnection attempt is in progress */
  reconnecting?: boolean
  /** Current reconnection attempt number (1-3) */
  reconnectAttempt?: number
  /** Inferred cause of the original disconnect */
  disconnectCause?: ReconnectCausedBy
  /**
   * If true, the player container fills 100% of the parent (no 16:9
   * aspect ratio constraint). Used by the mobile client (PlayView)
   * where the stream should take the full viewport in landscape.
   */
  fillContainer?: boolean
}

// ── Connection quality indicator ───────────────────────────────────────────

type QualityLevel = 'excellent' | 'good' | 'fair' | 'poor' | 'disconnected'

// Receivable session statuses — i.e. statuses for which it makes sense to
// render StreamPlayer's actual player UI rather than the empty-state.
// Whitelist rather than blacklist (any unknown status falls through to
// <NotConnected />) to keep regressions visible: a future non-canonical
// status from the server would otherwise render an empty player shell with
// a stuck "Awaiting video data" placeholder.
//
// `connecting` is included so the mobile-launched path renders the player
// shell (with the spinner under the `connecting` prop) while the WebRTC
// handshake is in flight — otherwise the syntheticSession.status of
// 'connecting' would fall through to <NotConnected /> and the user would
// see "Not connected to any host" while the actual connection succeeds.
const RECEIVABLE_STATUSES: ReadonlySet<RemotePlaySession['status']> = new Set([
  'connecting',
  'connected',
  'hosting',
])

function getQualityLevel(packetsLost?: number | null, rttMs?: number | null): QualityLevel {
  if (rttMs === undefined && packetsLost === undefined) return 'fair'
  if (rttMs === undefined) return (packetsLost ?? 0) > 10 ? 'poor' : 'fair'
  if (rttMs !== null && rttMs < 30 && (packetsLost ?? 0) < 2) return 'excellent'
  if (rttMs !== null && rttMs < 80 && (packetsLost ?? 0) < 5) return 'good'
  if (rttMs !== null && rttMs < 200) return 'fair'
  return 'poor'
}

function QualityBadge({ level }: { level: QualityLevel }) {
  const colors: Record<QualityLevel, string> = {
    excellent: 'text-green-400 bg-green-500/10 border-green-500/20',
    good: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
    fair: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20',
    poor: 'text-red-400 bg-red-500/10 border-red-500/20',
    disconnected: 'text-text-dim bg-white/[0.05] border-white/[0.1]',
  }
  const labels: Record<QualityLevel, string> = {
    excellent: 'Excellent',
    good: 'Good',
    fair: 'Fair',
    poor: 'Poor',
    disconnected: 'Disconnected',
  }

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${colors[level]}`}>
      <span className={`w-1 h-1 rounded-full ${
        level === 'excellent' || level === 'good' ? 'bg-current' : 'bg-current/50'
      }`} />
      {labels[level]}
    </span>
  )
}

// ── Format duration ────────────────────────────────────────────────────────

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}h ${m}m ${s}s`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

// ── Stream Not Connected state ─────────────────────────────────────────────

function NotConnected() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-text-dim rounded-2xl border border-dashed border-white/[0.1]">
      <Monitor className="w-12 h-12 mb-4 opacity-30" />
      <p className="text-sm font-medium">Not connected to any host</p>
      <p className="text-xs mt-1">Browse the network and connect to a streaming host</p>
    </div>
  )
}

// ── Connecting state ───────────────────────────────────────────────────────

function Connecting() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-text-dim">
      <div className="relative w-16 h-16 mb-4">
        <div className="absolute inset-0 rounded-full border-2 border-accent/20 animate-pulse" />
        <div className="absolute inset-2 rounded-full border-2 border-transparent border-t-accent animate-spin" />
        <div className="absolute inset-4 rounded-full bg-accent/10 flex items-center justify-center">
          <Zap className="w-4 h-4 text-accent" />
        </div>
      </div>
      <p className="text-sm font-medium text-text-bright">Connecting...</p>
      <p className="text-xs mt-1">Establishing secure streaming session via WebRTC</p>
    </div>
  )
}

// ── Stream Player ──────────────────────────────────────────────────────────

export default function StreamPlayer({
  session,
  onDisconnect,
  connecting,
  remoteStream,
  webrtcStats,
  webrtcState,
  onFrame,
  inputChannelOpen,
  reconnecting,
  reconnectAttempt,
  disconnectCause,
  fillContainer,
}: StreamPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isMuted, setIsMuted] = useState(true)
  const [showStats, setShowStats] = useState(false)
  const [needsUserGesture, setNeedsUserGesture] = useState(false)
  const startTimeRef = useRef(Date.now())
  const [duration, setDuration] = useState(0)

  const hasRemoteVideo = remoteStream !== null && remoteStream !== undefined
  const showReconnecting = reconnecting && hasRemoteVideo
  const quality = getQualityLevel(webrtcStats?.packetsLost, webrtcStats?.rttMs)

  // ── Attach remote stream to video element ──────────────────────────────
  // CRITICAL for Safari iOS: even with playsInline + muted + autoPlay,
  // WebRTC streams do NOT autoplay on Safari without an explicit user
  // gesture. The video element renders a black frame until the user taps.
  // We call .play() explicitly and set needsUserGesture if it fails,
  // showing a tap-to-play overlay.
  useEffect(() => {
    const video = videoRef.current
    if (!video || !remoteStream) return

    if (video.srcObject !== remoteStream) {
      video.srcObject = remoteStream
    }

    // Reset gesture requirement when a new stream arrives
    setNeedsUserGesture(false)

    // Explicitly request playback — resolves immediately on browsers
    // that allow autoplay with muted+playsInline; rejects on Safari iOS
    // with NotAllowedError if no user gesture is present.
    video.play().catch((err: any) => {
      if (err?.name === 'NotAllowedError') {
        // eslint-disable-next-line no-console
        console.info('[StreamPlayer] Safari autoplay blocked — waiting for user gesture')
        setNeedsUserGesture(true)
      } else {
        // eslint-disable-next-line no-console
        console.warn('[StreamPlayer] video.play() rejected:', err?.message ?? err)
      }
    })

    return () => {
      if (video.srcObject === remoteStream) {
        video.srcObject = null
      }
    }
  }, [remoteStream])

  // ── Duration counter ──────────────────────────────────────────────────
  useEffect(() => {
    startTimeRef.current = Date.now()
    const interval = setInterval(() => {
      setDuration(Math.round((Date.now() - startTimeRef.current) / 1000))
    }, 1000)
    return () => clearInterval(interval)
  }, [session.id])

  // ── User gesture handler (Safari autoplay bypass) ───────────────────────
  // Called when the user taps the "Tap para reproducir" overlay or the
  // video element. Re-triggers video.play() which Safari allows inside
  // a user gesture event handler.
  const handleUserGesture = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    video.play().then(() => {
      setNeedsUserGesture(false)
    }).catch((err: any) => {
      // Still blocked — keep the overlay
      if (err?.name !== 'NotAllowedError') {
        // eslint-disable-next-line no-console
        console.warn('[StreamPlayer] gesture play failed:', err?.message ?? err)
      }
    })
  }, [])

  // ── Fullscreen toggle ──────────────────────────────────────────────────
  const toggleFullscreen = async () => {
    if (!containerRef.current) return
    try {
      if (!document.fullscreenElement) {
        await containerRef.current.requestFullscreen()
        setIsFullscreen(true)
      } else {
        await document.exitFullscreen()
        setIsFullscreen(false)
      }
    } catch {
      // Fullscreen may not be available
    }
  }

  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement)
    }
    document.addEventListener('fullscreenchange', handleFsChange)
    return () => document.removeEventListener('fullscreenchange', handleFsChange)
  }, [])

  // ── Connecting state ───────────────────────────────────────────────────
  // Note: when `connecting` is true but we already have a remoteStream
  // (e.g., WebRTC received the track but Safari blocked playback due
  // to autoplay policy), we intentionally DON'T return <Connecting />.
  // The stream data exists; only the `<video>` playback is stalled on
  // a user gesture. Returning <Connecting /> would hide the video
  // element and prevent the user from tapping to start playback.
  // The `needsUserGesture` state handles this case instead.
  if (connecting && !hasRemoteVideo) return <Connecting />



  // ── Not connected ──────────────────────────────────────────────────────
  // StreamPlayer is the RECEIVER (read: the local machine is consuming
  // someone else's stream). Whitelist the statuses that mean "a remote host
  // is available" so the player shell renders for both the post-handshake
  // (`'connected'`) and the pre-handshake (`'hosting'` — a host broadcasting,
  // hand-off not yet complete) windows. Any other status fails through to
  // the explicit empty state.
  //
  // Defense-in-depth: this widens the gate that previously mis-rendered
  // <NotConnected /> after the WebRTC handshake completed successfully in
  // the mobile-launched flow (launchFromMobile returns status='hosting'
  // because that's how startHosting() builds the session). The primary fix
  // lives in mobile.tsx's syntheticSession override; this gate just prevents
  // the same bug class from re-emerging in any future caller.
  if (!RECEIVABLE_STATUSES.has(session.status)) {
    return <NotConnected />
  }

  const durationStr = formatDuration(duration)

  return (
    <div className={fillContainer ? 'w-full h-full flex flex-col' : 'space-y-3'}>
      {/* Stream container */}
      <div
        ref={containerRef}
        className={`relative overflow-hidden bg-black group ${
          fillContainer
            ? 'w-full h-full flex-1 rounded-none border-0'
            : 'rounded-2xl border border-white/[0.08]'
        }`}
        style={fillContainer ? undefined : { aspectRatio: '16/9' }}
      >
        {/* Real remote video stream */}
        <video
          ref={videoRef}
          autoPlay
          muted={isMuted}
          playsInline
          className={`w-full h-full ${fillContainer ? 'object-cover' : 'object-contain'}`}
        />

        {/* Safari autoplay overlay — rendered ON TOP of the video
            element (not instead of it). The <video> must remain in
            the DOM so videoRef.current is non-null when the user
            taps. onClick calls handleUserGesture() which retries
            video.play() with a fresh user gesture. */}
        {needsUserGesture && (
          <div
            className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm cursor-pointer select-none"
            onClick={handleUserGesture}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleUserGesture() }}
            aria-label="Tap to start video playback"
          >
            <div className="relative w-20 h-20 mb-6">
              <div className="absolute inset-0 rounded-full border-2 border-accent/20 animate-pulse" />
              <div className="absolute inset-2 rounded-full bg-accent/10 flex items-center justify-center">
                <svg viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8 text-accent ml-1">
                  <polygon points="8,5 8,19 19,12" />
                </svg>
              </div>
            </div>
            <p className="text-sm font-semibold text-text-bright mb-1">
              Tap para reproducir
            </p>
            <p className="text-xs text-center max-w-xs text-text-dim">
              Safari necesita un toque para iniciar el video del stream
            </p>
          </div>
        )}

        {/* Placeholder when no remote stream is active yet */}
        {!hasRemoteVideo && webrtcState !== 'connected' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-text-dim">
            <Signal className="w-16 h-16 mb-4 opacity-20" />
            <p className="text-sm font-medium text-text-bright/60">
              {webrtcState === 'connecting' ? 'Establishing WebRTC connection...' : 'Remote Stream'}
            </p>
            <p className="text-xs mt-1 opacity-50">
              {webrtcState === 'connecting' ? 'Negotiating with host' : 'Awaiting video data from host'}
            </p>
          </div>
        )}

        {/* Reconnection overlay — shown on top of the video when the
            peer drops and auto-reconnect kicks in. The last frame
            remains visible beneath the semi-transparent overlay.
            The subtitle shows the INFERRED cause of the disconnect:
            - network_blip → 'Blip de red · Recuperación rápida'
            - connection_dropped → 'Caída de conexión · Reconectando'
            - peer_closed → no overlay (bye = stop, not reconnect)
            - reconnect_failed → 'No se pudo reconectar'
            - null → generic 'Reconectando...' */}
        {showReconnecting && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 backdrop-blur-sm z-10">
            <div className="relative w-16 h-16 mb-4">
              <div className="absolute inset-0 rounded-full border-2 border-yellow-400/30 animate-ping" />
              <div className="absolute inset-1 rounded-full border-2 border-transparent border-t-yellow-400 animate-spin" />
              <div className="absolute inset-3 rounded-full bg-yellow-400/10 flex items-center justify-center">
                <RefreshCw className="w-5 h-5 text-yellow-400" />
              </div>
            </div>
            <p className="text-sm font-bold text-white mb-1">
              {disconnectCause === 'network_blip'
                ? 'Blip de red'
                : disconnectCause === 'connection_dropped'
                  ? 'Caída de conexión'
                  : 'Reconectando...'}
            </p>
            <p className="text-xs text-text-dim">
              {disconnectCause === 'network_blip'
                ? 'Recuperación rápida en curso'
                : disconnectCause === 'connection_dropped'
                  ? 'Restableciendo conexión'
                  : `Intento ${reconnectAttempt ?? 1} de 3`}
            </p>
            {/* Dots indicator — only show when not in network_blip mode
                (which is too fast to need a progress indicator). */}
            {disconnectCause !== 'network_blip' && (
              <div className="mt-3 flex gap-1.5">
                {Array.from({ length: 3 }, (_, i) => (
                  <div
                    key={i}
                    className={`w-2 h-2 rounded-full transition-all ${
                      i < (reconnectAttempt ?? 1)
                        ? 'bg-yellow-400 scale-100'
                        : 'bg-white/10 scale-75'
                    }`}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Gradient overlay */}
        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/60 to-transparent pointer-events-none" />

        {/* Mobile Controls overlay — only when streaming AND we have a
            way to send input frames. Renders touchgamepad + on-screen keys
            for clients on phones / tablets. Hidden on desktop unless the
            user toggles forceVisible inside MobileControls. */}
        {onFrame && hasRemoteVideo && (
          <MobileControls onFrame={onFrame} channelOpen={!!inputChannelOpen} />
        )}

        {/* Top-left: connection status */}
        <div className="absolute top-3 left-3 flex items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-semibold backdrop-blur-sm border ${
            reconnecting
              ? 'bg-black/50 text-yellow-400 border-yellow-500/20'
              : hasRemoteVideo
                ? 'bg-black/50 text-green-400 border-green-500/20'
                : 'bg-black/50 text-yellow-400 border-yellow-500/20'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${
              reconnecting
                ? 'bg-yellow-500 animate-pulse'
                : hasRemoteVideo
                  ? 'bg-green-500 animate-pulse'
                  : 'bg-yellow-500'
            }`} />
            {reconnecting
              ? 'RECONNECTING'
              : hasRemoteVideo
                ? 'STREAMING'
                : webrtcState === 'connecting'
                  ? 'CONNECTING'
                  : webrtcState === 'connected'
                    ? 'CONNECTED'
                    : webrtcState === 'failed'
                      ? 'FAILED'
                      : 'AWAITING HOST'}
          </span>
          <QualityBadge level={quality} />
        </div>

        {/* Top-right: host info */}
        <div className="absolute top-3 right-3 flex items-center gap-1.5">
          <span className="px-2 py-1 rounded-lg text-[10px] font-mono bg-black/40 text-text-dim backdrop-blur-sm">
            {session.name}
          </span>
          <span className="px-2 py-1 rounded-lg text-[10px] font-mono bg-black/40 text-text-dim backdrop-blur-sm">
            {session.host}:{session.port}
          </span>
        </div>

        {/* Bottom-left: stats */}
        <div className="absolute bottom-3 left-3 flex items-center gap-2">
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-mono bg-black/40 text-text-dim backdrop-blur-sm">
            <Clock className="w-3 h-3" />
            {durationStr}
          </span>
          {webrtcStats?.bitrateKbps && (
            <span className="px-2 py-1 rounded-lg text-[10px] font-mono bg-black/40 text-text-dim backdrop-blur-sm">
              {(webrtcStats.bitrateKbps / 1000).toFixed(1)} Mbps
            </span>
          )}
          {webrtcStats?.rttMs != null && (
            <span className="px-2 py-1 rounded-lg text-[10px] font-mono bg-black/40 text-text-dim backdrop-blur-sm">
              {webrtcStats.rttMs}ms
            </span>
          )}
        </div>

        {/* Bottom-right: controls */}
        <div className="absolute bottom-3 right-3 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
          {/* Audio toggle */}
          <button
            onClick={() => setIsMuted(!isMuted)}
            className="p-2 rounded-lg bg-black/50 text-white hover:bg-black/70 backdrop-blur-sm transition-all"
            title={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
          </button>

          {/* Stats toggle */}
          <button
            onClick={() => setShowStats(!showStats)}
            className={`p-2 rounded-lg backdrop-blur-sm transition-all ${
              showStats
                ? 'bg-accent/30 text-accent'
                : 'bg-black/50 text-white hover:bg-black/70'
            }`}
            title="Connection stats"
          >
            <Wifi className="w-3.5 h-3.5" />
          </button>

          {/* Fullscreen */}
          <button
            onClick={toggleFullscreen}
            className="p-2 rounded-lg bg-black/50 text-white hover:bg-black/70 backdrop-blur-sm transition-all"
            title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>

          {/* Disconnect */}
          <button
            onClick={onDisconnect}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-bold text-white bg-red-500/80 hover:bg-red-500 backdrop-blur-sm transition-all"
          >
            <XCircle className="w-3 h-3" />
            Disconnect
          </button>
        </div>
      </div>

      {/* Detailed stats panel */}
      {showStats && (
        <div className="rounded-xl border border-white/[0.06] p-4 bg-white/[0.03]">
          <div className="flex items-center gap-2 mb-3">
            <Wifi className="w-4 h-4 text-accent" />
            <span className="text-sm font-semibold text-text-bright">Connection Statistics</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="Latency (RTT)" value={webrtcStats?.rttMs != null ? `${webrtcStats.rttMs}ms` : '—'} />
            <StatCard label="Bitrate" value={webrtcStats?.bitrateKbps ? `${(webrtcStats.bitrateKbps / 1000).toFixed(1)} Mbps` : '—'} />
            <StatCard label="Resolution" value={webrtcStats?.resolution || '—'} />
            <StatCard label="Frame Rate" value={webrtcStats?.framerate ? `${webrtcStats.framerate} FPS` : '—'} />
            <StatCard label="Packets Lost" value={webrtcStats?.packetsLost !== undefined && webrtcStats?.packetsLost !== null ? String(webrtcStats.packetsLost) : '—'} />
            <StatCard label="Duration" value={durationStr} />
            <StatCard label="Host" value={`${session.host}:${session.port}`} />
            <StatCard label="Quality" value={quality.charAt(0).toUpperCase() + quality.slice(1)} />
          </div>
        </div>
      )}
    </div>
  )
}

// ── Stat Card ──────────────────────────────────────────────────────────────

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center py-2 px-3 rounded-lg bg-white/[0.03] border border-white/[0.06]">
      <p className="text-[10px] text-text-dim mb-0.5">{label}</p>
      <p className="text-sm font-semibold text-text-bright font-mono">{value}</p>
    </div>
  )
}
