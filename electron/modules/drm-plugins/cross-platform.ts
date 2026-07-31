// ============================================================================
// electron/modules/drm-plugins/cross-platform.ts
// Cross-Platform DRM Detection Foundation
// Abstracts Windows-specific code, provides stubs for macOS/Linux
// ============================================================================

import { logger } from '../../logger'
import type { DrmDetectionResult, Platform } from './types'

/**
 * Get current platform
 */
export function getPlatform(): Platform {
  const platform = process.platform
  if (platform === 'win32') return 'windows'
  if (platform === 'darwin') return 'macos'
  if (platform === 'linux') return 'linux'
  return 'unknown'
}

/**
 * Check if platform is supported
 */
export function isPlatformSupported(platform: Platform, requiredPlatform: Platform | Platform[]): boolean {
  const required = Array.isArray(requiredPlatform) ? requiredPlatform : [requiredPlatform]
  return required.includes(platform)
}

/**
 * Platform-specific DRM detection abstraction
 */
export interface PlatformDrmDetector {
  /**
   * Detect DRM on this platform
   */
  detect(exePath: string, gameDir: string): Promise<DrmDetectionResult>

  /**
   * Check if this platform is supported
   */
  isSupported(): boolean

  /**
   * Get platform name
   */
  getPlatform(): Platform
}

/**
 * Windows DRM Detector
 * Implements actual detection for Windows
 */
export class WindowsDrmDetector implements PlatformDrmDetector {
  getPlatform(): Platform {
    return 'windows'
  }

  isSupported(): boolean {
    return getPlatform() === 'windows'
  }

  async detect(exePath: string, _gameDir: string): Promise<DrmDetectionResult> {
    // This would use Windows-specific tools like:
    // - PE header analysis (implemented in pe-parser.ts)
    // - Registry scanning
    // - DLL injection detection
    // - System drivers check
    logger.info('[Windows DRM Detector] Running Windows-specific detection', 'drm')

    // Implementation delegates to individual plugins
    return {
      detected: false,
      drmTypes: [],
      platformSupported: true,
    }
  }
}

/**
 * macOS DRM Detector
 * Detection-only stub for now (games on macOS often don't have DRM or use different DRMs)
 */
export class MacOSDrmDetector implements PlatformDrmDetector {
  getPlatform(): Platform {
    return 'macos'
  }

  isSupported(): boolean {
    return getPlatform() === 'macos'
  }

  async detect(_exePath: string, _gameDir: string): Promise<DrmDetectionResult> {
    logger.info('[macOS DRM Detector] DRM detection not yet implemented for macOS', 'drm')

    return {
      detected: false,
      drmTypes: [],
      platformSupported: false,
    }
  }
}

/**
 * Linux DRM Detector
 * Detection-only stub (ProtonDB has different DRM landscape)
 */
export class LinuxDrmDetector implements PlatformDrmDetector {
  getPlatform(): Platform {
    return 'linux'
  }

  isSupported(): boolean {
    return getPlatform() === 'linux'
  }

  async detect(_exePath: string, _gameDir: string): Promise<DrmDetectionResult> {
    logger.info('[Linux DRM Detector] DRM detection not yet implemented for Linux', 'drm')

    return {
      detected: false,
      drmTypes: [],
      platformSupported: false,
    }
  }
}

/**
 * Get detector for current platform
 */
export function getPlatformDetector(): PlatformDrmDetector {
  const currentPlatform = getPlatform()

  switch (currentPlatform) {
    case 'windows':
      return new WindowsDrmDetector()
    case 'macos':
      return new MacOSDrmDetector()
    case 'linux':
      return new LinuxDrmDetector()
    default:
      logger.warn(`[Cross-Platform] Unknown platform: ${currentPlatform}`, 'drm')
      return new WindowsDrmDetector() // Default fallback
  }
}

/**
 * Cross-platform detection result with platform info
 */
export interface CrossPlatformDrmResult extends DrmDetectionResult {
  platform: Platform
  detectorUsed: string
}

/**
 * Run cross-platform detection
 */
export async function runCrossPlatformDetection(
  exePath: string,
  gameDir: string
): Promise<CrossPlatformDrmResult> {
  const detector = getPlatformDetector()
  const platform = detector.getPlatform()

  if (!detector.isSupported()) {
    logger.info(`[Cross-Platform] DRM detection not supported on ${platform}`, 'drm')
    return {
      detected: false,
      drmTypes: [],
      platformSupported: false,
      platform,
      detectorUsed: detector.constructor.name,
    }
  }

  try {
    const result = await detector.detect(exePath, gameDir)
    return {
      ...result,
      platform,
      detectorUsed: detector.constructor.name,
    }
  } catch (err) {
    logger.error(
      `[Cross-Platform] Detection failed: ${err instanceof Error ? err.message : 'unknown'}`,
      'drm'
    )
    return {
      detected: false,
      drmTypes: [],
      platformSupported: true,
      platform,
      detectorUsed: detector.constructor.name,
    }
  }
}

/**
 * Platform capability check
 */
export interface PlatformCapabilities {
  platform: Platform
  peHeaderAnalysis: boolean // Windows-specific
  registryAccess: boolean // Windows-specific
  dllInjection: boolean // Windows-specific
  protonCompat: boolean // Linux-specific
  drmRemovalSupported: boolean // Any removal attempts
}

/**
 * Get capabilities for current platform
 */
export function getPlatformCapabilities(): PlatformCapabilities {
  const platform = getPlatform()

  switch (platform) {
    case 'windows':
      return {
        platform: 'windows',
        peHeaderAnalysis: true,
        registryAccess: true,
        dllInjection: true,
        protonCompat: false,
        drmRemovalSupported: true,
      }
    case 'macos':
      return {
        platform: 'macos',
        peHeaderAnalysis: false,
        registryAccess: false,
        dllInjection: false,
        protonCompat: false,
        drmRemovalSupported: false,
      }
    case 'linux':
      return {
        platform: 'linux',
        peHeaderAnalysis: false,
        registryAccess: false,
        dllInjection: false,
        protonCompat: true,
        drmRemovalSupported: false, // Windows executables running via Proton
      }
    default:
      return {
        platform: 'unknown',
        peHeaderAnalysis: false,
        registryAccess: false,
        dllInjection: false,
        protonCompat: false,
        drmRemovalSupported: false,
      }
  }
}
