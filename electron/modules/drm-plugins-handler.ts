// ============================================================================
// electron/modules/drm-plugins-handler.ts
// IPC Handler for DRM Plugin System
// Integrates Phase 2 plugins with existing DRM infrastructure
// ============================================================================

import { ipcMain } from 'electron'
import { logger } from '../logger'
import { drmPluginRegistry } from './drm-plugins/registry'
import { versionManager } from './drm-plugins/version-manager'
import { runCrossPlatformDetection, getPlatformCapabilities } from './drm-plugins/cross-platform'
import { pcgamingwikiService } from '../services/pcgamingwiki.service'
import type { DrmDetectionResult, DrmRemovalResult } from './drm-plugins/types'

/**
 * Register DRM plugin system IPC handlers
 */
export function registerDrmPluginHandlers(): void {
  /**
   * Detect all DRMs in a game
   */
  ipcMain.handle('drm:plugins:detect-all', async (_event, exePath: string, gameDir: string, appId?: string) => {
    try {
      logger.info(`[DRM Handler] Detecting all DRMs for app ${appId}`, 'drm')
      return await drmPluginRegistry.detectAllDrms(exePath, gameDir, appId)
    } catch (err) {
      logger.error(
        `[DRM Handler] Detection failed: ${err instanceof Error ? err.message : 'unknown'}`,
        'drm'
      )
      return {
        detected: false,
        drmTypes: [],
        platformSupported: false,
      }
    }
  })

  /**
   * Detect with specific plugin
   */
  ipcMain.handle(
    'drm:plugins:detect-with-plugin',
    async (_event, pluginId: string, exePath: string, gameDir: string, appId?: string) => {
      try {
        logger.info(`[DRM Handler] Detecting with plugin ${pluginId}`, 'drm')
        return await drmPluginRegistry.detectWithPlugin(pluginId, exePath, gameDir, appId)
      } catch (err) {
        logger.error(
          `[DRM Handler] Plugin detection failed: ${err instanceof Error ? err.message : 'unknown'}`,
          'drm'
        )
        return {
          detected: false,
          drmTypes: [],
          platformSupported: false,
        }
      }
    }
  )

  /**
   * Remove DRM with best matching plugin
   */
  ipcMain.handle('drm:plugins:remove-best', async (_event, exePath: string, gameDir: string, appId?: string) => {
    try {
      logger.info(`[DRM Handler] Removing DRM (best plugin) for app ${appId}`, 'drm')
      return await drmPluginRegistry.removeWithBestPlugin(exePath, gameDir, appId)
    } catch (err) {
      logger.error(
        `[DRM Handler] Removal failed: ${err instanceof Error ? err.message : 'unknown'}`,
        'drm'
      )
      return {
        success: false,
        message: err instanceof Error ? err.message : 'Unknown error',
        drmType: 'Unknown',
        hadDrm: false,
      }
    }
  })

  /**
   * Remove DRM with specific plugin
   */
  ipcMain.handle(
    'drm:plugins:remove-with-plugin',
    async (_event, pluginId: string, exePath: string, gameDir: string, appId?: string) => {
      try {
        logger.info(`[DRM Handler] Removing DRM with plugin ${pluginId}`, 'drm')
        return await drmPluginRegistry.removeWithPlugin(pluginId, exePath, gameDir, appId)
      } catch (err) {
        logger.error(
          `[DRM Handler] Plugin removal failed: ${err instanceof Error ? err.message : 'unknown'}`,
          'drm'
        )
        return {
          success: false,
          message: err instanceof Error ? err.message : 'Unknown error',
          drmType: 'Unknown',
          hadDrm: false,
        }
      }
    }
  )

  /**
   * Restore from backup
   */
  ipcMain.handle(
    'drm:plugins:restore',
    async (_event, pluginId: string, exePath: string, backupPath: string) => {
      try {
        logger.info(`[DRM Handler] Restoring backup for plugin ${pluginId}`, 'drm')
        return await drmPluginRegistry.restoreWithPlugin(pluginId, exePath, backupPath)
      } catch (err) {
        logger.error(
          `[DRM Handler] Restoration failed: ${err instanceof Error ? err.message : 'unknown'}`,
          'drm'
        )
        return {
          success: false,
          message: err instanceof Error ? err.message : 'Unknown error',
        }
      }
    }
  )

  /**
   * Get available plugins
   */
  ipcMain.handle('drm:plugins:list', (_event) => {
    try {
      const plugins = drmPluginRegistry.getAllPlugins()
      return plugins.map((p) => ({
        id: p.id,
        name: p.name,
        version: p.version,
        drmTypes: p.drmTypes,
        supportedPlatforms: p.supportedPlatforms,
      }))
    } catch (err) {
      logger.error(
        `[DRM Handler] List plugins failed: ${err instanceof Error ? err.message : 'unknown'}`,
        'drm'
      )
      return []
    }
  })

  /**
   * Get plugin stats
   */
  ipcMain.handle('drm:plugins:stats', (_event) => {
    try {
      return drmPluginRegistry.getStats()
    } catch (err) {
      logger.error(
        `[DRM Handler] Stats failed: ${err instanceof Error ? err.message : 'unknown'}`,
        'drm'
      )
      return {
        totalPlugins: 0,
        drmTypesSupported: [],
        platformsSupported: new Set(),
      }
    }
  })

  /**
   * Get version-specific DRM instructions
   */
  ipcMain.handle('drm:plugins:version-info', (_event, gameId: string, version?: string) => {
    try {
      const instruction = versionManager.getBestInstruction(gameId, version)
      return instruction || null
    } catch (err) {
      logger.error(
        `[DRM Handler] Version info failed: ${err instanceof Error ? err.message : 'unknown'}`,
        'drm'
      )
      return null
    }
  })

  /**
   * Add version-specific instruction (community contribution)
   */
  ipcMain.handle('drm:plugins:add-version-info', (_event, instruction) => {
    try {
      versionManager.addInstruction(instruction)
      return { success: true, message: 'Instruction added' }
    } catch (err) {
      logger.error(
        `[DRM Handler] Add version info failed: ${err instanceof Error ? err.message : 'unknown'}`,
        'drm'
      )
      return {
        success: false,
        message: err instanceof Error ? err.message : 'Failed to add instruction',
      }
    }
  })

  /**
   * Get cross-platform detection
   */
  ipcMain.handle('drm:plugins:cross-platform-detect', async (_event, exePath: string, gameDir: string) => {
    try {
      logger.info('[DRM Handler] Running cross-platform detection', 'drm')
      return await runCrossPlatformDetection(exePath, gameDir)
    } catch (err) {
      logger.error(
        `[DRM Handler] Cross-platform detection failed: ${err instanceof Error ? err.message : 'unknown'}`,
        'drm'
      )
      return {
        detected: false,
        drmTypes: [],
        platformSupported: false,
        platform: 'unknown',
        detectorUsed: 'unknown',
      }
    }
  })

  /**
   * Get platform capabilities
   */
  ipcMain.handle('drm:plugins:platform-capabilities', (_event) => {
    try {
      return getPlatformCapabilities()
    } catch (err) {
      logger.error(
        `[DRM Handler] Platform capabilities failed: ${err instanceof Error ? err.message : 'unknown'}`,
        'drm'
      )
      return {
        platform: 'unknown',
        peHeaderAnalysis: false,
        registryAccess: false,
        dllInjection: false,
        protonCompat: false,
        drmRemovalSupported: false,
      }
    }
  })

  /**
   * Fetch DRM info from PCGamingWiki
   */
  ipcMain.handle('drm:plugins:pcgamingwiki-info', async (_event, appId: string) => {
    try {
      logger.info(`[DRM Handler] Fetching PCGamingWiki info for app ${appId}`, 'drm')
      return await pcgamingwikiService.getDrmInfo(appId)
    } catch (err) {
      logger.error(
        `[DRM Handler] PCGamingWiki fetch failed: ${err instanceof Error ? err.message : 'unknown'}`,
        'drm'
      )
      return null
    }
  })

  /**
   * Get PCGamingWiki cache stats
   */
  ipcMain.handle('drm:plugins:pcgamingwiki-cache-stats', (_event) => {
    try {
      return pcgamingwikiService.getCacheStats()
    } catch (err) {
      logger.error(
        `[DRM Handler] Cache stats failed: ${err instanceof Error ? err.message : 'unknown'}`,
        'drm'
      )
      return { size: 0, validEntries: 0 }
    }
  })

  /**
   * Clear PCGamingWiki cache
   */
  ipcMain.handle('drm:plugins:pcgamingwiki-clear-cache', (_event) => {
    try {
      pcgamingwikiService.clearCache()
      return { success: true }
    } catch (err) {
      logger.error(
        `[DRM Handler] Clear cache failed: ${err instanceof Error ? err.message : 'unknown'}`,
        'drm'
      )
      return { success: false }
    }
  })

  /**
   * Export version database for sharing
   */
  ipcMain.handle('drm:plugins:export-version-db', (_event) => {
    try {
      return versionManager.exportDatabase()
    } catch (err) {
      logger.error(
        `[DRM Handler] Export failed: ${err instanceof Error ? err.message : 'unknown'}`,
        'drm'
      )
      return null
    }
  })

  /**
   * Import version database from community
   */
  ipcMain.handle('drm:plugins:import-version-db', (_event, jsonContent: string) => {
    try {
      return versionManager.importDatabase(jsonContent)
    } catch (err) {
      logger.error(
        `[DRM Handler] Import failed: ${err instanceof Error ? err.message : 'unknown'}`,
        'drm'
      )
      return {
        success: false,
        message: err instanceof Error ? err.message : 'Import failed',
      }
    }
  })
}

/**
 * Cleanup DRM plugins on app shutdown
 */
export async function cleanupDrmPlugins(): Promise<void> {
  try {
    await drmPluginRegistry.cleanup()
    logger.info('[DRM Handler] Plugin cleanup completed', 'drm')
  } catch (err) {
    logger.warn(
      `[DRM Handler] Cleanup error: ${err instanceof Error ? err.message : 'unknown'}`,
      'drm'
    )
  }
}
