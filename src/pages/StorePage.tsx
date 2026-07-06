import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import {
  Search, Loader2, X, Package, ArrowUp,
  LayoutGrid,
} from 'lucide-react'
import { t } from '../lib/i18n'
import { useToastStore } from '../stores/useToastStore'
import { useLibraryStore } from '../stores/useLibraryStore'
import { usePageHeader } from '../components/layout/AppShell'
import {
  listGames, installGame, getJobStatus, reportDownloaded, searchGamesCombined,
  type GameSummary,
} from '../lib/y-core-api'
import { CATEGORIES, type CategoryId, getPrimaryCategoryFromName } from '../lib/categories'
import { useRecommendationStore } from '../stores/useRecommendationStore'
import { useSettingsStore } from '../stores/useSettingsStore'
import { GameCard, GameCardSkeleton, SectionRowSkeleton, getDefaultGameImageUrl, type MergedGame } from '../components/store/GameCard'
import { SectionRow } from '../components/store/SectionRow'
import { GameDetailModal } from '../components/store/GameDetailModal'

interface InstallResult { type: 'success' | 'error' | 'info'; message: string }

type Tab = 'discover' | 'browse'

// Module-level cache that persists across component unmount/remount (navigation)
let _gamesCache: { games: MergedGame[]; timestamp: number; showAdult: boolean } | null = null
const GAMES_CACHE_TTL = 5 * 60 * 1000

