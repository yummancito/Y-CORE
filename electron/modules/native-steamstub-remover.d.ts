// ============================================================================
// native-steamstub-remover.d.ts — Type definitions
// ============================================================================

/**
 * SteamStub detection result from PE file analysis
 */
export interface SteamStubDetectionResult {
  /** Whether SteamStub DRM was detected */
  detected: boolean
  /** SteamStub version string (e.g., "3.x") or null */
  version: string | null
  /** Confidence percentage (0-100) */
  confidence: number
  /** Human-readable stub type description */
  stubType: string | null
}

/**
 * Result of SteamStub removal operation
 */
export interface SteamStubRemovalResult {
  /** Whether the operation succeeded */
  success: boolean
  /** Whether the file had DRM before removal */
  hadDrm: boolean
  /** Path to backup file created before modification */
  backupPath: string
  /** Path to cleaned executable */
  outputPath: string
  /** Number of bytes removed from stub */
  bytesRemoved: number
  /** Detailed operation report */
  detailedMessage: string
}

/**
 * File checksum information
 */
export interface FileChecksum {
  /** SHA256 hash as hex string (64 chars) */
  sha256: string
  /** File size in bytes */
  fileSizeBytes: number
}

/**
 * Detect SteamStub DRM in a PE executable without modifying it.
 *
 * @param exePath - Path to executable to scan (absolute, must exist)
 * @returns Detection result with confidence level
 * @throws SteamStubNativeError if operation fails
 */
export function detectSteamStub(exePath: string): Promise<SteamStubDetectionResult>

/**
 * Remove SteamStub DRM from a PE executable.
 *
 * Process:
 *   1. Validates PE file
 *   2. Detects SteamStub DRM
 *   3. Creates automatic backup
 *   4. Unpacks stub and restores original entry point
 *   5. Verifies result with SHA256 checksum
 *   6. Writes cleaned executable atomically
 *
 * @param exePath - Path to executable to clean (absolute, must exist)
 * @param options.backupPath - Path to save backup (default: {exePath}.backup)
 * @param options.outputPath - Path to write cleaned exe (default: overwrite exePath)
 * @param options.forceClean - If true, process even if no stub detected
 * @returns Removal result with backup location and bytes removed
 * @throws SteamStubNativeError if operation fails
 *
 * @example
 * const result = await removeSteamStub('C:\\Games\\game.exe', {
 *   backupPath: 'C:\\Backups\\game.exe.backup',
 *   outputPath: 'C:\\Games\\game.exe'
 * });
 * console.log(`Cleaned: ${result.outputPath}, backup: ${result.backupPath}`);
 */
export function removeSteamStub(
  exePath: string,
  options?: {
    backupPath?: string
    outputPath?: string
    forceClean?: boolean
  }
): Promise<SteamStubRemovalResult>

/**
 * Restore a file from its backup.
 *
 * @param backupPath - Path to backup file (absolute, must exist)
 * @param outputPath - Path to restore to (optional; defaults to removing .backup ext)
 * @returns Object with path where file was restored
 * @throws SteamStubNativeError if operation fails
 */
export function restoreFromBackup(
  backupPath: string,
  outputPath?: string
): Promise<{ restoredPath: string }>

/**
 * Compute SHA256 checksum of a file.
 *
 * Uses native implementation if available, falls back to Node crypto.
 *
 * @param filePath - Path to file (absolute, must exist)
 * @returns Checksum and file size
 * @throws SteamStubNativeError on I/O failure
 */
export function computeChecksum(filePath: string): Promise<FileChecksum>

/**
 * Verify file integrity against expected checksum.
 *
 * @param filePath - Path to file to verify (absolute, must exist)
 * @param expectedSha256 - Expected SHA256 hex digest (case-insensitive)
 * @returns Object with match boolean
 * @throws Error on I/O failure
 */
export function verifyChecksum(filePath: string, expectedSha256: string): Promise<{ matches: boolean }>

/**
 * Check if a file is a valid PE executable.
 *
 * Quick validation (checks DOS header only).
 *
 * @param filePath - Path to file to check
 * @returns true if file exists and has valid PE DOS header
 */
export function isValidPE(filePath: string): Promise<boolean>

/**
 * Get native module status and metadata.
 *
 * @returns Object with availability and version info
 */
export function getNativeInfo(): {
  available: boolean
  version: string | null
  dllPath: string | null
  failureReason: string | null
}

/**
 * Remove stale native module versions.
 *
 * Deletes old version subdirectories that don't match current app version.
 * Called automatically during app startup in production builds.
 *
 * @param appVersion - Current app version (e.g., "3.0.0")
 */
export function cleanupStaleNativeVersions(appVersion: string): void

/**
 * Error thrown by native module operations.
 */
export class SteamStubNativeError extends Error {
  /** Status code from native module */
  readonly code: number
  /** Technical error details (for logs) */
  readonly technical: string
  /** Operation that failed (for user messaging) */
  readonly operation: string
}
