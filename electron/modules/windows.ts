import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, shell, screen, session, dialog } from 'electron'
import path from 'path'
import fs from 'fs'
import { exec, spawn } from 'child_process'
import { logger } from '../logger'
import { state, setMainWindow, setLoginWindow, setSplashWindow, setIsQuitting, getIsQuitting } from '../state'
import { getSteamPath } from './steam-helpers'

const appIconPath = path.join(app.getAppPath(), 'public', 'logo.ico')
const appIcon = fs.existsSync(appIconPath) ? appIconPath : undefined

export function createSplashWindow(): void {
  if (state.splashWindow && !state.splashWindow.isDestroyed()) {
    state.splashWindow.show()
    return
  }
  const win = new BrowserWindow({
    width: 320,
    height: 200,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    alwaysOnTop: true,
    center: false,
    show: false,
    icon: appIcon,
    backgroundColor: 'rgba(0, 0, 0, 0)',
    webPreferences: {
      preload: path.join(__dirname, 'splash-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  const { width: screenW, height: screenH } = screen.getPrimaryDisplay().workAreaSize
  win.setBounds({
    x: Math.round((screenW - 320) / 2),
    y: Math.round((screenH - 200) / 2),
    width: 320,
    height: 200,
  })

  win.once('ready-to-show', () => {
    win.show()
  })

  win.loadFile(path.join(app.getAppPath(), 'electron/splash.html'))

  win.on('closed', () => {
    setSplashWindow(null)
  })

  setSplashWindow(win)
}

export function createLoginWindow(): void {
  if (state.loginWindow && !state.loginWindow.isDestroyed()) {
    state.loginWindow.show()
    state.loginWindow.focus()
    return
  }
  const win = new BrowserWindow({
    width: 420,
    height: 700,
    minWidth: 360,
    minHeight: 480,
    frame: false,
    resizable: false,
    transparent: true,
    show: false,
    alwaysOnTop: true,
    icon: appIcon,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  const { width: screenW, height: screenH } = screen.getPrimaryDisplay().workAreaSize
  win.setBounds({
    x: Math.round((screenW - 420) / 2),
    y: Math.round((screenH - 700) / 2),
    width: 420,
    height: 700,
  })

  win.once('ready-to-show', () => {
    win.show()
    win.focus()
    if (!app.isPackaged) {
      win.webContents.openDevTools({ mode: 'detach' })
    }
  })

  win.on('show', () => {
    if (state.splashWindow && !state.splashWindow.isDestroyed()) {
      try {
        state.splashWindow.webContents.send('splash:ready')
      } catch {}
      setTimeout(() => {
        state.splashWindow?.close()
        setSplashWindow(null)
      }, 450)
    }
  })

  const devServerUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173/'
  if (process.env.VITE_DEV_SERVER_URL || !app.isPackaged) {
    win.loadURL(`${devServerUrl}#/login`)
  } else {
    win.loadFile(path.join(app.getAppPath(), 'dist/index.html'), { hash: 'login' })
  }

  win.on('closed', () => {
    setLoginWindow(null)
    if (state.mainWindow && !state.mainWindow.isVisible() && !getIsQuitting()) {
      setIsQuitting(true)
      app.quit()
    }
  })

  setLoginWindow(win)
}

export function showMainWindow(): void {
  if (!state.mainWindow || state.mainWindow.isDestroyed()) return

  if (state.mainWindow.isMinimized()) state.mainWindow.restore()

  const wasVisible = state.mainWindow.isVisible()
  state.mainWindow.show()
  state.mainWindow.focus()

  if (!wasVisible) {
    state.mainWindow.setOpacity(0)
    let opacity = 0
    const fadeIn = setInterval(() => {
      opacity += (1 - opacity) * 0.12
      if (opacity >= 0.995) {
        state.mainWindow?.setOpacity(1)
        clearInterval(fadeIn)
      } else {
        state.mainWindow?.setOpacity(opacity)
      }
    }, 20)
  }

  if (state.splashWindow && !state.splashWindow.isDestroyed()) {
    try {
      state.splashWindow.webContents.send('splash:ready')
    } catch {}
    setTimeout(() => {
      state.splashWindow?.close()
      setSplashWindow(null)
    }, 450)
  }
}

export function createWindow(): void {
  if (state.mainWindow && !state.mainWindow.isDestroyed()) {
    state.mainWindow.focus()
    return
  }
  const win = new BrowserWindow({
    width: 1920,
    height: 1080,
    minWidth: 900,
    minHeight: 600,
    show: false,
    frame: false,
    titleBarStyle: 'hidden',
    transparent: true,
    title: 'Y-core',
    icon: appIcon,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  win.on('close', (e) => {
    if (!getIsQuitting()) {
      e.preventDefault()
      state.mainWindow?.hide()
    }
  })

  win.on('closed', () => {
    setMainWindow(null)
  })

  // Window controls IPC
  ipcMain.handle('window-minimize', () => {
    state.mainWindow?.minimize()
  })
  ipcMain.handle('window-maximize', () => {
    if (state.mainWindow?.isMaximized()) {
      state.mainWindow?.unmaximize()
    } else {
      state.mainWindow?.maximize()
    }
  })
  ipcMain.handle('window-close', () => {
    setIsQuitting(true)
    state.mainWindow?.close()
  })

  const devServerUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173/'
  if (process.env.VITE_DEV_SERVER_URL || !app.isPackaged) {
    win.loadURL(devServerUrl)
  } else {
    win.loadFile(path.join(app.getAppPath(), 'dist/index.html'))
  }

  // Content Security Policy
  const isDev = process.env.VITE_DEV_SERVER_URL || !app.isPackaged
  const csp = isDev
    ? [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' http://localhost:5173",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "img-src 'self' data: https: blob:",
        "font-src 'self' data: https://fonts.gstatic.com",
        "connect-src 'self' http://localhost:5173 ws://localhost:5173 http://localhost:3000 https://y-core-render-api-rxwd.onrender.com",
      ].join('; ')
    : [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "img-src 'self' data: https: blob:",
        "font-src 'self' data: https://fonts.gstatic.com",
        "connect-src 'self' https://api.ycore.app https://y-core-render-api-rxwd.onrender.com",
      ].join('; ')

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp],
      },
    })
  })

  setMainWindow(win)
}

export function createTray(): void {
  let trayIcon: Electron.NativeImage

  if (appIcon && fs.existsSync(appIcon)) {
    trayIcon = nativeImage.createFromPath(appIcon)
    if (trayIcon.isEmpty()) {
      trayIcon = nativeImage.createEmpty()
    } else {
      trayIcon = trayIcon.resize({ width: 16, height: 16 })
    }
  } else {
    trayIcon = nativeImage.createEmpty()
  }

  const tray = new Tray(trayIcon)

  const buildContextMenu = (): Electron.Menu => {
    const isVisible = state.mainWindow?.isVisible() ?? false
    return Menu.buildFromTemplate([
      {
        label: isVisible ? 'Ocultar Y-core' : 'Mostrar Y-core',
        click: () => {
          if (state.mainWindow?.isVisible()) {
            state.mainWindow.hide()
          } else {
            state.mainWindow?.show()
            state.mainWindow?.focus()
          }
        },
      },
      { type: 'separator' },
      {
        label: 'Reiniciar Steam',
        click: () => {
          const platform = process.platform
          if (platform === 'win32') {
            exec('taskkill /IM steam.exe /F', () => {
              setTimeout(() => {
                const steamPath = getSteamPath()
                if (steamPath) {
                  const steamExe = path.join(steamPath, 'steam.exe')
                  if (fs.existsSync(steamExe)) {
                    spawn(steamExe, [], { detached: true, stdio: 'ignore' }).unref()
                  }
                }
              }, 2000)
            })
          }
        },
      },
      { type: 'separator' },
      {
        label: 'Salir',
        click: () => {
          setIsQuitting(true)
          app.quit()
        },
      },
    ])
  }

  tray.setToolTip('Y-core')
  tray.setContextMenu(buildContextMenu())

  tray.on('click', () => {
    if (state.mainWindow?.isVisible()) {
      state.mainWindow.hide()
    } else {
      state.mainWindow?.show()
      state.mainWindow?.focus()
    }
    tray.setContextMenu(buildContextMenu())
  })

  state.tray = tray
}

export function registerAppHandlers(
  callbacks: {
    showMainWindow: () => void
    createLoginWindow: () => void
  }
): void {
  ipcMain.handle('app:getLocale', () => {
    return app.getLocale()
  })

  ipcMain.handle('app:getVersion', () => {
    return app.getVersion()
  })

  ipcMain.handle('dialog:openImageFile', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Select background image',
      filters: [
        { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'] },
      ],
      properties: ['openFile'],
    })
    if (result.canceled || result.filePaths.length === 0) return null

    // Copy image to app data folder so it persists even if original is deleted
    const srcPath = result.filePaths[0]
    const bgDir = path.join(app.getPath('userData'), 'backgrounds')
    if (!fs.existsSync(bgDir)) fs.mkdirSync(bgDir, { recursive: true })

    const ext = path.extname(srcPath).toLowerCase()
    const destPath = path.join(bgDir, `background${ext}`)
    try {
      fs.copyFileSync(srcPath, destPath)
      return destPath
    } catch {
      return srcPath
    }
  })

  ipcMain.handle('app:readImageAsDataURL', async (_event, filePath: string) => {
    try {
      if (!filePath || typeof filePath !== 'string') return null
      if (!fs.existsSync(filePath)) return null
      const ext = path.extname(filePath).toLowerCase().slice(1)
      const mimeMap: Record<string, string> = {
        jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
        webp: 'image/webp', gif: 'image/gif', bmp: 'image/bmp',
      }
      const mime = mimeMap[ext] || 'image/jpeg'
      const data = fs.readFileSync(filePath)
      return `data:${mime};base64,${data.toString('base64')}`
    } catch {
      return null
    }
  })

  const ALLOWED_EXTERNAL_PROTOCOLS = ['https:', 'http:', 'mailto:', 'steam:']

  ipcMain.handle('app:openExternal', (_event, url: string) => {
    if (!url || typeof url !== 'string') {
      return { success: false, error: 'Invalid URL' }
    }
    try {
      const parsed = new URL(url)
      if (!ALLOWED_EXTERNAL_PROTOCOLS.includes(parsed.protocol)) {
        logger.warn(`Blocked openExternal for disallowed protocol: ${parsed.protocol}`, 'app')
        return { success: false, error: `Protocol ${parsed.protocol} not allowed` }
      }
    } catch {
      logger.warn(`Blocked openExternal for invalid URL: ${url}`, 'app')
      return { success: false, error: 'Invalid URL' }
    }
    logger.info(`Opening external URL: ${url}`, 'app')
    return shell.openExternal(url).then(() => ({ success: true })).catch((err) => {
      logger.error(`Failed to open external URL: ${err.message}`, 'app')
      return { success: false, error: err.message }
    })
  })

  ipcMain.handle('app:ready', () => {
    logger.info('Renderer signaled app ready', 'app')
    if (state.loginWindow && !state.loginWindow.isDestroyed()) {
      state.loginWindow.close()
      setLoginWindow(null)
    }
    callbacks.showMainWindow()
  })

  ipcMain.handle('splash:setStatus', (_event, { status, percent }: { status: string; percent: number }) => {
    if (state.splashWindow && !state.splashWindow.isDestroyed()) {
      state.splashWindow.webContents.send('splash:status', { status, percent })
    }
  })
}
