// ============================================================================
// electron/services/steamcmd.service.ts — Backend SteamCmdService
// ============================================================================

import { logger } from '../logger'

export const steamcmdService = {
  async start(opts: any) {
    try {
      const { startSteamCmdInstall } = await import('../modules/steamcmd-manager')
      return await startSteamCmdInstall(opts)
    } catch (err: any) {
      logger.error(`[SteamCmdService] start failed: ${err.message}`, 'services')
      return { success: false, error: err.message }
    }
  },

  async cancel(appId: string) {
    try {
      const { cancelSteamCmdInstall } = await import('../modules/steamcmd-manager')
      return cancelSteamCmdInstall(appId)
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  },

  async isAvailable() {
    try {
      const { isSteamCmdAvailable } = await import('../modules/steamcmd-manager')
      return isSteamCmdAvailable()
    } catch {
      return false
    }
  },

  async fetch() {
    try {
      const { fetchSteamCmd } = await import('../modules/steamcmd-fetcher')
      const result = await fetchSteamCmd({})
      return result
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  },

  async list() {
    try {
      const { getActiveJobs } = await import('../modules/steamcmd-manager')
      return getActiveJobs()
    } catch {
      return []
    }
  },
}
