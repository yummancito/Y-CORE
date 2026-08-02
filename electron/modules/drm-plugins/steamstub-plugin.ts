/**
 * SteamStub DRM Plugin
 * ============================================================================
 * Detects and removes Valve's SteamStub DRM using native C++ module.
 * No external dependencies.
 * ============================================================================
 */

import fs from 'fs'
import { logger } from '../../logger'
import { detectSteamStub, removeSteamStub } from '../native-steamstub-remover'
import type { Platform, DrmPlugin, DrmDetectionResult, DrmRemovalResult, DrmInfo } from './types'

export class SteamStubPlugin implements DrmPlugin {
  readonly id = 'steamstub'
  readonly name = 'SteamStub DRM'
  readonly version = '1.0.0'
  readonly drmTypes: string[] = ['SteamStub']
  readonly supportedPlatforms: Platform[] = ['windows']

  async detect(exePath: string, _gameDir: string, _appId?: string): Promise<DrmDetectionResult> {
    try {
      if (!exePath || !fs.existsSync(exePath)) {
        return {
          detected: false,
          drmTypes: [],
          platformSupported: true,
        }
      }

      // Check for cached markers
      if (fs.existsSync(exePath + '.ycore.drm-removed')) {
        const drm: DrmInfo = {
          type: 'SteamStub',
          confidence: 100,
          canRemove: true,
          riskLevel: 'safe',
          method: 'file-delete',
        }
        return {
          detected: true,
          drmTypes: [drm],
          platformSupported: true,
        }
      }

      if (fs.existsSync(exePath + '.ycore.drm-free')) {
        return {
          detected: false,
          drmTypes: [],
          platformSupported: true,
        }
      }

      // Use native C++ module for detection
      const result = await detectSteamStub(exePath)

      if (result.detected) {
        const drm: DrmInfo = {
          type: 'SteamStub',
          version: result.version || undefined,
          location: exePath,
          confidence: result.confidence,
          canRemove: true,
          riskLevel: 'safe',
          method: 'file-delete',
        }
        return {
          detected: true,
          drmTypes: [drm],
          platformSupported: true,
        }
      } else {
        return {
          detected: false,
          drmTypes: [],
          platformSupported: true,
        }
      }
    } catch (err) {
      logger.error(`[SteamStub] Detection failed: ${err instanceof Error ? err.message : 'unknown error'}`, 'drm')
      return {
        detected: false,
        drmTypes: [],
        platformSupported: true,
      }
    }
  }

  async remove(exePath: string, _gameDir?: string, _appId?: string): Promise<DrmRemovalResult> {
    try {
      if (!exePath || !fs.existsSync(exePath)) {
        return {
          success: false,
          message: 'Executable not found',
          drmType: 'SteamStub',
          hadDrm: false,
        }
      }

      // Check for cached markers
      if (fs.existsSync(exePath + '.ycore.drm-removed')) {
        return {
          success: true,
          message: 'DRM already removed (cached)',
          drmType: 'SteamStub',
          hadDrm: true,
          backupPath: fs.existsSync(exePath + '.bak') ? exePath + '.bak' : undefined,
          exePath,
        }
      }

      if (fs.existsSync(exePath + '.ycore.drm-free')) {
        return {
          success: true,
          message: 'No DRM detected (cached)',
          drmType: 'SteamStub',
          hadDrm: false,
          exePath,
        }
      }

      logger.info(`[SteamStub] Removing DRM from: ${exePath}`, 'drm')

      // Use native C++ module for removal
      const result = await removeSteamStub(exePath)

      if (result.success) {
        try {
          fs.writeFileSync(exePath + '.ycore.drm-removed', new Date().toISOString(), 'utf-8')
        } catch {}

        logger.info(`[SteamStub] Successfully removed DRM from: ${exePath}`, 'drm')
        return {
          success: true,
          message: 'DRM removed successfully using native C++ module',
          drmType: 'SteamStub',
          hadDrm: result.hadDrm,
          backupPath: result.backupPath,
          exePath,
        }
      } else if (!result.hadDrm) {
        try {
          fs.writeFileSync(exePath + '.ycore.drm-free', new Date().toISOString(), 'utf-8')
        } catch {}

        logger.info(`[SteamStub] No DRM found in: ${exePath}`, 'drm')
        return {
          success: true,
          message: 'No SteamStub DRM detected',
          drmType: 'SteamStub',
          hadDrm: false,
          exePath,
        }
      } else {
        logger.error(`[SteamStub] Removal failed: ${result.detailedMessage}`, 'drm')
        return {
          success: false,
          message: `Failed to remove DRM: ${result.detailedMessage}`,
          drmType: 'SteamStub',
          hadDrm: result.hadDrm,
          exePath,
        }
      }
    } catch (err) {
      logger.error(`[SteamStub] Removal operation failed: ${err instanceof Error ? err.message : 'unknown error'}`, 'drm')
      return {
        success: false,
        message: err instanceof Error ? err.message : 'Removal failed',
        drmType: 'SteamStub',
        hadDrm: false,
        exePath,
      }
    }
  }

  async restore?(_exePath: string, _backupPath: string): Promise<{ success: boolean; message: string }> {
    return {
      success: true,
      message: 'Restore not implemented',
    }
  }

  async cleanup?(): Promise<void> {
    logger.info('[SteamStub] Cleanup called', 'drm')
  }
}

export const steamstubPlugin = new SteamStubPlugin()
