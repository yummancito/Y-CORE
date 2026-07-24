import 'dotenv/config'
import { app, BrowserWindow, ipcMain, Menu, dialog } from 'electron'
import path from 'path'
import fs from 'fs'
import os from 'os'
import { logger } from './logger'

// Load OpenSteamTool DLLs
const loadDlls = () => {
  try {
    const dllPath = path.join(__dirname, 'dll')
    if (process.platform === 'win32' && fs.existsSync(dllPath)) {
      process.env.PATH = `${dllPath};${process.env.PATH}`
      try {
        const nativeBind = require('./dll/OpenSteamTool.node')
        if (nativeBind) {
          logger.info('OpenSteamTool native bindings loaded successfully', 'dll')
        }
      } catch (_nodeErr) {
        // Fallback: if .node doesn't exist, just ensure PATH is set for child processes
        if (fs.existsSync(path.join(dllPath, 'OpenSteamTool.dll'))) {
          logger.info('OpenSteamTool DLLs available in PATH (lazy-loaded by child processes)', 'dll')
        }
      }
    }
  } catch (err: any) {
    logger.warn(`Componentes de soporte de Steam no pudieron cargarse (la app sigue funcionando en modo limitado). Detalle: ${err?.message ?? 'sin detalle'}`, 'dll')
  }
}
loadDlls()
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
import { registerDrmHandlers } from './modules/drm-remover'
import { registerSteamLogWatcherHandlers, startSteamLogWatcher, stopSteamLogWatcher } from './modules/steam-log-watcher'
import { cleanupStaleNativeVersions, getNativeDiagnostics } from './modules/ycore-native'
import {
  startSteamCmdInstall,
  cancelSteamCmdInstall,
  isSteamCmdAvailable,
  getActiveJobs,
  shutdownAllSteamCmdJobs,
} from './modules/steamcmd-manager'
// Phase 2 — pure-Node SteamKit anonymous F2P auth handler (steampipe:probeAnonymous).
// Round-6 fix per reviewer: previously exported but never wired into whenReady.
import { registerSteampipeHandlers } from './modules/steampipe'
import { startAcfWatcher } from './modules/manifest-sync'
import { initDiscordRpc, shutdownDiscordRpc } from './modules/discord-rpc'

