import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Play } from 'lucide-react'
import { useCatalogStore } from '../stores/useCatalogStore'
import { useToastStore } from '../stores/useToastStore'
import HeroBanner from '../components/catalog/HeroBanner'
import CategoryRow from '../components/catalog/CategoryRow'
import LoadingState from '../components/common/LoadingState'
import { backdropUrl, displayTitle, itemMediaType } from '../lib/tmdb'
import type { HistoryEntry, Movie } from '../types/media'

function ContinueWatchingRow({ items }: { items: HistoryEntry[] }) {
  const navigate = useNavigate()
  if (items.length === 0) return null

  return (
    <section>
      <h2
        className="text-[22px] font-bold tracking-tight text-white mb-4"
        style={{ fontFamily: "'Bricolage Grotesque', sans-serif" }}
      >
        Seguir viendo
      </h2>
      <div className="flex gap-[18px] overflow-x-auto scrollbar-modern px-1 py-1.5 -mx-1">
        {items.map((item) => (
          <motion.button
            key={`${item.mediaType}-${item.id}`}
            onClick={() => navigate(`/watch/${item.mediaType}/${item.id}`)}
            className="w-[320px] flex-none text-left cursor-pointer"
            whileHover={{ y: -4 }}
            transition={{ duration: 0.25 }}
          >
            <div className="relative aspect-video rounded-[14px] overflow-hidden border border-white/[0.08] shadow-card bg-surface-2">
              {(item.backdropPath || item.posterPath) && (
                <img
                  src={backdropUrl(item.backdropPath || item.posterPath, 'w780') || ''}
                  alt={item.title}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              )}
              <div
                className="absolute inset-0"
                style={{
                  background:
                    'linear-gradient(0deg, rgba(9,9,11,0.85), rgba(9,9,11,0.15) 50%, transparent)',
                }}
              />
              <div className="absolute left-3.5 right-3.5 bottom-6">
                <div
                  className="text-[17px] font-extrabold tracking-tight text-white"
                  style={{ fontFamily: "'Bricolage Grotesque', sans-serif" }}
                >
                  {item.title}
                </div>
                <div className="text-[11.5px] text-text-secondary mt-0.5">
                  {Math.round(item.progress * 100)}% visto
                </div>
              </div>
              <div className="absolute top-3 right-3 w-9 h-9 rounded-full bg-white/[0.92] flex items-center justify-center shadow-lg">
                <Play className="w-3.5 h-3.5 text-surface fill-surface ml-0.5" />
              </div>
              <div className="absolute left-0 right-0 bottom-0 h-1 bg-white/[0.12]">
                <div
                  className="h-full"
                  style={{
                    width: `${Math.round(item.progress * 100)}%`,
                    background: 'linear-gradient(90deg, #6C63FF, #3BB2F7)',
                  }}
                />
              </div>
            </div>
          </motion.button>
        ))}
      </div>
    </section>
  )
}

export default function HomePage() {
  const navigate = useNavigate()
  const pushToast = useToastStore((s) => s.push)
  const {
    popularMovies,
    recentMovies,
    popularSeries,
    popularAnime,
    continueWatching,
    homeLoaded,
    homeLoading,
    homeError,
    loadHome,
    refreshContinueWatching,
  } = useCatalogStore()

  // Clave compuesta `${mediaType}-${id}` — un Set plano confundiría una
  // película y una serie que compartan el mismo id.
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!homeLoaded) loadHome()
    else refreshContinueWatching()

    window.api.favorites
      .get()
      .then((favs) => setFavoriteIds(new Set(favs.map((f) => `${f.mediaType}-${f.id}`))))
      .catch(() => {})
  }, [homeLoaded, loadHome, refreshContinueWatching])

  async function toggleFavorite(movie: Movie) {
    const type = itemMediaType(movie)
    const key = `${type}-${movie.id}`
    try {
      if (favoriteIds.has(key)) {
        await window.api.favorites.remove(movie.id, type)
        setFavoriteIds((prev) => {
          const next = new Set(prev)
          next.delete(key)
          return next
        })
        pushToast('Quitado de favoritos', 'info')
      } else {
        await window.api.favorites.add({
          id: movie.id,
          mediaType: type,
          title: displayTitle(movie),
          posterPath: movie.poster_path,
          backdropPath: movie.backdrop_path,
          voteAverage: movie.vote_average,
        })
        setFavoriteIds((prev) => new Set(prev).add(key))
        pushToast('Agregado a favoritos', 'success')
      }
    } catch {
      pushToast('No se pudo actualizar favoritos', 'error')
    }
  }

  if (homeError && !homeLoaded) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <p className="text-text-secondary">{homeError}</p>
        <button className="btn-primary" onClick={() => loadHome()}>
          Reintentar
        </button>
      </div>
    )
  }

  if (homeLoading && !homeLoaded) {
    return (
      <div className="animate-fade-in">
        <LoadingState variant="hero" />
        <div className="px-10 lg:px-14 py-12 space-y-12">
          <LoadingState variant="row" />
          <LoadingState variant="row" />
        </div>
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      <HeroBanner
        movies={popularMovies}
        onPlay={(m) => navigate(`/detail/${itemMediaType(m)}/${m.id}`)}
        onInfo={(m) => navigate(`/detail/${itemMediaType(m)}/${m.id}`)}
        onToggleFavorite={toggleFavorite}
        favoriteIds={favoriteIds}
      />

      <div className="px-10 lg:px-14 pb-16 pt-2 flex flex-col gap-12 relative z-[2] -mt-1">
        <ContinueWatchingRow items={continueWatching} />
        <CategoryRow
          title="Películas populares"
          movies={popularMovies}
          mediaType="movie"
          onViewAll={() => navigate('/catalog/movie')}
        />
        <CategoryRow
          title="Recién agregadas"
          movies={recentMovies}
          mediaType="movie"
          onViewAll={() => navigate('/catalog/movie')}
        />
        <CategoryRow
          title="Series populares"
          movies={popularSeries}
          mediaType="tv"
          onViewAll={() => navigate('/catalog/tv')}
        />
        {/* Anime real vía sync de AniList — puede estar vacío hasta que
            ese job corra por primera vez en el backend (ver
            docs/ROADMAP.md de y-cinema-api). */}
        <CategoryRow
          title="Anime popular"
          movies={popularAnime}
          mediaType="tv"
          onViewAll={() => navigate('/catalog/anime')}
        />
      </div>
    </motion.div>
  )
}
