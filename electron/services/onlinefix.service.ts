// ============================================================================
// electron/services/onlinefix.service.ts — Backend OnlineFixService
// Full implementation using shared helpers from modules/onlinefix and modules/steam-helpers.
// ============================================================================

import { app } from 'electron'
import { execSync } from 'child_process'
import path from 'path'
import fs from 'fs'
import { logger } from '../logger'
import { invalidateGamesCache } from '../modules/steam-ipc'
import {
  isValidAppId,
  getSteamAppsPath,
  getSteamLibraryFolders,
  parseVdf,
} from '../modules/steam-helpers'

/** Reusable helpers extracted from modules/onlinefix for service use. */
function findDumpbin(): string | null {
  const roots = [
    process.env['ProgramFiles'] || 'C:\\Program Files',
    process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)',
  ]
  const editions = ['BuildTools', 'Community', 'Professional', 'Enterprise']
  const years = ['2022', '2019', '2025']
  for (const root of roots) {
    for (const year of years) {
      for (const edition of editions) {
        const msvcRoot = path.join(root, 'Microsoft Visual Studio', year, edition, 'VC', 'Tools', 'MSVC')
        let versions: string[] = []
        try { versions = fs.readdirSync(msvcRoot).sort().reverse() } catch { continue }
        for (const ver of versions) {
          const candidate = path.join(msvcRoot, ver, 'bin', 'Hostx64', 'x64', 'dumpbin.exe')
          if (fs.existsSync(candidate)) return candidate
        }
      }
    }
  }
  return null
}

function findSteamApiDlls(gameDir: string): { dll64: string | null; dll32: string | null } {
  let dll64: string | null = null
  let dll32: string | null = null
  const root64 = path.join(gameDir, 'steam_api64.dll')
  const root32 = path.join(gameDir, 'steam_api.dll')
  if (fs.existsSync(root64)) dll64 = root64
  if (fs.existsSync(root32)) dll32 = root32
  if (!dll64 || !dll32) {
    const search = (dir: string, depth: number) => {
      if (depth > 4 || (dll64 && dll32)) return
      let entries: fs.Dirent[] = []
      try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
      for (const e of entries) {
        if (e.name === '_o.dll' || e.name.endsWith('_o.dll')) continue
        const fp = path.join(dir, e.name)
        if (e.isDirectory()) { search(fp, depth + 1) }
        else if (e.isFile()) {
          const l = e.name.toLowerCase()
          if (l === 'steam_api64.dll' && !dll64) dll64 = fp
          if (l === 'steam_api.dll' && !dll32) dll32 = fp
        }
      }
    }
    search(gameDir, 0)
  }
  return { dll64, dll32 }
}

function findOriginalDlls(gameDir: string): { orig64: string | null; orig32: string | null } {
  let orig64: string | null = null
  let orig32: string | null = null
  const root64 = path.join(gameDir, 'steam_api64_o.dll')
  const root32 = path.join(gameDir, 'steam_api_o.dll')
  if (fs.existsSync(root64)) orig64 = root64
  if (fs.existsSync(root32)) orig32 = root32
  if (!orig64 || !orig32) {
    const search = (dir: string, depth: number) => {
      if (depth > 4 || (orig64 && orig32)) return
      let entries: fs.Dirent[] = []
      try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
      for (const e of entries) {
        const fp = path.join(dir, e.name)
        if (e.isDirectory()) { search(fp, depth + 1) }
        else if (e.isFile()) {
          const l = e.name.toLowerCase()
          if (l === 'steam_api64_o.dll' && !orig64) orig64 = fp
          if (l === 'steam_api_o.dll' && !orig32) orig32 = fp
        }
      }
    }
    search(gameDir, 0)
  }
  return { orig64, orig32 }
}

function findConfigJson(gameDir: string): string | null {
  const root = path.join(gameDir, 'ycore_online.json')
  if (fs.existsSync(root)) return root
  let found: string | null = null
  const search = (dir: string, depth: number) => {
    if (depth > 4 || found) return
    let entries: fs.Dirent[] = []
    try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const e of entries) {
      const fp = path.join(dir, e.name)
      if (e.isDirectory()) { search(fp, depth + 1) }
      else if (e.name === 'ycore_online.json') found = fp
    }
  }
  search(gameDir, 0)
  return found
}

function readAcfLaunchOptions(acfPath: string): string {
  try {
    const content = fs.readFileSync(acfPath, 'utf-8')
    const m = content.match(/"LaunchOptions"\s+"([^"]*)"/)
    return m ? m[1] : ''
  } catch { return '' }
}

