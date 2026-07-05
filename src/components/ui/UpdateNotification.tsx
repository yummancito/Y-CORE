import { useEffect, useState } from 'react'
import { Download, RefreshCw, X } from 'lucide-react'
import { t } from '../../lib/i18n'

interface UpdateInfo {
  version?: string
}

export function UpdateNotification() {
  const [updateAvailable, setUpdateAvailable] = useState<UpdateInfo | null>(null)
  const [updateDownloaded, setUpdateDownloaded] = useState<UpdateInfo | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    const offAvailable = window.steamtools?.onUpdateAvailable?.((info: UpdateInfo) => {
      setUpdateAvailable(info)
    })
    const offDownloaded = window.steamtools?.onUpdateDownloaded?.((info: UpdateInfo) => {
      setUpdateDownloaded(info)
      setUpdateAvailable(null)
    })
    return () => {
      offAvailable?.()
      offDownloaded?.()
    }
  }, [])

  if (dismissed) return null

  // Priority: downloaded > available
  if (updateDownloaded) {
    return (
      <div className="fixed bottom-4 right-4 z-[9000] flex items-center gap-3 rounded-xl border border-green-500/30 bg-[#13131a] px-4 py-3 shadow-xl shadow-green-500/10">
        <RefreshCw className="w-5 h-5 text-green-400" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-text-bright">
            {t('update.updateReady').replace('{{version}}', updateDownloaded.version ?? t('common.unknown'))}
          </p>
          <p className="text-xs text-text-dim">{t('update.restartToInstall')}</p>
        </div>
        <button
          onClick={() => window.steamtools?.installUpdate?.()}
          className="rounded-lg bg-green-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-green-500"
        >
          {t('update.installAndRestart')}
        </button>
        <button
          onClick={() => setDismissed(true)}
          className="text-text-dim hover:text-text-bright transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    )
  }

  if (updateAvailable) {
    return (
      <div className="fixed bottom-4 right-4 z-[9000] flex items-center gap-3 rounded-xl border border-blue-500/30 bg-[#13131a] px-4 py-3 shadow-xl shadow-blue-500/10">
        <Download className="w-5 h-5 text-blue-400 animate-pulse" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-text-bright">
            {t('update.downloading').replace('{{version}}', updateAvailable.version ?? t('common.unknown'))}
          </p>
          <p className="text-xs text-text-dim">{t('update.notifiedWhenReady')}</p>
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="text-text-dim hover:text-text-bright transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    )
  }

  return null
}
