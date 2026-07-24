import { motion } from 'framer-motion'
import type { Movie } from '../../types/media'
import { MovieCard } from './MovieCard'

interface MovieGridProps {
  movies: Movie[]
  mediaType?: string
}

export default function MovieGrid({ movies, mediaType }: MovieGridProps) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-5">
      {movies.map((movie, i) => (
        <motion.div
          key={movie.id}
          className="flex justify-center"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: (i % 20) * 0.03 }}
        >
          <MovieCard movie={movie} size="large" mediaType={mediaType} />
        </motion.div>
      ))}
    </div>
  )
}
