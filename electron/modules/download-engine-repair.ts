// ============================================================================
// electron/modules/download-engine-repair.ts
// ----------------------------------------------------------------------------
// Repair & Integrity system for Download Engine V3.
// Handles: SHA1 verification, repair by re-downloading corrupted files,
// integrity scanning, disk preallocation, and cache management.
// ============================================================================

import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { execSync } from 'child_process'
import { app } from 'electron'
import { logger } from '../logger'

// ── Types ──────────────────────────────────────────────────────────────────

export interface IntegrityCheckFile {
  path: string
  size: number
  lastModified: number
  sha1?: string
}

export interface IntegrityCheckResult {
  appId: string
  totalFiles: number
  verifiedFiles: number
  corruptedFiles: { path: string; expectedSha1?: string; actualSha1?: string; error: string }[]
  missingFiles: string[]
  sizeOnDisk: number
  totalSizeExpected: number
  passed: boolean
  durationMs: number
}

export interface RepairResult {
  appId: string
  repairedFiles: number
  failedFiles: { path: string; error: string }[]
  bytesDownloaded: number
  durationMs: number
  success: boolean
}

export interface CacheEntry {
  key: string
  size: number
  createdAt: number
  lastAccessed: number
  ttlMs: number
}

// ── Constantes ─────────────────────────────────────────────────────────────

const CACHE_DIR = 'download-cache'
const CACHE_MANIFEST = 'cache-manifest.json'
const DEFAULT_CHUNK_SIZE = 1024 * 1024 // 1MB chunks for streaming verify

// ── CachedFileReader ───────────────────────────────────────────────────────

class CachedFileReader {
  private cache: Map<string, Buffer> = new Map()
  private maxCacheSize: number

  constructor(maxCacheSizeMB: number = 50) {
    this.maxCacheSize = maxCacheSizeMB * 1024 * 1024
  }

  read(filePath: string): Buffer | null {
    if (this.cache.has(filePath)) {
      return this.cache.get(filePath)!
    }
    try {
      if (!fs.existsSync(filePath)) return null
      const data = fs.readFileSync(filePath)
      // Evitar cachear archivos muy grandes
      if (data.length < this.maxCacheSize) {
        this.evictIfNeeded(data.length)
        this.cache.set(filePath, data)
      }
      return data
    } catch {
      return null
    }
  }

  private evictIfNeeded(neededSize: number): void {
    let total = 0
    for (const buf of this.cache.values()) total += buf.length
    if (total + neededSize > this.maxCacheSize) {
      this.cache.clear()
    }
  }

  clear(): void {
    this.cache.clear()
  }
}

// ── Sha1StreamVerifier ─────────────────────────────────────────────────────
// Verifies files in streaming mode without loading entire file into memory.

class Sha1StreamVerifier {
  async verifyFile(
    filePath: string,
    expectedSha1?: string,
    onProgress?: (bytesVerified: number) => void,
  ): Promise<{ match: boolean; actualSha1: string; size: number }> {
    if (!fs.existsSync(filePath)) {
      return { match: false, actualSha1: '', size: 0 }
    }

    const stat = fs.statSync(filePath)
    const size = stat.size
    const hash = crypto.createHash('sha1')
    const fd = fs.openSync(filePath, 'r')
    const buffer = Buffer.alloc(DEFAULT_CHUNK_SIZE)
    let bytesRead = 0

    try {
      let bytesVerified = 0
      while (true) {
        const bytes = fs.readSync(fd, buffer, 0, DEFAULT_CHUNK_SIZE, bytesRead)
        if (bytes === 0) break
        hash.update(buffer.subarray(0, bytes))
        bytesRead += bytes
        bytesVerified += bytes
        onProgress?.(bytesVerified)
      }
    } finally {
      fs.closeSync(fd)
    }

    const actualSha1 = hash.digest('hex')
    const match = expectedSha1 ? actualSha1 === expectedSha1 : true
    return { match, actualSha1, size }
  }
}

// ── IntegrityScanner ──────────────────────────────────────────────────────

