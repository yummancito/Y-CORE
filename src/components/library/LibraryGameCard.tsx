// ============================================================================
// src/components/library/LibraryGameCard.tsx
// ----------------------------------------------------------------------------
// Memoized variants of the game card used by LibraryPage.
// Wrapping them in React.memo prevents the 60+ card list from re-rendering
// when any sibling local state changes (hoveredCard, contextMenu, sort
// dropdown, etc.). Each card only re-renders when its own props change.
// ============================================================================

import { memo } from 'react'
import type { InstalledGame } from '../../domain/types'
import { Heart, Play, FolderOpen, Wrench, Wifi } from 'lucide-react'
import { CoverImage } from '../ui/CoverImage'
import { Card3D } from '../ui/Card3D'
import { FavoriteButton } from '../library/FavoriteButton'
import { MethodBadge } from '../method-badge'
import { RuntimeBadge } from '../gre/RuntimeBadge'
import { getCoverUrl } from '../../domain/utils'
import { formatBytes } from '../../stores/useDownloadEngineV3Store'
import type { DownloadState } from '../../stores/useDownloadEngineV3Store'

// ── Shared prop shape ─────────────────────────────────────────────────────

export interface GameCardHandlers {
  onLaunch: (appId: string) => void
  onContextMenu: (e: React.MouseEvent, game: InstalledGame) => void
  onHover: (idx: number) => void
  onUnhover: () => void
  /** Lookup V2 engine state for a given appId. Returns undefined if the appId
   *  has no V2 task (idle / never installed / not in queue). LibraryPage
   *  implements this by querying `useDownloadEngineStore.getState().tasks`. */
  getDownloadState?: (appId: string) => DownloadState | undefined
}

// ── GRID variant (hover overlay + 3D wrapper) ─────────────────────────────

interface GridCardProps {
  game: InstalledGame
  idx: number
  isHovered: boolean
  handlers: GameCardHandlers
}

export const GridGameCard = memo(function GridGameCard({ game, idx, isHovered, handlers }: GridCardProps) {
  return (
    <Card3D key={game.appId} className="group/card cursor-pointer" onContextMenu={(e) => handlers.onContextMenu(e, game)}>
      <div
        className="relative aspect-[2/3] overflow-hidden rounded-xl transition-all duration-300"
        style={{
          border: `1px solid ${isHovered ? 'rgba(0,120,242,0.55)' : 'rgba(255,255,255,0.06)'}`,
          boxShadow: isHovered
            ? '0 0 0 1px rgba(0,120,242,0.55), 0 0 26px rgba(0,120,242,0.3), 0 14px 40px rgba(0,0,0,0.5)'
            : '0 8px 28px rgba(0,0,0,0.35)',
          transform: isHovered ? 'translateY(-4px)' : 'none',
          animation: `card-enter 0.35s ease-out ${Math.min(idx, 8) * 0.04}s both`,
        }}
        onMouseEnter={() => handlers.onHover(idx)}
        onMouseLeave={handlers.onUnhover}
      >
        <div
          className="w-full h-full transition-transform duration-[400ms] ease-out"
          style={{
            transform: isHovered ? 'scale(1.05)' : 'scale(1)',
            filter: isHovered ? 'brightness(0.55)' : 'brightness(1)',
          }}
        >
          <CoverImage
            src={getCoverUrl(game.appId)}
            fallbackSrc={`https://depotbox.org/api/images/steam-header/${game.appId}`}
            alt={game.name}
            className="w-full h-full object-cover"
          />
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black-20 to-transparent" />

        <div className="absolute top-2 left-2 z-30">
          <FavoriteButton appId={game.appId} size={16} />
        </div>
        <div className="absolute top-2 right-2 z-30 flex flex-col gap-1.5 items-end">
          <RuntimeBadge appId={game.appId} size="sm" />
          <MethodBadge
            liveState={handlers.getDownloadState?.(game.appId)}
            onClick={() => handlers.onHover(idx)}
          />
        </div>

        <div className="absolute bottom-0 left-0 right-0 p-3 pt-8 z-10">
          <p className="text-sm font-bold text-white leading-tight line-clamp-2 drop-shadow-md">
            {game.name}
          </p>
        </div>

        <div
          className="absolute inset-0 z-20 flex items-center justify-center transition-all duration-300 ease-out"
          style={{
            background: isHovered ? 'rgba(9,9,11,0.55)' : 'rgba(9,9,11,0)',
            opacity: isHovered ? 1 : 0,
            pointerEvents: isHovered ? 'auto' : 'none',
          }}
        >
          <button
            onClick={(e) => {
              e.stopPropagation()
              handlers.onLaunch(game.appId)
            }}
            className="flex items-center gap-2 px-[22px] py-[11px] rounded-xl text-sm font-bold text-white border-none cursor-pointer transition-all hover:brightness-110"
            style={{ background: 'linear-gradient(135deg, var(--accent), #0058c4)', boxShadow: '0 6px 20px rgba(0,120,242,0.4)' }}
          >
            <Play className="w-[15px] h-[15px] fill-current" />
            Jugar
          </button>
        </div>
      </div>
    </Card3D>
  )
})

