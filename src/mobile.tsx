// ============================================================================
// src/mobile.tsx
// ----------------------------------------------------------------------------
// MobileApp — dedicated entry for browsers opening Y-Core's `#/remote-mobile`
// route (iPhone, iPad, test browser). Single-tap flow: scan QR → SPA with
// library + settings + play views → tap a game → game launches on the host
// PC and the stream flows into the play view with mobile gamepad controls.
//
// Sub-views (state-based router — no nested React Router to avoid clashes
// with the parent HashRouter used by the desktop shell):
//
//   library  ── default landing. Fetches installed games via the WS bridge
//                and shows each as a card with a Play button. Tapping Play
//                calls remotePlay.launchFromMobile(appId) which starts
//                hosting + launches the game on the host, then we switch to
//                the play view using the returned session.
//   play     ── WebRTC client view. Connects to the host, receives the
//                OFFER, sends ANSWER + ICE, plays the stream, overlays the
//                mobile gamepad for input forwarding via the WS input bridge.
//   settings ── connection info + disconnect / back-to-library button.
//
// The QR auto-connect path (`?token=...`) preserves the v1 behavior: skip
// the library view entirely and go straight to the play view by resolving
// the token → host:port → connectToHost → startConnection.
// ============================================================================

import { useCallback, useEffect, useRef, useState } from 'react'
import StreamPlayer from './pages/remote-play/StreamPlayer'
import { useWebRTC, type WebRTCStats } from './hooks/useWebRTC'
import type { SignalPayload, RemotePlaySession } from '../electron/common/ipc-contract'

// ── Types ─────────────────────────────────────────────────────────────────

interface InstalledGame {
  appId: string
  name: string
  installDir?: string
  sizeOnDisk?: number
  lastPlayed?: number
}

type View = 'library' | 'play' | 'settings'

interface PeerStatus {
  state: 'idle' | 'connecting' | 'connected' | 'failed'
  message?: string
}

function readQueryParams(): { host: string; port: number; token: string | null } {
  if (typeof window === 'undefined') return { host: 'localhost', port: 42861, token: null }
  const params = new URLSearchParams(window.location.search)
  const host = params.get('host') || window.location.hostname || 'localhost'
  const port = Number(params.get('port')) || 42861
  const token = params.get('token')
  return { host, port, token }
}

// ── Orientation overlay — forces landscape for play view ─────────────────

function OrientationOverlay() {
  const [isPortrait, setIsPortrait] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.innerHeight > window.innerWidth
  })

  useEffect(() => {
    let mountGuard = true

    const onResize = () => {
      setIsPortrait(window.innerHeight > window.innerWidth)
    }
    // orientationchange fires BEFORE resize on iOS, so we defer the
    // dimension read by 100ms. Guarded by mountGuard to avoid setting
    // state on an unmounted component.
    const onOrientationChange = () => {
      setTimeout(() => {
        if (!mountGuard) return
        setIsPortrait(window.innerHeight > window.innerWidth)
      }, 100)
    }

    window.addEventListener('resize', onResize)
    window.addEventListener('orientationchange', onOrientationChange)
    return () => {
      mountGuard = false
      window.removeEventListener('resize', onResize)
      window.removeEventListener('orientationchange', onOrientationChange)
    }
  }, [])

  if (!isPortrait) return null

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-950 text-slate-100">
      <div className="animate-rotate-phone mb-8 w-24 h-24 flex items-center justify-center">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className="w-20 h-20 text-indigo-400"
        >
          {/* Phone body */}
          <rect x="5" y="2" width="14" height="20" rx="2" />
          {/* Screen */}
          <rect x="7" y="5" width="10" height="14" rx="1" opacity="0.3" />
          {/* Rotate arrows */}
          <path
            d="M9 2 L9 0 M15 2 L15 0"
            strokeWidth="1"
            strokeLinecap="round"
          />
        </svg>
      </div>
      <p className="text-lg font-bold mb-2">Girá el dispositivo</p>
      <p className="text-sm text-slate-400 text-center max-w-xs px-6">
        Poné el teléfono en horizontal para disfrutar del streaming
      </p>
      <div className="mt-8 flex gap-2 opacity-40">
        <div className="w-2 h-2 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '0ms' }} />
        <div className="w-2 h-2 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '100ms' }} />
        <div className="w-2 h-2 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '200ms' }} />
      </div>
    </div>
  )
}

