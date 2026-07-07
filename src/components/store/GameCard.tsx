import { useState, memo } from 'react'
import { Package, Play, Loader2 } from 'lucide-react'
import { t } from '../../lib/i18n'
import { CoverImage } from '../ui/CoverImage'
import { Card3D } from '../ui/Card3D'
import { getCoverUrl } from '../../domain/utils'
import type { CategoryId } from '../../lib/categories'

export interface MergedGame {
  app_id: string
  name: string
  header_image_url?: string | null
  category?: CategoryId | null
  source: 'catalog' | 'import'
  is_dlc?: boolean
}

export function getDefaultGameImageUrl(game: MergedGame): string {
  if (game.header_image_url) return game.header_image_url
  if (/^\d+$/.test(game.app_id)) {
    return `https://depotbox.org/api/images/steam-header/${game.app_id}`
  }
  return getCoverUrl(game.app_id)
}

export const GameCard = memo(function GameCard({
  game, onInstall, installing, onSelect, isRecommended, src,
}: {
  game: MergedGame
  onInstall: (g: MergedGame) => void
  installing: string | null
  onSelect?: (g: MergedGame) => void
  isRecommended?: boolean
  src?: string | null
}) {
  const [failed, setFailed] = useState(false)
  const [imgLoaded, setImgLoaded] = useState(false)
  const [hovered, setHovered] = useState(false)
  const rawName = game.name?.trim()
  const isGenericName = !rawName || rawName === game.app_id || /^app\s*\d*$/i.test(rawName) || rawName.toLowerCase() === 'appid'
  const displayName = isGenericName ? `App ${game.app_id}` : rawName

  return (
    <Card3D
      className="group relative rounded-xl overflow-hidden cursor-pointer bg-surface-2 border border-white/[0.06] shadow-card transition-all duration-300 hover:shadow-card-hover will-change-transform"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => onSelect?.(game)}
    >
      <div className="relative aspect-[460/215] overflow-hidden">
        {failed ? (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-white/[0.08] to-white/[0.02] p-4">
            <Package className="w-10 h-10 text-text-dim" />
            <p className="text-[10px] text-text-dim text-center line-clamp-2">{displayName}</p>
          </div>
        ) : (
          <>
            <CoverImage
              src={src}
              fallbackSrc={(/^\d+$/.test(game.app_id) ? `https://depotbox.org/api/images/steam-header/${game.app_id}` : null) || getCoverUrl(game.app_id)}
              alt={displayName}
              className={`w-full h-full object-cover transition-all duration-500 group-hover:scale-105 ${imgLoaded ? 'opacity-100' : 'opacity-0'}`}
              onLoad={() => setImgLoaded(true)}
              onError={() => setFailed(true)}
              showSkeleton={false}
            />
            {!imgLoaded && !failed && (
              <div className="absolute inset-0 flex items-center justify-center bg-surface-2">
                <div className="card-loader">
                  <span></span>
                  <span></span>
                  <span></span>
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
              </div>
            )}
          </>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent" />

        <div className="absolute top-2.5 left-2.5 right-2.5 flex justify-between pointer-events-none">
          {isRecommended && (
            <span className="flex items-center gap-0.5 text-[8px] font-semibold px-1.5 py-1 rounded-lg bg-accent/80 backdrop-blur-md border border-white/10 text-white shadow-sm">
              {t('store.recommended')}
            </span>
          )}
        </div>

        <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/90 via-black/50 to-transparent">
          <p className="text-xs font-bold text-white truncate leading-tight">
            {displayName}
          </p>
          <p className="text-[9px] text-text-dim font-mono mt-0.5">AppID {game.app_id}</p>
        </div>

        <div className={`absolute inset-0 flex items-center justify-center transition-opacity duration-200 ${hovered ? 'opacity-100' : 'opacity-0 pointer-events-none'} bg-black/70 backdrop-blur-sm`}>
          <button
            onClick={(e) => { e.stopPropagation(); onInstall(game); }}
            disabled={installing === game.app_id}
            className={`flex items-center gap-1.5 px-5 py-2.5 rounded-lg text-xs font-semibold text-white transition-all cursor-pointer ${
              installing === game.app_id ? 'bg-white/20' : 'bg-gradient-to-r from-accent to-accent-dark shadow-lg shadow-accent/20 hover:brightness-110'
            }`}
          >
            {installing === game.app_id ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Play className="w-5 h-5" />
            )}
            {installing === game.app_id ? t('store.installing') : t('store.install')}
          </button>
        </div>
      </div>
    </Card3D>
  )
})

export function GameCardSkeleton() {
  return (
    <div className="relative w-full aspect-[460/215] rounded-xl overflow-hidden bg-surface-2 animate-pulse">
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
    </div>
  )
}

export function SectionRowSkeleton() {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2.5 px-1">
        <div className="w-6 h-6 rounded-md bg-surface-2 animate-pulse" />
        <div className="w-32 h-5 rounded-md bg-surface-2 animate-pulse" />
        <div className="w-10 h-4 rounded-md bg-surface-2 animate-pulse" />
      </div>
      <div className="flex gap-2.5 overflow-hidden pb-1">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex-shrink-0 w-[300px]">
            <GameCardSkeleton />
          </div>
        ))}
      </div>
    </div>
  )
}
