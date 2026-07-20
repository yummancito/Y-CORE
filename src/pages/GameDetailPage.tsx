import { useState, useEffect, useMemo, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, ChevronLeft, ChevronRight, Download, X,
  Heart, Loader2, AlertCircle,
} from 'lucide-react'
import { t } from '../lib/i18n'
import { useToastStore } from '../stores/useToastStore'
import { useLibraryStore } from '../stores/useLibraryStore'
import { useDownloadQueueStore } from '../stores/useDownloadQueueStore'
import { fetchAppDetails, getSteamCdnUrl, parseRequirementsHtml, type SteamAppDetails } from '../lib/steam-store-api'
import { useRecommendationStore } from '../stores/useRecommendationStore'
import { getLauncherInfo } from '../lib/onlinefix-compatibility'
import { type MergedGame } from '../components/store/GameCard'
import { ConfirmModal } from '../components/ui/ConfirmModal'
import { usePageHeader } from '../components/layout/AppShell'

export default function GameDetailPage() {
  const { appId } = useParams<{ appId: string }>()
  const navigate = useNavigate()
  const { showToast } = useToastStore()
  const enqueueGame = useDownloadQueueStore((s) => s.enqueue)
  const queuedAppIds = useDownloadQueueStore((s) => s.queue)
  const currentInstall = useDownloadQueueStore((s) => s.current)
  const consumeGame = useRecommendationStore((s) => s.consumeGame)
  const { games: installedGames } = useLibraryStore()

  const [details, setDetails] = useState<SteamAppDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [selectedMedia, setSelectedMedia] = useState(0)
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [reqTab, setReqTab] = useState<'min' | 'rec'>('min')
  const [favorited, setFavorited] = useState(false)
  const [confirmDialog, setConfirmDialog] = useState<{ title: string; message: string; onConfirm: () => void; variant?: 'danger' | 'warning' } | null>(null)
  const [heroLoaded, setHeroLoaded] = useState(false)
  const [portraitLoaded, setPortraitLoaded] = useState(false)
  const [videoPlaying, setVideoPlaying] = useState(false)
  const [videoError, setVideoError] = useState(false)

  usePageHeader(
    details ? (
      <div className="flex items-center gap-3.5 flex-1 min-w-0 h-full">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 h-10 px-3.5 rounded-xl text-sm font-semibold transition-colors cursor-pointer flex-shrink-0"
          style={{ color: '#e4e4e7', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          <ArrowLeft className="w-5 h-5" />
          Volver
        </button>
        <div className="flex items-center gap-2 min-w-0 text-sm" style={{ color: '#71717a' }}>
          <span>Tienda</span>
          <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" />
          <span className="font-semibold truncate" style={{ color: '#e4e4e7' }}>{details.name}</span>
        </div>
      </div>
    ) : null,
    [details, navigate],
  )

  const isInstalled = appId ? installedGames.some((g) => g.appId === appId) : false
  const isInstalling = appId ? currentInstall?.appId === appId : false
  const isQueued = appId ? queuedAppIds.some((q) => q.appId === appId) : false
  const heroUrl = appId ? getSteamCdnUrl(appId, 'hero') : ''
  const portraitUrl = appId ? getSteamCdnUrl(appId, 'portrait') : ''
  const headerUrl = appId ? getSteamCdnUrl(appId, 'header') : ''
  const capsuleUrl = appId ? getSteamCdnUrl(appId, 'capsule') : ''

  const fetchDetails = useCallback(async () => {
    if (!appId) return
    setLoading(true)
    setError(false)
    setHeroLoaded(false)
    setPortraitLoaded(false)
    try {
      const data = await fetchAppDetails(appId)
      if (data) {
        setDetails(data)
      } else {
        setError(true)
      }
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [appId])

  useEffect(() => {
    fetchDetails()
  }, [fetchDetails])

  const mediaItems = useMemo(() => {
    const items: { type: 'image' | 'video'; thumb: string; full: string; name?: string }[] = []
    if (details?.movies) {
      for (const m of details.movies) {
        const videoUrl = m.webm?.max || m.mp4?.max || ''
        if (!videoUrl) continue
        items.push({ type: 'video', thumb: m.thumbnail, full: videoUrl, name: m.name })
      }
    }
    if (details?.screenshots) {
      for (const s of details.screenshots) {
        if (s.path_thumbnail.includes('/ss_')) {
          items.push({ type: 'image', thumb: s.path_thumbnail, full: s.path_full })
        }
      }
    }
    if (items.length === 0) {
      items.push({ type: 'image', thumb: headerUrl, full: headerUrl })
    }
    return items
  }, [details, heroUrl, headerUrl])

  const currentMedia = mediaItems[selectedMedia] || mediaItems[0]
  const reqRows = useMemo(() => {
    if (!details?.pc_requirements) return []
    const html = reqTab === 'min' ? details.pc_requirements.minimum : details.pc_requirements.recommended
    return parseRequirementsHtml(html)
  }, [details, reqTab])

  const handleInstall = useCallback(() => {
    if (!appId || !details) return
    const launcherInfo = getLauncherInfo(appId)
    if (launcherInfo) {
      setConfirmDialog({
        title: t('store.incompatibleLauncherTitle'),
        message: `${t('store.incompatibleLauncher').replace('{launcher}', launcherInfo.launcher)}\n\n${t('store.installAnyway')}?`,
        variant: 'warning',
        onConfirm: () => {
          enqueueGame({ appId, name: details.name })
        },
      })
      return
    }
    enqueueGame({ appId, name: details.name })
  }, [appId, details, enqueueGame])

  if (loading) {
    return (
      <div data-section="GameDetail" className="min-h-full animate-fade-in">
        <div className="h-[440px]" style={{ background: '#18181b' }} />
        <div style={{ padding: '36px 40px', display: 'flex', flexWrap: 'wrap', gap: 32 }}>
          <div style={{ flex: '1 1 560px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div className="rounded-lg w-[240px] h-[26px]" style={{ background: '#18181b' }} />
            <div className="rounded-xl w-full" style={{ aspectRatio: '16/9', background: '#18181b' }} />
            <div style={{ display: 'flex', gap: 10 }}>
              {[1, 2, 3].map((i) => <div key={i} className="rounded-lg" style={{ width: 150, height: 84, background: '#18181b' }} />)}
            </div>
            <div className="rounded-xl w-full h-[120px]" style={{ background: '#18181b' }} />
          </div>
          <div style={{ flex: '1 1 320px', maxWidth: 380, display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div className="rounded-2xl w-full h-[220px]" style={{ background: '#18181b' }} />
            <div className="rounded-2xl w-full h-[260px]" style={{ background: '#18181b' }} />
          </div>
        </div>
      </div>
    )
  }

  if (error || !details) {
    return (
      <div data-section="GameDetail" className="min-h-full flex flex-col items-center justify-center px-10 text-center animate-fade-in" style={{ minHeight: '70vh' }}>
        <div className="w-[76px] h-[76px] rounded-full flex items-center justify-center mb-5" style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)' }}>
          <AlertCircle className="w-9 h-9" style={{ color: '#ef4444' }} strokeWidth={1.8} />
        </div>
        <h2 className="text-[22px] font-bold text-white mb-2">No se pudieron cargar los detalles</h2>
        <p className="text-sm text-text-secondary mb-6" style={{ maxWidth: 420, lineHeight: 1.6 }}>
          La información de Steam no está disponible en este momento. Comprueba tu conexión e inténtalo de nuevo.
        </p>
        <div className="flex gap-3">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2.5 px-[26px] py-3.5 rounded-xl text-sm font-semibold text-text-secondary bg-white/[0.06] border border-white/[0.1] hover:bg-white/[0.1] hover:text-text-bright transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            Volver
          </button>
          <button
            onClick={fetchDetails}
            className="flex items-center gap-2.5 px-[26px] py-3.5 rounded-xl text-sm font-bold text-white border-none cursor-pointer transition-all hover:brightness-110"
            style={{ background: 'linear-gradient(135deg,#3BB2F7,#2A8FD1)', boxShadow: '0 8px 24px rgba(59,178,247,0.3)' }}
          >
            <Loader2 className="w-4 h-4" />
            Reintentar
          </button>
        </div>
      </div>
    )
  }

  const mediaVals = mediaItems.map((m, i) => ({
    thumb: m.thumb,
    isVideo: m.type === 'video',
    border: i === selectedMedia ? '2px solid #3BB2F7' : '2px solid rgba(255,255,255,0.08)',
    glow: i === selectedMedia ? '0 0 0 1px #3BB2F7, 0 6px 20px rgba(59,178,247,0.35)' : 'none',
  }))

  return (
    <div data-section="GameDetail" className="min-h-full animate-fade-in">
      {/* Hero section */}
      <section
        className="relative w-full overflow-hidden"
        style={{ minHeight: 440, height: '440px' }}
      >
        {!heroLoaded && (
          <div className="absolute inset-0" style={{ background: '#18181b' }} />
        )}
        <img
          src={heroUrl}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
          onLoad={() => setHeroLoaded(true)}
          onError={(e) => {
            const img = e.target as HTMLImageElement
            if (!img.dataset.fallback) {
              img.dataset.fallback = 'true'
              img.src = `https://cdn.akamai.steamstatic.com/steam/apps/${appId}/header.jpg`
            } else {
              img.style.display = 'none'
            }
          }}
          style={{ opacity: heroLoaded ? 1 : 0, transition: 'opacity 0.3s ease', willChange: 'transform', backfaceVisibility: 'hidden' }}
        />
        <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, #09090b 2%, rgba(9,9,11,0.72) 38%, rgba(9,9,11,0.25) 78%, rgba(9,9,11,0.35) 100%)' }} />
        <div className="absolute inset-0" style={{ background: 'linear-gradient(to right, rgba(9,9,11,0.85) 0%, rgba(9,9,11,0.35) 45%, transparent 75%)' }} />
        <div className="absolute bottom-0 left-0 right-0 p-10 flex gap-7 items-end">
          {!portraitLoaded && (
            <div className="w-[200px] flex-shrink-0 rounded-xl" style={{ aspectRatio: '2/3', background: '#18181b' }} />
          )}
          <img
            src={portraitUrl}
            alt=""
            className="w-[200px] flex-shrink-0 rounded-xl object-cover"
            style={{
              boxShadow: '0 16px 48px rgba(0,0,0,0.6)',
              border: '1px solid rgba(255,255,255,0.1)',
              display: portraitLoaded ? 'block' : 'none',
              willChange: 'transform',
              backfaceVisibility: 'hidden',
            }}
            onLoad={() => setPortraitLoaded(true)}
            onError={(e) => {
              const img = e.target as HTMLImageElement
              if (!img.dataset.fallback) {
                img.dataset.fallback = 'true'
                img.src = headerUrl
              } else {
                img.style.display = 'none'
              }
            }}
          />
          <div className="min-w-0" style={{ maxWidth: 760 }}>
            {details.genres && details.genres.length > 0 && (
              <div className="flex gap-2 flex-wrap mb-3.5">
                {details.genres?.slice(0, 3).map((g) => (
                  <span
                    key={g.id}
                    className="text-[11px] font-semibold tracking-wide uppercase px-2.5 py-1 rounded-full"
                    style={{ color: '#3BB2F7', background: 'rgba(59,178,247,0.12)', border: '1px solid rgba(59,178,247,0.25)' }}
                  >
                    {g.description}
                  </span>
                ))}
              </div>
            )}
            <h1 className="text-[52px] font-extrabold text-white leading-[1.02] tracking-[-0.02em] mb-3" style={{ textShadow: '0 4px 24px rgba(0,0,0,0.5)', textWrap: 'balance' }}>
              {details.name}
            </h1>
            <p className="text-base leading-relaxed mb-[18px] max-w-[640px]" style={{ color: '#d4d4d8', textWrap: 'pretty' }}>
              {details.short_description}
            </p>
            <div className="flex gap-[22px] flex-wrap mb-6 text-sm" style={{ color: '#a1a1aa' }}>
              {details.developers?.length > 0 && (
                <span className="flex items-center gap-[7px]">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18"/><path d="M5 21V7l7-4 7 4v14"/><path d="M9 9h.01M9 13h.01M9 17h.01M15 9h.01M15 13h.01M15 17h.01"/></svg>
                  <span style={{ color: '#e4e4e7' }}>{details.developers[0]}</span>
                </span>
              )}
              <span className="flex items-center gap-[7px]">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                <span style={{ color: '#e4e4e7' }}>{details.release_date?.date || '—'}</span>
              </span>
              <span className="flex items-center gap-[7px] font-mono">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
                <span style={{ color: '#e4e4e7' }}>AppID {appId}</span>
              </span>
            </div>
            <div className="flex gap-3.5 flex-wrap items-center">
              <button
                onClick={handleInstall}
                disabled={isInstalling || isQueued || isInstalled}
                className="flex items-center gap-2.5 px-8 py-3.5 rounded-xl text-base font-bold text-white border-none transition-all hover:brightness-110 hover:-translate-y-px disabled:hover:brightness-100 disabled:hover:translate-y-0 disabled:cursor-default"
                style={{
                  background: isInstalling || isQueued
                    ? 'rgba(255,255,255,0.12)'
                    : 'linear-gradient(135deg,#3BB2F7,#2A8FD1)',
                  boxShadow: isInstalling || isQueued ? 'none' : '0 8px 24px rgba(59,178,247,0.35)',
                  cursor: isInstalling || isQueued || isInstalled ? 'default' : 'pointer',
                }}
              >
                {isInstalling ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Download className="w-5 h-5" />
                )}
                {isInstalling
                  ? t('store.installing')
                  : isQueued
                    ? t('store.queued')
                    : isInstalled
                      ? t('library.play')
                      : t('store.install')}
              </button>
              <button
                onClick={() => setFavorited(!favorited)}
                className="w-[52px] h-[52px] flex items-center justify-center rounded-xl cursor-pointer transition-colors"
                style={{
                  background: favorited ? 'rgba(239,68,68,0.14)' : 'rgba(255,255,255,0.06)',
                  border: `1px solid ${favorited ? 'rgba(239,68,68,0.4)' : 'rgba(255,255,255,0.1)'}`,
                  color: favorited ? '#ef4444' : '#e4e4e7',
                }}
              >
                <Heart className="w-5 h-5" fill={favorited ? '#ef4444' : 'none'} strokeWidth={favorited ? 1.8 : 1.8} />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Content section */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 32, padding: '36px 40px 56px', alignItems: 'flex-start' }}>
        {/* Main column */}
        <div style={{ flex: '1 1 560px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 36 }}>
          {/* Media gallery */}
          <section>
            <h2 className="text-xl font-bold text-white mb-4">Capturas y vídeos</h2>
            <div className="relative w-full rounded-xl overflow-hidden"
              style={{ aspectRatio: '16/9', background: '#18181b', border: '1px solid rgba(255,255,255,0.06)' }}
            >
              {currentMedia.type === 'video' && videoPlaying && !videoError ? (
                <video
                  src={currentMedia.full}
                  className="w-full h-full"
                  controls
                  autoPlay
                  style={{ background: '#000' }}
                  onError={() => setVideoError(true)}
                />
              ) : (
                <div className="relative w-full h-full cursor-pointer group" onClick={() => {
                  if (currentMedia.type === 'video') {
                    setVideoError(false)
                    setVideoPlaying(true)
                  } else {
                    setLightboxOpen(true)
                  }
                }}>
                  <img
                    src={currentMedia.type === 'video' ? currentMedia.thumb : currentMedia.full}
                    alt=""
                    className="w-full h-full object-cover"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                    style={{ willChange: 'transform', backfaceVisibility: 'hidden' }}
                  />
                  {currentMedia.type === 'video' && (
                    <div className="absolute inset-0 flex items-center justify-center transition-all duration-300"
                      style={{ background: 'rgba(0,0,0,0.25)' }}
                    >
                      <div className="w-[68px] h-[68px] rounded-full flex items-center justify-center transition-all duration-300 group-hover:scale-110 group-hover:bg-accent/40"
                        style={{ background: 'rgba(59,178,247,0.25)', backdropFilter: 'blur(4px)', border: '2px solid rgba(255,255,255,0.3)' }}
                      >
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="white"><polygon points="8,5 19,12 8,19"/></svg>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="flex gap-2.5 overflow-x-auto pt-3.5 pb-1 scrollbar-modern" style={{ scrollbarWidth: 'auto' }}>
              {mediaVals.map((m, i) => (
                <button
                  key={i}
                  onClick={() => { setSelectedMedia(i); setVideoPlaying(false); setVideoError(false) }}
                  className="flex-shrink-0 rounded-lg overflow-hidden cursor-pointer p-0 transition-all duration-200"
                  style={{ width: 150, height: 84, border: m.border, boxShadow: m.glow, background: '#18181b' }}
                >
                  <div className="relative w-full h-full">
                    <img src={m.thumb} alt="" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
                    {m.isVideo && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-[32px] h-[32px] rounded-full flex items-center justify-center"
                          style={{ background: 'rgba(0,0,0,0.5)', border: '1.5px solid rgba(255,255,255,0.25)' }}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="white"><polygon points="8,5 19,12 8,19"/></svg>
                        </div>
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </section>

          {/* About section */}
          <section>
            <h2 className="text-xl font-bold text-white mb-4">Acerca de este juego</h2>
            <div
              className="text-[15px] leading-relaxed max-w-[760px]"
              style={{ color: '#c9c9d1' }}
              dangerouslySetInnerHTML={{ __html: details.about_the_game || details.detailed_description || '' }}
            />
          </section>
        </div>

        {/* Sidebar */}
        <aside style={{ flex: '1 1 320px', maxWidth: 380, display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Details card */}
          <div className="rounded-2xl p-5" style={{ background: '#18181b', border: '1px solid rgba(255,255,255,0.06)', boxShadow: '0 8px 32px rgba(0,0,0,0.35)' }}>
            <h3 className="text-sm font-bold uppercase tracking-wide mb-4" style={{ color: '#71717a' }}>Detalles</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {details.developers?.length > 0 && (
                <div style={{ display: 'flex', gap: 12, padding: '9px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <span style={{ flex: '0 0 110px', color: '#71717a', fontSize: 13 }}>Desarrollador</span>
                  <span style={{ flex: 1, color: '#e4e4e7', fontSize: 13, fontWeight: 500 }}>{details.developers.join(', ')}</span>
                </div>
              )}
              {details.publishers?.length > 0 && (
                <div style={{ display: 'flex', gap: 12, padding: '9px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <span style={{ flex: '0 0 110px', color: '#71717a', fontSize: 13 }}>Distribuidor</span>
                  <span style={{ flex: 1, color: '#e4e4e7', fontSize: 13, fontWeight: 500 }}>{details.publishers.join(', ')}</span>
                </div>
              )}
              <div style={{ display: 'flex', gap: 12, padding: '9px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <span style={{ flex: '0 0 110px', color: '#71717a', fontSize: 13 }}>Lanzamiento</span>
                <span style={{ flex: 1, color: '#e4e4e7', fontSize: 13, fontWeight: 500 }}>{details.release_date?.date || '—'}</span>
              </div>
            </div>
            {details.genres && details.genres.length > 0 && (
              <>
                <p className="text-xs font-semibold uppercase tracking-wide mt-4 mb-2.5" style={{ color: '#71717a' }}>Géneros</p>
                <div className="flex gap-2 flex-wrap mb-4">
                  {details.genres?.map((g) => (
                    <span
                      key={g.id}
                      className="text-xs px-[11px] py-[5px] rounded-lg"
                      style={{ color: '#3BB2F7', background: 'rgba(59,178,247,0.1)', border: '1px solid rgba(59,178,247,0.2)' }}
                    >
                      {g.description}
                    </span>
                  ))}
                </div>
              </>
            )}
            {details.categories && details.categories.length > 0 && (
              <>
                <p className="text-xs font-semibold uppercase tracking-wide mt-0 mb-2.5" style={{ color: '#71717a' }}>Categorías</p>
                <div className="flex gap-2 flex-wrap">
                  {details.categories?.map((c) => (
                    <span
                      key={c.id}
                      className="text-xs px-[11px] py-[5px] rounded-lg"
                      style={{ color: '#d4d4d8', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
                    >
                      {c.description}
                    </span>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* System requirements */}
          {details?.pc_requirements && (
            <div className="rounded-2xl p-5" style={{ background: '#18181b', border: '1px solid rgba(255,255,255,0.06)', boxShadow: '0 8px 32px rgba(0,0,0,0.35)' }}>
              <h3 className="text-sm font-bold uppercase tracking-wide mb-4" style={{ color: '#71717a' }}>Requisitos del sistema</h3>
              <div className="flex gap-1.5 p-1 rounded-xl mb-4" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <button
                  onClick={() => { setReqTab('min'); }}
                  className="flex-1 py-2 rounded-lg text-sm font-semibold border-none cursor-pointer transition-all"
                  style={{
                    background: reqTab === 'min' ? '#3BB2F7' : 'transparent',
                    color: reqTab === 'min' ? '#0b0b0d' : '#a1a1aa',
                  }}
                >
                  Mínimos
                </button>
                <button
                  onClick={() => { setReqTab('rec'); }}
                  className="flex-1 py-2 rounded-lg text-sm font-semibold border-none cursor-pointer transition-all"
                  style={{
                    background: reqTab === 'rec' ? '#3BB2F7' : 'transparent',
                    color: reqTab === 'rec' ? '#0b0b0d' : '#a1a1aa',
                  }}
                >
                  Recomendados
                </button>
              </div>
              {reqRows.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {reqRows.map((r, i) => (
                    <div key={i} style={{ display: 'flex', gap: 12, padding: '9px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <span style={{ flex: '0 0 96px', color: '#71717a', fontSize: 12 }}>{r.label}</span>
                      <span style={{ flex: 1, color: '#d4d4d8', fontSize: 12, lineHeight: 1.5 }}>{r.value}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-center py-4" style={{ color: '#71717a' }}>
                  No disponible para este juego
                </p>
              )}
            </div>
          )}
        </aside>
      </div>

      {/* Lightbox */}
      {lightboxOpen && currentMedia.type === 'image' && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center"
          style={{ background: 'rgba(5,5,7,0.92)', backdropFilter: 'blur(6px)' }}
          onClick={() => setLightboxOpen(false)}
        >
          <button
            onClick={() => setLightboxOpen(false)}
            className="absolute top-5 right-5 w-[46px] h-[46px] rounded-full flex items-center justify-center cursor-pointer transition-colors"
            style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff' }}
          >
            <X className="w-[22px] h-[22px]" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setSelectedMedia((prev) => (prev - 1 + mediaItems.length) % mediaItems.length) }}
            className="absolute left-5 top-1/2 -translate-y-1/2 w-[52px] h-[52px] rounded-full flex items-center justify-center cursor-pointer transition-colors"
            style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff' }}
          >
            <ChevronLeft className="w-[26px] h-[26px]" />
          </button>
          <img
            src={currentMedia.full}
            alt=""
            className="max-w-[90%] max-h-[90%] object-contain rounded-xl"
            style={{ boxShadow: '0 24px 80px rgba(0,0,0,0.7)' }}
            onClick={(e) => e.stopPropagation()}
          />
          <button
            onClick={(e) => { e.stopPropagation(); setSelectedMedia((prev) => (prev + 1) % mediaItems.length) }}
            className="absolute right-5 top-1/2 -translate-y-1/2 w-[52px] h-[52px] rounded-full flex items-center justify-center cursor-pointer transition-colors"
            style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff' }}
          >
            <ChevronRight className="w-[26px] h-[26px]" />
          </button>
          <span className="absolute bottom-6 left-1/2 -translate-x-1/2 text-sm font-mono" style={{ color: '#a1a1aa' }}>
            {selectedMedia + 1} / {mediaItems.length}
          </span>
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
        />
      )}
    </div>
  )
}