// ── Main MobileApp ────────────────────────────────────────────────────────

export function MobileApp() {
  const [{ host, port, token }] = useState(readQueryParams)
  // The QR auto-connect path jumps straight to `play` with a synthetic
  // "connecting" status. The library path starts in `library`.
  const [view, setView] = useState<View>(() => (token ? 'play' : 'library'))
  const [activeSession, setActiveSession] = useState<RemotePlaySession | null>(null)
  // Reusable launcher returned from the desktop stream view so we can come
  // back to the same session if the user navigates to settings mid-play.
  const lastPlayPayloadRef = useRef<{ session: RemotePlaySession } | null>(null)

  // ── Add mobile-active class to <html> to remove desktop chrome ──────────
  // The class overrides body padding (6px) and #root border-radius/shadow
  // so the stream fills the entire viewport edge-to-edge on mobile devices.
  // Removed when the mobile app unmounts (navigates away or closes).
  useEffect(() => {
    document.documentElement.classList.add('mobile-active')
    return () => {
      document.documentElement.classList.remove('mobile-active')
    }
  }, [])

  const handleLibraryLaunch = useCallback((session: RemotePlaySession) => {
    setActiveSession(session)
    lastPlayPayloadRef.current = { session }
    setView('play')
  }, [])

  const handleBackToLibrary = useCallback(() => {
    setActiveSession(null)
    lastPlayPayloadRef.current = null
    setView('library')
  }, [])

  return (
    <>
      {/* Orientation overlay — forces landscape for the play view.
          Shown on top of everything when the phone is in portrait AND
          the current view expects a stream (play mode). The library
          and settings views are usable in portrait, so we only lock
          the orientation when actually streaming. */}
      {view === 'play' && <OrientationOverlay />}

      {view === 'library' && (
        <LibraryView
          host={host}
          port={port}
          onPlay={handleLibraryLaunch}
          onSettings={() => setView('settings')}
        />
      )}
      {view === 'play' && (
        <PlayView
          host={host}
          port={port}
          token={token}
          initialSession={activeSession}
          onBack={handleBackToLibrary}
          onSettings={() => setView('settings')}
        />
      )}
      {view === 'settings' && (
        <SettingsView
          host={host}
          port={port}
          activeSession={activeSession}
          onBack={() => setView(activeSession ? 'play' : 'library')}
        />
      )}
    </>
  )
}

export default MobileApp

// ── Library View ──────────────────────────────────────────────────────────

