// ============================================================================
// src/components/layout/TopNav.tsx
// ----------------------------------------------------------------------------
// Two-row Steam-style horizontal navigation bar.
//
// Row 1 (top, ~32px) — small secondary text links:
//   Left:  tiny logo + brand + Discord (external) · Online Fix · DRM Remover
//   Right: ⭐ Favoritos  💬 Chat IA  🔔 Steam errors (badge)  ─ □ ✕
//
// Row 2 (main, ~56px) — primary section tabs:
//   Left:  back · forward
//   Center: STORE  |  LIBRARY  |  REMOTE PLAY
//   Right: settings
// ============================================================================

import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  ShoppingBag,
  Library,
  Gamepad2,
  Settings as SettingsIcon,
  Star,
  MessageCircle,
  Bell,
  Minus,
  Maximize2,
  X,
  Cloud,
  Package,
} from 'lucide-react'
import { Logo } from '../Logo'
import { useSupportChatStore } from '../../stores/useSupportChatStore'
import { useSteamErrorStore } from '../../stores/useSteamErrorStore'
import { useSettingsStore } from '../../stores/useSettingsStore'
import { t } from '../../lib/i18n'

// ── Module-level style fragments ──────────────────────────────────────────

const tabBase =
  'flex items-center justify-center gap-2 h-full px-5 text-[12.5px] font-bold uppercase tracking-[0.04em] transition-all duration-150 min-w-[110px]'
const tabActiveCls = 'text-[var(--accent)] font-extrabold'
const tabInactiveCls = 'text-text-dim hover:text-text-bright hover:bg-white/[0.04]'

const topLinkBase =
  'flex items-center h-[32px] px-2 text-[11px] font-semibold uppercase tracking-wider transition-colors duration-150'
const topLinkActiveCls = 'text-[var(--accent)]'
const topLinkInactiveCls = 'text-text-muted hover:text-text-bright'

const iconBtnBase =
  'relative flex w-7 h-7 items-center justify-center rounded-md text-text-dim hover:bg-white/[0.07] hover:text-text-bright transition-colors duration-150'

// ── Helpers ────────────────────────────────────────────────────────────────

interface TopLink {
  to: string
  label: string
  external?: boolean
  tourId?: string
}

