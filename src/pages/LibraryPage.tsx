import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import {
  Gamepad2,
  Play,
  ArrowUp,
  Search,
  Package,
  CheckCircle,
  ArrowDownAZ,
  ArrowUpZA,
  Calendar,
  Clock3,
  HardDrive as SizeIcon,
  Trash2,
  Loader2,
  FolderOpen,
  Wrench,
  Wifi,
} from 'lucide-react'
import { t } from '../lib/i18n'
import { useLibraryStore, useFilteredLibraryGames } from '../stores/useLibraryStore'
import { useToastStore } from '../stores/useToastStore'
import { usePageHeader } from '../components/layout/AppShell'
import { getCoverUrl } from '../domain/utils'
import { CoverImage } from '../components/ui/CoverImage'
import { Card3D } from '../components/ui/Card3D'
import { ConfirmModal } from '../components/ui/ConfirmModal'

export default function LibraryPage() {
  const { searchQuery, sortBy, loadGames, setSearchQuery, setSortBy, loading, error } = useLibraryStore()
  const allFiltered = useFilteredLibraryGames()
  const { showToast } = useToastStore()
  const [coverErrors, setCoverErrors] = useState<Set<string>>(new Set())
  const [showScrollTop, setShowScrollTop] = useState(false)
  const [showSortDropdown, setShowSortDropdown] = useState(false)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; game: InstalledGame } | null>(null)
  const [hoveredCard, setHoveredCard] = useState(-1)
  const [confirmDialog, setConfirmDialog] = useState<{ title: string; message: string; onConfirm: () => void; variant?: 'danger' | 'warning'; confirmLabel?: string; cancelLabel?: string } | null>(null)
  const sortDropdownRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    loadGames()
  }, [loadGames])

  useEffect(() => {
    const main = document.querySelector('main')
    if (!main) return
    const onScroll = () => setShowScrollTop(main.scrollTop > 400)
    main.addEventListener('scroll', onScroll)
    return () => main.removeEventListener('scroll', onScroll)
  }, [])

  const scrollToTop = () => {
    const main = document.querySelector('main')
    if (main) main.scrollTo({ top: 0, behavior: 'smooth' })
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (!showSortDropdown) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowSortDropdown(false) }
    const onClick = (e: MouseEvent) => {
      if (!sortDropdownRef.current?.contains(e.target as Node)) setShowSortDropdown(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onClick)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onClick)
    }
  }, [showSortDropdown])

  useEffect(() => {
    if (!contextMenu) return
    const close = () => setContextMenu(null)
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', close)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', close)
    }
  }, [contextMenu])

  const sortOptions = [
    { key: 'nameAsc', label: 'A - Z', icon: ArrowDownAZ },
    { key: 'nameDesc', label: 'Z - A', icon: ArrowUpZA },
    { key: 'recentlyPlayed', label: t('library.recentlyPlayed'), icon: Clock3 },
    { key: 'recentlyInstalled', label: t('library.recentlyInstalled'), icon: Calendar },
    { key: 'largest', label: t('library.largest'), icon: SizeIcon },
  ] as const

  usePageHeader(
    <div className="flex items-center w-full h-11">
      <div className="flex items-center gap-3 h-full flex-shrink-0">
          <h1 className="text-xl font-bold text-text-bright leading-none">{t('library.title')}</h1>
        <span
          className="flex-shrink-0 text-xs font-semibold px-[11px] py-[5px] rounded-full"
          style={{ color: '#3BB2F7', background: 'rgba(59,178,247,0.12)', border: '1px solid rgba(59,178,247,0.25)' }}
        >
          {allFiltered.length} {t('library.games')}
        </span>
      </div>

      <div className="flex-1 flex items-center justify-center h-full">
        <div className="group flex items-center h-full relative w-64">
          <div className="absolute left-0 top-0 bottom-0 w-10 flex items-center justify-center pointer-events-none z-10">
            <Search className="w-[18px] h-[18px] text-text-secondary transition-colors group-focus-within:text-text-bright" />
          </div>
          <input
            ref={searchRef}
            type="search"
            placeholder={t('library.searchGames')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-full pl-10 pr-4 rounded-lg bg-white/[0.06] border border-white/[0.08] outline-none text-sm text-text-bright placeholder:text-text-secondary transition-all hover:bg-white/[0.10] focus:bg-white/[0.10] focus:border-white/[0.16]"
          />
        </div>
      </div>

      <div className="flex items-center gap-3 h-full flex-shrink-0">
        <div className="relative z-[100] h-full" ref={sortDropdownRef}>
          <button
            onClick={() => setShowSortDropdown((v) => !v)}
            className="flex items-center gap-2 h-full px-4 rounded-lg bg-white/[0.06] border border-white/[0.08] text-sm font-semibold text-text-bright hover:bg-white/[0.10] transition-colors"
          >
            <span className="text-text-secondary font-medium">{t('library.sortBy')}:</span>
            <span>{sortOptions.find((o) => o.key === sortBy)?.label}</span>
            <span
              className="text-base text-text-secondary transition-transform duration-300 leading-none"
              style={{ transform: showSortDropdown ? 'rotate(180deg)' : 'rotate(0deg)' }}
            >
              ▼
            </span>
          </button>
          {showSortDropdown && (
            <div className="absolute right-0 top-full mt-2 w-60 rounded-xl bg-surface-1 border border-white/[0.10] shadow-2xl overflow-hidden z-[200]">
              <div className="py-1.5">
                {sortOptions.map((opt) => {
                  const active = sortBy === opt.key
                  const Icon = opt.icon
                  return (
                    <button
                      key={opt.key}
                      onClick={() => {
                        setSortBy(opt.key)
                        setShowSortDropdown(false)
                      }}
                      className={`flex items-center gap-3 w-full px-4 py-3 text-sm font-medium transition-colors ${
                        active ? 'bg-white/[0.08] text-accent' : 'text-text-secondary hover:text-text-bright hover:bg-white/[0.05]'
                      }`}
                    >
                      <Icon className="w-5 h-5" />
                      {opt.label}
                      {active && <CheckCircle className="w-4 h-4 ml-auto" />}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    [sortBy, showSortDropdown, searchQuery]
  )

  const handleLaunchGame = async (appId: string) => {
    const result = await window.steamtools.launchGame(appId)
    if (result.success) {
      showToast('success', t('library.launching'))
    } else {
      showToast('error', result.error || t('library.launchFailed'))
    }
  }

  const handleDeleteGame = async (game: InstalledGame) => {
    setConfirmDialog({
      title: `¿Desinstalar ${game.name || 'este juego'}?`,
      message: 'Se eliminarán los archivos del juego de tu equipo. Tus partidas guardadas en la nube no se borrarán.',
      variant: 'danger',
      confirmLabel: 'Desinstalar',
      onConfirm: async () => {
        const result = await window.steamtools.deleteGame(game.appId, game.installDir)
        if (result.success) {
          showToast('success', t('library.gameRemoved'))
          await loadGames()
        } else {
          showToast('error', result.error || t('library.failedRemove'))
        }
      },
    })
  }

  const handleOpenLocation = async (game: InstalledGame) => {
    const result = await window.steamtools.openGameLocation(game.appId, game.installDir)
    if (!result.success) {
      showToast('error', result.error || t('library.openFailed'))
    }
  }

  const handleVerifyGame = async (game: InstalledGame) => {
    const result = await window.steamtools.verifyGame(game.appId)
    if (result.success) {
      showToast('info', t('library.verifyStart'))
    } else {
      showToast('error', result.error || t('library.verifyFailed'))
    }
  }

  const handleToggleOnlineFix = async (game: InstalledGame) => {
    const status = await window.steamtools.checkOnlineFixStatus(game.appId)
    if (status.enabled) {
      const result = await window.steamtools.disableOnlineFix(game.appId)
      if (result.success) {
        showToast('success', `${t('onlinefix.disabledSuccess')} ${game.name || t('library.unknown')}`)
      } else {
        showToast('error', result.error || t('onlinefix.disableFailed'))
      }
    } else {
      const result = await window.steamtools.enableOnlineFix(game.appId)
      if (result.success) {
        showToast('success', `${t('onlinefix.enabledSuccess')} ${game.name || t('library.unknown')}`)
      } else {
        showToast('error', result.error || t('onlinefix.enableFailed'))
      }
    }
  }

  const handleContextMenu = (e: React.MouseEvent, game: InstalledGame) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, game })
  }

  const onCoverError = (appId: string) => {
    setCoverErrors((prev) => new Set(prev).add(appId))
  }

  const GAMES_PER_PAGE = 60
  const [visibleCount, setVisibleCount] = useState(GAMES_PER_PAGE)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const prevGamesLengthRef = useRef(0)

  const games = allFiltered

  // Reset visible count when filter/sort changes
  useEffect(() => {
    if (games.length !== prevGamesLengthRef.current) {
      prevGamesLengthRef.current = games.length
      setVisibleCount(GAMES_PER_PAGE)
    }
  }, [games.length])

  // Infinite scroll via IntersectionObserver
  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.length > 0 && entries[0].isIntersecting && visibleCount < games.length) {
          setVisibleCount((prev) => Math.min(prev + GAMES_PER_PAGE, games.length))
        }
      },
      { rootMargin: '400px' }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [visibleCount, games.length])

  const visibleGames = useMemo(() => games.slice(0, visibleCount), [games, visibleCount])

  return (
    <div data-section="Library" className="min-h-full overflow-y-auto animate-fade-in">
      <div className="px-6 py-6">
        {error ? (
          <div className="flex flex-col items-center justify-center py-20 text-text-dim">
            <Package className="w-16 h-16 mb-4 opacity-20 text-red-400" />
            <p className="text-sm text-red-400 mb-2">{error}</p>
            <button
              onClick={loadGames}
              className="mt-2 text-xs font-semibold px-4 py-2 rounded-xl bg-accent hover:bg-accent/80 text-white transition-all"
            >
              {t('errors.retry')}
            </button>
          </div>
        ) : loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-text-dim">
            <Loader2 className="w-8 h-8 mb-4 animate-spin text-accent" />
            <p className="text-sm">{t('library.loading')}</p>
          </div>
        ) : games.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-text-dim">
            <Gamepad2 className="w-16 h-16 mb-4 opacity-20" />
            <p className="text-sm">{allFiltered.length === 0 ? t('library.noGames') : t('library.noMatch')}</p>
          </div>
        ) : (
          <>
            {/* Recently played hero */}
            {(() => {
              const sortedByPlayed = [...games].sort((a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0))
              const lastPlayed = sortedByPlayed[0]
              if (!lastPlayed) return null
              const heroUrl = `https://cdn.akamai.steamstatic.com/steam/apps/${lastPlayed.appId}/library_hero.jpg`
              return (
                <section
                  className="relative w-full h-[260px] rounded-[18px] overflow-hidden mb-7 animate-fade-in"
                  style={{ border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 16px 48px rgba(0,0,0,0.45)' }}
                >
                  <img
                    src={heroUrl}
                    alt=""
                    className="absolute inset-0 w-full h-full object-cover"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                  />
                  <div className="absolute inset-0" style={{ background: 'linear-gradient(to right, rgba(9,9,11,0.9) 0%, rgba(9,9,11,0.5) 50%, transparent 80%)' }} />
                  <div className="absolute inset-0 flex flex-col justify-center px-9" style={{ maxWidth: '520px' }}>
                    <span className="text-[11px] font-bold tracking-[0.1em] uppercase mb-2" style={{ color: '#3BB2F7' }}>Jugado recientemente</span>
                    <h2 className="text-[30px] font-extrabold text-white tracking-[-0.02em] mb-2" style={{ textShadow: '0 4px 20px rgba(0,0,0,0.5)' }}>
                      {lastPlayed.name || `App ${lastPlayed.appId}`}
                    </h2>
                    <p className="text-sm text-text-secondary mb-[18px]">
                      Última sesión: {lastPlayed.lastPlayed ? new Date(lastPlayed.lastPlayed * 1000).toLocaleDateString() : '—'}{lastPlayed.playtime ? ` · ${Math.round(lastPlayed.playtime / 60)} h jugadas` : ''}
                    </p>
                    <div className="flex gap-3">
                      <button
                        onClick={() => handleLaunchGame(lastPlayed.appId)}
                        className="flex items-center gap-2.5 px-7 py-3.5 rounded-xl text-sm font-bold text-white border-none cursor-pointer transition-all hover:brightness-110 hover:-translate-y-px"
                        style={{ background: 'linear-gradient(135deg,#22c55e,#16a34a)', boxShadow: '0 8px 24px rgba(34,197,94,0.35)' }}
                      >
                        <Play className="w-[17px] h-[17px] fill-current" />
                        Jugar
                      </button>
                    </div>
                  </div>
                </section>
              )
            })()}

            {/* Section title */}
            <div className="flex items-center mb-4">
              <h2 className="text-[17px] font-bold text-white m-0">Todos los juegos</h2>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-4">
              {visibleGames.map((game, idx) => (
                <Card3D
                  key={game.appId}
                  className="group/card cursor-pointer"
                  onContextMenu={(e) => handleContextMenu(e, game)}
                >
                  <div
                    className="relative aspect-[2/3] overflow-hidden rounded-xl transition-all duration-300"
                    style={{
                      border: `1px solid ${hoveredCard === idx ? 'rgba(59,178,247,0.55)' : 'rgba(255,255,255,0.06)'}`,
                      boxShadow: hoveredCard === idx
                        ? '0 0 0 1px rgba(59,178,247,0.55), 0 0 26px rgba(59,178,247,0.3), 0 14px 40px rgba(0,0,0,0.5)'
                        : '0 8px 28px rgba(0,0,0,0.35)',
                      transform: hoveredCard === idx ? 'translateY(-4px)' : 'none',
                      animation: 'card-enter 0.4s ease-out both',
                      animationDelay: `${Math.min(idx, 8) * 0.05}s`,
                    }}
                    onMouseEnter={() => setHoveredCard(idx)}
                    onMouseLeave={() => setHoveredCard(-1)}
                  >
                    <div
                      className="w-full h-full transition-all duration-[400ms] ease-out"
                      style={{
                        transform: hoveredCard === idx ? 'scale(1.05)' : 'scale(1)',
                        filter: hoveredCard === idx ? 'brightness(0.55)' : 'brightness(1)',
                      }}
                    >
                      <CoverImage
                        src={getCoverUrl(game.appId)}
                        fallbackSrc={`https://depotbox.org/api/images/steam-header/${game.appId}`}
                        alt={game.name}
                        className="w-full h-full object-cover"
                      />
                    </div>

                    <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />

                    <div className="absolute bottom-0 left-0 right-0 p-3 pt-8 z-10">
                      <p className="text-sm font-bold text-white leading-tight line-clamp-2 drop-shadow-md">
                        {game.name || t('library.unknown')}
                      </p>
                    </div>

                    <div
                      className="absolute inset-0 z-20 flex items-center justify-center transition-opacity duration-300 ease-out"
                      style={{
                        background: 'rgba(9,9,11,0.35)',
                        backdropFilter: 'blur(4px)',
                        opacity: hoveredCard === idx ? 1 : 0,
                        pointerEvents: hoveredCard === idx ? 'auto' : 'none',
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        className="flex items-center gap-2 px-[22px] py-[11px] rounded-xl text-sm font-bold text-white border-none cursor-pointer transition-all hover:brightness-110"
                        onClick={(e) => { e.stopPropagation(); handleLaunchGame(game.appId) }}
                        style={{ background: 'linear-gradient(135deg,#22c55e,#16a34a)', boxShadow: '0 6px 20px rgba(34,197,94,0.4)' }}
                      >
                        <Play className="w-[15px] h-[15px] fill-current" />
                        Jugar
                      </button>
                    </div>
                  </div>
                </Card3D>
              ))}
            </div>
            {visibleCount < games.length && (
              <div ref={sentinelRef} className="flex items-center justify-center py-8 text-text-dim">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="ml-2 text-sm">{t('library.loadingMore')}</span>
              </div>
            )}
            {visibleCount >= games.length && games.length > GAMES_PER_PAGE && (
              <p className="text-center text-xs text-text-dim py-4">
          {allFiltered.length} {t('library.games')}
              </p>
            )}
          </>
        )}
      </div>

      <button
        onClick={scrollToTop}
        title={t('store.scrollToTop')}
        className={`fixed bottom-6 right-6 z-50 flex items-center justify-center w-12 h-12 rounded-full bg-accent text-white shadow-lg shadow-accent/30 hover:scale-105 transition-all duration-300 ${showScrollTop ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'}`}
      >
        <ArrowUp className="w-5 h-5" />
      </button>

      {contextMenu && (
        <div
          className="fixed z-[300] w-[220px] rounded-xl bg-surface-1 border border-white/[0.10] shadow-2xl overflow-hidden py-2"
          style={{
            left: Math.max(0, Math.min(contextMenu.x, window.innerWidth - 240)),
            top: Math.max(0, Math.min(contextMenu.y, window.innerHeight - 320)),
          }}
        >
          <div className="px-4 py-2 border-b border-white/[0.08]">
            <p className="text-xs font-semibold text-text-bright truncate">{contextMenu.game.name}</p>
            <p className="text-[10px] text-text-dim font-mono">AppID {contextMenu.game.appId}</p>
          </div>
          <div className="py-1">
            <button
              onClick={() => { handleLaunchGame(contextMenu.game.appId); setContextMenu(null) }}
              className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-text-secondary hover:text-text-bright hover:bg-white/[0.08] transition-colors"
            >
              <Play className="w-6 h-6" />
              {t('library.play')}
            </button>
            <button
              onClick={() => { handleOpenLocation(contextMenu.game); setContextMenu(null) }}
              className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-text-secondary hover:text-text-bright hover:bg-white/[0.08] transition-colors"
            >
              <FolderOpen className="w-6 h-6" />
              {t('library.files')}
            </button>
            <button
              onClick={() => { handleVerifyGame(contextMenu.game); setContextMenu(null) }}
              className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-text-secondary hover:text-text-bright hover:bg-white/[0.08] transition-colors"
            >
              <Wrench className="w-6 h-6" />
              {t('library.verify')}
            </button>
            <button
              onClick={() => { handleToggleOnlineFix(contextMenu.game); setContextMenu(null) }}
              className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-text-secondary hover:text-text-bright hover:bg-white/[0.08] transition-colors"
            >
              <Wifi className="w-6 h-6" />
              {t('nav.onlinefix')}
            </button>
          </div>
          <div className="border-t border-white/[0.08] py-1">
            <button
              onClick={() => { handleDeleteGame(contextMenu.game); setContextMenu(null) }}
              className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors"
            >
              <Trash2 className="w-6 h-6" />
              {t('library.deleteGame')}
            </button>
          </div>
        </div>
      )}

      {/* Confirm Modal */}
      {confirmDialog && (
        <ConfirmModal
          open={!!confirmDialog}
          onClose={() => setConfirmDialog(null)}
          onConfirm={confirmDialog.onConfirm}
          title={confirmDialog.title}
          message={confirmDialog.message}
          variant={confirmDialog.variant}
          confirmLabel={confirmDialog.confirmLabel}
          cancelLabel={confirmDialog.cancelLabel}
        />
      )}
    </div>
  )
}
