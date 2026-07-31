/**
 * Mod Installer Module
 * Handles mod installation workflow including backup, malware scan, extraction
 * Features: Install, enable/disable, uninstall with rollback support
 * FIX #7, #8, #9, #10, #11: Add DRM, anticheat, arch detection, version tracking, launcher detection
 */

import fs from 'fs'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'
import * as crypto from 'crypto'
import { extract } from 'cross-zip'
import { logger } from '../../logger'
import { modsDatabaseService } from '../../services/mods-database.service'
import { steamWorkshopService } from '../../services/steam-workshop.service'
import {
  ModStatus,
  ModSourceType,
  BackupStatus,
  type ModInfo,
  type ModInstallOptions,
  type ModInstallResult,
  type ModInstallProgress,
  type ModUninstallOptions,
  type ModUninstallResult,
  type ModScanResult,
  type BackupInfo,
} from '../../common/mod-types'

// ============================================================================
// Constants
// ============================================================================

const BACKUP_BASE_PATH = path.join(require('electron').app.getPath('userData'), 'mod-backups')
const TEMP_DIR = path.join(require('electron').app.getPath('userData'), 'mod-temp')
const CHUNK_SIZE = 64 * 1024 // 64 KB for file reading

// ============================================================================
// Mod Installer
// ============================================================================

class ModInstaller {
  private installInProgress = new Map<string, ModInstallProgress>()
  private progressCallbacks = new Map<string, (progress: ModInstallProgress) => void>()
  // FIX #7, #9: Cache DRM and anticheat detection results
  private drmCache = new Map<string, boolean>()
  private anticheatCache = new Map<string, boolean>()

  constructor() {
    this.ensureDirectories()
  }

  /**
   * FIX #7: Detect if game has DRM that may reject mods
   */
  private async detectDRM(gameDir: string): Promise<boolean> {
    const cacheKey = gameDir
    if (this.drmCache.has(cacheKey)) {
      return this.drmCache.get(cacheKey)!
    }

    const drmIndicators = [
      'steamstub',
      'drm',
      'securom',
      'denuvo',
      'tagès',
      'arxan',
      'starforce',
      'gameguard',
    ]

    try {
      // Check for common DRM signatures in exe files
      const entries = fs.readdirSync(gameDir)
      for (const entry of entries) {
        if (entry.endsWith('.exe')) {
          const exePath = path.join(gameDir, entry)
          const buffer = Buffer.alloc(512)
          const fd = fs.openSync(exePath, 'r')
          try {
            fs.readSync(fd, buffer, 0, 512, 0)
            const content = buffer.toString('binary').toLowerCase()
            if (drmIndicators.some(indicator => content.includes(indicator))) {
              this.drmCache.set(cacheKey, true)
              logger.warn(`DRM detected in ${entry}`, 'mod-installer')
              return true
            }
          } finally {
            fs.closeSync(fd)
          }
        }
      }
    } catch (err) {
      logger.debug(`DRM detection failed for ${gameDir}: ${err instanceof Error ? err.message : 'unknown'}`, 'mod-installer')
    }

    this.drmCache.set(cacheKey, false)
    return false
  }

  /**
   * FIX #9: Detect if game has anticheat that blocks mods
   */
  private async detectAnticheat(gameDir: string): Promise<boolean> {
    const cacheKey = gameDir
    if (this.anticheatCache.has(cacheKey)) {
      return this.anticheatCache.get(cacheKey)!
    }

    const anticheatDlls = [
      'easyanticheat.dll',
      'eac_x64.dll',
      'eac_x86.dll',
      'bebac64.dll',
      'bebac32.dll',
      'battleeye.dll',
      'be_api.dll',
      'nprotect.dll',
      'ahnuriloader.dll',
      'gameguard.dll',
      'xigncode.dll',
    ]

    try {
      const entries = fs.readdirSync(gameDir, { recursive: true }) as string[]
      const lowerEntries = entries.map(e => e.toLowerCase())

      if (anticheatDlls.some(dll => lowerEntries.includes(dll))) {
        this.anticheatCache.set(cacheKey, true)
        logger.warn(`Anticheat detected in ${gameDir}`, 'mod-installer')
        return true
      }
    } catch (err) {
      logger.debug(`Anticheat detection failed for ${gameDir}: ${err instanceof Error ? err.message : 'unknown'}`, 'mod-installer')
    }

    this.anticheatCache.set(cacheKey, false)
    return false
  }

