import { ipcMain, app } from 'electron'
import fs from 'fs'
import path from 'path'
import https from 'https'
import { logger } from '../logger'
import { isValidAppId, getSteamAppsPath, getSteamLibraryFolders, parseVdf } from './steam-helpers'

// Locate dumpbin.exe across any installed Visual Studio edition/version instead
// of relying on a single hardcoded path (which broke on machines with a
// different VS edition or MSVC toolset version). Returns null if none is found.
let _dumpbinPathCache: string | null | undefined
function findDumpbin(): string | null {
  if (_dumpbinPathCache !== undefined) return _dumpbinPathCache

  const roots = [
    process.env['ProgramFiles'] || 'C:\\Program Files',
    process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)',
  ]
  const editions = ['BuildTools', 'Community', 'Professional', 'Enterprise']
  const years = ['2022', '2019']

  for (const root of roots) {
    for (const year of years) {
      for (const edition of editions) {
        const msvcRoot = path.join(root, 'Microsoft Visual Studio', year, edition, 'VC', 'Tools', 'MSVC')
        let versions: string[] = []
        try {
          versions = fs.readdirSync(msvcRoot).sort().reverse() // newest toolset first
        } catch {
          continue
        }
        for (const ver of versions) {
          const candidate = path.join(msvcRoot, ver, 'bin', 'Hostx64', 'x64', 'dumpbin.exe')
          if (fs.existsSync(candidate)) {
            _dumpbinPathCache = candidate
            return candidate
          }
        }
      }
    }
  }

  _dumpbinPathCache = null
  return null
}

function findSteamApiDlls(gameDir: string): { dll64: string | null; dll32: string | null } {
  let dll64: string | null = null
  let dll32: string | null = null

  // Check root first
  const root64 = path.join(gameDir, 'steam_api64.dll')
  const root32 = path.join(gameDir, 'steam_api.dll')
  if (fs.existsSync(root64)) dll64 = root64
  if (fs.existsSync(root32)) dll32 = root32

  // If not in root, search subdirectories (Unity games put them in *_Data/Plugins/x86_64/)
  if (!dll64 || !dll32) {
    const searchDir = (dir: string, depth: number) => {
      if (depth > 4 || (dll64 && dll32)) return
      let entries: fs.Dirent[] = []
      try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
      for (const entry of entries) {
        if (entry.name === '_o.dll' || entry.name.endsWith('_o.dll')) continue
        const fullPath = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          searchDir(fullPath, depth + 1)
        } else if (entry.isFile()) {
          const lower = entry.name.toLowerCase()
          if (lower === 'steam_api64.dll' && !dll64) dll64 = fullPath
          if (lower === 'steam_api.dll' && !dll32) dll32 = fullPath
        }
      }
    }
    searchDir(gameDir, 0)
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
    const searchDir = (dir: string, depth: number) => {
      if (depth > 4 || (orig64 && orig32)) return
      let entries: fs.Dirent[] = []
      try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          searchDir(fullPath, depth + 1)
        } else if (entry.isFile()) {
          const lower = entry.name.toLowerCase()
          if (lower === 'steam_api64_o.dll' && !orig64) orig64 = fullPath
          if (lower === 'steam_api_o.dll' && !orig32) orig32 = fullPath
        }
      }
    }
    searchDir(gameDir, 0)
  }

  return { orig64, orig32 }
}

function findConfigJson(gameDir: string): string | null {
  const root = path.join(gameDir, 'ycore_online.json')
  if (fs.existsSync(root)) return root

  // Also search subdirectories
  let found: string | null = null
  const searchDir = (dir: string, depth: number) => {
    if (depth > 4 || found) return
    let entries: fs.Dirent[] = []
    try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        searchDir(fullPath, depth + 1)
      } else if (entry.name === 'ycore_online.json') {
        found = fullPath
      }
    }
  }
  searchDir(gameDir, 0)
  return found
}

function readAcfLaunchOptions(acfPath: string): string {
  try {
    const content = fs.readFileSync(acfPath, 'utf-8')
    const match = content.match(/"LaunchOptions"\s+"([^"]*)"/)
    return match ? match[1] : ''
  } catch {
    return ''
  }
}