export function TopNav() {
  const navigate = useNavigate()
  const location = useLocation()
  const logsVisible = useSettingsStore((s) => s.logsVisible)

  // Cloud sync state
  const [isSyncing, setIsSyncing] = useState(false)

  // Functional icon row state (each onClick does something real).
  const supportChatOpen = useSupportChatStore((s) => s.open)
  const toggleSupportChat = useSupportChatStore((s) => s.toggle)
  const steamError = useSteamErrorStore((s) => s.error)
  const setSteamErrorOpen = useSteamErrorStore((s) => s.setOpen)

  const handleBack = () => {
    if (window.history.length <= 1) {
      navigate('/library', { replace: true })
    } else {
      navigate(-1)
    }
  }

  const handleForward = () => {
    // Step forward in browser history. Silent no-op when there's nothing
    // forward (e.g. user never went back). HashRouter pushes real history
    // entries, so window.history.forward() works as expected.
    window.history.forward()
  }

  // Top thin strip: small utility text links
  // (Discord opens externally; the other two are in-app NavLinks)
  const topLinks: TopLink[] = [
    { to: 'https://discord.gg/87baAzAKme', label: 'Discord', external: true },
    { to: '/online-fix', label: 'Online Fix', tourId: 'onlinefix' },
    { to: '/drm-remover', label: 'DRM Remover', tourId: 'drmremover' },
    ...(logsVisible ? [{ to: '/logs', label: 'Logs', tourId: 'logs' }] : []),
  ]

  // Main bar: 3 primary section tabs (Downloads dropped per request)
  const tabs = [
    { to: '/store', label: t('store.title'), icon: ShoppingBag, tourId: 'store' },
    { to: '/library', label: t('nav.library'), icon: Library, tourId: 'library' },
    { to: '/remote-play', label: t('nav.remotePlay'), icon: Gamepad2 },
  ]

  const isOnLibrary = location.pathname.startsWith('/library')

  /** ⭐ Open library (favorites filter happens there). */
  const handleOpenLibrary = () => {
    if (!isOnLibrary) navigate('/library')
  }

  /** 💬 Open / close the AI support chat. */
  const handleOpenChat = () => toggleSupportChat()

  /**
   * 🔔 Open the Steam errors modal. Disabled when there is no error to show
   * — the badge "1" is the only difference between idle and "there's an error
   * you haven't seen yet". The modal's own "Más tarde" / "Reiniciar Steam"
   * buttons handle the dismiss flow (useSteamErrorStore.close()).
   */
  const handleOpenErrors = () => {
    if (steamError) setSteamErrorOpen(true)
  }

  /**
   * ☁️ Sync library with cloud — IPC call with toast feedback
   */
  const handleCloudSync = async () => {
    if (isSyncing) return

    setIsSyncing(true)
    try {
      const result = await (window as any).ipcRenderer?.invoke?.('cloud:sync-library')

      if (result?.success) {
        // Show success toast
        const message = result.message || 'Librería sincronizada correctamente'
        console.log(`[Cloud Sync] ${message}`)
        // Toast would be called here if notification system is available
        // e.g., toast.success(message)
      } else {
        const error = result?.error || 'Error al sincronizar'
        console.error(`[Cloud Sync] ${error}`)
        // e.g., toast.error(error)
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Error desconocido'
      console.error(`[Cloud Sync] ${errorMsg}`)
      // e.g., toast.error(`Error al sincronizar: ${errorMsg}`)
    } finally {
      setIsSyncing(false)
    }
  }

  return (
    <div
      className="titlebar-drag flex flex-col select-none relative z-[1]"
      style={{ WebkitAppRegion: 'drag' } as any}
    >
      {/* ──────── ROW 1 — Steam-style top thin strip ──────── */}
      <div
        className="flex items-center h-[32px] px-3 gap-3 flex-shrink-0"
        style={{
          background: 'var(--bg-primary)',
        }}
      >
        {/* Left: tiny logo + brand + small links */}
        <div
          className="flex items-center gap-3"
          style={{ WebkitAppRegion: 'no-drag' } as any}
        >
          <Logo size={16} className="text-[var(--accent)]" />
          <span className="text-[11px] font-bold uppercase tracking-wider text-text-bright select-none">
            Y-Core
          </span>

          {topLinks.map((link) =>
            link.external ? (
              <button
                key={link.label}
                onClick={() => window.steamtools?.openExternal?.(link.to)}
                className={`${topLinkBase} ${topLinkInactiveCls}`}
                title={`Abrir ${link.label} en el navegador`}
              >
                {link.label}
              </button>
            ) : (
              <NavLink
                key={link.to}
                to={link.to}
                data-tour={link.tourId}
                className={({ isActive }) =>
                  isActive
                    ? `${topLinkBase} ${topLinkActiveCls}`
                    : `${topLinkBase} ${topLinkInactiveCls}`
                }
              >
                {link.label}
              </NavLink>
            ),
          )}
        </div>

        {/* Right: small icon row + window controls */}
        <div
          className="ml-auto flex items-center gap-0.5"
          style={{ WebkitAppRegion: 'no-drag' } as any}
        >
          {/* ⭐ Favoritos — quick-jump to /library (filter chip is there) */}
          <button
            className={`${iconBtnBase} ${
              isOnLibrary ? 'text-[var(--accent)]' : ''
            }`}
            onClick={handleOpenLibrary}
            title="Favoritos"
            aria-label="Open favorites"
          >
            <Star className="w-[14px] h-[14px]" strokeWidth={2.2} />
          </button>

          {/* 💬 Chat IA */}
          <button
            className={`${iconBtnBase} ${
              supportChatOpen ? 'text-[var(--accent)]' : ''
            }`}
            onClick={handleOpenChat}
            title="Chat con IA"
            aria-label="Open AI chat"
          >
            <MessageCircle className="w-[14px] h-[14px]" strokeWidth={2.2} />
          </button>

          {/* ☁️ Cloud Sync — sync library to cloud */}
          <button
            className={`${iconBtnBase} ${isSyncing ? 'text-[var(--accent)] animate-spin' : ''}`}
            onClick={handleCloudSync}
            disabled={isSyncing}
            title={isSyncing ? 'Sincronizando...' : 'Sincronizar librería'}
            aria-label="Sync library to cloud"
          >
            <Cloud
              className={`w-[14px] h-[14px] ${isSyncing ? 'animate-spin' : ''}`}
              strokeWidth={2.2}
            />
          </button>

          {/* 🔔 Steam errors — opens the modal the App already mounts */}
          <button
            className={`${iconBtnBase} ${steamError ? 'text-[var(--red)]' : ''} ${
              !steamError ? 'opacity-50 cursor-not-allowed' : ''
            }`}
            onClick={handleOpenErrors}
            disabled={!steamError}
            title={
              steamError
                ? `${steamError.type}: ${steamError.message}`
                : 'Sin notificaciones'
            }
            aria-label="Open notifications"
          >
            <Bell className="w-[14px] h-[14px]" strokeWidth={2.2} />
            {steamError && (
              <span
                className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[14px] h-[14px] rounded-full text-[9px] font-bold text-white px-1"
                style={{ background: 'var(--red)' }}
              >
                1
              </span>
            )}
          </button>

          {/* Window controls */}
          <button
            onClick={() => window.steamtools?.windowMinimize?.()}
            className="w-9 h-7 flex items-center justify-center text-text-dim hover:bg-white/[0.07] hover:text-white transition-colors duration-150 rounded-md"
            title="Minimize"
            aria-label="Minimize window"
          >
            <Minus className="w-[13px] h-[13px]" strokeWidth={2.2} />
          </button>
          <button
            onClick={() => window.steamtools?.windowMaximize?.()}
            className="w-9 h-7 flex items-center justify-center text-text-dim hover:bg-white/[0.07] hover:text-white transition-colors duration-150 rounded-md"
            title="Maximize"
            aria-label="Maximize window"
          >
            <Maximize2 className="w-[13px] h-[13px]" strokeWidth={2.2} />
          </button>
          <button
            onClick={() => window.steamtools?.windowClose?.()}
            className="w-9 h-7 flex items-center justify-center text-text-dim hover:bg-[var(--red)] hover:text-white transition-colors duration-150 rounded-md"
            title="Close"
            aria-label="Close window"
          >
            <X className="w-[13px] h-[13px]" strokeWidth={2.2} />
          </button>
        </div>
      </div>

      {/* ──────── ROW 2 — Steam-style main bar with primary tabs ──────── */}
      <div
        className="flex items-stretch h-[56px] flex-shrink-0"
        style={{
          background: 'var(--bg-primary)',
        }}
      >
        {/* Left: back + forward */}
        <div
          className="flex items-center pl-3 pr-2"
          style={{ WebkitAppRegion: 'no-drag' } as any}
        >
          <button
            onClick={handleBack}
            className="flex items-center justify-center w-9 h-9 rounded-lg text-text-dim hover:bg-white/[0.07] hover:text-text-bright transition-all duration-150"
            title="Back"
            aria-label="Navigate back"
          >
            <ArrowLeft className="w-[18px] h-[18px]" strokeWidth={2.5} />
          </button>
          <button
            onClick={handleForward}
            className="flex items-center justify-center w-9 h-9 rounded-lg text-text-dim hover:bg-white/[0.07] hover:text-text-bright transition-all duration-150"
            title="Forward"
            aria-label="Navigate forward"
          >
            <ArrowRight className="w-[18px] h-[18px]" strokeWidth={2.5} />
          </button>
        </div>

        {/* Center: 3 primary tabs */}
        <nav
          className="flex items-stretch flex-1 min-w-0"
          style={{ WebkitAppRegion: 'no-drag' } as any}
        >
          {tabs.map(({ to, label, icon: Icon, tourId }) => (
            <NavLink
              key={to}
              to={to}
              data-tour={tourId}
              className={({ isActive }) =>
                isActive
                  ? `${tabBase} ${tabActiveCls}`
                  : `${tabBase} ${tabInactiveCls}`
              }
              style={({ isActive }) =>
                isActive
                  ? {
                      background: 'transparent',
                      boxShadow: 'inset 0 -2px 0 var(--accent)',
                    }
                  : { background: 'transparent', boxShadow: 'none' }
              }
            >
              <Icon className="w-[18px] h-[18px] flex-shrink-0" strokeWidth={2.2} />
              <span className="leading-none">{label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Right: settings */}
        <div
          className="flex items-center gap-2 pr-3"
          style={{ WebkitAppRegion: 'no-drag' } as any}
        >
          <NavLink
            to="/settings"
            data-tour="settings"
            className={({ isActive }) =>
              `flex items-center justify-center w-9 h-9 rounded-lg transition-all duration-150 ${
                isActive
                  ? 'text-text-bright bg-white/[0.06]'
                  : 'text-text-dim hover:bg-white/[0.07] hover:text-text-bright'
              }`
            }
            title="Settings"
            aria-label="Settings"
          >
            <SettingsIcon className="w-[17px] h-[17px]" strokeWidth={2.2} />
          </NavLink>
        </div>
      </div>
    </div>
  )
}