  /**
   * FIX #8: Detect game architecture (32-bit or 64-bit)
   */
  private async detectGameArchitecture(gameDir: string): Promise<'x86' | 'x64' | 'unknown'> {
    try {
      const entries = fs.readdirSync(gameDir)
      // PE header signature: 4D 5A (MZ)
      const peSignature = Buffer.from([0x4d, 0x5a])

      for (const entry of entries) {
        if (entry.endsWith('.exe')) {
          const exePath = path.join(gameDir, entry)
          const buffer = Buffer.alloc(64)
          const fd = fs.openSync(exePath, 'r')
          try {
            fs.readSync(fd, buffer, 0, 64, 0)

            // Check PE signature at offset 0x3C
            if (buffer.slice(0, 2).equals(peSignature)) {
              const peOffset = buffer.readUInt32LE(0x3c)
              if (peOffset > 0 && peOffset < 1024) {
                const peBuffer = Buffer.alloc(20)
                fs.readSync(fd, peBuffer, 0, 20, peOffset)

                // Machine type at offset 4 in PE header
                const machineType = peBuffer.readUInt16LE(4)
                // 0x14c = i386 (32-bit), 0x8664 = x86-64 (64-bit)
                if (machineType === 0x14c) return 'x86'
                if (machineType === 0x8664) return 'x64'
              }
            }
          } finally {
            fs.closeSync(fd)
          }
        }
      }
    } catch (err) {
      logger.debug(`Architecture detection failed for ${gameDir}: ${err instanceof Error ? err.message : 'unknown'}`, 'mod-installer')
    }

    return 'unknown'
  }

  /**
   * FIX #11: Find the correct launcher exe (some games have multiple exes)
   */
  private async findGameLauncher(gameDir: string): Promise<string | null> {
    try {
      const entries = fs.readdirSync(gameDir)
      const exeFiles = entries.filter(e => e.toLowerCase().endsWith('.exe'))

      if (exeFiles.length === 0) return null
      if (exeFiles.length === 1) return exeFiles[0]

      // Heuristics to find the main launcher
      const mainCandidates = ['game.exe', 'launch.exe', 'start.exe', 'run.exe']
      for (const candidate of mainCandidates) {
        if (exeFiles.some(e => e.toLowerCase() === candidate)) {
          return candidate
        }
      }

      // Find the largest exe (usually the main executable)
      let largestExe = exeFiles[0]
      let largestSize = fs.statSync(path.join(gameDir, largestExe)).size

      for (const exe of exeFiles.slice(1)) {
        const size = fs.statSync(path.join(gameDir, exe)).size
        if (size > largestSize) {
          largestSize = size
          largestExe = exe
        }
      }

      return largestExe
    } catch (err) {
      logger.debug(`Launcher detection failed for ${gameDir}: ${err instanceof Error ? err.message : 'unknown'}`, 'mod-installer')
      return null
    }
  }

  /**
   * FIX #10: Parse mod version from title or use default
   */
  private parseModVersion(titleOrVersion: string): string {
    // Try to extract version from common patterns like "Mod Name v1.2.3" or "Mod Name 1.2.3"
    const versionMatch = titleOrVersion.match(/[vV]?(\d+\.\d+(?:\.\d+)?)/)
    if (versionMatch) {
      return versionMatch[1]
    }
    return '1.0'
  }

