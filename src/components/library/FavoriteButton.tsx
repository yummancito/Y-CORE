import { Heart } from 'lucide-react'
import { useLibraryV2Store } from '../../stores/useLibraryV2Store'

interface FavoriteButtonProps {
  appId: string
  size?: number
}

export function FavoriteButton({ appId, size = 16 }: FavoriteButtonProps) {
  const { isFavorite, toggleFavorite } = useLibraryV2Store()
  const fav = isFavorite(appId)
  return (
    <button
      onClick={(e) => { e.stopPropagation(); toggleFavorite(appId) }}
      className="p-1 rounded-lg transition-all hover:scale-110"
      title={fav ? 'Remove from favorites' : 'Add to favorites'}
    >
      <Heart
        style={{ width: size, height: size }}
        fill={fav ? 'var(--red)' : 'none'}
        stroke={fav ? 'var(--red)' : 'var(--text-dim)'}
        strokeWidth={1.8}
      />
    </button>
  )
}
