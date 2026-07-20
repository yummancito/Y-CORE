export interface SteamResult {
  success: boolean
  error?: string
  message?: string
  path?: string | null
}

export interface InstalledGame {
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
  playtime?: number
}

export interface LibraryFoldersResult {
  success: boolean
  folders: string[]
  error?: string
}

export interface ListGamesResult {
  success: boolean
  games: InstalledGame[]
  error?: string
}

export interface SteamRunningResult {
  running: boolean
}

export interface ParsedLuaAppId {
  id: string
  type?: string
  key?: string
}

export interface ParsedLuaManifest {
  depotId: string
  manifestId: string
}

export interface ParsedLuaScript {
  appIds: ParsedLuaAppId[]
  manifestIds: ParsedLuaManifest[]
  rawContent: string
  fileName: string
}

export interface LuaScriptEntry {
  fileName: string
  content: string
  parsed: ParsedLuaScript
}

export interface ManifestFileEntry {
  fileName: string
  size: number
  depotId: string
  manifestId: string
}

export interface ImportGameFolderResult {
  success: boolean
  error?: string
  actions?: string[]
  errors?: string[]
  importedGames?: { appId: string; name: string }[]
  luaCount?: number
  manifestCount?: number
}

export interface LogEntry {
  timestamp: string
  level: string
  message: string
  source?: string
}

export interface LogConfig {
  enabled: boolean
  minLevel: string
  maxFileSize: number
  maxBackups: number
}

export interface SteamState {
  path: string | null
  running: boolean
  libraryFolders: string[]
}

export interface ToastItem {
  id: string
  type: 'success' | 'error' | 'info' | 'warning'
  message: string
  duration?: number
}
