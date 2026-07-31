/**
 * Y-Core Mod Manager - Type Definitions
 * Defines interfaces for Steam Workshop API, mod installation, and backup system
 */

// ============================================================================
// Enums
// ============================================================================

export enum ModStatus {
  NOT_INSTALLED = 'not_installed',
  INSTALLED = 'installed',
  ENABLED = 'enabled',
  DISABLED = 'disabled',
  VALIDATING = 'validating',
  UPDATING = 'updating',
  CORRUPTED = 'corrupted',
  ROLLING_BACK = 'rolling_back',
}

export enum ModSourceType {
  STEAM_WORKSHOP = 'steam_workshop',
  NEXUSMODS = 'nexusmods',
  LOCAL = 'local',
}

export enum BackupStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CORRUPTED = 'corrupted',
}

export enum MalwareScanStatus {
  NOT_SCANNED = 'not_scanned',
  SCANNING = 'scanning',
  CLEAN = 'clean',
  QUARANTINED = 'quarantined',
  SUSPICIOUS = 'suspicious',
}

// ============================================================================
// Steam Workshop API Types
// ============================================================================

export interface SteamTag {
  id: number
  name: string
}

export interface SteamWorkshopFile {
  publishedfileid: string
  result: number // 1 = success, other = error
  creator: string
  creator_appid?: number
  title?: string
  description?: string
  file_size?: number
  file_url?: string
  preview_url?: string
  filename?: string
  time_created?: number
  time_updated?: number
  visibility?: number
  flags?: number
  tags?: Array<{ tag: string }>
  language?: string
  vote_data?: {
    votes_up: number
    votes_down: number
    score: number
  }
}

export interface SteamModDetails {
  id: string
  fileId: string
  title: string
  description: string
  author: string
  authorId: string
  createdAt: number
  updatedAt: number
  fileSize: number
  fileUrl: string
  previewUrl: string
  tags: string[]
  votesUp: number
  votesDown: number
  score: number
  downloadCount?: number
  subscriptionCount?: number
  favoriteCount?: number
  visibility: 'public' | 'friends_only' | 'private'
}

export interface SteamCatalogResponse {
  success: boolean
  total: number
  mods: SteamWorkshopFile[]
  error?: string
}

// ============================================================================
// Mod Information Types
// ============================================================================

export interface ModInfo {
  id: string
  gameAppId: string
  gameTitle: string
  title: string
  author: string
  description: string
  version: string
  status: ModStatus
  source: ModSourceType
  installPath: string
  fileSize: number
  fileUrl: string
  previewUrl: string
  tags: string[]
  dependencies: string[]
  loadOrder: number
  enabled: boolean
  installedAt: number
  lastUpdatedAt: number
  lastEnabledAt?: number
  compatibleVersions: string[]
  requiredDependencies: string[]
  // FIX #7, #8, #9, #10, #11: Game compatibility metadata
  metadata?: {
    gameArchitecture?: 'x86' | 'x64' | 'unknown'
    hasDRM?: boolean
    hasAnticheat?: boolean
    detectedLauncher?: string
  }
}

export interface ModQueryResult {
  mods: ModInfo[]
  total: number
  hasMore: boolean
  offset: number
  limit: number
}

// ============================================================================
// Backup System Types
// ============================================================================

export interface BackupInfo {
  id: string
  modId: string
  gameAppId: string
  timestamp: number
  status: BackupStatus
  size: number
  path: string
  createdBy: string // 'manual' | 'auto' | 'before_update'
  notes?: string
  integrity: {
    fileCount: number
    checksumValid: boolean
    lastVerified?: number
  }
  expiresAt?: number
}

export interface BackupMetadata {
  id: string
  version: string // backup format version
  modId: string
  timestamp: number
  size: number
  fileCount: number
  checksums: Record<string, string> // filename -> hash
}

// ============================================================================
// Installation Types
// ============================================================================

export interface ModInstallProgress {
  modId: string
  stage: 'validating' | 'backup' | 'download' | 'extract' | 'scan' | 'install' | 'cleanup'
  progress: number // 0-100
  speed: number // bytes per second
  eta: number // seconds remaining
  bytesTransferred: number
  totalBytes: number
  currentFile?: string
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled'
  error?: string
  warnings: string[]
}

export interface ModInstallOptions {
  modId: string
  gameAppId: string
  installDir: string
  createBackup: boolean
  scanForMalware: boolean
  overwrite: boolean
  priority?: 'low' | 'normal' | 'high'
  enableAfterInstall?: boolean
}

export interface ModInstallResult {
  success: boolean
  modId: string
  modInfo?: ModInfo
  backupId?: string
  warnings: string[]
  error?: string
  duration: number // milliseconds
}

// ============================================================================
// Uninstall Types
// ============================================================================

export interface ModUninstallOptions {
  modId: string
  gameAppId: string
  keepBackup: boolean
  clearDependents: boolean
}