function LibraryView({
  host,
  port,
  onPlay,
  onSettings,
}: {
  host: string
  port: number
  onPlay: (session: RemotePlaySession) => void
  onSettings: () => void
}) {
  const [games, setGames] = useState<InstalledGame[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [launchingId, setLaunchingId] = useState<string | null>(null)
  // Ref-based synchronous guard. React `useState` updates are async, so two
  // rapid taps in the same event loop tick both observe the stale value and
  // both pass the guard. A ref reads synchronously, so the second tap sees
  // the first one's commit and bails. `launchingId` state is kept only for
  // the UI (button label + dimming).
  const launchingRef = useRef<string | null>(null)
  const [search, setSearch] = useState('')

  // ── Fetch installed games via the WS bridge ────────────────────────────
  useEffect(() => {
    let cancelled = false
    void (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const gw = (window as any).steamtools?.gateway
      if (!gw?.call) {
        if (!cancelled) {
          setError('Bridge no inicializó — abrí el Remote Play desde la PC primero')
          setLoading(false)
        }
        return
      }
      try {
        const result = (await gw.call('game', 'listInstalled')) as
          | { success: boolean; games: InstalledGame[]; error?: string }
          | null
        if (cancelled) return
        if (result?.success) {
          // Drop Steamworks Redistributable from the list (same filter as
          // the desktop LibraryPage uses — keeps parity).
          const filtered = (result.games || []).filter(
            (g: InstalledGame) => g.appId !== '228980',
          )
          setGames(filtered)
        } else {
          setError(result?.error || 'No se pudo cargar la biblioteca')
        }
      } catch (err: any) {
        if (!cancelled) setError(err?.message ?? 'Error de comunicación')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  // ── Tap game → launch on host ──────────────────────────────────────────
  const handlePlay = useCallback(
    async (game: InstalledGame) => {
      // Synchronous ref guard — see launchingRef declaration for why.
      if (launchingRef.current !== null) return
      launchingRef.current = game.appId
      setLaunchingId(game.appId)
      setError(null)
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const gw = (window as any).steamtools?.gateway
        if (!gw?.call) throw new Error('Bridge no disponible')
        const session = (await gw.call('remotePlay', 'launchFromMobile', game.appId, {
          sessionName: `Y-Core Mobile · ${game.name}`,
        })) as RemotePlaySession
        if (!session?.host || !session?.port) {
          throw new Error('Sesión inválida devuelta por el host')
        }
        onPlay(session)
      } catch (err: any) {
        setError(friendlyLaunchError(err))
      } finally {
        launchingRef.current = null
        setLaunchingId(null)
      }
    },
    [onPlay],
  )

  const filtered = search.trim()
    ? games.filter((g) =>
        (g.name || '').toLowerCase().includes(search.trim().toLowerCase()),
      )
    : games

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-slate-950 via-slate-900 to-black text-slate-100">
      <header className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06] flex-shrink-0">
        <div>
          <h1 className="text-lg font-bold">Biblioteca</h1>
          <p className="text-[11px] text-slate-400 mt-0.5">
            {games.length} juego{games.length === 1 ? '' : 's'} · host {host}:{port}
          </p>
        </div>
        <button
          type="button"
          onClick={onSettings}
          className="w-9 h-9 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-slate-300 hover:text-white transition-colors"
          aria-label="Configuración"
          title="Configuración"
        >
          ⚙
        </button>
      </header>

      <div className="px-4 py-3 flex-shrink-0">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar en la biblioteca…"
          className="w-full px-3 py-2 rounded-xl text-sm bg-white/[0.06] border border-white/[0.08] text-slate-100 placeholder:text-slate-500 outline-none focus:border-indigo-500/50"
        />
      </div>

      {error && (
        <div className="mx-4 mb-3 px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-300">
          {error}
        </div>
      )}

      <main className="flex-1 overflow-y-auto px-4 pb-4 space-y-2">
        {loading ? (
          <SkeletonList />
        ) : filtered.length === 0 ? (
          <EmptyState hasGames={games.length > 0} query={search} />
        ) : (
          filtered.map((game) => (
            <MobileGameCard
              key={game.appId}
              game={game}
              launching={launchingId === game.appId}
              // Disable every card while any launch is in flight — the
              // handlePlay() guard short-circuits the call, but a visibly
              // disabled button is better UX than a frozen tap target.
              anyLaunching={launchingId !== null}
              onPlay={() => handlePlay(game)}
            />
          ))
        )}
      </main>
    </div>
  )
}

// ── Game Card ─────────────────────────────────────────────────────────────

function MobileGameCard({
  game,
  launching,
  anyLaunching,
  onPlay,
}: {
  game: InstalledGame
  launching: boolean
  anyLaunching: boolean
  onPlay: () => void
}) {
  const sizeGb = game.sizeOnDisk ? (game.sizeOnDisk / 1024 / 1024 / 1024).toFixed(1) : null
  const disabled = launching || anyLaunching
  return (
    <div className="flex items-center gap-3 px-3 py-3 rounded-2xl border border-white/[0.06] bg-white/[0.04]">
      <div className="w-12 h-12 rounded-xl bg-indigo-500/15 flex items-center justify-center text-indigo-300 text-xs font-bold uppercase flex-shrink-0">
        {(game.name || game.appId).slice(0, 2).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold truncate">{game.name || `App ${game.appId}`}</p>
        <p className="text-[11px] text-slate-400 mt-0.5 font-mono">
          {game.appId}{sizeGb ? ` · ${sizeGb} GB` : ''}
        </p>
      </div>
      <button
        type="button"
        onClick={onPlay}
        disabled={disabled}
        className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-indigo-500 hover:bg-indigo-400 active:scale-95 transition-all disabled:opacity-60 disabled:cursor-wait flex-shrink-0"
      >
        {launching ? 'Iniciando…' : 'Jugar'}
      </button>
    </div>
  )
}

/**
 * Map a launch error into something a phone user can act on. Raw messages
 * from the host side are usually developer-facing (stack traces, "ECONN",
 * "no Steam session"). We translate the common cases to plain Spanish.
 */
function friendlyLaunchError(err: any): string {
  const msg: string = err?.message ?? err?.reason ?? String(err ?? '')
  if (!msg) return 'No se pudo iniciar el juego en la PC. Verificá que Steam esté abierto y la sesión iniciada.'
  const lower = msg.toLowerCase()
  if (lower.includes('steam') && (lower.includes('fail') || lower.includes('error'))) {
    return `Steam no pudo lanzar el juego (${msg}). ¿Steam está abierto y con la sesión iniciada en la PC?`
  }
  if (lower.includes('not installed') || lower.includes('no instalado') || lower.includes('no aparece')) {
    return `El juego no aparece como instalado en Steam: ${msg}`
  }
  if (lower.includes('econn') || lower.includes('timeout') || lower.includes('network')) {
    return `No se pudo contactar a la PC (${msg}). Verificá que esté encendida y que el firewall permita los puertos 42861-42864.`
  }
  if (lower.includes('eacces') || lower.includes('eperm')) {
    return `Permisos insuficientes para iniciar el juego (${msg}). Reintentá Y-Core como administrador.`
  }
  if (lower.includes('manifest') && (lower.includes('missing') || lower.includes('fail') || lower.includes('not found'))) {
    return `Falta un manifest o depot (${msg}). Re-sincronizá el catálogo desde el desktop.`
  }
  if (lower.includes('bridge no')) {
    return 'El bridge no está disponible. Asegurate de abrir Remote Play en la PC antes de tocar Jugar acá.'
  }
  if (lower.includes('sesión inválida') || lower.includes('sesion invalida')) {
    return `El host devolvió una sesión inválida: ${msg}`
  }
  return msg
}

function SkeletonList() {
  return (
    <div className="space-y-2">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="h-[68px] rounded-2xl bg-white/[0.04] animate-pulse" />
      ))}
    </div>
  )
}