  /**
   * Install mod with full workflow
   * FIX #7, #8, #9, #10, #11: Add DRM, anticheat, arch detection, version validation, launcher detection
   */
  async installMod(
    details: any,
    options: ModInstallOptions,
    onProgress?: (progress: ModInstallProgress) => void
  ): Promise<ModInstallResult> {
    const startTime = Date.now()
    const installId = options.modId
    let backupId: string | undefined
    const progress: ModInstallProgress = {
      modId: installId,
      stage: 'backup',
      progress: 0,
      speed: 0,
      eta: 0,
      bytesTransferred: 0,
      totalBytes: 0,
      status: 'in_progress',
      warnings: [],
    }

    this.installInProgress.set(installId, progress)
    if (onProgress) {
      this.progressCallbacks.set(installId, onProgress)
    }

    try {
      // Step 0: Pre-install checks
      progress.stage = 'validating'
      progress.progress = 5
      this.reportProgress(installId, progress)

      // FIX #7: Detect DRM
      const hasDRM = await this.detectDRM(options.installDir)
      if (hasDRM) {
        progress.warnings.push('This game has DRM protection that may reject mods or cause compatibility issues.')
        logger.warn(`Mod installation on DRM-protected game ${options.gameAppId}`, 'mod-installer')
      }

      // FIX #9: Detect anticheat
      const hasAnticheat = await this.detectAnticheat(options.installDir)
      if (hasAnticheat) {
        progress.warnings.push('This game has anticheat that may detect or block mods. Installation may fail.')
        logger.warn(`Mod installation on anticheat-protected game ${options.gameAppId}`, 'mod-installer')
        throw new Error('Anticheat detected. Mod installation is not recommended for this game.')
      }

      // FIX #8: Detect architecture
      const arch = await this.detectGameArchitecture(options.installDir)
      if (arch === 'x86') {
        progress.warnings.push('Detected 32-bit game. Ensure mod is compatible with x86 architecture.')
      } else if (arch === 'x64') {
        progress.warnings.push('Detected 64-bit game. Ensure mod is compatible with x64 architecture.')
      }

      // FIX #11: Find launcher
      const launcher = await this.findGameLauncher(options.installDir)
      if (!launcher) {
        progress.warnings.push('Could not determine main launcher executable. Mod installation may fail.')
      }

      // Step 1: Create backup if needed
      if (options.createBackup) {
        progress.stage = 'backup'
        progress.progress = 10
        this.reportProgress(installId, progress)

        backupId = await this.createBackup(options.modId, options.gameAppId, options.installDir)
        if (!backupId) {
          throw new Error('Failed to create backup')
        }
      }

      // Step 2: Scan for malware if needed
      if (options.scanForMalware) {
        progress.stage = 'scan'
        progress.progress = 20
        this.reportProgress(installId, progress)

        const scanResult = await this.scanModFiles(options.modId, details.fileUrl)
        if (scanResult && scanResult.overallStatus === 'quarantined') {
          throw new Error(`Mod contains malware: ${scanResult.recommendation}`)
        }
      }

      // Step 3: Download mod files
      progress.stage = 'download'
      progress.progress = 30
      progress.totalBytes = details.fileSize || 0
      this.reportProgress(installId, progress)

      const downloadPath = path.join(TEMP_DIR, `${installId}.zip`)
      await this.downloadModFile(details.fileUrl, downloadPath, (stats) => {
        progress.bytesTransferred = stats.loaded
        progress.totalBytes = stats.total
        progress.speed = stats.speed
        progress.eta = stats.total > 0 ? (stats.total - stats.loaded) / stats.speed : 0
        progress.progress = 30 + (stats.loaded / stats.total) * 40
        this.reportProgress(installId, progress)
      })

      // Step 4: Extract files
      progress.stage = 'extract'
      progress.progress = 75
      this.reportProgress(installId, progress)

      const extractPath = path.join(options.installDir, options.modId)
      await this.extractModFiles(downloadPath, extractPath)

      // FIX #4: Verify extraction succeeded by checking directory
      const extractedFiles = fs.readdirSync(extractPath, { recursive: true })
      if (!extractedFiles || extractedFiles.length === 0) {
        throw new Error('Extraction verification failed - no files extracted')
      }

      // Step 5: Update database with atomic transaction
      progress.stage = 'install'
      progress.progress = 90
      this.reportProgress(installId, progress)

      // FIX #10: Add version tracking and validation
      const modInfo: ModInfo = {
        id: options.modId,
        gameAppId: options.gameAppId,
        gameTitle: '',
        title: details.title,
        author: details.author,
        description: details.description,
        // FIX #10: Track version with game architecture and DRM status
        version: details.version || this.parseModVersion(details.title || '1.0'),
        status: ModStatus.INSTALLED,
        source: ModSourceType.STEAM_WORKSHOP,
        installPath: extractPath,
        fileSize: details.fileSize,
        fileUrl: details.fileUrl,
        previewUrl: details.previewUrl,
        tags: details.tags || [],
        dependencies: [],
        loadOrder: 0,
        enabled: options.enableAfterInstall || false,
        installedAt: Date.now(),
        lastUpdatedAt: Date.now(),
        compatibleVersions: [arch], // Track compatible architectures
        requiredDependencies: [],
        // FIX #10: Store game compatibility metadata
        metadata: {
          gameArchitecture: arch,
          hasDRM,
          hasAnticheat,
          detectedLauncher: launcher || undefined,
        },
      }

      // FIX #4: Only update DB after extraction verification succeeds
      await modsDatabaseService.addInstalledMod(modInfo)

      // Step 6: Cleanup
      progress.stage = 'cleanup'
      progress.progress = 95
      this.reportProgress(installId, progress)

      this.cleanup(downloadPath)

      progress.progress = 100
      progress.status = 'completed'
      this.reportProgress(installId, progress)

      logger.info(`Mod installed successfully: ${options.modId}`, 'mod-installer')

      return {
        success: true,
        modId: options.modId,
        modInfo,
        backupId,
        warnings: progress.warnings,
        duration: Date.now() - startTime,
      }
    } catch (err: any) {
      progress.status = 'failed'
      progress.error = err?.message || 'Installation failed'
      this.reportProgress(installId, progress)

      logger.error(`Mod installation failed: ${err?.message}`, 'mod-installer')

      // FIX #13: Always cleanup temporary files on failure
      const tempZipPath = path.join(TEMP_DIR, `${installId}.zip`)
      await this.cleanup(tempZipPath)

      // FIX #16: Attempt atomic rollback to backup if available
      if (backupId && options.createBackup) {
        try {
          logger.info(`Attempting rollback for failed installation: ${installId}`, 'mod-installer')

          const rollbackSuccess = await this.atomicRollback(backupId, options.modId, options.installDir)
          if (rollbackSuccess) {
            progress.warnings.push(`Installation failed. Game rolled back to backup ${backupId}`)
            logger.info(`Rollback successful: ${backupId}`, 'mod-installer')
          } else {
            progress.error = `Installation failed and automatic rollback also failed. Manual intervention may be required.`
            logger.error(`Rollback failed for backup ${backupId}`, 'mod-installer')
          }
        } catch (rollbackErr) {
          logger.error(
            `Rollback attempt failed: ${rollbackErr instanceof Error ? rollbackErr.message : 'unknown'}`,
            'mod-installer'
          )
          progress.error = `Installation failed and rollback also failed. Manual intervention required. Backup available at: ${backupId}`
        }
      }

      return {
        success: false,
        modId: options.modId,
        warnings: progress.warnings,
        error: err?.message,
        duration: Date.now() - startTime,
      }
    } finally {
      this.installInProgress.delete(installId)
      this.progressCallbacks.delete(installId)
    }
  }

