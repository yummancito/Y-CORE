import { ipcMain } from 'electron'
import path from 'path'
import fs from 'fs'
import crypto from 'crypto'
import { spawn } from 'child_process'
import { logger } from '../logger'
import { getSteamPath, getSteamAppsPath, getSteamLibraryFolders, parseVdf } from './steam-helpers'

// ============================================================================
// Types & Interfaces
// ============================================================================

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

// ============================================================================
// Platform Detection
// ============================================================================

function getPlatform(): 'windows' | 'macos' | 'linux' | 'unknown' {
  const platform = process.platform
  if (platform === 'win32') return 'windows'
  if (platform === 'darwin') return 'macos'
  if (platform === 'linux') return 'linux'
  return 'unknown'
}

// ============================================================================
// Input Validation
// ============================================================================

function validateAppId(appId: string): { valid: boolean; error?: string } {
  if (!appId || typeof appId !== 'string') {
    return { valid: false, error: 'drm.error.invalidAppId' }
  }
  if (!/^\d{1,10}$/.test(appId)) {
    return { valid: false, error: 'drm.error.invalidAppIdFormat' }
  }
  return { valid: true }
}

function validatePath(filePath: string, baseDir: string): { valid: boolean; error?: string } {
  if (!filePath || typeof filePath !== 'string') {
    return { valid: false, error: 'drm.error.invalidPath' }
  }

  // Normalize and check for traversal
  const normalized = path.normalize(filePath)
  const resolved = path.resolve(normalized)
  const baseResolved = path.resolve(baseDir)

  if (!resolved.startsWith(baseResolved)) {
    return { valid: false, error: 'drm.error.pathTraversal' }
  }

  return { valid: true }
}

function validateFileExists(filePath: string, mustBeReadable: boolean = true): {
  valid: boolean
  error?: string
} {
  try {
    if (!fs.existsSync(filePath)) {
      return { valid: false, error: 'drm.error.fileNotFound' }
    }
    if (mustBeReadable) {
      fs.accessSync(filePath, fs.constants.R_OK)
    }
    return { valid: true }
  } catch {
    return { valid: false, error: 'drm.error.fileNotReadable' }
  }
}

// ============================================================================
// Checksum Utilities
// ============================================================================

function calculateCrc32(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256') // Use SHA256 as CRC32 substitute
    const stream = fs.createReadStream(filePath)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('end', () => resolve(hash.digest('hex')))
    stream.on('error', reject)
  })
}

function calculateSha1(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha1')
    const stream = fs.createReadStream(filePath)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('end', () => resolve(hash.digest('hex')))
    stream.on('error', reject)
  })
}

// ============================================================================
// Backup Manifest Management
// ============================================================================

function getManifestPath(exePath: string): string {
  return exePath + '.ycore.manifest.json'
}