// ============================================
// ---------------------------------------------------------------------------
// Limpieza de DLLs nativos obsoletos
//
// electron-updater reemplaza el código del asar correctamente, pero las DLLs
// versionadas en resources/native/v*/ se acumulan en cada update. Las
// borramos al cerrar la app. Usamos `app.on('will-quit')` (Electron-canonical)
// en lugar de `process.once('beforeExit')` — este último requiere event loop
// vacío, y nuestra app tiene timers vivos (auto-updater 4h, manifest-sync 5s,
// Discord RPC watcher, steam log watcher), por lo que beforeExit no dispara
// de forma confiable cuando el usuario minimiza a la bandeja y luego sale.
// ---------------------------------------------------------------------------
app.on('will-quit', () => {
  try {
    cleanupStaleNativeVersions(app.getVersion())
  } catch (err) {
    logger.warn(
      `[native-cleanup] will-quit failed: ${(err as Error)?.message ?? err}`,
      'main'
    )
  }
})

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
if (process.platform === 'win32') {
  app.setAppUserModelId('com.ycore.app')
}

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
  registerDrmHandlers()
  registerSteamLogWatcherHandlers()
  registerStoreImageHandlers()
  registerAuthHandlers({ showMainWindow, createLoginWindow })
  registerAppHandlers({ showMainWindow, createLoginWindow: () => {} })
  registerSteamHandlers()
  registerSteampipeHandlers()

  // Diagnóstico nativo (ycore.dll) — disponible tanto en dev como empaquetado,
  // así devs y operadores pueden inspeccionar el estado del binario sin abrir logs.
  ipcMain.handle('app:getNativeDiagnostics', () => {
    try {
      return getNativeDiagnostics()
    } catch (err: any) {
      logger.error(`[main] getNativeDiagnostics error: ${err?.message ?? err}`, 'native')
      return { isAvailable: false, mismatch: false, failureReason: String(err?.message ?? err) }
    }
  })

  // SteamCMD IPC — expone electron/modules/steamcmd-manager.ts al renderer.
  // Cada handler envuelve try/catch con categoría 'steamcmd' para que
  // cualquier excepción (sync o async) quede registrada en ycore.log.
  ipcMain.handle('steamcmd:start', async (_event, opts) => {
    if (!opts?.appId) {
      logger.warn('[steamcmd] start sin appId', 'steamcmd')
      return {
        success: false,
        error: 'appId es requerido',
        errorKey: 'errors.steamcmd.spawnFailed',
      }
    }
    try {
      // Sanitización del installDir: solo aceptamos rutas dentro de
      // userData/Library/. El renderer no debe poder crear carpetas fuera
      // de nuestro root (defensa en profundidad del contextBridge).
      // Si el renderer omite installDir, default = ${userData}/Library/${appId}.
      const libraryRoot = path.resolve(app.getPath('userData'), 'Library')
      const requested = opts.installDir
        ? path.resolve(opts.installDir)
        : path.join(libraryRoot, String(opts.appId))
      if (requested !== libraryRoot && !requested.startsWith(libraryRoot + path.sep)) {
        logger.warn(
          `[steamcmd] installDir fuera de library root: ${requested} (appId=${opts.appId})`,
          'steamcmd',
        )
        return {
          success: false,
          error: `installDir fuera de library root: ${requested}`,
          errorKey: 'errors.steamcmd.installDirCreateFailed',
        }
      }
      return await startSteamCmdInstall({ ...opts, installDir: requested })
    } catch (err: any) {
      logger.error(
        `[steamcmd] start appId=${opts?.appId} falló: ${err?.message ?? err}`,
        'steamcmd',
      )
      return {
        success: false,
        error: String(err?.message ?? err),
        errorKey: 'errors.steamcmd.spawnFailed',
      }
    }
  })

  ipcMain.handle('steamcmd:cancel', async (_event, appId: string) => {
    if (!appId) {
      logger.warn('[steamcmd] cancel sin appId', 'steamcmd')
      return { success: false, appId: '', error: 'appId es requerido' }
    }
    try {
      return cancelSteamCmdInstall(appId)
    } catch (err: any) {
      logger.warn(
        `[steamcmd] cancel appId=${appId} falló: ${err?.message ?? err}`,
        'steamcmd',
      )
      return { success: false, appId, error: String(err?.message ?? err) }
    }
  })

  ipcMain.handle('steamcmd:isAvailable', () => {
    try {
      return isSteamCmdAvailable()
    } catch (err: any) {
      logger.warn(`[steamcmd] isAvailable falló: ${err?.message ?? err}`, 'steamcmd')
      return false
    }
  })

  ipcMain.handle('steamcmd:list', () => {
    try {
      return getActiveJobs()
    } catch (err: any) {
      logger.warn(`[steamcmd] list falló: ${err?.message ?? err}`, 'steamcmd')
      return []
    }
  })

  // H1.7.3 — dispara la descarga del binario SteamCMD desde el renderer
  // cuando el caché está vacío (install-method = auto/steamcmd).
  // La promesa dura segundos, retorna JSON estándar { success, error?, errorKey? }.
  //
  // H1.7.4 — bug fix: el handler ANTES retornaba success:true aunque el
  // fetcher devolviera { success: false } porque fetchSteamCmd no throwea
  // en errores de extracción (los retorna como payload). El renderer creía
  // que había descargado OK y abortaba el install sin razón. Ahora
  // propagamos el success/error/exito del fetcher al renderer para
  // diferenciar "descargó" de "falló la extracción".
  ipcMain.handle('steamcmd:fetch', async () => {
    try {
      const { fetchSteamCmd } = await import('./modules/steamcmd-fetcher')
      const result = await fetchSteamCmd({})
      if (!result.success) {
        logger.warn(
          `[steamcmd] fetch on-demand result no exitoso: ${result.error ?? '<no error msg>'} (errorKey=${result.errorKey ?? 'none'})`,
          'steamcmd',
        )
        return {
          success: false,
          error: result.error ?? 'fetch sin success ni error message (caso bug)',
          errorKey: result.errorKey,
        }
      }
      logger.info(
        `[steamcmd] fetch on-demand completado (source=${result.source} binPath=${result.binPath ?? 'n/a'})`,
        'steamcmd',
      )
      return {
        success: true,
        binPath: result.binPath,
        source: result.source,
      }
    } catch (err: any) {
      logger.warn(
        `[steamcmd] fetch on-demand throw: ${err?.message ?? err}`,
        'steamcmd',
      )
      return {
        success: false,
        error: String(err?.message ?? err),
      }
    }
  })

  // H1.5 — kick-off best-effort del fetcher si SteamCMD no está disponible.
  // Import lazy para evitar cargar 7zip-min hasta que sepamos que hace falta.
  // No bloquea el arranque: la app arranca con cliente legacy mientras SteamCMD
  // descarga en background. El operador también puede disparar manualmente con
  // `ycore fetch-steamcmd` desde Settings o CLI.
  if (!isSteamCmdAvailable()) {
    setImmediate(() => {
      void import('./modules/steamcmd-fetcher').then(({ fetchSteamCmd }) =>
        fetchSteamCmd({}).catch((err: unknown) => {
          logger.warn(
            `[auto-fetch-steamcmd] falló (best-effort): ${
              err instanceof Error ? err.message : String(err)
            }. El operador puede disparar 'ycore fetch-steamcmd' manualmente.`,
            'steamcmd',
          )
        }),
      )
    })
  }

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

  // Start Steam log watcher (monitors console_log.txt for critical errors)
  startSteamLogWatcher()

  // Start Discord Rich Presence ("Playing Y-core" / "Playing <Game> with Y-core")
  initDiscordRpc()

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
    autoUpdater.autoInstallOnAppQuit = true
    autoUpdater.allowDowngrade = true

    autoUpdater.on('update-available', (info: { version?: string }) => {
      logger.info(`Update available: ${info.version ?? 'unknown'}`, 'updater')
      for (const win of BrowserWindow.getAllWindows()) {
        try { win.webContents.send('update-available', info) } catch {}
      }
    })

    autoUpdater.on('download-progress', (progress: { percent: number; transferred: number; total: number; bytesPerSecond: number }) => {
      for (const win of BrowserWindow.getAllWindows()) {
        try { win.webContents.send('update-progress', {
          percent: progress.percent,
          transferred: progress.transferred,
          total: progress.total,
          bytesPerSecond: progress.bytesPerSecond,
        }) } catch {}
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
      for (const win of BrowserWindow.getAllWindows()) {
        try { win.webContents.send('update-error', { message: err.message }) } catch {}
      }
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
      logger.info('User requested update install — forcing clean exit before installer', 'updater')
      setIsQuitting(true)
      // Destroy every window (bypassing the minimize-to-tray 'close' guard) and
      // the tray so the process fully exits and releases the running .exe lock.
      // Otherwise the NSIS installer hangs waiting for the file handle, and the
      // relaunched app collides with the previous single-instance lock.
      try {
        BrowserWindow.getAllWindows().forEach((w) => {
          w.removeAllListeners('close')
          w.destroy()
        })
      } catch {}
      if (state.tray) {
        try { state.tray.destroy() } catch {}
      }
      // Small grace period so the OS releases the executable handle before the
      // installer tries to replace it.
      setTimeout(() => {
        autoUpdater.quitAndInstall(false, true)
      }, 400)
    })

    // Manual download fallback — bypasses electron-updater's broken retry() function
    // Downloads the installer directly and runs it
    ipcMain.handle('app:manualDownloadUpdate', async (_event, url: string) => {
      const https = require('https')
      const tmpDir = app.getPath('temp')
      const installerPath = path.join(tmpDir, 'y-core-update.exe')

      return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(installerPath)
        const request = (reqUrl: string) => {
          https.get(reqUrl, (response: any) => {
            if (response.statusCode === 302 || response.statusCode === 301) {
              response.destroy()
              const newUrl = response.headers.location
              if (newUrl) { request(newUrl); return }
            }
            if (response.statusCode !== 200) {
              file.close()
              fs.unlinkSync(installerPath)
              reject(new Error(`HTTP ${response.statusCode}`))
              return
            }

            const totalSize = parseInt(response.headers['content-length'] || '0', 10)
            let downloaded = 0

            response.on('data', (chunk: Buffer) => {
              downloaded += chunk.length
              if (totalSize > 0) {
                const percent = (downloaded / totalSize) * 100
                for (const win of BrowserWindow.getAllWindows()) {
                  try { win.webContents.send('update-progress', {
                    percent,
                    transferred: downloaded,
                    total: totalSize,
                    bytesPerSecond: 0,
                  }) } catch {}
                }
              }
            })

            response.pipe(file)
            file.on('finish', () => {
              file.close()
              logger.info(`Update downloaded to ${installerPath}`, 'updater')
              for (const win of BrowserWindow.getAllWindows()) {
                try { win.webContents.send('update-downloaded', { version: 'manual' }) } catch {}
              }
              resolve({ path: installerPath })
            })
          }).on('error', (err: Error) => {
            file.close()
            if (fs.existsSync(installerPath)) fs.unlinkSync(installerPath)
            reject(err)
          })
        }
        request(url)
      })
    })

    // Run the downloaded installer manually
    ipcMain.handle('app:runManualInstaller', async (_event, installerPath: string) => {
      const { exec } = require('child_process')
      const tmpDir = app.getPath('temp')
      const expectedPath = path.join(tmpDir, 'y-core-update.exe')

      if (path.resolve(installerPath) !== expectedPath) {
        logger.error(`Rejected installer path: ${installerPath} (expected ${expectedPath})`, 'updater')
        throw new Error('Invalid installer path')
      }

  logger.info(`Running manual installer: ${installerPath}`, 'updater')
  setIsQuitting(true)
  // Force a clean exit (bypass minimize-to-tray) so the installer can replace the exe
  try {
    BrowserWindow.getAllWindows().forEach((w) => {
      w.removeAllListeners('close')
      w.destroy()
    })
  } catch {}
  if (state.tray) {
    try { state.tray.destroy() } catch {}
  }
  // Spawn NSIS con detached + unref() → corre INDEPENDIENTE de nuestro proceso.
  // Antes usábamos exec() + setTimeout(quit, 1000): NSIS arrancaba mientras
  // Y-core.exe seguía vivo (file-lock activo) y fallaba silenciosamente porque
  // /S suprime cualquier UI de error. Con spawn detached, el instalador vive
  // en su propio proceso y unref() libera el IPC handle → podemos salir ya.
  const { spawn } = require('child_process')
  spawn(installerPath, ['/S'], { detached: true, stdio: 'ignore' }).unref()
  // Salir inmediato, sin esperar al instalador. Esto libera el .exe ASAP.
  app.quit()
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
  // Cerrar jobs SteamCMD ANTES de los watchers: si SteamCMD tiene un child
  // activo, su muerte emite un último evento FAILED al renderer mientras
  // todavía hay ventanas para mostrarlo. Detener los log-watchers primero
  // silenciaría esos eventos.
  shutdownAllSteamCmdJobs('app quitting')
  stopSteamLogWatcher()
  shutdownDiscordRpc()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})