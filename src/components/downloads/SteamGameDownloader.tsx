import { useState } from 'react'
import { Download, Play, Pause, X } from 'lucide-react'
import { useSteamDownload } from '../../hooks/useSteamDownload'
import { formatBytes } from '../../stores/useDownloadEngineV3Store'

export function SteamGameDownloader() {
  const [appId, setAppId] = useState('')
  const [gameName, setGameName] = useState('')
  const [activeDownload, setActiveDownload] = useState<string | null>(null)

  const { progress, isDownloading, error, startDownload, stopDownload } = useSteamDownload(activeDownload || '')

  const handleStartDownload = async () => {
    if (!appId || !gameName) {
      alert('Ingresa App ID y nombre del juego')
      return
    }

    setActiveDownload(appId)
    const success = await startDownload(gameName)
    if (!success) {
      setActiveDownload(null)
    }
  }

  const handleStopDownload = async () => {
    await stopDownload()
    setActiveDownload(null)
  }

  const formatSpeed = (bytesPerSec: number) => {
    return `${(bytesPerSec / 1024 / 1024).toFixed(2)} MB/s`
  }

  const formatEta = (bytesRemaining: number, bytesPerSec: number) => {
    if (bytesPerSec === 0) return '--'
    const seconds = Math.ceil(bytesRemaining / bytesPerSec)
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    if (hours > 0) return `${hours}h ${minutes}m`
    return `${minutes}m ${seconds % 60}s`
  }

  if (activeDownload && progress) {
    const bytesRemaining = progress.bytesTotal - progress.bytesDownloaded
    const eta = formatEta(bytesRemaining, progress.speed)

    return (
      <div className="bg-gray-900 rounded-lg p-6 border border-gray-700">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h3 className="text-lg font-semibold text-white">{gameName}</h3>
            <p className="text-xs text-gray-400">App ID: {appId}</p>
          </div>
          <button
            onClick={handleStopDownload}
            className="p-2 hover:bg-gray-800 rounded-lg transition"
          >
            <X className="w-5 h-5 text-red-500" />
          </button>
        </div>

        {/* Progress bar */}
        <div className="mb-4">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-medium text-white">{progress.percent.toFixed(1)}%</span>
            <span className="text-xs text-gray-400">{formatBytes(progress.bytesDownloaded)} / {formatBytes(progress.bytesTotal)}</span>
          </div>
          <div className="w-full bg-gray-800 rounded-full h-3 overflow-hidden">
            <div
              className="bg-gradient-to-r from-blue-500 to-cyan-400 h-full transition-all duration-300"
              style={{ width: `${progress.percent}%` }}
            />
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2 text-sm">
          <div className="bg-gray-800 rounded p-2">
            <p className="text-gray-400 text-xs">Velocidad</p>
            <p className="text-white font-semibold">{formatSpeed(progress.speed)}</p>
          </div>
          <div className="bg-gray-800 rounded p-2">
            <p className="text-gray-400 text-xs">ETA</p>
            <p className="text-white font-semibold">{eta}</p>
          </div>
          <div className="bg-gray-800 rounded p-2">
            <p className="text-gray-400 text-xs">Estado</p>
            <p className="text-white font-semibold">{isDownloading ? 'Descargando' : 'Completado'}</p>
          </div>
        </div>

        {error && (
          <div className="mt-4 p-3 bg-red-900/20 border border-red-500 rounded text-red-400 text-sm">
            {error}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="bg-gray-900 rounded-lg p-6 border border-gray-700">
      <div className="flex items-center gap-2 mb-4">
        <Download className="w-5 h-5 text-cyan-400" />
        <h3 className="text-lg font-semibold text-white">Descargar desde Steam</h3>
      </div>

      <div className="space-y-3">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">App ID de Steam</label>
          <input
            type="text"
            value={appId}
            onChange={(e) => setAppId(e.target.value)}
            placeholder="ej: 1623730"
            className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-400"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">Nombre del juego</label>
          <input
            type="text"
            value={gameName}
            onChange={(e) => setGameName(e.target.value)}
            placeholder="ej: Palworld"
            className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-400"
          />
        </div>

        <button
          onClick={handleStartDownload}
          disabled={!appId || !gameName}
          className="w-full bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-2 rounded-lg transition flex items-center justify-center gap-2"
        >
          <Play className="w-4 h-4" />
          Iniciar descarga
        </button>

        {error && (
          <div className="p-3 bg-red-900/20 border border-red-500 rounded text-red-400 text-sm">
            {error}
          </div>
        )}
      </div>
    </div>
  )
}
