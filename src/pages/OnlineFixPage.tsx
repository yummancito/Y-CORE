import { useState, useEffect, useMemo } from 'react'
import { Search, Wifi, X, AlertTriangle, CheckCircle2, XCircle, Loader2, Filter, Gamepad2 } from 'lucide-react'
import { t } from '../lib/i18n'
import { useLibraryStore } from '../stores/useLibraryStore'
import { useToastStore } from '../stores/useToastStore'
import { usePageHeader } from '../components/layout/AppShell'
import { getCoverUrl } from '../domain/utils'
import { CoverImage } from '../components/ui/CoverImage'
import { Card3D } from '../components/ui/Card3D'
import { getCompatibility, getCompatibilityReason, type CompatibilityStatus } from '../lib/onlinefix-compatibility'
import { getOnlineFixCompatibilityBatch } from '../lib/y-core-api'

export default function OnlineFixPage() {
  usePageHeader(<div><h1>{t('onlinefix.title')}</h1><p className="text-sm text-text-muted">{t('onlinefix.description')}</p></div>, [])
  const { games, loadGames, loading } = useLibraryStore()
  const { showToast } = useToastStore()
  const [searchQuery, setSearchQuery] = useState('')
  const [filter, setFilter] = useState<CompatibilityStatus | 'all'>('all')
  const [statusMap, setStatusMap] = useState<Record<string, boolean>>({})
  const [loadingMap, setLoadingMap] = useState<Set<string>>(new Set())
  const [compatMap, setCompatMap] = useState<Record<string, { status: CompatibilityStatus; reason?: string }>>({})
  const [compatLoading, setCompatLoading] = useState(false)
  const [hideWarning, setHideWarning] = useState(false)
  const [coverErrors, setCoverErrors] = useState<Set<string>>(new Set())

  useEffect(() => {
    loadGames()
    window.steamtools?.readConfig?.().then((cfg: any) => {
      if (cfg?.hideOnlineFixWarning) setHideWarning(true)
    }).catch(() => {})
  }, [loadGames])

  const dismissWarning = async () => {
    setHideWarning(true)
    try {
      const current = (await window.steamtools?.readConfig?.()) as Record<string, unknown> | null
      await window.steamtools?.writeConfig?.({ ...(current || {}), hideOnlineFixWarning: true })
    } catch {}
  }

  useEffect(() => {
    if (games.length === 0) return
    games.forEach((game) => {
      window.steamtools.checkOnlineFixStatus(game.appId).then((result) => {
        setStatusMap((prev) => ({ ...prev, [game.appId]: result.enabled }))
      })
    })

    setCompatLoading(true)
    getOnlineFixCompatibilityBatch(games.map((g) => g.appId))
      .then((result) => {
        const merged: Record<string, { status: CompatibilityStatus; reason?: string }> = {}
        for (const game of games) {
          merged[game.appId] = result[game.appId] || getCompatibility(game.appId)
        }
        setCompatMap(merged)
      })
      .catch(() => {
        const fallback: Record<string, { status: CompatibilityStatus; reason?: string }> = {}
        for (const game of games) {
          fallback[game.appId] = getCompatibility(game.appId)
        }
        setCompatMap(fallback)
      })
      .finally(() => setCompatLoading(false))
  }, [games])

  const resolveCompat = (appId: string): { status: CompatibilityStatus; reason?: string } => {
    return compatMap[appId] || getCompatibility(appId)
  }

  const filteredGames = useMemo(() => {
    return games.filter((g) => {
      const matchesSearch =
        g.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        g.appId.includes(searchQuery)
      const compat = resolveCompat(g.appId)
      const matchesFilter = filter === 'all' || compat.status === filter
      return matchesSearch && matchesFilter
    })
  }, [games, searchQuery, filter, compatMap])

  const handleToggle = async (appId: string, gameName: string) => {
    const currentlyEnabled = statusMap[appId]
    setLoadingMap((prev) => new Set(prev).add(appId))
    try {
      if (currentlyEnabled) {
        const result = await window.steamtools.disableOnlineFix(appId)
        if (result.success) {
          setStatusMap((prev) => ({ ...prev, [appId]: false }))
          showToast('success', `${t('onlinefix.disabledSuccess')} ${gameName}`)
        } else {
          showToast('error', result.error || t('onlinefix.disableFailed'))
        }
      } else {
        const result = await window.steamtools.enableOnlineFix(appId)
        if (result.success) {
          setStatusMap((prev) => ({ ...prev, [appId]: true }))
          showToast('success', `${t('onlinefix.enabledSuccess')} ${gameName}`)
        } else {
          showToast('error', result.error || t('onlinefix.enableFailed'))
        }
      }
    } catch (err: any) {
      showToast('error', err.message)
    } finally {
      setLoadingMap((prev) => {
        const next = new Set(prev)
        next.delete(appId)
        return next
      })
    }
  }

  const statusBadge = (status: CompatibilityStatus, reason?: string) => {
    if (status === 'compatible') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-green-500/15 text-green-400 border border-green-500/20">
          <CheckCircle2 className="w-3 h-3" />
          {t('onlinefix.compatible')}
        </span>
      )
    }
    if (status === 'incompatible') {
      return (
        <span
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-500/15 text-red-400 border border-red-500/20"
          title={getCompatibilityReason(reason)}
        >
          <XCircle className="w-3 h-3" />
          {t('onlinefix.incompatible')}
        </span>
      )
    }
    return null
  }

  const counts = useMemo(() => {
    return {
      all: games.length,
      compatible: games.filter((g) => resolveCompat(g.appId).status === 'compatible').length,
      incompatible: games.filter((g) => resolveCompat(g.appId).status === 'incompatible').length,
      unknown: games.filter((g) => resolveCompat(g.appId).status === 'unknown').length,
    }
  }, [games, compatMap])

  const filterTabs: { id: CompatibilityStatus | 'all'; label: string }[] = [
    { id: 'all', label: `${t('onlinefix.all')} (${counts.all})` },
    { id: 'compatible', label: `${t('onlinefix.compatible')} (${counts.compatible})` },
    { id: 'incompatible', label: `${t('onlinefix.incompatible')} (${counts.incompatible})` },
    { id: 'unknown', label: `${t('onlinefix.unknown')} (${counts.unknown})` },
  ]

  return (
    <div className="px-6 py-5 w-full">
      {/* Search + filters */}
      <div className="mb-5 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <div className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center text-text-muted pointer-events-none">
            <Search className="w-5 h-5" />
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('onlinefix.searchPlaceholder')}
            className="w-full min-h-[52px] pr-12 py-3 rounded-xl bg-white/[0.06] text-base text-text-bright placeholder:text-text-muted border border-white/[0.12] focus:border-accent/50 focus:outline-none transition-colors"
            style={{ paddingLeft: '48px' }}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-md text-text-muted hover:text-text-bright hover:bg-white/[0.08] transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Filter tabs */}
      <div className="mb-5 flex items-center gap-2 overflow-x-auto pb-1">
        <Filter className="w-5 h-5 text-text-muted mr-1 flex-shrink-0" />
        {filterTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setFilter(tab.id)}
            className={`px-5 py-2.5 rounded-lg text-sm font-semibold whitespace-nowrap transition-colors ${
              filter === tab.id
                ? 'bg-accent/25 text-accent border border-accent/50'
                : 'bg-white/[0.06] text-text-bright border border-white/[0.10] hover:bg-white/[0.12] hover:text-text-bright'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Games grid */}
      {loading || compatLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-accent" />
        </div>
      ) : filteredGames.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-text-muted">
          <Wifi className="w-10 h-10 mb-3 opacity-50" />
          <p className="text-sm">{searchQuery ? t('onlinefix.noResults') : t('onlinefix.noGames')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-4">
          {filteredGames.map((game) => {
            const compat = resolveCompat(game.appId)
            const isEnabled = statusMap[game.appId] ?? false
            const isLoading = loadingMap.has(game.appId)
            const isDisabled = compat.status === 'incompatible'

            return (
              <Card3D
                key={game.appId}
                className={`group/card relative rounded-xl overflow-hidden cursor-pointer bg-surface-2 border border-white/[0.06] shadow-card transition-all duration-300 hover:shadow-card-hover will-change-transform ${
                  isDisabled ? 'opacity-60' : ''
                } ${isEnabled ? 'ring-1 ring-accent/30' : ''}`}
              >
                <div className="relative aspect-[2/3] overflow-hidden">
                  <CoverImage
                    src={getCoverUrl(game.appId)}
                    fallbackSrc={`https://depotbox.org/api/images/steam-header/${game.appId}`}
                    alt={game.name}
                    className="w-full h-full object-cover transition-all duration-500 group-hover/card:scale-105"
                  />

                  <div className="absolute top-2.5 left-2.5 right-2.5 flex flex-wrap gap-1 pointer-events-none">
                    {statusBadge(compat.status, compat.reason)}
                    {isEnabled && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-accent/20 text-accent border border-accent/30">
                        {t('onlinefix.enabled')}
                      </span>
                    )}
                  </div>

                  <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent" />

                  <div className="absolute bottom-0 left-0 right-0 p-2.5 pt-6 z-10">
                    <p className="text-xs font-bold text-white leading-tight line-clamp-2 drop-shadow-md">
                      {game.name}
                    </p>
                    <p className="text-[10px] text-text-dim font-mono mt-0.5">AppID {game.appId}</p>
                    {compat.reason && compat.status === 'incompatible' && (
                      <p className="text-[11px] text-red-400/80 mt-1 line-clamp-1" title={getCompatibilityReason(compat.reason)}>
                        {getCompatibilityReason(compat.reason)}
                      </p>
                    )}
                  </div>

                  <div
                    className={`absolute inset-0 z-20 flex flex-col justify-end transition-all duration-300 bg-gradient-to-t from-black/90 via-black/40 to-transparent pointer-events-none ${
                      isDisabled ? 'opacity-0' : 'opacity-0 group-hover/card:opacity-100'
                    }`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      onClick={(e) => { e.stopPropagation(); handleToggle(game.appId, game.name) }}
                      disabled={isLoading || isDisabled}
                      className={`pointer-events-auto mx-2.5 mb-2.5 px-4 py-2 rounded-lg text-xs font-bold text-white transition-all shadow-lg ${
                        isEnabled
                          ? 'bg-white/[0.15] hover:bg-white/[0.25] border border-white/20'
                          : 'bg-gradient-to-r from-accent to-accent-dark shadow-accent/25 hover:brightness-110'
                      } ${isLoading ? 'opacity-70 cursor-wait' : ''}`}
                    >
                      {isLoading ? (
                        <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                      ) : isEnabled ? (
                        <span className="flex items-center justify-center gap-2">
                          <X className="w-5 h-5" />
                          {t('onlinefix.disable')}
                        </span>
                      ) : (
                        <span className="flex items-center justify-center gap-2">
                          <Wifi className="w-5 h-5" />
                          {t('onlinefix.enable')}
                        </span>
                      )}
                    </button>
                  </div>
                </div>
              </Card3D>
            )
          })}
        </div>
      )}
    </div>
  )
}
