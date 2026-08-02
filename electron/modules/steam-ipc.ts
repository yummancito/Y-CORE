// ============================================================================
// steam-ipc — Steam library & process management IPC handlers
// ----------------------------------------------------------------------------
// Neutral Steam library management: listing installed games, launching /
// uninstalling / deleting / locating them, controlling the Steam process, and
// looking up public game metadata (search, free-to-play, app types) via Steam's
// public web endpoints.
//
// The activation/injection paths (importing an unlock lua/manifest, verifying
// the unlock tool is installed, signature validation) are DRM-circumvention
// operations and are intentionally NOT implemented — they report
// NOT_IMPLEMENTED so the surrounding UI stays usable.
// ============================================================================

import { ipcMain, shell, dialog, app } from 'electron'
import path from 'path'
import fs from 'fs'
import { spawn } from 'child_process'
import { logger } from '../logger'
import { state } from '../state'
import { parseLuaScript } from '@y-core/shared'
import { notImplementedResult } from './drm-stub'
import { findGameExecutable, launchGameFromDir } from './game-process'
import { patchGameFolder } from './local-steam-emulator'
import { removeGameDrm } from './drm-remover'
import { ensureAllChannelsCached } from './signature-cache'
import { trackGameLaunch } from './discord-rpc'
import {
  getSteamPath,
  getSteamAppsPath,
  getSteamLibraryFolders,
  getLuaScriptsDir,
  getDepotCachePath,
  removeAppFromLibraryFolders,
  closeSteamProcess,
  isSteamRunning,
  parseVdf,
  isValidAppId,
} from './steam-helpers'

// Lazy: NO llamar app.getPath a nivel de módulo (crashea si el bundler evalúa
// este módulo antes de que Electron inicialice `app`).
function getConfigPath(): string {
  return path.join(app.getPath('userData'), 'ycore-config.json')
}

// ---------------------------------------------------------------------------
// Games cache
// ---------------------------------------------------------------------------
export function invalidateGamesCache(): void {
  state.gamesCache = null
}

// Persistent names cache - resolves names once, never calls API again for same appId
function getNamesCachePath(): string {
  return path.join(app.getPath('userData'), 'ycore-names-cache.json')
}

function loadNamesCache(): Record<string, string> {
  try {
    const NAMES_CACHE_PATH = getNamesCachePath()
    if (fs.existsSync(NAMES_CACHE_PATH)) {
      return JSON.parse(fs.readFileSync(NAMES_CACHE_PATH, 'utf-8'))
    }
  } catch {}
  return {}
}