export class IntegrityScanner {
  private verifier = new Sha1StreamVerifier()

  /**
   * Scan a game installation directory and verify all files.
   * If manifestSha1s is provided, checks each file against expected SHA1.
   */
  async scan(
    appId: string,
    installDir: string,
    manifestSha1s?: Map<string, string>,
    onProgress?: (current: number, total: number, filePath: string) => void,
  ): Promise<IntegrityCheckResult> {
    const startTime = Date.now()

    if (!fs.existsSync(installDir)) {
      return {
        appId,
        totalFiles: 0,
        verifiedFiles: 0,
        corruptedFiles: [],
        missingFiles: [],
        sizeOnDisk: 0,
        totalSizeExpected: 0,
        passed: false,
        durationMs: Date.now() - startTime,
      }
    }

    const allFiles = this.walkDirectory(installDir)
    const totalFiles = allFiles.length
    let verifiedFiles = 0
    const corruptedFiles: IntegrityCheckResult['corruptedFiles'] = []
    const missingFiles: string[] = []
    let sizeOnDisk = 0

    for (let i = 0; i < allFiles.length; i++) {
      const filePath = allFiles[i]
      const relativePath = path.relative(installDir, filePath)
      onProgress?.(i, totalFiles, relativePath)

      try {
        const expectedSha1 = manifestSha1s?.get(relativePath)
        const result = await this.verifier.verifyFile(filePath, expectedSha1)
        sizeOnDisk += result.size

        if (expectedSha1 && !result.match) {
          corruptedFiles.push({
            path: relativePath,
            expectedSha1,
            actualSha1: result.actualSha1,
            error: 'SHA1 mismatch',
          })
        } else {
          verifiedFiles++
        }
      } catch (err: any) {
        corruptedFiles.push({
          path: relativePath,
          error: err.message,
        })
      }
    }

    // Check for missing files in manifest
    if (manifestSha1s) {
      const allRelativePaths = new Set(allFiles.map((f) => path.relative(installDir, f)))
      for (const [manifestPath] of manifestSha1s) {
        if (!allRelativePaths.has(manifestPath)) {
          missingFiles.push(manifestPath)
        }
      }
    }

    const passed = corruptedFiles.length === 0 && missingFiles.length === 0
    const totalSizeExpected = manifestSha1s
      ? manifestSha1s.size * 1024 * 1024 // rough estimate
      : sizeOnDisk

    return {
      appId,
      totalFiles,
      verifiedFiles,
      corruptedFiles,
      missingFiles,
      sizeOnDisk,
      totalSizeExpected,
      passed,
      durationMs: Date.now() - startTime,
    }
  }

  private walkDirectory(dir: string): string[] {
    const results: string[] = []
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true })
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          // Skip common non-game directories
          if (entry.name.startsWith('.')) continue
          results.push(...this.walkDirectory(fullPath))
        } else if (entry.isFile()) {
          results.push(fullPath)
        }
      }
    } catch {
      // skip inaccessible directories
    }
    return results
  }
}

// ── RepairEngine ──────────────────────────────────────────────────────────

export class RepairEngine {
  /**
   * Attempt to repair corrupted files by replacing them with copies from
   * a backup source or by re-downloading (reported via callback).
   */
  async repair(
    appId: string,
    installDir: string,
    corruptedFiles: IntegrityCheckResult['corruptedFiles'],
    missingFiles: string[],
    downloadCallback?: (relativePath: string) => Promise<boolean>,
  ): Promise<RepairResult> {
    const startTime = Date.now()
    let repairedFiles = 0
    const failedFiles: { path: string; error: string }[] = []
    let bytesDownloaded = 0

    // Repair corrupted files
    for (const file of corruptedFiles) {
      try {
        if (downloadCallback) {
          const ok = await downloadCallback(file.path)
          if (ok) {
            repairedFiles++
            bytesDownloaded += 1024 * 1024 // estimated
          } else {
            failedFiles.push({ path: file.path, error: 'Download callback failed' })
          }
        } else {
          // Without callback, we can only report
          failedFiles.push({ path: file.path, error: 'No download source available' })
        }
      } catch (err: any) {
        failedFiles.push({ path: file.path, error: err.message })
      }
    }

    // Repair missing files
    for (const filePath of missingFiles) {
      try {
        if (downloadCallback) {
          const ok = await downloadCallback(filePath)
          if (ok) {
            repairedFiles++
            bytesDownloaded += 1024 * 1024
          } else {
            failedFiles.push({ path: filePath, error: 'Download callback failed' })
          }
        } else {
          failedFiles.push({ path: filePath, error: 'No download source available' })
        }
      } catch (err: any) {
        failedFiles.push({ path: filePath, error: err.message })
      }
    }

    return {
      appId,
      repairedFiles,
      failedFiles,
      bytesDownloaded,
      durationMs: Date.now() - startTime,
      success: failedFiles.length === 0,
    }
  }
}

