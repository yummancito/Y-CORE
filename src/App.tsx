import { useEffect, lazy, Suspense } from 'react'
import { Routes, Route } from 'react-router-dom'
import { AppShell } from './components/layout/AppShell'
import { ProtectedRoute } from './components/ProtectedRoute'
import { ToastContainer } from './components/ui/Toast'
import { UpdateNotification } from './components/ui/UpdateNotification'
import { SteamErrorModal } from './components/ui/SteamErrorModal'
import { CommandPalette } from './components/CommandPalette'
import { TourOverlay } from './components/ui/TourOverlay'
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
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/" element={<LibraryPage />} />
          <Route path="/store" element={<StorePage />} />
          <Route path="/store/:appId" element={<GameDetailPage />} />
          <Route path="/add-game" element={<AddGame />} />
          <Route path="/import-game" element={<ImportGame />} />
          <Route path="/logs" element={<LogsPage />} />
          <Route path="/online-fix" element={<OnlineFixPage />} />
          <Route path="/drm-remover" element={<DrmRemoverPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </Suspense>
    </AppShell>
  )
}

export default function App() {
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
    <>
      <Routes>
        <Route path="/*" element={
          <ProtectedRoute>
            <AppRoutes />
          </ProtectedRoute>
        } />
      </Routes>
      <ToastContainer />
      <UpdateNotification />
      <SteamErrorModal />
      <CommandPalette />
      <TourOverlay />
    </>
  )
}