function writeAcfLaunchOptions(acfPath: string, launchOptions: string): boolean {
  try {
    let content = fs.readFileSync(acfPath, 'utf-8')

    if (launchOptions) {
      if (/"LaunchOptions"\s+"[^"]*"/.test(content)) {
        content = content.replace(/"LaunchOptions"\s+"[^"]*"/, `"LaunchOptions"\t\t"${launchOptions}"`)
      } else if (/"UserConfig"\s*\{/.test(content)) {
        content = content.replace(
          /"UserConfig"\s*\{/,
          `"UserConfig"\n\t{\n\t\t"LaunchOptions"\t\t"${launchOptions}"`
        )
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

// Games that require BepInEx patches in addition to the Steam proxy DLL.
// These games use Azure CloudAPI or similar online authentication that must be bypassed.
const BEPINEX_GAMES: Record<string, { mods: { url: string; name: string }[] }> = {
  '3527290': {
    // PEAK - needs CloudAPI bypass + Photon offline mode
    mods: [
      {
        name: 'BepInExPack_PEAK',
        url: 'https://thunderstore.io/package/download/BepInEx/BepInExPack_PEAK/5.4.75301/',
      },
      {
        name: 'NekogiriPeakOffline',
        url: 'https://thunderstore.io/package/download/kirigiri/NekogiriPeakOffline/1.0.1/',
      },
    ],
  },
}

function downloadFile(url: string, destPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath)
    // Idle timeout: if the server sends no data for 60s, abort so the app can't
    // hang forever on a stalled Thunderstore/CDN connection.
    const IDLE_TIMEOUT_MS = 60000
    const request = (reqUrl: string) => {
      const req = https.get(reqUrl, (response) => {
        // Follow redirects
        if (response.statusCode === 302 || response.statusCode === 301) {
          response.destroy()
          const newUrl = response.headers.location
          if (newUrl) {
            request(newUrl)
            return
          }
        }
        if (response.statusCode !== 200) {
          file.close()
          fs.unlinkSync(destPath)
          reject(new Error(`HTTP ${response.statusCode}`))
          return
        }
        response.pipe(file)
        file.on('finish', () => {
          file.close()
          resolve()
        })
      })
      req.setTimeout(IDLE_TIMEOUT_MS, () => {
        req.destroy(new Error(`Download timed out after ${IDLE_TIMEOUT_MS / 1000}s`))
      })
      req.on('error', (err) => {
        file.close()
        if (fs.existsSync(destPath)) fs.unlinkSync(destPath)
        reject(err)
      })
    }
    request(url)
  })
}

// Sanity-check a downloaded file before we trust it enough to extract into a
// game folder. We can't verify a publisher signature (Thunderstore doesn't
// provide per-file hashes here), but we can reject anything that isn't a real,
// non-trivial ZIP — e.g. an HTML error page served with a 200, or a truncated
// download — which is the most likely failure and the most dangerous to extract.
function validateZipFile(zipPath: string): void {
  const MIN_ZIP_BYTES = 1024 // 1 KB — a real BepInEx pack is far larger
  let stat: fs.Stats
  try {
    stat = fs.statSync(zipPath)
  } catch {
    throw new Error('Downloaded file is missing')
  }
  if (stat.size < MIN_ZIP_BYTES) {
    throw new Error(`Downloaded file is too small (${stat.size} bytes) — likely not a valid archive`)
  }
  // ZIP local-file-header magic: 'PK\x03\x04'
  const fd = fs.openSync(zipPath, 'r')
  try {
    const header = Buffer.alloc(4)
    fs.readSync(fd, header, 0, 4, 0)
    if (!(header[0] === 0x50 && header[1] === 0x4b && header[2] === 0x03 && header[3] === 0x04)) {
      throw new Error('Downloaded file is not a valid ZIP archive (bad magic bytes)')
    }
  } finally {
    fs.closeSync(fd)
  }
}

async function extractZip(zipPath: string, destDir: string): Promise<void> {
  // Use Electron's built-in or system unzip
  const { execSync } = require('child_process')
  const tempDir = path.join(destDir, '.ycore_temp_extract')
  if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true })
  fs.mkdirSync(tempDir, { recursive: true })

  try {
    // Try PowerShell Expand-Archive
    execSync(`powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${tempDir}' -Force"`, {
      timeout: 30000,
    })
  } catch {
    throw new Error('Failed to extract zip')
  }

  // Move contents from temp to dest, handling nested structure
  // Thunderstore zips typically have a root folder with BepInEx/ inside
  const entries = fs.readdirSync(tempDir)
  for (const entry of entries) {
    const srcPath = path.join(tempDir, entry)
    const destPath = path.join(destDir, entry)
    if (fs.existsSync(destPath)) {
      // Merge directories
      if (fs.statSync(srcPath).isDirectory()) {
        const subEntries = fs.readdirSync(srcPath)
        for (const subEntry of subEntries) {
          const subSrc = path.join(srcPath, subEntry)
          const subDest = path.join(destPath, subEntry)
          if (fs.existsSync(subDest)) {
            fs.rmSync(subDest, { recursive: true, force: true })
          }
          fs.renameSync(subSrc, subDest)
        }
      } else {
        fs.rmSync(destPath, { force: true })
        fs.renameSync(srcPath, destPath)
      }
    } else {
      fs.renameSync(srcPath, destPath)
    }
  }

  fs.rmSync(tempDir, { recursive: true, force: true })
}

