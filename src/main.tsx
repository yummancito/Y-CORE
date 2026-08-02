import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import './index.css'
import { detectSystemLanguage, setLanguage } from './lib/i18n'
import { installMockSteamtools } from './lib/mockSteamtools'

installMockSteamtools()

// Browser-side install — when the page is opened in a plain browser (NOT
// Electron) and the URL is on the mobile route, install the WebSocket-backed
// shim BEFORE ReactDOM.render so the very first render sees window.steamtools.
// Imported dynamically so vite code-splits browser-bridge out of the desktop
// bundle (desktop users never download it).
//
// No `import.meta.env.DEV === false` guard — dev testers on the LAN must
// still reach the bridge. The previous checks already cover Electron (real
// preload installed window.steamtools) so dev in Electron itself is fine.
if (
  typeof window !== 'undefined' &&
  /* eslint-disable @typescript-eslint/no-explicit-any */
  !(window as any).steamtools &&
  (window.location.hash?.startsWith('#/remote-mobile') ?? false)
  /* eslint-enable @typescript-eslint/no-explicit-any */
) {
  void import('./browser-bridge').then(({ installBrowserBridge }) => {
    installBrowserBridge()
  })
}

function applySystemTheme(root: HTMLElement) {
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  root.classList.toggle('theme-dark', prefersDark)
  root.classList.toggle('theme-light', !prefersDark)
}

// ── Apply default theme synchronously so React mounts with the right colors (no flash)
// theme-dark already IS the strong-black Y-core palette — no second ct-* class
// layered on top. The old theme-dark + ct-y-core combo relied on both classes
// staying on <html> and CSS declaration order to pick a winner, which broke
// whenever anything reordered/removed one of the two.
const root = document.documentElement
applySystemTheme(root)

// Live system theme switcher — register BEFORE React mount so we don't miss
// the very first transition if the user toggles while the app is booting.
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  applySystemTheme(root)
})

// ── Mount React IMMEDIATELY — do not wait on IPC. This was the main boot blocker
//    (await readConfig + await getLocale before render).
window.steamtools?.addLog?.({ level: 'DEBUG', message: '[STARTUP] [B] ReactDOM.render starting' }).catch(() => {})
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HashRouter>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </HashRouter>
  </React.StrictMode>,
)

// ── Register Service Worker for CDN caching ─────────────────────────────
// El SW se registra después del mount inicial para no bloquear React.
// Solo en producción (en dev el HMR choca con la caché del SW).
if ('serviceWorker' in navigator && !import.meta.env.DEV) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // SW no disponible (file://, permisos, etc.) — no crítico
    })
  })
}

// ── Async bootstrap AFTER mount: fetch saved config + locale, apply on top of
//    the defaults. Fire-and-forget so it never blocks the UI.
;(async () => {
  try {
    const cfg = (await window.steamtools?.readConfig?.()) as any
    if (cfg?.colorTheme && cfg.colorTheme !== 'ct-y-core') {
      root.classList.remove('ct-y-core')
      root.classList.add(cfg.colorTheme)
    }
  } catch (e) {
    console.warn('[startup] config load failed; using default theme', e)
  }

  try {
    const locale = (await window.steamtools?.getLocale?.()) || navigator.language || 'es'
    setLanguage(detectSystemLanguage(locale))
  } catch (e) {
    console.warn('[startup] locale detect failed; using navigator.language', e)
    setLanguage(detectSystemLanguage(navigator.language || 'es'))
  }
})()