function EmptyState({ hasGames, query }: { hasGames: boolean; query: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-slate-400 text-center">
      <p className="text-3xl mb-2">{query ? '🔍' : '📭'}</p>
      <p className="text-sm font-medium">
        {query
          ? `Sin resultados para "${query}"`
          : hasGames
            ? 'Sin coincidencias'
            : 'Biblioteca vacía'}
      </p>
      <p className="text-xs mt-1 max-w-xs">
        {hasGames
          ? 'Probá con otro término'
          : 'Instalá un juego en Steam y aparecerá acá'}
      </p>
    </div>
  )
}

// ── Play View ─────────────────────────────────────────────────────────────

function PlayView({
  host,
  port,
  token,
  initialSession,
  onBack,
  onSettings,
}: {
  host: string
  port: number
  token: string | null
  initialSession: RemotePlaySession | null
  onBack: () => void
  onSettings: () => void
}) {
  const [status, setStatus] = useState<PeerStatus>(() =>
    token
      ? { state: 'connecting', message: 'Conectando vía QR…' }
      : initialSession
        ? { state: 'connecting' }
        : { state: 'idle' },
  )
  const [session, setSession] = useState<RemotePlaySession | null>(initialSession)
  const [stats, setStats] = useState<WebRTCStats | null>(null)
  const [inputReady, setInputReady] = useState(false)
  const webrtcRef = useRef<ReturnType<typeof useWebRTC> | null>(null)

  // ── Send signal through the bridge gateway ─────────────────────────────
  const onSendSignal = useCallback(
    async (signal: SignalPayload) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const gw = (window as any).steamtools?.gateway
      if (!gw) return
      try {
        // The WebRTC signaling port for the host is streamPort+1 (see
        // electron/modules/remote-play.ts: startSignalingListener). The host
        // forwards the envelope to the connected peer.
        await gw.call('remotePlay', 'sendSignal', host, port, signal)
      } catch (err: any) {
        // eslint-disable-next-line no-console
        console.warn('[mobile] sendSignal failed:', err?.message)
      }
    },
    [host, port],
  )

  const webrtc = useWebRTC({ mode: 'client', onSendSignal })
  webrtcRef.current = webrtc

  // ── Subscribe to inbound signaling topics ──────────────────────────────
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const gw = (window as any).steamtools?.gateway
    if (!gw?.on) return

    const unsubWs = gw.on('remotePlay:wsSignal', (signal: SignalPayload) => {
      // eslint-disable-next-line no-console
      console.log(`[mobile] < wsSignal type=${signal?.type} hasPC=${!!webrtcRef.current?.connectionState}`)
      webrtcRef.current?.handleIncomingSignal(signal)
    })
    const unsubLan = gw.on(
      'remotePlay:signal',
      (envelope: { from?: string } & SignalPayload) => {
        if (!envelope || typeof envelope !== 'object') return
        const { from, ...signal } = envelope
        void from
        // eslint-disable-next-line no-console
        console.log(`[mobile] < signal type=${signal?.type} from=${from} hasPC=${!!webrtcRef.current?.connectionState}`)
        if (signal.type === 'offer') {
          // eslint-disable-next-line no-console
          console.log(`[mobile] OFFER received! hasData=${!!signal.data} hasData.type=${typeof signal.data}`)
        }
        webrtcRef.current?.handleIncomingSignal(signal as SignalPayload)
      },
    )

    return () => {
      try { unsubWs() } catch { /* ignore */ }
      try { unsubLan() } catch { /* ignore */ }
    }
  }, [])

  // ── Subscribe to input WS readiness so the badge colors honestly ───────
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ib = (window as any).steamtools?.inputBridge
    if (!ib?.subscribeState) return
    const unsub = ib.subscribeState(setInputReady)
    return () => {
      try { unsub() } catch { /* ignore */ }
    }
  }, [])

  // ── QR auto-connect path ───────────────────────────────────────────────
  useEffect(() => {
    if (!token) return
    let cancelled = false
    void (async () => {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      let gw: any = null
      for (let i = 0; i < 60 && !cancelled; i++) {
        gw = (window as any).steamtools?.gateway
        if (gw?.call) break
        await new Promise<void>((resolve) => setTimeout(resolve, 100))
      }
      if (cancelled || !gw?.call) {
        setStatus({ state: 'failed', message: 'Bridge no inicializó a tiempo' })
        return
      }
      try {
        const resolved = (await gw.call('remotePlay', 'resolveMobileToken', token)) as
          | { host: string; port: number }
          | null
        if (cancelled) return
        if (!resolved?.host || !resolved?.port) {
          setStatus({ state: 'failed', message: 'Token inválido o expirado' })
          return
        }
        setStatus({ state: 'connecting', message: 'Conectando vía QR…' })
        // CRITICAL: Do NOT call connectToHost(resolved.host, resolved.port) here!
        // connectToHost() internally calls disconnect() FIRST, which sends a
        // 'bye' signal to the host via the signaling server. The host receives
        // 'bye' → stopConnection() → kills the WebRTC PC + sets error "Remote
        // peer disconnected". By the time startConnection() creates a new PC
        // and sends 'request', the connection flow is already racing against
        // the 'bye' deathtoll. The host/port from token resolution are enough
        // for the onSendSignal callback to route signals to the host.
        await webrtcRef.current?.startConnection()
        // NOTE: do NOT flip status.state to 'connected' here. Same reason as
        // the library-launched path — startConnection() in client mode only
        // sends the 'request' signal; the actual WebRTC handshake (offer →
        // answer → ICE → DTLS) is still in flight. The mirror effect watching
        // webrtc.connectionState will flip status to 'connected' once the
        // peer connection actually transitions. Setting it here would
        // flash a green badge before anything has actually connected.
      } catch (err: any) {
        if (!cancelled) setStatus({ state: 'failed', message: err?.message ?? String(err) })
      }
      /* eslint-enable @typescript-eslint/no-explicit-any */
    })()
    return () => { cancelled = true }
  }, [token])

  // ── Library-launched path: when the parent gives us a session, kick off
  // the WebRTC client connection (no need for connectToHost since the host
  // is already running an active session from launchFromMobile). ───────
  useEffect(() => {
    if (!initialSession || token) return
    if (status.state !== 'connecting') return
    let cancelled = false
    void (async () => {
      try {
        await webrtcRef.current?.startConnection()
        // NOTE: do NOT flip status.state to 'connected' here. In client mode
        // startConnection() only sends the 'request' signal — the actual
        // WebRTC handshake (offer→answer→ICE→DTLS) hasn't happened yet, and
        // can take several seconds. The transition to 'connected' is driven
        // by the webrtc.connectionState mirror effect below. Setting it
        // here would make the UI show "Connected" while the peer is still
        // in 'new' state, hiding real failures behind a green badge.
      } catch (err: any) {
        if (!cancelled) setStatus({ state: 'failed', message: err?.message ?? String(err) })
      }
    })()
    return () => { cancelled = true }
  }, [initialSession, token, status.state])

  // ── Mirror the WebRTC state machine into our local status ─────────────────
  // Library-launched path was flipping status.state to 'connected' the
  // instant startConnection() resolved, which on the client side only
  // means "the request was sent". The peer connection state (`new` →
  // `connecting` → `connected`) is the source of truth — drive status from
  // it so the UI mirrors what actually happened on the wire. If the peer
  // fails to answer or ICE fails, we surface 'failed' with the hook's error
  // so the user can see WHY the screen stayed blank instead of staring at
  // a permanently-spinning "Connecting..." with no diagnostic.
  useEffect(() => {
    if (webrtc.connectionState === 'connecting' && status.state !== 'connecting' && status.state !== 'connected') {
      // Recovered from a failed/idle state (e.g., user tapped Retry, or
      // the peer is re-attempting after a transient error). Show the
      // spinner again instead of leaving a stale 'failed' badge up.
      // Distinguish "reconnecting" (had a connection before) from
      // "connecting" (fresh attempt after manual disconnect, no prior
      // session lost) so the message is honest.
      const hadPreviousConnection = status.state === 'failed'
      setStatus({
        state: 'connecting',
        message: hadPreviousConnection ? 'Reconectando…' : 'Conectando…',
      })
    } else if (webrtc.connectionState === 'connected' && status.state !== 'connected') {
      setStatus({ state: 'connected' })
    } else if (webrtc.connectionState === 'failed' && status.state !== 'failed') {
      setStatus({
        state: 'failed',
        message: webrtc.error || 'La conexión WebRTC falló',
      })
    } else if (
      (webrtc.connectionState === 'disconnected' || webrtc.connectionState === 'closed') &&
      status.state === 'connected'
    ) {
      setStatus({ state: 'idle', message: 'Desconectado del host' })
    }
  }, [webrtc.connectionState, webrtc.error, status.state])

  // ── Mirror webrtc.stats into local state so StreamPlayer re-renders ────
  useEffect(() => { setStats(webrtc.stats) }, [webrtc.stats])

  // ── Manual connect (only used in the legacy QR path or for debugging) ─
  const handleConnect = useCallback(async () => {
    setStatus({ state: 'connecting' })
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const gw = (window as any).steamtools?.gateway
      if (!gw) throw new Error('gateway unavailable — bridge not installed')
      const sess = (await gw.call('remotePlay', 'connectToHost', host, port)) as RemotePlaySession
      setSession(sess)
      await webrtcRef.current?.startConnection()
      // NOTE: do NOT flip status.state to 'connected' here. The mirror
      // effect watching webrtc.connectionState owns the transition; setting
      // it eagerly here would race the mirror and lie to the user.
    } catch (err: any) {
      setStatus({ state: 'failed', message: err?.message ?? String(err) })
    }
  }, [host, port])

  const handleDisconnect = useCallback(async () => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const gw = (window as any).steamtools?.gateway
      if (gw) await gw.call('remotePlay', 'disconnect').catch(() => undefined)
    } finally {
      webrtcRef.current?.stopConnection()
      setSession(null)
      setStatus({ state: 'idle' })
      onBack()
    }
  }, [onBack])

  // ── Forward input frames from MobileControls through the WS input bridge ─
  const handleFrame = useCallback((frame: Uint8Array): boolean => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ib = (window as any).steamtools?.inputBridge
    if (!ib || typeof ib.dispatch !== 'function') return false
    const result = ib.dispatch(frame) as Promise<{ ok: boolean; reason?: string }>
    Promise.resolve(result)
      .then((r) => {
        if (r && r.ok === false) {
          // eslint-disable-next-line no-console
          console.warn('[mobile] WS input dispatch rejected:', r.reason)
        }
      })
      .catch((err: any) =>
        // eslint-disable-next-line no-console
        console.warn('[mobile] WS input dispatch threw:', err?.message),
      )
    return true
  }, [])

  // ── Render: failed screen ──────────────────────────────────────────────
  if (status.state === 'failed') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 py-10 bg-slate-950 text-slate-100">
        <p className="text-red-400 font-semibold mb-2">Error de conexión</p>
        <p className="text-sm text-slate-300 mb-6 text-center max-w-md">{status.message}</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onBack}
            className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-medium text-sm"
          >
            Volver a biblioteca
          </button>
          <button
            type="button"
            onClick={() => setStatus({ state: 'idle' })}
            className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-medium text-sm"
          >
            Reintentar
          </button>
        </div>
      </div>
    )
  }

  // ── Render: idle (no QR, no initial session) ───────────────────────────
  if (status.state === 'idle' && !initialSession) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 py-10 bg-gradient-to-b from-slate-950 via-slate-900 to-black text-slate-100">
        <h1 className="text-2xl font-semibold mb-2">Y-Core Remote</h1>
        <p className="text-sm text-slate-400 mb-8 max-w-md text-center">
          Conectar a la PC {host}:{port}.
        </p>
        <button
          type="button"
          onClick={handleConnect}
          className="px-6 py-3 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-white font-bold"
        >
          Conectar
        </button>
        <button
          type="button"
          onClick={onBack}
          className="mt-3 text-xs text-slate-400 hover:text-slate-200"
        >
          Volver a biblioteca
        </button>
      </div>
    )
  }

  // ── Render: connecting + connected → StreamPlayer + MobileControls ──
  // CRITICAL: the underlying initialSession from `launchFromMobile` carries
  // `status: 'hosting'` (because that's how `startHosting` constructs it).
  // StreamPlayer renders `<NotConnected />` whenever `session.status !==
  // 'connected'`, so leaving the raw initialSession here causes the player
  // to pop up "Not connected to any host" right after a successful
  // `onconnectionstatechange === 'connected'` — the connection actually
  // happened, but the displayed session claims otherwise.
  //
  // Override `status` from the LOCAL PeerStatus state machine so the UI
  // reflects the truth: keep it `'connecting'` while the WebRTC handshake
  // is in flight, flip to `'connected'` once the peer connection reaches
  // the `connected` state. Brand-new sessions with no client action yet
  // default to `'connecting'` so the player shows the spinner instead of
  // the alarming "Not connected" empty state.
  const baseSession: RemotePlaySession = (session ??
    initialSession ?? {
      id: token ?? 'pending',
      name: host,
      host,
      port,
      startedAt: Date.now(),
      clients: 0,
      quality: '',
    }) as RemotePlaySession
  const syntheticSession: RemotePlaySession = {
    ...baseSession,
    status: status.state === 'connected' ? 'connected' : 'connecting',
  }

  return (
    <div
      className="fixed inset-0 bg-black text-slate-100 overflow-hidden"
      // The outer fixed div has NO safe-area padding because `absolute`
      // positioned children ignore parent padding (they position at the
      // padding box edge = visual edge). Safe-area top is applied directly
      // to the <header> overlay. Bottom and side safe areas are handled
      // by the MobileControls (gamepad) and stream clipping via overflow.
      style={{
        // Minimal safe-area for the fixed container itself — keeps the
        // stream behind the notch / home indicator from being interactive.
        // The actual visual fill is edge-to-edge via absolute children.
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        paddingLeft: 'env(safe-area-inset-left, 0px)',
        paddingRight: 'env(safe-area-inset-right, 0px)',
      }}
    >
      {/* Full-screen stream — no gaps, no borders, edge-to-edge */}
      <div className="absolute inset-0">
        <StreamPlayer
          session={syntheticSession}
          connecting={status.state === 'connecting'}
          onDisconnect={handleDisconnect}
          remoteStream={webrtc.remoteStream}
          webrtcStats={stats}
          webrtcState={webrtc.connectionState}
          onFrame={handleFrame}
          inputChannelOpen={inputReady}
          fillContainer
        />
      </div>

      {/* Floating header overlay — semi-transparent, no layout shift;
          buttons are accessible with backdrop blur for readability.
          Positioned absolutely at the top edge, with safe-area-aware
          padding so the buttons clear the iPhone notch / status bar.
          The parent has `pointer-events-none` so touches pass through
          to the stream; individual buttons opt back in. */}
      <header
        className="absolute top-0 left-0 right-0 z-30 flex items-center justify-between px-3 pb-3 bg-gradient-to-b from-black/60 via-black/30 to-transparent pointer-events-none"
        style={{
          // Safe-area top ensures the buttons sit BELOW the notch
          // (~44px on iPhone X–14, ~47px on iPhone 15 Pro).
          paddingTop: 'calc(env(safe-area-inset-top, 0px) + 8px)',
        }}
      >
        <button
          type="button"
          onClick={handleDisconnect}
          className="pointer-events-auto px-2.5 py-1.5 rounded-lg text-xs font-semibold text-white bg-black/40 hover:bg-black/60 backdrop-blur-sm active:scale-95 transition-all"
        >
          ← Salir
        </button>
        <p className="text-xs text-white/80 truncate mx-2 flex-1 text-center drop-shadow-md font-medium">
          {syntheticSession.name}
        </p>
        <button
          type="button"
          onClick={onSettings}
          className="pointer-events-auto w-7 h-7 rounded-lg bg-black/40 hover:bg-black/60 flex items-center justify-center text-white/80 backdrop-blur-sm active:scale-95 transition-all text-xs"
          aria-label="Configuración"
        >
          ⚙
        </button>
      </header>
    </div>
  )
}