export interface ModUninstallResult {
  success: boolean
  modId: string
  backupId?: string
  affectedMods: string[]
  error?: string
  duration: number
}

// ============================================================================
// Malware Scanning Types
// ============================================================================

export interface ModScanOptions {
  modId: string
  filePaths: string[]
  deepScan?: boolean
  updateVirusTotal?: boolean
}

export interface ModScanResult {
  modId: string
  timestamp: number
  overallStatus: MalwareScanStatus
  filesScanned: number
  filesQuarantined: number
  duration: number // milliseconds
  details: {
    filePath: string
    status: MalwareScanStatus
    threat?: string
    confidence?: number
  }[]
  recommendation: 'safe' | 'quarantine' | 'delete'
}

// ============================================================================
// Conflict Detection Types
// ============================================================================

export interface ModConflict {
  modIds: string[]
  type: 'file_conflict' | 'dependency_conflict' | 'version_conflict'
  severity: 'warning' | 'error'
  description: string
  resolution?: string
}

export interface ConflictCheckResult {
  hasConflicts: boolean
  conflicts: ModConflict[]
  warnings: string[]
}

// ============================================================================
// Cache Types
// ============================================================================

export interface CachedModDetails {
  data: SteamModDetails
  timestamp: number
  ttl: number // milliseconds
}

export interface CacheStats {
  entriesCount: number
  cacheSize: number // bytes
  oldestEntryAge: number // milliseconds
  newestEntryAge: number // milliseconds
  hitRate: number // 0-1
}

// ============================================================================
// Search Types
// ============================================================================

export interface ModSearchQuery {
  gameAppId: string
  search?: string
  tags?: string[]
  sort?: 'trending' | 'newest' | 'most_subscribed' | 'top_rated' | 'alphabetical'
  order?: 'asc' | 'desc'
  limit?: number
  offset?: number
  author?: string
  minScore?: number
}

export interface ModSearchResult {
  query: ModSearchQuery
  mods: SteamModDetails[]
  total: number
  hasMore: boolean
  searchTime: number // milliseconds
}

// ============================================================================
// Enable/Disable Types
// ============================================================================

export interface ModToggleOptions {
  modId: string
  gameAppId: string
  enabled: boolean
}

export interface ModToggleResult {
  success: boolean
  modId: string
  enabled: boolean
  affectedMods?: string[]
  error?: string
}

// ============================================================================
// Configuration Types
// ============================================================================

export interface ModManagerConfig {
  backupPath: string
  enableAutoBackup: boolean
  autoBackupInterval: number // milliseconds
  enableMalwareScanning: boolean
  malwareScanLevel: 'quick' | 'standard' | 'deep'
  enableConflictDetection: boolean
  cacheApiResponses: boolean
  cacheTTL: number // milliseconds
  maxCacheSize: number // bytes
  maxBackups: number
  backupRetention: number // milliseconds
  allowConcurrentInstalls: boolean
  maxConcurrentDownloads: number
}

// ============================================================================
// Statistics Types
// ============================================================================

export interface ModStatistics {
  totalMods: number
  enabledMods: number
  disabledMods: number
  totalBackups: number
  backupSize: number // bytes
  lastScan: number
  scanStatus: MalwareScanStatus
  conflicts: number
}

// ============================================================================
// Database Schema Types
// ============================================================================

export interface InstalledModRecord {
  id: string
  gameAppId: string
  fileId: string
  title: string
  author: string
  description: string
  version: string
  source: ModSourceType
  installPath: string
  fileSize: number
  fileUrl: string
  previewUrl: string
  tags: string // JSON serialized
  dependencies: string // JSON serialized
  enabled: boolean
  loadOrder: number
  status: ModStatus
  malwareScanStatus: MalwareScanStatus
  installedAt: number
  lastUpdatedAt: number
  lastEnabledAt?: number
  checksums: string // JSON serialized
  metadata: string // JSON serialized
  createdAt: number
  updatedAt: number
}

export interface BackupRecord {
  id: string
  modId: string
  gameAppId: string
  timestamp: number
  status: BackupStatus
  size: number
  path: string
  createdBy: string
  notes?: string
  fileCount: number
  checksumValid: boolean
  lastVerified?: number
  expiresAt?: number
  metadata: string // JSON serialized
  createdAt: number
  updatedAt: number
}

// ============================================================================
// Event Types
// ============================================================================

export interface ModEventPayload {
  'mod:installed': ModInstallResult
  'mod:uninstalled': ModUninstallResult
  'mod:enabled': ModToggleResult
  'mod:disabled': ModToggleResult
  'mod:updated': ModInstallResult
  'mod:scan-complete': ModScanResult
  'mod:backup-created': BackupInfo
  'mod:backup-restored': { modId: string; backupId: string }
  'mod:conflict-detected': ConflictCheckResult
  'mod:download-progress': ModInstallProgress
}
