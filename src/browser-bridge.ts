// ============================================================================
// src/browser-bridge.ts
// ----------------------------------------------------------------------------
// Browser fallback shim for window.steamtools on the Y-Core mobile route.
//
// Activates only when ALL of these hold:
//   • typeof window !== 'undefined'                         (running in a browser)
//   • typeof window.steamtools === 'undefined'              (not in Electron)
//   • window.location.hash starts with `#/remote-mobile`    (mobile entry)
//
// When active, installs a Proxy-backed `window.steamtools` whose `gateway`
// and `inputBridge` are backed by two WebSocket connections to the host PC:
//
//   • ws://${host}:42863  → signaling (call/return + subscribe/event pattern)
//   • ws://${host}:42864  → binary input frames (same wire format as the
//                            in-app WebRTC DataChannel + IPC `inputBridge:dispatch`).
//
// Host is read from the `?host=` query string, defaulting to
// `window.location.hostname` so the user can simply type the LAN address of
// the host in the browser.
// ============================================================================

const MOBILE_ROUTE = '#/remote-mobile'
const SIGNALING_PORT = 42863
const INPUT_PORT = 42864
const CALL_TIMEOUT_MS = 30_000

interface PendingCall {
  resolve: (v: unknown) => void
  reject: (e: Error) => void
  timer: ReturnType<typeof setTimeout>
}

export interface InstallResult {
  ok: boolean
  reason?: string
  host?: string
}

function isMobileRoute(): boolean {
  if (typeof window === 'undefined') return false
  const hash = window.location.hash || ''
  return (
    hash === MOBILE_ROUTE ||
    hash.startsWith(MOBILE_ROUTE + '/') ||
    hash.startsWith(MOBILE_ROUTE + '?')
  )
}

function resolveHost(): string {
  if (typeof window === 'undefined') return 'localhost'
  try {
    const q = new URLSearchParams(window.location.search).get('host')
    if (q) return q
  } catch {
    // URLSearchParams on file:// in some old browsers throws — ignore.
  }
  return window.location.hostname || 'localhost'
}

/**
 * Install the browser bridge. Returns `{ok:false, reason}` when preconditions
 * don't hold. Idempotent — a second call is a no-op.
 */
