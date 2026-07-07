import { contextBridge, ipcRenderer, webUtils } from 'electron'

contextBridge.exposeInMainWorld('steamtools', {
  // App lifecycle
  appReady: () => ipcRenderer.invoke('app:ready'),
  setSplashStatus: (status: string, percent: number) => ipcRenderer.invoke('splash:setStatus', { status, percent }),
  getLocale: () => ipcRenderer.invoke('app:getLocale'),
  getVersion: () => ipcRenderer.invoke('app:getVersion'),
  openImageDialog: () => ipcRenderer.invoke('dialog:openImageFile'),
  readImageAsDataURL: (filePath: string) => ipcRenderer.invoke('app:readImageAsDataURL', filePath),
  openExternal: (url: string) => ipcRenderer.invoke('app:openExternal', url),

  // Auth (username only — no tokens, no passwords)
  setUsername: (username: string | null) =>
    ipcRenderer.invoke('auth:setUsername', username),
  getUsername: () => ipcRenderer.invoke('auth:getUsername'),
  isAuthenticated: () => ipcRenderer.invoke('auth:isAuthenticated'),
  loginSuccess: () => ipcRenderer.invoke('auth:loginSuccess'),
  logout: () => ipcRenderer.invoke('auth:logout'),

  // File path resolution for drag & drop (Electron 31+ with context isolation)
  getPathForFile: (file: File) => webUtils.getPathForFile(file),

  // Steam directory
  getSteamPath: () => ipcRenderer.invoke('steam:getPath'),
  getLibraryFolders: () => ipcRenderer.invoke('steam:getLibraryFolders'),

  // Game actions
  listInstalledGames: () => ipcRenderer.invoke('steam:listInstalledGames'),
  launchGame: (appId: string) => ipcRenderer.invoke('steam:launchGame', appId),
  uninstallGame: (appId: string) => ipcRenderer.invoke('steam:uninstallGame', appId),
  deleteGame: (appId: string, installDir: string) => ipcRenderer.invoke('steam:deleteGame', appId, installDir),
  openGameLocation: (appId: string, installDir: string) => ipcRenderer.invoke('library:openLocation', appId, installDir),
  verifyGame: (appId: string) => ipcRenderer.invoke('library:verifyGame', appId),
  getStoreImage: (appId: string, steamGridDbApiKey?: string) => ipcRenderer.invoke('steam:getStoreImage', appId, steamGridDbApiKey),

  // Manifest files
  importManifest: (options: { manifestPath: string }) =>
    ipcRenderer.invoke('steam:importManifest', options),
  listManifestFiles: () => ipcRenderer.invoke('steam:listManifestFiles'),
  deleteManifestFile: (fileName: string) => ipcRenderer.invoke('steam:deleteManifestFile', fileName),

  // Lua scripts management
  listLuaScripts: () => ipcRenderer.invoke('steam:listLuaScripts'),
  parseLuaScript: (options: { luaPath: string }) =>
    ipcRenderer.invoke('steam:parseLuaScript', options),
  importLuaScript: (options: { luaPath: string }) =>
    ipcRenderer.invoke('steam:importLuaScript', options),
  deleteLuaScript: (fileName: string) => ipcRenderer.invoke('steam:deleteLuaScript', fileName),

  // Steam process
  restartSteam: () => ipcRenderer.invoke('steam:restartSteam'),
  verifySteam: () => ipcRenderer.invoke('steam:verifySteam'),
  checkVerification: () => ipcRenderer.invoke('steam:checkVerification'),
  closeSteam: () => ipcRenderer.invoke('steam:closeSteam'),
  isSteamRunning: () => ipcRenderer.invoke('steam:isRunning'),

  // Smart game search
  searchGames: (query: string) =>
    ipcRenderer.invoke('steam:searchGames', query),
  isFreeToPlay: (appId: string) =>
    ipcRenderer.invoke('steam:isFreeToPlay', appId),

  // Import game folder (drag & drop)
  importGameFolder: (options: { folderPath: string }) =>
    ipcRenderer.invoke('steam:importGameFolder', options),

  // Logs
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

  // Store
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

  // Steam app type checker (client-side, uses user's IP)
  checkAppTypes: (appIds: string[]) =>
    ipcRenderer.invoke('steam:checkAppTypes', appIds),

  // Config file persistence
  readConfig: () => ipcRenderer.invoke('config:read'),
  writeConfig: (data: object) => ipcRenderer.invoke('config:write', data),

  // Online Fix
  enableOnlineFix: (appId: string) => ipcRenderer.invoke('onlinefix:enable', { appId }),
  disableOnlineFix: (appId: string) => ipcRenderer.invoke('onlinefix:disable', { appId }),
  checkOnlineFixStatus: (appId: string) => ipcRenderer.invoke('onlinefix:status', { appId }),

  // DRM Remover
  removeDrm: (appId: string) => ipcRenderer.invoke('drm:remove', appId),
  checkDrmStatus: (appId: string) => ipcRenderer.invoke('drm:status', appId),

  // Steam Log Monitor
  onSteamError: (callback: (error: { type: string; message: string; solution: string; rawLine: string }) => void) => {
    const handler = (_event: any, error: any) => callback(error)
    ipcRenderer.on('steam:error', handler)
    return () => ipcRenderer.removeListener('steam:error', handler)
  },
  startSteamLogMonitor: () => ipcRenderer.invoke('steam-log-watcher:start'),
  stopSteamLogMonitor: () => ipcRenderer.invoke('steam-log-watcher:stop'),

  // Window controls
  windowMinimize: () => ipcRenderer.invoke('window-minimize'),
  windowMaximize: () => ipcRenderer.invoke('window-maximize'),
  windowClose: () => ipcRenderer.invoke('window-close'),

  // Auto-updater
  installUpdate: () => ipcRenderer.invoke('app:installUpdate'),
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

  // Signature validation
  onSignaturePending: (callback: (info: { component: string; sha256: string }) => void) => {
    const handler = (_event: any, info: { component: string; sha256: string }) => callback(info)
    ipcRenderer.on('signature:pending', handler)
    return () => ipcRenderer.removeListener('signature:pending', handler)
  },
})
