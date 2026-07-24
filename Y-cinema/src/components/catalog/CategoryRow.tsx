import { motion } from 'framer-motion'
import type { Movie } from '../../types/media'
import { MovieCard } from './MovieCard'
import LoadingState from '../common/LoadingState'

interface CategoryRowProps {
  title: string
  movies: Movie[]
  mediaType?: string
  loading?: boolean
  onViewAll?: () => void
}

export default function CategoryRow({ title, movies, mediaType, loading, onViewAll }: CategoryRowProps) {
  if (!loading && movies.length === 0) return null

  return (
    <section>
      <div className="flex items-baseline justify-between mb-4">
        <h2
          className="text-[22px] font-bold tracking-tight text-white"
          style={{ fontFamily: "'Bricolage Grotesque', sans-serif" }}
        >
          {title}
        </h2>
        {onViewAll && (
          <button
            onClick={onViewAll}
            className="text-[12.5px] font-semibold text-sky-400 hover:text-accent transition-colors"
          >
            Ver todo →
          </button>
        )}
      </div>

      {loading ? (
        <LoadingState variant="row" count={8} />
      ) : (
        <div className="flex gap-4 overflow-x-auto scrollbar-modern snap-x snap-mandatory px-1 py-1.5 -mx-1">
          {movies.map((movie, i) => (
            <motion.div
              key={movie.id}
              className="snap-start"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: Math.min(i * 0.03, 0.4) }}
            >
              <MovieCard movie={movie} mediaType={mediaType} />
            </motion.div>
          ))}
        </div>
      )}
    </section>
  )
}
