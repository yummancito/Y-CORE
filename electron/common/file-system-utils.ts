/**
 * File System Utilities
 * Handles complex file system operations with edge case handling
 * Fixes for issues #8-15, #41-46
 */

import fs from 'fs'
import path from 'path'
import { logger } from '../logger'

// ============================================================================
// Constants
// ============================================================================

const MAX_PATH_LENGTH = 260
const MAX_RECURSION_DEPTH = 50
const MAX_FILES_TO_BACKUP = 100000

// ============================================================================
// File Listing with Circular Symlink Detection
// ============================================================================

/**
 * Issue #12: Symlinks and Circular Symlinks
 * Safely walk directory tree with protection against circular references
 */
export function getAllFilesWithCircularCheck(
  dirPath: string,
  maxDepth: number = MAX_RECURSION_DEPTH
): { files: string[]; hasCircular: boolean; symlinksSkipped: number } {
  const files: string[] = []
  let symlinksSkipped = 0
  let hasCircular = false

  if (!fs.existsSync(dirPath)) {
    return { files, hasCircular, symlinksSkipped }
  }

  const visited = new Set<string>()

  const walk = (dir: string, depth: number): void => {
    if (depth <= 0) {
      logger.warn(`Max directory depth reached at: ${dir}`)
      return
    }

    let realPath: string
    try {
      realPath = fs.realpathSync(dir)
    } catch (err) {
      logger.warn(`Failed to resolve real path of ${dir}: ${err instanceof Error ? err.message : 'unknown'}`)
      return
    }

    if (visited.has(realPath)) {
      logger.warn(`Circular symlink detected: ${dir}`)
      hasCircular = true
      return
    }

    visited.add(realPath)

    let entries: string[]
    try {
      entries = fs.readdirSync(dir)
    } catch (err) {
      logger.warn(`Failed to read directory ${dir}: ${err instanceof Error ? err.message : 'unknown'}`)
      return
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry)

      let stat: fs.Stats
      try {
        // Use lstatSync to NOT follow symlinks
        stat = fs.lstatSync(fullPath)
      } catch (err) {
        logger.warn(`Failed to stat ${fullPath}: ${err instanceof Error ? err.message : 'unknown'}`)
        continue
      }

      if (stat.isSymbolicLink()) {
        logger.debug(`Skipping symlink: ${fullPath}`)
        symlinksSkipped++
        continue
      }

      if (stat.isDirectory()) {
        walk(fullPath, depth - 1)
      } else if (stat.isFile()) {
        files.push(fullPath)
      }
    }
  }

  walk(dirPath, maxDepth)
  return { files, hasCircular, symlinksSkipped }
}

/**
 * Issue #45: Backup with 1,000,000+ Files
 * Safely list files with count limit
 */
export function getAllFilesWithLimit(
  dirPath: string,
  maxFiles: number = MAX_FILES_TO_BACKUP,
  maxDepth: number = MAX_RECURSION_DEPTH
): { files: string[]; truncated: boolean; totalCount: number } {
  const files: string[] = []
  let totalCount = 0

  if (!fs.existsSync(dirPath)) {
    return { files, truncated: false, totalCount: 0 }
  }

  const visited = new Set<string>()

  const walk = (dir: string, depth: number): boolean => {
    if (depth <= 0 || totalCount >= maxFiles) {
      return false
    }

    let realPath: string
    try {
      realPath = fs.realpathSync(dir)
    } catch (err) {
      return false
    }

    if (visited.has(realPath)) {
      return false
    }

    visited.add(realPath)

    let entries: string[]
    try {
      entries = fs.readdirSync(dir)
    } catch (err) {
      return false
    }

    for (const entry of entries) {
      if (totalCount >= maxFiles) {
        return true // Truncated
      }

      const fullPath = path.join(dir, entry)

      let stat: fs.Stats
      try {
        stat = fs.lstatSync(fullPath)
      } catch (err) {
        continue
      }

      if (stat.isSymbolicLink()) {
        continue
      }

      if (stat.isDirectory()) {
        if (walk(fullPath, depth - 1)) {
          return true
        }
      } else if (stat.isFile()) {
        files.push(fullPath)
        totalCount++
      }
    }

    return false
  }

  const truncated = walk(dirPath, maxDepth)
  return { files, truncated, totalCount }
}

