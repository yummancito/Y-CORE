// ============================================================================
// electron/modules/mod-manager/types.ts
// ============================================================================
// Type definitions for mod backup and management systems.
// ============================================================================

/**
 * Backup metadata and information.
 */
export interface BackupInfo {
  /** Unique backup identifier (timestamp-based or UUID) */
  id: string
  /** Associated game ID (Steam app ID or custom identifier) */
  gameId: string
  /** Friendly name for the backup */
  name: string
  /** Unix timestamp of backup creation */
  createdAt: number
  /** Absolute path to backup root directory */
  path: string
  /** Total number of files in backup */
  fileCount: number
  /** Total size of backup in bytes (actual disk usage) */
  totalSize: number
  /** Real data size (deduplicated, actual unique bytes) */
  realDataSize: number
  /** Number of hardlinks used (for tracking deduplication) */
  hardlinkCount: number
  /** Whether hardlinks were used for this backup */
  usedHardlinks: boolean
  /** Checksum or hash of backup metadata for integrity */
  checksum: string
  /** Optional backup description */
  description?: string
  /** True if backup is currently being created/restored */
  inProgress?: boolean
  /** Progress information if in progress */
  progress?: BackupProgress
}

/**
 * Progress information for backup operations.
 */
export interface BackupProgress {
  /** Current operation: 'creating', 'restoring', 'verifying', 'deleting' */
  operation: 'creating' | 'restoring' | 'verifying' | 'deleting'
  /** Progress percentage (0-100) */
  percentage: number
  /** Number of files processed */
  filesProcessed: number
  /** Total files to process */
  totalFiles: number
  /** Current file being processed */
  currentFile?: string
  /** Bytes processed so far */
  bytesProcessed: number
  /** Total bytes to process */
  totalBytes: number
  /** Estimated time remaining in seconds */
  estimatedTimeRemaining?: number
  /** Current operation status message */
  status: string
  /** Error message if operation failed */
  error?: string
}

/**
 * Filesystem capability detection results.
 */
export interface FilesystemCapabilities {
  /** Whether filesystem supports hardlinks */
  hardlinksSupported: boolean
  /** Whether filesystem supports reflinks/snapshots */
  reflinksSupported: boolean
  /** Whether filesystem supports cloning (CoW) */
  cloneSupported: boolean
  /** Detected filesystem type (e.g., 'NTFS', 'ext4', 'APFS') */
  filesystemType: string
  /** Maximum file size supported */
  maxFileSize: number
  /** Available space in bytes */
  availableSpace: number
  /** Total space in bytes */
  totalSpace: number
  /** Unix timestamp when capabilities were cached (added for cache TTL validation) */
  cachedAt?: number
}

/**
 * Storage usage statistics for a game.
 */
export interface GameStorageStats {
  /** Game identifier */
  gameId: string
  /** Total backup size for this game */
  totalBackupSize: number
  /** Real data size (deduplicated) for this game */
  realDataSize: number
  /** Number of backups */
  backupCount: number
  /** Breakdown by backup */
  backups: BackupStorageInfo[]
}

/**
 * Storage information for a single backup.
 */
export interface BackupStorageInfo {
  backupId: string
  apparentSize: number
  realDataSize: number
  deduplicationRatio: number
  hardlinkCount: number
}

/**
 * Options for backup creation.
 */
export interface CreateBackupOptions {
  /** Optional friendly name for backup */
  name?: string
  /** Optional description */
  description?: string
  /** Whether to verify backup after creation */
  verify?: boolean
  /** Progress callback for UI updates */
  onProgress?: (progress: BackupProgress) => void
  /** Override auto-backup cleanup behavior */
  skipCleanup?: boolean
  /** Files/patterns to exclude from backup */
  excludePatterns?: string[]
}

/**
 * Options for restore operation.
 */
export interface RestoreBackupOptions {
  /** Whether to create a backup of current state before restore */
  createSnapshot?: boolean
  /** Whether to verify backup integrity before restore */
  verify?: boolean
  /** Progress callback for UI updates */
  onProgress?: (progress: BackupProgress) => void
  /** Force restore even if destination has newer files */
  force?: boolean
}

/**
 * Options for cleanup operations.
 */
export interface CleanupOptions {
  /** Retention days for backups (default: 7) */
  retentionDays?: number
  /** Number of recent backups to keep (default: 3) */
  keepLatestCount?: number
  /** Progress callback */
  onProgress?: (progress: BackupProgress) => void
}

/**
 * Backup manager configuration.
 */
export interface BackupManagerConfig {
  /** Root directory for all backups */
  backupsDir: string
  /** Auto-backup before mod installation */
  autoBackupBeforeInstall?: boolean
  /** Auto-rollback on install failure */
  autoRollbackOnFailure?: boolean
  /** Default retention days for old backups */
  defaultRetentionDays?: number
  /** Default number of backups to keep */
  defaultKeepCount?: number
  /** Enable compression for old backups */
  enableCompression?: boolean
  /** Compression retention days (when to compress backups) */
  compressionRetentionDays?: number
  /** Maximum concurrent hardlink operations */
  maxConcurrentOps?: number
  /** Timeout for backup operations in ms */
  operationTimeoutMs?: number
  /** Enable detailed logging */
  verbose?: boolean
}

/**
 * Backup validation result.
 */
export interface BackupValidationResult {
  /** Overall validity */
  valid: boolean
  /** Details of validation */
  details: {
    metadataValid: boolean
    checksumMatch: boolean
    allFilesPresent: boolean
    integrityVerified: boolean
    errorMessages: string[]
  }
}

/**
 * Backup operation event.
 */
export interface BackupEvent {
  type: 'backup-created' | 'backup-restored' | 'backup-deleted' | 'progress' | 'error'
  gameId: string
  backupId?: string
  timestamp: number
  data?: any
  error?: string
}

/**
 * Hardlink fallback behavior.
 */
export type FallbackStrategy = 'copy' | 'reflink' | 'error'

/**
 * Backup statistics for analysis.
 */
export interface BackupStatistics {
  /** Total backups across all games */
  totalBackups: number
  /** Total storage used */
  totalStorage: number
  /** Total real data (deduplicated) */
  totalRealData: number
  /** Overall deduplication ratio */
  deduplicationRatio: number
  /** Backups using hardlinks */
  hardlinkBackupCount: number
  /** Backups using full copy */
  fullCopyBackupCount: number
  /** Average backup size */
  averageBackupSize: number
  /** Largest backup size */
  largestBackupSize: number
  /** Storage space saved through deduplication */
  spacesSavedByDeduplication: number
}