export function installBrowserBridge(): InstallResult {
  if (typeof window === 'undefined') return { ok: false, reason: 'no-window' }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((window as any).steamtools) return { ok: false, reason: 'already-installed' }
  if (!isMobileRoute()) return { ok: false, reason: 'not-mobile-route' }

  const host = resolveHost()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const wAny = window as any

  // ── Signaling WebSocket ────────────────────────────────────────────────────
  const sigUrl = `ws://${host}:${SIGNALING_PORT}`
  const sigWS = new WebSocket(sigUrl)
  // Queued messages are flushed on `open`. Keeps the bridge usable even if
  // `gateway.call(...)` is invoked before the socket finishes connecting.
  const sigOpenQueue: unknown[] = []
  let sigOpened = false
  const eventCbs = new Map<string, Set<(d: unknown) => void>>()
  const pendingCalls = new Map<string, PendingCall>()

  sigWS.addEventListener('open', () => {
    sigOpened = true
    while (sigOpenQueue.length) {
      try { sigWS.send(JSON.stringify(sigOpenQueue.shift())) } catch {}
    }
    // Subscribe to all relevant signaling topics. Server pushes matching
    // events to us; we re-broadcast them through `gateway.on` consumers.
    for (const ev of ['remotePlay:wsSignal', 'remotePlay:signal', 'remotePlay:connectionRequest']) {
      sigWS.send(JSON.stringify({ type: 'subscribe', event: ev }))
    }
    // eslint-disable-next-line no-console
    console.log(`[browser-bridge] signaling WS open: ${sigUrl}`)
  })

  sigWS.addEventListener('close', () => {
    // Reject any pending gateway.call so renderers don't hang.
    for (const [, p] of pendingCalls) {
      clearTimeout(p.timer)
      p.reject(new Error('signaling WS closed'))
    }
    pendingCalls.clear()
    // eslint-disable-next-line no-console
    console.warn('[browser-bridge] signaling WS closed')
  })

  sigWS.addEventListener('error', (e) => {
    // eslint-disable-next-line no-console
    console.warn('[browser-bridge] signaling WS error', e)
  })

  sigWS.addEventListener('message', (e: MessageEvent) => {
    let msg: any
    try { msg = JSON.parse(String(e.data)) } catch { return }
    if (!msg || typeof msg !== 'object') return

    if (msg.type === 'reply' && typeof msg.id === 'string') {
      const p = pendingCalls.get(msg.id)
      if (!p) return
      pendingCalls.delete(msg.id)
      clearTimeout(p.timer)
      if (msg.error !== undefined) p.reject(new Error(String(msg.error)))
      else p.resolve(msg.result)
      return
    }

    if (msg.type === 'event' && typeof msg.event === 'string') {
      const cbs = eventCbs.get(msg.event)
      if (!cbs) return
      for (const cb of cbs) {
        try { cb(msg.data) } catch (err) {
          // eslint-disable-next-line no-console
          console.warn('[browser-bridge] event callback error', err)
        }
      }
      return
    }

    if (msg.type === 'ready' && typeof msg.session === 'string') {
      // eslint-disable-next-line no-console
      console.log(`[browser-bridge] assigned session=${msg.session}`)
    }
  })

  function sendSignalJSON(payload: unknown): void {
    if (sigOpened) {
      try { sigWS.send(JSON.stringify(payload)) } catch {}
    } else {
      sigOpenQueue.push(payload)
    }
  }

  // ── gateway.call / gateway.on ─────────────────────────────────────────────
  function gatewayCall<T = unknown>(service: string, method: string, ...args: unknown[]): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      if (sigWS.readyState !== WebSocket.OPEN && sigWS.readyState !== WebSocket.CONNECTING) {
        reject(new Error(`signaling WS not open (state=${sigWS.readyState})`))
        return
      }
      const id = (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : 'id-' + Math.random().toString(36).slice(2, 12)
      const timer = setTimeout(() => {
        pendingCalls.delete(id)
        reject(new Error(`gateway.call timeout (${service}.${method})`))
      }, CALL_TIMEOUT_MS)
      pendingCalls.set(id, {
        resolve: resolve as (v: unknown) => void,
        reject,
        timer,
      })
      sendSignalJSON({ type: 'call', id, service, method, args })
    })
  }

  function gatewayOn<T = unknown>(event: string, callback: (data: T) => void): () => void {
    let set = eventCbs.get(event)
    if (!set) { set = new Set(); eventCbs.set(event, set) }
    const wrapped = callback as (d: unknown) => void
    set.add(wrapped)
    return () => { set?.delete(wrapped) }
  }

  // ── Input WebSocket ────────────────────────────────────────────────────────
  const inputUrl = `ws://${host}:${INPUT_PORT}`
  const inputWS = new WebSocket(inputUrl)
  inputWS.binaryType = 'arraybuffer'
  let inputOpened = false
  inputWS.addEventListener('open', () => {
    inputOpened = true
    // eslint-disable-next-line no-console
    console.log(`[browser-bridge] input WS open: ${inputUrl}`)
  })
  inputWS.addEventListener('close', () => {
    inputOpened = false
    // eslint-disable-next-line no-console
    console.warn('[browser-bridge] input WS closed')
  })
  inputWS.addEventListener('error', (e) => {
    // eslint-disable-next-line no-console
    console.warn('[browser-bridge] input WS error', e)
  })

  // Subscribers for input readiness changes — MobileApp uses this to light
  // up the connection badge in MobileControls instead of trusting the
  // unrelated WebRTC DataChannel state. Each subscriber immediately receives
  // the current state, so subscribers don't have to chase a "first paint".
  const inputStateCbs = new Set<(ready: boolean) => void>()
  function notifyInputState(): void {
    const ready = inputWS.readyState === WebSocket.OPEN
    for (const cb of inputStateCbs) {
      try { cb(ready) } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('[browser-bridge] inputState cb error', err)
      }
    }
  }
  inputWS.addEventListener('open', () => { inputOpened = true; notifyInputState() })
  inputWS.addEventListener('close', () => { inputOpened = false; notifyInputState() })

  function subscribeInputState(cb: (ready: boolean) => void): () => void {
    inputStateCbs.add(cb)
    // Emit current state synchronously so the subscriber doesn't need to wait.
    try { cb(inputWS.readyState === WebSocket.OPEN) } catch {}
    return () => { inputStateCbs.delete(cb) }
  }

  async function inputDispatch(frame: Uint8Array): Promise<{ ok: boolean; reason?: string }> {
    if (!inputOpened || inputWS.readyState !== WebSocket.OPEN) {
      return { ok: false, reason: `input WS not open (state=${inputWS.readyState})` }
    }
    try {
      inputWS.send(frame)
      return { ok: true }
    } catch (err: any) {
      return { ok: false, reason: err?.message ?? String(err) }
    }
  }

  async function inputIsReady(): Promise<{ available: boolean; platform?: string }> {
    return { available: inputOpened && inputWS.readyState === WebSocket.OPEN, platform: 'browser' }
  }

  // ── Install on window ──────────────────────────────────────────────────────
  wAny.steamtools = {
    gateway: {
      call: gatewayCall,
      on: gatewayOn,
    },
    inputBridge: {
      dispatch: inputDispatch,
      isReady: inputIsReady,
      subscribeState: subscribeInputState,
    },
  }

  // eslint-disable-next-line no-console
  console.log(`[browser-bridge] installed host=${host} route=#/remote-mobile`)
  return { ok: true, host }
}