async function createBackupManifest(
  exePath: string,
  backupPath: string
): Promise<BackupManifest> {
  const [exeSize, exeCrc32, exeSha1, backupCrc32, backupSha1] = await Promise.all([
    (async () => fs.statSync(exePath).size)(),
    calculateCrc32(exePath),
    calculateSha1(exePath),
    calculateCrc32(backupPath),
    calculateSha1(backupPath),
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

async function saveManifest(exePath: string, manifest: BackupManifest): Promise<void> {
  const manifestPath = getManifestPath(exePath)
  await fs.promises.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8')
}

async function loadManifest(exePath: string): Promise<BackupManifest | null> {
  try {
    const manifestPath = getManifestPath(exePath)
    if (!fs.existsSync(manifestPath)) return null
    const content = await fs.promises.readFile(manifestPath, 'utf-8')
    return JSON.parse(content)
  } catch {
    return null
  }
}

async function verifyBackupIntegrity(exePath: string, backupPath: string): Promise<boolean> {
  try {
    const manifest = await loadManifest(exePath)
    if (!manifest) return false

    // Verify backup file exists and is readable
    if (!fs.existsSync(backupPath)) return false

    // Verify checksums match
    const backupSha1 = await calculateSha1(backupPath)
    if (backupSha1 !== manifest.backupSha1) {
      logger.warn('[DRM Remover] Backup checksum mismatch - backup corrupted', 'drm')
      return false
    }

    return true
  } catch (err) {
    logger.error(`[DRM Remover] Backup verification failed: ${err instanceof Error ? err.message : 'unknown error'}`, 'drm')
    return false
  }
}

// ============================================================================
// Game Executable Discovery
// ============================================================================

export function findGameExecutable(installDir: string): string | null {
  const folders = getSteamLibraryFolders()
  const priorityPatterns = [
    /-Win64-Shipping\.exe$/i,
    /-Win32-Shipping\.exe$/i,
    /Binaries[\\/]+Win64[\\/]+.*\.exe$/i,
    /Binaries[\\/]+Win32[\\/]+.*\.exe$/i,
  ]
  const excludeNames = new Set([
    'steam_api64.dll',
    'steam_api.dll',
    'steamclient64.dll',
    'crashpad_handler.exe',
    'crashpad_compressor.exe',
    'steamerrorreporter.exe',
    'scriptingdictionary.exe',
  ])

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
        if (excludeNames.has(entry.name.toLowerCase())) continue
        if (entry.name.toLowerCase().endsWith('.unpacked.exe')) continue
        if (entry.name.toLowerCase().endsWith('.bak')) continue

        let priority = 0
        for (let i = 0; i < priorityPatterns.length; i++) {
          if (priorityPatterns[i].test(fullPath)) {
            priority = priorityPatterns.length - i
            break
          }
        }
        try {
          const stat = fs.statSync(fullPath)
          if (stat.size < 1024 * 100) continue
        } catch {
          continue
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

function getGameInstallDir(appId: string): string | null {
  const steamAppsPath = getSteamAppsPath()
  if (!steamAppsPath) return null
  const acfPath = path.join(steamAppsPath, `appmanifest_${appId}.acf`)
  if (!fs.existsSync(acfPath)) return null
  try {
    const content = fs.readFileSync(acfPath, 'utf-8')
    const parsed = parseVdf(content)
    return parsed['AppState']?.['installdir'] || null
  } catch {
    return null
  }
}

// ============================================================================
// Steamless Runner
// ============================================================================

function runSteamless(
  exePath: string,
  steamlessDir: string,
  retryAttempt: number = 0
): Promise<{ success: boolean; output: string; hadDrm: boolean }> {
  return new Promise((resolve) => {
    const cliExe = path.join(steamlessDir, 'Steamless.CLI.exe')
    if (!fs.existsSync(cliExe)) {
      resolve({ success: false, output: 'Steamless.CLI.exe not found', hadDrm: false })
      return
    }

    const args = ['--keepbind', '--quiet', exePath]
    let output = ''
    let hadDrm = false

    const proc = spawn(cliExe, args, { cwd: steamlessDir, windowsHide: true })

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
      logger.info(`[DRM Remover] Steamless exited with code ${code}`, 'drm')
      logger.info(`[DRM Remover] Steamless output:\n${output}`, 'drm')

      // Primary: Exit code 0 = success
      const success = code === 0 && /unpacked|File unpacked/i.test(output)

      if (!success && retryAttempt < 3) {
        logger.info(
          `[DRM Remover] Retrying Steamless (attempt ${retryAttempt + 2}/3)`,
          'drm'
        )
        setTimeout(() => {
          runSteamless(exePath, steamlessDir, retryAttempt + 1).then(resolve)
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

// ============================================================================
// Main DRM Removal Logic
// ============================================================================

export async function removeGameDrm(appId: string): Promise<DrmRemoveResult> {
  const platform = getPlatform()
  if (platform !== 'windows') {
    return {
      success: false,
      message: `DRM removal not supported on ${platform}`,
      errorKey: 'drm.error.platformNotSupported',
      hadDrm: false,
    }
  }

  // Validate appId
  const appIdValidation = validateAppId(appId)
  if (!appIdValidation.valid) {
    return {
      success: false,
      message: 'Invalid application ID',
      errorKey: appIdValidation.error,
      hadDrm: false,
    }
  }

  // Marker-cache hit check (cheap, runs BEFORE Steamless)
  const installDir = getGameInstallDir(appId)
  if (installDir) {
    const exePath = findGameExecutable(installDir)
    if (exePath) {
      // Check drm-removed marker
      if (fs.existsSync(exePath + '.ycore.drm-removed')) {
        const backupPath = exePath + '.bak'
        return {
          success: true,
          message: 'DRM already removed (cached)',
          hadDrm: true,
          backupPath: fs.existsSync(backupPath) ? backupPath : undefined,
          exePath,
        }
      }

      // Check drm-free marker
      if (fs.existsSync(exePath + '.ycore.drm-free')) {
        return {
          success: true,
          message: 'No DRM detected (cached)',
          hadDrm: false,
          exePath,
        }
      }
    }
  }

  const steamPath = getSteamPath()
  if (!steamPath) {
    return {
      success: false,
      message: 'Steam installation not found',
      errorKey: 'drm.error.steamNotFound',
      hadDrm: false,
    }
  }

  const gameInstallDir = getGameInstallDir(appId)
  if (!gameInstallDir) {
    return {
      success: false,
      message: `No appmanifest found for AppId ${appId}`,
      errorKey: 'drm.error.gameNotFound',
      hadDrm: false,
    }
  }

  const exePath = findGameExecutable(gameInstallDir)
  if (!exePath) {
    return {
      success: false,
      message: `No game executable found in ${gameInstallDir}`,
      errorKey: 'drm.error.executableNotFound',
      hadDrm: false,
    }
  }

  // Validate path doesn't escape game directory
  const gameFolder = path.join(getSteamAppsPath() || '', 'common', gameInstallDir)
  const pathValidation = validatePath(exePath, gameFolder)
  if (!pathValidation.valid) {
    return {
      success: false,
      message: 'Invalid executable path',
      errorKey: pathValidation.error,
      hadDrm: false,
    }
  }

  const backupPath = exePath + '.bak'

  // Check if already removed (backup exists)
  if (fs.existsSync(backupPath)) {
    // Verify backup integrity
    const isIntact = await verifyBackupIntegrity(exePath, backupPath)
    if (!isIntact) {
      logger.warn('[DRM Remover] Backup corrupted, removing marker cache', 'drm')
      try {
        fs.unlinkSync(getManifestPath(exePath))
      } catch {}
      return {
        success: false,
        message: 'Backup file corrupted. Run removal again.',
        errorKey: 'drm.error.backupCorrupted',
        hadDrm: true,
        backupPath,
        exePath,
      }
    }

    return {
      success: true,
      message: 'DRM already removed (backup exists)',
      hadDrm: true,
      backupPath,
      exePath,
    }
  }

  const steamlessDir = path.join(steamPath, 'steamless')
  if (!fs.existsSync(steamlessDir)) {
    return {
      success: false,
      message: 'Steamless not installed. Please reinstall hook DLLs first.',
      errorKey: 'drm.error.steamlessNotFound',
      hadDrm: false,
    }
  }

  logger.info(`[DRM Remover] Running Steamless on ${exePath}`, 'drm')

  // Backup original exe
  try {
    fs.copyFileSync(exePath, backupPath)
  } catch (err: any) {
    return {
      success: false,
      message: `Failed to backup exe: ${err.message}`,
      errorKey: 'drm.error.backupFailed',
      hadDrm: false,
    }
  }

  // Create backup manifest
  try {
    const manifest = await createBackupManifest(exePath, backupPath)
    await saveManifest(exePath, manifest)
  } catch (err: any) {
    logger.warn(`[DRM Remover] Failed to save manifest: ${err.message}`, 'drm')
  }

  const result = await runSteamless(exePath, steamlessDir)
  logger.info(
    `[DRM Remover] Steamless result: success=${result.success}, hadDrm=${result.hadDrm}`,
    'drm'
  )

  if (!result.hadDrm) {
    // No DRM found, remove backup and create marker
    try {
      fs.unlinkSync(backupPath)
    } catch {}
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
    // Check if all unpackers failed (no SteamStub or unsupported variant)
    if (/All unpackers failed/i.test(result.output)) {
      try {
        fs.unlinkSync(backupPath)
      } catch {}
      return {
        success: false,
        message:
          'Steamless could not unpack this file. It may not have SteamStub DRM or uses an unsupported variant.',
        errorKey: 'drm.error.steamlessUnpackFailed',
        hadDrm: false,
        exePath,
      }
    }

    // Restore from backup
    try {
      fs.copyFileSync(backupPath, exePath)
      fs.unlinkSync(backupPath)
    } catch {}
    return {
      success: false,
      message: `Steamless failed: ${result.output.substring(0, 200)}`,
      errorKey: 'drm.error.steamlessFailed',
      hadDrm: true,
      exePath,
    }
  }

  // Steamless outputs the unpacked file as <name>.exe.unpacked.exe in the same dir
  const unpackedPath = exePath.replace(/\.exe$/i, '.exe.unpacked.exe')
  if (!fs.existsSync(unpackedPath)) {
    // Some Steamless versions replace in-place
    try {
      fs.writeFileSync(exePath + '.ycore.drm-removed', new Date().toISOString(), 'utf-8')
    } catch {}
    logger.info('[DRM Remover] No .unpacked.exe found, assuming in-place replacement', 'drm')
    return {
      success: true,
      message: 'DRM removed successfully',
      hadDrm: true,
      backupPath,
      exePath,
    }
  }

  // Replace original with unpacked
  try {
    fs.copyFileSync(unpackedPath, exePath)
    fs.unlinkSync(unpackedPath)
    // Create success marker
    try {
      fs.writeFileSync(exePath + '.ycore.drm-removed', new Date().toISOString(), 'utf-8')
    } catch {}
  } catch (err: any) {
    // Restore from backup
    try {
      fs.copyFileSync(backupPath, exePath)
    } catch {}
    return {
      success: false,
      message: `Failed to replace exe: ${err.message}`,
      errorKey: 'drm.error.replaceFailed',
      hadDrm: true,
      backupPath,
      exePath,
    }
  }

  return {
    success: true,
    message: 'DRM removed successfully',
    hadDrm: true,
    backupPath,
    exePath,
  }
}

// ============================================================================
// Status Check
// ============================================================================

export async function checkDrmStatus(appId: string): Promise<DrmStatusResult> {
  const platform = getPlatform()
  if (platform !== 'windows') {
    return {
      status: 'not-found',
      message: `DRM status check not supported on ${platform}`,
    }
  }

  const installDir = getGameInstallDir(appId)
  if (!installDir) {
    return {
      status: 'not-found',
      message: `No appmanifest found for AppId ${appId}`,
    }
  }

  const exePath = findGameExecutable(installDir)
  if (!exePath) {
    return {
      status: 'not-found',
      message: `No game executable found in ${installDir}`,
    }
  }

  const backupPath = exePath + '.bak'
  if (fs.existsSync(backupPath)) {
    return {
      status: 'drm-removed',
      exePath,
      backupPath,
      message: 'DRM already removed',
    }
  }

  // Check for .exe.unpacked.exe (Steamless output still present)
  const unpackedPath = exePath.replace(/\.exe$/i, '.exe.unpacked.exe')
  if (fs.existsSync(unpackedPath)) {
    return {
      status: 'drm-present',
      exePath,
      message: 'Unpacked exe detected — DRM removal may be in progress',
    }
  }

  return {
    status: 'drm-present',
    exePath,
    message: 'DRM status unknown — run removal to check',
  }
}

// ============================================================================
// IPC Handlers
// ============================================================================

export function registerDrmHandlers(): void {
  // Import drmService dynamically to avoid circular deps
  const { drmService } = require('../services/drm.service')

  ipcMain.handle('drm:detect', async (_event, appId: string) => {
    try {
      return await drmService.detect(appId)
    } catch (err) {
      logger.error(`[DRM IPC] detect failed: ${err instanceof Error ? err.message : 'unknown'}`, 'drm')
      return {
        detected: false,
        drmTypes: [],
        platformSupported: process.platform === 'win32',
      }
    }
  })

  ipcMain.handle('drm:remove', async (_event, appId: string) => removeGameDrm(appId))

  ipcMain.handle('drm:remove-with-plugin', async (_event, appId: string, pluginId: string) => {
    try {
      return await drmService.removeWithPlugin(appId, pluginId)
    } catch (err) {
      logger.error(`[DRM IPC] removeWithPlugin failed: ${err instanceof Error ? err.message : 'unknown'}`, 'drm')
      return {
        success: false,
        message: err instanceof Error ? err.message : 'Removal failed',
        hadDrm: false,
      }
    }
  })

  ipcMain.handle('drm:status', async (_event, appId: string): Promise<DrmStatusResult> => {
    return checkDrmStatus(appId)
  })

  ipcMain.handle('drm:plugins', async (_event) => {
    try {
      return drmService.getAvailablePlugins()
    } catch (err) {
      logger.warn(`[DRM IPC] plugins listing failed: ${err instanceof Error ? err.message : 'unknown'}`, 'drm')
      return []
    }
  })
}
