import { motion } from 'framer-motion'
import { ArrowLeft, Heart, Loader2, Play, Star } from 'lucide-react'
import type { MediaDetails } from '../../types/media'
import {
  backdropUrl,
  displayTitle,
  displayYear,
  formatRuntime,
  posterUrl,
  rating1,
} from '../../lib/tmdb'

interface DetailHeroProps {
  detail: MediaDetails
  mediaType: string
  isFavorite: boolean
  favoriteBusy?: boolean
  playLoading?: boolean
  onPlay: () => void
  onToggleFavorite: () => void
  onBack: () => void
}

export default function DetailHero({
  detail,
  mediaType,
  isFavorite,
  favoriteBusy,
  playLoading,
  onPlay,
  onToggleFavorite,
  onBack,
}: DetailHeroProps) {
  const title = displayTitle(detail)
  const year = displayYear(detail)
  const runtime =
    mediaType === 'tv'
      ? detail.number_of_seasons
        ? `${detail.number_of_seasons} temporada${detail.number_of_seasons > 1 ? 's' : ''}`
        : ''
      : formatRuntime(detail.runtime)
  const poster = posterUrl(detail.poster_path)

  return (
    <div className="relative min-h-[600px] h-[82vh] overflow-hidden">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url(${backdropUrl(detail.backdrop_path || detail.poster_path)})` }}
      />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'linear-gradient(90deg, rgba(9,9,11,0.94) 16%, rgba(9,9,11,0.62) 42%, rgba(9,9,11,0.12) 68%, rgba(9,9,11,0) 100%)',
        }}
      />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'linear-gradient(0deg, #09090B 4%, rgba(9,9,11,0.55) 22%, rgba(9,9,11,0) 48%)',
        }}
      />

      {/* Volver */}
      <button
        onClick={onBack}
        className="absolute top-[84px] left-10 lg:left-14 z-10 flex items-center gap-2 h-[38px] px-4 rounded-full text-[13px] font-medium text-text-secondary hover:text-white transition-colors"
        style={{
          background: 'rgba(15,15,18,0.6)',
          backdropFilter: 'blur(14px)',
          WebkitBackdropFilter: 'blur(14px)',
          border: '1px solid rgba(255,255,255,0.12)',
        }}
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Volver
      </button>

      {/* Contenido */}
      <motion.div
        className="absolute left-10 lg:left-14 right-10 bottom-14 z-[4] flex items-end gap-8"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
      >
        {poster && (
          <img
            src={poster}
            alt={title}
            className="hidden lg:block w-[220px] rounded-2xl border border-white/10 shadow-card flex-none"
          />
        )}

        <div className="max-w-[660px]">
          <div className="flex items-center gap-2.5 mb-3.5">
            <span
              className="text-[10px] font-bold tracking-[2px] text-white rounded-[5px] px-2.5 py-1 border border-accent/45 uppercase"
              style={{
                background: 'linear-gradient(90deg, rgba(108,99,255,0.35), rgba(59,178,247,0.25))',
              }}
            >
              {mediaType === 'tv' ? 'Serie' : 'Película'}
            </span>
            <span className="flex items-center gap-1 text-xs font-bold text-amber-500">
              <Star className="w-3 h-3 fill-amber-500" />
              {rating1(detail.vote_average)}
            </span>
          </div>

          <h1
            className="text-5xl lg:text-[58px] font-extrabold leading-[0.98] tracking-[-0.03em] text-white"
            style={{
              fontFamily: "'Bricolage Grotesque', sans-serif",
              textShadow: '0 4px 40px rgba(0,0,0,0.6)',
            }}
          >
            {title}
          </h1>

          {detail.tagline && (
            <p className="text-[15px] text-zinc-400 italic mt-2.5">{detail.tagline}</p>
          )}

          <div className="flex items-center gap-2 mt-3.5 flex-wrap text-[12.5px] text-text-secondary">
            {year && <span>{year}</span>}
            {runtime && (
              <>
                <span>·</span>
                <span>{runtime}</span>
              </>
            )}
            {detail.vote_count ? (
              <>
                <span>·</span>
                <span>{detail.vote_count.toLocaleString()} votos</span>
              </>
            ) : null}
          </div>

          {detail.genres?.length > 0 && (
            <div className="flex gap-1.5 mt-3 flex-wrap">
              {detail.genres.map((g) => (
                <span
                  key={g.id}
                  className="text-[11px] text-zinc-300 border border-white/[0.14] rounded-full px-2.5 py-[3px] whitespace-nowrap"
                >
                  {g.name}
                </span>
              ))}
            </div>
          )}

          <p className="mt-4 text-sm leading-[1.65] text-white/[0.72] max-w-[600px]">
            {detail.overview || 'Sin sinopsis disponible.'}
          </p>

          <div className="flex items-center gap-3 mt-6">
            <button
              onClick={onPlay}
              disabled={playLoading}
              className="flex items-center gap-2 h-[46px] px-6 bg-white text-surface rounded-full text-sm font-bold transition-transform duration-200 hover:scale-[1.03] active:scale-[0.97] disabled:opacity-70 disabled:hover:scale-100"
              style={{ boxShadow: '0 8px 30px rgba(255,255,255,0.18)' }}
            >
              {playLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Play className="w-4 h-4 fill-surface" />
              )}
              {playLoading ? 'Buscando fuentes…' : 'Reproducir'}
            </button>
            <button
              onClick={onToggleFavorite}
              disabled={favoriteBusy}
              className={`flex items-center gap-2 h-[46px] px-5 rounded-full text-sm font-semibold bg-white/[0.09] border border-white/[0.16] backdrop-blur-md hover:bg-white/[0.16] transition-colors duration-200 disabled:opacity-70 ${
                isFavorite ? 'text-accent' : 'text-white'
              }`}
            >
              <Heart className={`w-[15px] h-[15px] ${isFavorite ? 'fill-accent' : ''}`} />
              {isFavorite ? 'En favoritos' : 'Favoritos'}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  )
}
