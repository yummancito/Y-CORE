import { useEffect, lazy, Suspense } from 'react'
import { Routes, Route } from 'react-router-dom'
import { AppShell } from './components/layout/AppShell'
import { ProtectedRoute } from './components/ProtectedRoute'
import { ToastContainer } from './components/ui/Toast'
import { UpdateNotification } from './components/ui/UpdateNotification'
import { SignaturePendingModal } from './components/ui/SignaturePendingModal'
import { CommandPalette } from './components/CommandPalette'
import { useCommandPaletteStore } from './stores/useCommandPaletteStore'
import { useSignaturePendingStore } from './stores/useSignaturePendingStore'

const LibraryPage = lazy(() => import('./pages/LibraryPage'))
const AddGame = lazy(() => import('./pages/AddGame'))
const ImportGame = lazy(() => import('./pages/ImportGame'))
const LogsPage = lazy(() => import('./pages/LogsPage'))
const StorePage = lazy(() => import('./pages/StorePage'))
const SettingsPage = lazy(() => import('./pages/SettingsPage'))
const OnlineFixPage = lazy(() => import('./pages/OnlineFixPage'))

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
          <Route path="/add-game" element={<AddGame />} />
          <Route path="/import-game" element={<ImportGame />} />
          <Route path="/logs" element={<LogsPage />} />
          <Route path="/online-fix" element={<OnlineFixPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </Suspense>
    </AppShell>
  )
}

export default function App() {
  const { toggle: toggleCommandPalette } = useCommandPaletteStore()
  const { open: openSignaturePending } = useSignaturePendingStore()

  // Listen for signature pending events from Electron main process
  useEffect(() => {
    const unsub = window.steamtools?.onSignaturePending?.((info) => {
      openSignaturePending(info.component, info.sha256)
    })
    return () => {
      if (typeof unsub === 'function') unsub()
    }
  }, [openSignaturePending])

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
      <SignaturePendingModal />
      <CommandPalette />
    </>
  )
}
