import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { SteamCmdInstallOptions, SteamCmdProgress } from './modules/steamcmd-manager'

// ============================================================================
// Service Gateway — typed bridge between renderer and main process
//
// Reemplaza 88+ métodos IPC planos con 2 métodos genéricos:
//   gateway.call(service, method, ...args) → ipcRenderer.invoke
//   gateway.on(event, handler)             → ipcRenderer.on + cleanup
// ============================================================================

function createGateway() {
  return {
    call: <T = unknown>(service: string, method: string, ...args: unknown[]): Promise<T> => {
      console.log('[STARTUP] [GW] gateway.call(' + service + '.' + method + ') args=' + args.length)
      const promise = ipcRenderer.invoke('gateway:call', { service, method, args })
      promise.then(() => console.log('[STARTUP] [GW] gateway.call(' + service + '.' + method + ') resolved')).catch((err) => console.log('[STARTUP] [GW] gateway.call(' + service + '.' + method + ') rejected:', err?.message))
      return promise
    },
    on: <T = unknown>(event: string, callback: (data: T) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: T) => callback(data)
      ipcRenderer.on(event, handler)
      return () => {
        ipcRenderer.removeListener(event, handler)
      }
    },
  }
}

contextBridge.exposeInMainWorld('steamtools', {
  // ── Service Gateway (NUEVO) ────────────────────────────────────────────
  gateway: createGateway(),
  invoke: <T = unknown>(channel: string, ...args: unknown[]): Promise<T> => ipcRenderer.invoke(channel, ...args),

  // ── App lifecycle ──────────────────────────────────────────────────────
  appReady: () => ipcRenderer.invoke('app:ready'),
  setSplashStatus: (status: string, percent: number) => ipcRenderer.invoke('splash:setStatus', { status, percent }),
  getLocale: () => ipcRenderer.invoke('app:getLocale'),
  getVersion: () => ipcRenderer.invoke('app:getVersion'),
  openImageDialog: () => ipcRenderer.invoke('dialog:openImageFile'),
  readImageAsDataURL: (filePath: string) => ipcRenderer.invoke('app:readImageAsDataURL', filePath),
  openExternal: (url: string) => ipcRenderer.invoke('app:openExternal', url),

  // ── Auth ───────────────────────────────────────────────────────────────
  setUsername: (username: string | null) =>
    ipcRenderer.invoke('auth:setUsername', username),
  getUsername: () => ipcRenderer.invoke('auth:getUsername'),
  isAuthenticated: () => ipcRenderer.invoke('auth:isAuthenticated'),
  loginSuccess: () => ipcRenderer.invoke('auth:loginSuccess'),
  logout: () => ipcRenderer.invoke('auth:logout'),

  // ── File path resolution (drag & drop) ─────────────────────────────────
  getPathForFile: (file: File) => webUtils.getPathForFile(file),

  // ── Steam directory ────────────────────────────────────────────────────
  getSteamPath: () => ipcRenderer.invoke('steam:getPath'),
  openSteamFolderDialog: () => ipcRenderer.invoke('steam:openSteamFolderDialog'),
  getLibraryFolders: () => ipcRenderer.invoke('steam:getLibraryFolders'),

  // ── Game actions ───────────────────────────────────────────────────────
  listInstalledGames: () => ipcRenderer.invoke('steam:listInstalledGames'),
  resolveOrphanNames: (games: { appId: string; installDir: string }[]) =>
    ipcRenderer.invoke('steam:resolveOrphanNames', games),
  launchGame: (appId: string) => ipcRenderer.invoke('steam:launchGame', appId),
  uninstallGame: (appId: string) => ipcRenderer.invoke('steam:uninstallGame', appId),
  deleteGame: (appId: string, installDir: string) => ipcRenderer.invoke('steam:deleteGame', appId, installDir),
  openGameLocation: (appId: string, installDir: string) => ipcRenderer.invoke('library:openLocation', appId, installDir),
  verifyGame: (appId: string) => ipcRenderer.invoke('library:verifyGame', appId),
  getStoreImage: (appId: string, steamGridDbApiKey?: string) => ipcRenderer.invoke('steam:getStoreImage', appId, steamGridDbApiKey),

  // ── Manifest files ─────────────────────────────────────────────────────
  importManifest: (options: { manifestPath: string }) =>
    ipcRenderer.invoke('steam:importManifest', options),
  listManifestFiles: () => ipcRenderer.invoke('steam:listManifestFiles'),
  deleteManifestFile: (fileName: string) => ipcRenderer.invoke('steam:deleteManifestFile', fileName),

  // ── Lua scripts ────────────────────────────────────────────────────────
  listLuaScripts: () => ipcRenderer.invoke('steam:listLuaScripts'),
  parseLuaScript: (options: { luaPath: string }) =>
    ipcRenderer.invoke('steam:parseLuaScript', options),
  importLuaScript: (options: { luaPath: string }) =>
    ipcRenderer.invoke('steam:importLuaScript', options),
  deleteLuaScript: (fileName: string) => ipcRenderer.invoke('steam:deleteLuaScript', fileName),

  // ── Steam process ───────────────────────────────────────────────────────
  restartSteam: () => ipcRenderer.invoke('steam:restartSteam'),
  verifySteam: () => ipcRenderer.invoke('steam:verifySteam'),
  checkVerification: () => ipcRenderer.invoke('steam:checkVerification'),
  closeSteam: () => ipcRenderer.invoke('steam:closeSteam'),
  isSteamRunning: () => ipcRenderer.invoke('steam:isRunning'),

  // ── Smart game search ──────────────────────────────────────────────────
  searchGames: (query: string) =>
    ipcRenderer.invoke('steam:searchGames', query),
  isFreeToPlay: (appId: string) =>
    ipcRenderer.invoke('steam:isFreeToPlay', appId),

  // ── Import game folder ─────────────────────────────────────────────────
  importGameFolder: (options: { folderPath: string }) =>
    ipcRenderer.invoke('steam:importGameFolder', options),

  // ── Logs ────────────────────────────────────────────────────────────────
  getLogs: (filter?: { level?: string; search?: string; limit?: number }) =>
    ipcRenderer.invoke('logs:getEntries', filter),
  addLog: (entry: { level?: string; message: string }) => ipcRenderer.invoke('logs:add', entry),
  clearLogs: () => ipcRenderer.invoke('logs:clear'),
  exportLogs: () => ipcRenderer.invoke('logs:export'),
  getLogConfig: () => ipcRenderer.invoke('logs:getConfig'),
  setLogConfig: (partial: { enabled?: boolean; minLevel?: string; maxFileSize?: number; maxBackups?: number }) =>
    ipcRenderer.invoke('logs:setConfig', partial),
  onLogEntry: (callback: (entry: any) => void) => {
    const handler = (_event: any, entry: any) => callback(entry)
    ipcRenderer.on('log:entry', handler)
    return () => ipcRenderer.removeListener('log:entry', handler)
  },

  // ── Store ────────────────────────────────────────────────────────────────
  storeInstallGame: (game: {
    app_id: string
    name: string
    lua_content: string
    manifest_files: { depot_id: string; manifest_id: string }[]
    depot_keys: { depot_id: string; key: string }[]
  }) => ipcRenderer.invoke('store:installGame', game),
  storeGetLocalGameData: (appId: string) =>
    ipcRenderer.invoke('store:getLocalGameData', appId),
  storeGetLocalAppIds: () =>
    ipcRenderer.invoke('store:getLocalAppIds'),

  // ── Download depot (steampipe) ─────────────────────────────────────────
  downloadDepot: (options: {
    appId: number
    depotId: number
    manifestId: string | number
    installDir: string
    cellId?: number
  }) => ipcRenderer.invoke('steampipe:downloadDepot', options),

  // ── Steam app type checker ───────────────────────────────────────────────
  checkAppTypes: (appIds: string[]) =>
    ipcRenderer.invoke('steam:checkAppTypes', appIds),

  // ── Steam store API (proxied) ──────────────────────────────────────────
  fetchAppDetails: (appId: string, cc?: string, lang?: string) =>
    ipcRenderer.invoke('steam:fetchAppDetails', appId, cc, lang),

  // ── Config persistence ─────────────────────────────────────────────────
  readConfig: () => ipcRenderer.invoke('config:read'),
  writeConfig: (data: object) => ipcRenderer.invoke('config:write', data),

  // ── Online Fix ─────────────────────────────────────────────────────────
  enableOnlineFix: (appId: string) => ipcRenderer.invoke('onlinefix:enable', { appId }),
  disableOnlineFix: (appId: string) => ipcRenderer.invoke('onlinefix:disable', { appId }),
  checkOnlineFixStatus: (appId: string) => ipcRenderer.invoke('onlinefix:status', { appId }),
  generateOnlineFix: (appId: string) => ipcRenderer.invoke('onlinefix:generate', { appId }),
  removeOnlineFix: (appId: string) => ipcRenderer.invoke('onlinefix:remove', { appId }),
  detectOnlineFix: (appId: string) => ipcRenderer.invoke('onlinefix:detect', { appId }),

  // ── DRM Remover ────────────────────────────────────────────────────────
  removeDrm: (appId: string) => ipcRenderer.invoke('drm:remove', appId),
  checkDrmStatus: (appId: string) => ipcRenderer.invoke('drm:status', appId),

  // ── Steam Log Monitor ──────────────────────────────────────────────────
  onSteamError: (callback: (error: { type: string; message: string; solution: string; rawLine: string }) => void) => {
    const handler = (_event: any, error: any) => callback(error)
    ipcRenderer.on('steam:error', handler)
    return () => ipcRenderer.removeListener('steam:error', handler)
  },
  startSteamLogMonitor: () => ipcRenderer.invoke('steam-log-watcher:start'),
  stopSteamLogMonitor: () => ipcRenderer.invoke('steam-log-watcher:stop'),

  // ── Window controls ──────────────────────────────────────────────────────
  windowMinimize: () => ipcRenderer.invoke('window-minimize'),
  windowMaximize: () => ipcRenderer.invoke('window-maximize'),
  windowClose: () => ipcRenderer.invoke('window-close'),

  // ── Remote Play input bridge ──────────────────────────────────────────
  // The host renderer receives binary input frames over a WebRTC data
  // channel from the mobile client. The renderer forwards each frame to
  // the main process via this IPC, where input-bridge.ts decodes the
  // binary payload and dispatches it to win32-input (SendInput). Frames
  // are also accepted from any source so utilities / debugging tools
  // can inject inputs without the WebRTC hop.
  inputBridge: {
    dispatch: (frame: Uint8Array) =>
      // Electron cannot pass a raw Uint8Array across contextBridge in some
      // Chromium versions — wrapping in a plain ArrayBuffer sidesteps the
      // "Failed to serialize argument" warning emitted by ipcRenderer.
      ipcRenderer.invoke('inputBridge:dispatch', frame.buffer.slice(
        frame.byteOffset, frame.byteOffset + frame.byteLength,
      )),
    isReady: () => ipcRenderer.invoke('inputBridge:isReady'),
  },

  // ── Remote Play desktopCapturer fallback ─────────────────────────────
  // Returns [{ id, name }] for available screen+window sources, queried via
  // Electron's desktopCapturer API on the main process. The renderer uses
  // this to feed `chromeMediaSourceId` to getUserMedia() when the standard
  // getDisplayMedia() flow is gated on this Chromium version. Video-only on
  // Windows (system audio capture through desktopCapturer is unreliable).
  getDesktopSources: (types?: ('window' | 'screen')[]) =>
    ipcRenderer.invoke('desktop-capturer:get-sources', { types: types ?? ['screen', 'window'] }),

  // ── Mobile-launch IPC ─────────────────────────────────────────────────────
  // Broadcast from `remotePlay.launchFromMobile` (electron/services/remote-play.service.ts)
  // to every BrowserWindow. The renderer-side `HostRemotePlayAuto` component
  // (mounted inside AppShell) listens for this and starts screen capture +
  // TCP signaling + WebRTC host peer so the phone's stream lands without the
  // desktop user having to open Remote Play first.
  onMobileLaunch: (callback: (payload: { appId: string; sessionId: string }) => void) => {
    const handler = (_event: any, payload: any) => callback(payload)
    ipcRenderer.on('remotePlay:mobileLaunch', handler)
    return () => {
      ipcRenderer.removeListener('remotePlay:mobileLaunch', handler)
    }
  },

  // ── Windows Defender Auto-Fix ────────────────────────────────────────────
  getDefenderStatus: () => ipcRenderer.invoke('app:defenderCheck'),
  runDefenderFix: () => ipcRenderer.invoke('app:runDefenderFix'),

  // ── Auto-updater ────────────────────────────────────────────────────────
  installUpdate: () => ipcRenderer.invoke('app:installUpdate'),
  getNativeDiagnostics: () => ipcRenderer.invoke('app:getNativeDiagnostics'),
  getEmulatorDiagnostics: () => ipcRenderer.invoke('app:emulatorDiagnostics'),
  manualDownloadUpdate: (url: string) => ipcRenderer.invoke('app:manualDownloadUpdate', url),
  // ── Round-11: generic app:* event subscription shim ───────────────────────
  // Used by useSettingsStore to react to main-process state flips:
  //   app:autoKillReactivated — Steam alive at startup flipped kill-flag to true
  //   app:autoBuildFinished    — silent build attempt at startup completed/failed
  onAppEvent: (event: string, callback: (payload: any) => void) => {
    const channel = `app:${event}`
    const handler = (_e: any, payload: any) => callback(payload)
    ipcRenderer.on(channel, handler)
    return () => ipcRenderer.removeListener(channel, handler)
  },

  // ── Round-12: toolchain installer trigger ─────────────────────────────
  // Streams progress via onAppEvent('app:installToolchain:progress', cb),
  // fires onAppEvent('app:installToolchain:finished', cb) on completion.
  installToolchain: () => ipcRenderer.invoke('app:installToolchain'),
  runManualInstaller: (installerPath: string) => ipcRenderer.invoke('app:runManualInstaller', installerPath),
  onUpdateAvailable: (callback: (info: { version?: string }) => void) => {
    const handler = (_event: any, info: { version?: string }) => callback(info)
    ipcRenderer.on('update-available', handler)
    return () => ipcRenderer.removeListener('update-available', handler)
  },
  onUpdateProgress: (callback: (info: { percent: number; transferred: number; total: number; bytesPerSecond: number }) => void) => {
    const handler = (_event: any, info: { percent: number; transferred: number; total: number; bytesPerSecond: number }) => callback(info)
    ipcRenderer.on('update-progress', handler)
    return () => ipcRenderer.removeListener('update-progress', handler)
  },
  onUpdateDownloaded: (callback: (info: { version?: string }) => void) => {
    const handler = (_event: any, info: { version?: string }) => callback(info)
    ipcRenderer.on('update-downloaded', handler)
    return () => ipcRenderer.removeListener('update-downloaded', handler)
  },
  onUpdateError: (callback: (info: { message: string }) => void) => {
    const handler = (_event: any, info: { message: string }) => callback(info)
    ipcRenderer.on('update-error', handler)
    return () => ipcRenderer.removeListener('update-error', handler)
  },

  // ── SteamCMD ──────────────────────────────────────────────────────────
  startSteamCmdInstall: (opts: SteamCmdInstallOptions) =>
    ipcRenderer.invoke('steamcmd:start', opts),
  cancelSteamCmdInstall: (appId: string) =>
    ipcRenderer.invoke('steamcmd:cancel', appId),
  isSteamCmdAvailable: () => ipcRenderer.invoke('steamcmd:isAvailable'),
  fetchSteamCmd: () => ipcRenderer.invoke('steamcmd:fetch'),
  listSteamCmdJobs: () => ipcRenderer.invoke('steamcmd:list'),
  onSteamCmdProgress: (callback: (payload: SteamCmdProgress) => void) => {
    const handler = (_event: any, payload: SteamCmdProgress) => callback(payload)
    ipcRenderer.on('steamcmd:progress', handler)
    return () => ipcRenderer.removeListener('steamcmd:progress', handler)
  },

  // ── Signature validation ────────────────────────────────────────────────
  retrySignatureCheck: () => ipcRenderer.invoke('steam:retrySignature'),

  // ── Download Engine v2 ──────────────────────────────────────────────────
  downloadCreateTask: (opts: any) => ipcRenderer.invoke('download:createTask', opts),
  downloadStartTask: (taskId: string) => ipcRenderer.invoke('download:startTask', taskId),
  downloadPauseTask: (taskId: string) => ipcRenderer.invoke('download:pauseTask', taskId),
  downloadCancelTask: (taskId: string) => ipcRenderer.invoke('download:cancelTask', taskId),
  downloadGetTasks: () => ipcRenderer.invoke('download:getTasks'),
  downloadGetHistory: () => ipcRenderer.invoke('download:getHistory'),
  downloadGetStatus: () => ipcRenderer.invoke('download:getStatus'),
  downloadSetPriority: (taskId: string, priority: number) =>
    ipcRenderer.invoke('download:setPriority', taskId, priority),
  downloadReorderTask: (taskId: string, newIndex: number) =>
    ipcRenderer.invoke('download:reorderTask', taskId, newIndex),
  downloadSetPaused: (paused: boolean) => ipcRenderer.invoke('download:setPaused', paused),
  downloadClearCompleted: () => ipcRenderer.invoke('download:clearCompleted'),
  downloadClearHistory: () => ipcRenderer.invoke('download:clearHistory'),
  downloadStartFromApi: (opts: any) => ipcRenderer.invoke('download:startFromApi', opts),

  onDownloadProgress: (callback: (payload: any) => void) => {
    const handler = (_event: any, payload: any) => callback(payload)
    ipcRenderer.on('download:progress', handler)
    return () => ipcRenderer.removeListener('download:progress', handler)
  },
  onDownloadCompleted: (callback: (payload: any) => void) => {
    const handler = (_event: any, payload: any) => callback(payload)
    ipcRenderer.on('download:completed', handler)
    return () => ipcRenderer.removeListener('download:completed', handler)
  },
  onDownloadFailed: (callback: (payload: any) => void) => {
    const handler = (_event: any, payload: any) => callback(payload)
    ipcRenderer.on('download:failed', handler)
    return () => ipcRenderer.removeListener('download:failed', handler)
  },
  onDownloadQueueChanged: (callback: (payload: any) => void) => {
    const handler = (_event: any, payload: any) => callback(payload)
    ipcRenderer.on('download:queue-changed', handler)
    return () => ipcRenderer.removeListener('download:queue-changed', handler)
  },
  onDownloadEngineStatus: (callback: (payload: any) => void) => {
    const handler = (_event: any, payload: any) => callback(payload)
    ipcRenderer.on('download:engine-status', handler)
    return () => ipcRenderer.removeListener('download:engine-status', handler)
  },
})