function writeAcfLaunchOptions(acfPath: string, launchOptions: string): boolean {
  try {
    let content = fs.readFileSync(acfPath, 'utf-8')
    if (launchOptions) {
      if (/"LaunchOptions"\s+"[^"]*"/.test(content)) {
        content = content.replace(/"LaunchOptions"\s+"[^"]*"/, `"LaunchOptions"\t\t"${launchOptions}"`)
      } else if (/"UserConfig"\s*\{/.test(content)) {
        content = content.replace(/"UserConfig"\s*\{/, `"UserConfig"\n\t{\n\t\t"LaunchOptions"\t\t"${launchOptions}"`)
      } else {
        content = content.replace(/\n\}\s*$/, `\n\t"UserConfig"\n\t{\n\t\t"LaunchOptions"\t\t"${launchOptions}"\n\t}\n}`)
      }
    } else {
      content = content.replace(/\s*"LaunchOptions"\s+"[^"]*"/, '')
    }
    fs.writeFileSync(acfPath, content, 'utf-8')
    return true
  } catch (err: any) {
    logger.error(`Failed to write LaunchOptions: ${err.message}`, 'onlinefix')
    return false
  }
}

function getAcfAndDir(appId: string): { acfPath: string; installDir: string | null; steamAppsPath: string | null } {
  const steamAppsPath = getSteamAppsPath()
  if (!steamAppsPath) return { acfPath: '', installDir: null, steamAppsPath: null }
  const acfPath = path.join(steamAppsPath, `appmanifest_${appId}.acf`)
  if (!fs.existsSync(acfPath)) return { acfPath, installDir: null, steamAppsPath }
  try {
    const parsed = parseVdf(fs.readFileSync(acfPath, 'utf-8'))
    return { acfPath, installDir: parsed['AppState']?.['installdir'] || null, steamAppsPath }
  } catch { return { acfPath, installDir: null, steamAppsPath } }
}

function findGameDir(installDir: string): string | null {
  for (const folder of getSteamLibraryFolders()) {
    const candidate = path.join(folder, 'common', installDir)
    if (fs.existsSync(candidate)) return candidate
  }
  return null
}

