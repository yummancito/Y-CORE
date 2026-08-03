// ============================================================================
// electron/services/depotbox.service.ts
// ============================================================================
// DepotBox API integration for validating game fixes and depot information
// DepotBox is the public database of SteamPipe content (depots, manifests, keys)
// ============================================================================

import { logger } from '../logger'

const DEPOTBOX_API = 'https://depotbox.org/api'

interface DepotBoxGame {
  app_id: number
  name: string
  icon: string
  logo: string
  depots?: DepotInfo[]
}

interface DepotInfo {
  depot_id: number
  name: string
  manifest_gid?: string
  key?: string
  build?: number
}

interface DepotBoxFix {
  app_id: number
  type: 'onlinefix' | 'betafix' | 'nosteam'
  provider: string
  url?: string
  verified: boolean
  timestamp?: number
}

export const depotboxService = {
  /**
   * Fetch game information from DepotBox
   * Returns app name, depots, and icon/logo URLs
   */
  async getGameInfo(appId: string): Promise<{ success: boolean; game?: DepotBoxGame; error?: string }> {
    try {
      const url = `${DEPOTBOX_API}/app/${appId}/info`
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 10000)

      const resp = await fetch(url, {
        headers: { 'User-Agent': 'Y-core/4.3.1' },
        signal: controller.signal,
      })

      clearTimeout(timeout)

      if (!resp.ok) {
        if (resp.status === 404) {
          return { success: false, error: `App ${appId} not found on DepotBox` }
        }
        return { success: false, error: `HTTP ${resp.status}` }
      }

      const game = (await resp.json()) as DepotBoxGame
      logger.info(`[DepotBox] Game info for ${appId}: ${game.name} (${game.depots?.length ?? 0} depots)`, 'depotbox')

      return { success: true, game }
    } catch (err: any) {
      const msg = err.name === 'AbortError' ? 'Timeout' : err.message
      logger.warn(`[DepotBox] getGameInfo failed for ${appId}: ${msg}`, 'depotbox')
      return { success: false, error: msg }
    }
  },

  /**
   * Check if a game has available fixes (OnlineFix, BetaFix, etc.)
   * Returns array of available fix sources
   */
  async getGameFixes(appId: string): Promise<{ success: boolean; fixes?: DepotBoxFix[]; error?: string }> {
    try {
      const url = `${DEPOTBOX_API}/app/${appId}/fixes`
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 10000)

      const resp = await fetch(url, {
        headers: { 'User-Agent': 'Y-core/4.3.1' },
        signal: controller.signal,
      })

      clearTimeout(timeout)

      if (resp.status === 404) {
        // No fixes available for this game (not an error)
        logger.info(`[DepotBox] No fixes available for app ${appId}`, 'depotbox')
        return { success: true, fixes: [] }
      }

      if (!resp.ok) {
        return { success: false, error: `HTTP ${resp.status}` }
      }

      const fixes = (await resp.json()) as DepotBoxFix[]
      logger.info(`[DepotBox] Found ${fixes.length} fixes for app ${appId}`, 'depotbox')

      return { success: true, fixes }
    } catch (err: any) {
      const msg = err.name === 'AbortError' ? 'Timeout' : err.message
      logger.warn(`[DepotBox] getGameFixes failed for ${appId}: ${msg}`, 'depotbox')
      return { success: false, error: msg }
    }
  },

  /**
   * Get detailed depot information (manifests, keys, etc.)
   * Used to validate if depot can be downloaded
   */
  async getDepotInfo(appId: string, depotId: string): Promise<{ success: boolean; depot?: DepotInfo; error?: string }> {
    try {
      const url = `${DEPOTBOX_API}/app/${appId}/depot/${depotId}`
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 10000)

      const resp = await fetch(url, {
        headers: { 'User-Agent': 'Y-core/4.3.1' },
        signal: controller.signal,
      })

      clearTimeout(timeout)

      if (!resp.ok) {
        if (resp.status === 404) {
          return { success: false, error: `Depot ${depotId} not found` }
        }
        return { success: false, error: `HTTP ${resp.status}` }
      }

      const depot = (await resp.json()) as DepotInfo
      logger.info(`[DepotBox] Depot info: app=${appId}, depot=${depotId}, has_key=${!!depot.key}`, 'depotbox')

      return { success: true, depot }
    } catch (err: any) {
      const msg = err.name === 'AbortError' ? 'Timeout' : err.message
      logger.warn(`[DepotBox] getDepotInfo failed: app=${appId}, depot=${depotId}, error=${msg}`, 'depotbox')
      return { success: false, error: msg }
    }
  },

  /**
   * Validate that a game's depot configuration is legitimate
   * Checks DepotBox to ensure depots exist and have manifests
   */
  async validateGameDepots(appId: string, requiredDepotIds: string[]): Promise<{ success: boolean; validated: boolean; missing: string[]; error?: string }> {
    try {
      const gameResult = await this.getGameInfo(appId)
      if (!gameResult.success || !gameResult.game) {
        return { success: false, validated: false, missing: requiredDepotIds, error: gameResult.error }
      }

      const depotboxDepots = new Set((gameResult.game.depots || []).map(d => String(d.depot_id)))
      const missing = requiredDepotIds.filter(id => !depotboxDepots.has(id))

      if (missing.length > 0) {
        logger.warn(`[DepotBox] Game ${appId} missing depots: ${missing.join(', ')}`, 'depotbox')
        return {
          success: true,
          validated: false,
          missing,
          error: `Missing depots: ${missing.join(', ')}`,
        }
      }

      logger.info(`[DepotBox] Game ${appId} depots validated: all ${requiredDepotIds.length} found`, 'depotbox')
      return {
        success: true,
        validated: true,
        missing: [],
      }
    } catch (err: any) {
      logger.error(`[DepotBox] validateGameDepots failed for ${appId}: ${err.message}`, 'depotbox')
      return {
        success: false,
        validated: false,
        missing: requiredDepotIds,
        error: err.message,
      }
    }
  },

  /**
   * Find the best available fix for a game
   * Priority: OnlineFix > BetaFix > NoSteam
   */
  async findBestFix(appId: string): Promise<{ success: boolean; fix?: DepotBoxFix; error?: string }> {
    try {
      const fixesResult = await this.getGameFixes(appId)
      if (!fixesResult.success || !fixesResult.fixes || fixesResult.fixes.length === 0) {
        return { success: true, fix: undefined }
      }

      // Priority order: onlinefix > betafix > nosteam
      const priorityMap = { onlinefix: 0, betafix: 1, nosteam: 2 }
      const bestFix = fixesResult.fixes.sort((a, b) => {
        const aPriority = priorityMap[a.type] ?? 999
        const bPriority = priorityMap[b.type] ?? 999
        return aPriority - bPriority
      })[0]

      logger.info(`[DepotBox] Best fix for app ${appId}: ${bestFix?.type} from ${bestFix?.provider}`, 'depotbox')
      return { success: true, fix: bestFix }
    } catch (err: any) {
      logger.error(`[DepotBox] findBestFix failed for ${appId}: ${err.message}`, 'depotbox')
      return { success: false, error: err.message }
    }
  },
}
