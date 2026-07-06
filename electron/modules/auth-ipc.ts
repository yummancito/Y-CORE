import { app, ipcMain, safeStorage, BrowserWindow } from 'electron'
import path from 'path'
import fs from 'fs'
import { logger } from '../logger'
import { state } from '../state'

const AUTH_FILE = path.join(app.getPath('userData'), 'ycore-auth.json')

export function loadAuthSession(): void {
  try {
    if (fs.existsSync(AUTH_FILE)) {
      const raw = fs.readFileSync(AUTH_FILE)
      let jsonStr: string
      if (safeStorage.isEncryptionAvailable()) {
        try {
          jsonStr = safeStorage.decryptString(raw)
        } catch {
          jsonStr = raw.toString('utf-8')
          logger.info('Auth file was plaintext, will re-encrypt on next save', 'auth')
        }
      } else {
        jsonStr = raw.toString('utf-8')
      }
      const data = JSON.parse(jsonStr)
      if (data && data.access_token && data.refresh_token) {
        state.authSession = { access_token: data.access_token, refresh_token: data.refresh_token }
        logger.info('Auth session loaded from disk', 'auth')
      }
    }
  } catch {
    // Corrupt or missing file — ignore
  }
}

export function saveAuthSession(): void {
  try {
    if (state.authSession) {
      const jsonStr = JSON.stringify(state.authSession)
      if (safeStorage.isEncryptionAvailable()) {
        const encrypted = safeStorage.encryptString(jsonStr)
        fs.writeFileSync(AUTH_FILE, encrypted, { mode: 0o600 })
      } else {
        fs.writeFileSync(AUTH_FILE, jsonStr, { encoding: 'utf-8', mode: 0o600 })
      }
    } else {
      if (fs.existsSync(AUTH_FILE)) {
        fs.unlinkSync(AUTH_FILE)
      }
    }
  } catch {
    // Non-fatal — session won't persist across restarts
  }
}

export function getApiUrl(): string {
  const DEFAULT_API_URL = process.env.VITE_YCORE_API_URL || 'http://localhost:3000'
  try {
    const configPath = path.join(app.getPath('userData'), 'ycore-config.json')
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
      if (config.apiUrl && typeof config.apiUrl === 'string') {
        return config.apiUrl
      }
    }
  } catch {}
  return DEFAULT_API_URL
}

export async function refreshAuthToken(): Promise<boolean> {
  if (state.refreshInProgress) return state.refreshInProgress
  if (!state.authSession?.refresh_token) return false

  state.refreshInProgress = (async () => {
    try {
      const resp = await fetch(`${getApiUrl()}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: state.authSession!.refresh_token }),
      })

      if (!resp.ok) {
        logger.warn(`Token refresh failed: HTTP ${resp.status}`, 'auth')
        return false
      }

      const data = await resp.json() as { access_token: string; refresh_token: string }
      state.authSession = { access_token: data.access_token, refresh_token: data.refresh_token }
      saveAuthSession()
      logger.info('Token refreshed in Electron main process', 'auth')

      state.mainWindow?.webContents.send('auth:tokenRefreshed', {
        access_token: data.access_token,
      })

      return true
    } catch (err: any) {
      logger.error(`Token refresh error: ${err.message}`, 'auth')
      return false
    } finally {
      state.refreshInProgress = null
    }
  })()

  return state.refreshInProgress
}

export function registerAuthHandlers(
  callbacks: {
    showMainWindow: () => void
    createLoginWindow: () => void
  }
): void {
  ipcMain.removeHandler('auth:logout')
  ipcMain.handle('auth:logout', async () => {
    logger.info('Logout requested, hiding main window and showing login', 'auth')
    if (state.authSession?.refresh_token) {
      try {
        await fetch(`${getApiUrl()}/api/auth/logout`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${state.authSession.access_token}`,
          },
          body: JSON.stringify({ refresh_token: state.authSession.refresh_token }),
        })
      } catch {
        // Non-fatal — token will expire naturally
      }
    }
    state.authSession = null
    saveAuthSession()
    if (state.mainWindow && !state.mainWindow.isDestroyed()) {
      state.mainWindow.hide()
    }
    if (!state.loginWindow || state.loginWindow.isDestroyed()) {
      callbacks.createLoginWindow()
    } else {
      state.loginWindow.show()
      state.loginWindow.focus()
    }
  })

  ipcMain.removeHandler('auth:loginSuccess')
  ipcMain.handle('auth:loginSuccess', () => {
    logger.info('Login successful, reloading main window and closing login', 'app')
    if (state.loginWindow && !state.loginWindow.isDestroyed()) {
      state.loginWindow.close()
      state.loginWindow = null
    }
    state.mainWindow?.reload()
    callbacks.showMainWindow()
  })

  ipcMain.removeHandler('auth:setSession')
  ipcMain.handle('auth:setSession', (_event, session: { access_token: string; refresh_token: string } | null) => {
    state.authSession = session
    saveAuthSession()
    if (session) {
      logger.info('Auth session stored in main process', 'auth')
    } else {
      logger.info('Auth session cleared from main process', 'auth')
    }
  })

  ipcMain.removeHandler('auth:getAccessToken')
  ipcMain.handle('auth:getAccessToken', async () => {
    if (!state.authSession) return null
    return state.authSession.access_token
  })

  ipcMain.removeHandler('auth:isAuthenticated')
  ipcMain.handle('auth:isAuthenticated', () => {
    return state.authSession !== null
  })

  ipcMain.removeHandler('auth:refreshToken')
  ipcMain.handle('auth:refreshToken', async () => {
    const success = await refreshAuthToken()
    if (success && state.authSession) {
      return state.authSession.access_token
    }
    return null
  })
}