// ============================================================================
// Directory Size Calculation
// ============================================================================

/**
 * Calculate directory size with safety checks
 */
export function calculateDirSizeWithChecks(
  dirPath: string,
  maxDepth: number = MAX_RECURSION_DEPTH
): { size: number; hasCircular: boolean } {
  let size = 0
  let hasCircular = false

  if (!fs.existsSync(dirPath)) {
    return { size: 0, hasCircular: false }
  }

  const visited = new Set<string>()

  const walk = (dir: string, depth: number): void => {
    if (depth <= 0) return

    let realPath: string
    try {
      realPath = fs.realpathSync(dir)
    } catch (err) {
      return
    }

    if (visited.has(realPath)) {
      hasCircular = true
      return
    }

    visited.add(realPath)

    let entries: string[]
    try {
      entries = fs.readdirSync(dir)
    } catch (err) {
      return
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry)

      let stat: fs.Stats
      try {
        stat = fs.lstatSync(fullPath)
      } catch (err) {
        continue
      }

      if (stat.isSymbolicLink()) {
        continue
      }

      if (stat.isDirectory()) {
        walk(fullPath, depth - 1)
      } else if (stat.isFile()) {
        size += stat.size
      }
    }
  }

  walk(dirPath, maxDepth)
  return { size, hasCircular }
}

// ============================================================================
// Path Validation & Normalization
// ============================================================================

/**
 * Issue #9: Unicode path handling with proper normalization
 */
export function normalizePathWithUnicode(filePath: string): string {
  // Normalize to NFC canonical form
  return path.normalize(filePath).normalize('NFC')
}

/**
 * Issue #10: Validate path doesn't exceed Windows MAX_PATH
 */
export function validatePathLength(filePath: string, maxLength: number = MAX_PATH_LENGTH): boolean {
  return filePath.length <= maxLength
}

/**
 * Ensure parent directory exists and is writable
 */
export function ensureParentDir(filePath: string): { success: boolean; error?: string } {
  try {
    const dir = path.dirname(filePath)

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    // Test write permission
    const testFile = path.join(dir, `.test-${Date.now()}`)
    fs.writeFileSync(testFile, '')
    fs.unlinkSync(testFile)

    return { success: true }
  } catch (err) {
    return {
      success: false,
      error: `Failed to ensure parent directory: ${err instanceof Error ? err.message : 'unknown'}`,
    }
  }
}

// ============================================================================
// Backup File Validation
// ============================================================================

/**
 * Issue #44: Backup with 0 Files
 */
export function validateDirectoryHasFiles(dirPath: string): { valid: boolean; fileCount: number; error?: string } {
  try {
    if (!fs.existsSync(dirPath)) {
      return { valid: false, fileCount: 0, error: 'Directory does not exist' }
    }

    const { files } = getAllFilesWithCircularCheck(dirPath)

    if (files.length === 0) {
      return { valid: false, fileCount: 0, error: 'Directory contains no files' }
    }

    return { valid: true, fileCount: files.length }
  } catch (err) {
    return { valid: false, fileCount: 0, error: `Failed to validate directory: ${err instanceof Error ? err.message : 'unknown'}` }
  }
}

/**
 * Issue #45: Check if directory has too many files
 */
export function validateFileCount(
  dirPath: string,
  maxFiles: number = MAX_FILES_TO_BACKUP
): { valid: boolean; fileCount: number; error?: string } {
  try {
    const { files, truncated } = getAllFilesWithLimit(dirPath, maxFiles)

    if (truncated) {
      return {
        valid: false,
        fileCount: files.length,
        error: `Directory has too many files (>${maxFiles}). Max supported: ${maxFiles}`,
      }
    }

    return { valid: true, fileCount: files.length }
  } catch (err) {
    return { valid: false, fileCount: 0, error: `Failed to count files: ${err instanceof Error ? err.message : 'unknown'}` }
  }
}

