// ============================================================================
// steam-download.service.ts — Steam-native download manager
// ============================================================================
// Usa Steam API real para descargar juegos, monitorea progreso en Y-core

import { logger } from '../logger'
import {
  detectSteamPath,
  launchSteamForDownload,
  startDownloadMonitor,
  stopSteam,
  optimizeNetworkForDownloads,
  type SteamDownloadProgress,
} from '../modules/steam-launcher'

interface SteamDownloadTask {
  appId: string
  name: string
  state: 'idle' | 'launching' | 'downloading' | 'completed' | 'failed'
  progress: SteamDownloadProgress | null
  startTime: number
  stopMonitor?: () => void
}

class SteamDownloadService {
  private tasks = new Map<string, SteamDownloadTask>()
  private networkOptimized = false

  async startDownload(appId: string, name: string): Promise<boolean> {
    try {
      logger.info(`[steam-download] Starting download for ${name} (${appId})`, 'download')

      // Verificar que Steam esté instalado
      if (!detectSteamPath()) {
        logger.error('[steam-download] Steam not found', 'download')
        return false
      }

      // Optimizar red si no se ha hecho
      if (!this.networkOptimized) {
        await optimizeNetworkForDownloads()
        this.networkOptimized = true
      }

      // Crear tarea
      const task: SteamDownloadTask = {
        appId,
        name,
        state: 'launching',
        progress: null,
        startTime: Date.now(),
      }
      this.tasks.set(appId, task)

      // Lanzar Steam
      const launched = await launchSteamForDownload(appId)
      if (!launched) {
        task.state = 'failed'
        return false
      }

      // Esperar un poco para que Steam cree el ACF
      await new Promise(resolve => setTimeout(resolve, 3000))

      // Iniciar monitor
      task.state = 'downloading'
      task.stopMonitor = startDownloadMonitor(
        appId,
        (progress) => {
          task.progress = progress
          logger.info(
            `[steam-download] ${name}: ${(progress.percent).toFixed(1)}% (${(progress.speed / 1024 / 1024).toFixed(2)} MB/s)`,
            'download'
          )
        },
        () => {
          task.state = 'completed'
          logger.info(`[steam-download] Download completed: ${name}`, 'download')
        }
      )

      return true
    } catch (err: any) {
      logger.error(`[steam-download] Error: ${err.message}`, 'download')
      return false
    }
  }

  getProgress(appId: string): SteamDownloadProgress | null {
    return this.tasks.get(appId)?.progress ?? null
  }

  getTask(appId: string): SteamDownloadTask | null {
    return this.tasks.get(appId) ?? null
  }

  getAllTasks(): SteamDownloadTask[] {
    return Array.from(this.tasks.values())
  }

  stopDownload(appId: string): boolean {
    try {
      const task = this.tasks.get(appId)
      if (!task) return false

      if (task.stopMonitor) {
        task.stopMonitor()
      }
      stopSteam()
      task.state = 'idle'

      logger.info(`[steam-download] Download stopped: ${task.name}`, 'download')
      return true
    } catch (err: any) {
      logger.error(`[steam-download] Error stopping download: ${err.message}`, 'download')
      return false
    }
  }

  clear(appId?: string): void {
    if (appId) {
      this.stopDownload(appId)
      this.tasks.delete(appId)
    } else {
      this.tasks.forEach((_, id) => this.stopDownload(id))
      this.tasks.clear()
    }
  }
}

export const steamDownloadService = new SteamDownloadService()