// ── DiskPreallocator ──────────────────────────────────────────────────────

export class DiskPreallocator {
  /**
   * Pre-allocate disk space for a download by creating a sparse file.
   * This prevents fragmentation and out-of-space errors during download.
   */
  preallocate(filePath: string, size: number): boolean {
    try {
      const dir = path.dirname(filePath)
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

      // Create sparse file on Windows using SetFileValidData approach
      const fd = fs.openSync(filePath, 'w')
      try {
        // Write 0 at the last position to allocate the space
        const buf = Buffer.alloc(1)
        fs.writeSync(fd, buf, 0, 1, size - 1)
        fs.ftruncateSync(fd, size)
        return true
      } finally {
        fs.closeSync(fd)
      }
    } catch (err: any) {
      logger.warn(
        `[DiskPreallocator] Failed to preallocate ${filePath} (${size} bytes): ${err.message}`,
        'download-engine',
      )
      return false
    }
  }

  /**
   * Check available disk space for a given path.
   */
  getAvailableSpace(dirPath: string): number {
    try {
      // On Node.js 18+ we can use fs.statfs
      if (typeof fs.statfs === 'function') {
        const stats = fs.statfsSync(dirPath)
        return stats.bfree * stats.bsize
      }
    } catch {
      // fallback
    }

    // On Windows, we can use 'dir' command or just assume worst case
    try {
      if (process.platform === 'win32') {
        const output = execSync(
          `dir "${dirPath}" 2>nul`,
          { encoding: 'utf-8', windowsHide: true, timeout: 3000 },
        )
        const match = output.match(/([\d,]+) bytes free/i)
        if (match) {
          return parseInt(match[1].replace(/,/g, ''), 10)
        }
      }
    } catch {
      // ignore
    }
    return -1 // unknown
  }

  /**
   * Ensure there's enough space for a download.
   */
  ensureSpace(dirPath: string, requiredBytes: number): { ok: boolean; available: number; message?: string } {
    const available = this.getAvailableSpace(dirPath)
    if (available < 0) {
      return { ok: true, available: -1 } // Can't check, proceed
    }
    // Leave 1GB buffer
    const buffer = 1024 * 1024 * 1024
    if (available < requiredBytes + buffer) {
      return {
        ok: false,
        available,
        message: `Insufficient disk space: need ${this.formatBytes(requiredBytes + buffer)}, have ${this.formatBytes(available)}`,
      }
    }
    return { ok: true, available }
  }

