// ============================================================================
// electron/services/drm.service.ts — Backend DrmService
// Uses plugin registry for DRM detection and removal
// ============================================================================

import path from 'path'
import fs from 'fs'
import { drmPluginRegistry } from '../modules/drm-plugins/registry'
import { removeGameDrm, checkDrmStatus } from '../modules/drm-remover'
import { getSteamAppsPath, parseVdf } from '../modules/steam-helpers'
import { logger } from '../logger'

/**
 * Helper: Get game executable and directory
 */
function getGamePaths(appId: string): { exePath: string | null; gameDir: string } | null {
  try {
    const steamAppsPath = getSteamAppsPath()
    if (!steamAppsPath) return null

    const acfPath = path.join(steamAppsPath, `appmanifest_${appId}.acf`)
    if (!fs.existsSync(acfPath)) return null

    const content = fs.readFileSync(acfPath, 'utf-8')
    const parsed = parseVdf(content)
    const installDir = parsed['AppState']?.['installdir']

    if (!installDir) return null

    const gameDir = path.join(steamAppsPath, 'common', installDir)

    // Try to find executable
    let exePath: string | null = null
    const folders = fs.readdirSync(gameDir, { withFileTypes: true })
    for (const entry of folders) {
      if (entry.isFile() && entry.name.toLowerCase().endsWith('.exe')) {
        exePath = path.join(gameDir, entry.name)
        break
      }
    }

    return { exePath, gameDir }
  } catch (err) {
    logger.warn(`[DRM Service] Failed to get game paths for ${appId}: ${err instanceof Error ? err.message : 'unknown'}`, 'drm')
    return null
  }
}

// ============================================================================
// Phase 3: Import new modules for ML detection, anti-cheat, community DB, routing
// ============================================================================

let phase3Available = false
try {
  // Try to import Phase 3 modules, but don't fail if they're not available
  phase3Available = true
} catch (err) {
  logger.warn('[DRM Service] Phase 3 modules not available', 'drm')
}

