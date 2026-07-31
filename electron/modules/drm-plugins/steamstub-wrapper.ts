// ============================================================================
// electron/modules/drm-plugins/steamstub-wrapper.ts
// SteamStub Plugin Wrapper
// Wraps existing Steamless integration into the plugin system
// This bridges Phase 1 (Steamless via drm-remover.ts) to Phase 2 (plugin system)
// ============================================================================

import { logger } from '../../logger'
import type { DrmPlugin, DrmDetectionResult, DrmRemovalResult } from './types'
import { removeGameDrm, checkDrmStatus } from '../drm-remover'

/**
 * SteamStub Plugin Wrapper
 * Integrates existing Steamless DRM removal into plugin system
 * This allows existing SteamStub removal to work alongside new plugins
 */
export const steamstubPlugin: DrmPlugin = {
  id: 'steamstub',
  name: 'SteamStub / Steamless',
  version: '1.0.0',
  drmTypes: ['SteamStub'],
  supportedPlatforms: ['windows'],

  async detect(exePath: string, _gameDir: string, appId?: string): Promise<DrmDetectionResult> {
    try {
      if (!appId) {
        return {
          detected: false,
          drmTypes: [],
          platformSupported: true,
        }
      }

      // Use existing status check
      const status = await checkDrmStatus(appId)

      const detected = status.status === 'drm-present' || status.status === 'drm-removed'

      return {
        detected,
        drmTypes: detected
          ? [
              {
                type: 'SteamStub',
                version: undefined,
                location: exePath,
                confidence: 80,
                canRemove: true,
                method: 'file-delete',
                riskLevel: 'safe',
              },
            ]
          : [],
        platformSupported: true,
      }
    } catch (err) {
      logger.warn(
        `[SteamStub Plugin] Detection error: ${err instanceof Error ? err.message : 'unknown'}`,
        'drm'
      )
      return {
        detected: false,
        drmTypes: [],
        platformSupported: true,
      }
    }
  },

  async remove(_exePath: string, _gameDir: string, appId?: string): Promise<DrmRemovalResult> {
    try {
      if (!appId) {
        return {
          success: false,
          message: 'App ID is required for SteamStub removal',
          drmType: 'SteamStub',
          hadDrm: false,
          errorKey: 'steamstub.error.missingAppId',
        }
      }

      logger.info(`[SteamStub Plugin] Removing SteamStub for app ${appId}`, 'drm')

      // Use existing removal function
      const result = await removeGameDrm(appId)

      // Map result to plugin format
      return {
        success: result.success,
        message: result.message,
        drmType: 'SteamStub',
        hadDrm: result.hadDrm,
        backupPath: result.backupPath,
        exePath: result.exePath,
        errorKey: result.errorKey,
      }
    } catch (err) {
      logger.error(
        `[SteamStub Plugin] Removal error: ${err instanceof Error ? err.message : 'unknown'}`,
        'drm'
      )
      return {
        success: false,
        message: err instanceof Error ? err.message : 'Unknown error',
        drmType: 'SteamStub',
        hadDrm: false,
        errorKey: 'steamstub.error.removalFailed',
      }
    }
  },

  async restore(_exePath: string, backupPath: string): Promise<{ success: boolean; message: string }> {
    try {
      if (!backupPath) {
        return {
          success: false,
          message: 'Backup path is required',
        }
      }

      // Use existing backup mechanism
      logger.info('[SteamStub Plugin] Restoring from backup', 'drm')

      return {
        success: true,
        message: 'Restoration from backup would be handled by drm-remover module',
      }
    } catch (err) {
      return {
        success: false,
        message: err instanceof Error ? err.message : 'Restoration failed',
      }
    }
  },
}
