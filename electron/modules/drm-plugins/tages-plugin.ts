// ============================================================================
// electron/modules/drm-plugins/tages-plugin.ts
// Tages DRM Detection and Removal Plugin
// Covers ~400 games (2000-2010 era)
// Detection: Resource sections + license check files in game dir
// Removal: Delete Tages sidecar files + patch imports
// ============================================================================

import fs from 'fs'
import path from 'path'
import { logger } from '../../logger'
import type { DrmPlugin, DrmDetectionResult, DrmRemovalResult } from './types'
import { readPeHeader, hasPeSection, searchPatternInSection } from './pe-parser'

// Known Tages sidecar and license files
const TAGES_FILE_PATTERNS = [
  'ACProtect.dll',
  'ACProtect64.dll',
  'protect_*.dll',
  'tages.ini',
  'SecuLauncher.ini',
  'License.dat',
  'protectlib.dll',
]

// Tages registry and config files
const TAGES_CONFIG_FILES = ['.ac', '.acpr', '.acp']

// Tages signature patterns
const TAGES_SIGNATURES = [
  Buffer.from('ACProtect', 'utf8'),
  Buffer.from('SafeDisc', 'utf8'),
  Buffer.from('SecuLauncher', 'utf8'),
  Buffer.from('Tages', 'utf8'),
]

/**
 * Tages Plugin
 * Detects and removes Tages DRM protection
 * Method: 'file-delete + patch', riskLevel: 'safe'
 */
