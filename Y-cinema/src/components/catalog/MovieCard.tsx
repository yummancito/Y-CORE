import { useState, memo } from 'react'
import { Film, Play, Star } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

export interface MovieItem {
  id: string
  title?: string
  name?: string
  poster_path: string | null
  backdrop_path: string | null
  vote_average: number
  release_date?: string
  first_air_date?: string
  media_type?: string
  overview?: string
}

interface MovieCardProps {
  movie: MovieItem
  size?: 'small' | 'large'
  mediaType?: string
}

export const MovieCard = memo(function MovieCard({ movie, size = 'small', mediaType }: MovieCardProps) {
  const [hovered, setHovered] = useState(false)
  const [imgError, setImgError] = useState(false)
  const [imgLoaded, setImgLoaded] = useState(false)
  const navigate = useNavigate()

  const title = movie.title || movie.name || 'Sin título'
  const year = (movie.release_date || movie.first_air_date || '').split('-')[0]
  const type = mediaType || movie.media_type || 'movie'
  const rating = movie.vote_average ? movie.vote_average.toFixed(1) : '—'

  const cardWidth = size === 'large' ? 'w-[200px]' : 'w-[160px]'
  const cardHeight = size === 'large' ? 'h-[300px]' : 'h-[240px]'

  // Soporta tanto paths relativos de TMDB como URLs absolutas de otras
  // fuentes (TVMaze/AniList devuelven la URL completa del poster)
  const posterUrl = movie.poster_path
    ? movie.poster_path.startsWith('http')
      ? movie.poster_path
      : `https://image.tmdb.org/t/p/w${size === 'large' ? '500' : '342'}${movie.poster_path}`
    : null

  return (
    <div
      className={`${cardWidth} flex-shrink-0 cursor-pointer group`}
      onClick={() => navigate(`/detail/${type}/${movie.id}`)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        className={`relative ${cardHeight} rounded-xl overflow-hidden transition-all duration-300 ease-out`}
        style={{
          border: hovered ? '1px solid rgba(108,99,255,0.5)' : '1px solid rgba(255,255,255,0.06)',
          boxShadow: hovered
            ? '0 0 30px rgba(108,99,255,0.3), 0 14px 40px rgba(0,0,0,0.5)'
            : '0 8px 32px rgba(0,0,0,0.35)',
          transform: hovered ? 'translateY(-4px) scale(1.04)' : 'translateY(0) scale(1)',
        }}
      >
        {/* Poster image */}
        {posterUrl && !imgError ? (
          <img
            src={posterUrl}
            alt={title}
            className={`w-full h-full object-cover transition-opacity duration-500 ${imgLoaded ? 'opacity-100' : 'opacity-0'}`}
            onLoad={() => setImgLoaded(true)}
            onError={() => setImgError(true)}
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-surface-2">
            <Film className="w-10 h-10 text-text-dim" />
          </div>
        )}

        {!imgLoaded && !imgError && posterUrl && (
          <div className="absolute inset-0 skeleton" />
        )}

        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

        {/* Rating badge */}
        <div className="absolute top-2 left-2 flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-black/60 backdrop-blur text-[11px] font-bold text-amber-500">
          <Star className="w-3 h-3 fill-amber-500" />
          <span>{rating}</span>
        </div>

        {/* Hover info overlay */}
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-3 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none">
          <div className="p-3 rounded-full bg-accent/90 shadow-lg shadow-accent/30">
            <Play className="w-6 h-6 text-white fill-white" />
          </div>
          <p className="text-xs font-bold text-white text-center leading-tight drop-shadow-lg">
            {title}
          </p>
          {year && (
            <p className="text-[10px] text-text-secondary">{year}</p>
          )}
        </div>
      </div>
    </div>
  )
})
