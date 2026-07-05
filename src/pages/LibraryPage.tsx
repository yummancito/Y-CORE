import { useState, useEffect, useRef } from 'react'
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

export default function LibraryPage() {
  const { searchQuery, sortBy, loadGames, setSearchQuery, setSortBy, loading } = useLibraryStore()
  const allFiltered = useFilteredLibraryGames()
  const { showToast } = useToastStore()
  const [coverErrors, setCoverErrors] = useState<Set<string>>(new Set())
  const [showScrollTop, setShowScrollTop] = useState(false)
  const [showSortDropdown, setShowSortDropdown] = useState(false)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; game: InstalledGame } | null>(null)
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
      <div className="flex items-center gap-4 h-full flex-shrink-0">
        <h1 className="text-xl font-bold text-text-bright leading-none">{t('library.title')}</h1>
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
      showToast('success', 'Launching game via Steam...')
    } else {
      showToast('error', result.error || 'Failed to launch')
    }
  }

  const handleDeleteGame = async (game: InstalledGame) => {
    const confirmed = window.confirm(t('library.deleteConfirm'))
    if (!confirmed) return
    const result = await window.steamtools.deleteGame(game.appId, game.installDir)
    if (result.success) {
      showToast('success', t('library.gameRemoved'))
      await loadGames()
    } else {
      showToast('error', result.error || t('library.failedRemove'))
    }
  }

  const handleOpenLocation = async (game: InstalledGame) => {
    const result = await window.steamtools.openGameLocation(game.appId, game.installDir)
    if (!result.success) {
      showToast('error', result.error || 'Failed to open location')
    }
  }

  const handleVerifyGame = async (game: InstalledGame) => {
    const result = await window.steamtools.verifyGame(game.appId)
    if (result.success) {
      showToast('info', 'Steam verification started')
    } else {
      showToast('error', result.error || 'Failed to verify game')
    }
  }

  const handleToggleOnlineFix = async (game: InstalledGame) => {
    const status = await window.steamtools.checkOnlineFixStatus(game.appId)
    if (status.enabled) {
      const result = await window.steamtools.disableOnlineFix(game.appId)
      if (result.success) {
        showToast('success', `${t('onlinefix.disabledSuccess')} ${game.name}`)
      } else {
        showToast('error', result.error || t('onlinefix.disableFailed'))
      }
    } else {
      const result = await window.steamtools.enableOnlineFix(game.appId)
      if (result.success) {
        showToast('success', `${t('onlinefix.enabledSuccess')} ${game.name}`)
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

  return (
    <div data-section="Library" className="min-h-full overflow-y-auto animate-fade-in">
      <div className="px-6 py-6">
        {(() => {
          if (loading) {
            return (
              <div className="flex flex-col items-center justify-center py-20 text-text-dim">
                <Loader2 className="w-8 h-8 mb-4 animate-spin text-accent" />
                <p className="text-sm">Cargando...</p>
              </div>
            )
          }
          const games = allFiltered
          if (games.length === 0) {
            return (
              <div className="flex flex-col items-center justify-center py-20 text-text-dim">
                <Gamepad2 className="w-16 h-16 mb-4 opacity-20" />
                <p className="text-sm">{allFiltered.length === 0 ? t('library.noGames') : t('library.noMatch')}</p>
              </div>
            )
          }
          return (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-4">
              {games.map((game) => (
                <Card3D
                  key={game.appId}
                  className="group/card cursor-pointer"
                  onContextMenu={(e) => handleContextMenu(e, game)}
                >
                  <div className="relative aspect-[2/3] overflow-hidden rounded-xl transition-all duration-300 shadow-card hover:shadow-card-hover">
                    {coverErrors.has(game.appId) || !game.appId ? (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-surface-2">
                        <Gamepad2 className="w-14 h-14 text-text-muted" />
                        <p className="text-xs text-text-muted text-center px-4">{game.name}</p>
                      </div>
                    ) : (
                      <CoverImage
                        src={getCoverUrl(game.appId)}
                        alt={game.name}
                        className="absolute inset-0 w-full h-full object-cover"
                        onError={() => onCoverError(game.appId)}
                      />
                    )}

                    <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />

                      <div className="absolute bottom-0 left-0 right-0 p-3 pt-8 z-10">
                        <p className="text-sm font-bold text-white leading-tight line-clamp-2 drop-shadow-md">
                          {game.name || t('library.unknown')}
                        </p>
                      </div>

                      <div
                        className="absolute inset-0 z-20 flex flex-col justify-end opacity-0 group-hover/card:opacity-100 transition-all duration-300 bg-gradient-to-t from-black/90 via-black/40 to-transparent pointer-events-none"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          className="pointer-events-auto flex items-center justify-center gap-2 mx-3 mb-2 px-5 py-2.5 rounded-xl text-sm font-bold text-black bg-accent hover:bg-accent-hover transition-all shadow-lg shadow-accent/25"
                          onClick={(e) => { e.stopPropagation(); handleLaunchGame(game.appId) }}
                        >
                          <Play className="w-6 h-6 fill-current" />
                          {t('library.play')}
                        </button>
                        <button
                          className="pointer-events-auto flex items-center justify-center gap-2 mx-3 mb-4 px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-red-500/80 hover:bg-red-500 transition-all shadow-lg shadow-red-500/20"
                          onClick={(e) => { e.stopPropagation(); handleDeleteGame(game) }}
                        >
                          <Trash2 className="w-6 h-6" />
                          {t('library.deleteGame')}
                        </button>
                      </div>
                  </div>
                </Card3D>
              ))}
            </div>
          )
        })()}
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
          style={{ left: contextMenu.x, top: contextMenu.y }}
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
    </div>
  )
}
