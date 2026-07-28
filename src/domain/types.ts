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
  description?: string
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

// ── Game Runtime Environment ──────────────────────────────────────────────

/** Result of a runtime detection check. */
export interface RuntimeCheckResult {
  name: string
  installed: boolean
  version?: string
  installPath?: string
}

/** Full runtime manifest for a game. */
export interface RuntimeManifest {
  vcRedist: RuntimeCheckResult[]
  directX: RuntimeCheckResult
  dotNet: RuntimeCheckResult[]
  openAL: RuntimeCheckResult
  xna: RuntimeCheckResult
}

/** Runtime type identifiers. */
export type RuntimeType =
  | 'vc_redist_2010'
  | 'vc_redist_2012'
  | 'vc_redist_2013'
  | 'vc_redist_2015_2022'
  | 'directx'
  | 'dotnet_48'
  | 'dotnet_80'
  | 'openal'
  | 'xna'

/** Game launch profile. */
export interface LaunchProfile {
  name: string
  args: string
  envVars: Record<string, string>
  resolution: { width: number; height: number; fullscreen: boolean } | null
  compatLayer: CompatLayerConfig | null
  preLaunch: string[]
  postLaunch: string[]
  isDefault: boolean
}

/** Compat layer configuration. */
export interface CompatLayerConfig {
  type: 'proton' | 'wine' | 'dxvk' | 'vkd3d' | 'none'
  version?: string
  path?: string
}

/** Save file entry. */
export interface SaveEntry {
  path: string
  size: number
  lastModified: number
}

/** Save backup record. */
export interface SaveBackup {
  id: string
  appId: string
  name: string
  createdAt: number
  fileCount: number
  totalSize: number
  path: string
}

/** Game process status. */
export interface GameProcessStatus {
  pid: number | null
  running: boolean
  startTime: number | null
  elapsedSeconds: number
}

/** Play session record. */
export interface PlaySession {
  id: string
  appId: string
  startTime: number
  endTime: number | null
  durationSeconds: number
}

/** Play time summary. */
export interface PlayTimeSummary {
  appId: string
  totalSeconds: number
  sessions: PlaySession[]
  lastPlayed: number | null
}

// ── Library V2: Collections, Tags, Favorites ────────────────────────────────

export interface GameCollection {
  id: string
  name: string
  description: string
  coverAppId?: string
  appIds: string[]
  createdAt: number
  updatedAt: number
  isDynamic: boolean
  dynamicFilter?: {
    field: 'genre' | 'developer' | 'publisher' | 'tag' | 'playtime' | 'lastPlayed'
    operator: 'eq' | 'neq' | 'gt' | 'lt' | 'contains'
    value: string | number
  }
  sortOrder: number
}

export interface GameTag {
  id: string
  name: string
  color: string
}

export interface GameFavorite {
  appId: string
  favoritedAt: number
}

export interface GameNote {
  appId: string
  content: string
  updatedAt: number
}

export type LibraryViewMode = 'grid' | 'list' | 'compact'
