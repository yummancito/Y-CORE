import { Routes, Route, Navigate } from 'react-router-dom'
import { Suspense, lazy } from 'react'
import AppShell from './components/layout/AppShell'

const HomePage = lazy(() => import('./pages/HomePage'))
const CatalogPage = lazy(() => import('./pages/CatalogPage'))
const DetailPage = lazy(() => import('./pages/DetailPage'))
const WatchPage = lazy(() => import('./pages/WatchPage'))
const SearchPage = lazy(() => import('./pages/SearchPage'))
const FavoritesPage = lazy(() => import('./pages/FavoritesPage'))
const HistoryPage = lazy(() => import('./pages/HistoryPage'))
const SettingsPage = lazy(() => import('./pages/SettingsPage'))
const DebugSubtitlesPage = lazy(() => import('./pages/DebugSubtitlesPage'))
const LoginPage = lazy(() => import('./pages/LoginPage'))

function LoadingFallback() {
  return (
    <div className="flex items-center justify-center h-full min-h-[400px]">
      <div className="flex flex-col items-center gap-4">
        <div className="w-10 h-10 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-text-dim">Cargando...</p>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <Routes>
        {/* Watch y Login van fuera del layout: sin nav/sidebar */}
        <Route path="/watch/:mediaType/:id" element={<WatchPage />} />
        <Route path="/login" element={<LoginPage />} />

        <Route element={<AppShell />}>
          <Route path="/" element={<Navigate to="/home" replace />} />
          <Route path="/home" element={<HomePage />} />
          <Route path="/catalog/:mediaType" element={<CatalogPage />} />
          <Route path="/detail/:mediaType/:id" element={<DetailPage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/favorites" element={<FavoritesPage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          {/* Pantalla de diagnóstico temporal */}
          <Route path="/debug/subtitles" element={<DebugSubtitlesPage />} />
        </Route>
      </Routes>
    </Suspense>
  )
}
