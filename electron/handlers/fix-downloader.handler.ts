import { ipcMain } from 'electron'
import { downloadAndApplyFix } from '../services/fix-downloader.service'
import { logger } from '../logger'
import { getApiUrl } from '../modules/auth-ipc'

export function registerFixDownloaderHandlers() {
  ipcMain.handle('fix:download-and-apply', async (event, appId: string, fixId: string) => {
    try {
      const apiKey = process.env.DEPOTBOX_API_KEY
      if (!apiKey) {
        logger.error('[fix-downloader] DEPOTBOX_API_KEY not set', 'fix-downloader')
        return { success: false, message: 'API key not configured' }
      }

      logger.info(`[fix-downloader] Starting download for appId=${appId}, fixId=${fixId}`, 'fix-downloader')
      const result = await downloadAndApplyFix(appId, fixId, apiKey)

      if (result.success) {
        logger.info(`[fix-downloader] Success: ${result.message}`, 'fix-downloader')
      } else {
        logger.error(`[fix-downloader] Failed: ${result.message}`, 'fix-downloader')
      }

      return result
    } catch (err: any) {
      logger.error(`[fix-downloader] Handler error: ${err.message}`, 'fix-downloader')
      return { success: false, message: err.message }
    }
  })
}
