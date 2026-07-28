import { useEffect, lazy, Suspense } from 'react'
import { Routes, Route, Navigate, useParams } from 'react-router-dom'
import { AppShell } from './components/layout/AppShell'
import { ProtectedRoute } from './components/ProtectedRoute'
import { ToastContainer } from './components/ui/Toast'
import { ErrorBoundary } from './components/ErrorBoundary'
// InstallProgressDockMount and the small modals stay eager (or lazy if the chunk
// can be skipped most of the time). To shrink the initial main bundle, lazy-load
// the heavy overlays that are NOT visible at first paint.
// We always render them inside <Suspense fallback={null}> — they should return
// null themselves when their store state says "closed", so the chunk is fetched
// only after first paint for true cold start.
import { InstallProgressDockMount } from './components/install-progress-dock'
// React.lazy requires modules with a `default` export. The components below use
// named exports, so we shape the dynamic import to expose a default.
const UpdateNotification = lazy(() => import('./components/ui/UpdateNotification').then((m) => ({ default: m.UpdateNotification })))
const SteamErrorModal = lazy(() => import('./components/ui/SteamErrorModal').then((m) => ({ default: m.SteamErrorModal })))
const SignaturePendingModal = lazy(() => import('./components/ui/SignaturePendingModal').then((m) => ({ default: m.SignaturePendingModal })))
const CommandPalette = lazy(() => import('./components/CommandPalette').then((m) => ({ default: m.CommandPalette })))
const TourOverlay = lazy(() => import('./components/ui/TourOverlay').then((m) => ({ default: m.TourOverlay })))
import { useCommandPaletteStore } from './stores/useCommandPaletteStore'
import { useSteamErrorStore } from './stores/useSteamErrorStore'

const LibraryPage = lazy(() => import('./pages/LibraryPage'))
const AddGame = lazy(() => import('./pages/AddGame'))
const ImportGame = lazy(() => import('./pages/ImportGame'))
const LogsPage = lazy(() => import('./pages/LogsPage'))
const StorePage = lazy(() => import('./pages/StorePage'))
const GameDetailPage = lazy(() => import('./pages/GameDetailPage'))
const SettingsPage = lazy(() => import('./pages/SettingsPage'))
const OnlineFixPage = lazy(() => import('./pages/OnlineFixPage'))
const DrmRemoverPage = lazy(() => import('./pages/DrmRemoverPage'))
const DownloadsPage = lazy(() => import('./pages/DownloadsPage'))
const RemotePlayPage = lazy(() => import('./pages/RemotePlayPage'))
// MobileApp is rendered when the URL hash starts with `#/remote-mobile`.
// Loaded lazily so the desktop app bundle stays the same size; only when the
// user opens the dedicated mobile route does the code-split chunk download.
const MobileApp = lazy(() => import('./mobile').then((m) => ({ default: m.MobileApp })))

// GameDetailPage keeps per-game state (notes, launch profile, saves, stats
// panels) that must reset when navigating between two games. React Router
// reuses the same component instance across param changes on the same
// route, so without a param-derived `key` here those child panels kept
// showing/writing data for the previously viewed game.
function GameDetailPageKeyed() {
  const { appId } = useParams()
  return <GameDetailPage key={appId} />
}

function PageLoader() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: '200px' }}>
      <div style={{ width: '32px', height: '32px', border: '3px solid rgba(255,255,255,0.1)', borderTopColor: '#6366f1', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
    </div>
  )
}

function AppRoutes() {
  return (
    <AppShell>
      <ErrorBoundary>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            {/* Redirect root to library */}
            <Route path="/" element={<Navigate to="/library" replace />} />
            <Route path="/library" element={
              <ErrorBoundary><LibraryPage /></ErrorBoundary>
            } />
            <Route path="/store" element={
              <ErrorBoundary><StorePage /></ErrorBoundary>
            } />
            <Route path="/store/:appId" element={
              <ErrorBoundary><GameDetailPageKeyed /></ErrorBoundary>
            } />
            <Route path="/add-game" element={
              <ErrorBoundary><AddGame /></ErrorBoundary>
            } />
            <Route path="/import-game" element={
              <ErrorBoundary><ImportGame /></ErrorBoundary>
            } />
            <Route path="/logs" element={
              <ErrorBoundary><LogsPage /></ErrorBoundary>
            } />
            <Route path="/online-fix" element={
              <ErrorBoundary><OnlineFixPage /></ErrorBoundary>
            } />
            <Route path="/drm-remover" element={
              <ErrorBoundary><DrmRemoverPage /></ErrorBoundary>
            } />
            <Route path="/downloads" element={
              <ErrorBoundary><DownloadsPage /></ErrorBoundary>
            } />
            <Route path="/remote-play" element={
              <ErrorBoundary><RemotePlayPage /></ErrorBoundary>
            } />
            <Route path="/settings" element={
              <ErrorBoundary><SettingsPage /></ErrorBoundary>
            } />
          </Routes>
        </Suspense>
      </ErrorBoundary>
    </AppShell>
  )
}

export default function App() {
  // Startup timing marker — visible in LogConsole
  window.steamtools?.addLog?.({ level: 'DEBUG', message: '[STARTUP] [A] App render' }).catch(() => {})
  const { toggle: toggleCommandPalette } = useCommandPaletteStore()
  const { open: openSteamError } = useSteamErrorStore()

  // Listen for Steam errors from log watcher
  useEffect(() => {
    const unsub = window.steamtools?.onSteamError?.((error) => {
      openSteamError(error)
    })
    return () => {
      if (typeof unsub === 'function') unsub()
    }
  }, [openSteamError])

  // Ctrl+K / Cmd+K to toggle command palette
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        toggleCommandPalette()
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [toggleCommandPalette])

  return (
    <ErrorBoundary>
      <Routes>
        {/* Mobile-only route. Skips the full app shell, ProtectedRoute, and
            the lazy-loaded electron-side bundles. Window.steamtools is
            shimmed by browser-bridge.ts on first mount. */}
        <Route path="/remote-mobile/*" element={
          <Suspense fallback={<PageLoader />}>
            <MobileApp />
          </Suspense>
        } />
        <Route path="/*" element={
          <ProtectedRoute>
            <AppRoutes />
          </ProtectedRoute>
        } />
      </Routes>
      <ToastContainer />
      <InstallProgressDockMount />
      <Suspense fallback={null}>
        <UpdateNotification />
        <SteamErrorModal />
        <SignaturePendingModal />
        <CommandPalette />
        <TourOverlay />
      </Suspense>
    </ErrorBoundary>
  )
}
