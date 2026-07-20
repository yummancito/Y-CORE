import { useState, useEffect, useMemo } from 'react'
import { Search, Wifi, X, AlertTriangle, CheckCircle2, XCircle, Loader2, Filter, Gamepad2, Zap, Trash2 } from 'lucide-react'
import { t } from '../lib/i18n'
import { useLibraryStore } from '../stores/useLibraryStore'
import { useToastStore } from '../stores/useToastStore'
import { usePageHeader } from '../components/layout/AppShell'
import { getCoverUrl } from '../domain/utils'
import { CoverImage } from '../components/ui/CoverImage'
import { Card3D } from '../components/ui/Card3D'
import { getCompatibility, getCompatibilityReason, type CompatibilityStatus } from '../lib/onlinefix-compatibility'
import { getOnlineFixCompatibilityBatch } from '../lib/y-core-api'

interface FixStatus {
  hasSteamApi: boolean
  is64Bit: boolean
  hasFix: boolean
  hasConfig: boolean
  gameDir?: string
}

export default function OnlineFixPage() {
  usePageHeader(
    <div className="flex items-center justify-between w-full">
      <div>
        <h1 className="text-lg font-bold text-text-bright">{t('onlinefix.ycoreOnline')}</h1>
        <p className="text-sm text-text-dim">{t('onlinefix.description')}</p>
      </div>
    </div>, [])
  const { games, loadGames, loading } = useLibraryStore()
  const { showToast } = useToastStore()
  const [searchQuery, setSearchQuery] = useState('')
  const [filter, setFilter] = useState<CompatibilityStatus | 'all'>('all')
  const [fixStatusMap, setFixStatusMap] = useState<Record<string, FixStatus>>({})
  const [loadingMap, setLoadingMap] = useState<Set<string>>(new Set())
  const [compatMap, setCompatMap] = useState<Record<string, { status: CompatibilityStatus; reason?: string }>>({})
  const [compatLoading, setCompatLoading] = useState(false)
  const [hideWarning, setHideWarning] = useState(false)
  const [hoveredCard, setHoveredCard] = useState(-1)

  useEffect(() => {
    loadGames()
    window.steamtools?.readConfig?.().then((cfg: any) => {
      if (cfg?.hideOnlineFixWarning) setHideWarning(true)
    }).catch((e) => console.warn('[OnlineFix] readConfig failed:', e))
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

    // Detect fix status for each game
    games.forEach((game) => {
      window.steamtools.detectOnlineFix(game.appId).then((result: FixStatus) => {
        setFixStatusMap((prev) => ({ ...prev, [game.appId]: result }))
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
        (g.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        g.appId.includes(searchQuery)
      const compat = resolveCompat(g.appId)
      const matchesFilter = filter === 'all' || compat.status === filter
      return matchesSearch && matchesFilter
    })
  }, [games, searchQuery, filter, compatMap])

  const handleGenerate = async (appId: string, gameName: string) => {
    setLoadingMap((prev) => new Set(prev).add(appId))
    const displayName = gameName || `App ${appId}`
    try {
      const result = await window.steamtools.generateOnlineFix(appId)
      if (result.success) {
        const detect = await window.steamtools.detectOnlineFix(appId)
        setFixStatusMap((prev) => ({ ...prev, [appId]: detect }))
        showToast('success', `${t('onlinefix.generateSuccess')} ${displayName}`)
      } else {
        showToast('error', result.error || t('onlinefix.generateFailed'))
      }
    } catch (err: any) {
      showToast('error', err.message || t('onlinefix.generateFailed'))
    } finally {
      setLoadingMap((prev) => {
        const next = new Set(prev)
        next.delete(appId)
        return next
      })
    }
  }

  const handleRemove = async (appId: string, gameName: string) => {
    setLoadingMap((prev) => new Set(prev).add(appId))
    const displayName = gameName || `App ${appId}`
    try {
      const result = await window.steamtools.removeOnlineFix(appId)
      if (result.success) {
        const detect = await window.steamtools.detectOnlineFix(appId)
        setFixStatusMap((prev) => ({ ...prev, [appId]: detect }))
        showToast('success', `${t('onlinefix.removeSuccess')} ${displayName}`)
      } else {
        showToast('error', result.error || t('onlinefix.removeFailed'))
      }
    } catch (err: any) {
      showToast('error', err.message || t('onlinefix.removeFailed'))
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
        <span
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold tracking-wide"
          style={{ background: 'rgba(34,197,94,0.18)', backdropFilter: 'blur(8px)', color: '#4ade80', border: '1px solid rgba(34,197,94,0.3)' }}
        >
          <CheckCircle2 className="w-[10px] h-[10px]" strokeWidth={2.5} />
          COMPATIBLE
        </span>
      )
    }
    if (status === 'incompatible') {
      return (
        <span
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold tracking-wide"
          style={{ background: 'rgba(239,68,68,0.18)', backdropFilter: 'blur(8px)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)' }}
          title={getCompatibilityReason(reason)}
        >
          <XCircle className="w-[10px] h-[10px]" strokeWidth={2.5} />
          INCOMPATIBLE
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
    <div className="px-6 py-5 w-full animate-fade-in">
      {/* Warning banner */}
      {!hideWarning && (
        <div
          className="flex items-start gap-3.5 p-4 rounded-xl mb-5 animate-fade-in"
          style={{ background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.25)' }}
        >
          <span
            className="flex-shrink-0 w-[38px] h-[38px] rounded-xl flex items-center justify-center"
            style={{ background: 'rgba(234,179,8,0.15)' }}
          >
            <AlertTriangle className="w-[19px] h-[19px]" style={{ color: '#eab308' }} strokeWidth={1.8} />
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-[13.5px] font-bold mb-1" style={{ color: '#fde68a' }}>Usa los fixes bajo tu responsabilidad</p>
            <p className="text-[12.5px] leading-relaxed text-text-secondary" style={{ textWrap: 'pretty' }}>
              El fix modifica archivos del juego para habilitar el multijugador. Haz una copia de seguridad antes de aplicarlo y desactívalo antes de verificar archivos en Steam.
            </p>
          </div>
          <button
            onClick={dismissWarning}
            className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center bg-transparent border-none text-text-dim hover:bg-white/[0.08] hover:text-white cursor-pointer transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Search */}
      <div className="relative mb-4">
        <div className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center text-text-muted pointer-events-none">
          <Search className="w-[18px] h-[18px]" />
        </div>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={t('onlinefix.searchPlaceholder')}
          className="w-full min-h-[52px] pr-12 py-3 rounded-xl bg-white/[0.06] text-[15px] text-text-bright placeholder:text-text-muted border border-white/[0.12] focus:border-accent/50 focus:outline-none transition-colors outline-none"
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

      {/* Filter tabs */}
      <div className="flex items-center gap-2 mb-5 overflow-x-auto pb-1">
        <Filter className="w-[18px] h-[18px] text-text-dim mr-1 flex-shrink-0" strokeWidth={1.8} />
        {filterTabs.map((tab) => {
          const active = filter === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => setFilter(tab.id)}
              className="px-5 py-2.5 rounded-xl text-sm font-semibold whitespace-nowrap transition-colors cursor-pointer"
              style={{
                background: active ? 'rgba(59,178,247,0.25)' : 'rgba(255,255,255,0.06)',
                color: active ? '#3BB2F7' : '#e4e4e7',
                border: `1px solid ${active ? 'rgba(59,178,247,0.5)' : 'rgba(255,255,255,0.1)'}`,
              }}
            >
              {tab.label}
            </button>
          )
        })}
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
          {filteredGames.map((game, idx) => {
            const compat = resolveCompat(game.appId)
            const fixStatus = fixStatusMap[game.appId]
            const hasFix = fixStatus?.hasFix ?? false
            const hasSteamApi = fixStatus?.hasSteamApi ?? true
            const isLoading = loadingMap.has(game.appId)
            const isDisabled = compat.status === 'incompatible' || !hasSteamApi

            return (
              <Card3D
                key={game.appId}
                className="group/card cursor-pointer"
                style={{ opacity: isDisabled ? 0.55 : 1 }}
              >
                <div
                  className="relative aspect-[2/3] overflow-hidden rounded-xl transition-all duration-300"
                  style={{
                    border: `1px solid ${isDisabled ? 'rgba(255,255,255,0.06)' : hoveredCard === idx ? 'rgba(59,178,247,0.55)' : 'rgba(255,255,255,0.06)'}`,
                    boxShadow: isDisabled
                      ? '0 8px 28px rgba(0,0,0,0.35)'
                      : hoveredCard === idx
                        ? '0 0 0 1px rgba(59,178,247,0.55), 0 0 26px rgba(59,178,247,0.3), 0 14px 40px rgba(0,0,0,0.5)'
                        : '0 8px 28px rgba(0,0,0,0.35)',
                    transform: !isDisabled && hoveredCard === idx ? 'translateY(-4px)' : 'none',
                    animation: 'card-enter 0.4s ease-out both',
                    animationDelay: `${Math.min(idx, 8) * 0.05}s`,
                  }}
                  onMouseEnter={() => !isDisabled && setHoveredCard(idx)}
                  onMouseLeave={() => setHoveredCard(-1)}
                >
                  <div
                    className="w-full h-full transition-all duration-[400ms] ease-out"
                    style={{
                      transform: !isDisabled && hoveredCard === idx ? 'scale(1.05)' : 'scale(1)',
                      filter: !isDisabled && hoveredCard === idx ? 'brightness(0.6)' : 'brightness(1)',
                    }}
                  >
                    <CoverImage
                      src={getCoverUrl(game.appId)}
                      fallbackSrc={`https://depotbox.org/api/images/steam-header/${game.appId}`}
                      alt={game.name}
                      className="w-full h-full object-cover"
                    />
                  </div>

                  <div className="absolute top-2.5 left-2.5 right-2.5 flex flex-wrap gap-1.5 pointer-events-none z-10">
                    {statusBadge(compat.status, compat.reason)}
                    {hasFix && (
                      <span
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold tracking-wide"
                        style={{ background: 'rgba(59,178,247,0.2)', backdropFilter: 'blur(8px)', color: '#3BB2F7', border: '1px solid rgba(59,178,247,0.35)' }}
                      >
                        <Zap className="w-[10px] h-[10px] fill-current" stroke="none" />
                        FIX ACTIVO
                      </span>
                    )}
                    {!hasSteamApi && fixStatus && (
                      <span
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold tracking-wide"
                        style={{ background: 'rgba(234,179,8,0.18)', color: '#eab308', border: '1px solid rgba(234,179,8,0.3)' }}
                      >
                        NO STEAM API
                      </span>
                    )}
                  </div>

                  <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(9,9,11,0.9) 0%, rgba(9,9,11,0.2) 40%, transparent 65%)' }} />

                  <div className="absolute bottom-0 left-0 right-0 p-3 z-10">
                    <p className="text-sm font-bold text-white leading-tight line-clamp-2" style={{ textShadow: '0 1px 4px rgba(0,0,0,0.6)' }}>
                      {game.name || `App ${game.appId}`}
                    </p>
                    <p className="text-[10px] text-text-dim font-mono mt-0.5">AppID {game.appId}</p>
                    {compat.reason && compat.status === 'incompatible' && (
                      <p className="text-[10.5px] mt-1" style={{ color: 'rgba(248,113,113,0.85)' }} title={getCompatibilityReason(compat.reason)}>
                        {getCompatibilityReason(compat.reason)}
                      </p>
                    )}
                  </div>

                  {!isDisabled && (
                    <div
                      className="absolute inset-0 z-20 flex flex-col justify-end p-3 transition-all duration-300"
                      style={{
                        background: 'linear-gradient(to top, rgba(9,9,11,0.92), rgba(9,9,11,0.4) 55%, transparent)',
                        backdropFilter: 'blur(3px)',
                        opacity: hoveredCard === idx ? 1 : 0,
                        pointerEvents: hoveredCard === idx ? 'auto' : 'none',
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        onClick={(e) => { e.stopPropagation(); hasFix ? handleRemove(game.appId, game.name || '') : handleGenerate(game.appId, game.name || '') }}
                        disabled={isLoading}
                        className="flex items-center justify-center gap-2 w-full py-[11px] rounded-xl text-sm font-bold border-none cursor-pointer transition-all"
                        style={{
                          color: hasFix ? '#fff' : '#0b0b0d',
                          background: hasFix ? 'rgba(255,255,255,0.14)' : 'linear-gradient(135deg,#3BB2F7,#6ED0FF)',
                          border: hasFix ? '1px solid rgba(255,255,255,0.22)' : 'none',
                          boxShadow: hasFix ? 'none' : '0 6px 20px rgba(59,178,247,0.4)',
                        }}
                      >
                        {isLoading ? (
                          <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                        ) : hasFix ? (
                          <>
                            <Trash2 className="w-[15px] h-[15px]" />
                            Quitar fix
                          </>
                        ) : (
                          <>
                            <Zap className="w-[15px] h-[15px] fill-current" stroke="none" />
                            Generar fix
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              </Card3D>
            )
          })}
        </div>
      )}
    </div>
  )
}
