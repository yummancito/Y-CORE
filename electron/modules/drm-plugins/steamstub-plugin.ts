/**
 * SteamStub DRM Plugin
 * ============================================================================
 * Detects and removes Valve's SteamStub DRM using the Steamless tool.
 * Handles backup management and integrity verification.
 * ============================================================================
 */

import path from 'path'
import fs from 'fs'
import { spawn } from 'child_process'
import crypto from 'crypto'
import { BaseDrmPlugin, DrmDetectionResult, DrmRemovalResult, RemovalOptions, PluginStatus } from './drm-plugin-base'
import { logger } from '../../logger'
import { getSteamPath } from '../steam-helpers'

interface BackupManifest {
  version: 1
  timestamp: string
  exePath: string
  exeSize: number
  exeCrc32: string
  exeSha1: string
  backupPath: string
  backupCrc32: string
  backupSha1: string
}

export class SteamStubPlugin extends BaseDrmPlugin {
  readonly id = 'steamstub'
  readonly name = 'SteamStub DRM'
  readonly version = '1.0.0'
  readonly riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low'

  private steamPath: string | null = null
  private steamlessDir: string | null = null
  private ready: boolean = false

  constructor() {
    super()
    this.initialize()
  }

  private async initialize(): Promise<void> {
    this.steamPath = getSteamPath()
    if (this.steamPath) {
      this.steamlessDir = path.join(this.steamPath, 'steamless')
      this.ready = fs.existsSync(this.steamlessDir)
    }
  }

  async isReady(): Promise<boolean> {
    if (!this.ready) {
      await this.initialize()
    }
    return this.ready && this.steamlessDir !== null && fs.existsSync(this.steamlessDir)
  }

  async getStatus(): Promise<PluginStatus> {
    const ready = await this.isReady()
    const issues: string[] = []
    const missingDependencies: string[] = []

    if (!this.steamPath) {
      issues.push('Steam installation not found')
      missingDependencies.push('Steam')
    }

    if (!this.steamlessDir || !fs.existsSync(this.steamlessDir)) {
      issues.push('Steamless tool not found')
      missingDependencies.push('Steamless CLI')
    }

    return {
      ready,
      message: ready ? 'SteamStub plugin ready' : 'SteamStub plugin not ready',
      issues,
      missingDependencies,
    }
  }