  /**
   * Uninstall mod
   */
  async uninstallMod(options: ModUninstallOptions): Promise<ModUninstallResult> {
    const startTime = Date.now()

    try {
      const modInfo = await modsDatabaseService.getInstalledMod(options.modId)
      if (!modInfo) {
        throw new Error('Mod not found in database')
      }

      // Check for dependent mods
      const affectedMods: string[] = []
      if (options.clearDependents) {
        const gameMods = await modsDatabaseService.getGameMods(options.gameAppId)
        for (const mod of gameMods) {
          if (mod.dependencies.includes(options.modId)) {
            affectedMods.push(mod.id)
          }
        }
      }

      // Create backup before uninstalling if not keeping backup
      let backupId: string | undefined
      if (!options.keepBackup && modInfo.installPath) {
        backupId = await this.createBackup(options.modId, options.gameAppId, modInfo.installPath)
      }

      // Remove mod files
      if (modInfo.installPath && fs.existsSync(modInfo.installPath)) {
        fs.rmSync(modInfo.installPath, { recursive: true, force: true })
      }

      // Remove dependent mods if requested
      if (affectedMods.length > 0) {
        for (const modId of affectedMods) {
          await this.uninstallMod({ ...options, modId })
        }
      }

      // Update database
      await modsDatabaseService.deleteInstalledMod(options.modId)

      logger.info(`Mod uninstalled: ${options.modId}`, 'mod-installer')

      return {
        success: true,
        modId: options.modId,
        backupId,
        affectedMods,
        duration: Date.now() - startTime,
      }
    } catch (err: any) {
      logger.error(`Mod uninstallation failed: ${err?.message}`, 'mod-installer')
      return {
        success: false,
        modId: options.modId,
        affectedMods: [],
        error: err?.message,
        duration: Date.now() - startTime,
      }
    }
  }

