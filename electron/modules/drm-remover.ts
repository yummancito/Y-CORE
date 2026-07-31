/**
 * electron/modules/drm-remover.ts
 * ============================================================================
 * LEGACY BRIDGE: Maps old DRM Remover API to new plugin-based system.
 * Uses ONLY native C++ module. NO Steamless.
 * ============================================================================
 */

import path from 'path'
import fs from 'fs'
import { logger } from '../logger'
import { getSteamAppsPath, getSteamLibraryFolders, parseVdf } from './steam-helpers'
import { drmPluginRegistry } from './drm-plugins/registry'

export interface DrmRemoveResult {
  success: boolean
  message: string
  errorKey?: string
  hadDrm: boolean
  backupPath?: string
  exePath?: string
}

export interface DrmStatusResult {
  status: 'no-drm' | 'drm-removed' | 'drm-present' | 'not-found'
  exePath?: string
  backupPath?: string
  message: string
}

/**
 * Find game executable in install directory
 */
export function findGameExecutable(installDir: string): string | null {
  const folders = getSteamLibraryFolders()
  const priorityPatterns = [
    /-Win64-Shipping\.exe$/i,
    /-Win32-Shipping\.exe$/i,
    /Binaries[\\/]+Win64[\\/]+.*\.exe$/i,
    /Binaries[\\/]+Win32[\\/]+.*\.exe$/i,
  ]

  let bestMatch: string | null = null
  let bestPriority = -1

  const scanDir = (dir: string, depth: number) => {
    if (depth > 4) return
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        scanDir(fullPath, depth + 1)
      } else if (entry.name.toLowerCase().endsWith('.exe')) {
        let priority = 0
        for (let i = 0; i < priorityPatterns.length; i++) {
          if (priorityPatterns[i].test(fullPath)) {
            priority = priorityPatterns.length - i
            break
          }
        }

        if (priority > bestPriority) {
          bestPriority = priority
          bestMatch = fullPath
        }
      }
    }
  }

  for (const folder of folders) {
    const gameFolder = path.join(folder, 'common', installDir)
    if (!fs.existsSync(gameFolder)) continue
    scanDir(gameFolder, 0)
  }

  return bestMatch
}

/**
 * Legacy function: Get game paths from Steam manifest
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

    // Try to find main executable
    let exePath: string | null = null
    try {
      const entries = fs.readdirSync(gameDir, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.isFile() && entry.name.toLowerCase().endsWith('.exe')) {
          exePath = path.join(gameDir, entry.name)
          break
        }
      }
    } catch {}

    return { exePath, gameDir }
  } catch (err) {
    logger.warn(`[DRM Remover] Failed to get game paths for ${appId}`, 'drm')
    return null
  }
}

/**
 * Remove DRM from a game using plugin registry (NATIVE C++ ONLY)
 */
export async function removeGameDrm(appId: string): Promise<DrmRemoveResult> {
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
    // Use ONLY plugin-based removal (native C++ module)
    const result = await drmPluginRegistry.removeWithBestPlugin(paths.exePath, paths.gameDir, appId)
    return {
      success: result.success,
      message: result.message,
      hadDrm: result.hadDrm,
      exePath: result.exePath,
      backupPath: result.backupPath,
      errorKey: result.errorKey,
    }
  } catch (err) {
    logger.error(`[DRM Remover] Removal failed: ${err instanceof Error ? err.message : 'unknown'}`, 'drm')
    return {
      success: false,
      message: err instanceof Error ? err.message : 'Removal failed',
      hadDrm: false,
      errorKey: 'drm.error.removalFailed',
    }
  }
}

/**
 * Check DRM status using plugin registry
 */
export async function checkDrmStatus(appId: string): Promise<DrmStatusResult> {
  const paths = getGamePaths(appId)
  if (!paths || !paths.exePath) {
    return {
      status: 'not-found',
      message: 'Could not locate game executable',
    }
  }

  try {
    const detection = await drmPluginRegistry.detectAllDrms(paths.exePath, paths.gameDir, appId)

    if (!detection.detected) {
      return {
        status: 'no-drm',
        exePath: paths.exePath,
        message: 'No DRM detected',
      }
    }

    // Check if we have cached marker
    if (fs.existsSync(paths.exePath + '.ycore.drm-removed')) {
      return {
        status: 'drm-removed',
        exePath: paths.exePath,
        backupPath: fs.existsSync(paths.exePath + '.bak') ? paths.exePath + '.bak' : undefined,
        message: 'DRM previously removed',
      }
    }

    return {
      status: 'drm-present',
      exePath: paths.exePath,
      message: `Detected: ${detection.drmTypes.map((d) => d.type).join(', ')}`,
    }
  } catch (err) {
    logger.error(`[DRM Remover] Status check failed: ${err instanceof Error ? err.message : 'unknown'}`, 'drm')
    return {
      status: 'not-found',
      message: err instanceof Error ? err.message : 'Status check failed',
    }
  }
}

/**
 * Initialize DRM removal handlers (empty - handlers are in drm-plugins-handler.ts)
 */
export async function registerDrmHandlers(): Promise<void> {
  logger.info('[DRM Remover] Handlers initialized (using plugin registry)', 'drm')
}