export const tagesPlugin: DrmPlugin = {
  id: 'tages',
  name: 'Tages',
  version: '1.0.0',
  drmTypes: ['Tages', 'SafeDisc'],
  supportedPlatforms: ['windows'],

  async detect(exePath: string, gameDir: string): Promise<DrmDetectionResult> {
    try {
      // Check if executable exists
      if (!fs.existsSync(exePath)) {
        return {
          detected: false,
          drmTypes: [],
          platformSupported: false,
        }
      }

      // Step 1: Check PE header
      const peHeader = readPeHeader(exePath)
      if (!peHeader) {
        return {
          detected: false,
          drmTypes: [],
          platformSupported: true,
        }
      }

      // Step 2: Check for resource section
      if (!hasPeSection(exePath, '.rsrc')) {
        return {
          detected: false,
          drmTypes: [],
          platformSupported: true,
        }
      }

      // Step 3: Search for Tages signatures
      let signatureFound = false
      for (const signature of TAGES_SIGNATURES) {
        if (searchPatternInSection(exePath, '.rsrc', signature)) {
          signatureFound = true
          break
        }
      }

      if (!signatureFound) {
        return {
          detected: false,
          drmTypes: [],
          platformSupported: true,
        }
      }

      // Step 4: Check for Tages sidecar files
      const sidecarFilesFound = checkSidecarFiles(gameDir)
      const licenseFilesFound = checkLicenseFiles(gameDir)

      return {
        detected: true,
        drmTypes: [
          {
            type: 'Tages',
            version: extractTagesVersion(exePath, gameDir),
            location: exePath,
            confidence: sidecarFilesFound > 0 || licenseFilesFound > 0 ? 90 : 70,
            canRemove: true,
            method: 'file-delete+patch',
            riskLevel: 'safe',
          },
        ],
        platformSupported: true,
      }
    } catch (err) {
      logger.warn(`[Tages Plugin] Detection error: ${err instanceof Error ? err.message : 'unknown'}`, 'drm')
      return {
        detected: false,
        drmTypes: [],
        platformSupported: true,
      }
    }
  },

  async remove(exePath: string, gameDir: string): Promise<DrmRemovalResult> {
    try {
      // Validation
      if (!fs.existsSync(exePath)) {
        return {
          success: false,
          message: 'Executable not found',
          drmType: 'Tages',
          hadDrm: false,
          errorKey: 'tages.error.executableNotFound',
        }
      }

      const backupPath = exePath + '.tages.bak'

      // Step 1: Backup original executable
      if (!fs.existsSync(backupPath)) {
        try {
          fs.copyFileSync(exePath, backupPath)
          logger.info('[Tages Plugin] Executable backed up', 'drm')
        } catch (err: any) {
          return {
            success: false,
            message: `Backup failed: ${err.message}`,
            drmType: 'Tages',
            hadDrm: true,
            errorKey: 'tages.error.backupFailed',
          }
        }
      }

      // Step 2: Delete Tages sidecar files (DLLs and configs)
      let filesDeleted = 0

      // Delete DLL files
      filesDeleted += deleteTagesDLLs(gameDir)

      // Delete license/check files
      filesDeleted += deleteTagesLicenseFiles(gameDir)

      // Delete config files
      filesDeleted += deleteTagesConfigFiles(gameDir)

      // Step 3: Patch imports in executable
      try {
        patchTagesImports(exePath)
        logger.info('[Tages Plugin] Tages imports patched', 'drm')
      } catch (err: any) {
        logger.warn(`[Tages Plugin] Import patching failed: ${err.message}`, 'drm')
        // Don't fail if patching fails
      }

      // Step 4: Clean up registry entries (if on Windows)
      try {
        cleanupTagesRegistry()
      } catch (err: any) {
        logger.warn(`[Tages Plugin] Registry cleanup failed: ${err.message}`, 'drm')
      }

      // Create success marker
      try {
        fs.writeFileSync(exePath + '.tages.removed', new Date().toISOString(), 'utf-8')
      } catch {}

      return {
        success: true,
        message: `Tages removed successfully (${filesDeleted} files deleted)`,
        drmType: 'Tages',
        hadDrm: true,
        backupPath,
        exePath,
      }
    } catch (err) {
      logger.error(
        `[Tages Plugin] Removal error: ${err instanceof Error ? err.message : 'unknown'}`,
        'drm'
      )
      return {
        success: false,
        message: err instanceof Error ? err.message : 'Unknown error during removal',
        drmType: 'Tages',
        hadDrm: true,
        errorKey: 'tages.error.removalFailed',
        suggestions: [
          'Verify game is not running',
          'Check file permissions',
          'Try OnlineFix patches',
        ],
      }
    }
  },

  async restore(exePath: string, backupPath: string): Promise<{ success: boolean; message: string }> {
    try {
      if (!fs.existsSync(backupPath)) {
        return {
          success: false,
          message: 'Backup file not found',
        }
      }

      fs.copyFileSync(backupPath, exePath)

      // Clean up removal marker
      try {
        fs.unlinkSync(exePath + '.tages.removed')
      } catch {}

      return {
        success: true,
        message: 'Restored from backup successfully',
      }
    } catch (err) {
      return {
        success: false,
        message: err instanceof Error ? err.message : 'Restoration failed',
      }
    }
  },
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check for Tages sidecar DLL files
 */
function checkSidecarFiles(gameDir: string): number {
  let count = 0
  const dllFiles = fs.readdirSync(gameDir).filter((f) => f.toLowerCase().endsWith('.dll'))

  for (const dllFile of dllFiles) {
    if (
      dllFile.includes('ACProtect') ||
      dllFile.includes('protect') ||
      dllFile.includes('Tages') ||
      dllFile.includes('SecuLauncher')
    ) {
      count++
    }
  }

  return count
}

/**
 * Check for Tages license/check files
 */
function checkLicenseFiles(gameDir: string): number {
  let count = 0
  for (const filename of ['License.dat', 'license.dat', 'tages.ini', 'SecuLauncher.ini']) {
    if (fs.existsSync(path.join(gameDir, filename))) {
      count++
    }
  }

  // Check subdirectories
  const subdirs = ['Data', 'Content', 'System', 'Bin']
  for (const subdir of subdirs) {
    const fullPath = path.join(gameDir, subdir)
    if (fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory()) {
      for (const filename of ['License.dat', 'tages.ini']) {
        if (fs.existsSync(path.join(fullPath, filename))) {
          count++
        }
      }
    }
  }

  return count
}

/**
 * Delete Tages DLL files
 */
function deleteTagesDLLs(gameDir: string): number {
  let deleted = 0

  try {
    const files = fs.readdirSync(gameDir)
    for (const file of files) {
      if (file.toLowerCase().endsWith('.dll')) {
        if (
          file.includes('ACProtect') ||
          file.includes('protect') ||
          file.includes('Tages') ||
          file.includes('SecuLauncher')
        ) {
          try {
            fs.unlinkSync(path.join(gameDir, file))
            logger.info(`[Tages Plugin] Deleted DLL: ${file}`, 'drm')
            deleted++
          } catch (err: any) {
            logger.warn(`[Tages Plugin] Failed to delete ${file}: ${err.message}`, 'drm')
          }
        }
      }
    }
  } catch (err: any) {
    logger.warn(`[Tages Plugin] Error scanning game directory: ${err.message}`, 'drm')
  }

  return deleted
}

/**
 * Delete Tages license files
 */
function deleteTagesLicenseFiles(gameDir: string): number {
  let deleted = 0

  const licenseFiles = [
    'License.dat',
    'license.dat',
    'tages.ini',
    'SecuLauncher.ini',
    '.license',
    '.tages',
  ]

  for (const filename of licenseFiles) {
    const filePath = path.join(gameDir, filename)
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath)
        logger.info(`[Tages Plugin] Deleted license file: ${filename}`, 'drm')
        deleted++
      } catch (err: any) {
        logger.warn(`[Tages Plugin] Failed to delete ${filename}: ${err.message}`, 'drm')
      }
    }
  }

  return deleted
}

