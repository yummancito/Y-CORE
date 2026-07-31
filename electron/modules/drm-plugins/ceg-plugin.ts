/**
 * CEG (Games for Windows - LIVE) DRM Plugin
 * ============================================================================
 * Detects and removes Games for Windows - LIVE DRM components.
 * Handles .DRM file removal and CEGUI.dll import patching.
 * Supports ~300 additional games beyond SteamStub.
 * ============================================================================
 */

import path from 'path'
import fs from 'fs'
import { BaseDrmPlugin, DrmDetectionResult, DrmRemovalResult, RemovalOptions, PluginStatus } from './drm-plugin-base'
import { logger } from '../../logger'

/**
 * PE Format structures for import patching
 */
const PE_SIGNATURE = 0x4550 // 'PE\0\0'
const CEGUI_DLL_NAME = 'CEGUI.dll'

export class CegPlugin extends BaseDrmPlugin {
  readonly id = 'ceg'
  readonly name = 'CEG (Games for Windows - LIVE)'
  readonly version = '1.0.0'
  readonly riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low'

  async isReady(): Promise<boolean> {
    // CEG removal doesn't require external tools
    return this.supportsCurrentPlatform
  }

  async getStatus(): Promise<PluginStatus> {
    return {
      ready: this.supportsCurrentPlatform,
      message: this.supportsCurrentPlatform ? 'CEG plugin ready' : 'CEG plugin not supported on this platform',
      issues: [],
      missingDependencies: [],
    }
  }

  async detect(exePath: string): Promise<DrmDetectionResult> {
    try {
      await this.validateExecutablePath(exePath)

      const gameDir = path.dirname(exePath)
      const cegFiles = this.findCegFiles(gameDir)
      const hasImport = await this.checkCeguiImport(exePath)

      if (cegFiles.length === 0 && !hasImport) {
        return {
          type: 'none',
          confidence: 30,
          description: 'CEG DRM not detected',
          detectedPath: exePath,
          riskLevel: 'low',
        }
      }

      const confidence = Math.min(100, (cegFiles.length * 40) + (hasImport ? 60 : 0))

      return {
        type: 'ceg',
        confidence,
        description: `Games for Windows - LIVE DRM detected (${cegFiles.length} .DRM files, CEGUI imports: ${hasImport})`,
        detectedPath: exePath,
        riskLevel: 'low',
        metadata: {
          drmFiles: cegFiles,
          hasCeguiImport: hasImport,
          fileCount: cegFiles.length,
        },
      }
    } catch (err) {
      logger.error(`[CEG] Detection failed: ${err instanceof Error ? err.message : 'unknown error'}`, 'drm')
      return {
        type: 'error',
        confidence: 0,
        description: `Detection error: ${err instanceof Error ? err.message : 'unknown error'}`,
        riskLevel: 'critical',
      }
    }
  }

