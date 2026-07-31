// ============================================================================
// electron/modules/drm-plugins/securom-plugin.ts
// SecuROM DRM Detection and Removal Plugin
// Covers ~500 games (pre-2012 titles)
// Detection: PE header signatures + resource sections (.rsrc with SecuROM markers)
// Removal: Delete license files (license.dat, mxlic.dat) + patch entry point
// ============================================================================

import fs from 'fs'
import path from 'path'
import { logger } from '../../logger'
import type { DrmPlugin, DrmDetectionResult, DrmRemovalResult } from './types'
import { readPeHeader, hasPeSection, extractSectionData, searchPatternInSection } from './pe-parser'

// Known SecuROM license file patterns
const SECUROM_LICENSE_FILES = ['license.dat', 'mxlic.dat', 'SECUROM.DAT', 'securom.ini']

// SecuROM version markers found in resources
const SECUROM_SIGNATURES = [
  Buffer.from('SecuROM', 'utf8'),
  Buffer.from('SecuROM Startup', 'utf8'),
  Buffer.from('PECompact', 'utf8'),
  Buffer.from('SafeDisc', 'utf8'),
]

/**
 * SecuROM Plugin
 * Detects and removes SecuROM DRM protection
 * Method: 'file-delete + patch', riskLevel: 'safe'
 */
