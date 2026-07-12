import { useState } from 'react'
import { AlertTriangle, X, RotateCw, Clock, MessageCircle, ChevronDown } from 'lucide-react'
import { t } from '../../lib/i18n'
import { useSteamErrorStore } from '../../stores/useSteamErrorStore'
import { useToastStore } from '../../stores/useToastStore'
import { useSteamStore } from '../../stores/useSteamStore'
import { sendDiscordReport } from '../../lib/discord-report'

export function SteamErrorModal() {
  const { isOpen, error, close } = useSteamErrorStore()
  const { showToast } = useToastStore()
  const { restartSteam } = useSteamStore()
  const [reportStatus, setReportStatus] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle')
  const [showDetails, setShowDetails] = useState(false)

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

  const handleReport = async () => {
    if (reportStatus === 'sending' || reportStatus === 'sent') return
    setReportStatus('sending')
    const version = await window.steamtools?.getVersion?.().catch?.(() => null) || 'unknown'
    const result = await sendDiscordReport(
      `Steam Error: ${error.type}`,
      error.message || 'A user reported a Steam error from the Y-core desktop app.',
      [
        { name: 'Type', value: error.type, inline: true },
        { name: 'Message', value: error.message || 'N/A', inline: false },
        { name: 'Suggested Solution', value: error.solution || 'N/A', inline: false },
        { name: 'Raw Log', value: `\`\`\`\n${error.rawLine.slice(0, 1500)}\n\`\`\``, inline: false },
        { name: 'Version', value: String(version), inline: true },
        { name: 'OS', value: navigator.userAgent.slice(0, 200), inline: true },
      ]
    )
    setReportStatus(result.success ? 'sent' : 'failed')
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

        {error.solution && (
          <div className="mb-3 p-3 rounded-lg bg-accent/10 border border-accent/20">
            <p className="text-[11px] font-semibold text-accent mb-1">{t('steamError.solution')}</p>
            <p className="text-xs text-text-secondary leading-relaxed">
              {(() => {
                const key = `steamError.sol.${error.solution}`
                const translated = t(key)
                return translated !== key ? translated : error.solution
              })()}
            </p>
          </div>
        )}

        <button
          onClick={() => setShowDetails((v) => !v)}
          className="flex items-center gap-1 text-[11px] text-text-dim hover:text-text-bright transition-colors mb-4"
        >
          <ChevronDown className={`w-3 h-3 transition-transform ${showDetails ? 'rotate-180' : ''}`} />
          {t('steamError.details')}
        </button>
        {showDetails && (
          <div className="mb-4 p-3 rounded-lg bg-white/[0.04] border border-white/[0.06] max-h-40 overflow-auto">
            <p className="text-[11px] text-text-dim font-mono break-all whitespace-pre-wrap">
              {error.rawLine}
            </p>
          </div>
        )}

        <div className="flex flex-col gap-2">
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
          <button
            onClick={handleReport}
            disabled={reportStatus === 'sending' || reportStatus === 'sent'}
            className={`w-full px-4 py-2.5 rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-60 ${
              reportStatus === 'sent'
                ? 'bg-green-500/15 text-green-400 border border-green-500/20'
                : reportStatus === 'failed'
                  ? 'bg-red-500/15 text-red-400 border border-red-500/20'
                  : 'bg-white/[0.05] text-text-secondary border border-white/[0.08] hover:bg-white/[0.08] hover:text-text-bright'
            }`}
          >
            <MessageCircle className="w-4 h-4" />
            {reportStatus === 'sending'
              ? t('steamError.reporting')
              : reportStatus === 'sent'
                ? t('steamError.reported')
                : reportStatus === 'failed'
                  ? t('steamError.reportFailed')
                  : t('steamError.report')}
          </button>
        </div>
      </div>
    </div>
  )
}