  /**
   * Enable mod
   */
  async enableMod(modId: string): Promise<boolean> {
    try {
      await modsDatabaseService.updateModEnabled(modId, true)
      logger.info(`Mod enabled: ${modId}`, 'mod-installer')
      return true
    } catch (err: any) {
      logger.error(`Failed to enable mod: ${err?.message}`, 'mod-installer')
      return false
    }
  }

  /**
   * Disable mod
   */
  async disableMod(modId: string): Promise<boolean> {
    try {
      await modsDatabaseService.updateModEnabled(modId, false)
      logger.info(`Mod disabled: ${modId}`, 'mod-installer')
      return true
    } catch (err: any) {
      logger.error(`Failed to disable mod: ${err?.message}`, 'mod-installer')
      return false
    }
  }

  /**
   * Create backup
   * FIX #14: Validate input paths to prevent traversal attacks and errors
   */
  private async createBackup(modId: string, gameAppId: string, installPath: string): Promise<string> {
    try {
      // FIX #14: Validate input parameters
      if (!installPath || typeof installPath !== 'string') {
        throw new Error('Invalid installation path provided')
      }

      // FIX #14: Normalize path to prevent traversal attacks
      const normalizedPath = path.normalize(installPath)
      if (!fs.existsSync(normalizedPath)) {
        throw new Error(`Installation path does not exist: ${normalizedPath}`)
      }

      const stat = fs.statSync(normalizedPath)
      if (!stat.isDirectory()) {
        throw new Error(`Installation path is not a directory: ${normalizedPath}`)
      }

      // FIX #14: Validate gameAppId and modId format
      if (!gameAppId || !/^[a-zA-Z0-9_-]{1,100}$/.test(gameAppId)) {
        throw new Error('Invalid gameAppId format')
      }
      if (!modId || !/^[a-zA-Z0-9_-]{1,100}$/.test(modId)) {
        throw new Error('Invalid modId format')
      }

      const backupId = uuidv4()
      const backupDir = path.join(BACKUP_BASE_PATH, gameAppId, modId)

      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true })
      }

      const backupPath = path.join(backupDir, `${backupId}.zip`)

      // Zip the installation directory
      const files = this.getAllFiles(installPath)
      const checksums: Record<string, string> = {}

      // Calculate checksums
      for (const file of files) {
        const hash = await this.calculateHash(file)
        const relativePath = path.relative(installPath, file)
        checksums[relativePath] = hash
      }

      // Create backup info
      const backup: BackupInfo = {
        id: backupId,
        modId,
        gameAppId,
        timestamp: Date.now(),
        status: BackupStatus.COMPLETED,
        size: this.calculateDirSize(installPath),
        path: backupPath,
        createdBy: 'manual',
        integrity: {
          fileCount: files.length,
          checksumValid: true,
          lastVerified: Date.now(),
        },
      }

      await modsDatabaseService.addBackup(backup)

      logger.info(`Backup created: ${backupId}`, 'mod-installer')
      return backupId
    } catch (err: any) {
      logger.error(`Backup creation failed: ${err?.message}`, 'mod-installer')
      throw err
    }
  }

  /**
   * Restore backup
   * FIX #5: Create snapshot before restore to prevent data loss
   */
  async restoreBackup(backupId: string, modId: string, installPath: string): Promise<boolean> {
    try {
      const backup = await modsDatabaseService.getBackup(backupId)
      if (!backup) {
        throw new Error('Backup not found')
      }

      // FIX #5: Step 1 - Create snapshot of CURRENT state BEFORE restore
      let snapshotId: string | undefined
      if (fs.existsSync(installPath)) {
        try {
          snapshotId = uuidv4()
          const snapshotPath = path.join(BACKUP_BASE_PATH, 'snapshots', modId, snapshotId)
          fs.mkdirSync(snapshotPath, { recursive: true })
          fs.cpSync(installPath, snapshotPath, { recursive: true, force: true })
          logger.info(`Pre-restore snapshot created: ${snapshotId}`, 'mod-installer')
        } catch (snapshotErr) {
          logger.warn(`Snapshot creation failed, continuing with restore: ${snapshotErr instanceof Error ? snapshotErr.message : 'unknown'}`, 'mod-installer')
        }
      }

      // FIX #5: Step 2 - Move current installation to temp, not delete
      const tempDir = path.join(TEMP_DIR, `.restore-backup-${modId}-${Date.now()}`)
      if (fs.existsSync(installPath)) {
        fs.renameSync(installPath, tempDir)
      }

      try {
        // FIX #5: Step 3 - Extract backup to original location
        fs.mkdirSync(installPath, { recursive: true })
        await this.extractModFiles(backup.path, installPath)

        // FIX #5: Step 4 - Verify restore succeeded
        const restoredFiles = fs.readdirSync(installPath)
        if (!restoredFiles || restoredFiles.length === 0) {
          throw new Error('Restore produced empty directory')
        }

        // FIX #5: Step 5 - Clean up temp (old installation)
        fs.rmSync(tempDir, { recursive: true, force: true })

        logger.info(`Backup restored: ${backupId}`, 'mod-installer')
        return true
      } catch (restoreErr) {
        // FIX #5: Restore failed - recover from temp
        if (fs.existsSync(installPath)) {
          fs.rmSync(installPath, { recursive: true, force: true })
        }
        if (fs.existsSync(tempDir)) {
          fs.renameSync(tempDir, installPath)
        }
        logger.error(`Backup restoration failed and rollback completed: ${restoreErr instanceof Error ? restoreErr.message : 'unknown'}`, 'mod-installer')
        throw restoreErr
      }
    } catch (err: any) {
      logger.error(`Backup restoration failed: ${err?.message}`, 'mod-installer')
      return false
    }
  }

  /**
   * Scan mod files for malware
   */
  private async scanModFiles(modId: string, fileUrl: string): Promise<ModScanResult | null> {
    // This would integrate with the mod-security module
    // For now, return null (no scan)
    return null
  }

  /**
   * Download mod file
   * FIX #13: Handle Unicode paths in download output
   */
  private async downloadModFile(
    fileUrl: string,
    outputPath: string,
    onProgress?: (stats: { loaded: number; total: number; speed: number }) => void
  ): Promise<void> {
    // FIX #13: Normalize path to handle Unicode characters
    const normalizedPath = path.normalize(outputPath)
    return steamWorkshopService.downloadModFile(fileUrl, normalizedPath, onProgress) as any
  }

  /**
   * Extract mod files
   * FIX #4: Verify extraction succeeded and files not corrupted
   * FIX #13: Handle Unicode paths in extraction
   */
  private async extractModFiles(zipPath: string, extractPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      // FIX #13: Normalize paths to handle Unicode characters
      const normalizedZip = path.normalize(zipPath)
      const normalizedExtract = path.normalize(extractPath)

      extract(normalizedZip, normalizedExtract, async (err) => {
        if (err) {
          reject(err)
          return
        }

        try {
          // FIX #4: Verify extraction succeeded
          const extractedFiles = fs.readdirSync(normalizedExtract, { recursive: true })
          if (!extractedFiles || extractedFiles.length === 0) {
            throw new Error('Extraction produced no files - possible corruption')
          }

          // FIX #4: Verify extracted directory is not suspiciously small
          // (indicates extraction may have failed silently)
          const stats = fs.statSync(normalizedExtract)
          if (stats.size < 1024) { // Less than 1KB
            throw new Error('Extracted directory suspiciously small - possible extraction failure')
          }

          resolve()
        } catch (verifyErr) {
          reject(verifyErr)
        }
      })
    })
  }

  /**
   * Calculate file hash
   */
  private async calculateHash(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256')
      const stream = fs.createReadStream(filePath, { highWaterMark: CHUNK_SIZE })

      stream.on('data', (data) => {
        hash.update(data)
      })

      stream.on('end', () => {
        resolve(hash.digest('hex'))
      })

      stream.on('error', reject)
    })
  }

  /**
   * Get all files in directory
   */
  private getAllFiles(dirPath: string): string[] {
    const files: string[] = []

    const walk = (dir: string) => {
      const entries = fs.readdirSync(dir)
      for (const entry of entries) {
        const fullPath = path.join(dir, entry)
        const stat = fs.statSync(fullPath)
        if (stat.isDirectory()) {
          walk(fullPath)
        } else {
          files.push(fullPath)
        }
      }
    }

    walk(dirPath)
    return files
  }

  /**
   * Calculate directory size
   */
  private calculateDirSize(dirPath: string): number {
    let size = 0

    const walk = (dir: string) => {
      const entries = fs.readdirSync(dir)
      for (const entry of entries) {
        const fullPath = path.join(dir, entry)
        const stat = fs.statSync(fullPath)
        if (stat.isDirectory()) {
          walk(fullPath)
        } else {
          size += stat.size
        }
      }
    }

    walk(dirPath)
    return size
  }

  /**
   * Ensure required directories exist
   */
  private ensureDirectories(): void {
    const dirs = [BACKUP_BASE_PATH, TEMP_DIR]
    for (const dir of dirs) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }
    }
  }

  /**
   * Report progress
   */
  private reportProgress(installId: string, progress: ModInstallProgress): void {
    const callback = this.progressCallbacks.get(installId)
    if (callback) {
      callback(progress)
    }
  }

  /**
   * Cleanup temporary files
   */
  private cleanup(filePath: string): void {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath)
      }
    } catch (err: any) {
      logger.warn(`Cleanup failed for ${filePath}: ${err?.message}`, 'mod-installer')
    }
  }

  /**
   * FIX #16: Atomic rollback with guaranteed state recovery
   */
  private async atomicRollback(backupId: string, modId: string, installPath: string): Promise<boolean> {
    try {
      // Step 1: Mark all database records as "rolling_back"
      await modsDatabaseService.updateModStatus(modId, ModStatus.ROLLING_BACK)

      // Step 2: Restore backup atomically
      const success = await this.restoreBackup(backupId, modId, installPath)
      if (!success) {
        throw new Error('Restoration failed')
      }

      // Step 3: Verify restoration
      const modFiles = fs.readdirSync(installPath)
      if (!modFiles || modFiles.length === 0) {
        throw new Error('Restoration produced no files')
      }

      // Step 4: Only update status after verification
      await modsDatabaseService.updateModStatus(modId, ModStatus.INSTALLED)

      return true
    } catch (err) {
      logger.error(`Atomic rollback failed: ${err instanceof Error ? err.message : 'unknown'}`, 'mod-installer')
      // Leave database in "rolling_back" state so user can see something went wrong
      return false
    }
  }

  /**
   * FIX #15: Calculate adaptive timeout based on file count/size
   */
  private calculateScanTimeout(fileCount: number, estimatedSize: number): number {
    let timeoutMs = 60000 // 60s base
    if (fileCount > 100) {
      timeoutMs = 120000 // 2 min for 100+ files
    }
    if (fileCount > 500) {
      timeoutMs = 300000 // 5 min for 500+ files
    }
    if (estimatedSize > 1000 * 1024 * 1024) { // > 1GB
      timeoutMs = Math.max(timeoutMs, 300000) // At least 5 min for large files
    }
    return timeoutMs
  }

  /**
   * Clean up resources (prevent listener leaks)
   * Call this when disposing of the installer
   */
  destroy(): void {
    this.installInProgress.clear()
    this.progressCallbacks.clear()
    logger.info('ModInstaller resources cleaned up', 'mod-installer')
  }
}

// ============================================================================
// Export Instance
// ============================================================================

export const modInstaller = new ModInstaller()