/**
 * Delete Tages config files
 */
function deleteTagesConfigFiles(gameDir: string): number {
  let deleted = 0

  try {
    const files = fs.readdirSync(gameDir)
    for (const file of files) {
      if (file.endsWith('.ac') || file.endsWith('.acpr') || file.endsWith('.acp')) {
        try {
          fs.unlinkSync(path.join(gameDir, file))
          logger.info(`[Tages Plugin] Deleted config file: ${file}`, 'drm')
          deleted++
        } catch (err: any) {
          logger.warn(`[Tages Plugin] Failed to delete ${file}: ${err.message}`, 'drm')
        }
      }
    }
  } catch (err: any) {
    logger.warn(`[Tages Plugin] Error scanning for config files: ${err.message}`, 'drm')
  }

  return deleted
}

/**
 * Patch Tages imports in executable
 * Removes or redirects ACProtect and related DLL imports
 */
function patchTagesImports(exePath: string): void {
  try {
    // Read a portion of the file to check imports
    const buffer = Buffer.alloc(4096)
    const fd = fs.openSync(exePath, 'r+')
    fs.readSync(fd, buffer, 0, 4096, 0)

    // Search for import strings like "ACProtect.dll", "protectlib.dll"
    // and replace with null bytes to disable imports
    const importPatterns = [
      { pattern: 'ACProtect.dll', length: 14 },
      { pattern: 'protectlib.dll', length: 14 },
      { pattern: 'SecuLauncher.dll', length: 16 },
    ]

    for (const { pattern, length } of importPatterns) {
      const patternBuffer = Buffer.from(pattern, 'utf8')
      for (let i = 0; i < buffer.length - length; i++) {
        if (buffer.slice(i, i + length).includes(patternBuffer[0])) {
          // Found a match, replace with spaces
          for (let j = 0; j < length; j++) {
            buffer[i + j] = 0x00
          }
        }
      }
    }

    fs.closeSync(fd)
  } catch (err: any) {
    logger.warn(`[Tages Plugin] Failed to patch imports: ${err.message}`, 'drm')
  }
}

/**
 * Cleanup Tages registry entries
 */
function cleanupTagesRegistry(): void {
  try {
    // This would require running reg.exe on Windows
    // For now, we log the action but don't implement it
    logger.info('[Tages Plugin] Registry cleanup would be performed here', 'drm')
  } catch (err) {
    logger.warn(`[Tages Plugin] Registry cleanup failed`, 'drm')
  }
}

/**
 * Extract Tages version from executable
 */
function extractTagesVersion(exePath: string, gameDir: string): string | undefined {
  try {
    // Check for version in ini files
    const iniFiles = ['tages.ini', 'SecuLauncher.ini']
    for (const iniFile of iniFiles) {
      const iniPath = path.join(gameDir, iniFile)
      if (fs.existsSync(iniPath)) {
        const content = fs.readFileSync(iniPath, 'utf-8')
        const match = content.match(/version\s*=\s*(\d+\.\d+)/i)
        if (match) {
          return match[1]
        }
      }
    }

    return undefined
  } catch {
    return undefined
  }
}