// ── Settings View ─────────────────────────────────────────────────────────

function SettingsView({
  host,
  port,
  activeSession,
  onBack,
}: {
  host: string
  port: number
  activeSession: RemotePlaySession | null
  onBack: () => void
}) {
  const [disconnecting, setDisconnecting] = useState(false)

  const handleDisconnect = useCallback(async () => {
    setDisconnecting(true)
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const gw = (window as any).steamtools?.gateway
      if (gw) await gw.call('remotePlay', 'disconnect').catch(() => undefined)
    } finally {
      setDisconnecting(false)
      onBack()
    }
  }, [onBack])

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100">
      <header className="flex items-center px-4 py-3 border-b border-white/5">
        <button
          type="button"
          onClick={onBack}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/5 hover:bg-white/10"
        >
          ← Volver
        </button>
        <h1 className="text-lg font-bold ml-3">Configuración</h1>
      </header>

      <main className="p-4 space-y-4">
        <section className="rounded-2xl border border-white/[0.06] bg-white/[0.04] p-4 space-y-2">
          <h2 className="text-xs uppercase tracking-wider text-slate-400 font-bold">Conexión</h2>
          <Row label="Host" value={host} />
          <Row label="Puerto de stream" value={String(port)} />
          <Row label="Sesión activa" value={activeSession ? activeSession.name : '—'} />
          <Row label="Estado" value={activeSession ? activeSession.status : 'idle'} />
        </section>

        <section className="rounded-2xl border border-white/[0.06] bg-white/[0.04] p-4 space-y-2">
          <h2 className="text-xs uppercase tracking-wider text-slate-400 font-bold">Acerca de</h2>
          <p className="text-xs text-slate-300 leading-relaxed">
            Y-Core Mobile · cliente ligero para transmitir la pantalla de tu PC a
            este dispositivo y controlarla con el gamepad táctil integrado.
          </p>
        </section>

        {activeSession && (
          <button
            type="button"
            onClick={handleDisconnect}
            disabled={disconnecting}
            className="w-full px-4 py-3 rounded-xl bg-red-500/80 hover:bg-red-500 text-white font-bold text-sm disabled:opacity-50"
          >
            {disconnecting ? 'Desconectando…' : 'Desconectar'}
          </button>
        )}
      </main>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-slate-400">{label}</span>
      <span className="text-slate-100 truncate ml-3 font-mono text-xs">{value}</span>
    </div>
  )
}