/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_STEAMGRIDDB_API_KEY?: string
}

interface SteamResult {
  success: boolean
  error?: string
  message?: string
  path?: string | null
}

interface InstalledGame {
  appId: string
  name: string
  installDir: string
  universe: string
  stateFlags: string
  sizeOnDisk: number
  lastUpdated: number
  lastPlayed: number
  installedAt: number
  buildid: string
  bytesToDownload: number
  bytesDownloaded: number
  autoUpdateBehavior: string
  manifestFile: string
}

interface LibraryFoldersResult {
  success: boolean
  folders: string[]
  error?: string
}

interface ListGamesResult {
  success: boolean
  games: InstalledGame[]
  error?: string
}

interface SteamRunningResult {
  running: boolean
}

interface ParsedLuaAppId {
  id: string
  type?: string
  key?: string
}

interface ParsedLuaManifest {
  depotId: string
  manifestId: string
}

interface ParsedLuaScript {
  appIds: ParsedLuaAppId[]
  manifestIds: ParsedLuaManifest[]
  rawContent: string
  fileName: string
}

interface LuaScriptEntry {
  fileName: string
  content: string
  parsed: ParsedLuaScript
}

interface ManifestFileEntry {
  fileName: string
  size: number
  depotId: string
  manifestId: string
}

interface ImportGameFolderResult {
  success: boolean
  error?: string
  actions?: string[]
  errors?: string[]
  warnings?: string[]
  message?: string
  importedGames?: { appId: string; name: string }[]
  luaCount?: number
  manifestCount?: number
}

interface LogEntry {
  timestamp: string
  level: string
  message: string
  source?: string
}

interface LogConfig {
  enabled: boolean
  minLevel: string
  maxFileSize: number
  maxBackups: number
}

interface Window {
  steamtools: {
    appReady: () => Promise<void>
    setSplashStatus: (status: string, percent: number) => Promise<void>
    getLocale: () => Promise<string>
    getVersion: () => Promise<string>
    openImageDialog: () => Promise<string | null>
    readImageAsDataURL: (filePath: string) => Promise<string | null>
    openExternal: (url: string) => Promise<{ success: boolean; error?: string }>
    setUsername: (username: string | null) => Promise<void>
    getUsername: () => Promise<string | null>
    isAuthenticated: () => Promise<boolean>
    loginSuccess: () => Promise<void>
    logout: () => Promise<void>
    getPathForFile: (file: File) => string
    getSteamPath: () => Promise<SteamResult>
    getLibraryFolders: () => Promise<LibraryFoldersResult>
    listInstalledGames: () => Promise<ListGamesResult>
    launchGame: (appId: string) => Promise<SteamResult>
    uninstallGame: (appId: string) => Promise<SteamResult>
    deleteGame: (appId: string, installDir: string) => Promise<SteamResult & { manifestDeleted?: boolean; folderDeleted?: boolean }>
    openGameLocation: (appId: string, installDir: string) => Promise<SteamResult>
    verifyGame: (appId: string) => Promise<SteamResult>
    getStoreImage: (appId: string, steamGridDbApiKey?: string) => Promise<{ success: boolean; imageUrl?: string; error?: string }>
    getStoreBrowseImage: (appId: string) => Promise<{ success: boolean; imageUrl?: string; error?: string }>
    importManifest: (options: { manifestPath: string }) => Promise<SteamResult>
    listManifestFiles: () => Promise<{ success: boolean; manifests: ManifestFileEntry[] }>
    deleteManifestFile: (fileName: string) => Promise<SteamResult>
    listLuaScripts: () => Promise<{ success: boolean; scripts: LuaScriptEntry[] }>
    parseLuaScript: (options: { luaPath: string }) => Promise<{ success: boolean; parsed?: ParsedLuaScript; content?: string; error?: string }>
    importLuaScript: (options: { luaPath: string }) => Promise<SteamResult & { parsed?: ParsedLuaScript }>
    deleteLuaScript: (fileName: string) => Promise<SteamResult>
    restartSteam: () => Promise<SteamResult>
    verifySteam: () => Promise<SteamResult>
    checkVerification: () => Promise<{ installed: boolean; missing: string[] }>
    closeSteam: () => Promise<SteamResult>
    isSteamRunning: () => Promise<SteamRunningResult>
    importGameFolder: (options: { folderPath: string }) => Promise<ImportGameFolderResult>
    searchGames: (query: string) => Promise<{ success: boolean; results: { appId: string; name: string; type: string }[]; error?: string }>
    isFreeToPlay: (appId: string) => Promise<{ success: boolean; isFree: boolean }>
    getLogs: (filter?: { level?: string; search?: string; limit?: number }) => Promise<LogEntry[]>
    addLog: (entry: { level?: string; message: string }) => Promise<{ success: boolean }>
    clearLogs: () => Promise<{ success: boolean }>
    exportLogs: () => Promise<{ success: boolean; error?: string }>
    getLogConfig: () => Promise<LogConfig>
    setLogConfig: (partial: Partial<LogConfig>) => Promise<LogConfig>
    onLogEntry: (callback: (entry: LogEntry) => void) => () => void
    storeInstallGame: (game: {
      app_id: string
      name: string
      lua_content: string
      manifest_files: { depot_id: string; manifest_id: string }[]
      depot_keys: { depot_id: string; key: string }[]
    }) => Promise<ImportGameFolderResult>
    storeGetLocalGameData: (appId: string) => Promise<{
      success: boolean
      error?: string
      game?: {
        app_id: string
        name: string
        lua_content: string
        manifest_files: { depot_id: string; manifest_id: string }[]
        depot_keys: { depot_id: string; key: string }[]
      }
    }>
    storeGetLocalAppIds: () => Promise<{ success: boolean; appIds: string[] }>
    checkAppTypes: (appIds: string[]) => Promise<Record<string, { isGame: boolean; isAdult: boolean }>>
    readConfig: () => Promise<object | null>
    writeConfig: (data: object) => Promise<{ success: boolean; error?: string }>
    enableOnlineFix: (appId: string) => Promise<{ success: boolean; error?: string; launchOptions?: string; message?: string }>
    disableOnlineFix: (appId: string) => Promise<{ success: boolean; error?: string; launchOptions?: string; message?: string }>
    checkOnlineFixStatus: (appId: string) => Promise<{ enabled: boolean; launchOptions: string }>
    removeDrm: (appId: string) => Promise<{ success: boolean; message: string; hadDrm: boolean; backupPath?: string; exePath?: string }>
    checkDrmStatus: (appId: string) => Promise<{ status: 'no-drm' | 'drm-removed' | 'drm-present' | 'not-found'; exePath?: string; backupPath?: string; message: string }>
    onSteamError: (callback: (error: { type: string; message: string; solution: string; rawLine: string }) => void) => () => void
    startSteamLogMonitor: () => Promise<{ success: boolean }>
    stopSteamLogMonitor: () => Promise<{ success: boolean }>
    windowMinimize: () => Promise<void>
    windowMaximize: () => Promise<void>
    windowClose: () => Promise<void>
    installUpdate: () => Promise<void>
    onUpdateAvailable: (callback: (info: { version?: string }) => void) => () => void
    onUpdateDownloaded: (callback: (info: { version?: string }) => void) => () => void
    onSignaturePending: (callback: (info: { component: string; sha256: string }) => void) => () => void
  }
}
