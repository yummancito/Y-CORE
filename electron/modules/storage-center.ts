// ============================================================================
// electron/modules/storage-center.ts
// ----------------------------------------------------------------------------
// Storage Center — library detection, disk space queries, game relocation,
// storage analysis, and cleaning utilities.
// ============================================================================

import fs from 'fs'
import path from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { app } from 'electron'
import { logger } from '../logger'

const execFileAsync = promisify(execFile)

// ── Types ──────────────────────────────────────────────────────────────────

export interface LibraryEntry {
  /** Absolute path to the library folder */
  path: string
  /** Display name (folder basename) */
  name: string
  /** Total capacity in bytes */
  totalBytes: number
  /** Free space in bytes */
  freeBytes: number
  /** Used bytes by Y-core games */
  usedByGames: number
  /** Number of installed games in this library */
  gameCount: number
  /** File system type (NTFS, ext4, etc.) */
  fsType: string
  /** Whether this is the default library */
  isDefault: boolean
}

export interface StorageAnalysis {
  /** Per-library stats */
  libraries: LibraryEntry[]
  /** Total bytes across all libraries */
  totalBytes: number
  /** Total free bytes across all libraries */
  totalFreeBytes: number
  /** Total used by games */
  totalUsedByGames: number
  /** Grand total installed games */
  totalGames: number
  /** Largest files (top 20 by size) across all game folders */
  largestFiles: { path: string; size: number; gameName: string }[]
  /** File type distribution */
  fileTypes: Record<string, { count: number; totalSize: number }>
  /** Games with largest disk footprint (top 10) */
  largestGames: { appId: string; name: string; sizeOnDisk: number }[]
}

export interface MoveGameResult {
  success: boolean
  error?: string
  /** Bytes actually moved */
  bytesMoved?: number
  /** New install dir */
  newInstallDir?: string
  /** Duration in ms */
  durationMs?: number
}

// ── Default library path ───────────────────────────────────────────────────

function getDefaultLibraryPath(): string {
  return path.join(app.getPath('userData'), 'Library')
}

// ── Helpers ────────────────────────────────────────────────────────────────

function getDriveInfo(dirPath: string): { totalBytes: number; freeBytes: number; fsType: string } {
  try {
    // On Windows use `fs.statfs` (Node 18+) or fallback to `dir`
    if (process.platform === 'win32') {
      try {
        // Use `fs.statfs` — available on Node 18+
        const s = fs.statfsSync(dirPath)
        return {
          totalBytes: Number(s.blocks) * Number(s.bsize),
          freeBytes: Number(s.bfree) * Number(s.bsize),
          fsType: 'NTFS',
        }
      } catch {
        // Fallback: use `dir` to get free space
        const result = execFileSync('cmd', ['/c', 'dir', dirPath], { timeout: 5000 })
        const match = result.stdout?.toString().match(/(\d[\d,]*)\s+bytes\s+free/i)
        if (match) {
          const freeBytes = parseInt(match[1].replace(/,/g, ''), 10)
          return { totalBytes: 0, freeBytes: isNaN(freeBytes) ? 0 : freeBytes, fsType: 'NTFS' }
        }
        return { totalBytes: 0, freeBytes: 0, fsType: 'NTFS' }
      }
    } else {
      // Linux/macOS: statfs
      const s = fs.statfsSync(dirPath)
      return {
        totalBytes: Number(s.blocks) * Number(s.bsize),
        freeBytes: Number(s.bfree) * Number(s.bsize),
        fsType: s.type === 0xef53 ? 'ext4' : s.type === 0x01021994 ? 'apfs' : 'unknown',
      }
    }
  } catch {
    return { totalBytes: 0, freeBytes: 0, fsType: 'unknown' }
  }
}

