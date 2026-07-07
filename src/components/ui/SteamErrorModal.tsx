import { AlertTriangle, X, RotateCw, Clock } from 'lucide-react'
import { t } from '../../lib/i18n'
import { useSteamErrorStore } from '../../stores/useSteamErrorStore'
import { useToastStore } from '../../stores/useToastStore'
import { useSteamStore } from '../../stores/useSteamStore'

export function SteamErrorModal() {
  const { isOpen, error, close } = useSteamErrorStore()
  const { showToast } = useToastStore()
  const { restartSteam } = useSteamStore()

  if (!isOpen || !error) return null

  const handleRestart = async () => {
    close()
    showToast('info', t('library.restarting'))
    const result = await restartSteam()
    if (result.success) {
      showToast('success', t('library.steamRestarted'))
    } else {
      showToast('error', result.error || t('common.failed'))
    }
  }

  const titleKey = `steamError.${error.type}`
  const title = t(titleKey) !== titleKey ? t(titleKey) : t('steamError.title')

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={close} />
      <div className="relative w-full max-w-md rounded-2xl border border-white/[0.08] bg-bg-primary/95 shadow-2xl p-6 animate-in fade-in zoom-in-95 duration-200">
        <button
          onClick={close}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-text-dim hover:text-text-bright hover:bg-white/[0.06] transition-colors"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-4 mb-4">
          <div className="w-12 h-12 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
            <AlertTriangle className="w-6 h-6 text-red-400" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-text-bright">{title}</h3>
            <p className="text-xs text-text-dim">Steam Log Monitor</p>
          </div>
        </div>

        <p className="text-sm text-text-secondary leading-relaxed mb-3">
          {error.message}
        </p>

        <div className="mb-6 p-3 rounded-lg bg-white/[0.04] border border-white/[0.06]">
          <p className="text-[11px] text-text-dim font-mono break-all">
            {error.rawLine}
          </p>
        </div>

        <div className="flex gap-3">
          <button
            onClick={close}
            className="flex-1 px-4 py-2.5 rounded-xl bg-white/[0.05] text-text-secondary border border-white/[0.08] hover:bg-white/[0.08] hover:text-text-bright transition-colors text-sm font-medium flex items-center justify-center gap-2"
          >
            <Clock className="w-4 h-4" />
            {t('steamError.later')}
          </button>
          <button
            onClick={handleRestart}
            className="flex-1 px-4 py-2.5 rounded-xl bg-accent text-white hover:bg-accent-bright transition-colors text-sm font-medium shadow-lg shadow-accent/20 flex items-center justify-center gap-2"
          >
            <RotateCw className="w-4 h-4" />
            {t('steamError.restartSteam')}
          </button>
        </div>
      </div>
    </div>
  )
}
