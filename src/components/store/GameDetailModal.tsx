import { Loader2, Play, XCircle } from 'lucide-react'
import { t } from '../../lib/i18n'
import { CoverImage } from '../ui/CoverImage'
import { getCoverUrl } from '../../domain/utils'
import { getDefaultGameImageUrl, type MergedGame } from './GameCard'

export function GameDetailModal({
  game, installing, onInstall, onClose,
}: {
  game: MergedGame
  installing: string | null
  onInstall: (g: MergedGame) => void
  onClose: () => void
}) {
  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50 bg-black/60 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="rounded-2xl overflow-hidden max-w-md w-full mx-4 bg-white/[0.04] backdrop-blur-xl border border-white/[0.08] shadow-modal max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative h-44 overflow-hidden">
          <CoverImage
            src={getDefaultGameImageUrl(game)}
            fallbackSrc={(/^\d+$/.test(game.app_id) ? `https://depotbox.org/api/images/steam-header/${game.app_id}` : null) || getCoverUrl(game.app_id)}
            alt={game.name}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-bg-primary via-bg-primary/60 to-transparent" />
          <button
            onClick={onClose}
            className="absolute top-3 right-3 w-9 h-9 flex items-center justify-center text-white/60 hover:text-white rounded-full transition-colors bg-black/40 hover:bg-black/60"
          >
            <XCircle className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 pb-6 -mt-10 relative space-y-4">
          <div>
            <h2 className="text-lg font-bold text-text-bright drop-shadow-md">{game.name || `App ${game.app_id}`}</h2>
            <p className="text-xs text-text-dim font-mono mt-0.5">AppID: {game.app_id}</p>
          </div>

          <div className="flex gap-2 pt-1">
            <button
              className={`flex-1 flex items-center justify-center gap-2.5 px-5 py-3 rounded-lg text-sm font-medium text-white transition-all cursor-pointer ${
                installing === game.app_id ? 'bg-white/20' : 'bg-gradient-to-r from-accent to-accent-dark shadow-lg shadow-accent/20 hover:brightness-110'
              }`}
              onClick={() => { onInstall(game); onClose() }}
              disabled={installing === game.app_id}
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
      </div>
    </div>
  )
}
