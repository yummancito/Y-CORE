// ============================================================================
// src/pages/RemotePlayPage.tsx
// ----------------------------------------------------------------------------
// Remote Play — stream games to other devices or connect to remote hosts.
// Includes host setup (with screen capture preview + WebRTC streaming),
// LAN discovery, stream player (receives real WebRTC remote stream),
// and settings.
// ============================================================================

import { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import {
  Monitor,
  Wifi,
  Search,
  RefreshCw,
  Loader2,
  StopCircle,
  Plug,
  PlugZap,
  Settings2,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Radio,
  MonitorUp,
  Globe,
  Gamepad2,
  Volume2,
  Sliders,
  Activity,
  Camera,
  Signal,
  X,
  Sparkles,
} from 'lucide-react'
import QRCode from 'qrcode'
import { HOST_RENDERER_FROM } from '../../electron/common/ipc-contract'
import { t } from '../lib/i18n'
import { usePageHeader } from '../components/layout/AppShell'
import { useRemotePlayStore } from '../stores/useRemotePlayStore'
import { usePresenceStore } from '../stores/usePresenceStore'
import { useScreenCapture } from '../hooks/useScreenCapture'
import { useWebRTC } from '../hooks/useWebRTC'
import { remotePlayService } from '../services/remote-play.service'
import StreamPreview from './remote-play/StreamPreview'
import StreamPlayer from './remote-play/StreamPlayer'
import ConnectionRequestModal from '../components/remote-play/ConnectionRequestModal'

type TabType = 'host' | 'browse' | 'settings'

const TABS: {
  id: TabType
  labelKey: string
  descKey: string
  icon: React.ComponentType<{ className?: string }>
}[] = [
  { id: 'host', labelKey: 'remotePlay.tabHost', descKey: 'remotePlay.tabHostDesc', icon: MonitorUp },
  { id: 'browse', labelKey: 'remotePlay.tabBrowse', descKey: 'remotePlay.tabBrowseDesc', icon: Wifi },
  { id: 'settings', labelKey: 'remotePlay.tabSettings', descKey: 'remotePlay.tabSettingsDesc', icon: Settings2 },
]

// ── Clipboard helper with fallback ───────────────────────────────────────
// navigator.clipboard.writeText() may fail or be unavailable in some
// Electron sandbox configurations, insecure (HTTP) contexts, or older
// browsers. This fires the `onSuccess` callback only after the text is
// confirmed written, preventing false "✓ Copiado" feedback when the
// clipboard write silently fails.
function copyToClipboard(text: string, onSuccess: () => void): void {
  // Primary path: Clipboard API (async, requires secure context or user
  // activation — click event provides the latter in most browsers).
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(onSuccess).catch(() => {
      // Clipboard API rejected (e.g. permission denied) — fall through
      // to the synchronous execCommand fallback below.
      fallbackCopy(text, onSuccess)
    })
  } else {
    fallbackCopy(text, onSuccess)
  }
}

function fallbackCopy(text: string, onSuccess: () => void): void {
  try {
    // Create a hidden textarea, select its content, exec 'copy'.
    // This works in most browsers including some Electron sandbox configs
    // where the Clipboard API is blocked but execCommand is allowed.
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.left = '-9999px'
    ta.style.top = '-9999px'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    ta.setSelectionRange(0, text.length)
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    if (ok) onSuccess()
  } catch {
    // Both methods failed — silently ignore. The user sees the button
    // stay as "Copiar" instead of the false "✓ Copiado".
  }
}

// ── Host Tab ──────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