// ── LIST variant (horizontal table-like row) ──────────────────────────────

interface ListRowProps {
  game: InstalledGame
  isHovered: boolean
  handlers: GameCardHandlers
}

export const ListGameRow = memo(function ListGameRow({ game, isHovered, handlers }: ListRowProps) {
  return (
    <div
      className="flex items-center px-4 py-2.5 transition-colors hover:bg-white/[0.04] cursor-pointer"
      style={{
        borderBottom: '1px solid rgba(255,255,255,0.04)',
        background: isHovered ? 'rgba(0,120,242,0.05)' : 'transparent',
      }}
      onContextMenu={(e) => handlers.onContextMenu(e, game)}
      onClick={() => handlers.onLaunch(game.appId)}
    >
      <div className="w-10 h-14 rounded overflow-hidden flex-shrink-0 mr-3">
        <img
          src={getCoverUrl(game.appId)}
          alt=""
          className="w-full h-full object-cover"
          onError={(e) => {
            ;(e.target as HTMLImageElement).src = `https://depotbox.org/api/images/steam-header/${game.appId}`
          }}
        />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-text-bright truncate">{game.name}</p>
        <p className="text-[10px] text-text-dim font-mono">AppID {game.appId}</p>
      </div>
      <span className="w-24 text-right text-xs text-text-secondary">
        {game.sizeOnDisk ? formatBytes(game.sizeOnDisk) : '—'}
      </span>
      <span className="w-20 text-right text-xs text-text-secondary">
        {game.playtime ? `${Math.round(game.playtime / 60)}h` : '—'}
      </span>
      <div className="w-24 flex justify-end">
        <RuntimeBadge appId={game.appId} size="sm" />
      </div>
      <div className="w-9 flex justify-end">
        <Heart className="w-3.5 h-3.5 text-text-dim" />
      </div>
      <div className="w-9 flex justify-end gap-1">
        <button
          onClick={(e) => { e.stopPropagation(); handlers.onLaunch(game.appId) }}
          className="p-1 rounded hover:bg-white/[0.08]"
        >
          <Play className="w-3.5 h-3.5 text-accent" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); handlers.onContextMenu(e, game) }}
          className="p-1 rounded hover:bg-white/[0.08]"
        >
          <Wrench className="w-3.5 h-3.5 text-text-dim" />
        </button>
      </div>
    </div>
  )
})

// ── COMPACT variant (small tile) ──────────────────────────────────────────

interface CompactTileProps {
  game: InstalledGame
  idx: number
  isHovered: boolean
  handlers: GameCardHandlers
}

export const CompactGameTile = memo(function CompactGameTile({ game, idx, isHovered, handlers }: CompactTileProps) {
  return (
    <div
      className="group/card cursor-pointer"
      onContextMenu={(e) => handlers.onContextMenu(e, game)}
      onMouseEnter={() => handlers.onHover(idx)}
      onMouseLeave={handlers.onUnhover}
    >
      <div
        className="relative aspect-[2/3] overflow-hidden rounded-lg transition-all duration-200"
        style={{
          border: `1px solid ${isHovered ? 'rgba(0,120,242,0.4)' : 'rgba(255,255,255,0.06)'}`,
        }}
      >
        <CoverImage
          src={getCoverUrl(game.appId)}
          fallbackSrc={`https://depotbox.org/api/images/steam-header/${game.appId}`}
          alt={game.name}
          className="w-full h-full object-cover"
        />
        <div className="absolute top-1 left-1 z-10">
          <FavoriteButton appId={game.appId} size={12} />
        </div>
      </div>
      <p className="mt-1 text-[10px] font-medium text-text-secondary truncate px-0.5 leading-tight">
        {game.name}
      </p>
    </div>
  )
})

// suppress "unused" warnings for icons imported but only used inside JSX
void FolderOpen, Wifi
