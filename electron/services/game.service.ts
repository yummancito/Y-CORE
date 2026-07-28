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
import { patchGameFolder } from '../modules/local-steam-emulator'
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

    if (state.gamesCache) {
      return { success: true, games: state.gamesCache }
    }

    const games: any[] = []
    const folders = getSteamLibraryFolders()
    for (const folder of folders) {
      let entries: string[] = []
      try { entries = fs.readdirSync(folder) } catch { continue }
      for (const entry of entries) {
        if (!entry.startsWith('appmanifest_') || !entry.endsWith('.acf')) continue
        const acfPath = path.join(folder, entry)
        try {
          const content = fs.readFileSync(acfPath, 'utf-8')
          const parsed = parseVdf(content)
          const appState = parsed['AppState']
          if (!appState) continue

          const appId = String(appState.appid || '').trim()
          if (!appId || !isValidAppId(appId)) continue

          const name = appState.name?.trim() || appId
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
    state.gamesCache = games
    return { success: true, games }
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
        const resp = await fetch(
          `https://store.steampowered.com/api/appdetails?appids=${g.appId}`,
          { headers: { 'User-Agent': 'Y-core' } }
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
        const r = await this.listInstalled()
        games = (r as any).games ?? []
      }
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

      // 2. Patch the game folder — only proceed if the emulator DLL is
      //    available. Without it, the game's steam_api64.dll probe will
      //    fail and the exe will refuse to start. This is the root of the
      //    "DLLs aren't loading" symptom from the user.
      const patch = patchGameFolder(fullGameDir, String(appId))
      if (!patch.success) {
        logger.warn(
          `[game.service] native launch: patchGameFolder falló para ${appId}: ${patch.error}. ` +
          `¿Está compilada ycore_steam.dll? (ejecuta scripts/build-ycore-steam.bat)`,
          'launch',
        )
        return {
          success: false,
          error: patch.error ?? 'No se pudo parchear la carpeta del juego',
          mode: 'native',
          hint: '¿Está compilada ycore_steam.dll? Si no, ejecuta scripts/build-ycore-steam.bat o cambia a modo Steam en Ajustes.',
        }
      }
      if (patch.warnings?.length) {
        for (const w of patch.warnings) logger.warn(`[game.service] patch warning: ${w}`, 'launch')
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
    return await this.deleteGame(appId, '')
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
      const resp = await fetch(
        `https://store.steampowered.com/api/storesearch?term=${encodeURIComponent(query)}&cc=US&l=en`,
        { headers: { 'User-Agent': 'Y-core' } }
      )
      if (!resp.ok) return []
      const data = await resp.json()
      return (data.items || []).map((i: any) => ({ appId: String(i.id), name: i.name }))
    } catch { return [] }
  },

  async isFreeToPlay(appId: string) {
    try {
      const resp = await fetch(
        `https://store.steampowered.com/api/appdetails?appids=${appId}`,
        { headers: { 'User-Agent': 'Y-core' } }
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
  async getSteamDetails(appId: string): Promise<import('../common/ipc-contract').SteamAppDetails | null> {
    const cached = steamDetailsCache.get(appId)
    if (cached) return cached
    const fetchOne = async (locale: 'spanish' | 'english') => {
      const ctl = new AbortController()
      const timer = setTimeout(() => ctl.abort(), 7000)
      try {
        const resp = await fetch(
          `https://store.steampowered.com/api/appdetails?appids=${appId}&l=${locale}`,
          { headers: { 'User-Agent': 'Y-core' }, signal: ctl.signal },
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
