/**
 * API Proxy Handler
 * Routes API calls through Electron main process to avoid CORS issues
 * The main process can make HTTP calls without browser CORS restrictions
 */

import { ipcMain } from 'electron'
import { logger } from '../logger'

export function registerApiProxyHandlers() {
  /**
   * Proxy fetch requests through main process
   * IPC Call: ipcRenderer.invoke('api:fetch', url, options)
   */
  ipcMain.handle('api:fetch', async (_event, url: string, options?: any) => {
    try {
      if (!url || typeof url !== 'string') {
        return { success: false, error: 'Invalid URL' }
      }

      logger.debug(`API Proxy: GET ${url}`, 'api-proxy')

      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 10000) // 10s timeout

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'User-Agent': 'Y-Core/3.0',
          'Accept': 'application/json',
          ...options?.headers,
        },
        signal: controller.signal,
      })

      clearTimeout(timeout)

      if (!response.ok) {
        logger.warn(`API Proxy: HTTP ${response.status} from ${url}`, 'api-proxy')
        return {
          success: false,
          status: response.status,
          error: `HTTP ${response.status}`,
        }
      }

      const data = await response.json()
      logger.debug(`API Proxy: Success from ${url}`, 'api-proxy')

      return {
        success: true,
        data,
        status: response.status,
      }
    } catch (err: any) {
      const error = err instanceof Error ? err.message : String(err)
      logger.error(`API Proxy failed for ${url}: ${error}`, 'api-proxy')

      return {
        success: false,
        error,
        status: 0,
      }
    }
  })
}
