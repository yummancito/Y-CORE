import {
  detectSaves, detectSavesWithFallback, createBackup, restoreBackup,
  listBackups, deleteBackup,
} from '../modules/save-manager'
import type { SaveEntry } from '../modules/save-manager'

export const saveManagerService = {
  async detectSaves(appId: string, gameName: string) {
    return detectSaves(appId, gameName)
  },
  async detectSavesWithFallback(appId: string, gameName: string, installDir?: string) {
    return detectSavesWithFallback(appId, gameName, installDir)
  },
  async createBackup(appId: string, saves: SaveEntry[], name?: string) {
    return createBackup(appId, saves, name)
  },
  async restoreBackup(backup: any) {
    return restoreBackup(backup)
  },
  async listBackups(appId: string) {
    return listBackups(appId)
  },
  async deleteBackup(backup: any) {
    return deleteBackup(backup)
  },
}
