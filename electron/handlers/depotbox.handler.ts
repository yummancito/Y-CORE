// ============================================================================
// electron/handlers/depotbox.handler.ts
// ============================================================================
// IPC handlers for DepotBox queries (game info, fixes, depot validation)
// ============================================================================

import { ipcMain } from 'electron'
import { depotboxService } from '../services/depotbox.service'
import { logger } from '../logger'

export function registerDepotboxHandlers(): void {
  // Get game info from DepotBox (name, depots, icon)
  ipcMain.handle('depotbox:getGameInfo', async (_event, appId: string) => {
    try {
      const result = await depotboxService.getGameInfo(appId)
      return result
    } catch (err: any) {
      logger.error(`[DepotBox IPC] getGameInfo error: ${err.message}`, 'depotbox')
      return { success: false, error: err.message }
    }
  })

  // Get available fixes for a game
  ipcMain.handle('depotbox:getGameFixes', async (_event, appId: string) => {
    try {
      const result = await depotboxService.getGameFixes(appId)
      return result
    } catch (err: any) {
      logger.error(`[DepotBox IPC] getGameFixes error: ${err.message}`, 'depotbox')
      return { success: false, error: err.message }
    }
  })

  // Get depot info
  ipcMain.handle('depotbox:getDepotInfo', async (_event, appId: string, depotId: string) => {
    try {
      const result = await depotboxService.getDepotInfo(appId, depotId)
      return result
    } catch (err: any) {
      logger.error(`[DepotBox IPC] getDepotInfo error: ${err.message}`, 'depotbox')
      return { success: false, error: err.message }
    }
  })

  // Validate game depots against DepotBox
  ipcMain.handle('depotbox:validateGameDepots', async (_event, appId: string, depotIds: string[]) => {
    try {
      const result = await depotboxService.validateGameDepots(appId, depotIds)
      return result
    } catch (err: any) {
      logger.error(`[DepotBox IPC] validateGameDepots error: ${err.message}`, 'depotbox')
      return { success: false, validated: false, missing: depotIds, error: err.message }
    }
  })

  // Find best fix for a game
  ipcMain.handle('depotbox:findBestFix', async (_event, appId: string) => {
    try {
      const result = await depotboxService.findBestFix(appId)
      return result
    } catch (err: any) {
      logger.error(`[DepotBox IPC] findBestFix error: ${err.message}`, 'depotbox')
      return { success: false, error: err.message }
    }
  })
}
