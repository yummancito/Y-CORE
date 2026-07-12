import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import {
  Search, Loader2, X, Package, ArrowUp,
  LayoutGrid,
} from 'lucide-react'
import { t } from '../lib/i18n'
import { useToastStore } from '../stores/useToastStore'
import { useLibraryStore } from '../stores/useLibraryStore'
import { useDownloadQueueStore } from '../stores/useDownloadQueueStore'
import { usePageHeader } from '../components/layout/AppShell'
import {
  listGames, installGame, getJobStatus, reportDownloaded, searchGamesCombined,
  type GameSummary,
} from '../lib/y-core-api'
import { CATEGORIES, type CategoryId, getPrimaryCategoryFromName } from '../lib/categories'
import { getLauncherInfo } from '../lib/onlinefix-compatibility'
import { useRecommendationStore } from '../stores/useRecommendationStore'
import { useSettingsStore } from '../stores/useSettingsStore'
import { GameCard, GameCardSkeleton, getDefaultGameImageUrl, type MergedGame } from '../components/store/GameCard'
import { GameDetailModal } from '../components/store/GameDetailModal'

interface InstallResult { type: 'success' | 'error' | 'info'; message: string }

type Tab = 'browse'

// Module-level cache that persists across component unmount/remount (navigation)
let _gamesCache: { games: MergedGame[]; timestamp: number; showAdult: boolean } | null = null
const GAMES_CACHE_TTL = 5 * 60 * 1000

function getPrimaryCategoryForGame(game: MergedGame): CategoryId | null {
  if (game.category) return game.category
  return getPrimaryCategoryFromName(game.name)
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
  }
}

function filterByCategory(games: MergedGame[], categoryId: CategoryId): MergedGame[] {
  if (categoryId === 'all') return games
  return games.filter((g) => getPrimaryCategoryForGame(g) === categoryId)
}

