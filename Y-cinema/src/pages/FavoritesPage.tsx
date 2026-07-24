import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Heart, Star, X } from 'lucide-react'
import LoadingState from '../components/common/LoadingState'
import EmptyState from '../components/common/EmptyState'
import { useToastStore } from '../stores/useToastStore'
import { posterUrl, rating1 } from '../lib/tmdb'
import type { FavoriteItem } from '../types/media'

export default function FavoritesPage() {
  const navigate = useNavigate()
  const pushToast = useToastStore((s) => s.push)
  const [favorites, setFavorites] = useState<FavoriteItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    window.api.favorites
      .get()
      .then(setFavorites)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  async function handleRemove(e: React.MouseEvent, id: number | string, mediaType: 'movie' | 'tv') {
    e.stopPropagation()
    try {
      await window.api.favorites.remove(id, mediaType)
      setFavorites((prev) => prev.filter((f) => !(f.id === id && f.mediaType === mediaType)))
      pushToast('Quitado de favoritos', 'info')
    } catch {
      pushToast('No se pudo quitar el favorito', 'error')
    }
  }

  return (
    <div className="px-10 lg:px-14 pt-28 pb-16 animate-fade-in">
      <h1
        className="text-4xl font-extrabold tracking-[-0.02em] text-white"
        style={{ fontFamily: "'Bricolage Grotesque', sans-serif" }}
      >
        Favoritos
      </h1>
      {favorites.length > 0 && (
        <p className="text-[13px] text-text-dim mt-2">{favorites.length} títulos guardados</p>
      )}

      <div className="mt-8">
        {loading ? (
          <LoadingState variant="grid" count={10} />
        ) : favorites.length === 0 ? (
          <EmptyState
            icon={Heart}
            title="Todavía no agregaste favoritos"
            description="Guardá películas y series desde cualquier página de detalle para encontrarlas acá."
            action={
              <button className="btn-primary" onClick={() => navigate('/home')}>
                Explorar
              </button>
            }
          />
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-5">
            {favorites.map((fav, i) => (
              <motion.div
                key={`${fav.mediaType}-${fav.id}`}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: (i % 20) * 0.03 }}
                className="group cursor-pointer"
                onClick={() => navigate(`/detail/${fav.mediaType}/${fav.id}`)}
              >
                <div className="relative aspect-[2/3] rounded-xl overflow-hidden border border-white/[0.06] bg-surface-2 transition-all duration-300 group-hover:border-accent/50 group-hover:shadow-glow group-hover:-translate-y-1">
                  {fav.posterPath ? (
                    <img
                      src={posterUrl(fav.posterPath) || ''}
                      alt={fav.title}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Heart className="w-10 h-10 text-text-dim" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

                  {/* Rating */}
                  <div className="absolute top-2 left-2 flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-black/60 backdrop-blur text-[11px] font-bold text-amber-500">
                    <Star className="w-3 h-3 fill-amber-500" />
                    {rating1(fav.voteAverage)}
                  </div>

                  {/* Quitar */}
                  <button
                    onClick={(e) => handleRemove(e, fav.id, fav.mediaType)}
                    title="Quitar de favoritos"
                    className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 backdrop-blur flex items-center justify-center text-text-secondary opacity-0 group-hover:opacity-100 hover:text-white hover:bg-red-500/80 transition-all duration-200"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>

                  <div className="absolute left-3 right-3 bottom-3 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    <p className="text-[13px] font-bold text-white leading-tight">{fav.title}</p>
                    <p className="text-[10.5px] text-text-secondary mt-1 uppercase tracking-wide">
                      {fav.mediaType === 'tv' ? 'Serie' : 'Película'}
                    </p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
