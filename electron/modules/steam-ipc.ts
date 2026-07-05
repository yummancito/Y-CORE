import { ipcMain, shell, dialog, BrowserWindow } from 'electron'
import path from 'path'
import fs from 'fs'
import { exec, spawn } from 'child_process'
import { logger } from '../logger'
import { state } from '../state'
import {
  getSteamPath,
  getSteamAppsPath,
  isValidAppId,
  parseVdf,
  closeSteamProcess,
  getLuaScriptsDir,
  getDepotCachePath,
  getSteamLibraryFolders,
  removeAppFromLibraryFolders,
  pathExists,
} from './steam-helpers'
import {
  createAppManifestFromLua,
} from './acf'
import { injectDepotKeysIntoConfigVdf } from './depot-keys'
import { parseLuaScript, type ParsedLuaScript, type ParsedLuaAppId, type ParsedLuaManifest } from './lua'
import { getCachedAppType, setCachedAppType } from './steamspy-cache'
import { installHookDll, startSteam, verifySteam, checkSteamVerification } from './dll-inject'
import { fetchGameName, fetchAppFreeStatus, autoCopyManifestsFromFolder, listLuaScripts, listManifestFiles } from './manifest-sync'

let _gamesCache: { data: any; timestamp: number } | null = null
const GAMES_CACHE_TTL = 3000

function removeWithReadOnly(targetPath: string): void {
  if (!fs.existsSync(targetPath)) return
  fs.chmodSync(targetPath, 0o777)
  const stat = fs.statSync(targetPath)
  if (stat.isDirectory()) {
    for (const entry of fs.readdirSync(targetPath)) {
      removeWithReadOnly(path.join(targetPath, entry))
    }
    fs.rmdirSync(targetPath)
  } else {
    fs.unlinkSync(targetPath)
  }
}

function deleteExtraSteamPaths(appId: string): void {
  const steamPath = getSteamPath()
  if (!steamPath) return
  const extraPaths = [
    path.join(steamPath, 'steamapps', 'downloading', appId),
    path.join(steamPath, 'steamapps', 'temp', appId),
    path.join(steamPath, 'config', 'lua', `${appId}.lua`),
    path.join(steamPath, 'config', 'stplug-in', `${appId}.lua`),
    path.join(steamPath, 'appcache', 'librarycache', appId),
  ]
  for (const p of extraPaths) {
    if (!fs.existsSync(p)) continue
    try {
      const stat = fs.statSync(p)
      if (stat.isDirectory()) {
        removeWithReadOnly(p)
      } else {
        fs.chmodSync(p, 0o777)
        fs.unlinkSync(p)
      }
      logger.info(`[deleteGame] deleted extra path ${p}`, 'steam')
    } catch (err: any) {
      logger.error(`[deleteGame] failed extra path ${p}: ${err.message}`, 'steam')
    }
  }

  const userdataPath = path.join(steamPath, 'userdata')
  if (!fs.existsSync(userdataPath)) return
  try {
    for (const userDir of fs.readdirSync(userdataPath)) {
      const libraryCacheDir = path.join(userdataPath, userDir, 'config', 'librarycache', appId)
      if (fs.existsSync(libraryCacheDir)) {
        removeWithReadOnly(libraryCacheDir)
        logger.info(`[deleteGame] deleted userdata librarycache ${libraryCacheDir}`, 'steam')
      }
    }
  } catch (err: any) {
    logger.error(`[deleteGame] failed userdata scan: ${err.message}`, 'steam')
  }
}

export function invalidateGamesCache(): void {
  _gamesCache = null
}

