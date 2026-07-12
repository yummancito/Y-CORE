import { useEffect, useState } from 'react'
import { Download, RefreshCw, X, FileText } from 'lucide-react'

interface UpdateInfo {
  version?: string
}

interface ProgressInfo {
  percent: number
  transferred: number
  total: number
  bytesPerSecond: number
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec < 1024) return `${bytesPerSec} B/s`
  if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`
  return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`
}

export function UpdateNotification() {
  const [updateAvailable, setUpdateAvailable] = useState<UpdateInfo | null>(null)
  const [updateDownloaded, setUpdateDownloaded] = useState<UpdateInfo | null>(null)
  const [progress, setProgress] = useState<ProgressInfo | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const [manualInstallerPath, setManualInstallerPath] = useState<string | null>(null)
  const [updateError, setUpdateError] = useState<string | null>(null)
  const [retryCount, setRetryCount] = useState(0)
  const [showChangelog, setShowChangelog] = useState(false)
  const [changelog, setChangelog] = useState<string | null>(null)

  useEffect(() => {
    const offAvailable = window.steamtools?.onUpdateAvailable?.((info: UpdateInfo) => {
      setUpdateAvailable(info)
      setUpdateError(null)
    })
    const offProgress = window.steamtools?.onUpdateProgress?.((info: ProgressInfo) => {
      setProgress(info)
    })
    const offDownloaded = window.steamtools?.onUpdateDownloaded?.((info: UpdateInfo) => {
      setUpdateDownloaded(info)
      setUpdateAvailable(null)
      setProgress(null)
    })
    const offError = window.steamtools?.onUpdateError?.((info: { message: string }) => {
      console.error('Update error:', info.message)
      setUpdateError(info.message)
    })
    return () => {
      offAvailable?.()
      offProgress?.()
      offDownloaded?.()
      offError?.()
    }
  }, [])

  useEffect(() => {
    if (!updateError || !updateAvailable || retryCount > 0) return
    if (!updateError.includes('retry')) return

    setRetryCount(1)
    const downloadUrl = `https://github.com/yummancito/Y-CORE/releases/download/v${updateAvailable.version}/Y-core-Setup-${updateAvailable.version}.exe`
    console.log('Falling back to manual download:', downloadUrl)
    setUpdateError(null)
    window.steamtools?.manualDownloadUpdate?.(downloadUrl).then((result) => {
      setManualInstallerPath(result.path)
    }).catch((err: any) => {
      console.error('Manual download failed:', err)
      setUpdateError(err.message)
    })
  }, [updateError, updateAvailable, retryCount])

  const fetchChangelog = async () => {
    const version = updateAvailable?.version || updateDownloaded?.version || 'latest'
    try {
      setChangelog('Cargando...')
      const url = `https://api.github.com/repos/yummancito/Y-CORE/releases/tags/v${version}`
      const res = await fetch(url)
      if (!res.ok) throw new Error('Not found')
      const data = await res.json()
      setChangelog(data.body || '*Sin notas de versión*')
    } catch {
      setChangelog('*No se pudieron cargar las notas de versión*')
    }
  }

  const handleOpenChangelog = () => {
    setShowChangelog(!showChangelog)
    if (!changelog) fetchChangelog()
  }

  if (dismissed) return null

  const show = updateAvailable || updateDownloaded
  if (!show) return null

  const percent = progress ? Math.round(progress.percent) : 0

  return (
    <div className="fixed inset-0 z-[9000] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative w-full max-w-md rounded-2xl border border-white/[0.08] bg-[#13131a] p-6 shadow-2xl">
        <button
          onClick={() => setDismissed(true)}
          className="absolute top-4 right-4 text-text-dim hover:text-text-bright transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        {updateDownloaded ? (
          <>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-green-500/15 flex items-center justify-center">
                <RefreshCw className="w-5 h-5 text-green-400" />
              </div>
              <div>
                <p className="text-sm font-bold text-text-bright">
                  Actualización lista — v{updateDownloaded.version ?? 'nueva'}
                </p>
                <p className="text-xs text-text-dim">Reinicia para instalar la nueva versión.</p>
              </div>
            </div>

            {/* Changelog */}
            <button
              onClick={handleOpenChangelog}
              className="flex items-center gap-2 text-xs text-text-secondary hover:text-text-bright transition-colors mb-3"
            >
              <FileText className="w-3.5 h-3.5" />
              Ver qué hay de nuevo
            </button>

            {showChangelog && (
              <div className="mb-4 max-h-40 overflow-y-auto rounded-xl bg-black/30 p-3 text-xs text-text-secondary whitespace-pre-wrap">
                {changelog || 'Cargando...'}
              </div>
            )}

            <button
              onClick={() => {
                if (manualInstallerPath) {
                  window.steamtools?.runManualInstaller?.(manualInstallerPath)
                } else {
                  window.steamtools?.installUpdate?.()
                }
              }}
              className="w-full py-3 rounded-xl bg-green-600 text-white text-sm font-semibold transition-colors hover:bg-green-500"
            >
              Instalar y reiniciar
            </button>
          </>
        ) : (
          <>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-blue-500/15 flex items-center justify-center">
                <Download className="w-5 h-5 text-blue-400 animate-pulse" />
              </div>
              <div>
                <p className="text-sm font-bold text-text-bright">
                  Descargando actualización — v{updateAvailable?.version ?? 'nueva'}
                </p>
                <p className="text-xs text-text-dim">
                  {progress
                    ? `${formatBytes(progress.transferred)} / ${formatBytes(progress.total)} — ${formatSpeed(progress.bytesPerSecond)}`
                    : 'Preparando descarga...'}
                </p>
              </div>
            </div>

            <div className="w-full h-2 rounded-full bg-white/[0.06] overflow-hidden mb-2">
              <div
                className="h-full bg-gradient-to-r from-blue-500 to-blue-400 transition-all duration-300 rounded-full"
                style={{ width: `${percent}%` }}
              />
            </div>
            <p className="text-right text-xs text-text-dim font-mono">{percent}%</p>
          </>
        )}
      </div>
    </div>
  )
}