export const drmService = {
  /**
   * Detect DRM in a game using all available plugins
   */
  async detect(appId: string) {
    const paths = getGamePaths(appId)
    if (!paths || !paths.exePath) {
      return {
        detected: false,
        drmTypes: [],
        platformSupported: process.platform === 'win32',
        message: 'Could not locate game executable',
      }
    }

    try {
      const result = await drmPluginRegistry.detectAllDrms(paths.exePath, paths.gameDir, appId)
      return {
        ...result,
        exePath: paths.exePath,
        gameDir: paths.gameDir,
      }
    } catch (err) {
      logger.error(`[DRM Service] Detection failed for ${appId}: ${err instanceof Error ? err.message : 'unknown'}`, 'drm')
      return {
        detected: false,
        drmTypes: [],
        platformSupported: process.platform === 'win32',
        message: `Detection error: ${err instanceof Error ? err.message : 'unknown'}`,
      }
    }
  },

  /**
   * Remove DRM using the best available plugin
   */
  async remove(appId: string) {
    const paths = getGamePaths(appId)
    if (!paths || !paths.exePath) {
      return {
        success: false,
        message: 'Could not locate game executable',
        hadDrm: false,
        errorKey: 'drm.error.executableNotFound',
      }
    }

    try {
      // Use native C++ plugin for removal only
      const result = await drmPluginRegistry.removeWithBestPlugin(paths.exePath, paths.gameDir, appId)
      return result
    } catch (err) {
      logger.error(`[DRM Service] Plugin removal failed: ${err instanceof Error ? err.message : 'unknown'}`, 'drm')
      return {
        success: false,
        message: err instanceof Error ? err.message : 'Removal failed',
        hadDrm: false,
        errorKey: 'drm.error.removalFailed',
      }
    }
  },

  /**
   * Remove DRM using a specific plugin
   */
  async removeWithPlugin(appId: string, pluginId: string) {
    const paths = getGamePaths(appId)
    if (!paths || !paths.exePath) {
      return {
        success: false,
        message: 'Could not locate game executable',
        hadDrm: false,
        errorKey: 'drm.error.executableNotFound',
      }
    }

    try {
      return await drmPluginRegistry.removeWithPlugin(pluginId, paths.exePath, paths.gameDir, appId)
    } catch (err) {
      logger.error(`[DRM Service] Plugin removal failed: ${err instanceof Error ? err.message : 'unknown'}`, 'drm')
      return {
        success: false,
        message: err instanceof Error ? err.message : 'Removal failed',
        hadDrm: false,
        errorKey: 'drm.error.removalFailed',
      }
    }
  },

  /**
   * Check DRM status (legacy method, now uses plugins)
   */
  async status(appId: string) {
    return await checkDrmStatus(appId)
  },

  /**
   * Get all available DRM plugins
   */
  getAvailablePlugins() {
    return drmPluginRegistry.getAllPlugins()
  },

  /**
   * Get registry statistics
   */
  getStats() {
    return drmPluginRegistry.getStats()
  },

  // ========================================================================
  // PHASE 3: ML-based Detection, Community DB, Smart Routing
  // ========================================================================

  /**
   * PHASE 3: Advanced DRM assessment with ML detection.
   * Returns:
   * - ML-based DRM type detection (signature + entropy analysis)
   * - Anti-cheat detection and warnings (flagging only, never attempts removal)
   * - Locally-stored community feedback and success rates for this appId
   *
   * Note: there is no server-side "community" — stats are whatever this
   * install has recorded via contributeResult(). There is also no smart
   * strategy router here; the removal-method success percentages that used
   * to come from drm-strategy-router.ts were hardcoded guesses with no real
   * data behind them, so that module was removed rather than exposed as if
   * it were a genuine recommendation engine.
   */
  async assessGameAdvanced(appId: string) {
    const paths = getGamePaths(appId)
    if (!paths || !paths.exePath) {
      return {
        success: false,
        message: 'Could not locate game executable',
        appId,
      }
    }

    try {
      const { detectDrmStubs } = await import('../modules/drm-plugins/ml-stub-detector')
      const { detectAntiCheat } = await import('../modules/drm-plugins/anticheat-plugin')
      const { communityDbService } = await import('./community-db.service')

      const drmDetection = await detectDrmStubs(paths.exePath)
      const antiCheatDetection = await detectAntiCheat(paths.gameDir)
      const communityStats = await communityDbService.getStats(appId)

      return {
        success: true,
        appId,
        exePath: paths.exePath,
        gameDir: paths.gameDir,
        drmDetection,
        antiCheatDetection,
        communityStats,
      }
    } catch (err) {
      logger.warn(`[DRM Service] Phase 3 assessment not available: ${err instanceof Error ? err.message : 'unknown'}`, 'drm')
      return {
        success: false,
        message: 'Phase 3 modules not available',
        appId,
        error: err instanceof Error ? err.message : 'unknown',
      }
    }
  },

  /**
   * PHASE 3: Contribute removal result to community database
   * Helps build crowdsourced removal success database
   */
  async contributeResult(appId: string, drmType: string, removalMethod: string, successStatus: 'success' | 'partial' | 'failed', notes?: string) {
    try {
      const { communityDbService } = await import('./community-db.service')
      await communityDbService.initialize()

      return await communityDbService.contribute({
        appId,
        gameVersion: '1.0.0', // Would be obtained from app manifest
        drmType,
        removalMethod,
        successStatus,
        userNotes: notes,
      })
    } catch (err) {
      logger.warn(`[DRM Service] Could not record contribution: ${err instanceof Error ? err.message : 'unknown'}`, 'drm')
      return {
        success: false,
        message: 'Could not record contribution',
      }
    }
  },

  /**
   * PHASE 3: Get community success rate for a game
   */
  async getCommunityStats(appId: string) {
    try {
      const { communityDbService } = await import('./community-db.service')
      await communityDbService.initialize()
      return await communityDbService.getStats(appId)
    } catch (err) {
      logger.warn(`[DRM Service] Could not retrieve community stats: ${err instanceof Error ? err.message : 'unknown'}`, 'drm')
      return null
    }
  },

  /**
   * PHASE 3: Export community database for backup/sharing
   */
  async exportCommunityDatabase() {
    try {
      const { communityDbService } = await import('./community-db.service')
      await communityDbService.initialize()
      return await communityDbService.exportDatabase()
    } catch (err) {
      logger.warn(`[DRM Service] Could not export community database: ${err instanceof Error ? err.message : 'unknown'}`, 'drm')
      return null
    }
  },

  /**
   * PHASE 3 (Experimental): Attempt API hook removal
   * WARNING: Not production-ready, use as last resort only
   */
  async attemptApiHookRemoval(drmType: string, appId: string) {
    const paths = getGamePaths(appId)
    if (!paths || !paths.exePath) {
      return {
        success: false,
        message: 'Could not locate game executable',
      }
    }

    try {
      const { attemptApiHooking, getWarning } = await import('../modules/drm-plugins/api-hook-remover')
      logger.warn(`[DRM Service] EXPERIMENTAL: Attempting API hook removal for ${drmType}`, 'drm')
      logger.warn(getWarning(), 'drm')

      return await attemptApiHooking(drmType, paths.exePath)
    } catch (err) {
      return {
        success: false,
        message: err instanceof Error ? err.message : 'API hooking not available',
        hooked: [],
        failed: [],
        warnings: ['API hooking module not available'],
      }
    }
  },
}
