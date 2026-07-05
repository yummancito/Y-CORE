import { ipcMain } from 'electron'
import path from 'path'
import fs from 'fs'

import { logger } from '../logger'
import { state } from '../state'
import {
  getSteamPath,
  getSteamAppsPath,
  getLuaScriptsDir,
  getDepotCachePath,
  pathExists,
  isValidAppId,
} from './steam-helpers'
import { parseLuaScript, type ParsedLuaAppId, type ParsedLuaManifest } from './lua'
import { ensureGoldSrcBaseDepots } from './goldsrc'
import { getApiUrl, refreshAuthToken } from './auth-ipc'
import { smartManifestSync, installGameCore, fetchGameName } from './manifest-sync'

async function fetchDepotKeys(appId: string): Promise<{ depot_id: string; key: string }[]> {
  if (!state.authSession?.access_token) {
    throw new Error('Authentication required. Please log in to install games.')
  }

  const steamAppsPath = getSteamAppsPath()
  if (steamAppsPath) {
    const acfPath = path.join(steamAppsPath, `appmanifest_${appId}.acf`)
    if (!fs.existsSync(acfPath)) {
      logger.warn(`appmanifest_${appId}.acf not found at ${acfPath} — depot keys will be denied`, 'auth')
    }
  }

  const url = `${getApiUrl()}/api/games/${appId}/depot-keys`
  let tokenRefreshed = false

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 15000)

      const resp = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${state.authSession.access_token}`,
          'Accept': 'application/json',
        },
        signal: controller.signal,
      })
      clearTimeout(timeout)

      if (resp.status === 401 && !tokenRefreshed && state.authSession?.refresh_token) {
        tokenRefreshed = true
        const refreshed = await refreshAuthToken()
        if (refreshed) {
          attempt--
          continue
        }
        throw new Error('Authentication failed (token expired, refresh failed)')
      }

      if (resp.status === 403) {
        const body = await resp.json().catch(() => ({ error: 'Forbidden' }))
        throw new Error(`Depot keys denied: ${body.error || 'install proof required'}`)
      }

      if (!resp.ok) {
        throw new Error(`Failed to fetch depot keys: HTTP ${resp.status}`)
      }

      const data = await resp.json()
      return (data.depot_keys || []).map((k: any) => ({
        depot_id: k.depot_id,
        key: k.decryption_key,
      }))
    } catch (err: any) {
      if (err.name === 'AbortError') throw new Error('Request timeout fetching depot keys')
      if (attempt === 1) throw err
    }
  }

  throw new Error('Failed to fetch depot keys after retries')
}

interface StoreGameData {
  app_id: string
  name: string
  lua_content: string
  manifest_files: { depot_id: string; manifest_id: string }[]
  depot_keys: { depot_id: string; key: string }[]
}

export function registerStoreHandlers(invalidateGamesCache: () => void): void {
  ipcMain.handle('store:installGame', async (_event, game: StoreGameData) => {
    if (!isValidAppId(game.app_id)) {
      return { success: false, error: 'Invalid AppID' }
    }
    const steamPath = getSteamPath()
    if (!steamPath) {
      return { success: false, error: 'Steam installation not found' }
    }

    const actions: string[] = []
    const errors: string[] = []
    const warnings: string[] = []

    try {
      if (game.depot_keys.length === 0) {
        try {
          game.depot_keys = await fetchDepotKeys(game.app_id)
          actions.push(`Fetched ${game.depot_keys.length} depot keys from API`)
        } catch (err: any) {
          return { success: false, error: err.message, actions, errors: [err.message] }
        }
      }

      const parsedForValidation = parseLuaScript(game.lua_content, `${game.app_id}.lua`)
      const keyDepotIds = new Set(game.depot_keys.map(k => k.depot_id))
      const missingKeyDepots = parsedForValidation.appIds
        .filter((a: ParsedLuaAppId) => a.id !== game.app_id && !a.key && !keyDepotIds.has(a.id))
        .map((a: ParsedLuaAppId) => a.id)
      if (missingKeyDepots.length > 0) {
        errors.push(`Missing depot keys for: ${missingKeyDepots.join(', ')}. Steam cannot decrypt these depots.`)
      }

      logger.info(
        `Installing ${game.name} (${game.app_id}) from store. Depots: ${parsedForValidation.appIds.length}, Keys: ${game.depot_keys.length}, Manifests: ${game.manifest_files.length}`,
        'store'
      )
      for (const k of game.depot_keys) {
        logger.info(`Depot key: ${k.depot_id} (value redacted)`, 'store')
      }
      for (const m of game.manifest_files) {
        logger.info(`Manifest: ${m.depot_id}_${m.manifest_id}`, 'store')
      }

      const syncResult = await smartManifestSync(game.app_id, game.lua_content, game.depot_keys)
      let finalLuaContent = syncResult.updatedLua
      for (const a of syncResult.actions) actions.push(a)
      for (const w of syncResult.warnings) warnings.push(w)

      const baseDepotResult = ensureGoldSrcBaseDepots(game.app_id, finalLuaContent, game.depot_keys)
      if (baseDepotResult.addedDepotKeys.length > 0) {
        finalLuaContent = baseDepotResult.updatedLua
        game.depot_keys.push(...baseDepotResult.addedDepotKeys)
        actions.push(
          `Added ${baseDepotResult.addedDepotKeys.length} Half-Life base depots from ${baseDepotResult.source}`
        )
      }
      if (baseDepotResult.warning) {
        warnings.push(baseDepotResult.warning)
      }

      if (game.manifest_files.length > 0) {
        actions.push(`Manifests: ${game.manifest_files.length} GIDs in Lua`)
      }

      const coreResult = await installGameCore(game.app_id, game.name, finalLuaContent, game.depot_keys, steamPath)
      for (const a of coreResult.actions) actions.push(a)
      for (const e of coreResult.errors) errors.push(e)
      for (const w of coreResult.warnings) warnings.push(w)

      invalidateGamesCache()

      const message = actions.join(' | ') + (warnings.length > 0 ? ' | WARNINGS: ' + warnings.join('; ') : '')
      const success = errors.length === 0
      if (!success) {
        logger.error(`storeInstallGame failed for ${game.app_id}: ${errors.join('; ')}`, 'store')
      }
      return {
        success,
        actions,
        errors,
        warnings,
        message,
        importedGames: [{ appId: game.app_id, name: game.name }],
      }
    } catch (err: any) {
      return { success: false, error: `Failed to install: ${err.message}` }
    }
  })

  ipcMain.handle('store:getLocalGameData', async (_event, appId: string) => {
    if (!isValidAppId(appId)) {
      return { success: false, error: 'Invalid AppID' }
    }
    const scriptsDir = getLuaScriptsDir()
    const depotCachePath = getDepotCachePath()
    if (!scriptsDir || !depotCachePath) {
      return { success: false, error: 'Steam installation not found' }
    }

    try {
      const luaFileName = `${appId}.lua`
      const luaPath = path.join(scriptsDir, luaFileName)
      let luaContent = ''
      if (await pathExists(luaPath)) {
        luaContent = await fs.promises.readFile(luaPath, 'utf-8')
      } else {
        const allLua = (await fs.promises.readdir(scriptsDir)).filter(f => f.endsWith('.lua'))
        const contentMap = new Map<string, string>()
        await Promise.all(
          allLua.map(async (f) => {
            const content = await fs.promises.readFile(path.join(scriptsDir, f), 'utf-8')
            contentMap.set(f, content)
          })
        )
        for (const [f, content] of Array.from(contentMap.entries())) {
          if (content.includes(`addappid(${appId}`)) {
            luaContent = content
            break
          }
        }
      }

      if (!luaContent) {
        return { success: false, error: 'No Lua script found for this AppID' }
      }

      const parsed = parseLuaScript(luaContent, luaFileName)
      const depotKeys = parsed.appIds.filter((a: ParsedLuaAppId) => a.key).map((a: ParsedLuaAppId) => ({
        depot_id: a.id,
        key: a.key!,
      }))

      const manifestFiles = parsed.manifestIds.map((mf: ParsedLuaManifest) => ({
        depot_id: mf.depotId,
        manifest_id: mf.manifestId,
      }))

      const gameName = await fetchGameName(appId)

      return {
        success: true,
        game: {
          app_id: appId,
          name: gameName,
          lua_content: luaContent,
          manifest_files: manifestFiles,
          depot_keys: depotKeys,
        },
      }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('store:getLocalAppIds', async () => {
    const scriptsDir = getLuaScriptsDir()
    const steamAppsPath = getSteamAppsPath()
    const appIds = new Set<string>()

    if (scriptsDir) {
      try {
        const luaFiles = (await fs.promises.readdir(scriptsDir)).filter(f => f.endsWith('.lua'))
        for (const f of luaFiles) {
          const match = f.match(/^(\d+)\.lua$/)
          if (match) appIds.add(match[1])
        }
      } catch {}
    }

    if (steamAppsPath) {
      try {
        const acfFiles = (await fs.promises.readdir(steamAppsPath)).filter(f => /^appmanifest_\d+\.acf$/.test(f))
        for (const f of acfFiles) {
          const match = f.match(/^appmanifest_(\d+)\.acf$/)
          if (match) appIds.add(match[1])
        }
      } catch {}
    }

    return { success: true, appIds: Array.from(appIds) }
  })
}
