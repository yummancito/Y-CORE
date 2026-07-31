/**
 * Mods Service Wrapper
 * Exposes mod management operations through the service registry
 * Integrates with Steam Workshop API, database, and installer
 */

import { steamWorkshopService } from './steam-workshop.service'
import { modsDatabaseService } from './mods-database.service'
import { modInstaller } from '../modules/mod-manager/mod-installer'
import type {
  ModSearchQuery,
  ModInstallOptions,
  ModUninstallOptions,
} from '../common/mod-types'

export const modsService = {
  // ── Search & Discovery ───────────────────────────────────────────────────

  async searchCatalog(query: ModSearchQuery) {
    const result = await steamWorkshopService.searchMods(query)
    return {
      success: true,
      mods: result.mods || [],
    }
  },

  async getDetails(fileId: string) {
    return steamWorkshopService.getModDetails(fileId)
  },

  async listInstalled(gameAppId: string) {
    return modsDatabaseService.getGameMods(gameAppId)
  },

  // ── Installation ─────────────────────────────────────────────────────────

  async install(modDetails: any, options: ModInstallOptions, onProgress?: (progress: any) => void) {
    return modInstaller.installMod(modDetails, options, onProgress)
  },

  async uninstall(options: ModUninstallOptions) {
    return modInstaller.uninstallMod(options)
  },

  async enable(modId: string) {
    return modInstaller.enableMod(modId)
  },

  async disable(modId: string) {
    return modInstaller.disableMod(modId)
  },

  // ── Queries & Statistics ─────────────────────────────────────────────────

  async searchInstalled(query: string, gameAppId?: string) {
    return modsDatabaseService.searchMods(query, gameAppId)
  },

  async queryMods(gameAppId: string, filters?: any) {
    return modsDatabaseService.queryMods(gameAppId, filters)
  },

  async getStatistics(gameAppId: string) {
    return modsDatabaseService.getStatistics(gameAppId)
  },

  async getBackups(modId: string) {
    return modsDatabaseService.getModBackups(modId)
  },

  // ── Cache Management ─────────────────────────────────────────────────────

  async getCacheStats() {
    return steamWorkshopService.getCacheStats()
  },

  async clearCache() {
    steamWorkshopService.clearCache()
    return { success: true }
  },
}
