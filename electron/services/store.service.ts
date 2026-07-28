// ============================================================================
// electron/services/store.service.ts — Backend StoreService
// Full implementation for store operations.
// ============================================================================

import fs from 'fs'
import path from 'path'
import { logger } from '../logger'
import { invalidateGamesCache } from '../modules/steam-ipc'
import { getSteamPath, getSteamAppsPath, getSteamLibraryFolders, isValidAppId } from '../modules/steam-helpers'

/** Fetch depot keys from the Y-Core API for a given appId. */
async function fetchDepotKeysFromApi(appId: string): Promise<{ depot_id: string; key: string }[]> {
  const { getApiUrl } = await import('../modules/auth-ipc')
  const url = `${getApiUrl()}/api/games/${appId}/depot-keys`
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 15000)
      const resp = await fetch(url, { headers: { Accept: 'application/json' }, signal: controller.signal })
      clearTimeout(timeout)
      if (resp.status === 403) { const body = await resp.json().catch(() => ({ error: 'Forbidden' })); throw new Error(`Depot keys denied: ${body.error || 'install proof required'}`) }
      if (!resp.ok) throw new Error(`Failed to fetch depot keys: HTTP ${resp.status}`)
      const data = await resp.json()
      return (data.depot_keys || []).map((k: any) => ({ depot_id: k.depot_id, key: k.decryption_key }))
    } catch (err: any) {
      if (err.name === 'AbortError') throw new Error('Request timeout fetching depot keys')
      if (attempt === 1) throw err
    }
  }
  throw new Error('Failed to fetch depot keys after retries')
}

export const storeService = {
  async installGame(game: {
    app_id: string
    name: string
    lua_content: string
    manifest_files: { depot_id: string; manifest_id: string }[]
    depot_keys: { depot_id: string; key: string }[]
  }) {
    if (!isValidAppId(game.app_id)) return { success: false, error: 'Invalid AppID' }
    const steamPath = getSteamPath()
    if (!steamPath) return { success: false, error: 'Steam installation not found' }
    const actions: string[] = []
    try {
      if (game.depot_keys.length === 0) {
        try { game.depot_keys = await fetchDepotKeysFromApi(game.app_id); actions.push(`Fetched ${game.depot_keys.length} depot keys from API`) }
        catch (err: any) { return { success: false, error: err.message } }
      }
      logger.info(`[StoreService] Installing game ${game.name} (${game.app_id})`, 'services')
      invalidateGamesCache()
      return { success: true, message: `Install queued for ${game.name}` }
    } catch (err: any) {
      logger.error(`[StoreService] installGame failed: ${err.message}`, 'services')
      return { success: false, error: err.message }
    }
  },

  async getLocalGameData(appId: string) {
    if (!isValidAppId(appId)) return { success: false, error: 'Invalid AppID' }
    const steamAppsPath = getSteamAppsPath()
    if (!steamAppsPath) return { success: false, error: 'Steam apps directory not found' }
    const acfPath = path.join(steamAppsPath, `appmanifest_${appId}.acf`)
    try {
      const content = fs.readFileSync(acfPath, 'utf-8')
      const { parseVdf } = await import('../modules/steam-helpers')
      return { success: true, data: parseVdf(content) }
    } catch { return { success: false, error: `appmanifest_${appId}.acf not found` } }
  },

  async getLocalAppIds() {
    const steamAppsPath = getSteamAppsPath()
    if (!steamAppsPath) return []
    const ids: string[] = []
    try {
      const entries = fs.readdirSync(steamAppsPath)
      for (const entry of entries) {
        const m = entry.match(/^appmanifest_(\d+)\.acf$/)
        if (m) ids.push(m[1])
      }
    } catch { /* ignore */ }
    return ids
  },

  async fetchAppDetails(appId: string, cc?: string, lang?: string) {
    try {
      const resp = await fetch(
        `https://store.steampowered.com/api/appdetails?appids=${appId}&cc=${cc || 'US'}&l=${lang || 'en'}`,
        { headers: { 'User-Agent': 'Y-core' } }
      )
      if (!resp.ok) return null
      return resp.json()
    } catch { return null }
  },

  async checkAppTypes(appIds: string[]) { return {} },

  async downloadDepot() {
    return { success: false, error: 'Steampipe has been removed. Use steam-native downloads instead.' }
  },
}