function execFileSync(cmd: string, args: string[], opts: { timeout: number }): { stdout?: Buffer } {
  try {
    // Use child_process.execSync as fallback
    const { execSync } = require('child_process')
    const stdout = execSync(`"${cmd}" ${args.join(' ')}`, { timeout: opts.timeout, encoding: 'buffer' })
    return { stdout }
  } catch {
    return {}
  }
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`
}

function getDirSizeSync(dirPath: string, maxDepth = 4): number {
  let total = 0
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name)
      try {
        if (entry.isDirectory() || entry.isSymbolicLink()) {
          if (maxDepth > 0) total += getDirSizeSync(fullPath, maxDepth - 1)
        } else if (entry.isFile()) {
          const stat = fs.statSync(fullPath, { throwIfNoEntry: false })
          if (stat) total += stat.size
        }
      } catch { /* skip */ }
    }
  } catch { /* skip */ }
  return total
}

function scanDirRecursive(
  dirPath: string,
  maxDepth = 3,
  files: { path: string; size: number }[] = [],
  gameName = '',
): void {
  if (maxDepth <= 0) return
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name)
      try {
        if (entry.isFile()) {
          const stat = fs.statSync(fullPath, { throwIfNoEntry: false })
          if (stat) files.push({ path: fullPath, size: stat.size })
        } else if (entry.isDirectory()) {
          scanDirRecursive(fullPath, maxDepth - 1, files, gameName || entry.name)
        }
      } catch { /* skip */ }
    }
  } catch { /* skip */ }
}

// ── Library Scanning ───────────────────────────────────────────────────────

export interface ScanLibrariesOptions {
  /** Additional library paths to scan (besides default) */
  extraPaths?: string[]
  /** Games list (appId + installDir + name + sizeOnDisk) */
  games?: { appId: string; name: string; installDir: string; sizeOnDisk: number }[]
}

/**
 * Scan all game library folders and return a storage analysis.
 */
export function scanLibraries(opts: ScanLibrariesOptions = {}): StorageAnalysis {
  const defaultLib = getDefaultLibraryPath()
  const allPaths = [defaultLib, ...(opts.extraPaths ?? [])]
  const uniquePaths = [...new Set(allPaths.map((p) => path.resolve(p)))]

  const result: StorageAnalysis = {
    libraries: [],
    totalBytes: 0,
    totalFreeBytes: 0,
    totalUsedByGames: 0,
    totalGames: 0,
    largestFiles: [],
    fileTypes: {},
    largestGames: [],
  }

  for (const libPath of uniquePaths) {
    if (!fs.existsSync(libPath)) continue

    const info = getDriveInfo(libPath)
    const gamesInLib = (opts.games ?? []).filter((g) => {
      const resolved = path.resolve(g.installDir)
      return resolved.startsWith(libPath + path.sep) || resolved === libPath
    })

    // Calculate used by games
    let usedByGames = 0
    const gameSizes: { appId: string; name: string; sizeOnDisk: number }[] = []
    for (const game of gamesInLib) {
      usedByGames += game.sizeOnDisk
      gameSizes.push({ appId: game.appId, name: game.name, sizeOnDisk: game.sizeOnDisk })
    }

    // If no games registered, estimate from folder sizes
    if (gamesInLib.length === 0) {
      try {
        const entries = fs.readdirSync(libPath, { withFileTypes: true })
        for (const entry of entries) {
          if (entry.isDirectory()) {
            usedByGames += getDirSizeSync(path.join(libPath, entry.name), 3)
          }
        }
      } catch { /* skip */ }
    }

    result.libraries.push({
      path: libPath,
      name: path.basename(libPath),
      totalBytes: info.totalBytes,
      freeBytes: info.freeBytes,
      usedByGames,
      gameCount: gamesInLib.length,
      fsType: info.fsType,
      isDefault: libPath === defaultLib,
    })

    result.totalBytes += info.totalBytes
    result.totalFreeBytes += info.freeBytes
    result.totalUsedByGames += usedByGames
    result.totalGames += gamesInLib.length
    result.largestGames = [...result.largestGames, ...gameSizes]
  }

  // Sort largest games descending
  result.largestGames.sort((a, b) => b.sizeOnDisk - a.sizeOnDisk)
  result.largestGames = result.largestGames.slice(0, 10)

  // Scan for largest files (limit to first 3 library folders, depth 3)
  for (const lib of result.libraries.slice(0, 3)) {
    const libFiles: { path: string; size: number }[] = []
    scanDirRecursive(lib.path, 3, libFiles, '')
    for (const f of libFiles) {
      const ext = path.extname(f.path).toLowerCase() || '(no ext)'
      if (!result.fileTypes[ext]) result.fileTypes[ext] = { count: 0, totalSize: 0 }
      result.fileTypes[ext].count++
      result.fileTypes[ext].totalSize += f.size
    }
    result.largestFiles.push(
      ...libFiles.map((f) => ({
        path: f.path,
        size: f.size,
        gameName: path.basename(path.dirname(f.path)),
      })),
    )
  }
  result.largestFiles.sort((a, b) => b.size - a.size)
  result.largestFiles = result.largestFiles.slice(0, 20)

  return result
}

// ── Disk Space ─────────────────────────────────────────────────────────────

export interface CheckDiskSpaceResult {
  success: boolean
  path: string
  totalBytes: number
  freeBytes: number
  usedBytes: number
  freeFormatted: string
  totalFormatted: string
  usedPercent: number
  enoughFor: string[]
  error?: string
}

/**
 * Check disk space for a given directory.
 */
export function checkDiskSpace(targetPath?: string): CheckDiskSpaceResult {
  const dir = targetPath ? path.resolve(targetPath) : getDefaultLibraryPath()

  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true })
    } catch (err: any) {
      return {
        success: false,
        path: dir,
        totalBytes: 0,
        freeBytes: 0,
        usedBytes: 0,
        freeFormatted: '0 B',
        totalFormatted: '0 B',
        usedPercent: 0,
        enoughFor: [],
        error: `Cannot access path: ${err.message}`,
      }
    }
  }

  const info = getDriveInfo(dir)

  // Calculate used bytes from game folders
  let usedBytes = 0
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isDirectory()) {
        usedBytes += getDirSizeSync(path.join(dir, entry.name), 2)
      }
    }
  } catch { /* skip */ }

  const free = info.freeBytes
  const enoughFor: string[] = []
  const thresholds: [number, string][] = [
    [50 * 1024 ** 3, '50 GB game'],
    [20 * 1024 ** 3, '20 GB game'],
    [10 * 1024 ** 3, '10 GB game'],
    [5 * 1024 ** 3, '5 GB game'],
  ]
  for (const [size, label] of thresholds) {
    if (free >= size) enoughFor.push(label)
  }

  return {
    success: true,
    path: dir,
    totalBytes: info.totalBytes,
    freeBytes: info.freeBytes,
    usedBytes,
    freeFormatted: formatBytes(info.freeBytes),
    totalFormatted: formatBytes(info.totalBytes),
    usedPercent: info.totalBytes > 0 ? Math.round(((info.totalBytes - info.freeBytes) / info.totalBytes) * 100) : 0,
    enoughFor,
  }
}

// ── Move Game ──────────────────────────────────────────────────────────────

/**
 * Move a game from one library folder to another.
 * Uses copy-then-delete to avoid issues with running processes.
 */
export async function moveGame(
  appId: string,
  sourceDir: string,
  targetLibPath: string,
  onProgress?: (percent: number, phase: string) => void,
): Promise<MoveGameResult> {
  const startTime = Date.now()
  const source = path.resolve(sourceDir)

  if (!fs.existsSync(source)) {
    return { success: false, error: `Source directory not found: ${source}`, durationMs: Date.now() - startTime }
  }

  const target = path.resolve(targetLibPath, path.basename(sourceDir))

  if (fs.existsSync(target)) {
    return { success: false, error: `Target directory already exists: ${target}`, durationMs: Date.now() - startTime }
  }

  // Ensure target library exists
  if (!fs.existsSync(targetLibPath)) {
    try {
      fs.mkdirSync(targetLibPath, { recursive: true })
    } catch (err: any) {
      return { success: false, error: `Cannot create target library: ${err.message}`, durationMs: Date.now() - startTime }
    }
  }

  // Check space availability at target
  const spaceInfo = getDriveInfo(targetLibPath)
  const sourceSize = getDirSizeSync(source, 4)
  if (spaceInfo.freeBytes < sourceSize) {
    return {
      success: false,
      error: `Insufficient space at target. Need ${formatBytes(sourceSize)}, have ${formatBytes(spaceInfo.freeBytes)}.`,
      durationMs: Date.now() - startTime,
    }
  }

  onProgress?.(0, 'Copying files...')

  let bytesCopied = 0
  try {
    await copyDirRecursive(source, target, (chunkSize: number) => {
      bytesCopied += chunkSize
      if (sourceSize > 0) {
        const pct = Math.min(100, Math.round((bytesCopied / sourceSize) * 100))
        onProgress?.(pct, 'Copying files...')
      }
    })
  } catch (err: any) {
    // Clean up partial copy
    try { fs.rmSync(target, { recursive: true, force: true }) } catch { /* ok */ }
    return { success: false, error: `Copy failed: ${err.message}`, durationMs: Date.now() - startTime }
  }

  onProgress?.(90, 'Verifying...')

  // Verify: check that target has roughly the right size
  const targetSize = getDirSizeSync(target, 4)
  // Allow 1% tolerance
  if (targetSize < sourceSize * 0.99) {
    try { fs.rmSync(target, { recursive: true, force: true }) } catch { /* ok */ }
    return {
      success: false,
      error: `Verification failed: copied size (${formatBytes(targetSize)}) doesn't match source (${formatBytes(sourceSize)}).`,
      durationMs: Date.now() - startTime,
    }
  }

  onProgress?.(95, 'Removing source...')

  // Remove source
  try {
    fs.rmSync(source, { recursive: true, force: true })
  } catch (err: any) {
    // If source can't be removed, warn but don't fail the move
    logger.warn(`[Storage] Source cleanup failed for ${appId}: ${err.message}`, 'storage')
  }

  onProgress?.(100, 'Done')

  return {
    success: true,
    bytesMoved: sourceSize,
    newInstallDir: target,
    durationMs: Date.now() - startTime,
  }
}

