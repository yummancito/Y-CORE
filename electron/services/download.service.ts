// ============================================================================
// electron/services/download.service.ts — Backend DownloadService
// Wraps download-engine and download-ipc functions.
// ============================================================================

import { logger } from '../logger'
import { exec, spawn } from 'child_process'
import path from 'path'
import { getSteamPath, closeSteamProcess } from '../modules/steam-helpers'
import { checkAndUpdateOpenSteamTool } from '../modules/opensteamtool-updater'
import { installHookDll } from '../modules/dll-inject'
import { installGameCore } from '../modules/manifest-sync'
import { getDownloadEngine, DownloadPriority } from '../modules/download-engine'
import { getDownloadApiBridge } from '../modules/download-api-bridge'
import {
  getIntegrityScanner,
  getRepairEngine,
  getDiskPreallocator,
  getCacheManager,
} from '../modules/download-engine-repair'
import type { DownloadSource } from '../modules/download-engine-types'
import { diagnoseAndRepairLocalInstallation } from '../modules/local-installation-diagnostics'

export const downloadService = {
  async createTask(opts: any) {
    try {
      const engine = getDownloadEngine()
      const task = engine.createTask({
        appId: opts.appId,
        name: opts.name,
        source: opts.source,
        priority: opts.priority ?? DownloadPriority.NORMAL,
        installDir: opts.installDir,
        depotKeys: opts.depotKeys,
        manifestFiles: opts.manifestFiles,
        directUrl: opts.directUrl,
        localPath: opts.localPath,
        maxRetries: opts.maxRetries,
      })
      return { success: true, task }
    } catch (err: any) {
      logger.error(`[DownloadService] createTask failed: ${err.message}`, 'services')
      return { success: false, error: err.message }
    }
  },

  async startTask(taskId: string) {
    try {
      const engine = getDownloadEngine()
      const ok = await engine.startTask(taskId)
      return { success: ok }
    } catch (err: any) { return { success: false, error: err.message } }
  },

  async pauseTask(taskId: string) {
    try {
      const engine = getDownloadEngine()
      const ok = engine.pauseTask(taskId)
      return { success: ok }
    } catch (err: any) { return { success: false, error: err.message } }
  },

  async cancelTask(taskId: string) {
    try {
      const engine = getDownloadEngine()
      const ok = engine.cancelTask(taskId)
      return { success: ok }
    } catch (err: any) { return { success: false, error: err.message } }
  },

  async getTasks() {
    try {
      const engine = getDownloadEngine()
      return { success: true, tasks: engine.getAllTasks(), queue: engine.getActiveTasks() }
    } catch (err: any) { return { success: false, error: err.message, tasks: [], queue: [] } }
  },

  async getHistory() {
    try {
      const engine = getDownloadEngine()
      return { success: true, history: engine.getHistory() }
    } catch (err: any) { return { success: false, error: err.message, history: [] } }
  },

  async getStatus() {
    try {
      const engine = getDownloadEngine()
      return { success: true, status: engine.getStatus() }
    } catch (err: any) { return { success: false, error: err.message } }
  },

  async setPriority(taskId: string, priority: number) {
    try {
      const engine = getDownloadEngine()
      const ok = engine.setPriority(taskId, priority as DownloadPriority)
      return { success: ok }
    } catch (err: any) { return { success: false, error: err.message } }
  },

  async reorderTask(taskId: string, newIndex: number) {
    try {
      const engine = getDownloadEngine()
      const ok = engine.reorderTask(taskId, newIndex)
      return { success: ok }
    } catch (err: any) { return { success: false, error: err.message } }
  },

  async setPaused(paused: boolean) {
    try {
      const engine = getDownloadEngine()
      engine.setPaused(paused)
      return { success: true }
    } catch (err: any) { return { success: false, error: err.message } }
  },

  async clearCompleted() {
    try {
      const engine = getDownloadEngine()
      engine.clearCompleted()
      return { success: true }
    } catch (err: any) { return { success: false, error: err.message } }
  },

  async clearHistory() {
    try {
      const engine = getDownloadEngine()
      engine.clearHistory()
      return { success: true }
    } catch (err: any) { return { success: false, error: err.message } }
  },

  async startFromApi(opts: any) {
    try {
      const steamPath = getSteamPath()
      if (!steamPath) {
        return { success: false, error: 'Steam not found', tasks: [] }
      }

      const appId = opts.appId

      // Convertir formato de keys del API (decryption_key) al formato esperado (key)
      const depotKeys = (opts.depotKeys || []).map((k: any) => ({
        depot_id: k.depot_id || k.depotId,
        key: k.decryption_key || k.key,
      }))

      // PASO 1: Instalar Hook DLL (YCoreTool.dll, dwmapi.dll, xinput1_4.dll)
      logger.info(`[DownloadService] Installing hook DLL...`, 'services')
      const hookResult = await installHookDll(steamPath)
      if (!hookResult.success) {
        logger.warn(`[DownloadService] Hook DLL installation failed: ${hookResult.error}`, 'services')
        // Continuar de todas formas
      } else {
        logger.info(`[DownloadService] Hook DLL ${hookResult.installed ? 'installed' : 'already installed'}`, 'services')
      }

      // PASO 2: Configurar el juego (Lua, Keys, ACF) usando installGameCore
      logger.info(`[DownloadService] Setting up game: ${opts.name} (${appId})`, 'services')
      const gameResult = await installGameCore(appId, opts.name, opts.luaContent || '', depotKeys, steamPath)

      if (gameResult.errors.length > 0) {
        logger.warn(`[DownloadService] Game setup had errors:`, 'services')
        gameResult.errors.forEach((err: string) => logger.warn(`  - ${err}`, 'services'))
      }

      if (gameResult.actions.length > 0) {
        logger.info(`[DownloadService] Game setup actions:`, 'services')
        gameResult.actions.forEach((action: string) => logger.info(`  - ${action}`, 'services'))
      }

      // Setup (depot keys + ACF + Lua) only writes files to disk — Steam
      // itself has to restart and read the new appmanifest before it starts
      // pulling the actual bytes. Without this restart, the renderer marked
      // the install "complete" the moment setup finished, but Steam never
      // saw the game and showed "No hay licencias" when the user hit Play —
      // a false success with nothing actually downloaded.
      logger.info(`[DownloadService] Setup complete. Restarting Steam so it picks up the new appmanifest...`, 'services')
      try {
        const closeResult = await closeSteamProcess()
        if (closeResult.success) {
          const steamExe = process.platform === 'win32' ? path.join(steamPath, 'steam.exe') : 'steam'
          const child = spawn(steamExe, [], { detached: true, stdio: 'ignore' })
          child.unref()
          logger.info(`[DownloadService] Steam restarted to begin download of ${opts.name}`, 'services')
        } else {
          logger.warn(`[DownloadService] Could not close Steam to restart it: ${closeResult.error}`, 'services')
        }
      } catch (err: any) {
        logger.warn(`[DownloadService] Steam restart failed: ${err.message}`, 'services')
      }

      return {
        success: true,
        tasks: [{
          id: appId,
          appId,
          name: opts.name,
          source: 'steam',
          state: 'ready',
        }]
      }
    } catch (err: any) {
      logger.error(`[DownloadService] startFromApi failed: ${err.message}`, 'services')
      return { success: false, error: err.message, tasks: [] }
    }
  },

  // ── Integrity ──────────────────────────────────────────────────────────────

  async integrityCheck(appId: string, installDir: string) {
    try {
      const scanner = getIntegrityScanner()
      const result = await scanner.scan(appId, installDir, undefined, (current, total, filePath) => {
        logger.info(`[Integrity] ${current}/${total} - ${filePath}`, 'services')
      })
      return { success: true, result }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  },

  async repairFiles(appId: string, installDir: string, corruptedPaths: string[], missingPaths: string[]) {
    try {
      const repairEngine = getRepairEngine()
      const result = await repairEngine.repair(appId, installDir,
        corruptedPaths.map((p) => ({ path: p, expectedSha1: '', actualSha1: '', error: 'Corrupted' })),
        missingPaths,
      )
      return { success: result.success, result }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  },

  async diskPreallocate(filePath: string, size: number) {
    try {
      const preallocator = getDiskPreallocator()
      const ok = preallocator.preallocate(filePath, size)
      return { success: ok }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  },

  async checkDiskSpace(dirPath: string, requiredBytes: number) {
    try {
      const preallocator = getDiskPreallocator()
      const result = preallocator.ensureSpace(dirPath, requiredBytes)
      return { success: result.ok, available: result.available, message: result.message }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  },

  async getCacheStats() {
    try {
      const cache = getCacheManager()
      return { success: true, stats: cache.getStats() }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  },

  async clearCache() {
    try {
      const cache = getCacheManager()
      cache.clear()
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  },

  async repairLocalInstallation(appId: string, installDir: string) {
    try {
      const result = await diagnoseAndRepairLocalInstallation(appId, installDir)
      return { success: true, result }
    } catch (err: any) {
      logger.error(`[DownloadService] local installation repair failed for ${appId}: ${err.message}`, 'services')
      return { success: false, error: err.message }
    }
  },
}
