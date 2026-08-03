// ============================================================================
// electron/handlers/fix-installer.handler.ts
// ============================================================================
// IPC handlers para descargar e instalar game fixes desde DepotBox
// ============================================================================

import { ipcMain } from 'electron'
import { fixInstallerService } from '../services/fix-installer.service'
import { logger } from '../logger'

export function registerFixInstallerHandlers(): void {
  // Descargar y aplicar fix directamente al juego
  ipcMain.handle(
    'fix-installer:downloadAndApply',
    async (
      _event,
      fixId: string,
      gameInstallDir: string,
      fixType: 'online' | 'bypass' | 'hypervisor' = 'online'
    ) => {
      try {
        logger.info(`[IPC] fix-installer:downloadAndApply called for ${fixId}`, 'fix-installer')
        const result = await fixInstallerService.downloadAndApplyFix(fixId, gameInstallDir, fixType)
        return result
      } catch (err: any) {
        logger.error(`[IPC] fix-installer:downloadAndApply error: ${err.message}`, 'fix-installer')
        return {
          success: false,
          message: 'Failed to install fix',
          error: err.message,
        }
      }
    }
  )

  // Solo descargar (sin aplicar)
  ipcMain.handle('fix-installer:downloadFix', async (_event, fixId: string) => {
    try {
      const result = await fixInstallerService.downloadFix(fixId)
      return result
    } catch (err: any) {
      logger.error(`[IPC] fix-installer:downloadFix error: ${err.message}`, 'fix-installer')
      return {
        success: false,
        error: err.message,
      }
    }
  })
}