async function copyDirRecursive(
  src: string,
  dest: string,
  onChunk: (bytes: number) => void,
): Promise<void> {
  await fs.promises.mkdir(dest, { recursive: true })
  const entries = await fs.promises.readdir(src, { withFileTypes: true })

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name)
    const destPath = path.join(dest, entry.name)

    if (entry.isDirectory() || entry.isSymbolicLink()) {
      await copyDirRecursive(srcPath, destPath, onChunk)
    } else if (entry.isFile()) {
      const stat = await fs.promises.stat(srcPath)
      await fs.promises.copyFile(srcPath, destPath)
      onChunk(stat.size)
    }
  }
}

// ── Cleanup / Cache ────────────────────────────────────────────────────────

export interface CleanupResult {
  success: boolean
  /** Total bytes freed */
  bytesFreed: number
  /** Items removed */
  itemsRemoved: string[]
  errors: string[]
}

/**
 * Clean up common temporary / cache files from game folders.
 */
export function cleanGameFolders(libraryPaths: string[]): CleanupResult {
  const result: CleanupResult = { success: true, bytesFreed: 0, itemsRemoved: [], errors: [] }
  const patterns = ['depotcache', '.cache', 'crash.dmp', '__tmp']

  for (const libPath of libraryPaths) {
    if (!fs.existsSync(libPath)) continue
    try {
      const entries = fs.readdirSync(libPath, { withFileTypes: true })
      for (const entry of entries) {
        if (!entry.isDirectory()) continue
        const gameDir = path.join(libPath, entry.name)
        for (const pattern of patterns) {
          const targetPath = path.join(gameDir, pattern)
          if (fs.existsSync(targetPath)) {
            try {
              const size = getDirSizeSync(targetPath, 3)
              fs.rmSync(targetPath, { recursive: true, force: true })
              result.bytesFreed += size
              result.itemsRemoved.push(targetPath)
            } catch (err: any) {
              result.errors.push(`Cannot remove ${targetPath}: ${err.message}`)
            }
          }
        }
      }
    } catch { /* skip */ }
  }

  return result
}

