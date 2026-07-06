import { app, ipcMain } from 'electron'
import path from 'path'
import fs from 'fs'
import { logger } from '../logger'
import { state } from '../state'

const USERNAME_FILE = path.join(app.getPath('userData'), 'ycore-username.json')

export function loadUsername(): void {
  try {
    if (fs.existsSync(USERNAME_FILE)) {
      const raw = fs.readFileSync(USERNAME_FILE, 'utf-8')
      const data = JSON.parse(raw)
      if (data && data.username) {
        state.username = data.username
        logger.info(`Username loaded from disk: ${data.username}`, 'auth')
      }
    }
  } catch {
    // Corrupt or missing file — ignore
  }
}

export function saveUsername(): void {
  try {
    if (state.username) {
      fs.writeFileSync(USERNAME_FILE, JSON.stringify({ username: state.username }), { encoding: 'utf-8', mode: 0o600 })
    } else {
      if (fs.existsSync(USERNAME_FILE)) {
        fs.unlinkSync(USERNAME_FILE)
      }
    }
  } catch {
    // Non-fatal — username won't persist across restarts
  }
}

export function getApiUrl(): string {
  const DEFAULT_API_URL = app.isPackaged
    ? 'https://y-core-render-api.onrender.com'
    : (process.env.VITE_YCORE_API_URL || 'http://localhost:3000')
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

export function registerAuthHandlers(
  callbacks: {
    showMainWindow: () => void
    createLoginWindow: () => void
  }
): void {
  ipcMain.removeHandler('auth:logout')
  ipcMain.handle('auth:logout', async () => {
    logger.info('Logout requested, hiding main window and showing login', 'auth')
    state.username = null
    saveUsername()
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

  ipcMain.removeHandler('auth:setUsername')
  ipcMain.handle('auth:setUsername', (_event, username: string | null) => {
    state.username = username
    saveUsername()
    if (username) {
      logger.info(`Username set: ${username}`, 'auth')
    } else {
      logger.info('Username cleared', 'auth')
    }
  })

  ipcMain.removeHandler('auth:getUsername')
  ipcMain.handle('auth:getUsername', () => {
    return state.username || null
  })

  ipcMain.removeHandler('auth:isAuthenticated')
  ipcMain.handle('auth:isAuthenticated', () => {
    return state.username !== null
  })
}