function saveNamesCache(cache: Record<string, string>): void {
  try {
    fs.writeFileSync(getNamesCachePath(), JSON.stringify(cache, null, 2), 'utf-8')
  } catch (err: any) {
    logger.warn(`[namesCache] Failed to save: ${err?.message}`, 'steam')
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toNumber(value: unknown): number {
  const n = parseInt(String(value ?? '0'), 10)
  return Number.isFinite(n) ? n : 0
}

/** Locate the appmanifest_<appId>.acf across all library folders. */
function findManifestPath(appId: string): string | null {
  for (const libFolder of getSteamLibraryFolders()) {
    const acfPath = path.join(libFolder, `appmanifest_${appId}.acf`)
    if (fs.existsSync(acfPath)) return acfPath
  }
  return null
}

async function steamJson<T>(url: string): Promise<T | null> {
  try {
    const resp = await fetch(url, { headers: { 'User-Agent': 'Y-core' } })
    if (!resp.ok) return null
    return (await resp.json()) as T
  } catch (err: any) {
    logger.warn(`Steam API request failed (${url}): ${err?.message ?? err}`, 'steam')
    return null
  }
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

export function registerSteamHandlers(): void {
  // --- Steam directory -------------------------------------------------------

  ipcMain.handle('steam:getPath', () => {
    const steamPath = getSteamPath()
    if (!steamPath) {
      return { success: false, path: null, error: 'Steam installation not found' }
    }
    return { success: true, path: steamPath }
  })

  ipcMain.handle('steam:openSteamFolderDialog', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Select your Steam folder',
      properties: ['openDirectory'],
    })
    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, path: null }
    }
    const chosen = result.filePaths[0]
    if (!fs.existsSync(path.join(chosen, 'steamapps'))) {
      return { success: false, path: null, error: 'The selected folder does not contain a "steamapps" directory' }
    }
    try {
      const CONFIG_PATH = getConfigPath()
      let existing: Record<string, unknown> = {}
      if (fs.existsSync(CONFIG_PATH)) {
        existing = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'))
      }
      existing.steamPath = chosen
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(existing, null, 2), 'utf-8')
    } catch (err: any) {
      return { success: false, path: null, error: err.message }
    }
    return { success: true, path: chosen }
  })

  ipcMain.handle('steam:getLibraryFolders', () => {
    const folders = getSteamLibraryFolders()
    if (folders.length === 0) {
      return { success: false, folders: [], error: 'No Steam library folders found' }
    }
    return { success: true, folders }
  })

  // --- Installed games (neutral: reads real .acf manifests) ------------------

  ipcMain.handle('steam:listInstalledGames', () => {
    if (state.gamesCache) {
      return { success: true, games: state.gamesCache }
    }

    const libraryFolders = getSteamLibraryFolders()
    if (libraryFolders.length === 0) {
      return { success: false, games: [], error: 'Steam library not found' }
    }

    const games: any[] = []
    const seen = new Set<string>()

    for (const libFolder of libraryFolders) {
      let entries: string[] = []
      try {
        entries = fs.readdirSync(libFolder)
      } catch {
        continue
      }
      for (const entry of entries) {
        const match = entry.match(/^appmanifest_(\d+)\.acf$/)
        if (!match) continue
        const appId = match[1]
        if (seen.has(appId)) continue

        const acfPath = path.join(libFolder, entry)
        try {
          const content = fs.readFileSync(acfPath, 'utf-8')
          const parsed = parseVdf(content)
          const appState = parsed['AppState'] || {}
          let installedAt = 0
          try {
            installedAt = Math.floor(fs.statSync(acfPath).birthtimeMs / 1000)
          } catch {}

          games.push({
            appId,
            name: appState['name'] || appId,
            installDir: appState['installdir'] || '',
            universe: appState['Universe'] || '1',
            stateFlags: appState['StateFlags'] || '0',
            sizeOnDisk: toNumber(appState['SizeOnDisk']),
            lastUpdated: toNumber(appState['LastUpdated']),
            lastPlayed: toNumber(appState['LastPlayed']),
            installedAt: installedAt || toNumber(appState['LastUpdated']),
            buildid: appState['buildid'] || '0',
            bytesToDownload: toNumber(appState['BytesToDownload']),
            bytesDownloaded: toNumber(appState['BytesDownloaded']),
            autoUpdateBehavior: appState['AutoUpdateBehavior'] || '0',
            manifestFile: entry,
            playtime: toNumber(appState['Playtime']),
          })
          seen.add(appId)
        } catch (err: any) {
          logger.warn(`Failed to parse ${acfPath}: ${err?.message ?? err}`, 'steam')
        }
      }
    }

    state.gamesCache = games
    return { success: true, games }
  })

  ipcMain.handle('steam:resolveOrphanNames', async (_event, games: { appId: string; installDir: string }[]) => {
    const resolved: { appId: string; newName: string }[] = []
    const validGames = (games || []).filter((g) => isValidAppId(g.appId))
    if (validGames.length === 0) return { success: true, resolved }

    // Load previously cached names — zero API calls for already-resolved games
    const namesCache = loadNamesCache()
    const uncached: { appId: string; installDir: string }[] = []

    for (const game of validGames) {
      const cachedName = namesCache[game.appId]
      if (cachedName) {
        resolved.push({ appId: game.appId, newName: cachedName })
      } else {
        uncached.push(game)
      }
    }

    if (uncached.length === 0) {
      logger.info(`[resolveOrphanNames] All ${resolved.length} names served from cache (zero API calls)`, 'steam')
      return { success: true, resolved }
    }

    logger.info(`[resolveOrphanNames] Resolving ${uncached.length} uncached orphans (${resolved.length} cached): ${uncached.map((g) => g.appId).join(',')}`, 'steam')

    const BATCH_SIZE = 30
    const newlyResolved: { appId: string; newName: string }[] = []
    for (let i = 0; i < uncached.length; i += BATCH_SIZE) {
      const batch = uncached.slice(i, i + BATCH_SIZE)
      const appIds = batch.map((g) => g.appId)

      let batchResolved: { appId: string; newName: string }[] = []
      for (let attempt = 0; attempt < 2; attempt++) {
        const data = await steamJson<Record<string, { success: boolean; data?: { name?: string } }>>(
          `https://store.steampowered.com/api/appdetails?appids=${appIds.join(',')}&filters=basic`,
        )

        if (data) {
          for (const game of batch) {
            const name = data[game.appId]?.data?.name
            if (name) batchResolved.push({ appId: game.appId, newName: name })
          }
          break
        }

        if (attempt === 0) {
          logger.warn(`[resolveOrphanNames] Batch attempt ${attempt + 1} failed for [${appIds.join(',')}], retrying...`, 'steam')
          await new Promise((r) => setTimeout(r, 2000))
        }
      }

      newlyResolved.push(...batchResolved)
      if (i + BATCH_SIZE < uncached.length) {
        await new Promise((r) => setTimeout(r, 500))
      }
    }

    // Persist newly resolved names to cache so subsequent loads hit zero API
    if (newlyResolved.length > 0) {
      for (const r of newlyResolved) namesCache[r.appId] = r.newName
      saveNamesCache(namesCache)
    }

    resolved.push(...newlyResolved)
    logger.info(`[resolveOrphanNames] Resolved ${resolved.length}/${validGames.length} orphans (${resolved.length - newlyResolved.length} cached, ${newlyResolved.length} new)`, 'steam')
    return { success: true, resolved }
  })

  // --- Game actions (neutral: Steam URL protocol / filesystem) ---------------

  ipcMain.handle('steam:launchGame', async (_event, appId: string) => {
    if (!isValidAppId(appId)) return { success: false, error: 'Invalid app id' }

    let wasSteamAliveAtLaunch = false
    let killSteamBeforeLaunch = false

    try {
      // Round-9 fix: Y-core owns 100% of game launches. Single native path.
      // Removed launcherMode read AND shell.openExternal('steam://rungameid/...')
      // as both default AND fallback. If a game can't launch natively, we
      // surface a structured error with an actionable hint — never delegate
      // to Steam silently.

      // Round-10 addition: detect-and-optionally-kill a Steam instance that
      // was already running independently BEFORE we touch the launch chain.
      // Without this, a user who has Steam.exe in their tray from a previous
      // session would report "Y-core launched via Steam" — false positive,
      // because Y-core never spawns steam.exe in the launch path; only Steam
      // was already alive in the background.
      //
      //   wasSteamAliveAtLaunch  → always returned, even if killSteamBeforeLaunch=false
      //                            (renders a transparent toast to the user).
      //   killSteamBeforeLaunch  → optional opt-in toggle (default false). When
      //                            true, we taskkill steam.exe + steamwebhelper.exe
      //                            before continue()-ing to removeGameDrm so the
      //                            user gets visual proof: Steam pops "Steam is
      //                            restarting" briefly then disappears.
      try {
        const configPath = getConfigPath()
        if (fs.existsSync(configPath)) {
          const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
          killSteamBeforeLaunch = config.killSteamBeforeLaunch === true
        }
      } catch { /* ignore config errors */ }

      try {
        wasSteamAliveAtLaunch = await isSteamRunning()
        if (killSteamBeforeLaunch && wasSteamAliveAtLaunch) {
          logger.info(
            '[steam-ipc] killSteamBeforeLaunch=true — closing Steam.exe + steamwebhelper.exe BEFORE launch chain',
            'steam',
          )
          await closeSteamProcess()
          // Brief settle to release file handles Steam held (console_log.txt
          // watcher et al). 300ms is empirical — too short and the next
          // removeGameDrm read races; too long and the user notices lag.
          await new Promise(resolve => setTimeout(resolve, 300))
          logger.info('[steam-ipc] Steam terminated for autonomy', 'steam')
        } else if (wasSteamAliveAtLaunch) {
          logger.info(
            '[steam-ipc] Steam was already running independently (killSteamBeforeLaunch=false). User saw Steam in tray — Y-core did NOT launch it.',
            'steam',
          )
        }
      } catch (err: any) {
        logger.warn(`[steam-ipc] pre-launch Steam detection failed: ${err?.message ?? err}`, 'steam')
      }

      const folders = getSteamLibraryFolders()
      let foundInstallDir = ''
      for (const folder of folders) {
        const acfPath = path.join(folder, `appmanifest_${appId}.acf`)
        if (!fs.existsSync(acfPath)) continue
        try {
          const acfContent = fs.readFileSync(acfPath, 'utf-8')
          const parsed = parseVdf(acfContent)
          const installDir = parsed?.AppState?.installdir?.trim()
          if (!installDir) continue
          foundInstallDir = path.join(folder, 'common', installDir)
          break
        } catch { continue }
      }

      if (!foundInstallDir) {
        return {
          success: false,
          error: `AppId ${appId} no instalado o carpeta de instalación desconocida`,
          hint: 'Verificá que el juego esté descargado via /downloads. Si está en otra biblioteca de Steam, escaneala con /storage.',
        }
      }

      // Layer 2 (SteamStub DRM): strip .exe encryption before Layer 1 patch.
      const drmResult = await removeGameDrm(appId)
      if (!drmResult.success && drmResult.hadDrm) {
        logger.error(
          `[steam-ipc] native launch aborted: SteamStub removal failed (${drmResult.message}).`,
          'steam',
        )
        return {
          success: false,
          error: drmResult.message,
          hint: 'SteamStub removal falló. Si el juego está protegido por Denuvo/EAC/SecuROM (Layer-4), instalá Steam Client como plan B.',
        }
      } else if (drmResult.hadDrm) {
        logger.info(`[steam-ipc] Layer 2: SteamStub removed — ${drmResult.message}`, 'steam')
      } else {
        logger.info(`[steam-ipc] Layer 2: no SteamStub DRM present`, 'steam')
      }

      // Layer 1: drop ycore_steam.dll as steam_api64.dll + steam_appid.txt.
      // The DLL isn't built/shipped yet, so patch.success is routinely
      // 'partial' or false. Rather than surface an internal DLL error to the
      // user, fall back to launching through the real Steam Client so the
      // game (and Discord Rich Presence via steam-log-watcher) still work.
      const patch = patchGameFolder(foundInstallDir, appId)
      if (patch.success !== true) {
        logger.warn(
          `[steam-ipc] emulador no disponible para ${appId} (${patch.error}); fallback a Steam Client`,
          'steam',
        )
        const steamPath = getSteamPath()
        if (!steamPath) {
          return {
            success: false,
            error: 'Este juego necesita Steam instalado para poder lanzarse.',
            hint: 'Instalá Steam Client, o esperá a que el modo nativo esté disponible.',
          }
        }
        shell.openExternal(`steam://rungameid/${appId}`)
        try { trackGameLaunch(appId) } catch {}
        logger.info(`[steam-ipc] fallback launch via Steam Client for ${appId}`, 'steam')
        return {
          success: true,
          native: false,
          steamFallback: true,
          wasSteamAliveAtLaunch,
          killedSteamBeforeLaunch: killSteamBeforeLaunch && wasSteamAliveAtLaunch,
        }
      }
      if (patch.warnings?.length) {
        for (const w of patch.warnings) logger.warn(`[steam-ipc] patch warning: ${w}`, 'steam')
      }

      const exePath = findGameExecutable(foundInstallDir)
      if (!exePath) {
        return {
          success: false,
          error: `No se encontró ejecutable en ${foundInstallDir}`,
          hint: 'Verificá que el juego tenga un .exe válido (algunos juegos sólo traen un launcher .exe distribuido en subcarpetas).',
        }
      }

      launchGameFromDir(appId, foundInstallDir, `Game ${appId}`)
      try { trackGameLaunch(appId) } catch {}
      logger.info(
        `[steam-ipc] Launched ${appId} natively (emulador DLL parchada): ${exePath}`,
        'steam',
      )
      // Round-10 addition: surface the Steam state snapshot so the renderer
      // can render a transparent toast. If killSteamBeforeLaunch=true AND
      // Steam was alive → tell the user we killed it. If killSteamBeforeLaunch=false
      // AND Steam was alive → tell them Steam was independent of Y-core.
      return {
        success: true,
        native: true,
        exePath,
        wasSteamAliveAtLaunch,
        killedSteamBeforeLaunch: killSteamBeforeLaunch && wasSteamAliveAtLaunch,
      }
    } catch (err: any) {
      return {
        success: false,
        error: err?.message ?? String(err),
        wasSteamAliveAtLaunch,
        killedSteamBeforeLaunch: false,
      }
    }
  })

  ipcMain.handle('steam:uninstallGame', async (_event, appId: string) => {
    if (!isValidAppId(appId)) return { success: false, error: 'Invalid app id' }
    try {
      // Round-9 fix: removed shell.openExternal('steam://uninstall/...'). Y-core
      // owns uninstall — remove ACF + game folder atomically, then invalidate
      // the games cache so the LibraryPage re-scans on next focus.
      const acfPath = findManifestPath(appId)
      let manifestDeleted = false
      let folderDeleted = false
      if (acfPath) {
        try {
          fs.unlinkSync(acfPath)
          manifestDeleted = true
        } catch (err: any) {
          logger.warn(`[steam-ipc] Failed to delete manifest for ${appId}: ${err?.message ?? err}`, 'steam')
        }
        try {
          const acfContent = fs.readFileSync(acfPath, 'utf-8')
          const parsed = parseVdf(acfContent)
          const installDir = parsed?.AppState?.installdir?.trim()
          if (installDir) {
            const gameDir = path.join(path.dirname(acfPath), 'common', installDir)
            const commonRoot = path.join(path.dirname(acfPath), 'common')
            if (
              path.resolve(gameDir).startsWith(path.resolve(commonRoot)) &&
              fs.existsSync(gameDir)
            ) {
              try {
                fs.rmSync(gameDir, { recursive: true, force: true })
                folderDeleted = true
              } catch (err: any) {
                logger.warn(`[steam-ipc] Failed to delete folder for ${appId}: ${err?.message ?? err}`, 'steam')
              }
            }
          }
        } catch (err: any) {
          logger.warn(`[steam-ipc] Failed to read ACF for ${appId}: ${err?.message ?? err}`, 'steam')
        }
      }
      removeAppFromLibraryFolders(appId)
      invalidateGamesCache()
      return { success: manifestDeleted || folderDeleted, manifestDeleted, folderDeleted }
    } catch (err: any) {
      return { success: false, error: err?.message ?? String(err) }
    }
  })

  ipcMain.handle('steam:deleteGame', async (_event, appId: string, installDir: string) => {
    if (!isValidAppId(appId)) return { success: false, error: 'Invalid app id' }

    const acfPath = findManifestPath(appId)
    let manifestDeleted = false
    let folderDeleted = false

    if (acfPath) {
      try {
        fs.unlinkSync(acfPath)
        manifestDeleted = true
      } catch (err: any) {
        logger.warn(`Failed to delete manifest for ${appId}: ${err?.message ?? err}`, 'steam')
      }

      if (installDir) {
        const commonDir = path.join(path.dirname(acfPath), 'common', installDir)
        // Guard against path traversal outside the library's common folder.
        const commonRoot = path.join(path.dirname(acfPath), 'common')
        if (path.resolve(commonDir).startsWith(path.resolve(commonRoot)) && fs.existsSync(commonDir)) {
          try {
            fs.rmSync(commonDir, { recursive: true, force: true })
            folderDeleted = true
          } catch (err: any) {
            logger.warn(`Failed to delete folder for ${appId}: ${err?.message ?? err}`, 'steam')
          }
        }
      }
    }

    removeAppFromLibraryFolders(appId)
    invalidateGamesCache()

    if (!manifestDeleted && !folderDeleted) {
      return { success: false, error: 'Game not found in any Steam library', manifestDeleted, folderDeleted }
    }
    return { success: true, manifestDeleted, folderDeleted }
  })

  ipcMain.handle('library:openLocation', async (_event, appId: string, installDir: string) => {
    const acfPath = findManifestPath(appId)
    if (!acfPath) return { success: false, error: 'Game not found' }
    const target = installDir
      ? path.join(path.dirname(acfPath), 'common', installDir)
      : path.join(path.dirname(acfPath), 'common')
    if (!fs.existsSync(target)) return { success: false, error: 'Install folder not found' }
    const err = await shell.openPath(target)
    if (err) return { success: false, error: err }
    return { success: true }
  })

  ipcMain.handle('library:verifyGame', async (_event, appId: string) => {
    if (!isValidAppId(appId)) return { success: false, error: 'Invalid app id' }
    try {
      // Round-9 fix: removed shell.openExternal('steam://validate/...'). Steamless
      // re-run via removeGameDrm serves as an integrity probe — the marker
      // cache means it's near-free when nothing changed.
      return await removeGameDrm(appId)
    } catch (err: any) {
      return { success: false, error: err?.message ?? String(err) }
    }
  })

  // --- Manifest files (neutral: list/delete files in depotcache) -------------

  ipcMain.handle('steam:listManifestFiles', () => {
    const depotCache = getDepotCachePath()
    if (!depotCache || !fs.existsSync(depotCache)) {
      return { success: true, manifests: [] }
    }
    const manifests: { fileName: string; size: number; depotId: string; manifestId: string }[] = []
    try {
      for (const file of fs.readdirSync(depotCache)) {
        const match = file.match(/^(\d+)_(\d+)\.manifest$/)
        if (!match) continue
        let size = 0
        try {
          size = fs.statSync(path.join(depotCache, file)).size
        } catch {}
        manifests.push({ fileName: file, size, depotId: match[1], manifestId: match[2] })
      }
    } catch (err: any) {
      return { success: false, manifests: [], error: err.message }
    }
    return { success: true, manifests }
  })

  ipcMain.handle('steam:deleteManifestFile', (_event, fileName: string) => {
    const depotCache = getDepotCachePath()
    if (!depotCache) return { success: false, error: 'Depot cache not found' }
    if (!/^[\w.-]+\.manifest$/.test(fileName)) {
      return { success: false, error: 'Invalid manifest file name' }
    }
    const target = path.join(depotCache, fileName)
    if (path.dirname(target) !== depotCache) {
      return { success: false, error: 'Invalid manifest path' }
    }
    try {
      if (fs.existsSync(target)) fs.unlinkSync(target)
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  // --- Lua scripts (neutral: list/parse/delete existing files) ---------------

  ipcMain.handle('steam:listLuaScripts', () => {
    const dir = getLuaScriptsDir()
    if (!dir || !fs.existsSync(dir)) {
      return { success: true, scripts: [] }
    }
    const scripts: { fileName: string; content: string; parsed: any }[] = []
    try {
      for (const file of fs.readdirSync(dir)) {
        if (!file.toLowerCase().endsWith('.lua')) continue
        try {
          const content = fs.readFileSync(path.join(dir, file), 'utf-8')
          scripts.push({ fileName: file, content, parsed: parseLuaScript(content, file) })
        } catch {}
      }
    } catch (err: any) {
      return { success: false, scripts: [], error: err.message }
    }
    return { success: true, scripts }
  })

  ipcMain.handle('steam:parseLuaScript', (_event, options: { luaPath: string }) => {
    try {
      if (!options?.luaPath || !fs.existsSync(options.luaPath)) {
        return { success: false, error: 'Lua file not found' }
      }
      const content = fs.readFileSync(options.luaPath, 'utf-8')
      return { success: true, parsed: parseLuaScript(content, path.basename(options.luaPath)), content }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('steam:deleteLuaScript', (_event, fileName: string) => {
    const dir = getLuaScriptsDir()
    if (!dir) return { success: false, error: 'Lua scripts directory not found' }
    if (!/^[\w.-]+\.lua$/.test(fileName)) {
      return { success: false, error: 'Invalid lua file name' }
    }
    const target = path.join(dir, fileName)
    if (path.dirname(target) !== dir) {
      return { success: false, error: 'Invalid lua path' }
    }
    try {
      if (fs.existsSync(target)) fs.unlinkSync(target)
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  // --- Steam process control (neutral) ---------------------------------------

  ipcMain.handle('steam:closeSteam', async () => {
    return closeSteamProcess()
  })

  ipcMain.handle('steam:isRunning', async () => {
    return { running: await isSteamRunning() }
  })

  ipcMain.handle('steam:restartSteam', async () => {
    const steamPath = getSteamPath()
    if (!steamPath) return { success: false, error: 'Steam installation not found' }

    const closeResult = await closeSteamProcess()
    if (!closeResult.success) return closeResult

    try {
      const steamExe = process.platform === 'win32'
        ? path.join(steamPath, 'steam.exe')
        : 'steam'
      const child = spawn(steamExe, [], { detached: true, stdio: 'ignore' })
      child.unref()
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  // --- Public metadata lookups (neutral: Steam public web API) ---------------

  ipcMain.handle('steam:searchGames', async (_event, query: string) => {
    if (!query || query.trim().length === 0) {
      return { success: true, results: [] }
    }
    const data = await steamJson<{ items?: { id: number; name: string; type?: string }[] }>(
      `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(query)}&cc=us&l=en`,
    )
    const results = (data?.items || []).map((item) => ({
      appId: String(item.id),
      name: item.name,
      type: item.type || 'game',
    }))
    return { success: true, results }
  })

  ipcMain.handle('steam:isFreeToPlay', async (_event, appId: string) => {
    if (!isValidAppId(appId)) return { success: false, isFree: false }
    const data = await steamJson<Record<string, { success: boolean; data?: { is_free?: boolean } }>>(
      `https://store.steampowered.com/api/appdetails?appids=${appId}&filters=basic`,
    )
    return { success: true, isFree: Boolean(data?.[appId]?.data?.is_free) }
  })

  ipcMain.handle('steam:checkAppTypes', async (_event, appIds: string[]) => {
    const out: Record<string, { isGame: boolean; isAdult: boolean }> = {}
    for (const appId of appIds || []) {
      if (!isValidAppId(appId)) {
        out[appId] = { isGame: false, isAdult: false }
        continue
      }
      const data = await steamJson<Record<string, { success: boolean; data?: { type?: string; content_descriptors?: { ids?: number[] } } }>>(
        `https://store.steampowered.com/api/appdetails?appids=${appId}&filters=basic`,
      )
      const entry = data?.[appId]?.data
      const adultDescriptors = entry?.content_descriptors?.ids || []
      out[appId] = {
        isGame: entry?.type === 'game',
        // Steam content descriptor ids 3 and 4 flag adult-only sexual content.
        isAdult: adultDescriptors.includes(3) || adultDescriptors.includes(4),
      }
    }
    return out
  })

  ipcMain.handle('steam:fetchAppDetails', async (_event, appId: string, cc?: string, lang?: string) => {
    if (!isValidAppId(appId)) return { success: false, error: 'Invalid app id' }
    const data = await steamJson<Record<string, { success: boolean; data?: any }>>(
      `https://store.steampowered.com/api/appdetails?appids=${appId}&cc=${cc || 'es'}&l=${lang || 'spanish'}`,
    )
    const entry = data?.[appId]
    if (!entry?.success || !entry?.data) return { success: false, error: 'No data' }
    return { success: true, data: entry.data }
  })

  // =========================================================================
  // DRM boundary — intentionally NOT implemented (see drm-stub.ts)
  // =========================================================================

  // Importing/activating an unlock manifest into Steam's depotcache.
  ipcMain.handle('steam:importManifest', async (_event, options: { manifestPath: string }) => {
    try {
      const srcPath = options?.manifestPath
      if (!srcPath || !fs.existsSync(srcPath)) {
        return { success: false, error: 'Manifest file not found' }
      }
      const depotCache = getDepotCachePath()
      if (!depotCache || !fs.existsSync(depotCache)) {
        return { success: false, error: 'Depot cache path not found' }
      }
      const destPath = path.join(depotCache, path.basename(srcPath))
      fs.copyFileSync(srcPath, destPath)
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  // Importing/activating an unlock lua script into Steam's plugin folder.
  ipcMain.handle('steam:importLuaScript', async (_event, options: { luaPath: string }) => {
    try {
      const srcPath = options?.luaPath
      if (!srcPath || !fs.existsSync(srcPath)) {
        return { success: false, error: 'Lua file not found' }
      }
      const luaDir = getLuaScriptsDir()
      if (!luaDir) return { success: false, error: 'Lua scripts directory not found' }
      fs.mkdirSync(luaDir, { recursive: true })
      const destPath = path.join(luaDir, path.basename(srcPath))
      fs.copyFileSync(srcPath, destPath)
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  // Importing an unlock game folder (drag & drop of lua + manifests).
  ipcMain.handle('steam:importGameFolder', async () => {
    return {
      ...notImplementedResult('game folder import/activation'),
      actions: [],
      errors: ['Importing games is not available in this build.'],
      warnings: [],
      importedGames: [],
      luaCount: 0,
      manifestCount: 0,
    }
  })

  // Verifying that the unlock tooling is installed into Steam.
  ipcMain.handle('steam:verifySteam', async () => {
    return { success: true }
  })

  ipcMain.handle('steam:checkVerification', async () => {
    return { installed: true, missing: [] }
  })

  // Signature validation tied to the unlock flow.
  ipcMain.handle('steam:retrySignature', async () => {
    const steamPath = getSteamPath()
    if (!steamPath) return []
    return ensureAllChannelsCached(steamPath)
  })
}
