import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronLeft, ChevronRight, Heart, Play, Star } from 'lucide-react'
import type { Movie } from '../../types/media'
import { backdropUrl, displayTitle, displayYear, itemMediaType, rating1 } from '../../lib/tmdb'

interface HeroBannerProps {
  movies: Movie[]
  onPlay: (movie: Movie) => void
  onInfo: (movie: Movie) => void
  onToggleFavorite?: (movie: Movie) => void
  favoriteIds?: Set<string>
}

const AUTOPLAY_MS = 6000

export default function HeroBanner({
  movies,
  onPlay,
  onInfo,
  onToggleFavorite,
  favoriteIds,
}: HeroBannerProps) {
  const slides = movies.slice(0, 6)
  const [index, setIndex] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const goTo = useCallback(
    (i: number) => setIndex(((i % slides.length) + slides.length) % slides.length),
    [slides.length]
  )

  useEffect(() => {
    if (slides.length < 2) return
    // slides.length es la única dependencia real — index NO debe estar aquí:
    // si estuviera, cada avance del propio timer (o un click manual en
    // flechas/thumbnail) reiniciaría el cronómetro de AUTOPLAY_MS desde cero,
    // rompiendo la garantía de "avanza cada 6s" en cuanto el usuario interactúa.
    timerRef.current = setInterval(() => setIndex((i) => (i + 1) % slides.length), AUTOPLAY_MS)
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [slides.length])

  // Si slides se encoge (reintento con menos items) y el index activo queda
  // fuera de rango, corregirlo — evita indexar slides[index] === undefined.
  useEffect(() => {
    if (index >= slides.length && slides.length > 0) setIndex(0)
  }, [slides.length, index])

  if (slides.length === 0) return null

  const movie = slides[index]
  const title = displayTitle(movie)
  const year = displayYear(movie)
  const genres = (movie.genre_names || []).slice(0, 3)
  const isFav = favoriteIds?.has(`${itemMediaType(movie)}-${movie.id}`) ?? false

  return (
    <div className="relative h-[76vh] min-h-[520px] overflow-hidden group/hero select-none">
      {/* Slides */}
      <AnimatePresence mode="sync">
        <motion.div
          key={movie.id}
          className="absolute inset-0"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.9, ease: 'easeOut' }}
        >
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{
              backgroundImage: `url(${backdropUrl(movie.backdrop_path || movie.poster_path)})`,
              animation: 'heroKb 16s ease-out forwards',
            }}
          />
          {/* Gradientes del diseño */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                'linear-gradient(90deg, rgba(9,9,11,0.92) 12%, rgba(9,9,11,0.6) 38%, rgba(9,9,11,0.12) 65%, rgba(9,9,11,0) 100%)',
            }}
          />
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                'linear-gradient(0deg, #09090B 3%, rgba(9,9,11,0.6) 20%, rgba(9,9,11,0) 48%)',
            }}
          />
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                'radial-gradient(70% 60% at 70% 30%, transparent 40%, rgba(3,3,5,0.4) 100%)',
            }}
          />
        </motion.div>
      </AnimatePresence>

      {/* Contenido */}
      <motion.div
        key={`content-${movie.id}`}
        className="absolute left-10 lg:left-14 bottom-40 w-[min(660px,80vw)] z-10"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
      >
        <div className="flex items-center gap-2.5 mb-4">
          <span
            className="text-[10px] font-bold tracking-[2px] text-white rounded-[5px] px-2.5 py-1 border border-accent/45"
            style={{
              background: 'linear-gradient(90deg, rgba(108,99,255,0.35), rgba(59,178,247,0.25))',
            }}
          >
            FEATURED
          </span>
          <span className="text-[10px] font-bold tracking-[2px] text-text-secondary uppercase">
            {itemMediaType(movie) === 'tv' ? 'Serie' : 'Película'}
          </span>
        </div>

        <h1
          className="text-5xl lg:text-6xl font-extrabold leading-[0.98] tracking-[-0.03em]"
          style={{
            fontFamily: "'Bricolage Grotesque', sans-serif",
            textShadow: '0 6px 50px rgba(0,0,0,0.7)',
            background: 'linear-gradient(180deg, #fff 55%, rgba(255,255,255,0.72))',
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
        >
          {title}
        </h1>

        <div className="flex items-center gap-2 mt-4 flex-wrap">
          <span className="flex items-center gap-1 text-[11px] font-extrabold rounded-[5px] px-2 py-0.5 bg-[#F5C518] text-[#0a0a0c]">
            <Star className="w-3 h-3 fill-[#0a0a0c]" />
            {rating1(movie.vote_average)}
          </span>
          {year && (
            <span className="text-[10px] font-bold tracking-wider text-text-secondary border border-white/[0.16] rounded px-1.5 py-0.5">
              {year}
            </span>
          )}
          <span className="text-[10px] font-bold tracking-wider text-text-secondary border border-white/[0.16] rounded px-1.5 py-0.5">
            HD
          </span>
        </div>

        {genres.length > 0 && (
          <div className="flex gap-1.5 mt-3">
            {genres.map((g) => (
              <span
                key={g}
                className="text-[11px] text-zinc-300 border border-white/[0.14] rounded-full px-2.5 py-[3px] whitespace-nowrap"
              >
                {g}
              </span>
            ))}
          </div>
        )}

        <p className="mt-3 text-sm leading-relaxed text-white/70 truncate-3 max-w-[560px]">
          {movie.overview}
        </p>

        <div className="flex items-center gap-3 mt-6">
          <button
            onClick={() => onPlay(movie)}
            className="flex items-center gap-2 h-[46px] px-6 bg-white text-surface rounded-full text-sm font-bold transition-transform duration-200 hover:scale-[1.03] active:scale-[0.97]"
            style={{ boxShadow: '0 8px 30px rgba(255,255,255,0.18)' }}
          >
            <Play className="w-4 h-4 fill-surface" />
            Reproducir
          </button>
          <button
            onClick={() => onInfo(movie)}
            className="h-[46px] px-5 rounded-full text-sm font-semibold text-white bg-white/[0.09] border border-white/[0.16] backdrop-blur-md hover:bg-white/[0.16] transition-colors duration-200"
          >
            Más info
          </button>
          {onToggleFavorite && (
            <button
              onClick={() => onToggleFavorite(movie)}
              title={isFav ? 'Quitar de favoritos' : 'Agregar a favoritos'}
              className={`w-[46px] h-[46px] flex items-center justify-center rounded-full bg-white/[0.09] border border-white/[0.16] backdrop-blur-md hover:bg-white/[0.16] transition-colors duration-200 ${
                isFav ? 'text-accent' : 'text-white'
              }`}
            >
              <Heart className={`w-[17px] h-[17px] ${isFav ? 'fill-accent' : ''}`} />
            </button>
          )}
        </div>
      </motion.div>

      {/* Flechas */}
      {slides.length > 1 && (
        <>
          <button
            onClick={() => goTo(index - 1)}
            className="absolute left-5 top-1/2 -translate-y-1/2 z-20 w-11 h-11 rounded-full glass flex items-center justify-center text-white opacity-0 group-hover/hero:opacity-100 transition-opacity duration-300 hover:bg-white/[0.15]"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            onClick={() => goTo(index + 1)}
            className="absolute right-5 top-1/2 -translate-y-1/2 z-20 w-11 h-11 rounded-full glass flex items-center justify-center text-white opacity-0 group-hover/hero:opacity-100 transition-opacity duration-300 hover:bg-white/[0.15]"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </>
      )}

      {/* Thumbnails de slides */}
      {slides.length > 1 && (
        <div className="absolute left-10 lg:left-14 right-10 lg:right-14 bottom-5 z-20 flex gap-3 overflow-x-auto scrollbar-modern py-1.5">
          {slides.map((s, i) => {
            const active = i === index
            return (
              <button
                key={s.id}
                onClick={() => goTo(i)}
                className="relative flex-none h-24 rounded-[13px] overflow-hidden text-left transition-all duration-300"
                style={{
                  width: active ? 210 : 150,
                  border: `1.5px solid ${active ? 'rgba(108,99,255,0.8)' : 'rgba(255,255,255,0.1)'}`,
                  boxShadow: active ? '0 8px 30px rgba(108,99,255,0.25)' : 'none',
                }}
              >
                <div
                  className="absolute inset-0 bg-cover bg-center"
                  style={{
                    backgroundImage: `url(${backdropUrl(s.backdrop_path || s.poster_path, 'w780')})`,
                  }}
                />
                <div
                  className="absolute inset-0 transition-opacity duration-300"
                  style={{
                    background:
                      'linear-gradient(0deg, rgba(3,3,5,0.88), rgba(3,3,5,0.15) 55%, transparent)',
                    opacity: active ? 1 : 0.75,
                  }}
                />
                <div className="absolute left-3 right-2.5 bottom-2.5">
                  <div className="text-[8.5px] font-bold tracking-[1.6px] text-white/55 uppercase">
                    {itemMediaType(s) === 'tv' ? 'Serie' : 'Película'}
                  </div>
                  <div
                    className="text-[12.5px] font-bold mt-0.5 whitespace-nowrap overflow-hidden text-ellipsis text-white"
                    style={{ fontFamily: "'Bricolage Grotesque', sans-serif" }}
                  >
                    {displayTitle(s)}
                  </div>
                </div>
                {active && (
                  <div
                    className="absolute left-0 right-0 bottom-0 h-[3px]"
                    style={{ background: 'linear-gradient(90deg, #6C63FF, #3BB2F7)' }}
                  />
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
