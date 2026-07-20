import { useState, useEffect } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { RefreshCw, ShieldCheck, ShieldAlert, MessageCircle } from 'lucide-react'
import {
  Library20Regular,
  AddCircle20Regular,
  BuildingShop20Regular,
  Games20Regular,
  Settings20Regular,
  DocumentText20Regular,
  Wifi120Regular,
  ShieldDismiss20Regular,
} from '@fluentui/react-icons'
import { useLibraryStore } from '../../stores/useLibraryStore'
import { useSteamStore } from '../../stores/useSteamStore'
import { useToastStore } from '../../stores/useToastStore'

import { useSettingsStore } from '../../stores/useSettingsStore'
import { useDownloadQueueStore } from '../../stores/useDownloadQueueStore'
import { useSupportChatStore } from '../../stores/useSupportChatStore'
import { t } from '../../lib/i18n'
import { isGameFullyDownloaded, getDownloadProgress, getCoverUrl, getCoverFallbackUrls } from '../../domain/utils'
import { CoverImage } from '../../components/ui/CoverImage'

interface NavItemProps {
  to: string
  icon: React.ComponentType<{ className?: string }>
  label: string
  tourId?: string
}

function NavItem({ to, icon: Icon, label, tourId }: NavItemProps) {
  return (
    <NavLink
      to={to}
      title={label}
      data-tour={tourId}
      className={({ isActive }) =>
        `flex items-center gap-3 h-11 px-3.5 rounded-xl text-sm font-medium transition-all duration-200 group ${
          isActive
            ? 'bg-white/[0.08] text-text-bright shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]'
            : 'text-text-secondary hover:text-text-bright hover:bg-white/[0.04]'
        }`
      }
    >
      <Icon className="w-6 h-6 flex-shrink-0" />
      <span className="font-medium">{label}</span>
    </NavLink>
  )
}

function StoreNavItem() {
  const queueLength = useDownloadQueueStore((s) => s.queue.length)
  const current = useDownloadQueueStore((s) => s.current)
  const totalPending = queueLength + (current ? 1 : 0)
  return (
    <NavLink
      to="/store"
      title={t('store.title')}
      data-tour="store"
      className={({ isActive }) =>
        `flex items-center gap-3 h-11 px-3.5 rounded-xl text-sm font-medium transition-all duration-200 group ${
          isActive
            ? 'bg-white/[0.08] text-text-bright shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]'
            : 'text-text-secondary hover:text-text-bright hover:bg-white/[0.04]'
        }`
      }
    >
      <BuildingShop20Regular className="w-6 h-6 flex-shrink-0" />
      <span className="font-medium flex-1">{t('store.title')}</span>
      {totalPending > 0 && (
        <span className="flex-shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-accent/80 text-white">
          {totalPending}
        </span>
      )}
    </NavLink>
  )
}