async function installBepInExMods(gameDir: string, appId: string): Promise<string[]> {
  const gameConfig = BEPINEX_GAMES[appId]
  if (!gameConfig) return []

  const results: string[] = []
  const tempDir = path.join(gameDir, '.ycore_mods_temp')
  if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true })
  fs.mkdirSync(tempDir, { recursive: true })

  for (const mod of gameConfig.mods) {
    const zipPath = path.join(tempDir, `${mod.name}.zip`)
    logger.info(`Downloading ${mod.name} from Thunderstore...`, 'onlinefix')
    try {
      await downloadFile(mod.url, zipPath)
      results.push(`Downloaded ${mod.name}`)
    } catch (err: any) {
      logger.error(`Failed to download ${mod.name}: ${err.message}`, 'onlinefix')
      results.push(`Failed to download ${mod.name}`)
      continue
    }

    logger.info(`Extracting ${mod.name}...`, 'onlinefix')
    try {
      validateZipFile(zipPath)
      await extractZip(zipPath, gameDir)
      results.push(`Installed ${mod.name}`)
    } catch (err: any) {
      logger.error(`Failed to extract ${mod.name}: ${err.message}`, 'onlinefix')
      results.push(`Failed to extract ${mod.name}`)
    }
  }

  // Cleanup
  fs.rmSync(tempDir, { recursive: true, force: true })

  return results
}

