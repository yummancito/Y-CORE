// ============================================================================
// electron/services/update.service.ts — Backend UpdateService
// ============================================================================

import { app } from 'electron'
import fs from 'fs'
import path from 'path'
import https from 'https'
import { spawn } from 'child_process'
import { logger } from '../logger'
import { getNativeDiagnostics } from '../modules/ycore-native'

export const updateService = {
  async installUpdate(): Promise<void> {
    logger.info('Update install requested from service', 'updater')
  },

  async getNativeDiagnostics() {
    try {
      return getNativeDiagnostics()
    } catch (err: any) {
      return { isAvailable: false, mismatch: false, failureReason: String(err?.message ?? err) }
    }
  },

  async manualDownloadUpdate(url: string): Promise<{ path: string }> {
    const tmpDir = app.getPath('temp')
    const installerPath = path.join(tmpDir, 'y-core-update.exe')

    return new Promise<{ path: string }>((resolve, reject) => {
      const file = fs.createWriteStream(installerPath)
      const req = https.get(url, (response) => {
        if (response.statusCode === 302 || response.statusCode === 301) {
          response.destroy()
          const location = response.headers.location
          if (!location || typeof location !== 'string') {
            file.close()
            if (fs.existsSync(installerPath)) fs.unlinkSync(installerPath)
            reject(new Error('Redirect without valid location header'))
            return
          }
          resolve(updateService.manualDownloadUpdate(location))
          return
        }
        if (!response.statusCode || response.statusCode >= 400) {
          file.close()
          if (fs.existsSync(installerPath)) fs.unlinkSync(installerPath)
          reject(new Error(`HTTP ${response.statusCode}`))
          return
        }
        response.pipe(file)
        file.on('finish', () => {
          file.close()
          resolve({ path: installerPath })
        })
      })
      req.on('error', (err: Error) => {
        file.close()
        if (fs.existsSync(installerPath)) fs.unlinkSync(installerPath)
        reject(err)
      })
    })
  },

  async runManualInstaller(installerPath: string): Promise<void> {
    logger.info(`Running manual installer: ${installerPath}`, 'updater')
    spawn(installerPath, ['/S'], { detached: true, stdio: 'ignore' }).unref()
    app.quit()
  },
}