// ---- Main Store Page ----
export default function StorePage() {
  const [tab, setTab] = useState<Tab>('browse')
  const [query, setQuery] = useState('')
  const [searchResults, setSearchResults] = useState<MergedGame[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [allGames, setAllGames] = useState<MergedGame[]>([])
  const [categorySections, setCategorySections] = useState<{ title: string; icon: React.ComponentType<{ className?: string }>; games: MergedGame[] }[]>([])
  const [sectionsLoading, setSectionsLoading] = useState(true)
  const [browseFilter, setBrowseFilter] = useState<CategoryId>('all')
  const [browseLoading, setBrowseLoading] = useState(false)
  const [browseVisibleCount, setBrowseVisibleCount] = useState(60)
  const [installing, setInstalling] = useState<string | null>(null)
  const [selectedGame, setSelectedGame] = useState<MergedGame | null>(null)
  const [showScrollTop, setShowScrollTop] = useState(false)
  const [hideInstalled, setHideInstalled] = useState(true)
  const [importProgress, setImportProgress] = useState<{ appId: string; status: string } | null>(null)
  const { showTools, showAdult, loadFromConfig: loadSettings } = useSettingsStore()

  // Load content settings from config
  useEffect(() => {
    loadSettings()
  }, [loadSettings])

  const { showToast } = useToastStore()
  const { games: installedGames } = useLibraryStore()
  const consumedAppIds = useRecommendationStore((s) => s.consumedAppIds)
  const consumeGame = useRecommendationStore((s) => s.consumeGame)
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

  const setSplash = useCallback((status: string, percent: number) => {
    window.steamtools?.setSplashStatus?.(status, percent).catch?.(() => {})
  }, [])

  const loadAllGames = useCallback(async (): Promise<MergedGame[]> => {
    const start = performance.now()
    setSplash(t('store.loadingCatalog'), 15)

    const cache = _gamesCache
    if (cache && Date.now() - cache.timestamp < GAMES_CACHE_TTL && cache.showAdult === showAdult) {
      setSplash(t('store.preparingStore'), 75)
      return cache.games
    }

    const BATCH_SIZE = 200
    const MAX_GAMES = 600
    let allGames: MergedGame[] = []
    let offset = 0
    while (offset < MAX_GAMES) {
      const resp = await listGames({ limit: BATCH_SIZE, offset })
      if (!resp.games || resp.games.length === 0) break
      allGames.push(...resp.games.map(gameSummaryToMerged))
      offset += BATCH_SIZE
      if (resp.games.length < BATCH_SIZE) break
    }

    let games: MergedGame[] = dedupeByAppId(allGames)
      .filter((g) => g.app_id && /^\d+$/.test(g.app_id) && g.name && g.name.trim() !== '')
      .filter((g) => !installedAppIds.has(g.app_id))
      .filter((g) => showAdult || getPrimaryCategoryForGame(g) !== 'nsfw')

    _gamesCache = { games, timestamp: Date.now(), showAdult }
    window.steamtools?.addLog?.({ level: 'INFO', message: `[Perf] store catalog fetched: ${games.length} games in ${Math.ceil(offset / BATCH_SIZE)} batches` })?.catch?.(() => {})

    setSplash(t('store.preparingStore'), 75)
    window.steamtools?.addLog?.({ level: 'INFO', message: `[Perf] loadAllGames took ${(performance.now() - start).toFixed(0)}ms, ${games.length} games ready` })?.catch?.(() => {})
    return games
  }, [installedAppIds, dedupeByAppId, setSplash, showAdult])

  const loadAllGamesRef = useRef(loadAllGames)
  loadAllGamesRef.current = loadAllGames

  useEffect(() => {
    let cancelled = false
    setBrowseLoading(true)

    loadAllGamesRef.current()
      .then((games) => {
        if (cancelled) return
        setAllGames(games)
      })
      .catch((err) => {
        if (cancelled) return
        showToast('error', `${t('store.failedLoad')}: ${err.message}`)
      })
      .finally(() => {
        if (cancelled) return
        setBrowseLoading(false)
      })
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
    return games.slice(0, browseVisibleCount)
  }, [browseFilteredGames, browseVisibleCount, hideInstalled, installedAppIds])

  useEffect(() => {
    setBrowseVisibleCount(60)
  }, [browseFilter])

  const searchAbortRef = useRef<AbortController | null>(null)
  const pollAbortRef = useRef<AbortController | null>(null)
  const pollJobRef = useRef<((jobId: string, appId: string, gameName?: string) => Promise<void>) | null>(null)
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

      // Separate catalog results (already games) from depotbox results (need type check)
      const catalogGames: MergedGame[] = []
      const depotboxGames: MergedGame[] = []
      for (const g of resp.games) {
        const merged: MergedGame = {
          app_id: g.app_id,
          name: g.name,
          header_image_url: g.header_image_url || null,
          category: null,
          source: g.source === 'depotbox' ? 'import' as const : 'catalog' as const,
          is_dlc: g.is_dlc,
        }
        if (g.source === 'depotbox') {
          depotboxGames.push(merged)
        } else {
          catalogGames.push(merged)
        }
      }

      // Filter installed games from catalog results immediately
      // Also filter NSFW from catalog when showAdult is false (DepotBox already filters server-side)
      const filteredCatalog = catalogGames
        .filter((g) => !installedAppIds.has(g.app_id))
        .filter((g) => showAdult || getPrimaryCategoryForGame(g) !== 'nsfw')

      // If showTools is true AND showAdult is true, skip type checking entirely
      if (showTools && showAdult) {
        const filteredDepotbox = depotboxGames.filter(g => !installedAppIds.has(g.app_id))
        const allResults = sortSearchResults([...filteredCatalog, ...filteredDepotbox], q.trim())
        setSearchResults(allResults)
        return
      }

      // Show catalog results immediately, then check depotbox types
      setSearchResults(filteredCatalog)

      // Check depotbox app types for tool and/or adult filtering
      const depotboxAppIds = depotboxGames.map(g => g.app_id)
      if (depotboxAppIds.length === 0) {
        return
      }

      const typeResults = await window.steamtools.checkAppTypes(depotboxAppIds)
      if (abortController.signal.aborted) return

      // Filter depotbox games: exclude tools, adult, installed, and orphaned entries
      const filteredDepotbox = depotboxGames
        .filter(g => {
          // Exclude entries without a real name (orphaned app IDs)
          const rawName = g.name?.trim()
          const isOrphaned = !rawName || rawName === g.app_id || /^app\s*\d*$/i.test(rawName) || rawName.toLowerCase() === 'appid'
          if (isOrphaned) return false
          if (!showAdult && getPrimaryCategoryForGame(g) === 'nsfw') return false
          const info = typeResults[g.app_id]
          if (!info) return true
          if (!showTools && !info.isGame) return false
          if (info.isAdult && !showAdult) return false
          return true
        })
        .filter(g => !installedAppIds.has(g.app_id))

      // Merge catalog + filtered depotbox, then sort by relevance
      const allResults = sortSearchResults([...filteredCatalog, ...filteredDepotbox], q.trim())
      setSearchResults(allResults)
    } catch (err: any) {
      if (abortController.signal.aborted) return
      showToast('error', `${t('store.searchFailed')}: ${err.message}`)
    } finally {
      if (!abortController.signal.aborted) setSearching(false)
    }
  }, [showToast, installedAppIds, showTools, showAdult])

  useEffect(() => {
    const timeout = setTimeout(() => doSearch(query), 400)
    return () => clearTimeout(timeout)
  }, [query, doSearch])

  const GOLDSRC_MOD_APP_IDS = new Set([
    '10', '20', '30', '40', '50', '60', '80', '100', '130',
  ])

  const enqueueGame = useDownloadQueueStore((s) => s.enqueue)

  const handleInstall = async (game: MergedGame) => {
    const launcherInfo = getLauncherInfo(game.app_id)
    if (launcherInfo) {
      const message = t('store.incompatibleLauncher').replace('{launcher}', launcherInfo.launcher)
      if (!window.confirm(`${t('store.incompatibleLauncherTitle')}\n\n${message}\n\n${t('store.installAnyway')}?`)) {
        return
      }
    }
    enqueueGame({ appId: game.app_id, name: game.name || `App ${game.app_id}` })
  }

  const processQueue = useCallback(async () => {
    const { processing, dequeue, setProcessing, setCurrent } = useDownloadQueueStore.getState()
    if (processing) return
    const item = dequeue()
    if (!item) return

    setProcessing(true)
    setCurrent(item)
    setInstalling(item.appId)
    try {
      const closeResult = await window.steamtools.closeSteam()
      if (closeResult && !closeResult.success) {
        showToast('error', closeResult.error || t('store.failedCloseSteam'))
        return
      }

      if (GOLDSRC_MOD_APP_IDS.has(item.appId)) {
        const baseResp = await installGame('70')
        if (baseResp.status === 'ready' && baseResp.game) {
          const result = await window.steamtools.storeInstallGame({
            app_id: '70',
            name: 'Half-Life',
            lua_content: baseResp.game.lua_content,
            manifest_files: baseResp.game.manifest_files.map(m => ({ depot_id: m.depot_id, manifest_id: m.manifest_gid })),
            depot_keys: baseResp.game.depot_keys.map(k => ({ depot_id: k.depot_id, key: k.decryption_key })),
          })
          if (!result.success) {
            showToast('error', result.errors?.[0] || result.error || t('store.failedInstallBase'))
            return
          }
          try { await reportDownloaded('70') } catch {}
        } else if (baseResp.status === 'queued') {
          await pollJobRef.current!(baseResp.job_id!, '70')
        }
      }

      const resp = await installGame(item.appId)

      if (resp.status === 'ready' && resp.game) {
        const result = await window.steamtools.storeInstallGame({
          app_id: resp.game.app_id,
          name: resp.game.name,
          lua_content: resp.game.lua_content,
          manifest_files: resp.game.manifest_files.map(m => ({ depot_id: m.depot_id, manifest_id: m.manifest_gid })),
          depot_keys: resp.game.depot_keys.map(k => ({ depot_id: k.depot_id, key: k.decryption_key })),
        })

        const actions: InstallResult[] = []
        if (result.actions) for (const a of result.actions) actions.push({ type: 'info', message: a })
        if (result.errors) for (const e of result.errors) actions.push({ type: 'error', message: e })
        if (result.success) {
          actions.push({ type: 'success', message: `${item.name} installed` })
          try { await reportDownloaded(item.appId) } catch {}
          consumeGame(item.appId)
        }
        for (const action of actions) {
          window.steamtools.addLog({
            level: action.type === 'error' ? 'ERROR' : 'INFO',
            message: `[Store] ${action.message}`,
          }).catch((e) => console.warn('[Store] addLog failed:', e))
        }
        if (!result.success) {
          showToast('error', result.errors?.[0] || result.error || t('store.installFailed'))
        }
      } else if (resp.status === 'queued' && resp.job_id) {
        await pollJobRef.current!(resp.job_id, item.appId, item.name)
      } else {
        showToast('error', t('store.unexpectedResponse'))
      }
    } catch (err: any) {
      window.steamtools.addLog({ level: 'ERROR', message: `[Store] Install failed: ${err.message}` }).catch((e) => console.warn('[Store] addLog failed:', e))
      showToast('error', err.message)
    } finally {
      setInstalling(null)
      setImportProgress(null)
      setCurrent(null)
      setProcessing(false)
      // If queue is empty, offer restart
      if (useDownloadQueueStore.getState().queue.length === 0) {
        const shouldRestart = window.confirm(t('store.restartPrompt'))
        if (shouldRestart) {
          const r = await window.steamtools.restartSteam()
          if (!r?.success) showToast('error', r?.error || t('store.restartFailed'))
        }
      }
      processQueue()
    }
  }, [showToast, setInstalling, setImportProgress, consumeGame])

  // Start processing whenever the queue changes
  const queue = useDownloadQueueStore((s) => s.queue)
  const processing = useDownloadQueueStore((s) => s.processing)
  useEffect(() => {
    if (!processing && queue.length > 0) {
      processQueue()
    }
  }, [queue, processing, processQueue])

  const pollJob = async (jobId: string, appId: string, gameName?: string) => {
    pollAbortRef.current?.abort()
    const abortController = new AbortController()
    pollAbortRef.current = abortController

    setImportProgress({ appId, status: 'queued' })

    let attempts = 0
    const maxAttempts = 200
    while (attempts < maxAttempts) {
      if (abortController.signal.aborted) return
      await new Promise(resolve => setTimeout(resolve, 3000))
      if (abortController.signal.aborted) return
      attempts++

      let job
      try {
        job = await getJobStatus(jobId)
      } catch (err: any) {
        window.steamtools?.addLog?.({ level: 'WARN', message: `[Store] pollJob: getJobStatus error (attempt ${attempts}): ${err.message}` })?.catch?.(() => {})
        continue
      }

      if (job.status === 'completed' && job.result) {
        setImportProgress(null)
        const result = await window.steamtools.storeInstallGame({
          app_id: job.result.app_id,
          name: job.result.name,
          lua_content: job.result.lua_content,
          manifest_files: job.result.manifest_files.map(m => ({ depot_id: m.depot_id, manifest_id: m.manifest_gid })),
          depot_keys: job.result.depot_keys.map(k => ({ depot_id: k.depot_id, key: k.decryption_key })),
        })
        if (result.success) {
          try { await reportDownloaded(appId) } catch {}
          consumeGame(appId)
        } else {
          showToast('error', result.errors?.[0] || result.error || `${t('store.installFailed')} after import`)
        }
        return
      }

      if (job.status === 'failed') {
        setImportProgress(null)
        showToast('error', job.error_message || t('store.importFailed'))
        return
      }

      setImportProgress({ appId, status: job.status })
    }

    if (abortController.signal.aborted) return
    setImportProgress(null)
    showToast('error', t('store.importTimeout'))
  }

  pollJobRef.current = pollJob

  useEffect(() => {
    return () => {
      pollAbortRef.current?.abort()
    }
  }, [])

  const cardProps = { onInstall: handleInstall, installing, onSelect: setSelectedGame }
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
                  className={`flex items-center gap-2.5 h-11 px-4 rounded-xl text-sm font-medium transition-all duration-200 ${
                    active
                      ? 'bg-accent/20 text-accent border border-accent/30 shadow-[0_0_16px_rgba(39,185,242,0.15)]'
                      : 'bg-white/[0.04] border border-white/[0.08] text-text-secondary hover:text-text-bright hover:bg-white/[0.08]'
                  }`}
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
                {browseVisibleGames.map(g => <GameCard key={g.app_id} game={g} src={getDefaultGameImageUrl(g)} isInstalled={installedAppIds.has(g.app_id)} {...cardProps} />)}
              </div>
              {browseVisibleCount < browseFilteredGames.length && (
                <div className="flex justify-center pt-4">
                  <button
                    onClick={() => setBrowseVisibleCount(c => c + 60)}
                    className="px-6 py-3 rounded-xl bg-white/[0.05] border border-white/[0.08] text-sm font-medium text-text-secondary hover:text-text-bright hover:bg-white/[0.08] transition-colors"
                  >
                    {t('store.loadMore')} ({browseFilteredGames.length - browseVisibleCount})
                  </button>
                </div>
              )}
            </>
          )}

          {browseLoading && browseFilteredGames.length === 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3">
              {Array.from({ length: 30 }).map((_, i) => (
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

      {/* Game Detail Modal */}
      {selectedGame && (
        <GameDetailModal
          game={selectedGame}
          installing={installing}
          onInstall={handleInstall}
          onClose={() => setSelectedGame(null)}
        />
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
    </div>
  )
}
