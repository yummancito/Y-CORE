// ============================================================================
// electron/modules/drm-plugins/registry.ts
// DRM Plugin Registry and Manager
// Coordinates detection and removal across all DRM plugins
// ============================================================================

import { logger } from '../../logger'
import type { DrmPlugin, DrmDetectionResult, DrmRemovalResult, DrmInfo } from './types'
import { securomPlugin } from './securom-plugin'
import { tagesPlugin } from './tages-plugin'
import { denuvoPlugin } from './denuvo-plugin'
import { steamstubPlugin } from './steamstub-plugin'

/**
 * DRM Plugin Registry
 * Manages all available DRM detection and removal plugins
 */
class DrmPluginRegistry {
  private plugins: Map<string, DrmPlugin> = new Map()

  constructor() {
    // Register built-in plugins
    this.register(steamstubPlugin)
    this.register(securomPlugin)
    this.register(tagesPlugin)
    this.register(denuvoPlugin)

    logger.info(`[DRM Registry] Registered ${this.plugins.size} DRM plugins`, 'drm')
  }

  /**
   * Register a DRM plugin
   */
  register(plugin: DrmPlugin): void {
    if (this.plugins.has(plugin.id)) {
      logger.warn(`[DRM Registry] Plugin ${plugin.id} is already registered`, 'drm')
      return
    }

    this.plugins.set(plugin.id, plugin)
    logger.info(`[DRM Registry] Registered plugin: ${plugin.name} v${plugin.version}`, 'drm')
  }

  /**
   * Get plugin by ID
   */
  getPlugin(pluginId: string): DrmPlugin | undefined {
    return this.plugins.get(pluginId)
  }

  /**
   * Get all registered plugins
   */
  getAllPlugins(): DrmPlugin[] {
    return Array.from(this.plugins.values())
  }

  /**
   * Get plugins for a specific DRM type
   */
  getPluginsForDrm(drmType: string): DrmPlugin[] {
    return Array.from(this.plugins.values()).filter((p) => p.drmTypes.includes(drmType))
  }

  /**
   * Run detection on all plugins
   * Returns combined detection results
   */
  async detectAllDrms(exePath: string, gameDir: string, appId?: string): Promise<DrmDetectionResult> {
    const allDetections: DrmInfo[] = []
    let anySupported = false

    for (const plugin of this.plugins.values()) {
      try {
        const result = await plugin.detect(exePath, gameDir, appId)

        if (result.platformSupported) {
          anySupported = true
        }

        if (result.detected) {
          allDetections.push(...result.drmTypes)
        }
      } catch (err) {
        logger.warn(
          `[DRM Registry] Plugin ${plugin.id} detection error: ${err instanceof Error ? err.message : 'unknown'}`,
          'drm'
        )
      }
    }

    return {
      detected: allDetections.length > 0,
      drmTypes: allDetections,
      platformSupported: anySupported,
    }
  }

  /**
   * Detect using a specific plugin
   */
  async detectWithPlugin(
    pluginId: string,
    exePath: string,
    gameDir: string,
    appId?: string
  ): Promise<DrmDetectionResult> {
    const plugin = this.getPlugin(pluginId)
    if (!plugin) {
      return {
        detected: false,
        drmTypes: [],
        platformSupported: false,
      }
    }

    try {
      return await plugin.detect(exePath, gameDir, appId)
    } catch (err) {
      logger.error(
        `[DRM Registry] Plugin ${pluginId} detection failed: ${err instanceof Error ? err.message : 'unknown'}`,
        'drm'
      )
      return {
        detected: false,
        drmTypes: [],
        platformSupported: false,
      }
    }
  }

