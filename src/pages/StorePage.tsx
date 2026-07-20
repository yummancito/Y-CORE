import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Search, Loader2, X, Package, ArrowUp,
  LayoutGrid, Star,
} from 'lucide-react'
import { t } from '../lib/i18n'
import { useToastStore } from '../stores/useToastStore'
import { useLibraryStore } from '../stores/useLibraryStore'
import { useDownloadQueueStore } from '../stores/useDownloadQueueStore'
import { usePageHeader } from '../components/layout/AppShell'
import {
  listGames, searchGamesCombined,
  type GameSummary,
} from '../lib/y-core-api'
import { CATEGORIES, type CategoryId, getPrimaryCategoryFromName } from '../lib/categories'
import { getLauncherInfo } from '../lib/onlinefix-compatibility'
import { useRecommendationStore } from '../stores/useRecommendationStore'
import { useSettingsStore } from '../stores/useSettingsStore'
import { GameCard, GameCardSkeleton, getDefaultGameImageUrl, type MergedGame } from '../components/store/GameCard'
import { ConfirmModal } from '../components/ui/ConfirmModal'
import { DonationModal } from '../components/ui/DonationModal'

type Tab = 'browse'

// Module-level cache that persists across component unmount/remount (navigation)
let _gamesCache: { games: MergedGame[]; timestamp: number; showAdult: boolean } | null = null
const GAMES_CACHE_TTL = 5 * 60 * 1000

function getPrimaryCategoryForGame(game: MergedGame): CategoryId | null {
  if (game.category) return game.category
  return getPrimaryCategoryFromName(game.name)
}

// The backend's is_tool/is_dlc flags aren't reliably set (e.g. /api/search omits
// is_tool entirely), so we also filter obvious non-game apps by name as a safety net.
const NON_GAME_NAME_PATTERN = /\b(dev\s?kit|devkit|playtest|dedicated server|server tool|sdk|mod\s?tool|editor|benchmark)\b/i

function isNonGameApp(name: string | undefined | null): boolean {
  if (!name) return false
  return NON_GAME_NAME_PATTERN.test(name)
}