  async detect(exePath: string): Promise<DrmDetectionResult> {
    try {
      await this.validateExecutablePath(exePath)

      // Read PE header to detect SteamStub signature
      const buffer = Buffer.alloc(1024)
      const fd = fs.openSync(exePath, 'r')
      fs.readSync(fd, buffer, 0, 1024, 0)
      fs.closeSync(fd)

      // Check for common SteamStub indicators in PE header
      const bufferStr = buffer.toString('utf8', 0, 512)

      // SteamStub leaves distinctive patterns in the PE header
      const hasSteamStubSignature =
        bufferStr.includes('SteamStub') || // Direct signature
        bufferStr.includes('.bind') || // Common SteamStub section
        /UPX[0-9]{1}|!UPX/i.test(bufferStr) // UPX packer often used with SteamStub

      if (hasSteamStubSignature) {
        return {
          type: 'steamstub',
          confidence: 95,
          description: 'Valve SteamStub DRM detected in executable',
          detectedPath: exePath,
          riskLevel: 'low',
          metadata: {
            hasBindSection: bufferStr.includes('.bind'),
            hasUPXSignature: /UPX[0-9]{1}|!UPX/i.test(bufferStr),
          },
        }
      }

      // Check for .ycore.drm-removed marker (already unpacked by us)
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

      // Check for .ycore.drm-free marker (no DRM)
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

      // No SteamStub detected (but doesn't mean no DRM)
      return {
        type: 'none',
        confidence: 35,
        description: 'SteamStub DRM not detected (may have other DRM)',
        detectedPath: exePath,
        riskLevel: 'low',
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

  async remove(exePath: string, options?: RemovalOptions): Promise<DrmRemovalResult> {
    try {
      await this.validateExecutablePath(exePath)

      if (!this.ready) {
        return {
          success: false,
          message: 'SteamStub plugin not ready (Steamless not found)',
          hadDrm: false,
          error: {
            code: 'PLUGIN_NOT_READY',
            details: 'Steamless tool is not installed',
            recoverable: true,
          },
        }
      }

      // Check for cached removal markers
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

      const backupPath = exePath + '.bak'

      // Check if already removed (backup exists)
      if (fs.existsSync(backupPath)) {
        const isIntact = await this.verifyBackupIntegrity(exePath, backupPath)
        if (isIntact) {
          return {
            success: true,
            message: 'DRM already removed (backup exists)',
            hadDrm: true,
            backupPath,
            exePath,
          }
        }
      }

      // Create backup
      if (!options?.keepBackup === false) {
        // keepBackup defaults to true
        try {
          await this.createBackup(exePath, '.bak')
          const manifest = await this.createBackupManifest(exePath, backupPath)
          await this.saveManifest(exePath, manifest)
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

      // Run Steamless
      const result = await this.runSteamless(exePath)

      if (!result.hadDrm) {
        // No DRM found
        if (fs.existsSync(backupPath)) {
          fs.unlinkSync(backupPath)
        }
        try {
          fs.writeFileSync(exePath + '.ycore.drm-free', new Date().toISOString(), 'utf-8')
        } catch {}
        return {
          success: true,
          message: 'No SteamStub DRM detected — nothing to remove',
          hadDrm: false,
          exePath,
        }
      }

      if (!result.success) {
        // Restoration on failure
        if (fs.existsSync(backupPath)) {
          try {
            fs.copyFileSync(backupPath, exePath)
            fs.unlinkSync(backupPath)
          } catch {}
        }
        return {
          success: false,
          message: `Steamless failed: ${result.output.substring(0, 200)}`,
          hadDrm: true,
          error: {
            code: 'REMOVAL_FAILED',
            details: result.output,
            recoverable: true,
          },
        }
      }

      // Handle Steamless output
      const unpackedPath = exePath.replace(/\.exe$/i, '.exe.unpacked.exe')
      if (fs.existsSync(unpackedPath)) {
        try {
          fs.copyFileSync(unpackedPath, exePath)
          fs.unlinkSync(unpackedPath)
        } catch (err: any) {
          if (fs.existsSync(backupPath)) {
            fs.copyFileSync(backupPath, exePath)
          }
          return {
            success: false,
            message: `Failed to replace exe: ${err.message}`,
            hadDrm: true,
            backupPath,
            exePath,
            error: {
              code: 'REPLACEMENT_FAILED',
              details: err.message,
              recoverable: true,
            },
          }
        }
      }

      // Create success marker
      try {
        fs.writeFileSync(exePath + '.ycore.drm-removed', new Date().toISOString(), 'utf-8')
      } catch {}

      return {
        success: true,
        message: 'DRM removed successfully',
        hadDrm: true,
        backupPath: fs.existsSync(backupPath) ? backupPath : undefined,
        exePath,
      }
    } catch (err) {
      logger.error(`[SteamStub] Removal failed: ${err instanceof Error ? err.message : 'unknown error'}`, 'drm')
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
      const backupPath = exePath + '.bak'
      if (!fs.existsSync(backupPath)) {
        return false
      }

      fs.copyFileSync(backupPath, exePath)

      // Remove markers
      try {
        fs.unlinkSync(exePath + '.ycore.drm-removed')
      } catch {}

      logger.info(`[SteamStub] Restored ${exePath} from backup`, 'drm')
      return true
    } catch (err) {
      logger.error(`[SteamStub] Restore failed: ${err instanceof Error ? err.message : 'unknown error'}`, 'drm')
      return false
    }
  }

  // ========================================================================
  // Private Methods
  // ========================================================================

  private runSteamless(exePath: string, retryAttempt: number = 0): Promise<{ success: boolean; output: string; hadDrm: boolean }> {
    return new Promise((resolve) => {
      if (!this.steamlessDir) {
        resolve({ success: false, output: 'Steamless directory not set', hadDrm: false })
        return
      }

      const cliExe = path.join(this.steamlessDir, 'Steamless.CLI.exe')
      if (!fs.existsSync(cliExe)) {
        resolve({ success: false, output: 'Steamless.CLI.exe not found', hadDrm: false })
        return
      }

      const args = ['--keepbind', '--quiet', exePath]
      let output = ''
      let hadDrm = false

      const proc = spawn(cliExe, args, { cwd: this.steamlessDir, windowsHide: true })

      proc.stdout?.on('data', (data: Buffer) => {
        const text = data.toString()
        output += text
        if (
          /stub\s+(detected|found)/i.test(text) ||
          /unpacking\s+(file|stub)/i.test(text) ||
          /File is packed with SteamStub/i.test(text) ||
          /Successfully unpacked file/i.test(text)
        ) {
          hadDrm = true
        }
      })

      proc.stderr?.on('data', (data: Buffer) => {
        output += data.toString()
      })

      const timeout = setTimeout(() => {
        proc.kill()
        resolve({ success: false, output: output + '\nTimeout after 60s', hadDrm })
      }, 60000)

      proc.on('close', (code) => {
        clearTimeout(timeout)
        logger.info(`[SteamStub] Steamless exited with code ${code}`, 'drm')

        const success = code === 0 && /unpacked|File unpacked/i.test(output)

        if (!success && retryAttempt < 3) {
          logger.info(`[SteamStub] Retrying Steamless (attempt ${retryAttempt + 2}/3)`, 'drm')
          setTimeout(() => {
            this.runSteamless(exePath, retryAttempt + 1).then(resolve)
          }, 1000 * (retryAttempt + 1))
          return
        }

        resolve({ success, output, hadDrm })
      })

      proc.on('error', (err) => {
        clearTimeout(timeout)
        resolve({ success: false, output: err.message, hadDrm })
      })
    })
  }

  private async calculateFileCrc32(filePath: string): Promise<string> {
    return this.calculateFileHash(filePath)
  }

  private async calculateFileSha1(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha1')
      const stream = fs.createReadStream(filePath)
      stream.on('data', (chunk) => hash.update(chunk))
      stream.on('end', () => resolve(hash.digest('hex')))
      stream.on('error', reject)
    })
  }

  private async createBackupManifest(exePath: string, backupPath: string): Promise<BackupManifest> {
    const [exeSize, exeCrc32, exeSha1, backupCrc32, backupSha1] = await Promise.all([
      (async () => fs.statSync(exePath).size)(),
      this.calculateFileCrc32(exePath),
      this.calculateFileSha1(exePath),
      this.calculateFileCrc32(backupPath),
      this.calculateFileSha1(backupPath),
    ])

    return {
      version: 1,
      timestamp: new Date().toISOString(),
      exePath,
      exeSize,
      exeCrc32,
      exeSha1,
      backupPath,
      backupCrc32,
      backupSha1,
    }
  }

  private getManifestPath(exePath: string): string {
    return exePath + '.ycore.manifest.json'
  }

  private async saveManifest(exePath: string, manifest: BackupManifest): Promise<void> {
    const manifestPath = this.getManifestPath(exePath)
    await fs.promises.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8')
  }

  private async loadManifest(exePath: string): Promise<BackupManifest | null> {
    try {
      const manifestPath = this.getManifestPath(exePath)
      if (!fs.existsSync(manifestPath)) return null
      const content = await fs.promises.readFile(manifestPath, 'utf-8')
      return JSON.parse(content)
    } catch {
      return null
    }
  }

  private async verifyBackupIntegrity(exePath: string, backupPath: string): Promise<boolean> {
    try {
      const manifest = await this.loadManifest(exePath)
      if (!manifest) return false

      if (!fs.existsSync(backupPath)) return false

      const backupSha1 = await this.calculateFileSha1(backupPath)
      if (backupSha1 !== manifest.backupSha1) {
        logger.warn('[SteamStub] Backup checksum mismatch - backup corrupted', 'drm')
        return false
      }

      return true
    } catch (err) {
      logger.error(`[SteamStub] Backup verification failed: ${err instanceof Error ? err.message : 'unknown error'}`, 'drm')
      return false
    }
  }
}

// Create and export singleton instance
export const steamstubPlugin = new SteamStubPlugin()