export const onlinefixService = {
  async enable(appId: string) {
    if (!isValidAppId(appId)) return { success: false, error: 'Invalid AppID' }
    const { acfPath, installDir, steamAppsPath } = getAcfAndDir(appId)
    if (!steamAppsPath) return { success: false, error: 'Steam apps directory not found' }
    if (!installDir) return { success: false, error: `appmanifest_${appId}.acf not found` }
    const current = readAcfLaunchOptions(acfPath)
    if (current.includes('-onlinefix')) return { success: true, message: 'Online Fix already enabled' }
    const newOptions = current ? `${current} -onlinefix` : '-onlinefix'
    const ok = writeAcfLaunchOptions(acfPath, newOptions)
    if (ok) { invalidateGamesCache(); return { success: true, launchOptions: newOptions } }
    return { success: false, error: 'Failed to write ACF file' }
  },

  async disable(appId: string) {
    if (!isValidAppId(appId)) return { success: false, error: 'Invalid AppID' }
    const { acfPath, installDir, steamAppsPath } = getAcfAndDir(appId)
    if (!steamAppsPath) return { success: false, error: 'Steam apps directory not found' }
    if (!installDir) return { success: false, error: `appmanifest_${appId}.acf not found` }
    const current = readAcfLaunchOptions(acfPath)
    if (!current.includes('-onlinefix')) return { success: true, message: 'Online Fix not enabled' }
    const newOptions = current.replace(/\s*-onlinefix/g, '').trim()
    const ok = writeAcfLaunchOptions(acfPath, newOptions)
    if (ok) { invalidateGamesCache(); return { success: true, launchOptions: newOptions } }
    return { success: false, error: 'Failed to write ACF file' }
  },

  async status(appId: string) {
    if (!isValidAppId(appId)) return { enabled: false, launchOptions: '' }
    const { acfPath, installDir, steamAppsPath } = getAcfAndDir(appId)
    if (!steamAppsPath || !installDir) return { enabled: false, launchOptions: '' }
    const launchOptions = readAcfLaunchOptions(acfPath)
    return { enabled: launchOptions.includes('-onlinefix'), launchOptions }
  },

  async generate(appId: string) {
    if (!isValidAppId(appId)) return { success: false, error: 'Invalid AppID' }
    const { acfPath, installDir, steamAppsPath } = getAcfAndDir(appId)
    if (!steamAppsPath) return { success: false, error: 'Steam apps directory not found' }
    if (!installDir) return { success: false, error: `appmanifest_${appId}.acf not found` }

    const gameDir = findGameDir(installDir)
    if (!gameDir) return { success: false, error: `Game directory not found: ${installDir}` }

    const { dll64: dll64Path, dll32: dll32Path } = findSteamApiDlls(gameDir)
    const has64 = !!dll64Path; const has32 = !!dll32Path
    if (!has64 && !has32) return { success: false, error: 'No steam_api(64).dll found. Game may not use Steam API.' }

    const resourcesPath = app.isPackaged
      ? path.join(process.resourcesPath, 'native')
      : path.join(app.getAppPath(), 'resources', 'native')
    const goldbergDll64 = path.join(resourcesPath, 'goldberg_steam_api64.dll')
    const goldbergDll32 = path.join(resourcesPath, 'goldberg_steam_api.dll')

    const backupDir = path.join(app.getPath('userData'), 'backups', appId)
    fs.mkdirSync(backupDir, { recursive: true })
    const results: string[] = []

    if (has64 && dll64Path) {
      const dllDir = path.dirname(dll64Path)
      const backupDll64 = path.join(backupDir, 'steam_api64.dll.bak')
      const renamedOriginal64 = path.join(dllDir, 'steam_api64_o.dll')
      if (!fs.existsSync(backupDll64)) { fs.copyFileSync(dll64Path, backupDll64); results.push('Backed up steam_api64.dll') }
      if (!fs.existsSync(renamedOriginal64)) { fs.renameSync(dll64Path, renamedOriginal64); results.push('Renamed steam_api64.dll -> steam_api64_o.dll') }
      if (fs.existsSync(goldbergDll64)) { fs.copyFileSync(goldbergDll64, dll64Path); results.push('Installed Goldberg steam_api64.dll') }
      else { logger.warn(`Goldberg 64-bit DLL not found at ${goldbergDll64}`, 'onlinefix') }
    }

    if (has32 && dll32Path) {
      const dllDir = path.dirname(dll32Path)
      const backupDll32 = path.join(backupDir, 'steam_api.dll.bak')
      const renamedOriginal32 = path.join(dllDir, 'steam_api_o.dll')
      if (!fs.existsSync(backupDll32)) { fs.copyFileSync(dll32Path, backupDll32); results.push('Backed up steam_api.dll') }
      if (!fs.existsSync(renamedOriginal32)) { fs.renameSync(dll32Path, renamedOriginal32); results.push('Renamed steam_api.dll -> steam_api_o.dll') }
      if (fs.existsSync(goldbergDll32)) { fs.copyFileSync(goldbergDll32, dll32Path); results.push('Installed Goldberg steam_api.dll') }
      else { logger.warn(`Goldberg 32-bit DLL not found at ${goldbergDll32}`, 'onlinefix') }
    }

    const configDir = dll64Path ? path.dirname(dll64Path) : (dll32Path ? path.dirname(dll32Path) : gameDir)
    const steamSettingsDir = path.join(configDir, 'steam_settings')
    fs.mkdirSync(steamSettingsDir, { recursive: true })
    fs.writeFileSync(path.join(steamSettingsDir, 'steam_appid.txt'), '480\n', 'utf-8')
    results.push('Created steam_settings/steam_appid.txt (AppID 480)')
    fs.writeFileSync(path.join(gameDir, 'steam_appid.txt'), '480\n', 'utf-8')
    results.push('Created steam_appid.txt (AppID 480)')

    // Generate steam_interfaces.txt from original DLL
    const originalDllPath = dll64Path ? path.join(configDir, 'steam_api64_o.dll') : path.join(configDir, 'steam_api_o.dll')
    if (fs.existsSync(originalDllPath)) {
      try {
        const dumpbin = findDumpbin()
        if (dumpbin) {
          const output = execSync(`"${dumpbin}" /exports "${originalDllPath}"`, { encoding: 'utf-8', timeout: 15000 })
          const interfaces = output.split('\n').map((l: string) => l.trim())
            .filter((l: string) => /^SteamAPI_I\w+/.test(l) || /^SteamInternal_\w+/.test(l) || /^Steam_\w+/.test(l))
            .map((l: string) => l.split(' ').pop() || '').filter((n: string) => n)
          if (interfaces.length > 0) {
            fs.writeFileSync(path.join(steamSettingsDir, 'steam_interfaces.txt'), interfaces.join('\n') + '\n', 'utf-8')
            results.push(`Generated steam_interfaces.txt (${interfaces.length} interfaces)`)
          }
        }
      } catch (err: any) { logger.warn(`Failed to generate steam_interfaces.txt: ${err.message}`, 'onlinefix') }
    }

    // Config + manifest
    fs.writeFileSync(path.join(configDir, 'ycore_online.json'), JSON.stringify({
      enabled: true, originalAppId: parseInt(appId, 10), spoofAppId: 480,
      steamId: 0, language: 'english', generatedAt: new Date().toISOString(), ycoreVersion: app.getVersion(),
    }, null, 2), 'utf-8')
    results.push('Generated ycore_online.json')

    const current = readAcfLaunchOptions(acfPath)
    if (!current.includes('-onlinefix')) {
      const newOptions = current ? `${current} -onlinefix` : '-onlinefix'
      writeAcfLaunchOptions(acfPath, newOptions)
      results.push('Added -onlinefix launch option')
    }
    invalidateGamesCache()
    return { success: true, gameDir, results, has64, has32 }
  },

  async remove(appId: string) {
    if (!isValidAppId(appId)) return { success: false, error: 'Invalid AppID' }
    const { acfPath, installDir, steamAppsPath } = getAcfAndDir(appId)
    if (!steamAppsPath) return { success: false, error: 'Steam apps directory not found' }
    if (!installDir) return { success: false, error: 'Install directory not found' }

    const gameDir = findGameDir(installDir)
    if (!gameDir) return { success: false, error: `Game directory not found: ${installDir}` }

    const results: string[] = []
    const { orig64, orig32 } = findOriginalDlls(gameDir)
    if (orig64) {
      const dllDir = path.dirname(orig64)
      const dll64Path = path.join(dllDir, 'steam_api64.dll')
      if (fs.existsSync(dll64Path)) fs.unlinkSync(dll64Path)
      fs.renameSync(orig64, dll64Path)
      results.push('Restored steam_api64.dll')
    }
    if (orig32) {
      const dllDir = path.dirname(orig32)
      const dll32Path = path.join(dllDir, 'steam_api.dll')
      if (fs.existsSync(dll32Path)) fs.unlinkSync(dll32Path)
      fs.renameSync(orig32, dll32Path)
      results.push('Restored steam_api.dll')
    }

    const configPath = findConfigJson(gameDir)
    if (configPath) { fs.unlinkSync(configPath); results.push('Removed ycore_online.json') }
    const appIdPath = path.join(gameDir, 'steam_appid.txt')
    if (fs.existsSync(appIdPath)) { fs.unlinkSync(appIdPath); results.push('Removed steam_appid.txt') }

    const { dll64: dll64Remove } = findSteamApiDlls(gameDir)
    const settingsDir = path.join(dll64Remove ? path.dirname(dll64Remove) : gameDir, 'steam_settings')
    if (fs.existsSync(settingsDir)) { fs.rmSync(settingsDir, { recursive: true, force: true }); results.push('Removed steam_settings/') }

    // Remove BepInEx mods if present
    const bepInExDir = path.join(gameDir, 'BepInEx')
    if (fs.existsSync(bepInExDir)) { fs.rmSync(bepInExDir, { recursive: true, force: true }); results.push('Removed BepInEx') }
    const doorstopPath = path.join(gameDir, 'doorstop_config.ini')
    if (fs.existsSync(doorstopPath)) { fs.unlinkSync(doorstopPath); results.push('Removed doorstop_config.ini') }
    const winhttpPath = path.join(gameDir, 'winhttp.dll')
    if (fs.existsSync(winhttpPath)) { fs.unlinkSync(winhttpPath); results.push('Removed winhttp.dll') }

    const current = readAcfLaunchOptions(acfPath)
    if (current.includes('-onlinefix')) {
      writeAcfLaunchOptions(acfPath, current.replace(/\s*-onlinefix/g, '').trim())
      results.push('Removed -onlinefix launch option')
    }
    invalidateGamesCache()
    return { success: true, results }
  },

  async detect(appId: string) {
    if (!isValidAppId(appId)) return { hasSteamApi: false, is64Bit: false, hasFix: false, hasConfig: false }
    const { installDir, steamAppsPath } = getAcfAndDir(appId)
    if (!steamAppsPath || !installDir) return { hasSteamApi: false, is64Bit: false, hasFix: false, hasConfig: false }
    const gameDir = findGameDir(installDir)
    if (!gameDir) return { hasSteamApi: false, is64Bit: false, hasFix: false, hasConfig: false }
    const { dll64, dll32 } = findSteamApiDlls(gameDir)
    const { orig64, orig32 } = findOriginalDlls(gameDir)
    return { hasSteamApi: !!dll64 || !!dll32, is64Bit: !!dll64, hasFix: !!orig64 || !!orig32, hasConfig: !!findConfigJson(gameDir), gameDir }
  },
}
