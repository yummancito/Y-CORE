import { ipcMain } from 'electron'
import path from 'path'
import fs from 'fs'
import { spawn } from 'child_process'
import { logger } from '../logger'
import { getSteamPath, getSteamAppsPath, getSteamLibraryFolders, parseVdf } from './steam-helpers'

interface DrmRemoveResult {
  success: boolean
  message: string
  hadDrm: boolean
  backupPath?: string
  exePath?: string
}

interface DrmStatusResult {
  status: 'no-drm' | 'drm-removed' | 'drm-present' | 'not-found'
  exePath?: string
  backupPath?: string
  message: string
}

function findGameExecutable(installDir: string): string | null {
  const folders = getSteamLibraryFolders()
  const priorityPatterns = [
    /-Win64-Shipping\.exe$/i,
    /-Win32-Shipping\.exe$/i,
    /Binaries[\\/]+Win64[\\/]+.*\.exe$/i,
    /Binaries[\\/]+Win32[\\/]+.*\.exe$/i,
  ]
  const excludeNames = new Set([
    'steam_api64.dll', 'steam_api.dll', 'steamclient64.dll',
    'crashpad_handler.exe', 'crashpad_compressor.exe',
    'steamerrorreporter.exe', 'scriptingdictionary.exe',
  ])

  let bestMatch: string | null = null
  let bestPriority = -1

  const scanDir = (dir: string, depth: number) => {
    if (depth > 4) return
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch { return }
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
        } catch { continue }

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

function runSteamless(exePath: string, steamlessDir: string): Promise<{ success: boolean; output: string; hadDrm: boolean }> {
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
      // Only detect DRM from actual stub detection, not plugin names
      // Plugin lines look like: "Loaded plugin: SteamStub Variant X Unpacker"
      if (/stub\s+(detected|found)/i.test(text) ||
          /unpacking\s+(file|stub)/i.test(text) ||
          /File is packed with SteamStub/i.test(text) ||
          /Successfully unpacked file/i.test(text)) {
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
      logger.info(`[DRM Remover] Steamless full output:\n${output}`, 'drm')
      const success = code === 0 && /unpacked|File unpacked/i.test(output)
      resolve({ success, output, hadDrm })
    })

    proc.on('error', (err) => {
      clearTimeout(timeout)
      resolve({ success: false, output: err.message, hadDrm })
    })
  })
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

export function registerDrmHandlers(): void {
  ipcMain.handle('drm:remove', async (_event, appId: string): Promise<DrmRemoveResult> => {
    const steamPath = getSteamPath()
    if (!steamPath) {
      return { success: false, message: 'Steam installation not found', hadDrm: false }
    }

    const installDir = getGameInstallDir(appId)
    if (!installDir) {
      return { success: false, message: `No appmanifest found for AppId ${appId}`, hadDrm: false }
    }

    const exePath = findGameExecutable(installDir)
    if (!exePath) {
      return { success: false, message: `No game executable found in ${installDir}`, hadDrm: false }
    }

    const backupPath = exePath + '.bak'

    // Check if already removed
    if (fs.existsSync(backupPath)) {
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
      return { success: false, message: 'Steamless not installed. Reinstall hook DLLs first.', hadDrm: false }
    }

    logger.info(`[DRM Remover] Running Steamless on ${exePath}`, 'drm')

    // Backup original exe
    try {
      fs.copyFileSync(exePath, backupPath)
    } catch (err: any) {
      return { success: false, message: `Failed to backup exe: ${err.message}`, hadDrm: false }
    }

    const result = await runSteamless(exePath, steamlessDir)
    logger.info(`[DRM Remover] Steamless result: success=${result.success}, hadDrm=${result.hadDrm}`, 'drm')

    if (!result.hadDrm) {
      // No DRM found, remove the backup
      try { fs.unlinkSync(backupPath) } catch {}
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
        try { fs.unlinkSync(backupPath) } catch {}
        return {
          success: false,
          message: 'Steamless could not unpack this file. It may not have SteamStub DRM or uses an unsupported variant.',
          hadDrm: false,
          exePath,
        }
      }
      // Restore from backup
      try { fs.copyFileSync(backupPath, exePath); fs.unlinkSync(backupPath) } catch {}
      return {
        success: false,
        message: `Steamless failed: ${result.output.substring(0, 200)}`,
        hadDrm: true,
        exePath,
      }
    }

    // Steamless outputs the unpacked file as <name>.exe.unpacked.exe in the same dir
    const unpackedPath = exePath.replace(/\.exe$/i, '.exe.unpacked.exe')
    if (!fs.existsSync(unpackedPath)) {
      // Some Steamless versions replace in-place
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
    } catch (err: any) {
      // Restore from backup
      try { fs.copyFileSync(backupPath, exePath) } catch {}
      return {
        success: false,
        message: `Failed to replace exe: ${err.message}`,
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
  })

  ipcMain.handle('drm:status', async (_event, appId: string): Promise<DrmStatusResult> => {
    const installDir = getGameInstallDir(appId)
    if (!installDir) {
      return { status: 'not-found', message: `No appmanifest found for AppId ${appId}` }
    }

    const exePath = findGameExecutable(installDir)
    if (!exePath) {
      return { status: 'not-found', message: `No game executable found in ${installDir}` }
    }

    const backupPath = exePath + '.bak'
    if (fs.existsSync(backupPath)) {
      return { status: 'drm-removed', exePath, backupPath, message: 'DRM already removed' }
    }

    // Check for .exe.unpacked.exe (Steamless output still present)
    const unpackedPath = exePath.replace(/\.exe$/i, '.exe.unpacked.exe')
    if (fs.existsSync(unpackedPath)) {
      return { status: 'drm-present', exePath, message: 'Unpacked exe detected — DRM removal may be in progress' }
    }

    return { status: 'drm-present', exePath, message: 'DRM status unknown — run removal to check' }
  })
}
