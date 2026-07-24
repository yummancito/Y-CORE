import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown, Play, User, X } from 'lucide-react'
import DetailHero from '../components/detail/DetailHero'
import CategoryRow from '../components/catalog/CategoryRow'
import LoadingState from '../components/common/LoadingState'
import { useToastStore } from '../stores/useToastStore'
import {
  displayTitle,
  formatDate,
  formatRuntime,
  profileUrl,
  stillUrl,
  youtubeThumb,
} from '../lib/tmdb'
import type { Episode, MediaDetails, Video } from '../types/media'

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2
      className="text-[22px] font-bold tracking-tight text-white mb-4"
      style={{ fontFamily: "'Bricolage Grotesque', sans-serif" }}
    >
      {children}
    </h2>
  )
}

export default function DetailPage() {
  const { mediaType = 'movie', id } = useParams<{ mediaType: string; id: string }>()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const pushToast = useToastStore((s) => s.push)

  const [detail, setDetail] = useState<MediaDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isFavorite, setIsFavorite] = useState(false)
  const [favoriteBusy, setFavoriteBusy] = useState(false)
  const [trailer, setTrailer] = useState<Video | null>(null)

  // Persistido en la URL (?s=N) para no perderse al volver desde WatchPage
  // con el botón "atrás" — antes era puro useState y siempre se reseteaba a
  // la primera temporada al remontar la página.
  const seasonFromUrl = parseInt(searchParams.get('s') || '')
  const [seasonNum, setSeasonNumState] = useState(Number.isFinite(seasonFromUrl) ? seasonFromUrl : 1)
  const seasonNumRef = useRef(seasonNum)
  seasonNumRef.current = seasonNum
  const setSeasonNum = (n: number) => {
    setSeasonNumState(n)
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('s', String(n))
      return next
    })
  }
  const [seasonOpen, setSeasonOpen] = useState(false)
  const [episodes, setEpisodes] = useState<Episode[]>([])
  const [episodesLoading, setEpisodesLoading] = useState(false)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    setLoading(true)
    setError(null)
    setDetail(null)

    window.api.catalogApi
      .getDetails(id)
      .then((d) => {
        if (cancelled) return
        if (!d) {
          setError('Contenido no encontrado')
          return
        }
        setDetail(d)
        // Si ya venía una temporada válida en la URL (el usuario volvió desde
        // WatchPage con "atrás"), respetarla en vez de resetear siempre a la
        // primera. Si no, elegir la primera temporada real — o, si la serie
        // solo tiene "Specials" (season_number 0), esa: sin este fallback la
        // sección de episodios desaparecía por completo y el especial quedaba
        // inalcanzable.
        const allSeasons = (d.seasons || []) as Array<{ season_number: number }>
        const hasValidUrlSeason = allSeasons.some((s) => s.season_number === seasonNumRef.current)
        if (!hasValidUrlSeason) {
          const firstSeason = allSeasons.find((s) => s.season_number > 0) ?? allSeasons[0]
          setSeasonNum(firstSeason?.season_number ?? 1)
        }
      })
      .catch((err) => {
        console.error('Detail load failed', err)
        if (!cancelled) setError('No pudimos cargar el detalle')
      })
      .finally(() => !cancelled && setLoading(false))

    window.api.favorites
      .isFavorite(id, mediaType as 'movie' | 'tv')
      .then((fav) => !cancelled && setIsFavorite(fav))
      .catch(() => {})

    return () => {
      cancelled = true
    }
  }, [mediaType, id])

  // Episodios de la temporada seleccionada — ya vienen completos dentro de
  // `detail.seasons` (catalogApi.getDetails trae seasons.episodes en un
  // solo request), solo hace falta filtrar client-side por seasonNum.
  useEffect(() => {
    if (mediaType !== 'tv' || !detail) return
    const season = (detail.seasons || []).find((s) => s.season_number === seasonNum)
    setEpisodes(season?.episodes ?? [])
  }, [mediaType, detail, seasonNum])

  async function toggleFavorite() {
    if (!detail || favoriteBusy) return
    setFavoriteBusy(true)
    try {
      if (isFavorite) {
        await window.api.favorites.remove(detail.id, mediaType as 'movie' | 'tv')
        setIsFavorite(false)
        pushToast('Quitado de favoritos', 'info')
      } else {
        await window.api.favorites.add({
          id: detail.id,
          mediaType,
          title: displayTitle(detail),
          posterPath: detail.poster_path,
          backdropPath: detail.backdrop_path,
          voteAverage: detail.vote_average,
        })
        setIsFavorite(true)
        pushToast('Agregado a favoritos', 'success')
      }
    } catch {
      pushToast('No se pudo actualizar favoritos', 'error')
    } finally {
      setFavoriteBusy(false)
    }
  }

  if (loading) {
    return (
      <div>
        <LoadingState variant="hero" />
        <div className="px-10 lg:px-14 py-12">
          <LoadingState variant="row" />
        </div>
      </div>
    )
  }

  if (error || !detail) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <p className="text-text-secondary">{error || 'Contenido no encontrado'}</p>
        <button className="btn-primary" onClick={() => navigate(-1)}>
          Volver atrás
        </button>
      </div>
    )
  }

  const cast = (detail.credits?.cast || []).slice(0, 15)
  const trailers = (detail.videos?.results || [])
    .filter((v) => v.site === 'YouTube' && (v.type === 'Trailer' || v.type === 'Teaser'))
    .slice(0, 4)
  const recommendations = detail.recommendations?.results || []
  // Mismo fallback que arriba: si solo existe la temporada 0 (Specials),
  // mostrarla en vez de dejar la sección de episodios vacía por completo.
  const realSeasons = (detail.seasons || []).filter((s) => s.season_number > 0)
  const seasons = realSeasons.length > 0 ? realSeasons : detail.seasons || []

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
      <DetailHero
        detail={detail}
        mediaType={mediaType}
        isFavorite={isFavorite}
        favoriteBusy={favoriteBusy}
        onPlay={() => navigate(`/watch/${mediaType}/${detail.id}`, { state: { media: detail } })}
        onToggleFavorite={toggleFavorite}
        onBack={() => navigate(-1)}
      />

      <div className="px-10 lg:px-14 pt-2 pb-16 flex flex-col gap-11">
        {/* Episodios (series) */}
        {mediaType === 'tv' && seasons.length > 0 && (
          <section>
            <div className="flex items-center gap-4 mb-4">
              <SectionTitle>Episodios</SectionTitle>
              <div className="relative -mt-4">
                <button
                  onClick={() => setSeasonOpen((o) => !o)}
                  className="h-8 flex items-center gap-1.5 px-4 rounded-full text-[12.5px] font-semibold bg-accent/15 text-accent border border-accent/40"
                >
                  Temporada {seasonNum}
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform ${seasonOpen ? 'rotate-180' : ''}`} />
                </button>
                {seasonOpen && (
                  <div className="absolute left-0 top-10 z-30 w-44 max-h-64 overflow-y-auto glass-strong rounded-xl p-1.5 shadow-card animate-slide-up">
                    {seasons.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => {
                          setSeasonNum(s.season_number)
                          setSeasonOpen(false)
                        }}
                        className={`w-full text-left px-3 py-2 rounded-lg text-[13px] transition-colors ${
                          s.season_number === seasonNum
                            ? 'text-accent font-semibold'
                            : 'text-text-secondary hover:text-white hover:bg-white/[0.06]'
                        }`}
                      >
                        {s.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {episodesLoading ? (
              <LoadingState variant="row" count={5} />
            ) : (
              <div className="flex gap-4 overflow-x-auto scrollbar-modern px-1 py-1.5 -mx-1">
                {episodes.map((ep) => (
                  <motion.button
                    key={ep.id}
                    onClick={() =>
                      navigate(`/watch/tv/${detail.id}?s=${seasonNum}&e=${ep.episode_number}`, {
                        state: { media: detail },
                      })
                    }
                    className="w-[270px] flex-none text-left"
                    whileHover={{ y: -4 }}
                    transition={{ duration: 0.25 }}
                  >
                    <div className="relative aspect-video rounded-xl overflow-hidden border border-white/[0.07] bg-surface-2">
                      {ep.still_path ? (
                        <img
                          src={stillUrl(ep.still_path) || ''}
                          alt={ep.name}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Play className="w-8 h-8 text-text-dim" />
                        </div>
                      )}
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity bg-black/30">
                        <div className="w-10 h-10 rounded-full bg-surface/60 border border-white/25 flex items-center justify-center">
                          <Play className="w-3.5 h-3.5 text-white fill-white ml-0.5" />
                        </div>
                      </div>
                      <span className="absolute top-2.5 left-2.5 text-[10px] font-bold text-zinc-300 bg-surface/60 rounded-[5px] px-2 py-1">
                        E{ep.episode_number}
                      </span>
                    </div>
                    <div className="text-[13px] font-semibold text-white mt-2.5 truncate">
                      {ep.episode_number}. {ep.name}
                    </div>
                    <div className="text-[11.5px] text-text-dim mt-0.5">
                      {formatRuntime(ep.runtime) || formatDate(ep.air_date)}
                    </div>
                  </motion.button>
                ))}
              </div>
            )}
          </section>
        )}

        {/* Reparto */}
        {cast.length > 0 && (
          <section>
            <SectionTitle>Reparto</SectionTitle>
            <div className="flex gap-6 overflow-x-auto scrollbar-modern pb-2.5">
              {cast.map((c) => (
                <div key={c.id} className="w-[100px] flex-none text-center">
                  <div className="w-[86px] h-[86px] mx-auto rounded-full overflow-hidden border border-white/10 bg-surface-2 flex items-center justify-center">
                    {c.profile_path ? (
                      <img
                        src={profileUrl(c.profile_path) || ''}
                        alt={c.name}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <User className="w-8 h-8 text-text-dim" />
                    )}
                  </div>
                  <div className="text-[12.5px] font-semibold text-white mt-2.5 leading-tight">
                    {c.name}
                  </div>
                  <div className="text-[11.5px] text-text-dim mt-1 leading-tight">{c.character}</div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Trailers */}
        {trailers.length > 0 && (
          <section>
            <SectionTitle>Trailers y extras</SectionTitle>
            <div className="grid grid-cols-2 gap-[18px] max-w-[820px]">
              {trailers.map((v) => (
                <motion.button
                  key={v.id}
                  onClick={() => setTrailer(v)}
                  className="text-left"
                  whileHover={{ y: -4 }}
                  transition={{ duration: 0.25 }}
                >
                  <div className="relative aspect-video rounded-xl overflow-hidden border border-white/[0.07] bg-surface-2">
                    <img
                      src={youtubeThumb(v.key)}
                      alt={v.name}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/25">
                      <div className="w-11 h-11 rounded-full bg-surface/60 border border-white/[0.22] flex items-center justify-center">
                        <Play className="w-4 h-4 text-white fill-white ml-0.5" />
                      </div>
                    </div>
                  </div>
                  <div className="text-[13px] font-semibold text-white mt-2.5 truncate">{v.name}</div>
                </motion.button>
              ))}
            </div>
          </section>
        )}

        {/* Recomendados */}
        {recommendations.length > 0 && (
          <CategoryRow title="Más como esto" movies={recommendations} mediaType={mediaType} />
        )}
      </div>

      {/* Modal de trailer */}
      <AnimatePresence>
        {trailer && (
          <motion.div
            className="fixed inset-0 z-[150] flex items-center justify-center bg-black/80"
            style={{ backdropFilter: 'blur(12px)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setTrailer(null)}
          >
            <motion.div
              className="w-[880px] max-w-[88vw]"
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-3">
                <span
                  className="text-[15px] font-bold text-white"
                  style={{ fontFamily: "'Bricolage Grotesque', sans-serif" }}
                >
                  {trailer.name}
                </span>
                <button
                  onClick={() => setTrailer(null)}
                  className="w-8 h-8 rounded-full bg-white/[0.08] border border-white/[0.12] flex items-center justify-center text-text-secondary hover:text-white transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="aspect-video rounded-2xl overflow-hidden border border-white/10 shadow-card bg-black">
                <iframe
                  src={`https://www.youtube-nocookie.com/embed/${trailer.key}?autoplay=1`}
                  title={trailer.name}
                  className="w-full h-full"
                  allow="accelerometer; autoplay; encrypted-media; picture-in-picture"
                  allowFullScreen
                />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