function sortSearchResults(games: MergedGame[], query: string): MergedGame[] {
  const q = query.toLowerCase().trim()
  return [...games].sort((a, b) => {
    const aName = (a.name || '').toLowerCase().trim()
    const bName = (b.name || '').toLowerCase().trim()
    // Exact match scores highest
    if (aName === q && bName !== q) return -1
    if (bName === q && aName !== q) return 1
    // Starts with query
    const aStarts = aName.startsWith(q)
    const bStarts = bName.startsWith(q)
    if (aStarts && !bStarts) return -1
    if (bStarts && !aStarts) return 1
    // Word boundary match (e.g. "ark" in "Batman Arkham")
    const aWord = new RegExp(`\\b${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i').test(aName)
    const bWord = new RegExp(`\\b${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i').test(bName)
    if (aWord && !bWord) return -1
    if (bWord && !aWord) return 1
    // Shorter name = more relevant
    if (aName.length !== bName.length) return aName.length - bName.length
    return aName.localeCompare(bName)
  })
}

function gameSummaryToMerged(g: GameSummary): MergedGame {
  return {
    app_id: g.app_id,
    name: g.name,
    header_image_url: g.header_image_url || null,
    category: null,
    source: 'catalog',
    is_dlc: g.is_dlc,
    is_tool: g.is_tool,
  }
}

function filterByCategory(games: MergedGame[], categoryId: CategoryId): MergedGame[] {
  if (categoryId === 'all') return games
  return games.filter((g) => getPrimaryCategoryForGame(g) === categoryId)
}

// ---- Main Store Page ----
export default function StorePage() {
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('browse')
  const [query, setQuery] = useState('')
  const [searchResults, setSearchResults] = useState<MergedGame[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [allGames, setAllGames] = useState<MergedGame[]>([])
  const [browseFilter, setBrowseFilter] = useState<CategoryId>('all')
  const [browseLoading, setBrowseLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [showScrollTop, setShowScrollTop] = useState(false)
  const [hideInstalled, setHideInstalled] = useState(true)
  const [heroIndex, setHeroIndex] = useState(0)
  const [heroPaused, setHeroPaused] = useState(false)
  const heroTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [confirmDialog, setConfirmDialog] = useState<{ title: string; message: string; onConfirm: () => void; variant?: 'danger' | 'warning'; confirmLabel?: string; cancelLabel?: string } | null>(null)
  const [showDonation, setShowDonation] = useState(false)
  const pendingConfirmRef = useRef<{ resolve: (v: boolean) => void } | null>(null)
  const { showTools, showAdult, loadFromConfig: loadSettings } = useSettingsStore()

  // Load content settings from config
  useEffect(() => {
    loadSettings()
  }, [loadSettings])

  const { showToast } = useToastStore()
  const { games: installedGames } = useLibraryStore()
  const consumedAppIds = useRecommendationStore((s) => s.consumedAppIds)
  const currentInstall = useDownloadQueueStore((s) => s.current)
  const importProgress = useDownloadQueueStore((s) => s.importProgress)
  const installing = currentInstall?.appId ?? null
  const resetConsumed = useRecommendationStore((s) => s.resetConsumed)

  const installedAppIds = useMemo(() => {
    const set = new Set(installedGames.map((g) => g.appId))
    for (const id of consumedAppIds) set.add(id)
    return set
  }, [installedGames, consumedAppIds])

  useEffect(() => {
    resetConsumed()
  }, [resetConsumed])

  useEffect(() => {
    const main = document.querySelector('main')
    if (!main) return
    const onScroll = () => setShowScrollTop(main.scrollTop > 400)
    main.addEventListener('scroll', onScroll)
    return () => main.removeEventListener('scroll', onScroll)
  }, [])

  const dedupeByAppId = useCallback(<T extends { app_id: string }>(games: T[]): T[] => {
    const seen = new Set<string>()
    const out: T[] = []
    for (const g of games) {
      if (!seen.has(g.app_id)) {
        seen.add(g.app_id)
        out.push(g)
      }
    }
    return out
  }, [])

  const loadOffsetRef = useRef(0)
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const animStylesRef = useRef<Record<string, { animation: string; animationDelay: string }>>({})
  const loadingMoreRef = useRef(false)

  const filterGames = useCallback((raw: MergedGame[]): MergedGame[] => {
    return dedupeByAppId(raw)
      .filter((g) => g.app_id && /^\d+$/.test(g.app_id) && g.name && g.name.trim() !== '')
      .filter((g) => !installedAppIds.has(g.app_id))
      .filter((g) => !g.is_tool && !g.is_dlc && !isNonGameApp(g.name))
      .filter((g) => showAdult || getPrimaryCategoryForGame(g) !== 'nsfw')
  }, [dedupeByAppId, installedAppIds, showAdult])

  const loadInitialGames = useCallback(async () => {
    const cache = _gamesCache
    if (cache && Date.now() - cache.timestamp < GAMES_CACHE_TTL && cache.showAdult === showAdult) {
      setAllGames(cache.games)
      setBrowseLoading(false)
      return
    }
    setBrowseLoading(true)
    try {
      const resp = await listGames({ limit: 60, offset: 0 })
      const games = resp.games ? filterGames(resp.games.map(gameSummaryToMerged)) : []
      loadOffsetRef.current = resp.games?.length ?? 0
      setHasMore((resp.games?.length ?? 0) > 0)
      setAllGames(games)
      if (games.length > 0) {
        _gamesCache = { games, timestamp: Date.now(), showAdult }
      }
    } catch (err: any) {
      showToast('error', `${t('store.failedLoad')}: ${err.message}`)
    } finally {
      setBrowseLoading(false)
    }
  }, [filterGames, showAdult, showToast])

  const loadMoreGames = useCallback(async () => {
    if (loadingMoreRef.current || !hasMore) return
    loadingMoreRef.current = true
    setLoadingMore(true)
    try {
      const resp = await listGames({ limit: 60, offset: loadOffsetRef.current })
      const newGames = resp.games ? filterGames(resp.games.map(gameSummaryToMerged)) : []
      loadOffsetRef.current += resp.games?.length ?? 0
      setHasMore((resp.games?.length ?? 0) > 0)
      if (newGames.length > 0) {
        setAllGames(prev => {
          const merged = dedupeByAppId([...prev, ...newGames])
          _gamesCache = { games: merged, timestamp: Date.now(), showAdult }
          return merged
        })
      }
    } catch (err: any) {
      showToast('error', `${t('store.failedLoad')}: ${err.message}`)
    } finally {
      loadingMoreRef.current = false
      setLoadingMore(false)
    }
  }, [hasMore, filterGames, showToast])

  useEffect(() => {
    loadInitialGames().catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAdult])

  // Infinite scroll via IntersectionObserver + scroll fallback
  // loadingMore in deps ensures observer reconnects after sentinel remounts
  useEffect(() => {
    const el = sentinelRef.current
    if (!el || !hasMore) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadMoreGames()
        }
      },
      { rootMargin: '400px' }
    )
    observer.observe(el)

    // Scroll fallback: if the observer gets stale, a scroll near bottom still triggers load
    const main = document.querySelector('main')
    const onScroll = () => {
      if (!main || !hasMore || loadingMoreRef.current) return
      const nearBottom = main.scrollTop + main.clientHeight >= main.scrollHeight - 400
      if (nearBottom) loadMoreGames()
    }
    if (main) main.addEventListener('scroll', onScroll, { passive: true })

    return () => {
      observer.disconnect()
      if (main) main.removeEventListener('scroll', onScroll)
    }
  }, [hasMore, loadMoreGames, loadingMore])

  const browseFilteredGames = useMemo(() => {
    const filtered = showAdult ? allGames : allGames.filter(g => getPrimaryCategoryForGame(g) !== 'nsfw')
    return filterByCategory(filtered, browseFilter)
  }, [allGames, browseFilter, showAdult])

  const browseVisibleGames = useMemo(() => {
    let games = browseFilteredGames
    // Filter out orphaned games (no real name, no image)
    games = games.filter(g => {
      const rawName = g.name?.trim()
      return rawName && rawName !== g.app_id && !/^app\s*\d*$/i.test(rawName) && rawName.toLowerCase() !== 'appid'
    })
    if (hideInstalled) games = games.filter(g => !installedAppIds.has(g.app_id))
    return games
  }, [browseFilteredGames, hideInstalled, installedAppIds])

  const searchAbortRef = useRef<AbortController | null>(null)
  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setSearchResults(null); return }
    if (q.trim().length < 2) return
    searchAbortRef.current?.abort()
    const abortController = new AbortController()
    searchAbortRef.current = abortController
    setSearching(true)

    try {
      const resp = await searchGamesCombined(q.trim(), 50, showAdult ? 'all' : 'exclude')
      if (abortController.signal.aborted) return

      // Convert all results to MergedGame, filter installed + nsfw
      const merged = resp.games.map(g => ({
        app_id: g.app_id,
        name: g.name,
        header_image_url: g.header_image_url || null,
        category: null,
        source: (g.source === 'depotbox' ? 'import' : 'catalog') as 'catalog' | 'import',
        is_dlc: g.is_dlc,
      } satisfies MergedGame))

      const filtered = merged.filter(g => {
        const rawName = g.name?.trim()
        const isOrphaned = !rawName || rawName === g.app_id || /^app\s*\d*$/i.test(rawName) || rawName.toLowerCase() === 'appid'
        if (isOrphaned) return false
        if (installedAppIds.has(g.app_id)) return false
        if (g.is_dlc) return false
        if (isNonGameApp(g.name)) return false
        if (!showAdult && getPrimaryCategoryForGame(g) === 'nsfw') return false
        return true
      })

      const sorted = sortSearchResults(filtered, q.trim())
      setSearchResults(sorted)
    } catch (err: any) {
      if (abortController.signal.aborted) return
      showToast('error', `${t('store.searchFailed')}: ${err.message}`)
    } finally {
      if (!abortController.signal.aborted) setSearching(false)
    }
  }, [showToast, installedAppIds, showAdult])

  useEffect(() => {
    const timeout = setTimeout(() => doSearch(query), 400)
    return () => clearTimeout(timeout)
  }, [query, doSearch])

  const FEATURED_GAMES = [
    { id: '1245620', name: 'ELDEN RING', tag: 'Destacado de la semana', desc: 'Álzate, Sinluz. Explora las Tierras Intermedias en el aclamado RPG de acción de FromSoftware.' },
    { id: '1091500', name: 'Cyberpunk 2077', tag: 'Popular', desc: 'Sumérgete en Night City, una megalópolis obsesionada con el poder, el glamur y las modificaciones corporales.' },
    { id: '1174180', name: 'Red Dead Redemption 2', tag: 'Clásico moderno', desc: 'La épica historia de Arthur Morgan y la banda de Van der Linde, en la América del cambio de siglo.' },
    { id: '2358720', name: 'Black Myth: Wukong', tag: 'Novedad', desc: 'Un RPG de acción inspirado en la mitología china y el clásico Viaje al Oeste.' },
  ] as const

  const heroCdn = (id: string) => `https://cdn.akamai.steamstatic.com/steam/apps/${id}/library_hero.jpg`
  const heroHeaderCdn = (id: string) => `https://cdn.akamai.steamstatic.com/steam/apps/${id}/header.jpg`

  const enqueueGame = useDownloadQueueStore((s) => s.enqueue)

  const handleInstall = async (game: MergedGame) => {
    const launcherInfo = getLauncherInfo(game.app_id)
    if (launcherInfo) {
      const message = t('store.incompatibleLauncher').replace('{launcher}', launcherInfo.launcher)
      setConfirmDialog({
        title: t('store.incompatibleLauncherTitle'),
        message: `${message}\n\n${t('store.installAnyway')}?`,
        variant: 'warning',
        onConfirm: () => enqueueGame({ appId: game.app_id, name: game.name || `App ${game.app_id}` }),
      })
      return
    }
    enqueueGame({ appId: game.app_id, name: game.name || `App ${game.app_id}` })
  }

  // Auto-play hero carousel — advance every 6s, pause on hover
  useEffect(() => {
    if (heroPaused) {
      if (heroTimerRef.current) {
        clearInterval(heroTimerRef.current)
        heroTimerRef.current = null
      }
      return
    }
    heroTimerRef.current = setInterval(() => {
      setHeroIndex((prev) => (prev + 1) % FEATURED_GAMES.length)
    }, 6000)
    return () => {
      if (heroTimerRef.current) {
        clearInterval(heroTimerRef.current)
        heroTimerRef.current = null
      }
    }
  }, [heroPaused])

  const cardProps = { onInstall: handleInstall, installing, onSelect: (g: MergedGame) => navigate(`/store/${g.app_id}`) }
  const showSearch = query.trim().length >= 2 && searchResults !== null

  usePageHeader(
    <div className="flex items-center gap-2 w-full">
      <h1 className="text-lg font-bold text-text-bright flex-shrink-0 whitespace-nowrap">{t('store.title')}</h1>
      <button
        onClick={() => setHideInstalled((v) => !v)}
        className={`flex-shrink-0 px-2.5 py-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
          hideInstalled
            ? 'bg-accent/20 text-accent border border-accent/30'
            : 'bg-white/[0.04] text-text-dim border border-white/[0.08] hover:text-text-bright'
        }`}
        title={hideInstalled ? t('store.showInstalled') : t('store.hideInstalled')}
      >
        {hideInstalled ? t('store.showInstalled') : t('store.hideInstalled')}
      </button>
      <div className="relative flex-1 w-full">
        <div className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center text-text-muted pointer-events-none">
          <Search className="w-5 h-5" />
        </div>
        <input
          type="text" value={query} onChange={e => setQuery(e.target.value)}
          placeholder={t('store.searchPlaceholder')}
          className="w-full pr-10 py-2.5 rounded-xl text-sm text-text-primary placeholder:text-text-muted focus:outline-none transition-colors bg-white/[0.04] border border-white/[0.08] focus:border-accent/50"
          style={{ paddingLeft: '52px' }}
        />
        {query && (
          <button
            onClick={() => {
              setQuery('')
              setSearchResults(null)
              setSearching(false)
            }}
            className="absolute right-8 top-1/2 -translate-y-1/2 p-1 rounded-md text-text-muted hover:text-text-bright hover:bg-white/[0.08] transition-colors"
            aria-label="Clear search"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
        {searching && <Loader2 className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-accent animate-spin" />}
      </div>
    </div>,
    [query, searching]
  )

  return (
    <div data-section="Store" className="w-full px-4 py-4 space-y-4 animate-fade-in">
      {/* Import progress banner */}
      {importProgress && (
        <div className="flex items-center gap-3 p-3 rounded-xl border border-accent/20 bg-accent/5 backdrop-blur-sm">
          <Loader2 className="w-4 h-4 text-accent animate-spin" />
          <span className="text-sm text-text-dim">
            {t('store.importingApp')} {importProgress.appId}... {t('store.status')}: {importProgress.status}
          </span>
        </div>
      )}

      {/* Hero carousel */}
      {tab === 'browse' && !showSearch && (
        <section
          onMouseEnter={() => setHeroPaused(true)}
          onMouseLeave={() => setHeroPaused(false)}
          className="relative w-full h-[300px] rounded-[18px] overflow-hidden mb-3 animate-fade-in"
          style={{ border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 16px 48px rgba(0,0,0,0.45)' }}
        >
          {FEATURED_GAMES.map((g, i) => (
            <div
              key={g.id}
              className="absolute inset-0"
              style={{
                opacity: i === heroIndex ? 1 : 0,
                transform: i === heroIndex ? 'scale(1.04)' : 'scale(1)',
                transition: 'opacity 1s ease, transform 7s linear',
                pointerEvents: i === heroIndex ? 'auto' : 'none',
              }}
            >
              <img
                src={heroCdn(g.id)}
                alt=""
                className="absolute inset-0 w-full h-full object-cover"
                onError={(e) => { (e.target as HTMLImageElement).src = heroHeaderCdn(g.id) }}
              />
              <div className="absolute inset-0" style={{ background: 'linear-gradient(to right, rgba(9,9,11,0.92) 0%, rgba(9,9,11,0.55) 45%, transparent 80%)' }} />
              <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(9,9,11,0.7), transparent 45%)' }} />
              <div className="absolute inset-0 flex flex-col justify-center pl-14 pr-10" style={{ maxWidth: '620px' }}>
                <span className="flex items-center gap-2 text-[11px] font-bold tracking-[0.1em] uppercase mb-2.5" style={{ color: '#3BB2F7' }}>
                  <Star className="w-3.5 h-3.5 fill-current" />
                  {g.tag}
                </span>
                <h2 className="text-[36px] font-extrabold text-white leading-[1.05] tracking-[-0.02em] mb-2.5" style={{ textShadow: '0 4px 20px rgba(0,0,0,0.5)' }}>
                  {g.name}
                </h2>
                <p className="text-sm leading-relaxed text-[#d4d4d8] mb-5 max-w-[520px]">{g.desc}</p>
                <div className="flex gap-3 items-center">
                  <button
                    onClick={(e) => { e.stopPropagation(); handleInstall({ app_id: g.id, name: g.name, source: 'catalog' } as MergedGame) }}
                    className="flex items-center gap-2.5 px-[26px] py-3.5 rounded-xl text-sm font-bold text-white border-none cursor-pointer transition-all hover:brightness-110 hover:-translate-y-px"
                    style={{ background: 'linear-gradient(135deg,#3BB2F7,#2A8FD1)', boxShadow: '0 8px 24px rgba(59,178,247,0.4)' }}
                  >
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    {t('store.install')}
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); navigate(`/store/${g.id}`) }}
                    className="flex items-center gap-2 px-[22px] py-3.5 rounded-xl text-sm font-semibold cursor-pointer transition-all"
                    style={{ color: '#e4e4e7', background: 'rgba(255,255,255,0.08)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.12)' }}
                  >
                    {t('store.seeDetails') || 'Ver detalles'}
                  </button>
                </div>
              </div>
            </div>
          ))}
          {/* Navigation arrows removed intentionally */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-3 z-10">
            {FEATURED_GAMES.map((_, i) => (
              <button
                key={i}
                onClick={() => setHeroIndex(i)}
                className="rounded-full border-none cursor-pointer p-0 transition-all duration-[400ms]"
                style={{
                  width: i === heroIndex ? '32px' : '12px',
                  height: '10px',
                  background: i === heroIndex ? '#3BB2F7' : 'rgba(255,255,255,0.5)',
                  boxShadow: i === heroIndex ? '0 0 12px rgba(59,178,247,0.6)' : 'none',
                }}
              />
            ))}
          </div>
        </section>
      )}

      {/* Search results */}
      {showSearch && (() => {
        const visibleResults = hideInstalled ? searchResults!.filter(g => !installedAppIds.has(g.app_id)) : searchResults!
        return (
          <div className="space-y-3">
            <p className="text-sm font-semibold text-text-bright">{t('store.searchResults')}: "{query}" — {visibleResults.length} {t('store.results')}</p>
            {searching ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3">
                {Array.from({ length: 20 }).map((_, i) => (
                  <GameCardSkeleton key={i} />
                ))}
              </div>
            ) : visibleResults.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3">
                {visibleResults.map(g => <GameCard key={g.app_id} game={g} src={getDefaultGameImageUrl(g)} isInstalled={installedAppIds.has(g.app_id)} {...cardProps} />)}
              </div>
            ) : (
              <div className="text-center py-16">
                <Package className="w-12 h-12 text-text-dim mx-auto mb-3" />
                <p className="text-text-dim">{t('store.noGames')}</p>
              </div>
            )}
          </div>
        )
      })()}

      {/* Browse — hidden while searching */}
      {tab === 'browse' && !showSearch && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap w-fit p-1.5 rounded-2xl bg-white/[0.04] border border-white/[0.08]">
            {[{ id: 'all', label: t('store.category.all'), icon: LayoutGrid }, ...CATEGORIES.filter(c => c.id !== 'nsfw' || showAdult)].map((cat) => {
              const Icon = cat.icon
              const active = browseFilter === cat.id
              return (
                <button
                  key={cat.id}
                  onClick={() => setBrowseFilter(cat.id as CategoryId)}
                  className="flex items-center gap-2.5 h-11 px-4 rounded-xl text-sm font-medium transition-all duration-200"
                  style={{
                    background: active ? 'rgba(59,178,247,0.2)' : 'rgba(255,255,255,0.04)',
                    color: active ? '#3BB2F7' : '#a1a1aa',
                    border: `1px solid ${active ? 'rgba(59,178,247,0.3)' : 'rgba(255,255,255,0.08)'}`,
                    boxShadow: active ? '0 0 16px rgba(59,178,247,0.15)' : 'none',
                  }}
                >
                  <Icon className="w-5 h-5" />
                  {cat.label}
                </button>
              )
            })}
          </div>

          {browseVisibleGames.length > 0 && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3">
                {browseVisibleGames.map((g, idx) => {
                  if (!animStylesRef.current[g.app_id]) {
                    const animCounter = Object.keys(animStylesRef.current).length
                    const relativeIdx = animCounter % 60
                    // Initial batch (first 60): full staggered animation
                    // Scroll-loaded (60+): fast appearance, almost instant
                    const isInitialBatch = animCounter < 60
                    animStylesRef.current[g.app_id] = isInitialBatch
                      ? {
                          animation: `card-shoot 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) both`,
                          animationDelay: `${Math.min(relativeIdx, 20) * 0.08}s`,
                        }
                      : {
                          animation: `card-shoot 0.2s cubic-bezier(0.34, 1.56, 0.64, 1) both`,
                          animationDelay: `${Math.min(relativeIdx, 6) * 0.03}s`,
                        }
                  }
                  return (
                    <div key={g.app_id} style={animStylesRef.current[g.app_id]}>
                      <GameCard game={g} src={getDefaultGameImageUrl(g)} isInstalled={installedAppIds.has(g.app_id)} {...cardProps} />
                    </div>
                  )
                })}
              </div>
              {hasMore && (
                <div ref={sentinelRef} className="h-4" />
              )}
              {loadingMore && (
                <div className="flex items-center justify-center gap-3 py-6 text-text-dim">
              <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#3BB2F7' }} />
              <span className="text-lg font-semibold">Cargando más juegos...</span>
                </div>
              )}
            </>
          )}

          {browseLoading && (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3">
              {Array.from({ length: 12 }).map((_, i) => (
                <GameCardSkeleton key={i} />
              ))}
            </div>
          )}

          {!browseLoading && browseFilteredGames.length === 0 && (
            <div className="text-center py-16">
              <Package className="w-12 h-12 text-text-dim mx-auto mb-3" />
              <p className="text-text-dim">{t('store.noGames')}</p>
            </div>
          )}
        </div>
      )}

      {/* Scroll to top */}
      <button
        onClick={() => {
          const main = document.querySelector('main')
          if (main) main.scrollTo({ top: 0, behavior: 'smooth' })
        }}
        title={t('store.scrollToTop')}
        className={`fixed bottom-6 right-6 z-50 flex items-center justify-center w-14 h-14 rounded-full bg-accent text-white shadow-lg shadow-accent/30 hover:scale-105 transition-all duration-300 ${showScrollTop ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'}`}
      >
        <ArrowUp className="w-6 h-6" />
      </button>

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

      {/* Donation Modal */}
      <DonationModal
        open={showDonation}
        onClose={() => setShowDonation(false)}
        onDismissForever={() => setShowDonation(false)}
      />
    </div>
  )
}
