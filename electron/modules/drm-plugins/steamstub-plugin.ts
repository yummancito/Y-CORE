/**
 * SteamStub DRM Plugin
 * ============================================================================
 * Detects and removes Valve's SteamStub DRM using native C++ module.
 * No external dependencies.
 * ============================================================================
 */

import fs from 'fs'
import { BaseDrmPlugin, DrmDetectionResult, DrmRemovalResult, RemovalOptions, PluginStatus } from './drm-plugin-base'
import { logger } from '../../logger'
import { detectSteamStub, removeSteamStub } from '../native-steamstub-remover'

export class SteamStubPlugin extends BaseDrmPlugin {
  readonly id = 'steamstub'
  readonly name = 'SteamStub DRM'
  readonly version = '1.0.0'
  readonly riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low'
  readonly drmTypes = ['SteamStub']
  readonly supportedPlatforms = ['windows']

  async isReady(): Promise<boolean> {
    return true
  }

  async getStatus(): Promise<PluginStatus> {
    return {
      ready: true,
      message: 'SteamStub plugin ready (native C++ module)',
      issues: [],
      missingDependencies: [],
    }
  }

  async detect(exePath: string): Promise<DrmDetectionResult> {
    try {
      await this.validateExecutablePath(exePath)

      // Check for cached markers
      if (fs.existsSync(exePath + '.ycore.drm-removed')) {
        return {
          type: 'steamstub',
          confidence: 100,
          description: 'Executable previously unpacked by YCore',
          detectedPath: exePath,
          riskLevel: 'low',
          metadata: { previouslyRemoved: true },
        }
      }

      if (fs.existsSync(exePath + '.ycore.drm-free')) {
        return {
          type: 'none',
          confidence: 100,
          description: 'Previously verified as DRM-free',
          detectedPath: exePath,
          riskLevel: 'low',
          metadata: { verified: true },
        }
      }

      // Use native C++ module for detection
      const result = await detectSteamStub(exePath)

      if (result.detected) {
        return {
          type: 'steamstub',
          confidence: result.confidence,
          description: `SteamStub v${result.version || 'unknown'} detected`,
          detectedPath: exePath,
          riskLevel: 'low',
          metadata: {
            version: result.version,
            stubType: result.stubType,
          },
        }
      } else {
        return {
          type: 'none',
          confidence: 0,
          description: 'SteamStub DRM not detected',
          detectedPath: exePath,
          riskLevel: 'low',
        }
      }
    } catch (err) {
      logger.error(`[SteamStub] Detection failed: ${err instanceof Error ? err.message : 'unknown error'}`, 'drm')
      return {
        type: 'error',
        confidence: 0,
        description: `Detection error: ${err instanceof Error ? err.message : 'unknown error'}`,
        riskLevel: 'critical',
      }
    }
  }

  async remove(exePath: string, _options?: RemovalOptions): Promise<DrmRemovalResult> {
    try {
      await this.validateExecutablePath(exePath)

      // Check for cached markers
      if (fs.existsSync(exePath + '.ycore.drm-removed')) {
        return {
          success: true,
          message: 'DRM already removed (cached)',
          hadDrm: true,
          exePath,
          backupPath: fs.existsSync(exePath + '.bak') ? exePath + '.bak' : undefined,
        }
      }

      if (fs.existsSync(exePath + '.ycore.drm-free')) {
        return {
          success: true,
          message: 'No DRM detected (cached)',
          hadDrm: false,
          exePath,
        }
      }

      logger.info(`[SteamStub] Removing DRM from: ${exePath}`, 'drm')

      // Use native C++ module for removal
      const result = await removeSteamStub(exePath)

      if (result.success) {
        // Create success marker
        try {
          fs.writeFileSync(exePath + '.ycore.drm-removed', new Date().toISOString(), 'utf-8')
        } catch {}

        logger.info(`[SteamStub] Successfully removed DRM from: ${exePath}`, 'drm')
        return {
          success: true,
          message: 'DRM removed successfully using native C++ module',
          hadDrm: result.hadDrm,
          exePath,
          backupPath: result.backupPath,
        }
      } else if (!result.hadDrm) {
        // No DRM found
        try {
          fs.writeFileSync(exePath + '.ycore.drm-free', new Date().toISOString(), 'utf-8')
        } catch {}

        logger.info(`[SteamStub] No DRM found in: ${exePath}`, 'drm')
        return {
          success: true,
          message: 'No SteamStub DRM detected — nothing to remove',
          hadDrm: false,
          exePath,
        }
      } else {
        // Removal failed
        logger.error(`[SteamStub] Removal failed: ${result.detailedMessage}`, 'drm')
        return {
          success: false,
          message: `Failed to remove DRM: ${result.detailedMessage}`,
          hadDrm: result.hadDrm,
          exePath,
          error: {
            code: 'REMOVAL_FAILED',
            details: result.detailedMessage || 'Native C++ module failed',
            recoverable: true,
          },
        }
      }
    } catch (err) {
      logger.error(`[SteamStub] Removal operation failed: ${err instanceof Error ? err.message : 'unknown error'}`, 'drm')
      return {
        success: false,
        message: `Removal operation failed: ${err instanceof Error ? err.message : 'unknown error'}`,
        hadDrm: false,
        exePath,
        error: {
          code: 'REMOVAL_ERROR',
          details: err instanceof Error ? err.message : 'unknown error',
          recoverable: false,
        },
      }
    }
  }

  async restore(_exePath: string): Promise<boolean> {
    logger.info('[SteamStub] Restore called but not implemented (native module handles backups)', 'drm')
    return true
  }
}

export const steamstubPlugin = new SteamStubPlugin()
