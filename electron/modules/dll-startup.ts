// ============================================================================
// dll-startup.ts — DLL Manager initialization and startup hooks
//
// Integrates DLL Manager into the application lifecycle:
// - Runs integrity checks on app startup
// - Pre-caches DLLs before Online Fix is needed
// - Handles background repairs
// - Reports status to UI
// ============================================================================

import { ipcMain, ipcRenderer } from 'electron'
import { logger } from '../logger'
import { getDLLManager, createDLLManager } from './dll-manager'

/**
 * Initialize DLL Manager on app startup (main process)
 */
export async function initializeDLLManagerOnStartup(): Promise<void> {
  logger.info('Initializing DLL Manager...', 'dll-startup')

  try {
    const dllManager = getDLLManager({
      onProgress: (message) => {
        logger.debug(`[DLL] ${message}`, 'dll-startup')
      },
    })

    // Run startup integrity check
    logger.info('Running DLL integrity startup check...', 'dll-startup')
    const checkResult = await dllManager.performStartupCheck()

    if (checkResult.allValid) {
      logger.info(`DLL startup check passed: ${checkResult.dlls.length} DLLs valid`, 'dll-startup')
    } else {
      logger.warn(`Some DLLs failed startup check, repairs triggered`, 'dll-startup')
    }

    // Clean up old cache files
    logger.info('Cleaning up old DLL cache...', 'dll-startup')
    const cleanupResult = await dllManager.cleanupCache()
    if (cleanupResult.removed > 0) {
      logger.info(
        `Cleaned up ${cleanupResult.removed} cached files, freed ${(cleanupResult.freedBytes / 1024 / 1024).toFixed(2)} MB`,
        'dll-startup'
      )
    }

    // Report final status
    const stats = dllManager.getCacheStats()
    logger.info(
      `DLL Manager ready - Cache: ${stats.totalFiles} files, ${(stats.totalSizeBytes / 1024 / 1024).toFixed(2)} MB`,
      'dll-startup'
    )
  } catch (err) {
    logger.error(
      `DLL Manager initialization failed: ${err instanceof Error ? err.message : String(err)}`,
      'dll-startup'
    )
    // Non-fatal error - continue app startup even if DLL Manager fails
  }
}

/**
 * Pre-cache DLLs before Online Fix is needed (can be called periodically)
 */
export async function preCacheDLLs(): Promise<boolean> {
  logger.info('Pre-caching DLLs...', 'dll-startup')

  try {
    const dllManager = getDLLManager()
    const result = await dllManager.ensureDLLsAvailable()

    if (result.success) {
      const cached = []
      if (result.dlls.dll64) cached.push('64-bit')
      if (result.dlls.dll32) cached.push('32-bit')

      logger.info(`Pre-cached DLLs: ${cached.join(', ')}`, 'dll-startup')
      return true
    } else {
      logger.warn(`DLL pre-caching failed: ${result.errors.join(', ')}`, 'dll-startup')
      return false
    }
  } catch (err) {
    logger.error(`Pre-cache error: ${err instanceof Error ? err.message : String(err)}`, 'dll-startup')
    return false
  }
}

/**
 * Register IPC handlers for DLL Manager UI integration
 */