function HostTab() {
  const {
    status, currentSession, settings,
    hosting, error, successMessage,
    startHosting, stopHosting, clearMessages,
  } = useRemotePlayStore()

  const {
    state: captureState,
    startCapture,
    stopCapture,
    toggleAudio,
  } = useScreenCapture()

  const [lanModeEnabled] = useState(
    () => localStorage.getItem('y-core:remotePlay:lanMode') === 'true',
  )

  const [sessionName, setSessionName] = useState('Y-Core Stream')
  const [captureStarted, setCaptureStarted] = useState(false)
  const [signalListenerStarted, setSignalListenerStarted] = useState(false)
  const [remoteSignal, setRemoteSignal] = useState<any>(null)
  // QR + URL + raw token for the mobile auto-connect (iPhone / iPad / any
  // browser). Issued right after startHosting succeeds so the local IP and
  // stream port are already known; cleared on stop. The raw `token` field is
  // exposed alongside the QR for users who can't scan (headless, locked-down
  // env) and is independently copyable.
  const [qrInfo, setQrInfo] = useState<{ url: string; dataUrl: string; token: string; expiresAt: number } | null>(null)
  const [copyFeedback, setCopyFeedback] = useState<'url' | 'token' | null>(null)

  // ── WebRTC (host mode) ──────────────────────────────────────────────────
  // Fan out to every reachable peer transport. The previous implementation
  // used `sendSignal(host, port)` which opened a fresh throwaway TCP that
  // was destroyed after write — meaning the host's OFFER in the LAN
  // desktop-to-desktop path was being delivered to its own signalingServer
  // (which closed the LAN client's persistent TCP in the process) and never
  // round-tripped back. `broadcastSignal` writes to the LAN
  // signalingClientSocket, the WS bridge, AND every BrowserWindow in
  // parallel, so the peer actually receives the SDP/ICE we generate.
  const sendSignal = useCallback(async (signal: any) => {
    try {
      await remotePlayService.broadcastSignal(signal)
    } catch {}
  }, [])

  const webrtc = useWebRTC({
    mode: 'host',
    captureStream: captureState.stream,
    onSendSignal: sendSignal,
  })

  // ── Subscribe to remote signaling events ───────────────────────────────
  useEffect(() => {
    const unsub = remotePlayService.onSignal((signal) => {
      // Drop self-echoes — broadcastSignal() tags IPC envelopes with
      // `from: 'host-renderer'` and fans out to every BrowserWindow, so
      // the IPC echo of an outbound offer/ICE/bye would otherwise loop back
      // into the WebRTC hook as if it came from a real peer. Skip these.
      if (!signal || (signal as any).from === HOST_RENDERER_FROM) return
      setRemoteSignal(signal)
      webrtc.handleIncomingSignal(signal)
    })
    return unsub
  }, [webrtc.handleIncomingSignal])

  // ── Start hosting + capture + signaling listener ───────────────────────
  const handleStartHosting = useCallback(async () => {
    // Idempotency guard: the button's `disabled` flips to false again as
    // soon as startHosting resolves (store resets `hosting: false` on
    // success), so a second click can land after the first one already
    // succeeded and trip the service's `if (isHosting) throw` guard. This
    // short-circuit also catches React StrictMode double-invokes in dev.
    if (status === 'hosting' || status === 'connecting') return
    await startHosting(sessionName || 'Y-Core Stream')

    // Build the URL the mobile browser will open.
    //
    // CRITICAL: NEVER use window.location.origin here. In Electron dev
    // (`npm run electron:dev`) Electron loads the renderer from its OWN
    // loopback (`http://localhost:5173`), so window.location.origin ALWAYS
    // returns `http://localhost:5173` regardless of which LAN IP Vite is
    // bound to. Encoding that into the QR would direct the iPhone Safari
    // at its own loopback, not at the host PC.
    //
    // Always derive the QR base URL from the LAN IP that `startHosting()`
    // just bound to — `getLocalIPs()[0]` on the electron side, which is
    // `192.168.0.16` (or whichever routable interface the PC advertises).
    // Vite listens on 0.0.0.0:5173 (see vite.config `host: true`) so
    // `http://<lan-ip>:5173` is reachable from any device on the same Wi-Fi.
    //
    // The :5173 port is hardcoded for DEV ONLY. In a packaged
    // electron-builder build Vite is not running — see TODO(prod-mobile-bundle).
    //
    // Loopback guard mirrored from the electron-side `getMobileConnectToken`
    // check: a machine with only a 127.0.0.1 NIC (VM, misconfigured network)
    // can't host mobile clients; we suppress the QR rather than encode an
    // unreachable URL.
    //
    // Read currentSession imperatively via Zustand's getState() — the React
    // closure here was built at useCallback creation time, so closing over
    // `currentSession` directly would read the PREVIOUS session (or undefined
    // on first start) instead of the one we just started.
    const lanHost = useRemotePlayStore.getState().currentSession?.host
    const baseUrl =
      lanHost && lanHost !== '127.0.0.1'
        ? `http://${lanHost}:5173`
        : null

    if (!baseUrl) {
      // No routable LAN interface (probably a VM or a NIC glitch). Be loud
      // about it so the operator knows what to fix instead of staring at a
      // missing QR widget. Streaming still works for in-app / LAN clients.
      console.warn(
        '[RemotePlay] No LAN interface detected; skipping mobile QR. ' +
        'Verify this PC has a routable Wi-Fi/Ethernet adapter.',
      )
    } else {
      // Issue a mobile-connect token + render the QR so the user can hand
      // off to a phone within seconds of pressing Start.
      try {
        const tk = await remotePlayService.getMobileConnectToken(baseUrl)
        const dataUrl = await QRCode.toDataURL(tk.url, {
          width: 256,
          margin: 2,
          color: { dark: '#000000', light: '#ffffff' },
          errorCorrectionLevel: 'M',
        })
        setQrInfo({ url: tk.url, dataUrl, token: tk.token, expiresAt: tk.expiresAt })
      } catch (err: any) {
        console.warn('[RemotePlay] Failed to issue mobile QR token:', err?.message)
      }
    }

    await startCapture({ preferAudio: settings.enableAudio })
    setCaptureStarted(true)

    // Start TCP signaling server so clients can connect
    try {
      await remotePlayService.startSignalingListener()
      setSignalListenerStarted(true)
    } catch (err: any) {
      console.warn('[RemotePlay] Failed to start signaling listener:', err.message)
    }
  }, [sessionName, status, startHosting, startCapture, settings.enableAudio])

  // ── Stop everything ────────────────────────────────────────────────────
  const handleStopHosting = useCallback(async () => {
    webrtc.stopConnection()
    if (captureState.active) stopCapture()
    if (signalListenerStarted) {
      try { await remotePlayService.stopSignalingListener() } catch {}
      setSignalListenerStarted(false)
    }
    setCaptureStarted(false)
    setQrInfo(null) // revoke the QR auto-connect token visually
    connectionStartedRef.current = false // allow reconnection on next start
    await stopHosting()
  }, [captureState.active, stopCapture, signalListenerStarted, stopHosting, webrtc])

  // Sync: if status changes externally, stop capture
  useEffect(() => {
    if (status !== 'hosting' && captureStarted && captureState.active) {
      stopCapture()
      setCaptureStarted(false)
    }
  }, [status, captureStarted, captureState.active, stopCapture])

  // Cleanup on unmount — also resets connectionStartedRef so HMR / navigation
  // doesn't leave a stale guard that blocks the next hosting session.
  useEffect(() => {
    return () => {
      connectionStartedRef.current = false
      if (captureState.active) stopCapture()
      if (signalListenerStarted) {
        remotePlayService.stopSignalingListener().catch(() => {})
      }
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── WebRTC connection: when a remote signal arrives, start connection ──
  // Guard: only proceed when captureState.stream is available. If the mobile
  // client sends a 'request' before the desktopCapturer fallback completes,
  // the effect waits — it re-runs as soon as captureState.stream becomes
  // truthy on the next render. Without this guard, startConnection would
  // create an RTCPeerConnection with no video tracks (captureStream=null),
  // producing an SDP offer with no media sections, and the mobile client
  // would immediately send 'bye' → "Remote peer disconnected".
  //
  // CRITICAL: After startConnection() creates the PC, we MUST reprocess the
  // pending 'request' signal. The host's handleIncomingSignal('request')
  // was called earlier (in the onSignal subscription) but returned early
  // because pcRef.current was null. After startConnection() the PC exists
  // and the signaling state is 'stable', so calling handleIncomingSignal
  // again with the same 'request' will create the offer and broadcast it.
  // Without this second call, the mobile waits forever for an offer that
  // never comes → stuck on "Conectando...".
  //
  // STRICT MODE REF GUARD: React.StrictMode in dev (npm run electron:dev)
  // runs each effect twice. Without this ref, startConnection() fires
  // twice, creating TWO PCs and TWO offers. The mobile receives both
  // offers; the second one overwrites the SDP negotiation from the first
  // (- ICE candidates from the first offer's generation are discarded).
  // The ref prevents the second invocation so the flow stays single-shot.
  // In production (packaged build) StrictMode is not active, and the ref
  // still correctly guards against any stray duplicate signal processing.
  // Ref-based guard against React.StrictMode double-invoke in dev mode.
  // Reset on stopHosting so reconnection works. The cleanup effect below
  // also resets on unmount to prevent stale state on HMR / navigation.
  const connectionStartedRef = useRef(false)

  useEffect(() => {
    if (
      remoteSignal?.type === 'request' &&
      webrtc.connectionState === 'new' &&
      captureState.stream &&
      !connectionStartedRef.current
    ) {
      connectionStartedRef.current = true
      // eslint-disable-next-line no-console
      console.log('[trace] remoteSignal=request received, starting PC...')
      const signal = remoteSignal // capture the signal before the async gap
      webrtc.startConnection().then(() => {
        // PC is now ready — reprocess the pending request to create the offer
        if (signal?.type === 'request') {
          // eslint-disable-next-line no-console
          console.log('[trace] PC ready, reprocessing pending REQUEST signal')
          webrtc.handleIncomingSignal(signal)
        }
      }).catch((err: unknown) => {
        // eslint-disable-next-line no-console
        console.warn('[trace] startConnection reprocess error:', err)
      })
    }
  }, [remoteSignal, webrtc, captureState.stream])

  // ── Input bridge — forward inbound input frames from the connected client
  //    to the main process so they can be dispatched via win32 SendInput.
  //    Only meaningful on the host. The handler is registered when the data
  //    channel is open; it's cleared on unmount or when the channel closes. ─
  useEffect(() => {
    webrtc.setOnInput((frame) => {
      // Guard against the renderer receiving in host mode — input bridge
      // is only relevant if the host is actively displaying video.
      if (status !== 'hosting') return
      const bridge = (window as any).steamtools?.inputBridge
      if (!bridge?.dispatch) return
      bridge.dispatch(frame)
    })
    return () => webrtc.setOnInput(null)
  }, [webrtc, status])

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-text-bright">{t('remotePlay.hostTitle')}</h2>
        <p className="text-xs text-text-dim mt-0.5">
          {t('remotePlay.hostDesc')}
        </p>
      </div>

      {/* Messages */}
      {(error || successMessage) && (
        <div className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium ${
          error ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-green-500/10 text-green-400 border border-green-500/20'
        }`}>
          {error ? <AlertTriangle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
          <span className="flex-1">{error || successMessage}</span>
          <button onClick={clearMessages} className="opacity-60 hover:opacity-100">×</button>
        </div>
      )}

      {/* Capture error */}
      {captureState.error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">
          <AlertTriangle className="w-4 h-4" />
          <span className="flex-1">{captureState.error}</span>
          <button
            onClick={() => startCapture({ preferAudio: settings.enableAudio })}
            className="text-xs font-semibold underline hover:no-underline"
          >
            Retry
          </button>
        </div>
      )}

      {/* WebRTC error */}
      {webrtc.error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium bg-red-500/10 text-red-400 border border-red-500/20">
          <AlertTriangle className="w-4 h-4" />
          <span className="flex-1">{t('remotePlay.webrtcErrorPrefix')}: {webrtc.error}</span>
        </div>
      )}

      {/* Stream Preview — visible when hosting with capture active */}
      {status === 'hosting' && currentSession && captureState.active ? (
        <div className="space-y-3">
          <StreamPreview
            captureState={captureState}
            sessionName={currentSession.name}
            sessionPort={currentSession.port}
            onStopCapture={handleStopHosting}
            onToggleAudio={toggleAudio}
            onReset={() => startCapture({ preferAudio: settings.enableAudio })}
          />

          {/* Mobile-connect QR + copyable token. The data URL is the actual
              QR PNG encoded as base64 by the qrcode npm package; both the
              full URL and the raw token are exposed in monospace rows with
              individual Copy buttons + brief feedback for users who can't
              scan (headless, locked-down env, or want to share the token
              manually). */}
          {qrInfo && (
            <div className="rounded-2xl p-4 border border-accent/20 bg-accent/[0.04] flex flex-col sm:flex-row items-center gap-4">
              <img
                src={qrInfo.dataUrl}
                alt="QR for mobile clients"
                className="w-40 h-40 rounded-xl bg-white p-2 ring-1 ring-black/10 flex-shrink-0"
              />
              <div className="flex-1 space-y-2 min-w-0 w-full">
                <p className="text-sm font-bold text-text-bright">
                  Escaneá con tu celular
                </p>
                <p className="text-xs text-text-dim leading-snug">
                  Abrí la cámara o cualquier app de QR y escaneá para abrir
                  Y-Core Remote en tu móvil. El link abre Safari y se conecta solo.
                </p>

                {/* ── URL row ── */}
                <div className="flex items-center gap-2 mt-2">
                  <code className="flex-1 px-3 py-2 rounded-lg text-[10px] font-mono bg-black/30 text-text-secondary truncate border border-white/[0.06]">
                    {qrInfo.url}
                  </code>
                  <button
                    type="button"
                    onClick={() => {
                      copyToClipboard(qrInfo.url, () => {
                        setCopyFeedback('url')
                        setTimeout(() => setCopyFeedback(null), 1500)
                      })
                    }}
                    className={`px-3 py-2 rounded-lg text-[11px] font-bold text-white transition-all flex-shrink-0 ${
                      copyFeedback === 'url'
                        ? 'bg-green-500 scale-105'
                        : 'bg-accent hover:brightness-110'
                    }`}
                  >
                    {copyFeedback === 'url' ? '✓ Copiado' : 'Copiar'}
                  </button>
                </div>

                {/* ── Token row ── */}
                <div className="flex items-center gap-2">
                  <code className="flex-1 px-3 py-2 rounded-lg text-[10px] font-mono bg-black/30 text-text-secondary truncate border border-white/[0.06]">
                    {qrInfo.token}
                  </code>
                  <button
                    type="button"
                    onClick={() => {
                      copyToClipboard(qrInfo.token, () => {
                        setCopyFeedback('token')
                        setTimeout(() => setCopyFeedback(null), 1500)
                      })
                    }}
                    className={`px-3 py-2 rounded-lg text-[11px] font-bold text-white transition-all flex-shrink-0 ${
                      copyFeedback === 'token'
                        ? 'bg-green-500 scale-105'
                        : 'bg-accent hover:brightness-110'
                    }`}
                  >
                    {copyFeedback === 'token' ? '✓ Copiado' : 'Copiar token'}
                  </button>
                </div>

                <p className="text-[10px] text-text-dim">
                  Token expira en 10 min · uso único
                </p>
              </div>
            </div>
          )}

          {/* Session info bar */}
          <div className="rounded-xl p-4 border border-green-500/20 bg-green-500/[0.04]">
            <div className="flex items-center gap-3">
              <Radio className="w-5 h-5 text-green-400 animate-pulse" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-text-bright truncate">{currentSession.name}</p>
                <p className="text-[11px] text-text-dim mt-0.5">
                  {currentSession.host}:{currentSession.port} · {currentSession.quality}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {lanModeEnabled && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
                    <Wifi className="w-2.5 h-2.5" />
                    LAN Only
                  </span>
                )}
                {webrtc.reconnecting && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 animate-pulse">
                    <Loader2 className="w-2.5 h-2.5 animate-spin" />
                    {webrtc.lastDisconnectCause === 'network_blip'
                      ? 'Blip de red'
                      : webrtc.lastDisconnectCause === 'connection_dropped'
                        ? 'Caída de red'
                        : `Reconectando (${webrtc.reconnectAttempt}/${3})`}
                  </span>
                )}
                {webrtc.streaming && !webrtc.reconnecting && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-accent/10 text-accent border border-accent/20">
                    <Signal className="w-2.5 h-2.5" />
                    {t('remotePlay.streaming')}
                  </span>
                )}
                {captureState.sourceType && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-white/[0.06] text-text-secondary border border-white/[0.08]">
                    <Camera className="w-2.5 h-2.5" />
                    {captureState.sourceType.charAt(0).toUpperCase() + captureState.sourceType.slice(1)}
                  </span>
                )}
                <button
                  onClick={handleStopHosting}
                  disabled={hosting}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-red-500 hover:bg-red-600 transition-all disabled:opacity-50"
                >
                  {hosting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <StopCircle className="w-3.5 h-3.5" />}
                  {t('remotePlay.stop')}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-white/[0.1] p-6" style={{ background: 'var(--bg-card)' }}>
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center flex-shrink-0">
              <MonitorUp className="w-6 h-6" style={{ color: 'var(--accent)' }} />
            </div>
            <div className="flex-1 space-y-4">
              <div>
                <p className="text-sm font-bold text-text-bright">{t('remotePlay.notStreaming')}</p>
                <p className="text-xs text-text-dim mt-0.5">
                  {t('remotePlay.notStreamingDesc')}
                </p>
              </div>

              <div className="flex items-end gap-3">
                <div className="flex-1">
                  <label className="text-[10px] font-semibold text-text-dim mb-1 block">{t('remotePlay.sessionName')}</label>
                  <input
                    type="text"
                    value={sessionName}
                    onChange={(e) => setSessionName(e.target.value)}
                    placeholder={t('remotePlay.sessionNamePlaceholder')}
                    className="w-full px-3 py-2 rounded-lg text-sm bg-white/[0.06] border border-white/[0.08] text-text-bright placeholder:text-text-dim focus:outline-none focus:border-accent/50"
                  />
                </div>
                <button
                  onClick={handleStartHosting}
                  disabled={hosting || status === 'hosting' || !sessionName.trim()}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white transition-all hover:brightness-110 disabled:opacity-50"
                  style={{ background: 'var(--accent)' }}
                >
                  {hosting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Radio className="w-4 h-4" />
                  )}
                  {t('remotePlay.startHosting')}
                </button>
              </div>

              <div className="text-xs text-text-dim space-y-1 px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.06]">
                <p className="font-semibold text-text-secondary">{t('remotePlay.streamSettingsLabel')}</p>
                <p>{settings.resolution} · {settings.fps} FPS · {settings.maxBitrate} Kbps max</p>
                <p>{settings.enableAudio ? t('remotePlay.audioEnabled') : t('remotePlay.audioDisabled')} · {settings.autoAccept ? t('remotePlay.autoAccept') : t('remotePlay.manualAccept')}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// Browse Tab
// ═══════════════════════════════════════════════════════════════════════════

function BrowseTab() {
  const {
    discoveredHosts, status, currentSession,
    discovering, connecting, error,
    discoverHosts, connectToHost, disconnect, clearMessages,
  } = useRemotePlayStore()

  const [webRtcStarted, setWebRtcStarted] = useState(false)
  const [lanModeEnabled] = useState(
    () => localStorage.getItem('y-core:remotePlay:lanMode') === 'true',
  )

  // ── WebRTC (client mode) ────────────────────────────────────────────────
  const sendSignal = useCallback(async (signal: any) => {
    if (currentSession) {
      try {
        await remotePlayService.sendSignal(
          currentSession.host,
          currentSession.port,
          signal,
        )
      } catch {}
    }
  }, [currentSession])

  const webrtc = useWebRTC({
    mode: 'client',
    onSendSignal: sendSignal,
  })

  // ── Subscribe to remote signaling events ───────────────────────────────
  useEffect(() => {
    const unsub = remotePlayService.onSignal((signal) => {
      webrtc.handleIncomingSignal(signal)
    })
    return unsub
  }, [webrtc.handleIncomingSignal])

  // ── Connect to a discovered host ────────────────────────────────────────
  const handleConnect = useCallback(async (host: string, port: number) => {
    await connectToHost(host, port)
    setWebRtcStarted(true)
    webrtc.startConnection()
  }, [connectToHost, webrtc])

  // ── Disconnect from host ────────────────────────────────────────────────
  const handleDisconnect = useCallback(async () => {
    webrtc.stopConnection()
    setWebRtcStarted(false)
    await disconnect()
  }, [disconnect, webrtc])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-text-bright">{t('remotePlay.browseTitle')}</h2>
          <p className="text-xs text-text-dim mt-0.5">
            {t('remotePlay.browseDesc')}
          </p>
        </div>
        <button
          onClick={discoverHosts}
          disabled={discovering}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white transition-all hover:brightness-110 disabled:opacity-60"
          style={{ background: 'var(--accent)' }}
        >
          <Search className={`w-4 h-4 ${discovering ? 'animate-pulse' : ''}`} />
          {discovering ? t('remotePlay.scanning') : t('remotePlay.scanNetwork')}
        </button>
      </div>

      {/* Messages */}
      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium bg-red-500/10 text-red-400 border border-red-500/20">
          <AlertTriangle className="w-4 h-4" />
          <span className="flex-1">{error}</span>
          <button onClick={clearMessages} className="opacity-60 hover:opacity-100">×</button>
        </div>
      )}

      {/* Stream Player — visible when connected with WebRTC stream.
          Mobile controls overlay is auto-rendered by StreamPlayer when
          `webrtc.inputChannelOpen === true` so the client can send input
          frames back to the host for real game control. */}
      {status === 'connected' && currentSession && (
        <StreamPlayer
          session={currentSession}
          onDisconnect={handleDisconnect}
          connecting={webRtcStarted && webrtc.connectionState === 'new'}
          remoteStream={webrtc.remoteStream}
          webrtcStats={webrtc.stats}
          webrtcState={webrtc.connectionState}
          onFrame={webrtc.sendInput}
          inputChannelOpen={webrtc.inputChannelOpen}
          reconnecting={webrtc.reconnecting}
          reconnectAttempt={webrtc.reconnectAttempt}
          disconnectCause={webrtc.lastDisconnectCause}
        />
      )}

      {/* Connected status bar */}
      {status === 'connected' && currentSession && (
        <div className="rounded-xl p-3 border border-accent/20 bg-accent/[0.04]">
          <div className="flex items-center gap-2">
            <PlugZap className="w-4 h-4" style={{ color: 'var(--accent)' }} />
            <span className="text-xs font-medium text-text-bright">
              {t('remotePlay.connectedTo')} <strong>{currentSession.name}</strong>
            </span>
            <span className="text-[10px] font-mono text-text-dim">
              {currentSession.host}:{currentSession.port}
            </span>
            {lanModeEnabled && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
                <Wifi className="w-2.5 h-2.5" />
                LAN Only
              </span>
            )}
            {webrtc.reconnecting && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 animate-pulse">
                <Loader2 className="w-2.5 h-2.5 animate-spin" />
                {webrtc.lastDisconnectCause === 'network_blip'
                  ? 'Blip de red'
                  : webrtc.lastDisconnectCause === 'connection_dropped'
                    ? 'Caída de red'
                    : `Reconectando (${webrtc.reconnectAttempt}/${3})`}
              </span>
            )}
            {webrtc.streaming && !webrtc.reconnecting && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-green-500/10 text-green-400 border border-green-500/20">
                <Signal className="w-2.5 h-2.5" />
                {t('remotePlay.streaming')}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Host list (hidden when connected) */}
      {status !== 'connected' && (
        <>
          {discovering ? (
            <div className="flex flex-col items-center py-12 text-text-dim">
              <Loader2 className="w-8 h-8 animate-spin mb-3 opacity-50" />
              <p className="text-sm">{t('remotePlay.scanningNetwork')}</p>
            </div>
          ) : discoveredHosts.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-text-dim rounded-2xl border border-dashed border-white/[0.1]">
              <Wifi className="w-10 h-10 mb-3 opacity-30" />
              <p className="text-sm font-medium">{t('remotePlay.noHostsFound')}</p>
              <p className="text-xs mt-1">{t('remotePlay.noHostsDesc')}</p>
              <button
                onClick={discoverHosts}
                className="flex items-center gap-1.5 px-4 py-2 mt-4 rounded-lg text-xs font-semibold text-accent hover:bg-accent/10 transition-all"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                {t('remotePlay.scanAgain')}
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {discoveredHosts.map((host) => (
                <div
                  key={host.id}
                  className="rounded-xl p-4 border border-white/[0.06] transition-all hover:border-white/[0.12]"
                  style={{ background: 'var(--bg-card)' }}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center flex-shrink-0">
                      <Monitor className="w-5 h-5" style={{ color: 'var(--accent)' }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-text-bright truncate">{host.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] font-mono text-text-dim">{host.host}</span>
                        <span className="text-[10px] text-text-dim">·</span>
                        <span className="text-[10px] text-text-dim">{host.quality}</span>
                      </div>
                    </div>
                    <button
                      onClick={() => handleConnect(host.host, host.port)}
                      disabled={connecting}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white transition-all hover:brightness-110 disabled:opacity-50"
                      style={{ background: 'var(--accent)' }}
                    >
                      {connecting ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Plug className="w-3.5 h-3.5" />
                      )}
                      {t('remotePlay.connect')}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// Settings Tab
// ═══════════════════════════════════════════════════════════════════════════

function SettingsTab() {
  const { settings, updateSettings, successMessage, error, clearMessages } = useRemotePlayStore()
  const [lanModeEnabled, setLanModeEnabled] = useState(
    () => localStorage.getItem('y-core:remotePlay:lanMode') === 'true',
  )
  const [lanModeLoading, setLanModeLoading] = useState(false)

  const handleLanModeToggle = useCallback(async (enabled: boolean) => {
    try {
      setLanModeLoading(true)
      await (window as any).ipcRenderer?.invoke('remote:enable-lan-mode', enabled)
      setLanModeEnabled(enabled)
      localStorage.setItem('y-core:remotePlay:lanMode', enabled ? 'true' : 'false')
    } catch (err) {
      console.error('[RemotePlay] Failed to toggle LAN mode:', err)
    } finally {
      setLanModeLoading(false)
    }
  }, [])

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-text-bright">{t('remotePlay.settingsTitle')}</h2>
        <p className="text-xs text-text-dim mt-0.5">
          {t('remotePlay.settingsDesc')}
        </p>
      </div>

      {/* Messages */}
      {(error || successMessage) && (
        <div className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium ${
          error ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-green-500/10 text-green-400 border border-green-500/20'
        }`}>
          {error ? <AlertTriangle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
          <span className="flex-1">{error || successMessage}</span>
          <button onClick={clearMessages} className="opacity-60 hover:opacity-100">×</button>
        </div>
      )}

      {/* LAN Mode Banner */}
      {lanModeEnabled && (
        <div className="rounded-xl p-4 border border-blue-500/30 bg-blue-500/[0.08] flex items-center gap-3">
          <Radio className="w-5 h-5 text-blue-400 animate-pulse" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-blue-400">Local streaming only</p>
            <p className="text-xs text-blue-300 mt-0.5">Cloud sync and internet connectivity are disabled</p>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-white/[0.06]" style={{ background: 'var(--bg-card)' }}>
        <div className="px-5 py-4 space-y-5">
          {/* Resolution */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Monitor className="w-4 h-4 text-accent" />
              <span className="text-sm font-semibold text-text-bright">{t('remotePlay.resolution')}</span>
            </div>
            <select
              value={settings.resolution}
              onChange={(e) => updateSettings({ resolution: e.target.value })}
              className="w-full px-3 py-2 rounded-lg text-sm bg-white/[0.06] border border-white/[0.08] text-text-bright focus:outline-none focus:border-accent/50"
            >
              <option value="3840x2160" className="bg-bg-primary">4K (3840×2160)</option>
              <option value="2560x1440" className="bg-bg-primary">1440p (2560×1440)</option>
              <option value="1920x1080" className="bg-bg-primary">1080p (1920×1080)</option>
              <option value="1280x720" className="bg-bg-primary">720p (1280×720)</option>
            </select>
          </div>

          {/* FPS */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-accent" />
              <span className="text-sm font-semibold text-text-bright">{t('remotePlay.frameRate')}</span>
            </div>
            <select
              value={settings.fps}
              onChange={(e) => updateSettings({ fps: parseInt(e.target.value) })}
              className="w-full px-3 py-2 rounded-lg text-sm bg-white/[0.06] border border-white/[0.08] text-text-bright focus:outline-none focus:border-accent/50"
            >
              <option value={30} className="bg-bg-primary">30 FPS</option>
              <option value={60} className="bg-bg-primary">60 FPS</option>
              <option value={120} className="bg-bg-primary">120 FPS</option>
            </select>
          </div>

          {/* Max Bitrate */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-accent" />
              <span className="text-sm font-semibold text-text-bright">{t('remotePlay.maxBitrate')}</span>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={5000}
                max={100000}
                step={1000}
                value={settings.maxBitrate}
                onChange={(e) => updateSettings({ maxBitrate: parseInt(e.target.value) })}
                className="flex-1"
              />
              <span className="text-xs font-mono font-semibold text-accent min-w-[80px] text-right">
                {(settings.maxBitrate / 1000).toFixed(0)} Mbps
              </span>
            </div>
          </div>

          {/* Toggles */}
          <div className="space-y-3 pt-2 border-t border-white/[0.06]">
            <ToggleSetting
              icon={<Volume2 className="w-4 h-4" />}
              label={t('remotePlay.streamAudio')}
              description={t('remotePlay.streamAudioDesc')}
              checked={settings.enableAudio}
              onChange={(v) => updateSettings({ enableAudio: v })}
            />
            <ToggleSetting
              icon={<Gamepad2 className="w-4 h-4" />}
              label={t('remotePlay.gamepadSupport')}
              description={t('remotePlay.gamepadSupportDesc')}
              checked={settings.enableGamepad}
              onChange={(v) => updateSettings({ enableGamepad: v })}
            />
            <ToggleSetting
              icon={<Globe className="w-4 h-4" />}
              label={t('remotePlay.autoAcceptConnections')}
              description={t('remotePlay.autoAcceptConnectionsDesc')}
              checked={settings.autoAccept}
              onChange={(v) => updateSettings({ autoAccept: v })}
              disabled={lanModeEnabled}
            />
            <ToggleSetting
              icon={<Wifi className="w-4 h-4" />}
              label="LAN Only Mode"
              description="Disable cloud sync and internet connectivity for local-only streaming"
              checked={lanModeEnabled}
              onChange={handleLanModeToggle}
              loading={lanModeLoading}
            />
          </div>

          {/* Ports */}
          <div className="pt-2 border-t border-white/[0.06] grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-semibold text-text-dim mb-1 block">{t('remotePlay.discoveryPort')}</label>
              <input
                type="number"
                value={settings.discoveryPort}
                onChange={(e) => updateSettings({ discoveryPort: parseInt(e.target.value) || 42860 })}
                className="w-full px-3 py-2 rounded-lg text-sm font-mono bg-white/[0.06] border border-white/[0.08] text-text-bright focus:outline-none focus:border-accent/50"
              />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-text-dim mb-1 block">{t('remotePlay.streamPort')}</label>
              <input
                type="number"
                value={settings.streamPort}
                onChange={(e) => updateSettings({ streamPort: parseInt(e.target.value) || 42861 })}
                className="w-full px-3 py-2 rounded-lg text-sm font-mono bg-white/[0.06] border border-white/[0.08] text-text-bright focus:outline-none focus:border-accent/50"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function ToggleSetting({
  icon, label, description, checked, onChange, disabled = false, loading = false,
}: {
  icon: React.ReactNode
  label: string
  description: string
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
  loading?: boolean
}) {
  return (
    <label className={`flex items-start gap-3 group ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
      <div className="flex-shrink-0 mt-0.5" style={{ color: checked ? 'var(--accent)' : 'var(--text-dim)' }}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium ${disabled ? 'text-text-dim' : 'text-text-bright group-hover:text-accent transition-colors'}`}>{label}</p>
        <p className="text-xs text-text-dim mt-0.5">{description}</p>
      </div>
      <div
        className={`relative w-10 h-6 rounded-full transition-colors flex-shrink-0 ${
          checked ? 'bg-accent' : 'bg-white/[0.1]'
        } ${disabled ? 'opacity-50' : ''}`}
      >
        <div
          className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-[18px]' : 'translate-x-0.5'
          } ${loading ? 'opacity-50' : ''}`}
        />
        {loading && (
          <Loader2 className="absolute inset-2 w-2 h-2 animate-spin" />
        )}
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => !disabled && !loading && onChange(e.target.checked)}
          disabled={disabled || loading}
          className="absolute inset-0 opacity-0 cursor-pointer disabled:cursor-not-allowed"
        />
      </div>
    </label>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// Main Page
// ═══════════════════════════════════════════════════════════════════════════

export default function RemotePlayPage() {
  const { status, loadSettings } = useRemotePlayStore()
  const {
    registered, pendingRequests, wsConnected,
    respondToRequest,
    subscribeToConnectionRequests,
  } = usePresenceStore()
  const [activeTab, setActiveTab] = useState<TabType>('host')
  const [loaded, setLoaded] = useState(false)
  const [processingRequest, setProcessingRequest] = useState(false)
  // Onboarding intro banner — shown until the user dismisses it (persisted in
  // localStorage so it doesn't reappear on every navigation). Key is namespaced
  // with the `y-core:` prefix to avoid collisions with other intro/tour state.
  const [showIntro, setShowIntro] = useState<boolean>(
    () => localStorage.getItem('y-core:remotePlay:hideIntro') !== 'true',
  )

  // Subscribe to connection requests from remote devices
  useEffect(() => {
    const unsub = subscribeToConnectionRequests()
    return unsub
  }, [subscribeToConnectionRequests])

  useEffect(() => {
    if (!loaded) {
      loadSettings()
      setLoaded(true)
    }
  }, [loadSettings, loaded])

  // Handle accept connection request
  const handleAcceptRequest = async (requestId: string, rememberDevice: boolean) => {
    setProcessingRequest(true)
    await respondToRequest(requestId, true, rememberDevice)
    setProcessingRequest(false)
  }

  // Handle reject connection request
  const handleRejectRequest = async (requestId: string) => {
    setProcessingRequest(true)
    await respondToRequest(requestId, false)
    setProcessingRequest(false)
  }

  // Dismiss the onboarding intro and remember the choice in localStorage.
  const dismissIntro = () => {
    setShowIntro(false)
    localStorage.setItem('y-core:remotePlay:hideIntro', 'true')
  }

  // Active connection request (latest pending)
  const activeRequest = pendingRequests.length > 0 ? pendingRequests[pendingRequests.length - 1] : null

  usePageHeader(
    <div className="flex items-center gap-4 h-11">
      <div className="flex items-center gap-2.5">
        <Monitor className="w-5 h-5" style={{ color: 'var(--accent)' }} />
        <h1 className="text-xl font-bold text-text-bright leading-none">{t('remotePlay.title')}</h1>
        {/* "Beta" badge */}
        <span
          className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-orange-500/20 text-orange-400 border border-orange-500/40"
          title="Remote Play is in Beta. LAN mode only for now."
        >
          <Radio className="w-2.5 h-2.5" />
          BETA
        </span>
      </div>
      <p className="text-[11px] text-text-dim hidden sm:block">{t('remotePlay.subtitle')}</p>
      {registered && (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-accent/10 text-accent border border-accent/20">
          <Globe className="w-2.5 h-2.5" />
          {t('remotePlay.statusOnline')}
        </span>
      )}
      {wsConnected && (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-green-500/10 text-green-400 border border-green-500/20">
          <Radio className="w-2.5 h-2.5 animate-pulse" />
          {t('remotePlay.statusSignaling')}
        </span>
      )}
      {status === 'hosting' && (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-green-500/10 text-green-400 border border-green-500/20">
          <Radio className="w-2.5 h-2.5 animate-pulse" />
          {t('remotePlay.statusHosting')}
        </span>
      )}
      {status === 'connected' && (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-accent/10 text-accent border border-accent/20">
          <PlugZap className="w-2.5 h-2.5" />
          {t('remotePlay.statusConnected')}
        </span>
      )}
    </div>,
    [status, registered, wsConnected],
  )

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      {/* Connection request modal */}
      {activeRequest && (
        <ConnectionRequestModal
          request={activeRequest}
          onAccept={handleAcceptRequest}
          onReject={handleRejectRequest}
          processing={processingRequest}
        />
      )}

      {/* Onboarding intro banner — first-visit only, persisted in localStorage. */}
      {showIntro && (
        <div
          className="relative overflow-hidden rounded-2xl border border-accent/30 bg-accent/[0.03] p-6 animate-fade-in shadow-[0_0_30px_var(--accent-soft)]"
          role="region"
          aria-label="Welcome to Remote Play"
        >
          <button
            onClick={dismissIntro}
            className="absolute top-4 right-4 text-text-dim hover:text-text-bright transition-colors p-1 rounded-md hover:bg-white/[0.06]"
            aria-label="Dismiss welcome"
            title="Dismiss"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="relative z-10 max-w-3xl">
            {/* Subtitle replaces a duplicate "New" pill — the pageHeader already
                has a "New" badge so a second one here would be redundant. */}
            <p className="text-[11px] font-bold uppercase tracking-wider text-accent mb-1.5">
              {t('remotePlay.introSubtitle')}
            </p>
            <h2 className="text-xl font-bold text-text-bright mb-1">{t('remotePlay.introTitle')}</h2>
            <p className="text-sm text-text-dim mb-6 leading-relaxed">
              {t('remotePlay.introDesc')}
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white/[0.04] rounded-xl p-4 border border-white/[0.06]">
                <MonitorUp className="w-6 h-6 text-accent mb-2 opacity-90" />
                <h3 className="font-bold text-text-bright text-sm mb-1">1. {t('remotePlay.introStep1Title')}</h3>
                <p className="text-xs text-text-dim leading-snug">{t('remotePlay.introStep1Desc')}</p>
              </div>
              <div className="bg-white/[0.04] rounded-xl p-4 border border-white/[0.06]">
                <Wifi className="w-6 h-6 text-accent mb-2 opacity-90" />
                <h3 className="font-bold text-text-bright text-sm mb-1">2. {t('remotePlay.introStep2Title')}</h3>
                <p className="text-xs text-text-dim leading-snug">{t('remotePlay.introStep2Desc')}</p>
              </div>
              <div className="bg-white/[0.04] rounded-xl p-4 border border-white/[0.06]">
                <PlugZap className="w-6 h-6 text-accent mb-2 opacity-90" />
                <h3 className="font-bold text-text-bright text-sm mb-1">3. {t('remotePlay.introStep3Title')}</h3>
                <p className="text-xs text-text-dim leading-snug">{t('remotePlay.introStep3Desc')}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Beta LAN-only banner */}
      <div className="rounded-xl border border-orange-500/30 bg-orange-500/[0.08] p-4 flex items-start gap-3">
        <Radio className="w-5 h-5 text-orange-400 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <h3 className="font-semibold text-orange-400 text-sm">Remote Play is in Beta</h3>
          <p className="text-xs text-orange-300/80 mt-1">
            Currently supports <strong>LAN mode only</strong>. Connect your phone to the same WiFi network and use LAN discovery to play games.
          </p>
        </div>
      </div>

      {/* Tab selector — descriptive: icon + label + one-line description per tab. */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {TABS.map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              aria-pressed={isActive}
              className={`flex items-start text-left gap-3 p-3.5 rounded-xl transition-all border ${
                isActive
                  ? 'bg-white/[0.06] border-white/[0.12] shadow-sm'
                  : 'bg-white/[0.01] border-transparent hover:bg-white/[0.04] hover:border-white/[0.06]'
              }`}
            >
              <div
                className={`mt-0.5 w-9 h-9 rounded-lg flex flex-shrink-0 items-center justify-center transition-colors ${
                  isActive ? 'bg-accent/15 text-accent' : 'bg-black/30 text-text-dim'
                }`}
              >
                <Icon className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className={`text-sm font-bold ${isActive ? 'text-text-bright' : 'text-text-secondary'}`}>
                  {t(tab.labelKey)}
                </div>
                <div className="text-[11px] text-text-dim mt-0.5 leading-tight">
                  {t(tab.descKey)}
                </div>
              </div>
            </button>
          )
        })}
      </div>

      {/* Tab content */}
      <div className="animate-fade-in">
        {activeTab === 'host' && <HostTab />}
        {activeTab === 'browse' && <BrowseTab />}
        {activeTab === 'settings' && <SettingsTab />}
      </div>
    </div>
  )
}
