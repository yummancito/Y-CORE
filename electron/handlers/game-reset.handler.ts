import { ipcMain } from 'electron'
import { resetGameForDownload } from '../services/game-reset.service'
import { logger } from '../logger'

export function registerGameResetHandlers() {
  ipcMain.handle('game:reset-for-download', async (event, appId: string) => {
    try {
      logger.info(`[game-reset] Reset requested for appId=${appId}`, 'game-reset')
      const result = resetGameForDownload(appId)
      return result
    } catch (err: any) {
      logger.error(`[game-reset] Handler error: ${err.message}`, 'game-reset')
      return { success: false, message: err.message }
    }
  })
}