  async remove(exePath: string, options?: RemovalOptions): Promise<DrmRemovalResult> {
    try {
      await this.validateExecutablePath(exePath)

      // Check for removal markers
      if (fs.existsSync(exePath + '.ycore.ceg-removed')) {
        return {
          success: true,
          message: 'CEG DRM already removed (cached)',
          hadDrm: true,
          exePath,
          backupPath: fs.existsSync(exePath + '.ceg.bak') ? exePath + '.ceg.bak' : undefined,
        }
      }

      const gameDir = path.dirname(exePath)
      const cegFiles = this.findCegFiles(gameDir)
      const hasImport = await this.checkCeguiImport(exePath)

      if (cegFiles.length === 0 && !hasImport) {
        return {
          success: true,
          message: 'No CEG DRM detected',
          hadDrm: false,
          exePath,
        }
      }

      // Create backup before modification
      const backupPath = exePath + '.ceg.bak'
      if (!fs.existsSync(backupPath) && options?.keepBackup !== false) {
        try {
          await this.createBackup(exePath, '.ceg.bak')
        } catch (err: any) {
          return {
            success: false,
            message: `Failed to backup exe: ${err.message}`,
            hadDrm: false,
            error: {
              code: 'BACKUP_FAILED',
              details: err.message,
              recoverable: true,
            },
          }
        }
      }

      // Step 1: Remove .DRM and .DRM64 sidecar files
      let removedCount = 0
      for (const drmFile of cegFiles) {
        try {
          fs.unlinkSync(drmFile)
          removedCount++
          logger.info(`[CEG] Removed DRM file: ${drmFile}`, 'drm')
        } catch (err) {
          logger.warn(`[CEG] Failed to remove DRM file ${drmFile}: ${err instanceof Error ? err.message : 'unknown error'}`, 'drm')
        }
      }

      // Step 2: Patch CEGUI.dll imports from PE header
      if (hasImport) {
        try {
          await this.patchCeguiImports(exePath)
          logger.info(`[CEG] Patched CEGUI imports from executable`, 'drm')
        } catch (err) {
          logger.warn(`[CEG] Failed to patch CEGUI imports: ${err instanceof Error ? err.message : 'unknown error'}`, 'drm')
          // Restoration on patch failure
          if (fs.existsSync(backupPath)) {
            try {
              fs.copyFileSync(backupPath, exePath)
            } catch {}
          }
          return {
            success: false,
            message: `Failed to patch CEGUI imports: ${err instanceof Error ? err.message : 'unknown error'}`,
            hadDrm: true,
            backupPath: fs.existsSync(backupPath) ? backupPath : undefined,
            error: {
              code: 'PATCH_FAILED',
              details: err instanceof Error ? err.message : 'unknown error',
              recoverable: true,
            },
          }
        }
      }

      // Create success marker
      try {
        fs.writeFileSync(exePath + '.ycore.ceg-removed', new Date().toISOString(), 'utf-8')
      } catch {}

      return {
        success: true,
        message: `CEG DRM removed successfully (removed ${removedCount} .DRM files, patched imports: ${hasImport})`,
        hadDrm: removedCount > 0 || hasImport,
        exePath,
        backupPath: fs.existsSync(backupPath) ? backupPath : undefined,
      }
    } catch (err) {
      logger.error(`[CEG] Removal failed: ${err instanceof Error ? err.message : 'unknown error'}`, 'drm')
      return {
        success: false,
        message: 'Removal operation failed',
        hadDrm: false,
        error: {
          code: 'REMOVAL_ERROR',
          details: err instanceof Error ? err.message : 'unknown error',
          recoverable: false,
        },
      }
    }
  }

  async restore(exePath: string): Promise<boolean> {
    try {
      const backupPath = exePath + '.ceg.bak'
      if (!fs.existsSync(backupPath)) {
        return false
      }

      fs.copyFileSync(backupPath, exePath)

      // Remove markers
      try {
        fs.unlinkSync(exePath + '.ycore.ceg-removed')
      } catch {}

      logger.info(`[CEG] Restored ${exePath} from backup`, 'drm')
      return true
    } catch (err) {
      logger.error(`[CEG] Restore failed: ${err instanceof Error ? err.message : 'unknown error'}`, 'drm')
      return false
    }
  }

  // ========================================================================
  // Private Methods
  // ========================================================================

  /**
   * Find .DRM and .DRM64 sidecar files in the game directory
   */
  private findCegFiles(gameDir: string): string[] {
    const files: string[] = []

    try {
      const entries = fs.readdirSync(gameDir, { withFileTypes: true })

      for (const entry of entries) {
        const fullPath = path.join(gameDir, entry.name)
        const lower = entry.name.toLowerCase()

        // Look for .DRM and .DRM64 files
        if (lower.endsWith('.drm') || lower.endsWith('.drm64')) {
          if (!entry.isDirectory()) {
            files.push(fullPath)
          }
        }
      }
    } catch (err) {
      logger.warn(`[CEG] Failed to scan directory ${gameDir}: ${err instanceof Error ? err.message : 'unknown error'}`, 'drm')
    }

    return files
  }

