import { useState, useMemo, memo } from 'react'
import { Package, Play, Loader2, Download, ChevronRight } from 'lucide-react'
import { t } from '../../lib/i18n'
import { CoverImage } from '../ui/CoverImage'
import { Card3D } from '../ui/Card3D'
import { getCoverUrl, getCoverFallbackUrls } from '../../domain/utils'
import type { CategoryId } from '../../lib/categories'

export interface MergedGame {
  app_id: string
  name: string
  header_image_url?: string | null
  category?: CategoryId | null
  source: 'catalog' | 'import'
  is_dlc?: boolean
  is_tool?: boolean
}

export function getDefaultGameImageUrl(game: MergedGame): string | null {
  if (game.header_image_url) return game.header_image_url
  const rawName = game.name?.trim()
  const isOrphaned = !rawName || rawName === game.app_id || /^app\s*\d*$/i.test(rawName) || rawName.toLowerCase() === 'appid'
  if (isOrphaned) return null
  if (/^\d+$/.test(game.app_id)) {
    return `https://depotbox.org/api/images/steam-header/${game.app_id}`
  }
  return getCoverUrl(game.app_id)
}

export const GameCard = memo(function GameCard({
  game, onInstall, installing, onSelect, isRecommended, src, isInstalled, subline,
}: {
  game: MergedGame
  onInstall: (g: MergedGame) => void
  installing: string | null
  onSelect?: (g: MergedGame) => void
  isRecommended?: boolean
  src?: string | null
  isInstalled?: boolean
  subline?: string
}) {
  const [failed, setFailed] = useState(false)
  const [imgLoaded, setImgLoaded] = useState(false)
  const [hovered, setHovered] = useState(false)
  const rawName = game.name?.trim()
  const isGenericName = !rawName || rawName === game.app_id || /^app\s*\d*$/i.test(rawName) || rawName.toLowerCase() === 'appid'
  const displayName = isGenericName ? `App ${game.app_id}` : rawName
  const appIdStr = `AppID ${game.app_id}`
  const sublineText = subline || appIdStr
  const fallbackSrc = /^\d+$/.test(game.app_id)
    ? `https://cdn.cloudflare.steamstatic.com/steam/apps/${game.app_id}/header.jpg`
    : getCoverUrl(game.app_id)
  const fallbackSrcs = useMemo(() => getCoverFallbackUrls(game.app_id), [game.app_id])

  return (
    <div
      className="group relative rounded-xl overflow-hidden cursor-pointer bg-surface-2 transition-all duration-300 ease-out will-change-transform"
      style={{
        borderColor: hovered ? 'rgba(59,178,247,0.55)' : 'rgba(255,255,255,0.06)',
        borderWidth: 1,
        borderStyle: 'solid',
        boxShadow: hovered
          ? '0 0 0 1px rgba(59,178,247,0.55), 0 0 30px rgba(59,178,247,0.35), 0 14px 40px rgba(0,0,0,0.5)'
          : '0 8px 32px rgba(0,0,0,0.35)',
        transform: hovered ? 'translateY(-2px) scale(1.01)' : 'translateY(0) scale(1)',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => onSelect?.(game)}
    >
      <div className="relative aspect-[460/215] overflow-hidden">
        {failed ? (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-white/[0.06] to-white/[0.01] p-4">
            <Package className="w-10 h-10 text-text-dim" />
            <p className="text-[10px] text-text-dim text-center line-clamp-2">{displayName}</p>
          </div>
        ) : (
          <>
            <div
              className="w-full h-full transition-all duration-[400ms] ease-out"
              style={{
                transform: hovered ? 'scale(1.03)' : 'scale(1)',
                filter: hovered ? 'brightness(0.5)' : 'brightness(1)',
              }}
            >
              <CoverImage
                src={src}
                fallbackSrc={fallbackSrc}
                fallbackSrcs={fallbackSrcs}
                alt={displayName}
                className="w-full h-full object-cover"
                onLoad={() => setImgLoaded(true)}
                onError={() => setFailed(true)}
                showSkeleton={false}
              />
            </div>
            {!imgLoaded && !failed && (
              <div className="absolute inset-0 flex items-center justify-center bg-surface-2">
                <div className="card-loader"><span></span><span></span><span></span><span></span><span></span><span></span></div>
              </div>
            )}
          </>
        )}
        {/* Gradient + content — only fade in after image loads */}
        <div
          className="absolute inset-0 transition-opacity duration-500 ease-out"
          style={{ opacity: imgLoaded ? 1 : 0 }}
        >
          <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/35 to-transparent" />

          {/* Top badges */}
          <div className="absolute top-2.5 left-2.5 right-2.5 flex gap-1.5 pointer-events-none z-10">
            {isInstalled && (
              <span className="inline-flex items-center gap-1 text-[9px] font-bold tracking-wide px-2 py-1 rounded-full bg-emerald-500/85 backdrop-blur border border-white/20 text-white shadow-md">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                {t('store.installed')}
              </span>
            )}
            {isRecommended && (
              <span className="inline-flex items-center gap-1 text-[9px] font-bold tracking-wide px-2 py-1 rounded-full bg-accent/85 backdrop-blur border border-white/20 text-white shadow-md">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 2l2.4 7.4H22l-6 4.4 2.3 7.4-6.3-4.6L5.7 21l2.3-7.4-6-4.4h7.6z"/></svg>
                {t('store.recommended')}
              </span>
            )}
          </div>

          {/* Bottom info */}
          <div className="absolute bottom-0 left-0 right-0 p-3 flex items-end justify-between gap-2 pointer-events-none z-10">
            <div className="min-w-0">
              <p className="text-sm font-bold text-white truncate leading-tight drop-shadow-lg">{displayName}</p>
              <p className="text-[10px] text-text-dim truncate mt-0.5">{sublineText}</p>
            </div>
          </div>
        </div>

        {/* Hover overlay - glassmorphism */}
        <div
          className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 transition-opacity duration-300 ease-out"
          style={{
            background: 'rgba(9,9,11,0.35)',
            backdropFilter: 'blur(6px)',
            opacity: hovered ? 1 : 0,
            pointerEvents: hovered ? 'auto' : 'none',
          }}
        >
          <button
            onClick={(e) => { e.stopPropagation(); onInstall(game); }}
            disabled={installing === game.app_id}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-xs font-bold text-white transition-all cursor-pointer"
            style={{
              background: installing === game.app_id ? 'rgba(255,255,255,0.2)' : 'linear-gradient(135deg,#3BB2F7,#2A8FD1)',
              boxShadow: installing === game.app_id ? 'none' : '0 6px 20px rgba(59,178,247,0.4)',
            }}
          >
            {installing === game.app_id ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              isInstalled ? <Play className="w-5 h-5 fill-current" /> : <Download className="w-5 h-5" />
            )}
            {installing === game.app_id ? t('store.installing') : isInstalled ? t('library.play') : t('store.install')}
          </button>
          <span className="flex items-center gap-1 text-xs font-semibold text-text-bright">
            {t('store.seeDetails')}
            <ChevronRight className="w-3.5 h-3.5" />
          </span>
        </div>
      </div>
    </div>
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