/**
 * Issue #46: Verify ZIP file integrity
 */
export function verifyZipIntegrity(zipPath: string): { valid: boolean; error?: string } {
  try {
    if (!fs.existsSync(zipPath)) {
      return { valid: false, error: 'Backup file not found' }
    }

    // Check file is not empty
    const stat = fs.statSync(zipPath)
    if (stat.size === 0) {
      return { valid: false, error: 'Backup file is empty' }
    }

    // Try to read ZIP header
    const buffer = Buffer.alloc(4)
    const fd = fs.openSync(zipPath, 'r')
    fs.readSync(fd, buffer, 0, 4, 0)
    fs.closeSync(fd)

    // ZIP files start with 0x504b0304 (PK..)
    if (buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
      return { valid: false, error: 'Backup file is not a valid ZIP' }
    }

    return { valid: true }
  } catch (err) {
    return { valid: false, error: `Failed to verify backup: ${err instanceof Error ? err.message : 'unknown'}` }
  }
}

// ============================================================================
// Restore Backup Validation
// ============================================================================

/**
 * Issue #41: Verify backup file exists before restoration
 * Issue #42: Verify backup is for correct mod
 */
export function validateBackupRestore(
  backupPath: string,
  expectedModId: string,
  backupModId: string
): { valid: boolean; error?: string } {
  // Check file exists
  if (!fs.existsSync(backupPath)) {
    return { valid: false, error: `Backup file not found: ${backupPath}` }
  }

  // Check mod ID matches
  if (backupModId !== expectedModId) {
    return {
      valid: false,
      error: `Backup mismatch: attempting to restore ${backupModId} to ${expectedModId}`,
    }
  }

  // Check backup integrity
  const integrity = verifyZipIntegrity(backupPath)
  if (!integrity.valid) {
    return { valid: false, error: integrity.error }
  }

  return { valid: true }
}

/**
 * Issue #43: Check disk space before restore
 */
export function checkDiskSpaceForRestore(targetDir: string, backupSizeBytes: number): {
  valid: boolean
  available?: number
  error?: string
} {
  try {
    // Ensure directory exists first
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true })
    }

    const stat = fs.statfsSync(targetDir)
    const available = stat.bavail * stat.bsize

    // We need at least 1.2x the backup size for safety margin
    const requiredSpace = Math.ceil(backupSizeBytes * 1.2)

    if (available < requiredSpace) {
      return {
        valid: false,
        available,
        error: `Insufficient disk space. Required: ${formatBytes(requiredSpace)}, Available: ${formatBytes(available)}`,
      }
    }

    return { valid: true, available }
  } catch (err) {
    return { valid: false, error: `Failed to check disk space: ${err instanceof Error ? err.message : 'unknown'}` }
  }
}

// ============================================================================
// Cleanup Utilities
// ============================================================================

/**
 * Safe directory removal with error handling
 */
export function safeRemoveDir(dirPath: string): { success: boolean; error?: string } {
  try {
    if (!fs.existsSync(dirPath)) {
      return { success: true }
    }

    fs.rmSync(dirPath, { recursive: true, force: true })
    return { success: true }
  } catch (err) {
    return { success: false, error: `Failed to remove directory: ${err instanceof Error ? err.message : 'unknown'}` }
  }
}

/**
 * Safe file removal with error handling
 */
export function safeRemoveFile(filePath: string): { success: boolean; error?: string } {
  try {
    if (!fs.existsSync(filePath)) {
      return { success: true }
    }

    fs.unlinkSync(filePath)
    return { success: true }
  } catch (err) {
    return { success: false, error: `Failed to remove file: ${err instanceof Error ? err.message : 'unknown'}` }
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i]
}
