import { useState, useEffect, useCallback } from 'react'

export interface SteamDownloadProgress {
  appId: string
  bytesDownloaded: number
  bytesTotal: number
  percent: number
  speed: number
}

export function useSteamDownload(appId: string) {
  const [progress, setProgress] = useState<SteamDownloadProgress | null>(null)
  const [isDownloading, setIsDownloading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Iniciar descarga
  const startDownload = useCallback(async (name: string) => {
    try {
      setError(null)
      setIsDownloading(true)

      const result = await (window as any).steamtools.invoke('steam:startDownload', appId, name)
      if (!result.success) {
        setError(result.error || 'Failed to start download')
        setIsDownloading(false)
        return false
      }

      // Comenzar a monitorear progreso
      const pollInterval = setInterval(async () => {
        const p = await (window as any).steamtools.invoke('steam:getProgress', appId)
        if (p) {
          setProgress(p)

          // Si está completado, detener polling
          if (p.percent >= 100) {
            clearInterval(pollInterval)
            setIsDownloading(false)
          }
        }
      }, 1000)

      return true
    } catch (err: any) {
      setError(err.message)
      setIsDownloading(false)
      return false
    }
  }, [appId])

  // Detener descarga
  const stopDownload = useCallback(async () => {
    try {
      await (window as any).steamtools.invoke('steam:stopDownload', appId)
      setIsDownloading(false)
      setProgress(null)
    } catch (err: any) {
      setError(err.message)
    }
  }, [appId])

  return {
    progress,
    isDownloading,
    error,
    startDownload,
    stopDownload,
  }
}