  private formatBytes(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
    return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`
  }
}

// ── CacheManager ──────────────────────────────────────────────────────────

export class CacheManager {
  private cacheDir: string
  private entries: Map<string, CacheEntry> = new Map()
  private maxSize: number

  constructor(maxSizeMB: number = 500) {
    this.cacheDir = path.join(app.getPath('userData'), CACHE_DIR)
    this.maxSize = maxSizeMB * 1024 * 1024
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true })
    }
    this.loadManifest()
  }

  private get manifestPath(): string {
    return path.join(this.cacheDir, CACHE_MANIFEST)
  }

  private loadManifest(): void {
    try {
      if (fs.existsSync(this.manifestPath)) {
        const data = JSON.parse(fs.readFileSync(this.manifestPath, 'utf-8'))
        for (const entry of data as CacheEntry[]) {
          this.entries.set(entry.key, entry)
        }
      }
    } catch {
      this.entries.clear()
    }
  }

  private saveManifest(): void {
    try {
      fs.writeFileSync(
        this.manifestPath,
        JSON.stringify(Array.from(this.entries.values()), null, 2),
        'utf-8',
      )
    } catch {
      // ignore
    }
  }

  get(key: string): Buffer | null {
    const entry = this.entries.get(key)
    if (!entry) return null

    // Check TTL
    if (Date.now() - entry.createdAt > entry.ttlMs) {
      this.delete(key)
      return null
    }

    entry.lastAccessed = Date.now()
    this.saveManifest()

    const filePath = this.getFilePath(key)
    try {
      if (fs.existsSync(filePath)) {
        return fs.readFileSync(filePath)
      }
    } catch {
      this.delete(key)
    }
    return null
  }

  set(key: string, data: Buffer, ttlMs: number = 24 * 60 * 60 * 1000): void {
    this.evictIfNeeded(data.length)

    const filePath = this.getFilePath(key)
    try {
      fs.writeFileSync(filePath, data)
      this.entries.set(key, {
        key,
        size: data.length,
        createdAt: Date.now(),
        lastAccessed: Date.now(),
        ttlMs,
      })
      this.saveManifest()
    } catch (err: any) {
      logger.warn(`[CacheManager] Failed to cache ${key}: ${err.message}`, 'download-engine')
    }
  }

  private getFilePath(key: string): string {
    const safeKey = crypto.createHash('md5').update(key).digest('hex')
    return path.join(this.cacheDir, safeKey)
  }

  private evictIfNeeded(neededSize: number): void {
    let total = 0
    for (const entry of this.entries.values()) total += entry.size

    if (total + neededSize > this.maxSize) {
      // LRU eviction
      const sorted = Array.from(this.entries.values())
        .sort((a, b) => a.lastAccessed - b.lastAccessed)

      while (total + neededSize > this.maxSize && sorted.length > 0) {
        const entry = sorted.shift()!
        this.delete(entry.key)
        total -= entry.size
      }
    }
  }

  delete(key: string): boolean {
    const entry = this.entries.get(key)
    if (!entry) return false

    const filePath = this.getFilePath(key)
    try {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
    } catch {
      // ignore
    }
    this.entries.delete(key)
    this.saveManifest()
    return true
  }

  clear(): void {
    for (const key of this.entries.keys()) {
      this.delete(key)
    }
    this.entries.clear()
    this.saveManifest()
  }

  getStats(): { entries: number; totalSize: number; maxSize: number } {
    let totalSize = 0
    for (const entry of this.entries.values()) totalSize += entry.size
    return { entries: this.entries.size, totalSize, maxSize: this.maxSize }
  }

  cleanup(): void {
    const now = Date.now()
    for (const [key, entry] of this.entries) {
      if (now - entry.createdAt > entry.ttlMs) {
        this.delete(key)
      }
    }
  }
}

// ── Singletons ────────────────────────────────────────────────────────────

let _integrityScanner: IntegrityScanner | null = null
let _repairEngine: RepairEngine | null = null
let _diskPreallocator: DiskPreallocator | null = null
let _cacheManager: CacheManager | null = null

export function getIntegrityScanner(): IntegrityScanner {
  if (!_integrityScanner) _integrityScanner = new IntegrityScanner()
  return _integrityScanner
}

export function getRepairEngine(): RepairEngine {
  if (!_repairEngine) _repairEngine = new RepairEngine()
  return _repairEngine
}

export function getDiskPreallocator(): DiskPreallocator {
  if (!_diskPreallocator) _diskPreallocator = new DiskPreallocator()
  return _diskPreallocator
}

export function getCacheManager(): CacheManager {
  if (!_cacheManager) _cacheManager = new CacheManager()
  return _cacheManager
}