  /**
   * Remove DRM using a specific plugin
   */
  async removeWithPlugin(
    pluginId: string,
    exePath: string,
    gameDir: string,
    appId?: string
  ): Promise<DrmRemovalResult> {
    const plugin = this.getPlugin(pluginId)
    if (!plugin) {
      return {
        success: false,
        message: `Plugin ${pluginId} not found`,
        drmType: 'Unknown',
        hadDrm: false,
        errorKey: 'drm.error.pluginNotFound',
      }
    }

    try {
      return await plugin.remove(exePath, gameDir, appId)
    } catch (err) {
      logger.error(
        `[DRM Registry] Plugin ${pluginId} removal failed: ${err instanceof Error ? err.message : 'unknown'}`,
        'drm'
      )
      return {
        success: false,
        message: err instanceof Error ? err.message : 'Unknown error',
        drmType: plugin.drmTypes[0] || 'Unknown',
        hadDrm: false,
        errorKey: 'drm.error.removalFailed',
      }
    }
  }

  /**
   * Attempt removal with best matching plugin
   * Tries plugins in order of confidence
   */
  async removeWithBestPlugin(
    exePath: string,
    gameDir: string,
    appId?: string
  ): Promise<DrmRemovalResult> {
    // First detect all DRMs
    const detection = await this.detectAllDrms(exePath, gameDir, appId)

    if (!detection.detected) {
      return {
        success: true,
        message: 'No DRM detected',
        drmType: 'None',
        hadDrm: false,
      }
    }

    // Sort by confidence and removability
    const removableDrms = detection.drmTypes
      .filter((drm) => drm.canRemove)
      .sort((a, b) => b.confidence - a.confidence)

    if (removableDrms.length === 0) {
      return {
        success: false,
        message: `Detected DRM types cannot be removed: ${detection.drmTypes.map((d) => d.type).join(', ')}`,
        drmType: detection.drmTypes[0]?.type || 'Unknown',
        hadDrm: true,
        suggestions: detection.drmTypes[0]?.type === 'Denuvo' ? [
          'Try GOG version (often DRM-free)',
          'Look for OnlineFix patches',
        ] : undefined,
      }
    }

    // Try each removable DRM with its best plugin
    for (const drm of removableDrms) {
      const plugins = this.getPluginsForDrm(drm.type)
      for (const plugin of plugins) {
        try {
          const result = await plugin.remove(exePath, gameDir, appId)
          return result
        } catch (err) {
          logger.warn(
            `[DRM Registry] Plugin ${plugin.id} removal attempt failed: ${err instanceof Error ? err.message : 'unknown'}`,
            'drm'
          )
          continue
        }
      }
    }

    return {
      success: false,
      message: 'All removal attempts failed',
      drmType: removableDrms[0]?.type || 'Unknown',
      hadDrm: true,
      errorKey: 'drm.error.removalFailed',
    }
  }

  /**
   * Restore from backup using plugin
   */
  async restoreWithPlugin(
    pluginId: string,
    exePath: string,
    backupPath: string
  ): Promise<{ success: boolean; message: string }> {
    const plugin = this.getPlugin(pluginId)
    if (!plugin || !plugin.restore) {
      return {
        success: false,
        message: `Plugin ${pluginId} does not support restoration`,
      }
    }

    try {
      return await plugin.restore(exePath, backupPath)
    } catch (err) {
      return {
        success: false,
        message: err instanceof Error ? err.message : 'Restoration failed',
      }
    }
  }

  /**
   * Cleanup all plugins (called on app exit)
   */
  async cleanup(): Promise<void> {
    for (const plugin of this.plugins.values()) {
      if (plugin.cleanup) {
        try {
          await plugin.cleanup()
        } catch (err) {
          logger.warn(
            `[DRM Registry] Cleanup failed for ${plugin.id}: ${err instanceof Error ? err.message : 'unknown'}`,
            'drm'
          )
        }
      }
    }
  }

  /**
   * Get plugin statistics
   */
  getStats(): {
    totalPlugins: number
    drmTypesSupported: string[]
    platformsSupported: Set<string>
  } {
    const drmTypes = new Set<string>()
    const platforms = new Set<string>()

    for (const plugin of this.plugins.values()) {
      plugin.drmTypes.forEach((t) => drmTypes.add(t))
      plugin.supportedPlatforms.forEach((p) => platforms.add(p))
    }

    return {
      totalPlugins: this.plugins.size,
      drmTypesSupported: Array.from(drmTypes),
      platformsSupported: platforms,
    }
  }
}

// Export singleton instance
export const drmPluginRegistry = new DrmPluginRegistry()