export function registerSteamHandlers(): void {
  ipcMain.handle('steam:searchGames', async (_event, query: string) => {
    if (!query || query.trim().length < 2) {
      return { success: false, error: 'Query too short', results: [] }
    }

    return new Promise((resolve) => {
      const url = `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(query)}&l=english&cc=us`
      const https = require('https')
      https.get(url, { headers: { 'User-Agent': 'Y-core/1.0' } }, (res: any) => {
        let data = ''
        res.on('data', (chunk: any) => data += chunk)
        res.on('end', () => {
          try {
            const json = JSON.parse(data)
            const items = json.items || []
            const results = items.map((item: any) => ({
              appId: String(item.id),
              name: item.name,
              type: item.type || 'app',
            }))
            resolve({ success: true, results })
          } catch {
            resolve({ success: false, error: 'Failed to parse search results', results: [] })
          }
        })
      }).on('error', (err: any) => {
        resolve({ success: false, error: err.message, results: [] })
      })
    })
  })

  ipcMain.handle('steam:isFreeToPlay', async (_event, appId: string) => {
    const isFree = await fetchAppFreeStatus(appId)
    return { success: true, isFree }
  })

  ipcMain.handle('steam:getPath', () => {
    const steamPath = getSteamPath()
    if (!steamPath) {
      logger.warn('Steam installation not found', 'steam')
      return { success: false, error: 'Steam installation not found', path: null }
    }
    return { success: true, path: steamPath }
  })

  ipcMain.handle('steam:listInstalledGames', () => {
    if (_gamesCache && Date.now() - _gamesCache.timestamp < GAMES_CACHE_TTL) {
      return _gamesCache.data
    }

    const steamAppsPath = getSteamAppsPath()
    if (!steamAppsPath) {
      return { success: false, error: 'Steam apps directory not found', games: [] }
    }

    try {
      const files = fs.readdirSync(steamAppsPath)
      const acfFiles = files.filter((f) => /^appmanifest_\d+\.acf$/.test(f))

      const games = acfFiles.map((file) => {
        const filePath = path.join(steamAppsPath, file)
        const content = fs.readFileSync(filePath, 'utf-8')
        const parsed = parseVdf(content)
        const appState = parsed['AppState'] || {}
        const stats = fs.statSync(filePath)

        return {
          appId: appState['appid'] || '',
          name: appState['name'] || 'Unknown',
          installDir: appState['installdir'] || '',
          universe: appState['Universe'] || '1',
          stateFlags: appState['StateFlags'] || '0',
          sizeOnDisk: parseInt(appState['SizeOnDisk'] || '0', 10),
          lastUpdated: parseInt(appState['LastUpdated'] || '0', 10),
          lastPlayed: parseInt(appState['LastPlayed'] || '0', 10),
          installedAt: Math.floor(stats.birthtimeMs / 1000),
          buildid: appState['buildid'] || '0',
          bytesToDownload: parseInt(appState['BytesToDownload'] || '0', 10),
          bytesDownloaded: parseInt(appState['BytesDownloaded'] || '0', 10),
          autoUpdateBehavior: appState['AutoUpdateBehavior'] || '0',
          manifestFile: file,
        }
      })

      const filtered = games.filter((g) => g.appId !== '228980')
      const result = { success: true, games: filtered }
      _gamesCache = { data: result, timestamp: Date.now() }
      logger.info(`Listed ${filtered.length} installed games from Steam`, 'steam')
      return result
    } catch (err: any) {
      logger.error(`Failed to list installed games: ${err.message}`, 'steam')
      return { success: false, error: err.message, games: [] }
    }
  })

  ipcMain.handle('steam:launchGame', async (_event, appId: string) => {
    if (!isValidAppId(appId)) {
      return { success: false, error: 'Invalid AppID' }
    }
    try {
      // Ensure YCoreTool signatures are cached and hooks are installed before launching.
      const steamPath = getSteamPath()
      if (steamPath) {
        const hookResult = await installHookDll(steamPath)
        if (!hookResult.success) {
          logger.warn(`Cannot launch game ${appId}: ${hookResult.error}`, 'steam')
          return { success: false, error: hookResult.error || 'Failed to prepare Steam hooks' }
        }
      }

      const url = `steam://run/${appId}`
      shell.openExternal(url)
      logger.info(`Launched game ${appId} via Steam`, 'steam')
      return { success: true, message: `Launching ${appId} via Steam` }
    } catch (err: any) {
      logger.error(`Failed to launch game ${appId}: ${err.message}`, 'steam')
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('steam:uninstallGame', (_event, appId: string) => {
    if (!isValidAppId(appId)) {
      return { success: false, error: 'Invalid AppID' }
    }
    try {
      const url = `steam://uninstall/${appId}`
      shell.openExternal(url)
      logger.info(`Requested uninstall for game ${appId} via Steam`, 'steam')
      return { success: true, message: `Uninstalling ${appId} via Steam` }
    } catch (err: any) {
      logger.error(`Failed to uninstall game ${appId}: ${err.message}`, 'steam')
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('steam:deleteGame', async (_event, appId: string, installDir: string) => {
    if (!isValidAppId(appId)) {
      return { success: false, error: 'Invalid AppID' }
    }
    if (!installDir || typeof installDir !== 'string') {
      return { success: false, error: 'Invalid installDir' }
    }

    if (path.isAbsolute(installDir) || installDir.includes('..') || installDir.includes('/') || installDir.includes('\\')) {
      return { success: false, error: 'installDir must be a relative folder name, not a path' }
    }

    const closeResult = await closeSteamProcess()
    if (!closeResult.success) {
      return { success: false, error: closeResult.error || 'Failed to close Steam' }
    }

    const folders = getSteamLibraryFolders()
    logger.info(`[deleteGame] appId=${appId} folders=${folders.join(', ')}`, 'steam')
    if (folders.length === 0) {
      return { success: false, error: 'Steam library folders not found' }
    }

    let manifestDeleted = false
    let folderDeleted = false
    const errors: string[] = []

    for (const folder of folders) {
      const manifestPath = path.join(folder, `appmanifest_${appId}.acf`)
      logger.info(`[deleteGame] checking manifest ${manifestPath} exists=${fs.existsSync(manifestPath)}`, 'steam')
      if (fs.existsSync(manifestPath)) {
        try {
          fs.chmodSync(manifestPath, 0o777)
          fs.unlinkSync(manifestPath)
          manifestDeleted = true
          logger.info(`[deleteGame] deleted manifest ${manifestPath}`, 'steam')
        } catch (err: any) {
          errors.push(`manifest: ${err.message}`)
          logger.error(`[deleteGame] failed manifest ${manifestPath}: ${err.message}`, 'steam')
        }
      }

      const gameFolder = path.join(folder, 'common', installDir)
      logger.info(`[deleteGame] checking folder ${gameFolder} exists=${fs.existsSync(gameFolder)}`, 'steam')
      if (fs.existsSync(gameFolder)) {
        try {
          removeWithReadOnly(gameFolder)
          folderDeleted = true
          logger.info(`[deleteGame] deleted folder ${gameFolder}`, 'steam')
        } catch (err: any) {
          errors.push(`folder: ${err.message}`)
          logger.error(`[deleteGame] failed folder ${gameFolder}: ${err.message}`, 'steam')
        }
      }
    }

    const remainingManifests = folders
      .map((f) => path.join(f, `appmanifest_${appId}.acf`))
      .filter((p) => fs.existsSync(p))
    const remainingFolders = folders
      .map((f) => path.join(f, 'common', installDir))
      .filter((p) => fs.existsSync(p))
    logger.info(`[deleteGame] remaining manifests=${remainingManifests.length}, folders=${remainingFolders.length}`, 'steam')

    if (!manifestDeleted && !folderDeleted) {
      await startSteam()
      return { success: false, error: 'Game files not found', details: errors.join('; ') }
    }

    _gamesCache = null
    removeAppFromLibraryFolders(appId)
    deleteExtraSteamPaths(appId)
    logger.info(`Deleted game ${appId} (manifest=${manifestDeleted}, folder=${folderDeleted})`, 'steam')
    await startSteam()
    return { success: true, manifestDeleted, folderDeleted, remainingManifests, remainingFolders }
  })

  ipcMain.handle('library:openLocation', async (_event, appId: string, installDir: string) => {
    if (!isValidAppId(appId)) {
      return { success: false, error: 'Invalid AppID' }
    }
    if (!installDir || typeof installDir !== 'string' || path.isAbsolute(installDir) || installDir.includes('..') || installDir.includes('/') || installDir.includes('\\')) {
      return { success: false, error: 'installDir must be a relative folder name, not a path' }
    }
    const folders = getSteamLibraryFolders()
    for (const folder of folders) {
      const gameFolder = path.join(folder, 'common', installDir)
      if (fs.existsSync(gameFolder)) {
        const error = await shell.openPath(gameFolder)
        if (error) return { success: false, error }
        return { success: true }
      }
    }
    return { success: false, error: 'Game folder not found' }
  })

  ipcMain.handle('library:verifyGame', async (_event, appId: string) => {
    if (!isValidAppId(appId)) {
      return { success: false, error: 'Invalid AppID' }
    }
    try {
      await shell.openExternal(`steam://validate/${appId}`)
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('steam:importManifest', (_event, options: { manifestPath: string }) => {
    const filePath = options.manifestPath
    const fileName = path.basename(filePath)

    if (!fileName.endsWith('.manifest') && !fileName.endsWith('.acf')) {
      return { success: false, error: 'Only .manifest and .acf files are allowed' }
    }

    if (filePath.includes('..')) {
      return { success: false, error: 'Invalid file path' }
    }
    const resolved = path.resolve(filePath)
    const baseName = path.basename(resolved)
    if (baseName !== fileName) {
      return { success: false, error: 'Invalid file path' }
    }

    if (!fs.existsSync(filePath)) {
      return { success: false, error: 'File not found' }
    }

    const isManifest = fileName.endsWith('.manifest')
    const isAcf = fileName.endsWith('.acf')

    let destDir: string | null = null
    if (isManifest) {
      destDir = getDepotCachePath()
    } else if (isAcf) {
      destDir = getSteamAppsPath()
    } else {
      return { success: false, error: 'Unsupported file type. Use .manifest or .acf files.' }
    }

    if (!destDir) {
      return { success: false, error: 'Steam directory not found. Is Steam installed?' }
    }

    if (!fs.existsSync(options.manifestPath)) {
      return { success: false, error: `File not found: ${options.manifestPath}` }
    }

    try {
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true })
      }
      const destPath = path.join(destDir, fileName)
      fs.copyFileSync(options.manifestPath, destPath)

      return {
        success: true,
        message: `${isManifest ? 'Manifest' : 'ACF'} imported: ${fileName}`,
        destination: destPath,
      }
    } catch (err: any) {
      return { success: false, error: `Failed to import: ${err.message}` }
    }
  })

  ipcMain.handle('steam:listManifestFiles', () => {
    const manifests = listManifestFiles()
    return { success: true, manifests }
  })

  ipcMain.handle('steam:listLuaScripts', () => {
    const scripts = listLuaScripts()
    return { success: true, scripts }
  })

  ipcMain.handle('steam:parseLuaScript', (_event, options: { luaPath: string }) => {
    const filePath = options.luaPath
    if (!filePath.endsWith('.lua')) {
      return { success: false, error: 'Only .lua files are allowed' }
    }
    if (filePath.includes('..')) {
      return { success: false, error: 'Invalid file path' }
    }
    if (!fs.existsSync(filePath)) {
      return { success: false, error: `File not found: ${filePath}` }
    }
    try {
      const content = fs.readFileSync(filePath, 'utf-8')
      const fileName = path.basename(filePath)
      const parsed = parseLuaScript(content, fileName)
      return { success: true, parsed, content }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('steam:importLuaScript', async (_event, options: { luaPath: string }) => {
    const filePath = options.luaPath
    if (!filePath.endsWith('.lua')) {
      return { success: false, error: 'Only .lua files are allowed' }
    }
    if (filePath.includes('..')) {
      return { success: false, error: 'Invalid file path' }
    }
    if (!fs.existsSync(filePath)) {
      return { success: false, error: `File not found: ${filePath}` }
    }

    const scriptsDir = getLuaScriptsDir()
    if (!scriptsDir) {
      return { success: false, error: 'Steam installation not found' }
    }

    if (!fs.existsSync(options.luaPath)) {
      return { success: false, error: `File not found: ${options.luaPath}` }
    }

    try {
      if (!fs.existsSync(scriptsDir)) {
        fs.mkdirSync(scriptsDir, { recursive: true })
      }

      const fileName = path.basename(options.luaPath)
      const rawContent = fs.readFileSync(options.luaPath, 'utf-8')
      const folder = path.dirname(options.luaPath)

      let parsed = parseLuaScript(rawContent, fileName)
      let luaContent = rawContent
      let wasReconstructed = false

      const folderFiles = fs.existsSync(folder) ? fs.readdirSync(folder) : []
      const manifestFiles = folderFiles.filter(f => f.endsWith('.manifest'))
      const discoveredManifests: { depotId: string; manifestId: string }[] = []

      for (const mf of manifestFiles) {
        const match = mf.match(/^(\d+)_(\d+)\.manifest$/)
        if (match) {
          discoveredManifests.push({ depotId: match[1], manifestId: match[2] })
        }
      }

      const hasAppIds = parsed.appIds.length > 0
      const hasManifestIds = parsed.manifestIds.length > 0
      const hasKeys = parsed.appIds.some((a: ParsedLuaAppId) => a.key)

      if (!hasManifestIds && discoveredManifests.length > 0) {
        wasReconstructed = true
      }

      if (!hasAppIds) {
        const fileMatch = fileName.match(/^(\d+)\.lua$/)
        if (fileMatch) {
          wasReconstructed = true
        }
      }

      if (wasReconstructed || !hasManifestIds || !hasAppIds) {
        const appId = parsed.appIds[0]?.id || fileName.match(/^(\d+)\.lua$/)?.[1] || ''
        if (appId) {
          const existingManifestDepots = new Set(parsed.manifestIds.map((m: ParsedLuaManifest) => m.depotId))
          const mergedManifests = [
            ...parsed.manifestIds,
            ...discoveredManifests.filter((d: { depotId: string; manifestId: string }) => !existingManifestDepots.has(d.depotId)),
          ]

          const existingAppIds = new Set(parsed.appIds.map((a: ParsedLuaAppId) => a.id))
          const newDepotIds = discoveredManifests
            .map((d: { depotId: string; manifestId: string }) => d.depotId)
            .filter((id: string) => !existingAppIds.has(id) && id !== appId)

          const now = new Date().toISOString().split('T')[0]
          let reconstructed = `-- Reconstructed by Y-core on ${now}\n-- AppID: ${appId}\n\naddappid(${appId})\n`

          for (const a of parsed.appIds as ParsedLuaAppId[]) {
            if (a.id !== appId && a.key) {
              reconstructed += `addappid(${a.id}, 1, "${a.key}")\n`
            }
          }

          for (const depotId of newDepotIds) {
            reconstructed += `addappid(${depotId})\n`
          }

          for (const m of mergedManifests as ParsedLuaManifest[]) {
            if (m.depotId !== appId) {
              reconstructed += `setManifestid(${m.depotId}, "${m.manifestId}")\n`
            }
          }

          luaContent = reconstructed
          parsed = parseLuaScript(luaContent, fileName)
        }
      }

      const destPath = path.join(scriptsDir, fileName)
      fs.writeFileSync(destPath, luaContent, 'utf-8')

      const finalParsed = parseLuaScript(luaContent, fileName)
      const mainAppId = finalParsed.appIds[0]?.id
      const depotKeys = finalParsed.appIds.filter((a: ParsedLuaAppId) => a.key).map((a: ParsedLuaAppId) => ({
        depotId: a.id,
        key: a.key!,
      }))
      const depotsWithoutKeys = finalParsed.appIds.filter((a: ParsedLuaAppId) => a.id !== mainAppId && !a.key)
      const depotIdsWithKeys = new Set<string>(depotKeys.map((k: { depotId: string; key: string }) => k.depotId))

      const actions: string[] = []
      const warnings: string[] = []

      if (wasReconstructed) {
        actions.push('Lua was malformed/incomplete - reconstructed automatically')
      } else {
        actions.push('Lua script copied to config\\stplug-in')
      }

      const manifestResult = autoCopyManifestsFromFolder(options.luaPath, finalParsed)
      if (manifestResult.copied > 0) {
        actions.push(`${manifestResult.copied} manifest files auto-copied to depotcache`)
      }
      if (manifestResult.missing.length > 0) {
        warnings.push(`Missing manifests: ${manifestResult.missing.join(', ')}`)
      }

      if (depotsWithoutKeys.length > 0) {
        const missingKeyDepots = depotsWithoutKeys.map((d: ParsedLuaAppId) => d.id).join(', ')
        warnings.push(`Depots without keys: ${missingKeyDepots} - get keys at depotbox.org`)
      }

      if (depotKeys.length > 0) {
        const injectResult = injectDepotKeysIntoConfigVdf(depotKeys)
        if (injectResult.success) {
          actions.push(`${injectResult.added} depot keys injected into config.vdf`)
        } else {
          warnings.push(`Failed to inject depot keys: ${injectResult.error}`)
        }
      }

      let gameName = mainAppId || ''
      if (mainAppId) {
        gameName = await fetchGameName(mainAppId)
        if (gameName !== mainAppId) {
          actions.push(`Game name: ${gameName}`)
        }
      }

      if (mainAppId) {
        const acfResult = createAppManifestFromLua(mainAppId, luaContent, gameName, depotIdsWithKeys)
        if (acfResult.success) {
          actions.push(`appmanifest_${mainAppId}.acf created`)
          _gamesCache = null
        } else {
          warnings.push(`Failed to create appmanifest: ${acfResult.error}`)
        }
      }

      const steamPath = getSteamPath()
      if (steamPath) {
        const hookResult = await installHookDll(steamPath)
        if (hookResult.success) {
          actions.push(hookResult.installed ? 'Hook DLL + Steamless installed' : 'Hook DLL already installed')
        } else {
          warnings.push(`Hook DLL: ${hookResult.error}`)
        }
      }

      const message = actions.join(' | ') + (warnings.length > 0 ? ' | WARNINGS: ' + warnings.join('; ') : '')

      return {
        success: true,
        message,
        destination: destPath,
        parsed: finalParsed,
        warnings,
        reconstructed: wasReconstructed,
      }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('steam:deleteLuaScript', (_event, fileName: string) => {
    if (!fileName || typeof fileName !== 'string' || fileName.includes('..') || fileName.includes('/') || fileName.includes('\\')) {
      return { success: false, error: 'Invalid file name' }
    }
    if (!fileName.endsWith('.lua')) {
      return { success: false, error: 'Only .lua files are allowed' }
    }
    const scriptsDir = getLuaScriptsDir()
    if (!scriptsDir) {
      return { success: false, error: 'Steam installation not found' }
    }

    const filePath = path.join(scriptsDir, fileName)
    if (!fs.existsSync(filePath)) {
      return { success: false, error: 'Lua script not found' }
    }

    try {
      fs.unlinkSync(filePath)
      return { success: true, message: `Lua script deleted: ${fileName}` }
    } catch (err: any) {
      return { success: false, error: `Failed to delete: ${err.message}` }
    }
  })

  ipcMain.handle('steam:deleteManifestFile', (_event, fileName: string) => {
    if (!fileName || typeof fileName !== 'string' || fileName.includes('..') || fileName.includes('/') || fileName.includes('\\')) {
      return { success: false, error: 'Invalid file name' }
    }
    if (!fileName.endsWith('.manifest')) {
      return { success: false, error: 'Only .manifest files are allowed' }
    }
    const depotCachePath = getDepotCachePath()
    if (!depotCachePath) {
      return { success: false, error: 'Steam depotcache directory not found' }
    }

    const filePath = path.join(depotCachePath, fileName)
    if (!fs.existsSync(filePath)) {
      return { success: false, error: 'Manifest file not found' }
    }

    try {
      fs.unlinkSync(filePath)
      return { success: true, message: `Manifest deleted: ${fileName}` }
    } catch (err: any) {
      return { success: false, error: `Failed to delete: ${err.message}` }
    }
  })

  ipcMain.handle('steam:restartSteam', async () => {
    const platform = process.platform
    if (platform === 'win32') {
      await new Promise<void>((resolve) => exec('taskkill /IM steam.exe /F', () => resolve()))
    } else if (platform === 'darwin' || platform === 'linux') {
      await new Promise<void>((resolve) => exec('killall steam', () => resolve()))
    }
    return startSteam()
  })

  ipcMain.handle('steam:verifySteam', async () => {
    return verifySteam()
  })

  ipcMain.handle('steam:checkVerification', () => {
    return checkSteamVerification()
  })

  ipcMain.handle('steam:isRunning', () => {
    const platform = process.platform

    return new Promise((resolve) => {
      if (platform === 'win32') {
        exec('tasklist /FI "IMAGENAME eq steam.exe"', (err, stdout) => {
          if (err) {
            resolve({ running: false })
            return
          }
          resolve({ running: stdout.toLowerCase().includes('steam.exe') })
        })
      } else if (platform === 'darwin' || platform === 'linux') {
        exec('pgrep steam', (err, stdout) => {
          resolve({ running: !err && stdout.trim().length > 0 })
        })
      } else {
        resolve({ running: false })
      }
    })
  })

  ipcMain.handle('steam:closeSteam', async () => {
    const result = await closeSteamProcess()
    if (!result.success) return result
    return { success: true, message: 'Steam closed' }
  })

  ipcMain.handle('steam:getLibraryFolders', () => {
    const steamAppsPath = getSteamAppsPath()
    if (!steamAppsPath) {
      return { success: false, error: 'Steam apps directory not found', folders: [] }
    }

    const vdfPath = path.join(steamAppsPath, 'libraryfolders.vdf')
    if (!fs.existsSync(vdfPath)) {
      return { success: true, folders: [steamAppsPath] }
    }

    try {
      const content = fs.readFileSync(vdfPath, 'utf-8')
      const parsed = parseVdf(content)
      const libraryFolders = parsed['libraryfolders'] || {}

      const folders: string[] = []
      let idx = 0
      while (libraryFolders[String(idx)]) {
        const entry = libraryFolders[String(idx)]
        if (entry['path']) {
          folders.push(path.join(entry['path'], 'steamapps'))
        }
        idx++
      }

      if (folders.length === 0) {
        folders.push(steamAppsPath)
      }

      return { success: true, folders }
    } catch (err: any) {
      return { success: false, error: err.message, folders: [steamAppsPath] }
    }
  })

  ipcMain.handle('steam:importGameFolder', async (_event, options: { folderPath: string }) => {
    const steamPath = getSteamPath()
    if (!steamPath) {
      return { success: false, error: 'Steam installation not found' }
    }

    const folderPath = options.folderPath
    if (!fs.existsSync(folderPath) || !fs.statSync(folderPath).isDirectory()) {
      return { success: false, error: 'Invalid folder path' }
    }

    const actions: string[] = []
    const errors: string[] = []

    try {
      const allFiles = fs.readdirSync(folderPath)
      const luaFiles = allFiles.filter(f => f.toLowerCase().endsWith('.lua'))
      const manifestFiles = allFiles.filter(f => f.toLowerCase().endsWith('.manifest'))

      if (luaFiles.length === 0) {
        return { success: false, error: 'No .lua files found in the folder' }
      }

      const hookResult = await installHookDll(steamPath)
      if (hookResult.success) {
        actions.push(hookResult.installed ? 'Hook DLL installed' : 'Hook DLL already installed')
      } else {
        errors.push(`Hook DLL: ${hookResult.error}`)
      }

      const scriptsDir = getLuaScriptsDir()
      if (scriptsDir) {
        if (!fs.existsSync(scriptsDir)) fs.mkdirSync(scriptsDir, { recursive: true })
        for (const luaFile of luaFiles) {
          const src = path.join(folderPath, luaFile)
          const dst = path.join(scriptsDir, luaFile)
          fs.copyFileSync(src, dst)
          actions.push(`Lua: ${luaFile} → config\\stplug-in`)
        }
      }

      const depotCachePath = getDepotCachePath()
      if (depotCachePath) {
        if (!fs.existsSync(depotCachePath)) fs.mkdirSync(depotCachePath, { recursive: true })
        for (const manifestFile of manifestFiles) {
          const src = path.join(folderPath, manifestFile)
          const dst = path.join(depotCachePath, manifestFile)
          fs.copyFileSync(src, dst)
        }
        actions.push(`Manifests: ${manifestFiles.length} files → depotcache`)
      }

      const steamAppsPath = getSteamAppsPath()
      const importedGames: { appId: string; name: string }[] = []

      for (const luaFile of luaFiles) {
        const luaPath = path.join(folderPath, luaFile)
        const content = fs.readFileSync(luaPath, 'utf-8')
        const parsed = parseLuaScript(content, luaFile)

        const mainAppId = parsed.appIds[0]?.id
        if (!mainAppId) continue

        const depotKeys = parsed.appIds.filter((a: ParsedLuaAppId) => a.key).map((a: ParsedLuaAppId) => ({
          depotId: a.id,
          key: a.key!,
        }))

        if (depotKeys.length > 0) {
          const injectResult = injectDepotKeysIntoConfigVdf(depotKeys)
          if (injectResult.success) {
            actions.push(`Depot keys: ${injectResult.added} keys injected for ${luaFile}`)
          }
        }

        if (steamAppsPath) {
          const depotIdsWithKeys = new Set<string>(depotKeys.map((k: { depotId: string; key: string }) => k.depotId))
          const acfResult = createAppManifestFromLua(mainAppId, content, luaFile.replace('.lua', ''), depotIdsWithKeys)
          if (acfResult.success) {
            actions.push(`appmanifest_${mainAppId}.acf created`)
          } else {
            errors.push(`Failed to create appmanifest: ${acfResult.error}`)
          }
        }

        importedGames.push({ appId: mainAppId, name: luaFile.replace('.lua', '') })
      }

      logger.info(`Imported game folder ${folderPath}: ${importedGames.length} games, ${luaFiles.length} lua, ${manifestFiles.length} manifests`, 'steam')
      return {
        success: true,
        actions,
        errors,
        importedGames,
        luaCount: luaFiles.length,
        manifestCount: manifestFiles.length,
      }
    } catch (err: any) {
      logger.error(`Failed to import folder ${folderPath}: ${err.message}`, 'steam')
      return { success: false, error: `Failed to import: ${err.message}` }
    }
  })

  ipcMain.handle('steam:checkAppTypes', async (_event, appIds: string[]) => {
    const TOOL_PATTERNS = /Dedicated Server|SDK|Server Beta|Beta Server|Content Tool|Editor|Faceit|Steamworks|Workshop|Creator Kit|Runtime|Redist|DirectX|VCRedist|PhysX|Framework|Compiler|Debugger|Test Tool|Source Filmmaker|Level Editor|Mod Tool|Replay Tool|Profiler|Benchmark Tool|Driver|Controller Config|Dev Kit|Toolkit|Authoring Tools|Server|Dedicated|Host Server|Playtest Server|Multiplayer Server|Game Server|Steam Server|Piped|Redirect|\bStub\b|\bConfig\b|\bBase\b|\bEmpty\b|Preload|Depots only|DepotOnly|Trailer|\bVideo\b|\bMovie\b|Wallpaper|\bTheme\b|\bOST\b|\bSoundtrack\b|Artbook|\bGuide\b|\bManual\b/i
    const ADULT_TAGS = /Sexual Content|Nudity|Adult Only|\+18|NSFW|Hentai|Erotic|Pornographic|\bSex\b|\bBDSM\b|\bOrgy\b|\bTits\b|\bLust\b|\bMilfs?\b|\bWhores?\b|\bCybersex\b|\bOrgasm\b|\bStriptease\b|\bCyberfuck\b|\bFetish\b|\b18\+?\b|\bLewd\b|\bNude\b|\bPorn\b|\bBoobs?\b|\bCunt\b|\bDick\b|\bFuck\b|\bPussy\b|\bAss\b|\bSlave\b|\bRape\b|\bMolest\b|\bIncest\b|\bYuri\b|\bYaoi\b|\bEroge\b|\bWaifu\b|\bHarem\b|\bUncensored\b|\bFurry\b/i
    const results: Record<string, { isGame: boolean; isAdult: boolean }> = {}

    logger.info(`[checkAppTypes] Checking ${appIds.length} apps via SteamSpy`, 'steam')

    const uncachedAppIds: string[] = []
    for (const appId of appIds) {
      const cached = getCachedAppType(appId)
      if (cached) {
        results[appId] = cached
      } else {
        uncachedAppIds.push(appId)
      }
    }

    if (uncachedAppIds.length === 0) {
      logger.info(`[checkAppTypes] All ${appIds.length} apps served from cache`, 'steam')
      return results
    }

    logger.info(`[checkAppTypes] ${uncachedAppIds.length} cache misses, fetching from SteamSpy`, 'steam')

    const BATCH_SIZE = 5
    for (let i = 0; i < uncachedAppIds.length; i += BATCH_SIZE) {
      const batch = uncachedAppIds.slice(i, i + BATCH_SIZE)
      const checks = batch.map(async (appId) => {
        try {
          const controller = new AbortController()
          const timeout = setTimeout(() => controller.abort(), 5000)
          const resp = await fetch(`https://steamspy.com/api.php?request=appdetails&appid=${appId}`, {
            signal: controller.signal,
            headers: { 'Accept': 'application/json' },
          })
          clearTimeout(timeout)

          if (!resp.ok) {
            logger.warn(`[checkAppTypes] App ${appId}: HTTP ${resp.status}, allowing`, 'steam')
            results[appId] = { isGame: true, isAdult: false }
            setCachedAppType(appId, results[appId])
            return
          }

          const data = await resp.json() as any

          if (!data || !data.name) {
            logger.warn(`[checkAppTypes] App ${appId}: no data, allowing`, 'steam')
            results[appId] = { isGame: true, isAdult: false }
            setCachedAppType(appId, results[appId])
            return
          }

          const isTool = TOOL_PATTERNS.test(data.name)
          const isGame = !isTool
          const tags = (data.tags && typeof data.tags === 'object')
            ? Object.keys(data.tags).join(' ')
            : (typeof data.tags === 'string' ? data.tags : '')
          const isAdult = ADULT_TAGS.test(tags) || ADULT_TAGS.test(data.name)
          logger.info(`[checkAppTypes] App ${appId}: name="${data.name}", isGame=${isGame}, isAdult=${isAdult}, tags="${tags.slice(0, 80)}"`, 'steam')
          results[appId] = { isGame, isAdult }
          setCachedAppType(appId, results[appId])
        } catch (err: any) {
          logger.warn(`[checkAppTypes] App ${appId}: error ${err.message}, allowing`, 'steam')
          results[appId] = { isGame: true, isAdult: false }
        }
      })
      await Promise.all(checks)
      if (i + BATCH_SIZE < uncachedAppIds.length) {
        await new Promise(resolve => setTimeout(resolve, 200))
      }
    }

    logger.info(`[checkAppTypes] Results: ${JSON.stringify(results)}`, 'steam')
    return results
  })
}
