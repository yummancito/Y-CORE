import { ipcMain, BrowserWindow, dialog } from 'electron'
import { logger } from '../logger'

export function registerLogHandlers(getMainWindow: () => BrowserWindow | null) {
  ipcMain.handle('logs:getEntries', async (_event, filter?: {
    level?: string
    search?: string
    limit?: number
    source?: string
  }) => {
    return logger.getEntries(filter as any)
  })

  ipcMain.handle('logs:add', async (_event, entry: { level?: string; message: string }) => {
    const level = (entry.level || 'INFO').toUpperCase()
    const msg = entry.message
    if (level === 'ERROR') logger.error(msg, 'renderer')
    else if (level === 'WARN') logger.warn(msg, 'renderer')
    else if (level === 'DEBUG') logger.debug(msg, 'renderer')
    else logger.info(msg, 'renderer')
    return { success: true }
  })

  ipcMain.handle('logs:clear', async () => {
    logger.clear()
    return { success: true }
  })

  ipcMain.handle('logs:export', async () => {
    const win = getMainWindow()
    if (!win) return { success: false, error: 'No main window' }
    const result = await dialog.showSaveDialog(win, {
      title: 'Export Logs',
      defaultPath: `ycore-logs-${Date.now()}.log`,
      filters: [{ name: 'Log files', extensions: ['log'] }],
    })
    if (result.canceled || !result.filePath) return { success: false, canceled: true }
    return logger.export(result.filePath)
  })

  ipcMain.handle('logs:getConfig', async () => {
    return logger.getConfig()
  })

  ipcMain.handle('logs:setConfig', async (_event, partial: any) => {
    return logger.setConfig(partial)
  })
}
