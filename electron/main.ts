import 'dotenv/config'
import { app, BrowserWindow, ipcMain, Menu, dialog } from 'electron'
import path from 'path'
import fs from 'fs'
import os from 'os'
import { logger } from './logger'
import { autoUpdater } from 'electron-updater'
import { state, setIsQuitting } from './state'

// Modular IPC handlers
import { loadUsername, registerAuthHandlers, saveUsername } from './modules/auth-ipc'
import {
  createSplashWindow,
  createLoginWindow,
  createWindow,
  createTray,
  showMainWindow,
  registerAppHandlers,
} from './modules/windows'
import { registerSteamHandlers, invalidateGamesCache } from './modules/steam-ipc'
import { registerStoreHandlers } from './modules/store-ipc'
import { registerLogHandlers } from './modules/logs'
import { registerConfigHandlers } from './modules/config'
import { registerStoreImageHandlers } from './modules/store-images'
import { registerOnlineFixHandlers } from './modules/onlinefix'
import { startAcfWatcher } from './modules/manifest-sync'

// ============================================
// Crash Handling — log errors and notify user
// ============================================

process.on('uncaughtException', (err: Error) => {
  logger.error(`Uncaught exception: ${err.message}\n${err.stack ?? ''}`, 'crash')
  try {
    dialog.showErrorBox(
      'Y-core Error',
      `An unexpected error occurred:\n\n${err.message}\n\nThe app may become unstable. Please restart Y-core.`
    )
  } catch {}
})

process.on('unhandledRejection', (reason: unknown) => {
  const msg = reason instanceof Error ? `${reason.message}\n${reason.stack ?? ''}` : String(reason)
  logger.error(`Unhandled rejection: ${msg}`, 'crash')
})

app.on('render-process-gone', (_event, _contents, details: { reason: string }) => {
  logger.error(`Renderer process gone: ${details.reason}`, 'crash')
  try {
    dialog.showErrorBox(
      'Y-core Renderer Crash',
      `The app UI crashed (${details.reason}). The app will be restarted.`
    )
  } catch {}
})

app.on('child-process-gone', (_event, details: { reason: string; type: string }) => {
  logger.error(`Child process gone: type=${details.type} reason=${details.reason}`, 'crash')
})

app.setName('Y-core')

// Use a stable, non-synced directory for user data to avoid Chromium cache permission errors.
const userDataPath = path.join(process.env.LOCALAPPDATA || os.homedir(), 'Y-core')
if (!fs.existsSync(userDataPath)) {
  fs.mkdirSync(userDataPath, { recursive: true })
}
app.setPath('userData', userDataPath)

// Single instance lock — prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
}

if (gotTheLock) {
// Load persisted username on startup
loadUsername()

app.whenReady().then(async () => {
  logger.init()
  logger.info('Y-core starting up...', 'app')
  Menu.setApplicationMenu(null)

  // Register modular IPC handlers BEFORE creating windows
  // to prevent race conditions where the renderer calls handlers
  // before they are registered (especially after login reload).
  registerLogHandlers(() => state.mainWindow)
  registerConfigHandlers()
  registerOnlineFixHandlers(() => { invalidateGamesCache() })
  registerStoreImageHandlers()
  registerAuthHandlers({ showMainWindow, createLoginWindow })
  registerAppHandlers({ showMainWindow, createLoginWindow: () => {} })
  registerSteamHandlers()
  registerStoreHandlers(invalidateGamesCache)

  createSplashWindow()
  createWindow()
  createTray()
  logger.info('Splash, window and tray created', 'app')

  // Auto-set default username if none saved
  if (!state.username) {
    state.username = 'user'
    saveUsername()
  }
  // Main window is shown when renderer signals app:ready (via showMainWindow)

  // Keep ACFs for Y-core Tool games in update-required state so downloads don't stall
  startAcfWatcher()

  // Focus existing window when second instance is attempted
  app.on('second-instance', () => {
    if (state.mainWindow) {
      if (state.mainWindow.isMinimized()) state.mainWindow.restore()
      if (!state.mainWindow.isVisible()) state.mainWindow.show()
      state.mainWindow.focus()
    }
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })

  // Auto-updater — check for updates silently on startup (production only)
  if (app.isPackaged) {
    autoUpdater.autoDownload = true
    autoUpdater.autoInstallOnAppQuit = false

    autoUpdater.on('update-available', (info: { version?: string }) => {
      logger.info(`Update available: ${info.version ?? 'unknown'}`, 'updater')
      for (const win of BrowserWindow.getAllWindows()) {
        try { win.webContents.send('update-available', info) } catch {}
      }
    })

    autoUpdater.on('update-downloaded', (info: { version?: string }) => {
      logger.info(`Update downloaded: ${info.version ?? 'unknown'}`, 'updater')
      for (const win of BrowserWindow.getAllWindows()) {
        try { win.webContents.send('update-downloaded', info) } catch {}
      }
    })

    autoUpdater.on('checking-for-update', () => {
      logger.info('Checking for updates...', 'updater')
    })

    autoUpdater.on('update-not-available', (info: { version?: string }) => {
      logger.info(`No update available (current: ${info.version ?? 'unknown'})`, 'updater')
    })

    autoUpdater.on('error', (err: Error) => {
      logger.error(`Auto-updater error: ${err.message}`, 'updater')
    })

    const checkForUpdates = () => {
      autoUpdater.checkForUpdates().catch((err: Error) => {
        logger.warn(`Update check failed: ${err.message}`, 'updater')
      })
    }

    // Check on startup, then periodically (the app runs long in the tray)
    checkForUpdates()
    const UPDATE_CHECK_INTERVAL = 4 * 60 * 60 * 1000 // 4 hours
    setInterval(checkForUpdates, UPDATE_CHECK_INTERVAL)

    ipcMain.handle('app:installUpdate', () => {
      logger.info('User requested update install — quitting and installing', 'updater')
      setIsQuitting(true)
      autoUpdater.quitAndInstall()
    })
  } else {
    ipcMain.handle('app:installUpdate', () => {
      logger.info('Update install requested in dev — no-op', 'updater')
    })
  }
})
}

app.on('before-quit', () => {
  setIsQuitting(true)
  saveUsername()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})