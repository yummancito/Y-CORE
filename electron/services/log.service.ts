// ============================================================================
// electron/services/log.service.ts — Backend LogService
// ============================================================================

import { dialog } from 'electron'
import { logger, type LogLevel } from '../logger'
import { state } from '../state'

export const logService = {
  async getEntries(filter?: { level?: LogLevel; search?: string; limit?: number }) {
    return logger.getEntries(filter)
  },

  async add(entry: { level?: string; message: string }) {
    const level = (entry.level || 'INFO').toUpperCase()
    if (level === 'ERROR') logger.error(entry.message, 'renderer')
    else if (level === 'WARN') logger.warn(entry.message, 'renderer')
    else if (level === 'DEBUG') logger.debug(entry.message, 'renderer')
    else logger.info(entry.message, 'renderer')
    return { success: true }
  },

  async clear() {
    logger.clear()
    return { success: true }
  },

  async export() {
    const win = state.mainWindow
    if (!win) return { success: false, error: 'No main window' }
    const result = await dialog.showSaveDialog(win, {
      title: 'Export Logs',
      defaultPath: `ycore-logs-${Date.now()}.log`,
      filters: [{ name: 'Log files', extensions: ['log'] }],
    })
    if (result.canceled || !result.filePath) return { success: false, canceled: true }
    const exportResult = logger.export(result.filePath)
    return exportResult
  },

  async getConfig() {
    return logger.getConfig()
  },

  async setConfig(partial: any) {
    logger.setConfig(partial)
    return { success: true }
  },
}
