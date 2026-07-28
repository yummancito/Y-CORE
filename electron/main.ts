import 'dotenv/config'
import { app, BrowserWindow, ipcMain, Menu, dialog, session, desktopCapturer } from 'electron'
import { WebSocketServer, WebSocket as WsSocket } from 'ws'
import { dispatchFrame } from './modules/input-bridge'
// Belt-and-suspenders so that navigator.mediaDevices.getDisplayMedia() is
// available in the renderer. Required on Electron < 28 / pre-Chromium-120;
// harmless no-op on newer Windows/macOS where the API works natively.
// MUST be set before app.whenReady() — Chromium reads command-line switches
// once at app start.
app.commandLine.appendSwitch('enable-experimental-web-platform-features')

// Permissions Y-Core actually needs (Remote Play screen + audio capture).
// Anything outside this allow-list is denied so we don't silently grant
// camera, geolocation, notifications, etc. The blank grant pattern was
// broader than the threat model warrants. Declared at module-top (cheap,
// no side effects) so it is in scope for the whenReady-time install below.
const Y_CORE_ALLOWED_PERMISSIONS = new Set([
  'media',
  'display-capture',
  'audioCapture',
])
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
import { registerYcoreErrorHandlers } from './handlers/ycore-error-ipc'
import {
  startSteamCmdInstall,
  cancelSteamCmdInstall,
  isSteamCmdAvailable,
  getActiveJobs,
  shutdownAllSteamCmdJobs,
} from './modules/steamcmd-manager'
// Steampipe removed — now using Steam-native downloads instead
import { registerDownloadHandlers } from './modules/download-ipc'
import { startAcfWatcher } from './modules/manifest-sync'
import { initDiscordRpc, shutdownDiscordRpc } from './modules/discord-rpc'
import { showDefenderWarningIfNeeded, scanDlls } from './modules/defender-check'
import { runDefenderFix } from './modules/defender-fix'
import { getEmulatorDiagnostics } from './modules/emulator-diagnostics'
import { checkToolchain, buildEmulator, tryAutoBuildOnce } from './modules/build-emulator'
import { tryInstallCmake } from './modules/install-toolchain'
import { isSteamRunning } from './modules/steam-helpers'
import { isLocalSteamEmulatorAvailable } from './modules/local-steam-emulator'
import { configService as backendConfigService } from './services/config.service'
// (Round-11 dead-code block removed)

// ── Service Layer ────────────────────────────────────────────────────────────
import { getServiceRegistry } from './services/registry'
import { registerGatewayRouter } from './services/gateway-router'
import { configService } from './services/config.service'
import { authService } from './services/auth.service'
import { gameService } from './services/game.service'
import { storeService } from './services/store.service'
import { downloadService } from './services/download.service'
import { logService } from './services/log.service'
import { steamService } from './services/steam.service'
import { updateService } from './services/update.service'
import { onlinefixService } from './services/onlinefix.service'
import { drmService } from './services/drm.service'
import { steamcmdService } from './services/steamcmd.service'
import { runtimeDetectorService } from './services/runtime-detector.service'
import { launchProfilesService } from './services/launch-profiles.service'
import { saveManagerService } from './services/save-manager.service'
import { gameProcessService } from './services/game-process.service'
import { storageService } from './services/storage.service'
import { maintenanceService } from './services/maintenance.service'
import { pluginService } from './services/plugin.service'
import { remotePlayService } from './services/remote-play.service'
import { presenceService } from './services/presence.service'
import { wsSignalingService } from './services/ws-signaling.service'
import { inputInjectionService } from './services/input-injection.service'
import { cloudSignalingService } from './services/cloud-signaling.service'
import { steamDownloadService } from './services/steam-download.service'

