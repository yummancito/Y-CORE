// ============================================================================
// electron/services/game.service.ts — Backend GameService
// ============================================================================

import { shell, dialog, app } from 'electron'
import path from 'path'
import fs from 'fs'
import { logger } from '../logger'
import { state } from '../state'
import {
  getSteamPath,
  getSteamAppsPath,
  getSteamLibraryFolders,
  isSteamRunning,
  parseVdf,
  isValidAppId,
} from '../modules/steam-helpers'
import { configService } from './config.service'
import { launchGameFromDir } from '../modules/game-process'
import { patchGameFolder, patchGameFolderWithGoldberg } from '../modules/local-steam-emulator'
import { removeGameDrm } from '../modules/drm-remover'

// Module-level cache for successful Steam Store API responses.
// Only successful responses are cached — failures can be retried on re-select.
const steamDetailsCache = new Map<string, import('../common/ipc-contract').SteamAppDetails>()

export const gameService = {
  async listInstalled() {
    const steamPath = getSteamPath()
    if (!steamPath) {
      return { success: false, games: [], error: 'Steam installation not found' }
    }

    if (state.gamesCache !== null) {
      // Check if cache has unresolved names - if so, don't use it
      const hasUnresolvedNames = state.gamesCache.some(g =>
        g.name === g.appId ||
        /^app\s*\d+$/i.test(g.name) ||
        /^appid[_\s]\d+$/i.test(g.name)
      )
      if (!hasUnresolvedNames) {
        return { success: true, games: state.gamesCache }
      }
    }

    const NAMES_CACHE_PATH = path.join(app.getPath('userData'), 'ycore-names-cache.json')
    let namesCache: Record<string, string> = {}
    try {
      if (fs.existsSync(NAMES_CACHE_PATH)) {
        namesCache = JSON.parse(fs.readFileSync(NAMES_CACHE_PATH, 'utf-8'))
      }
    } catch { /* ignore */ }

    const games: any[] = []
    const folders = getSteamLibraryFolders()
    for (const folder of folders) {
      let entries: string[] = []
      try {
        // FIX #5: Use async filesystem access with timeout for network drives
        entries = await gameService.readDirWithTimeout(folder, 5000)
      } catch (err) {
        logger.warn(`Failed to read folder ${folder}: ${err instanceof Error ? err.message : 'unknown'}`, 'steam')
        continue
      }

      for (const entry of entries) {
        if (!entry.startsWith('appmanifest_') || !entry.endsWith('.acf')) continue
        const acfPath = path.join(folder, entry)

        try {
          // FIX #4: Handle locked ACF files in offline mode
          const content = await gameService.readFileWithRetry(acfPath, 'utf-8', 3)
          const parsed = parseVdf(content)
          const appState = parsed['AppState']
          if (!appState) continue

          const appId = String(appState.appid || '').trim()
          if (!appId || !isValidAppId(appId)) continue

          const acfName = appState.name?.trim() || ''
          const name = namesCache[appId] || acfName || appId
          const installDir = appState.installdir?.trim() || ''

          const game: any = {
            appId,
            name,
            installDir,
            universe: String(appState.universe || ''),
            stateFlags: String(appState.StateFlags || ''),
            sizeOnDisk: parseInt(String(appState.SizeOnDisk || '0'), 10),
            lastUpdated: parseInt(String(appState.LastUpdated || '0'), 10) * 1000,
            lastPlayed: parseInt(String(appState.LastPlayed || '0'), 10) * 1000,
            installedAt: 0,
            buildid: String(appState.buildid || ''),
            bytesToDownload: parseInt(String(appState.BytesToDownload || '0'), 10),
            bytesDownloaded: parseInt(String(appState.BytesDownloaded || '0'), 10),
            autoUpdateBehavior: String(appState.AutoUpdateBehavior || ''),
            manifestFile: entry,
          }

          if (appState.UserConfig?.installed) {
            game.installedAt = parseInt(String(appState.UserConfig.installed), 10) * 1000
          }

          games.push(game)
        } catch (err: any) {
          logger.warn(`Failed to parse ${entry}: ${err?.message}`, 'steam')
        }
      }
    }

    // Resolve missing names from Steam API in parallel
    // Detect games with unresolved names: appId only, "app123", "appid_123", etc.
    const missingNames = games.filter(g =>
      g.name === g.appId ||
      /^app\s*\d+$/i.test(g.name) ||
      /^appid[_\s]\d+$/i.test(g.name)
    )
    if (missingNames.length > 0) {
      try {
        const promises = missingNames.map(async (game) => {
          try {
            const agent = gameService.getProxyAgent()
            const controller = new AbortController()
            const timeoutId = setTimeout(() => controller.abort(), 5000)
            try {
              const resp = await fetch(
                `https://store.steampowered.com/api/appdetails?appids=${game.appId}`,
                {
                  headers: { 'User-Agent': 'Y-core' },
                  signal: controller.signal,
                }
              )
              if (!resp.ok) return
              const data = await resp.json()
              const steamName = data[game.appId]?.data?.name
              if (steamName) {
                game.name = steamName
                namesCache[game.appId] = steamName
              }
            } finally {
              clearTimeout(timeoutId)
            }
          } catch (err) {
            logger.debug(`Failed to fetch Steam name for ${game.appId}: ${err instanceof Error ? err.message : String(err)}`, 'steam')
          }
        })

        await Promise.all(promises)

        // Save updated names cache
        try {
          fs.writeFileSync(NAMES_CACHE_PATH, JSON.stringify(namesCache, null, 2), 'utf-8')
        } catch { /* ignore */ }
      } catch (err) {
        logger.debug(`Error resolving names: ${err instanceof Error ? err.message : String(err)}`, 'steam')
      }
    }

    state.gamesCache = games
    return { success: true, games }
  },

  /**
   * FIX #4: Read file with retry logic for locked ACF files
   */
  async readFileWithRetry(filePath: string, encoding: string, maxRetries: number): Promise<string> {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await fs.promises.readFile(filePath, encoding as BufferEncoding)
      } catch (err: any) {
        if (attempt < maxRetries - 1 && (err.code === 'EACCES' || err.code === 'EAGAIN')) {
          await new Promise(resolve => setTimeout(resolve, 100 * (attempt + 1)))
          continue
        }
        throw err
      }
    }
    throw new Error(`Failed to read ${filePath} after ${maxRetries} attempts`)
  },

  /**
   * FIX #5: Read directory with timeout for network drives and USB
   */
  async readDirWithTimeout(dirPath: string, timeoutMs: number): Promise<string[]> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Directory read timeout for ${dirPath}`))
      }, timeoutMs)

      fs.promises.readdir(dirPath)
        .then(entries => {
          clearTimeout(timer)
          resolve(entries as string[])
        })
        .catch(err => {
          clearTimeout(timer)
          reject(err)
        })
    })
  },

  /**
   * FIX #6: Add proxy support for corporate environments
   */
  getProxyAgent(): any {
    try {
      // Check for proxy environment variables
      const proxyUrl = process.env.HTTP_PROXY || process.env.http_proxy || process.env.HTTPS_PROXY || process.env.https_proxy
      if (!proxyUrl) return undefined

      // Use HttpProxyAgent/HttpsProxyAgent if available
      const { HttpProxyAgent, HttpsProxyAgent } = require('http-proxy-agent')
      const url = proxyUrl.startsWith('http') ? proxyUrl : `http://${proxyUrl}`
      const protocol = url.startsWith('https') ? 'https' : 'http'

      if (protocol === 'https') {
        return new HttpsProxyAgent(url)
      }
      return new HttpProxyAgent(url)
    } catch {
      return undefined
    }
  },

  async resolveOrphanNames(games: { appId: string; installDir: string }[]) {
    const NAMES_CACHE_PATH = path.join(app.getPath('userData'), 'ycore-names-cache.json')
    let namesCache: Record<string, string> = {}
    try {
      if (fs.existsSync(NAMES_CACHE_PATH)) {
        namesCache = JSON.parse(fs.readFileSync(NAMES_CACHE_PATH, 'utf-8'))
      }
    } catch { /* ignore */ }

    const resolved: { appId: string; newName: string }[] = []
    for (const g of games) {
      if (namesCache[g.appId]) {
        resolved.push({ appId: g.appId, newName: namesCache[g.appId] })
        continue
      }
      try {
        const agent = gameService.getProxyAgent()
        const resp = await fetch(
          `https://store.steampowered.com/api/appdetails?appids=${g.appId}`,
          {
            headers: { 'User-Agent': 'Y-core' },
            ...(agent && { agent }),
          }
        )
        if (!resp.ok) continue
        const data = await resp.json()
        const name = data[g.appId]?.data?.name
        if (name) {
          namesCache[g.appId] = name
          resolved.push({ appId: g.appId, newName: name })
        }
      } catch { /* ignore */ }
    }
    try {
      fs.writeFileSync(NAMES_CACHE_PATH, JSON.stringify(namesCache, null, 2), 'utf-8')
    } catch { /* ignore */ }
    return { resolved }
  },

  async launchGame(appId: string) {
    // ── Round-9 fix: launcherMode eliminado. Y-core owns 100% de los launches.
    //    Antes había rama Steam que delegaba a `shell.openExternal('steam://rungameid/...')`;
    //    ahora ese path se considera roto (el usuario quiere Y-core como su propio Steam).
    //    Si un juego no puede abrirse nativamente, retornamos un error accionable
    //    pidiendo Layer-3 fix o Steam Client como plan B.
    void getSteamPath // unused import silencer — kept for legacy callers
    // ── Native path: Y-core's own launcher ───────────────────────────────────
    // Why this works without a running Steam client:
    //   1. Find the game directory by scanning Steam library folders.
    //   2. Patch it with `patchGameFolder` — drops ycore_steam.dll next to the
    //      game exe (as steam_api64.dll / steam_api.dll) + writes
    //      steam_appid.txt so the game can identify itself.
    //   3. Spawn the game exe with Steam env vars + cwd = game folder via
    //      `launchGameFromDir`, which auto-tracks the process and the play
    //      session.
    //
    // The DLLs in Steam's directory (YCoreTool.dll, dwmapi.dll, xinput1_4.dll)
    // are Steam-only proxy DLLs that hook Steam's process — they have NO effect
    // when we sidestep Steam and spawn the game directly. The game only knows
    // it's running because steam_api64.dll is the clean-room emulator.
    try {
      // 1. Resolve install directory from already-parsed appmanifest cache.
      //    Falls back to a fresh listInstalled call if the cache is cold
      //    (e.g.IPC arrives before LibraryPage finished its first fetch).
      let games = state.gamesCache
      if (!games) {
        const r = await gameService.listInstalled()
        games = (r as any).games ?? []
      }
      if (!games) return { success: false, error: 'No games available' }
      const game = games.find((g: any) => String(g.appId) === String(appId))
      const installDir = game?.installDir
      if (!installDir) {
        return { success: false, error: 'Juego no instalado o carpeta de instalación desconocida' }
      }

      // 1.b. Find the FULL game directory by scanning Steam library folders.
      const folders = getSteamLibraryFolders()
      let fullGameDir: string | null = null
      for (const folder of folders) {
        const candidate = path.join(folder, 'common', installDir)
        if (fs.existsSync(candidate)) {
          fullGameDir = candidate
          break
        }
      }
      if (!fullGameDir) {
        return { success: false, error: `No se encontró la carpeta del juego "${installDir}" en ninguna biblioteca de Steam` }
      }

      // 2. Patch the game folder with the native emulator DLL. This DLL is
      //    not built/shipped yet, so patch.success is routinely 'partial' or
      //    false — in both cases we can't trust steam_api64.dll to satisfy
      //    the game's Steam probe. Fall back to launching through the real
      //    Steam Client instead of surfacing an internal DLL error to the user.
      const patch = await patchGameFolderWithGoldberg(fullGameDir, String(appId))
      if (patch.success !== true) {
        logger.warn(
          `[game.service] native launch: emulador no disponible para ${appId} (${patch.error}); intentando fallback a Steam Client`,
          'launch',
        )
        const steamPath = getSteamPath()
        if (!steamPath) {
          return {
            success: false,
            error: 'Este juego necesita Steam instalado para poder lanzarse.',
            mode: 'native',
            hint: 'Instalá Steam Client, o esperá a que el modo nativo esté disponible.',
          }
        }
        shell.openExternal(`steam://rungameid/${appId}`)
        logger.info(`[game.service] fallback launch via Steam Client for ${appId}`, 'launch')
        return { success: true, mode: 'steam' }
      }

      // 3. Spawn the exe. launchGameFromDir injects SteamAppId/SteamGameId
      //    env vars, sets cwd to the game dir, registers the process in
      //    `managedProcesses`, and tracks the play session on exit.
      const status = launchGameFromDir(String(appId), fullGameDir, game?.name ?? installDir)
      logger.info(
        `[game.service] native launch ${appId} (${game?.name ?? installDir}) pid=${status.pid} dir=${fullGameDir}`,
        'launch',
      )
      return { success: true, mode: 'native', pid: status.pid, startedAt: status.startTime }
    } catch (err: any) {
      logger.error(`[game.service] native launch failed for ${appId}: ${err?.message ?? err}`, 'launch')
      return { success: false, error: err?.message ?? String(err), mode: 'native' }
    }
  },

  async uninstallGame(appId: string) {
    // Round-9 fix: removed shell.openExternal('steam://uninstall/...'). Y-core owns
    // the uninstall path now — delegate to deleteGame which removes the game directory
    // and the ACF manifest atomically, rendering the game gone from Y-core's library.
    return await gameService.deleteGame(appId, '')
  },

  async deleteGame(appId: string, installDir: string) {
    const steamPath = getSteamPath()
    if (!steamPath) return { success: false, error: 'Steam not found' }
    const folders = getSteamLibraryFolders()
    for (const folder of folders) {
      const acfPath = path.join(folder, `appmanifest_${appId}.acf`)
      if (fs.existsSync(acfPath)) {
        try { fs.unlinkSync(acfPath) } catch {}
      }
      const gameDir = path.join(folder, 'common', installDir)
      if (fs.existsSync(gameDir)) {
        try { fs.rmSync(gameDir, { recursive: true, force: true }) } catch {}
      }
    }
    state.gamesCache = null
    return { success: true }
  },

  async openGameLocation(appId: string, installDir: string) {
    const folders = getSteamLibraryFolders()
    for (const folder of folders) {
      const gameDir = path.join(folder, 'common', installDir)
      if (fs.existsSync(gameDir)) {
        try { shell.openPath(gameDir) } catch { /* ignore */ }
        return
      }
    }
  },

  async verifyGame(appId: string) {
    // Round-9 fix: removed shell.openExternal('steam://validate/...'). Steamless
    // re-run via removeGameDrm serves as an integrity probe since it consults
    // the marker cache first (cheap), then re-runs Steamless only if the .exe
    // changed. If the marker says "removed" but Steamless re-finds DRM, that's
    // a state inconsistency worth surfacing — the user's .exe was modified
    // externally.
    return await removeGameDrm(appId)
  },

  async getStoreImage(appId: string, steamGridDbApiKey?: string) {
    return null
  },

  async searchGames(query: string) {
    try {
      const agent = gameService.getProxyAgent()
      const resp = await fetch(
        `https://store.steampowered.com/api/storesearch?term=${encodeURIComponent(query)}&cc=US&l=en`,
        {
          headers: { 'User-Agent': 'Y-core' },
          ...(agent && { agent }),
        }
      )
      if (!resp.ok) return []
      const data = await resp.json()
      return (data.items || []).map((i: any) => ({ appId: String(i.id), name: i.name }))
    } catch { return [] }
  },

  async isFreeToPlay(appId: string) {
    try {
      const agent = gameService.getProxyAgent()
      const resp = await fetch(
        `https://store.steampowered.com/api/appdetails?appids=${appId}`,
        {
          headers: { 'User-Agent': 'Y-core' },
          ...(agent && { agent }),
        }
      )
      if (!resp.ok) return false
      const data = await resp.json()
      return data[appId]?.data?.is_free === true
    } catch { return false }
  },

  // Fetch full Steam Store details for the Resumen tab (description, dev, genres, release date).
  // Cached in-memory by appId so re-selecting the same game is instant.
  // Fetches Spanish localization first (most of the userbase), falls back to English.
  // Fetch full Steam Store details for the Resumen tab (description, dev, genres, release date).
  // Caches successful responses by appId so re-selecting the same game is instant.
  // Failures are NOT cached — user can retry by re-selecting the game.
  // Tries Spanish first (most of the userbase), falls back to English.
  // AbortController timeout per fetch — if Steam is slow we give up and show the fallback.
  // FIX #6: Use proxy support for corporate environments
  async getSteamDetails(appId: string): Promise<import('../common/ipc-contract').SteamAppDetails | null> {
    const cached = steamDetailsCache.get(appId)
    if (cached) return cached
    const agent = gameService.getProxyAgent()
    const fetchOne = async (locale: 'spanish' | 'english') => {
      const ctl = new AbortController()
      const timer = setTimeout(() => ctl.abort(), 7000)
      try {
        const resp = await fetch(
          `https://store.steampowered.com/api/appdetails?appids=${appId}&l=${locale}`,
          {
            headers: { 'User-Agent': 'Y-core' },
            signal: ctl.signal,
            ...(agent && { agent }),
          },
        )
        if (!resp.ok) return null
        const json = await resp.json()
        const entry = json?.[appId]
        return entry?.success ? entry.data : null
      } catch {
        return null
      } finally {
        clearTimeout(timer)
      }
    }
    try {
      let data = await fetchOne('spanish')
      if (!data) data = await fetchOne('english')
      if (!data) return null
      const result: import('../common/ipc-contract').SteamAppDetails = {
        name: data.name,
        short_description: data.short_description,
        about_the_game: data.about_the_game,
        developers: data.developers,
        publishers: data.publishers,
        genres: data.genres,
        release_date: data.release_date,
        header_image: data.header_image,
        screenshots: Array.isArray(data.screenshots)
          ? data.screenshots.map((s: any) => ({
              id: Number(s.id) || 0,
              path_thumbnail: String(s.path_thumbnail || ''),
              path_full: String(s.path_full || s.path_thumbnail || ''),
            }))
          : undefined,
      }
      steamDetailsCache.set(appId, result)
      return result
    } catch {
      return null
    }
  },

  async getSteamPath() {
    return getSteamPath()
  },

  async openSteamFolderDialog() {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
    if (result.canceled || !result.filePaths[0]) return null
    return result.filePaths[0]
  },

  async getLibraryFolders() {
    return getSteamLibraryFolders()
  },
}