export function EpicSidebar() {
  const { games, loadGames } = useLibraryStore()
  const { restartSteam, verifySteam } = useSteamStore()
  const { showToast } = useToastStore()

  const { logsVisible, showAddGame, customization } = useSettingsStore()
  const toggleSupportChat = useSupportChatStore((s) => s.toggle)
  const location = useLocation()
  const [coverErrors, setCoverErrors] = useState<Set<string>>(new Set())
  const [verificationStatus, setVerificationStatus] = useState<{ installed: boolean; missing: string[] } | null>(null)

  const handleRestartSteam = async () => {
    showToast('info', t('library.restarting'))
    const result = await restartSteam()
    if (result.success) {
      showToast('success', t('library.steamRestarted'))
    } else {
      showToast('error', result.error || t('common.failed'))
    }
  }

  const handleVerifySteam = async () => {
    showToast('info', t('library.verifying'))
    const result = await verifySteam()
    if (result.success) {
      showToast('success', t('library.verified'))
      const status = await window.steamtools?.checkVerification?.()
      if (status) setVerificationStatus(status)
    } else {
      showToast('error', result.error || t('common.failed'))
    }
  }

  useEffect(() => {
    const checkStatus = async () => {
      try {
        if (!window.steamtools?.checkVerification) {
          console.warn('[EpicSidebar] checkVerification not available on steamtools')
          return
        }
        const status = await window.steamtools.checkVerification()
        // Logger output removed for release
        if (status) setVerificationStatus(status)
      } catch (err) {
        console.error('[EpicSidebar] checkVerification error:', err)
      }
    }
    const timer = setTimeout(checkStatus, 500)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (games.length === 0) loadGames()
  }, [games.length, loadGames])

  const quickGames = games.slice(0, 5)

  // Build dynamic nav items from customization config
  const NAV_ITEM_MAP: Record<string, { to: string; icon: React.ComponentType<{ className?: string }>; label: string; conditional?: boolean }> = {
    library: { to: '/', icon: Library20Regular, label: t('library.title') },
    store: { to: '/store', icon: BuildingShop20Regular, label: t('store.title') },
    onlinefix: { to: '/online-fix', icon: Wifi120Regular, label: t('nav.onlinefix') },
    drmremover: { to: '/drm-remover', icon: ShieldDismiss20Regular, label: t('nav.drmRemover') },
    addgame: { to: '/add-game', icon: AddCircle20Regular, label: t('nav.addGame'), conditional: showAddGame },
    logs: { to: '/logs', icon: DocumentText20Regular, label: t('nav.logs'), conditional: logsVisible },
    settings: { to: '/settings', icon: Settings20Regular, label: t('nav.settings') },
  }
  const sortedNavItems = [...customization.navItems].sort((a, b) => a.order - b.order)
  const visibleNavItems = sortedNavItems.filter((item) => {
    if (!item.visible) return false
    const config = NAV_ITEM_MAP[item.id]
    if (!config) return false
    if (config.conditional === false) return false
    return true
  })

  const isLibrary = location.pathname === '/'

  return (
    <aside
      data-section="Sidebar"
      className="flex flex-col flex-shrink-0 h-full w-[260px] select-none backdrop-blur-xl border-r border-white/[0.04]"
      style={{ backgroundColor: `rgba(15, 15, 20, var(--sidebar-opacity, 0.85))` }}
    >
      {/* Main nav */}
      <nav className="flex-1 p-5 space-y-2 overflow-y-auto">
        {/* Dynamic nav items */}
        <div className="space-y-1">
          <p className="px-3 text-[10px] font-semibold uppercase tracking-wider text-text-bright">Y-core</p>
          {visibleNavItems.filter((item) => item.id !== 'settings').map((item) => {
            const config = NAV_ITEM_MAP[item.id]
            if (!config) return null
            if (item.id === 'store') {
              return <StoreNavItem key={item.id} />
            }
            return <NavItem key={item.id} to={config.to} icon={config.icon} label={config.label} tourId={item.id} />
          })}
        </div>

        {/* Quick launch section */}
        {isLibrary && quickGames.length > 0 && (
          <div className="pt-1">
            <p className="px-3 text-[10px] font-semibold uppercase tracking-wider mb-2 text-text-muted">{t('nav.quickLaunch')}</p>
            <div className="space-y-2">
              {quickGames.map((game) => {
                const downloaded = isGameFullyDownloaded(game)
                return (
                  <NavLink
                    key={game.appId}
                    to="/"
                    className="flex items-center gap-2.5 py-2 px-3 rounded-[var(--radius-md)] transition-all duration-200 group text-text-secondary hover:text-white hover:bg-white/[0.04] hover:translate-x-0.5 hover:scale-[1.02]"
                    onClick={(e) => { e.preventDefault(); window.steamtools.launchGame(game.appId) }}
                  >
                    <div className="w-10 h-10 rounded-[var(--radius-sm)] overflow-hidden flex-shrink-0 bg-surface-2 ring-1 ring-white/5 group-hover:ring-accent/50 transition-all duration-200 group-hover:scale-105">
                      {coverErrors.has(game.appId) || !game.appId ? (
                        <div className="w-full h-full flex items-center justify-center">
                          <Games20Regular className="w-5 h-5 text-text-muted" />
                        </div>
                      ) : (
                        <CoverImage
                          src={getCoverUrl(game.appId)}
                          fallbackSrc={`https://cdn.cloudflare.steamstatic.com/steam/apps/${game.appId}/header.jpg`}
                          fallbackSrcs={getCoverFallbackUrls(game.appId)}
                          alt={game.name}
                          className="w-full h-full object-cover"
                          onError={() => setCoverErrors((prev) => new Set(prev).add(game.appId))}
                          showSkeleton={false}
                        />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium truncate">{game.name || `App ${game.appId}`}</p>
                    </div>
                    {!downloaded && (
                      <span className="text-[10px] font-mono text-accent">{getDownloadProgress(game)}%</span>
                    )}
                  </NavLink>
                )
              })}
            </div>
          </div>
        )}
      </nav>

      {/* Bottom actions */}
      <div className="p-5 border-t border-white/[0.08] space-y-1">
        {visibleNavItems.find((item) => item.id === 'settings') && (
          <NavItem to="/settings" icon={Settings20Regular} label={t('nav.settings')} tourId="settings" />
        )}

        {/* Discord CTA */}
        <button
          onClick={() => {
            const url = 'https://discord.gg/87baAzAKme'
            if (window.steamtools?.openExternal) {
              window.steamtools.openExternal(url)
            } else {
              window.open(url, '_blank')
            }
          }}
          className="group relative w-full p-3 rounded-2xl backdrop-blur-xl border-2 border-[#3BB2F7]/30 bg-gradient-to-br from-[#3BB2F7]/40 via-black/60 to-black/80 shadow-2xl hover:shadow-[#3BB2F7]/30 hover:shadow-2xl hover:scale-[1.02] hover:-translate-y-0.5 active:scale-95 transition-all duration-500 ease-out cursor-pointer hover:border-[#3BB2F7]/60 overflow-hidden mt-2"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#3BB2F7]/30 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-out" />
          <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-[#3BB2F7]/10 via-[#3BB2F7]/20 to-[#3BB2F7]/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <div className="relative z-10 flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-gradient-to-br from-[#3BB2F7]/30 to-[#3BB2F7]/10 backdrop-blur-sm group-hover:from-[#3BB2F7]/40 group-hover:to-[#3BB2F7]/20 transition-all duration-300">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 640 512"
                className="w-6 h-6 fill-current text-[#3BB2F7] group-hover:text-[#5BC3FF] transition-all duration-300 group-hover:scale-110 drop-shadow-lg"
              >
                <path d="M524.531 69.836a1.5 1.5 0 0 0-.764-.7A485.065 485.065 0 0 0 404.081 32.03a1.816 1.816 0 0 0-1.923.91 337.461 337.461 0 0 0-14.9 30.6 447.848 447.848 0 0 0-134.426 0 309.541 309.541 0 0 0-15.135-30.6 1.89 1.89 0 0 0-1.924-.91 483.689 483.689 0 0 0-119.688 37.107 1.712 1.712 0 0 0-.788.676C39.068 183.651 18.186 294.69 28.43 404.354a2.016 2.016 0 0 0 .765 1.375 487.666 487.666 0 0 0 146.825 74.189 1.9 1.9 0 0 0 2.063-.676A348.2 348.2 0 0 0 208.12 430.4a1.86 1.86 0 0 0-1.019-2.588 321.173 321.173 0 0 1-45.868-21.853 1.885 1.885 0 0 1-.185-3.126 251.047 251.047 0 0 0 9.109-7.137 1.819 1.819 0 0 1 1.9-.256c96.229 43.917 200.41 43.917 295.5 0a1.812 1.812 0 0 1 1.924.233 234.533 234.533 0 0 0 9.132 7.16 1.884 1.884 0 0 1-.162 3.126 301.407 301.407 0 0 1-45.89 21.83 1.875 1.875 0 0 0-1 2.611 391.055 391.055 0 0 0 30.014 48.815 1.864 1.864 0 0 0 2.063.7A486.048 486.048 0 0 0 610.7 405.729a1.882 1.882 0 0 0 .765-1.352c12.264-126.783-20.532-236.912-86.934-334.541zM222.491 337.58c-28.972 0-52.844-26.587-52.844-59.239s23.409-59.241 52.844-59.241c29.665 0 53.306 26.82 52.843 59.239 0 32.654-23.41 59.241-52.843 59.241zm195.38 0c-28.971 0-52.843-26.587-52.843-59.239s23.409-59.241 52.843-59.241c29.667 0 53.307 26.820 52.844 59.239 0 32.654-23.177 59.241-52.844 59.241z" />
              </svg>
            </div>
            <div className="flex-1 text-left">
              <p className="text-[#3BB2F7] font-bold text-sm group-hover:text-[#5BC3FF] transition-colors duration-300 drop-shadow-sm">
                Discord
              </p>
              <p className="text-[#3BB2F7]/60 text-xs group-hover:text-[#3BB2F7]/80 transition-colors duration-300">
                Join community
              </p>
            </div>
            <div className="opacity-40 group-hover:opacity-100 group-hover:translate-x-1 transition-all duration-300">
              <svg
                viewBox="0 0 24 24"
                stroke="currentColor"
                fill="none"
                className="w-4 h-4 text-[#3BB2F7]"
              >
                <path
                  d="M9 5l7 7-7 7"
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              </svg>
            </div>
          </div>
        </button>

        <button
          onClick={handleRestartSteam}
          title={t('library.restartSteam')}
          className="flex items-center gap-3 w-full h-11 px-3.5 rounded-xl text-sm font-medium text-text-secondary hover:text-text-bright hover:bg-white/[0.08] transition-all duration-200"
        >
          <RefreshCw className="w-5 h-5 flex-shrink-0" />
          <span className="font-medium">{t('library.restartSteam')}</span>
        </button>

        <button
          onClick={handleVerifySteam}
          title={t('library.verifySteam')}
          className={`flex items-center gap-3 w-full h-11 px-3.5 rounded-xl text-sm font-medium transition-all duration-200 ${
            verificationStatus?.installed
              ? 'text-green-400 hover:bg-green-500/10'
              : 'text-yellow-400 hover:bg-yellow-500/10'
          }`}
        >
          {verificationStatus?.installed ? (
            <ShieldCheck className="w-5 h-5 flex-shrink-0" />
          ) : (
            <ShieldAlert className="w-5 h-5 flex-shrink-0" />
          )}
          <span className="font-medium">
            {verificationStatus?.installed ? t('library.verified') : t('library.verifySteam')}
          </span>
        </button>

        <button
          onClick={toggleSupportChat}
          title={t('support.title')}
          className="flex items-center gap-3 w-full h-11 px-3.5 rounded-xl text-sm font-medium text-text-secondary hover:text-text-bright hover:bg-white/[0.08] transition-all duration-200"
        >
          <MessageCircle className="w-5 h-5 flex-shrink-0" />
          <span className="font-medium">{t('support.title')}</span>
        </button>
      </div>
    </aside>
  )
}