// ── Diagnostics ────────────────────────────────────────────────────────────

export interface StorageDiagnostics {
  libraryCount: number
  defaultLibrary: string
  totalGames: number
  totalSizeFormatted: string
  freeSizeFormatted: string
  diskHealth: 'healthy' | 'warning' | 'critical'
  warnings: string[]
}

/**
 * Quick diagnostic check of storage health.
 */
export function getStorageDiagnostics(games?: { installDir: string; sizeOnDisk: number }[]): StorageDiagnostics {
  const defaultLib = getDefaultLibraryPath()
  const warnings: string[] = []
  let diskHealth: 'healthy' | 'warning' | 'critical' = 'healthy'

  if (!fs.existsSync(defaultLib)) {
    warnings.push('Default library folder does not exist')
    diskHealth = 'warning'
  }

  const space = checkDiskSpace(defaultLib)
  const freeGB = space.freeBytes / (1024 ** 3)
  if (freeGB < 1) {
    warnings.push(`Critically low disk space: ${space.freeFormatted} remaining`)
    diskHealth = 'critical'
  } else if (freeGB < 5) {
    warnings.push(`Low disk space: ${space.freeFormatted} remaining`)
    diskHealth = 'warning'
  }

  return {
    libraryCount: 1,
    defaultLibrary: defaultLib,
    totalGames: games?.length ?? 0,
    totalSizeFormatted: formatBytes(games?.reduce((s, g) => s + g.sizeOnDisk, 0) ?? 0),
    freeSizeFormatted: space.freeFormatted,
    diskHealth,
    warnings,
  }
}