  /**
   * Check if executable imports CEGUI.dll
   */
  private async checkCeguiImport(exePath: string): Promise<boolean> {
    try {
      const buffer = Buffer.alloc(4096)
      const fd = fs.openSync(exePath, 'r')
      fs.readSync(fd, buffer, 0, 4096, 0)
      fs.closeSync(fd)

      // Read DOS header
      const dosSignature = buffer.readUInt16LE(0)
      if (dosSignature !== 0x5a4d) {
        // Not a valid PE file
        return false
      }

      // Get PE offset from DOS header
      const peOffset = buffer.readUInt32LE(0x3c)
      if (peOffset > 1024) {
        return false
      }

      // Verify PE signature
      const peSignature = buffer.readUInt32LE(peOffset)
      if (peSignature !== PE_SIGNATURE) {
        return false
      }

      // Search for CEGUI.dll in the binary
      const bufferStr = buffer.toString('utf8', 0, 4096)
      return bufferStr.toLowerCase().includes('cegui.dll')
    } catch (err) {
      logger.warn(`[CEG] Failed to check imports: ${err instanceof Error ? err.message : 'unknown error'}`, 'drm')
      return false
    }
  }

  /**
   * Patch CEGUI.dll imports from PE import table
   * This removes the CEGUI library from the import list
   */
  private async patchCeguiImports(exePath: string): Promise<void> {
    const buffer = await fs.promises.readFile(exePath)

    // Find DOS header
    const dosSignature = buffer.readUInt16LE(0)
    if (dosSignature !== 0x5a4d) {
      throw new Error('Invalid PE file format')
    }

    // Get PE offset
    const peOffset = buffer.readUInt32LE(0x3c)
    if (peOffset > 1024) {
      throw new Error('Invalid PE offset')
    }

    // Verify PE signature
    const peSignature = buffer.readUInt32LE(peOffset)
    if (peSignature !== PE_SIGNATURE) {
      throw new Error('Invalid PE signature')
    }

    // Read PE header
    const machineType = buffer.readUInt16LE(peOffset + 4)
    const numberOfSections = buffer.readUInt16LE(peOffset + 6)
    const sizeOfOptionalHeader = buffer.readUInt16LE(peOffset + 20)

    // Get Import Directory table offset
    // Import Directory is at offset 104 in the Optional Header for 64-bit, 96 for 32-bit
    const is64Bit = machineType === 0x8664
    const importDirOffset = is64Bit ? 104 : 96
    const importDirRVA = buffer.readUInt32LE(peOffset + 24 + importDirOffset)
    const importDirSize = buffer.readUInt32LE(peOffset + 24 + importDirOffset + 4)

    if (importDirRVA === 0 || importDirSize === 0) {
      // No imports to patch
      return
    }

    // Find .idata section
    let idataRawOffset = 0
    let idataVirtualAddress = 0
    let idataRawSize = 0

    for (let i = 0; i < numberOfSections; i++) {
      const sectionOffset = peOffset + 24 + sizeOfOptionalHeader + (i * 40)
      const sectionName = buffer.toString('ascii', sectionOffset, sectionOffset + 8).replace(/\0/g, '')

      if (sectionName === '.idata') {
        idataVirtualAddress = buffer.readUInt32LE(sectionOffset + 12)
        idataRawSize = buffer.readUInt32LE(sectionOffset + 16)
        idataRawOffset = buffer.readUInt32LE(sectionOffset + 20)
        break
      }
    }

    if (idataRawOffset === 0) {
      throw new Error('Could not find .idata section')
    }

    // Convert RVA to file offset
    const fileOffset = idataRawOffset + (importDirRVA - idataVirtualAddress)

    // Search and null out CEGUI.dll references in import table
    const ceguiBuffer = Buffer.from(CEGUI_DLL_NAME, 'ascii')
    let found = false

    for (let i = fileOffset; i < fileOffset + Math.min(importDirSize, idataRawSize); i++) {
      // Check if we found the DLL name
      if (buffer.compare(ceguiBuffer, 0, CEGUI_DLL_NAME.length, i, i + CEGUI_DLL_NAME.length) === 0) {
        // Null out the import table entry
        buffer.fill(0, i, i + CEGUI_DLL_NAME.length)
        found = true
        logger.info(`[CEG] Found and patched CEGUI.dll import at offset ${i}`, 'drm')
      }
    }

    if (!found) {
      logger.warn('[CEG] CEGUI.dll import found in initial scan but not in import table', 'drm')
    }

    // Write modified buffer back
    await fs.promises.writeFile(exePath, buffer)
  }
}

// Create and export singleton instance
export const cegPlugin = new CegPlugin()