function registerAllServices(): void {
  const registry = getServiceRegistry()
  registry.register('config', configService)
  registry.register('auth', authService)
  registry.register('game', gameService)
  registry.register('store', storeService)
  registry.register('download', downloadService)
  registry.register('log', logService)
  registry.register('steam', steamService)
  registry.register('update', updateService)
  registry.register('onlinefix', onlinefixService)
  registry.register('drm', drmService)
  registry.register('steamcmd', steamcmdService)
  registry.register('storage', storageService)
  registry.register('runtimeDetect', runtimeDetectorService)
  registry.register('launchProfiles', launchProfilesService)
  registry.register('saveManager', saveManagerService)
  registry.register('gameProcess', gameProcessService)
  registry.register('maintenance', maintenanceService)
  registry.register('plugin', pluginService)
  registry.register('remotePlay', remotePlayService)
  registry.register('inputInjection', inputInjectionService)
}

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
  console.log('[STARTUP] [M] app.whenReady() started')

  // Auto-update OpenSteamTool DLLs (non-blocking, runs in background)
  // TODO: Fix compilation error in opensteamtool-updater.ts
  // (async () => {
  //   try {
  //     const { checkAndUpdateOpenSteamTool } = await import('./modules/opensteamtool-updater')
  //     const result = await checkAndUpdateOpenSteamTool()
  //     if (result.updated) {
  //       logger.info(`OpenSteamTool updated to ${result.version}`, 'updater')
  //     }
  //   } catch (err: any) {
  //     logger.warn(`Failed to check OpenSteamTool updates: ${err.message}`, 'updater')
  //   }
  // })()

  // Install permission handler here — NOT at module-top. In this Electron
  // version session.defaultSession is only safe to receive after app is
  // ready (the previous module-top install threw "Session can only be
  // received when app is ready"). The allow-list const above is in scope
  // via closure.
  if (!process.env.Y_CORE_STRICT_DISABLE_MEDIA_PERMS) {
    try {
      session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
        return callback(Y_CORE_ALLOWED_PERMISSIONS.has(permission))
      })
    } catch (err) {
      logger.warn(
        `[main] Failed to install permission handler: ${(err as Error)?.message ?? err}`,
        'main',
      )
    }
  }

  // Raw IPC channel for the renderer-side desktopCapturer fallback. BrowserWindow
  // side has the `getDisplayMedia()` API which DOES NOT always exist in Y-Core's
  // Electron+Chromium combo. `navigator.mediaDevices.getUserMedia({ video: {
  // mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: <id> } } })`
  // is the canonical Electron fallback and WORKS when getDisplayMedia does not.
  // This IPC call returns the screenshot id list so the renderer can pick the
  // first 'screen' source without showing a UI picker.
  ipcMain.handle('desktop-capturer:get-sources', async (_event, opts?: { types?: ('window' | 'screen')[] }) => {
    try {
      const types = opts?.types ?? ['screen', 'window']
      const sources = await desktopCapturer.getSources({
        types,
        thumbnailSize: { width: 320, height: 180 },
      })
      // Strip the Buffer thumbnail — renderers can't pass Buffers over the
      // structured-clone boundary. Renderer doesn't need thumbnails for
      // auto-pick; user asked to remove noise on the IPC channel.
      return sources.map((s) => ({ id: s.id, name: s.name }))
    } catch (err) {
      logger.warn(
        `[main] desktopCapturer.getSources failed: ${(err as Error)?.message ?? err}`,
        'main',
      )
      return []
    }
  })
  logger.init()
  logger.info('Y-core starting up...', 'app')
  Menu.setApplicationMenu(null)

  // ── Register Service Layer (gateway + all services) BEFORE IPC handlers ───
  registerAllServices()
  registerGatewayRouter()

  // ── Browser Mobile Bridge (WebSocket) ──────────────────────────────────────
  // Mobile web clients (iPhone / iPad / test browser) reach the host via two
  // dedicated WebSocket servers. They run unconditionally when the app is
  // ready, regardless of whether the host is actively transmitting.
  //
  //   :42863 → signaling bridge. JSON envelope:
  //              client → { type:'call', id, service, method, args }
  //                       { type:'subscribe', event }
  //              server → { type:'reply', id, result|error }
  //                       { type:'event', event, data }
  //                       { type:'ready', session }
  //              Methods exposed: a curated allow-list of `remotePlay.*` calls
  //              deemed safe for web clients (read-only + their own connect).
  //   :42864 → binary input bridge. Same wire format as the existing WebRTC
  //              DataChannel + IPC `inputBridge:dispatch` (see
  //              electron/modules/input-bridge.ts). Decoder is intentionally
  //              the same `dispatchFrame()` so the host path is identical
  //              regardless of transport.
  //
  // Why NOT :42862? The LAN TCP signaling server from the remote-play module
  // is started on :42862 on demand whenever a host begins streaming. Binding
  // a parallel WS listener there would race for the port. Adding :42863 / :42864
  // sidesteps the conflict and keeps the legacy LAN-TCP path untouched.
  const BROWSER_SIGNAL_PORT = 42863
  const BROWSER_INPUT_PORT = 42864
  // Allow-list of (service, method) pairs reachable from the browser-side
  // WS bridge (:42863). Each key is a service name; the matching Set is
  // the methods of that service safe for untrusted web clients. Per-
  // service scoping prevents a malicious QR scan from pivoting across
  // service boundaries (e.g., calling store.* or game.* just because
  // they're registered). Add a service to this map AND to the
  // `getBrowserService` switch below to expose it.
  const BROWSER_BRIDGE_METHODS: Record<string, ReadonlySet<string>> = {
    remotePlay: new Set([
      'getSettings', 'updateSettings', 'getStatus',
      'connectToHost', 'disconnect',
      'sendSignal', // WebRTC signaling (offer / answer / ice / request)
      'getMobileConnectToken', 'resolveMobileToken', // QR mobile auto-connect
      'launchFromMobile', // Mobile taps a game → host starts + launches + auto-captures
    ]),
    // Game catalog for the mobile SPA. Read-only metadata + Steam details.
    // No mutation methods exposed — mobile cannot modify the host's library.
    game: new Set([
      'listInstalled',
      'getSteamDetails',
    ]),
    // Steam store search for the mobile SPA. Read-only.
    store: new Set([
      'search',
    ]),
    // Auth — read-only identity for displaying the host user on the mobile
    // client. Without these, the mobile route crashed TopNav at
    // `username.slice(0, 2)` because the WS bridge rejected auth.* calls
    // and returned a truthy `{ok:false, reason:'forbidden'}` envelope that
    // the avatar bubble tried to slice. TopNav also has a defensive
    // getInitials() guard as a backstop for any future call site.
    auth: new Set([
      'isAuthenticated',
      'getUsername',
    ]),
  }
  const browserSignalClients = new Map<WsSocket, Set<string>>()

  // Lookup the registered service object backing the allow-list above.
  // Hard-coded (instead of registry introspection) so adding a new
  // service is a deliberate, two-line intent signal — anyone auditing
  // this file can see the exact surface area exposed to the browser.
  function getBrowserService(name: string): unknown {
    switch (name) {
      case 'remotePlay': return remotePlayService
      case 'auth': return authService
      case 'game': return gameService
      case 'store': return storeService
      default: return null
    }
  }

  function sendToBrowserClient(ws: WsSocket, msg: object): void {
    if (ws.readyState !== WsSocket.OPEN) return
    try { ws.send(JSON.stringify(msg)) } catch {}
  }

  function broadcastBrowserEvent(event: string, data: unknown): void {
    for (const [ws, subs] of browserSignalClients.entries()) {
      if (subs.has(event)) sendToBrowserClient(ws, { type: 'event', event, data })
    }
  }

  const browserSignalWss = new WebSocketServer({ port: BROWSER_SIGNAL_PORT })
  browserSignalWss.on('connection', (ws) => {
    const subs = new Set<string>()
    browserSignalClients.set(ws, subs)
    const session = 'bc-' + Math.random().toString(36).slice(2, 10)
    sendToBrowserClient(ws, { type: 'ready', session })
    logger.info(`[BrowserBridge] signaling client connected session=${session}`, 'remote-play')

    ws.on('message', async (raw) => {
      try {
        const msg = JSON.parse(raw.toString())
        if (msg.type === 'subscribe' && typeof msg.event === 'string') {
          subs.add(msg.event)
          return
        }
        if (
          msg.type === 'call' &&
          typeof msg.id === 'string' &&
          typeof msg.service === 'string' &&
          typeof msg.method === 'string'
        ) {
          const allowedMethods = BROWSER_BRIDGE_METHODS[msg.service]
          if (!allowedMethods || !allowedMethods.has(msg.method)) {
            sendToBrowserClient(ws, { type: 'reply', id: msg.id, error: `forbidden: ${msg.service}.${msg.method}` })
            return
          }
          const args = Array.isArray(msg.args) ? msg.args : []
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const svc = getBrowserService(msg.service) as any
          const fn = svc ? svc[msg.method] : undefined
          if (typeof fn !== 'function') {
            sendToBrowserClient(ws, { type: 'reply', id: msg.id, error: `unsupported: ${msg.service}.${msg.method}` })
            return
          }
          try {
            const result = await fn.apply(remotePlayService, args)
            sendToBrowserClient(ws, { type: 'reply', id: msg.id, result })
          } catch (err: any) {
            sendToBrowserClient(ws, { type: 'reply', id: msg.id, error: err?.message ?? String(err) })
          }
        }
      } catch (err: any) {
        logger.warn(`[BrowserBridge] signaling parse error: ${err.message}`, 'remote-play')
      }
    })

    ws.on('close', () => {
      browserSignalClients.delete(ws)
      logger.info('[BrowserBridge] signaling client disconnected', 'remote-play')
    })
    ws.on('error', (err: Error) => {
      logger.warn(`[BrowserBridge] signaling ws error: ${err.message}`, 'remote-play')
    })
  })
  logger.info(`[BrowserBridge] signaling WS listening on ${BROWSER_SIGNAL_PORT}`, 'remote-play')

  const browserInputWss = new WebSocketServer({ port: BROWSER_INPUT_PORT })
  browserInputWss.on('connection', (ws) => {
    logger.info('[BrowserBridge] input client connected', 'remote-play')
    ws.on('message', (data) => {
      // `data` from the `ws` package is a Buffer (subclass of Uint8Array) by
      // default, which is what `dispatchFrame` already accepts. Treat it
      // defensively in case a client upgrades to ArrayBuffer mode.
      let bytes: Uint8Array | null = null
      if (data instanceof Uint8Array) bytes = data
      else if (data instanceof ArrayBuffer) bytes = new Uint8Array(data)
      if (bytes) {
        dispatchFrame(bytes, process.platform)
      }
    })
    ws.on('close', () => logger.info('[BrowserBridge] input client disconnected', 'remote-play'))
    ws.on('error', (err: Error) => {
      logger.warn(`[BrowserBridge] input ws error: ${err.message}`, 'remote-play')
    })
  })
  logger.info(`[BrowserBridge] input WS listening on ${BROWSER_INPUT_PORT}`, 'remote-play')

  // ── Wire Remote Play signaling events to renderer ────────────────────────
  remotePlayService.setOnSignalCallback((signal, from) => {
    for (const win of BrowserWindow.getAllWindows()) {
      try {
        win.webContents.send('remotePlay:signal', { ...signal, from })
      } catch {}
    }
    // Parallel push to browser-side mobile clients subscribed to LAN signals.
    broadcastBrowserEvent('remotePlay:signal', { ...signal, from })
  })

  // ── Wire the mobile-bridge broadcaster so `broadcastSignal` reaches WS clients ─
  // HostRemotePlayAuto + the LAN HostTab now use `broadcastSignal(signal)` for
  // outbound offer/answer/ICE instead of the broken `sendSignal(host, port)`
  // (which only opened a fresh throwaway TCP that was destroyed after write,
  // so no peer ever received the host's responses). The fan-out reaches every
  // BrowserWindow, the live LAN signalingClientSocket, AND the WS bridge.
  remotePlayService.setMobileBridgeBroadcaster((event, data) => {
    broadcastBrowserEvent(event, data)
  })

  // ── Wire Y-Core Cloud signaling events to renderer ───────────────────────
  remotePlayService.setOnCloudSignalCallback((signal) => {
    for (const win of BrowserWindow.getAllWindows()) {
      try {
        win.webContents.send('remotePlay:wsSignal', signal)
      } catch {}
    }
    broadcastBrowserEvent('remotePlay:wsSignal', signal)
  })

  remotePlayService.setOnCloudConnectionRequestCallback((request) => {
    for (const win of BrowserWindow.getAllWindows()) {
      try {
        win.webContents.send('remotePlay:connectionRequest', request)
      } catch {}
    }
  })

  // ── Wire WebSocket signaling (WAN) events to renderer ────────────────────
  wsSignalingService.setOnSignalCallback((signal) => {
    for (const win of BrowserWindow.getAllWindows()) {
      try {
        win.webContents.send('remotePlay:wsSignal', signal)
      } catch {}
    }
    broadcastBrowserEvent('remotePlay:wsSignal', signal)
  })

  // ── Wire cloud signaling input commands to InputInjectionService ─────────
  cloudSignalingService.setOnInputCommandCallback((command) => {
    try {
      inputInjectionService.processCommand(command)
    } catch (err: any) {
      logger.error(`[main] inputInjection failed: ${err?.message}`, 'native')
    }
  })

  // ── Wire presence connection request events to renderer ──────────────────
  presenceService.setOnConnectionRequestCallback((request) => {
    for (const win of BrowserWindow.getAllWindows()) {
      try {
        win.webContents.send('remotePlay:connectionRequest', request)
      } catch {}
    }
    broadcastBrowserEvent('remotePlay:connectionRequest', request)
  })

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
  registerDownloadHandlers()
  registerYcoreErrorHandlers()

  // Diagnóstico de DLLs vs Windows Defender — disponible para el renderer
  ipcMain.handle('app:defenderCheck', () => {
    try {
      return scanDlls()
    } catch (err: any) {
      logger.error(`[main] defenderCheck error: ${err?.message ?? err}`, 'dll')
      return { hasMissingCritical: false, hasMissingExpected: false, hasEmptyDlls: false, dlls: [], hasDefenderArtifacts: false, suggestions: [] }
    }
  })

  // Reparación automática de Windows Defender — auto-eleva PowerShell
  ipcMain.handle('app:runDefenderFix', async () => {
    try {
      return await runDefenderFix(true)
    } catch (err: any) {
      logger.error(`[main] runDefenderFix error: ${err?.message ?? err}`, 'dll')
      return { success: false, message: 'Error al ejecutar la reparación.', detail: String(err?.message ?? err), elevated: false, restored: false, error: String(err?.message ?? err) }
    }
  })

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

  // Static PE-export diagnostics for ycore_steam.dll — answers the question
  // "does this DLL actually parse the steam_settings/ scaffold we drop in
  // Layer 3?". See electron/modules/emulator-diagnostics.ts for the design.
  // Round-7 reviewer fix #2: handler is async to avoid blocking the main
  // event loop while fs.readFile runs (5–15 MB DLL = 5–15 ms stutter for
  // every other IPC channel during /settings mount).
  // Round-11: toolchain status for Settings → Diagnóstico.
  ipcMain.handle('app:emulatorToolchainCheck', () => {
    try {
      return checkToolchain()
    } catch (err: any) {
      logger.error(`[main] emulatorToolchainCheck error: ${err?.message ?? err}`, 'emulator')
      return {
        cmakeFound: false, cmakeVersion: null, cmakePath: null,
        vsFound: false, vsVersion: null, vsPath: null,
        msbuildFound: false, msbuildPath: null, buildScriptExists: false,
      }
    }
  })

  // Round-11: on-demand build, runs the cmake+msbuild chain, streams
  // progress to all renderer windows via 'app:buildEmulator:progress',
  // resolves with a final BuildResult when done.
  // Round-12: manual cmake install trigger (used by Settings → Diagnóstico).
  // Streams progress via 'app:installToolchain:progress', fires 'app:installToolchain:finished'
  // on completion. On success, re-runs checkToolchain + tryAutoBuildOnce so the
  // freshly-installed cmake immediately compiles ycore_steam.dll.
  ipcMain.handle('app:installToolchain', async (event) => {
    logger.info('[main] app:installToolchain triggered by renderer', 'emulator')
    try {
      const result = await tryInstallCmake({
        onProgress: (line) => {
          try {
            BrowserWindow.getAllWindows().forEach(w => {
              if (!w.webContents.isDestroyed()) {
                w.webContents.send('app:installToolchain:progress', { line })
              }
            })
          } catch {}
        },
      })
      // Final result broadcast.
      try {
        BrowserWindow.getAllWindows().forEach(w => {
          if (!w.webContents.isDestroyed()) {
            w.webContents.send('app:installToolchain:finished', {
              success: result.success,
              installedFrom: result.installedFrom,
              durationMs: result.durationMs,
              error: result.error,
              skippedTiers: result.skippedTiers,
              cmakePathAfter: result.cmakePathAfter,
            })
          }
        })
      } catch {}
      if (result.success) {
        // Re-run toolchain check + try auto-build to pick up the new cmake.
        try {
          const t = checkToolchain()
          logger.info(`[main] post-install toolchain: cmake=${t.cmakeFound}, vs=${t.vsFound}`, 'emulator')
          if (t.cmakeFound && !isLocalSteamEmulatorAvailable()) {
            const buildResult = await tryAutoBuildOnce()
            if (buildResult?.success) {
              logger.info(`[main] post-install auto-build OK: ${buildResult.dllPath}`, 'emulator')
            }
          }
        } catch (err: any) {
          logger.warn(`[main] post-install auto-build crash: ${err?.message ?? err}`, 'emulator')
        }
      }
      return { ok: result.success, result }
    } catch (err: any) {
      logger.error(`[main] installToolchain error: ${err?.message ?? err}`, 'emulator')
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  // Round-11: on-demand build, runs the cmake+msbuild chain, streams
  ipcMain.handle('app:buildEmulator', async (event) => {
    const senderId = event.sender.id
    logger.info('[main] app:buildEmulator triggered by renderer', 'emulator')
    try {
      const result = await buildEmulator({
        onProgress: (line) => {
          try {
            BrowserWindow.getAllWindows().forEach(w => {
              if (!w.webContents.isDestroyed()) {
                w.webContents.send('app:buildEmulator:progress', { line })
              }
            })
          } catch {}
        },
      })
      // Final result: also push so renderer terminates any in-flight UI.
      try {
        BrowserWindow.getAllWindows().forEach(w => {
          if (!w.webContents.isDestroyed()) {
            w.webContents.send('app:buildEmulator:finished', {
              success: result.success,
              exitCode: result.exitCode,
              error: result.error,
              durationMs: result.durationMs,
              dllPath: result.dllPath,
              dllSizeBytes: result.dllSizeBytes,
              lastLines: result.lastLines,
            })
          }
        })
      } catch {}
      return { ok: result.success, result }
    } catch (err: any) {
      logger.error(`[main] buildEmulator error: ${err?.message ?? err}`, 'emulator')
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

    // Steam-native downloads
  ipcMain.handle('steam:startDownload', async (_event, appId: string, name: string) => {
    try {
      const success = await steamDownloadService.startDownload(appId, name)
      return { success }
    } catch (err: any) {
      logger.error(`[main] steam:startDownload error: ${err?.message ?? err}`, 'download')
      return { success: false, error: err?.message }
    }
  })

  ipcMain.handle('steam:getProgress', async (_event, appId: string) => {
    try {
      return steamDownloadService.getProgress(appId)
    } catch (err: any) {
      return null
    }
  })

  ipcMain.handle('steam:stopDownload', async (_event, appId: string) => {
    try {
      const success = steamDownloadService.stopDownload(appId)
      return { success }
    } catch (err: any) {
      return { success: false }
    }
  })

  ipcMain.handle('app:emulatorDiagnostics', async () => {
    try {
      return await getEmulatorDiagnostics()
    } catch (err: any) {
      logger.error(`[main] emulatorDiagnostics error: ${err?.message ?? err}`, 'emulator')
      return {
        dllPath: null,
        version: null,
        dllSizeBytes: null,
        parseError: String(err?.message ?? err),
        koffiError: null,
        exportCount: 0,
        exports: [],
        exportsDetailed: [],
        expectedSettingsFiles: ['force_account_name.txt', 'offline.txt', 'appid.txt', 'disable_overlay.txt'],
        goldbergLayoutSupported: [],
      }
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

  // ── Round-11: emulator toolchain check + auto-build kick-off ─────────────
  // Best-effort, never blocks the splash. If cmake + MSVC are present and
  // the DLL is missing in the dev tree, we kick off a silent build. The
  // user gets a one-shot info banner once the build finishes (success or
  // fail) via `app:autoBuildFinished`.
  ;(() => {
    try {
      const t = checkToolchain()
      logger.info(
        `[emulator-toolchain] cmake=${t.cmakeFound} (v${t.cmakeVersion ?? "n/a"}) vs=${t.vsFound} (v${t.vsVersion ?? "n/a"}) msbuild=${t.msbuildFound} buildScript=${t.buildScriptExists}`,
        'emulator',
      )
    } catch (err: any) {
      logger.warn(`[emulator-toolchain] check crash: ${err?.message ?? err}`, "emulator")
    }
  })()

  if (!isLocalSteamEmulatorAvailable()) {
    setImmediate(async () => {
      try {
        // Round-12.5: chain auto-install → auto-build so the user can launch
        // games without manual cmake setup. The user's machine has no cmake
        // + no winget + no choco; the direct-MSI tier (cmake.org + msiexec)
        // is the only viable path. msiexec auto-prompts UAC; we broadcast
        // install progress + finished so the renderer can show toasts.
        const toolchain = checkToolchain()
        if (!toolchain.cmakeFound) {
          logger.info('[emulator] cmake missing at startup — kicking off auto-install (3 tiers: winget → choco → direct MSI)…', 'emulator')
          const instResult = await tryInstallCmake({
            onProgress: (line) => {
              for (const win of BrowserWindow.getAllWindows()) {
                try { win.webContents.send('app:installToolchain:progress', { line }) } catch {}
              }
            },
          })
          // Always broadcast the final result so the renderer shows a toast.
          for (const win of BrowserWindow.getAllWindows()) {
            try {
              win.webContents.send('app:installToolchain:finished', {
                success: instResult.success,
                installedFrom: instResult.installedFrom,
                durationMs: instResult.durationMs,
                error: instResult.error,
                skippedTiers: instResult.skippedTiers,
                cmakePathAfter: instResult.cmakePathAfter,
              })
            } catch {}
          }
          if (!instResult.success) {
            logger.warn(`[emulator] auto-install FAILED: ${instResult.error}`, 'emulator')
            return
          }
          logger.info(
            `[emulator] auto-install OK from ${instResult.installedFrom} in ${instResult.durationMs}ms — now chaining into auto-build`,
            'emulator',
          )
        }

        const result = await tryAutoBuildOnce()
        if (!result) return // DLL already present
        if (result.success) {
          logger.info(
            `[emulator] auto-build OK in ${result.durationMs}ms — DLL=${result.dllPath} (${result.dllSizeBytes}B). NOTE: koffi keeps the prior load handle in this process; restart Y-core to bind the freshly-built code.`,
            'emulator',
          )
          for (const win of BrowserWindow.getAllWindows()) {
            try { win.webContents.send('app:autoBuildFinished', { success: true, dllPath: result.dllPath, durationMs: result.durationMs }) } catch {}
          }
        } else {
          logger.warn(`[emulator] auto-build FAILED: ${result.error} (exit=${result.exitCode})`, 'emulator')
          for (const win of BrowserWindow.getAllWindows()) {
            try { win.webContents.send('app:autoBuildFinished', { success: false, error: result.error, exitCode: result.exitCode }) } catch {}
          }
        }
      } catch (err: any) {
        logger.warn(`[emulator] auto-setup crash: ${err?.message ?? err}`, 'emulator')
      }
    })
  }

  // ── Round-11: auto-reactivate killSteamBeforeLaunch when Steam is alive ────
  // The user's mandate: 'no se lanze via steam, solo via app'. The Round-10
  // auto-enable only fired when the disk config had NO key — if the user
  // toggled it OFF previously, the `false` was persisted forever. We now
  // check Steam state at startup: if it's alive AND the user hasn't already
  // opted in, we force killSteamBeforeLaunch=true for this session and
  // persist immediately. The renderer shows a one-time toast so the user
  // understands why the flag flipped.
  ;(async () => {
    try {
      const alive = await isSteamRunning()
      if (!alive) return // Steam not running — user's preference respected
      const cfg = await backendConfigService.read().catch(() => null as any)
      if (!cfg) return
      const cur = (cfg as any).killSteamBeforeLaunch
      // Only flip if currently false (user previously disabled). The user
      // can still override via Settings after they see the toast.
      if (cur === false) {
        await backendConfigService.write({ ...cfg, killSteamBeforeLaunch: true }).catch(() => {})
        logger.info('[auto-kill] Steam alive at startup + flag was false — reactivated killSteamBeforeLaunch=true.', 'steam')
        for (const win of BrowserWindow.getAllWindows()) {
          try { win.webContents.send('app:autoKillReactivated', { previousValue: false, reason: 'Steam alive at startup' }) } catch {}
        }
      } else if (cur === undefined) {
        // Fresh install: auto-enable for the first time.
        await backendConfigService.write({ ...cfg, killSteamBeforeLaunch: true }).catch(() => {})
        for (const win of BrowserWindow.getAllWindows()) {
          try { win.webContents.send('app:autoKillReactivated', { previousValue: undefined, reason: 'Fresh install: Steam alive at startup' }) } catch {}
        }
      }
    } catch (err: any) {
      logger.warn(`[auto-kill] check crash: ${err?.message ?? err}`, 'steam')
    }
  })()

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

  // Verificar si Windows Defender bloqueó los DLLs nativos
  // (falsos positivos comunes con DLL hook/sideload)
  setImmediate(() => {
    showDefenderWarningIfNeeded()
  })

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