function getPrimaryCategoryForGame(game: MergedGame): CategoryId | null {
  if (game.category) return game.category
  return getPrimaryCategoryFromName(game.name)
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
  const [tab, setTab] = useState<Tab>('discover')
  const [query, setQuery] = useState('')
  const [searchResults, setSearchResults] = useState<MergedGame[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [allGames, setAllGames] = useState<MergedGame[]>([])
  const [categorySections, setCategorySections] = useState<{ title: string; icon: React.ComponentType<{ className?: string }>; games: MergedGame[] }[]>([])
  const [sectionsLoading, setSectionsLoading] = useState(true)
  const [browseFilter, setBrowseFilter] = useState<CategoryId>('all')
  const [browseLoading, setBrowseLoading] = useState(false)
  const [installing, setInstalling] = useState<string | null>(null)
  const [selectedGame, setSelectedGame] = useState<MergedGame | null>(null)
  const [showScrollTop, setShowScrollTop] = useState(false)
  const [importProgress, setImportProgress] = useState<{ appId: string; status: string } | null>(null)
  const { showTools, showAdult, loadFromConfig: loadSettings } = useSettingsStore()

  // Load content settings from config
  useEffect(() => {
    loadSettings()
  }, [loadSettings])

  const discoverAbortRef = useRef<AbortController | null>(null)
  const browseAbortRef = useRef<AbortController | null>(null)

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

  const buildCategorySections = useCallback((games: MergedGame[]) => {
    const byCategory = new Map<CategoryId, MergedGame[]>()
    for (const g of games) {
      const cat = getPrimaryCategoryForGame(g)
      if (!cat) continue
      if (cat === 'nsfw' && !showAdult) continue
      const list = byCategory.get(cat)
      if (list) list.push(g)
      else byCategory.set(cat, [g])
    }
    return CATEGORIES.filter((c) => c.id !== 'nsfw' || showAdult).map((category) => ({
      title: category.label,
      icon: category.icon,
      games: (byCategory.get(category.id) || []).slice(0, 30),
    })).filter((section) => section.games.length > 0)
  }, [showAdult])

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
    const MAX_GAMES = 1000
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

  useEffect(() => {
    if (tab !== 'discover') return
    discoverAbortRef.current?.abort()
    const abortController = new AbortController()
    discoverAbortRef.current = abortController
    setSectionsLoading(true)
    loadAllGames()
      .then((games) => {
        if (abortController.signal.aborted) return
        setAllGames(games)
        setCategorySections(buildCategorySections(games))
      })
      .catch((err) => {
        if (abortController.signal.aborted) return
        showToast('error', `${t('store.failedLoad')}: ${err.message}`)
      })
      .finally(() => {
        if (!abortController.signal.aborted) setSectionsLoading(false)
      })
    return () => { discoverAbortRef.current?.abort() }
  }, [tab, showToast, loadAllGames, buildCategorySections])

  useEffect(() => {
    if (tab !== 'browse') return
    browseAbortRef.current?.abort()
    const abortController = new AbortController()
    browseAbortRef.current = abortController
    setBrowseLoading(true)
    loadAllGames()
      .then((games) => {
        if (abortController.signal.aborted) return
        setAllGames(games)
      })
      .catch((err) => {
        if (abortController.signal.aborted) return
        showToast('error', `${t('store.failedLoad')}: ${err.message}`)
      })
      .finally(() => {
        if (!abortController.signal.aborted) setBrowseLoading(false)
      })
    return () => { browseAbortRef.current?.abort() }
  }, [tab, showToast, loadAllGames])

  const browseFilteredGames = useMemo(() => {
    const filtered = showAdult ? allGames : allGames.filter(g => getPrimaryCategoryForGame(g) !== 'nsfw')
    return filterByCategory(filtered, browseFilter)
  }, [allGames, browseFilter, showAdult])

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
        const allResults = [...filteredCatalog, ...filteredDepotbox]
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

      // Filter depotbox games: exclude tools (if showTools=false) and adult content (if showAdult=false)
      const filteredDepotbox = depotboxGames
        .filter(g => {
          // Client-side fallback: check name against NSFW category keywords
          if (!showAdult && getPrimaryCategoryForGame(g) === 'nsfw') return false
          const info = typeResults[g.app_id]
          if (!info) return true
          if (!showTools && !info.isGame) return false
          if (info.isAdult && !showAdult) return false
          return true
        })
        .filter(g => !installedAppIds.has(g.app_id))

      // Merge catalog + filtered depotbox
      const allResults = [...filteredCatalog, ...filteredDepotbox]
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

  const handleInstall = async (game: MergedGame) => {
    setInstalling(game.app_id)
    try {
      const closeResult = await window.steamtools.closeSteam()
      if (closeResult && !closeResult.success) {
        showToast('error', closeResult.error || t('store.failedCloseSteam'))
        return
      }

      if (GOLDSRC_MOD_APP_IDS.has(game.app_id)) {
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
          await pollJob(baseResp.job_id!, '70')
        }
      }

      const resp = await installGame(game.app_id)

      if (resp.status === 'ready' && resp.game) {
        const result = await window.steamtools.storeInstallGame({
          app_id: resp.game.app_id,
          name: resp.game.name,
          lua_content: resp.game.lua_content,
          manifest_files: resp.game.manifest_files.map(m => ({ depot_id: m.depot_id, manifest_id: m.manifest_gid })),
          depot_keys: [],
        })

        const actions: InstallResult[] = []
        if (result.actions) for (const a of result.actions) actions.push({ type: 'info', message: a })
        if (result.errors) for (const e of result.errors) actions.push({ type: 'error', message: e })
        if (result.success) {
          actions.push({ type: 'success', message: `${game.name} installed` })
          try { await reportDownloaded(game.app_id) } catch {}
          consumeGame(game.app_id)
        }
        for (const action of actions) {
          window.steamtools.addLog({
            level: action.type === 'error' ? 'ERROR' : 'INFO',
            message: `[Store] ${action.message}`,
          }).catch(() => {})
        }
        if (result.success) {
          try { await window.steamtools.restartSteam() } catch {}
        } else {
          showToast('error', result.errors?.[0] || result.error || t('store.installFailed'))
        }
      } else if (resp.status === 'queued' && resp.job_id) {
        await pollJob(resp.job_id, game.app_id, game.name)
      } else {
        showToast('error', t('store.unexpectedResponse'))
      }
    } catch (err: any) {
      window.steamtools.addLog({ level: 'ERROR', message: `[Store] Install failed: ${err.message}` }).catch(() => {})
      showToast('error', err.message)
    } finally {
      setInstalling(null)
      setImportProgress(null)
    }
  }

  const pollJob = async (jobId: string, appId: string, gameName?: string) => {
    setImportProgress({ appId, status: 'queued' })

    let attempts = 0
    const maxAttempts = 200
    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 3000))
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
          depot_keys: [],
        })
        if (result.success) {
          try { await reportDownloaded(appId) } catch {}
          consumeGame(appId)
          try { await window.steamtools.restartSteam() } catch {}
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

    setImportProgress(null)
    showToast('error', t('store.importTimeout'))
  }

  const cardProps = { onInstall: handleInstall, installing, onSelect: setSelectedGame }
  const showSearch = query.trim().length >= 2 && searchResults !== null

  usePageHeader(
    <div className="flex items-center justify-between gap-4">
      <div className="flex items-center gap-6">
        <div>
          <h1 className="text-lg font-bold text-text-bright">{t('store.title')}</h1>
          <p className="text-[11px] text-text-dim">{t('store.subtitle')}</p>
        </div>
        {!showSearch && (
          <div className="flex items-center gap-1">
            {[
              { key: 'discover', label: t('store.discover'), title: t('store.discover') },
              { key: 'browse', label: t('store.browseAll'), title: t('store.browseAll') },
            ].map((opt) => {
              const active = tab === opt.key
              return (
                <button
                  key={opt.key}
                  title={opt.title}
                  onClick={() => setTab(opt.key as Tab)}
                  className={`flex items-center gap-2 h-11 px-3.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                    active
                      ? 'bg-white/[0.08] text-text-bright shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]'
                      : 'text-text-secondary hover:text-text-bright hover:bg-white/[0.04]'
                  }`}
                >
                  {opt.label}
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>,
    [tab, showSearch]
  )

  return (
    <div data-section="Store" className="w-full px-4 py-4 space-y-4 animate-fade-in">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
        <input
          type="text" value={query} onChange={e => setQuery(e.target.value)}
          placeholder={t('store.searchPlaceholder')}
          className="w-full pl-12 pr-10 py-3 rounded-xl text-sm text-text-primary placeholder:text-text-muted focus:outline-none transition-colors bg-white/[0.04] border border-white/[0.08] focus:border-accent/50 backdrop-blur-sm"
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
      {showSearch && (
        <div className="space-y-2">
          {searching ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3">
              {Array.from({ length: 20 }).map((_, i) => (
                <GameCardSkeleton key={i} />
              ))}
            </div>
          ) : (
            <>
              <p className="text-sm text-text-dim">{searchResults!.length} {t('store.resultsFor')} "{query}"</p>
              {searchResults!.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3">
                  {searchResults!.map(g => <GameCard key={g.app_id} game={g} src={getDefaultGameImageUrl(g)} {...cardProps} />)}
                </div>
              ) : (
                <div className="text-center py-16">
                  <Package className="w-12 h-12 text-text-dim mx-auto mb-3" />
                  <p className="text-text-dim">{t('store.noGames')}</p>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Discover */}
      {tab === 'discover' && (
        <div className="space-y-6">
          {sectionsLoading ? (
            <div className="space-y-6">
              {Array.from({ length: 4 }).map((_, i) => (
                <SectionRowSkeleton key={i} />
              ))}
            </div>
          ) : (
            <>
              {categorySections.map((cat) => (
                <SectionRow key={cat.title} title={cat.title} icon={cat.icon} games={cat.games} {...cardProps} />
              ))}
            </>
          )}
        </div>
      )}

      {/* Browse */}
      {tab === 'browse' && (
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

          {browseFilteredGames.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3">
              {browseFilteredGames.map(g => <GameCard key={g.app_id} game={g} src={getDefaultGameImageUrl(g)} {...cardProps} />)}
            </div>
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