export function registerDLLManagerIPC(): void {
  // Get DLL status
  ipcMain.handle('dll:status', async () => {
    try {
      const dllManager = getDLLManager()

      const versions = await dllManager.getInstalledVersions()
      const stats = dllManager.getCacheStats()

      return {
        success: true,
        versions,
        cache: stats,
      }
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      }
    }
  })

  // Manually verify DLLs
  ipcMain.handle('dll:verify', async () => {
    try {
      const dllManager = getDLLManager()
      const result = await dllManager.performStartupCheck()

      return {
        success: result.allValid,
        dlls: result.dlls.length,
        allValid: result.allValid,
      }
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      }
    }
  })

  // Repair corrupted DLLs
  ipcMain.handle('dll:repair', async (_event, arch: '32' | '64') => {
    try {
      logger.info(`User initiated DLL repair for ${arch}-bit...`, 'dll-startup')
      const dllManager = getDLLManager()

      const repaired = await dllManager.repairCorruptedDLL(arch)

      if (repaired) {
        logger.info(`Successfully repaired ${arch}-bit DLL`, 'dll-startup')
        return { success: true, repaired: true }
      } else {
        return { success: false, repaired: false, error: 'Failed to repair DLL' }
      }
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      }
    }
  })

  // Clean up cache
  ipcMain.handle('dll:cleanup', async () => {
    try {
      const dllManager = getDLLManager()
      const result = await dllManager.cleanupCache()

      return {
        success: true,
        removed: result.removed,
        freedBytes: result.freedBytes,
        freedMB: (result.freedBytes / 1024 / 1024).toFixed(2),
      }
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      }
    }
  })

  // Force pre-cache
  ipcMain.handle('dll:precache', async () => {
    try {
      const success = await preCacheDLLs()
      return { success }
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      }
    }
  })

  logger.info('DLL Manager IPC handlers registered', 'dll-startup')
}

/**
 * UI helper - call from renderer process to get DLL status
 */
export async function getDLLStatus() {
  if (typeof window !== 'undefined' && window.electron?.ipcRenderer) {
    return await window.electron.ipcRenderer.invoke('dll:status')
  }
  return { success: false, error: 'IPC not available' }
}

/**
 * UI helper - verify DLLs from renderer
 */
export async function verifyDLLs() {
  if (typeof window !== 'undefined' && window.electron?.ipcRenderer) {
    return await window.electron.ipcRenderer.invoke('dll:verify')
  }
  return { success: false, error: 'IPC not available' }
}

/**
 * UI helper - repair specific DLL from renderer
 */
export async function repairDLL(arch: '32' | '64') {
  if (typeof window !== 'undefined' && window.electron?.ipcRenderer) {
    return await window.electron.ipcRenderer.invoke('dll:repair', arch)
  }
  return { success: false, error: 'IPC not available' }
}

/**
 * UI helper - cleanup cache from renderer
 */
export async function cleanupDLLCache() {
  if (typeof window !== 'undefined' && window.electron?.ipcRenderer) {
    return await window.electron.ipcRenderer.invoke('dll:cleanup')
  }
  return { success: false, error: 'IPC not available' }
}

/**
 * UI helper - pre-cache DLLs from renderer
 */
export async function preCacheDLLsFromUI() {
  if (typeof window !== 'undefined' && window.electron?.ipcRenderer) {
    return await window.electron.ipcRenderer.invoke('dll:precache')
  }
  return { success: false, error: 'IPC not available' }
}

// ─────────────────────────────────────────────────────────────────────────────
// Scheduled checks (can be called periodically)
// ─────────────────────────────────────────────────────────────────────────────

let integrityCheckInterval: NodeJS.Timeout | null = null

/**
 * Start periodic DLL integrity checks
 * Useful for detecting corruption during app runtime
 */
export function startPeriodicIntegrityChecks(intervalMs: number = 3600000): void {
  // Default: every hour
  if (integrityCheckInterval) {
    clearInterval(integrityCheckInterval)
  }

  logger.info(`Starting periodic DLL integrity checks (every ${intervalMs / 1000 / 60} minutes)`, 'dll-startup')

  integrityCheckInterval = setInterval(async () => {
    try {
      const dllManager = getDLLManager()
      const result = await dllManager.performStartupCheck()

      if (!result.allValid) {
        logger.warn(`Periodic check detected corrupted DLLs, triggering repairs`, 'dll-startup')
      }
    } catch (err) {
      logger.warn(`Periodic integrity check failed: ${err instanceof Error ? err.message : String(err)}`, 'dll-startup')
    }
  }, intervalMs)
}

/**
 * Stop periodic integrity checks
 */
export function stopPeriodicIntegrityChecks(): void {
  if (integrityCheckInterval) {
    clearInterval(integrityCheckInterval)
    integrityCheckInterval = null
    logger.info('Periodic DLL integrity checks stopped', 'dll-startup')
  }
}