export function registerOnlineFixHandlers(invalidateGamesCache: () => void) {
  ipcMain.handle('onlinefix:enable', async (_event, data: { appId: string }) => {
    const { appId } = data
    if (!isValidAppId(appId)) {
      return { success: false, error: 'Invalid AppID' }
    }

    const steamAppsPath = getSteamAppsPath()
    if (!steamAppsPath) {
      return { success: false, error: 'Steam apps directory not found' }
    }

    const acfPath = path.join(steamAppsPath, `appmanifest_${appId}.acf`)
    if (!fs.existsSync(acfPath)) {
      return { success: false, error: `appmanifest_${appId}.acf not found` }
    }

    const current = readAcfLaunchOptions(acfPath)
    if (current.includes('-onlinefix')) {
      return { success: true, message: 'Online Fix already enabled' }
    }

    const newOptions = current ? `${current} -onlinefix` : '-onlinefix'
    const ok = writeAcfLaunchOptions(acfPath, newOptions)
    if (ok) {
      invalidateGamesCache()
      logger.info(`OnlineFix enabled for ${appId}`, 'onlinefix')
      return { success: true, launchOptions: newOptions }
    }
    return { success: false, error: 'Failed to write ACF file' }
  })

  ipcMain.handle('onlinefix:disable', async (_event, data: { appId: string }) => {
    const { appId } = data
    if (!isValidAppId(appId)) {
      return { success: false, error: 'Invalid AppID' }
    }

    const steamAppsPath = getSteamAppsPath()
    if (!steamAppsPath) {
      return { success: false, error: 'Steam apps directory not found' }
    }

    const acfPath = path.join(steamAppsPath, `appmanifest_${appId}.acf`)
    if (!fs.existsSync(acfPath)) {
      return { success: false, error: `appmanifest_${appId}.acf not found` }
    }

    const current = readAcfLaunchOptions(acfPath)
    if (!current.includes('-onlinefix')) {
      return { success: true, message: 'Online Fix not enabled' }
    }

    const newOptions = current.replace(/\s*-onlinefix/g, '').trim()
    const ok = writeAcfLaunchOptions(acfPath, newOptions)
    if (ok) {
      invalidateGamesCache()
      logger.info(`OnlineFix disabled for ${appId}`, 'onlinefix')
      return { success: true, launchOptions: newOptions }
    }
    return { success: false, error: 'Failed to write ACF file' }
  })

  ipcMain.handle('onlinefix:status', async (_event, data: { appId: string }) => {
    const { appId } = data
    if (!isValidAppId(appId)) {
      return { enabled: false, launchOptions: '' }
    }

    const steamAppsPath = getSteamAppsPath()
    if (!steamAppsPath) {
      return { enabled: false, launchOptions: '' }
    }

    const acfPath = path.join(steamAppsPath, `appmanifest_${appId}.acf`)
    if (!fs.existsSync(acfPath)) {
      return { enabled: false, launchOptions: '' }
    }

    const launchOptions = readAcfLaunchOptions(acfPath)
    return {
      enabled: launchOptions.includes('-onlinefix'),
      launchOptions,
    }
  })

  // ─── Y-Core Online: Generate fix ───────────────────────────────
  ipcMain.handle('onlinefix:generate', async (_event, data: { appId: string }) => {
    const { appId } = data
    if (!isValidAppId(appId)) {
      return { success: false, error: 'Invalid AppID' }
    }

    const steamAppsPath = getSteamAppsPath()
    if (!steamAppsPath) {
      return { success: false, error: 'Steam apps directory not found' }
    }

    // Get install dir from ACF
    const acfPath = path.join(steamAppsPath, `appmanifest_${appId}.acf`)
    if (!fs.existsSync(acfPath)) {
      return { success: false, error: `appmanifest_${appId}.acf not found` }
    }

    let installDir: string | null = null
    try {
      const content = fs.readFileSync(acfPath, 'utf-8')
      const parsed = parseVdf(content)
      installDir = parsed['AppState']?.['installdir'] || null
    } catch {
      return { success: false, error: 'Failed to parse ACF file' }
    }

    if (!installDir) {
      return { success: false, error: 'Install directory not found in ACF' }
    }

    // Find the game folder
    const folders = getSteamLibraryFolders()
    let gameDir: string | null = null
    for (const folder of folders) {
      const candidate = path.join(folder, 'common', installDir)
      if (fs.existsSync(candidate)) {
        gameDir = candidate
        break
      }
    }

    if (!gameDir) {
      return { success: false, error: `Game directory not found: ${installDir}` }
    }

    // Detect architecture - search recursively for steam_api DLLs
    const { dll64: dll64Path, dll32: dll32Path } = findSteamApiDlls(gameDir)
    const has64 = !!dll64Path
    const has32 = !!dll32Path

    if (!has64 && !has32) {
      return { success: false, error: 'No steam_api(64).dll found in game directory. Game may not use Steam API.' }
    }

    // Get native DLLs from resources
    // Use Goldberg Emulator (gbe_fork) DLLs instead of custom proxy
    const resourcesPath = app.isPackaged
      ? path.join(process.resourcesPath, 'native')
      : path.join(app.getAppPath(), 'resources', 'native')

    const goldbergDll64 = path.join(resourcesPath, 'goldberg_steam_api64.dll')
    const goldbergDll32 = path.join(resourcesPath, 'goldberg_steam_api.dll')

    // Create backup directory
    const backupDir = path.join(app.getPath('userData'), 'backups', appId)
    fs.mkdirSync(backupDir, { recursive: true })

    const results: string[] = []

    // Process 64-bit DLL
    if (has64 && dll64Path) {
      const dllDir = path.dirname(dll64Path)
      const backupDll64 = path.join(backupDir, 'steam_api64.dll.bak')
      const renamedOriginal64 = path.join(dllDir, 'steam_api64_o.dll')

      // Backup original
      if (!fs.existsSync(backupDll64)) {
        fs.copyFileSync(dll64Path, backupDll64)
        results.push('Backed up steam_api64.dll')
      }

      // Rename original to _o.dll (our DLL will load it)
      if (!fs.existsSync(renamedOriginal64)) {
        fs.renameSync(dll64Path, renamedOriginal64)
        results.push('Renamed steam_api64.dll -> steam_api64_o.dll')
      }

      // Copy Goldberg emulator DLL
      if (fs.existsSync(goldbergDll64)) {
        fs.copyFileSync(goldbergDll64, dll64Path)
        results.push('Installed Goldberg steam_api64.dll')
      } else {
        logger.warn(`Goldberg 64-bit DLL not found at ${goldbergDll64}`, 'onlinefix')
      }
    }

    // Process 32-bit DLL
    if (has32 && dll32Path) {
      const dllDir = path.dirname(dll32Path)
      const backupDll32 = path.join(backupDir, 'steam_api.dll.bak')
      const renamedOriginal32 = path.join(dllDir, 'steam_api_o.dll')

      // Backup original
      if (!fs.existsSync(backupDll32)) {
        fs.copyFileSync(dll32Path, backupDll32)
        results.push('Backed up steam_api.dll')
      }

      // Rename original to _o.dll
      if (!fs.existsSync(renamedOriginal32)) {
        fs.renameSync(dll32Path, renamedOriginal32)
        results.push('Renamed steam_api.dll -> steam_api_o.dll')
      }

      // Copy Goldberg emulator DLL
      if (fs.existsSync(goldbergDll32)) {
        fs.copyFileSync(goldbergDll32, dll32Path)
        results.push('Installed Goldberg steam_api.dll')
      } else {
        logger.warn(`Goldberg 32-bit DLL not found at ${goldbergDll32}`, 'onlinefix')
      }
    }

    // Goldberg Emulator needs a steam_settings directory next to the DLL
    const configDir = dll64Path ? path.dirname(dll64Path) : (dll32Path ? path.dirname(dll32Path) : gameDir)
    const steamSettingsDir = path.join(configDir, 'steam_settings')
    fs.mkdirSync(steamSettingsDir, { recursive: true })

    // steam_appid.txt with spoof AppID 480 (Spacewar)
    fs.writeFileSync(path.join(steamSettingsDir, 'steam_appid.txt'), '480\n', 'utf-8')
    results.push('Created steam_settings/steam_appid.txt (AppID 480)')

    // Also create steam_appid.txt in game root for Steam client detection
    const steamAppIdPath = path.join(gameDir, 'steam_appid.txt')
    fs.writeFileSync(steamAppIdPath, '480\n', 'utf-8')
    results.push('Created steam_appid.txt (AppID 480)')

    // Generate steam_interfaces.txt from the original DLL
    // Goldberg needs this to know which interface versions the game expects
    const originalDllPath = dll64Path ? path.join(configDir, 'steam_api64_o.dll') : path.join(configDir, 'steam_api_o.dll')
    if (fs.existsSync(originalDllPath)) {
      try {
        const { execSync } = require('child_process')
        const dumpbin = findDumpbin()
        if (dumpbin) {
          const output = execSync(`"${dumpbin}" /exports "${originalDllPath}"`, { encoding: 'utf-8', timeout: 15000 })
          const interfaces = output.split('\n')
            .map((l: string) => l.trim())
            .filter((l: string) => /^SteamAPI_I\w+/.test(l) || /^SteamInternal_\w+/.test(l) || /^Steam_\w+/.test(l))
            .map((l: string) => l.split(' ').pop() || '')
            .filter((n: string) => n)
          if (interfaces.length > 0) {
            fs.writeFileSync(path.join(steamSettingsDir, 'steam_interfaces.txt'), interfaces.join('\n') + '\n', 'utf-8')
            results.push(`Generated steam_interfaces.txt (${interfaces.length} interfaces)`)
          }
        }
      } catch (err: any) {
        logger.warn(`Failed to generate steam_interfaces.txt: ${err.message}`, 'onlinefix')
      }
    }

    // Generate ycore_online.json for Y-Core tracking
    const configPath = path.join(configDir, 'ycore_online.json')
    const config = {
      enabled: true,
      originalAppId: parseInt(appId, 10),
      spoofAppId: 480,
      steamId: 0,
      language: 'english',
      generatedAt: new Date().toISOString(),
      ycoreVersion: app.getVersion(),
    }
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8')
    results.push('Generated ycore_online.json')

    // Install BepInEx mods for games that need C# patches (e.g. PEAK needs CloudAPI bypass)
    if (BEPINEX_GAMES[appId]) {
      logger.info(`Installing BepInEx mods for appId ${appId}...`, 'onlinefix')
      const modResults = await installBepInExMods(gameDir, appId)
      results.push(...modResults)
    }

    // Write backup manifest
    const manifestPath = path.join(backupDir, 'manifest.json')
    const manifest = {
      appId,
      installDir,
      gameDir,
      backedUpAt: new Date().toISOString(),
      files: {
        ...(has64 && dll64Path ? { [path.relative(gameDir, dll64Path)]: 'steam_api64.dll.bak' } : {}),
        ...(has32 && dll32Path ? { [path.relative(gameDir, dll32Path)]: 'steam_api.dll.bak' } : {}),
      },
    }
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8')

    // Enable launch option
    const current = readAcfLaunchOptions(acfPath)
    if (!current.includes('-onlinefix')) {
      const newOptions = current ? `${current} -onlinefix` : '-onlinefix'
      writeAcfLaunchOptions(acfPath, newOptions)
      results.push('Added -onlinefix launch option')
    }

    invalidateGamesCache()
    logger.info(`Y-Core Online fix generated for ${appId}: ${results.join(', ')}`, 'onlinefix')
    return { success: true, gameDir, results, has64, has32 }
  })

  // ─── Y-Core Online: Remove fix ────────────────────────────────
  ipcMain.handle('onlinefix:remove', async (_event, data: { appId: string }) => {
    const { appId } = data
    if (!isValidAppId(appId)) {
      return { success: false, error: 'Invalid AppID' }
    }

    const steamAppsPath = getSteamAppsPath()
    if (!steamAppsPath) {
      return { success: false, error: 'Steam apps directory not found' }
    }

    // Get install dir
    const acfPath = path.join(steamAppsPath, `appmanifest_${appId}.acf`)
    if (!fs.existsSync(acfPath)) {
      return { success: false, error: `appmanifest_${appId}.acf not found` }
    }

    let installDir: string | null = null
    try {
      const content = fs.readFileSync(acfPath, 'utf-8')
      const parsed = parseVdf(content)
      installDir = parsed['AppState']?.['installdir'] || null
    } catch {
      return { success: false, error: 'Failed to parse ACF file' }
    }

    if (!installDir) {
      return { success: false, error: 'Install directory not found' }
    }

    const folders = getSteamLibraryFolders()
    let gameDir: string | null = null
    for (const folder of folders) {
      const candidate = path.join(folder, 'common', installDir)
      if (fs.existsSync(candidate)) {
        gameDir = candidate
        break
      }
    }

    if (!gameDir) {
      return { success: false, error: `Game directory not found: ${installDir}` }
    }

    const results: string[] = []

    // Find original DLLs recursively
    const { orig64, orig32 } = findOriginalDlls(gameDir)

    // Restore 64-bit
    if (orig64) {
      const dllDir = path.dirname(orig64)
      const dll64Path = path.join(dllDir, 'steam_api64.dll')
      if (fs.existsSync(dll64Path)) fs.unlinkSync(dll64Path)
      fs.renameSync(orig64, dll64Path)
      results.push('Restored steam_api64.dll')
    }

    // Restore 32-bit
    if (orig32) {
      const dllDir = path.dirname(orig32)
      const dll32Path = path.join(dllDir, 'steam_api.dll')
      if (fs.existsSync(dll32Path)) fs.unlinkSync(dll32Path)
      fs.renameSync(orig32, dll32Path)
      results.push('Restored steam_api.dll')
    }

    // Remove config (search recursively)
    const configPath = findConfigJson(gameDir)
    if (configPath) {
      fs.unlinkSync(configPath)
      results.push('Removed ycore_online.json')
    }

    // Remove steam_appid.txt
    const steamAppIdPath = path.join(gameDir, 'steam_appid.txt')
    if (fs.existsSync(steamAppIdPath)) {
      fs.unlinkSync(steamAppIdPath)
      results.push('Removed steam_appid.txt')
    }

    // Remove steam_settings directory (Goldberg emulator config)
    const { dll64: dll64Remove, dll32: dll32Remove } = findSteamApiDlls(gameDir)
    const configDirRemove = dll64Remove ? path.dirname(dll64Remove) : (dll32Remove ? path.dirname(dll32Remove) : gameDir)
    const steamSettingsDir = path.join(configDirRemove, 'steam_settings')
    if (fs.existsSync(steamSettingsDir)) {
      fs.rmSync(steamSettingsDir, { recursive: true, force: true })
      results.push('Removed steam_settings/')
    }

    // Remove BepInEx mods if this game had them installed
    if (BEPINEX_GAMES[appId]) {
      const bepInExDir = path.join(gameDir, 'BepInEx')
      if (fs.existsSync(bepInExDir)) {
        fs.rmSync(bepInExDir, { recursive: true, force: true })
        results.push('Removed BepInEx')
      }
      const doorstopPath = path.join(gameDir, 'doorstop_config.ini')
      if (fs.existsSync(doorstopPath)) {
        fs.unlinkSync(doorstopPath)
        results.push('Removed doorstop_config.ini')
      }
      const winhttpPath = path.join(gameDir, 'winhttp.dll')
      if (fs.existsSync(winhttpPath)) {
        fs.unlinkSync(winhttpPath)
        results.push('Removed winhttp.dll')
      }
      const dotnetPath = path.join(gameDir, 'dotnet')
      if (fs.existsSync(dotnetPath)) {
        fs.rmSync(dotnetPath, { recursive: true, force: true })
        results.push('Removed dotnet')
      }
    }

    // Remove launch option
    const current = readAcfLaunchOptions(acfPath)
    if (current.includes('-onlinefix')) {
      const newOptions = current.replace(/\s*-onlinefix/g, '').trim()
      writeAcfLaunchOptions(acfPath, newOptions)
      results.push('Removed -onlinefix launch option')
    }

    invalidateGamesCache()
    logger.info(`Y-Core Online fix removed for ${appId}: ${results.join(', ')}`, 'onlinefix')
    return { success: true, results }
  })

  // ─── Y-Core Online: Detect fix status ─────────────────────────
  ipcMain.handle('onlinefix:detect', async (_event, data: { appId: string }) => {
    const { appId } = data
    if (!isValidAppId(appId)) {
      return { hasSteamApi: false, is64Bit: false, hasFix: false, hasConfig: false }
    }

    const steamAppsPath = getSteamAppsPath()
    if (!steamAppsPath) {
      return { hasSteamApi: false, is64Bit: false, hasFix: false, hasConfig: false }
    }

    // Get install dir
    const acfPath = path.join(steamAppsPath, `appmanifest_${appId}.acf`)
    if (!fs.existsSync(acfPath)) {
      return { hasSteamApi: false, is64Bit: false, hasFix: false, hasConfig: false }
    }

    let installDir: string | null = null
    try {
      const content = fs.readFileSync(acfPath, 'utf-8')
      const parsed = parseVdf(content)
      installDir = parsed['AppState']?.['installdir'] || null
    } catch {
      return { hasSteamApi: false, is64Bit: false, hasFix: false, hasConfig: false }
    }

    if (!installDir) {
      return { hasSteamApi: false, is64Bit: false, hasFix: false, hasConfig: false }
    }

    const folders = getSteamLibraryFolders()
    let gameDir: string | null = null
    for (const folder of folders) {
      const candidate = path.join(folder, 'common', installDir)
      if (fs.existsSync(candidate)) {
        gameDir = candidate
        break
      }
    }

    if (!gameDir) {
      return { hasSteamApi: false, is64Bit: false, hasFix: false, hasConfig: false }
    }

    const { dll64, dll32 } = findSteamApiDlls(gameDir)
    const { orig64, orig32 } = findOriginalDlls(gameDir)
    const hasConfig = !!findConfigJson(gameDir)

    return {
      hasSteamApi: !!dll64 || !!dll32,
      is64Bit: !!dll64,
      hasFix: !!orig64 || !!orig32,
      hasConfig,
      gameDir,
    }
  })
}