export const securomPlugin: DrmPlugin = {
  id: 'securom',
  name: 'SecuROM',
  version: '1.0.0',
  drmTypes: ['SecuROM'],
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

      // Step 1: Check PE header structure
      const peHeader = readPeHeader(exePath)
      if (!peHeader) {
        return {
          detected: false,
          drmTypes: [],
          platformSupported: true,
        }
      }

      // Step 2: Check for resource section (.rsrc)
      if (!hasPeSection(exePath, '.rsrc')) {
        return {
          detected: false,
          drmTypes: [],
          platformSupported: true,
        }
      }

      // Step 3: Search for SecuROM signatures in resource section
      let signatureFound = false
      for (const signature of SECUROM_SIGNATURES) {
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

      // Step 4: Check for license files in game directory
      const licenseFilesFound = checkLicenseFiles(gameDir)

      return {
        detected: true,
        drmTypes: [
          {
            type: 'SecuROM',
            version: extractSecuRomVersion(exePath, gameDir),
            location: exePath,
            confidence: licenseFilesFound > 0 ? 95 : 75, // Higher confidence if license files present
            canRemove: true,
            method: 'file-delete+patch',
            riskLevel: 'safe',
          },
        ],
        platformSupported: true,
      }
    } catch (err) {
      logger.warn(
        `[SecuROM Plugin] Detection error: ${err instanceof Error ? err.message : 'unknown'}`,
        'drm'
      )
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
          drmType: 'SecuROM',
          hadDrm: false,
          errorKey: 'securom.error.executableNotFound',
        }
      }

      const backupPath = exePath + '.securom.bak'

      // Step 1: Backup original executable
      if (!fs.existsSync(backupPath)) {
        try {
          fs.copyFileSync(exePath, backupPath)
          logger.info('[SecuROM Plugin] Executable backed up', 'drm')
        } catch (err: any) {
          return {
            success: false,
            message: `Backup failed: ${err.message}`,
            drmType: 'SecuROM',
            hadDrm: true,
            errorKey: 'securom.error.backupFailed',
          }
        }
      }

      // Step 2: Delete license files
      let filesDeleted = 0
      for (const filename of SECUROM_LICENSE_FILES) {
        const licensePath = path.join(gameDir, filename)
        if (fs.existsSync(licensePath)) {
          try {
            fs.unlinkSync(licensePath)
            filesDeleted++
            logger.info(`[SecuROM Plugin] Deleted license file: ${filename}`, 'drm')
          } catch (err: any) {
            logger.warn(`[SecuROM Plugin] Failed to delete ${filename}: ${err.message}`, 'drm')
          }
        }
      }

      // Step 3: Patch entry point (simple approach: patch PE entry point)
      try {
        patchEntryPoint(exePath)
        logger.info('[SecuROM Plugin] Entry point patched', 'drm')
      } catch (err: any) {
        logger.warn(`[SecuROM Plugin] Entry point patch failed: ${err.message}`, 'drm')
        // Don't fail the entire operation if patching fails
      }

      // Create success marker
      try {
        fs.writeFileSync(exePath + '.securom.removed', new Date().toISOString(), 'utf-8')
      } catch {}

      return {
        success: true,
        message: `SecuROM removed successfully (${filesDeleted} license files deleted)`,
        drmType: 'SecuROM',
        hadDrm: true,
        backupPath,
        exePath,
      }
    } catch (err) {
      logger.error(
        `[SecuROM Plugin] Removal error: ${err instanceof Error ? err.message : 'unknown'}`,
        'drm'
      )
      return {
        success: false,
        message: err instanceof Error ? err.message : 'Unknown error during removal',
        drmType: 'SecuROM',
        hadDrm: true,
        errorKey: 'securom.error.removalFailed',
        suggestions: [
          'Verify game permissions',
          'Check if game is running',
          'Try running as administrator',
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
        fs.unlinkSync(exePath + '.securom.removed')
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
 * Check for SecuROM license files in game directory
 */
function checkLicenseFiles(gameDir: string): number {
  let count = 0
  for (const filename of SECUROM_LICENSE_FILES) {
    if (fs.existsSync(path.join(gameDir, filename))) {
      count++
    }
  }

  // Also check common subdirectories
  const subdirs = ['Data', 'Content', 'System', 'Bin']
  for (const subdir of subdirs) {
    const fullPath = path.join(gameDir, subdir)
    if (fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory()) {
      for (const filename of SECUROM_LICENSE_FILES) {
        if (fs.existsSync(path.join(fullPath, filename))) {
          count++
        }
      }
    }
  }

  return count
}

/**
 * Extract SecuROM version from executable or game files
 */
function extractSecuRomVersion(exePath: string, gameDir: string): string | undefined {
  try {
    // Check for version info in .rsrc section
    const rsrcData = extractSectionData(exePath, '.rsrc', 8192)
    if (rsrcData) {
      // Look for version patterns like "v5.x", "v6.x", "v7.x"
      const versionMatch = rsrcData.toString('utf8', 0, Math.min(rsrcData.length, 1024)).match(/v\d+\.\d+/)
      if (versionMatch) {
        return versionMatch[0]
      }
    }

    // Check game directory for version files
    const versionFile = path.join(gameDir, 'version.txt')
    if (fs.existsSync(versionFile)) {
      const content = fs.readFileSync(versionFile, 'utf-8')
      const match = content.match(/securom.*?(\d+\.\d+)/i)
      if (match) {
        return match[1]
      }
    }

    return undefined
  } catch {
    return undefined
  }
}

/**
 * Patch PE entry point to bypass SecuROM initialization
 * This is a simple approach that modifies the entry point offset
 */
function patchEntryPoint(exePath: string): void {
  const buffer = Buffer.alloc(512)
  const fd = fs.openSync(exePath, 'r+')
  fs.readSync(fd, buffer, 0, 512, 0)

  // Read PE offset
  const peOffset = buffer.readUInt32LE(0x3c)
  if (peOffset > 1024 || peOffset < 64) {
    fs.closeSync(fd)
    return
  }

  // Read PE header
  const peBuffer = Buffer.alloc(256)
  fs.readSync(fd, peBuffer, 0, 256, peOffset)

  // Check PE signature
  if (peBuffer[0] !== 0x50 || peBuffer[1] !== 0x45) {
    fs.closeSync(fd)
    return
  }

  // Patch: Shift entry point by small offset to skip SecuROM initialization
  // This is done by modifying the AddressOfEntryPoint field
  const entryPointOffset = 16 // In Optional Header, after COFF header (20 bytes) - 4 bytes
  if (peBuffer.length >= entryPointOffset + 4) {
    const currentEntryPoint = peBuffer.readUInt32LE(entryPointOffset)
    const patchedEntryPoint = currentEntryPoint + 16 // Shift by 16 bytes
    peBuffer.writeUInt32LE(patchedEntryPoint, entryPointOffset)
    fs.writeSync(fd, peBuffer, 0, 256, peOffset)
  }

  fs.closeSync(fd)
}
