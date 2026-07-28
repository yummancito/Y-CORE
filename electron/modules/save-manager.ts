// ============================================================================
// electron/modules/save-manager.ts
// ----------------------------------------------------------------------------
// Save Manager — automatic save file detection, backup, and restore.
// Supports: auto-detection via known save paths, manual path configuration,
// zip compression, backup history with timestamps.
//
// Inspired by: Playnite's save management, Steam Cloud saves.
// ============================================================================

import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import { createReadStream, createWriteStream } from 'fs'
import { pipeline } from 'stream/promises'
import { createGzip, createGunzip } from 'zlib'
import { logger } from '../logger'

// ── Types ──────────────────────────────────────────────────────────────────

export interface SaveEntry {
  path: string
  size: number
  lastModified: number
}

export interface SaveBackup {
  id: string
  appId: string
  name: string
  createdAt: number
  fileCount: number
  totalSize: number
  path: string
}

export interface SaveDetectionResult {
  appId: string
  saves: SaveEntry[]
  totalSize: number
}

// ── Constants ──────────────────────────────────────────────────────────────

const BACKUPS_DIR = 'save-backups'
const MANIFEST_FILE = 'manifest.json'

/** Known save file patterns (Steam game patterns from PCGamingWiki). */
const SAVE_PATTERNS: { base: string; subpath: string }[] = [
  { base: '%USERPROFILE%\\Documents\\My Games', subpath: '' },
  { base: '%USERPROFILE%\\Documents', subpath: '' },
  { base: '%APPDATA%', subpath: '' },
  { base: '%LOCALAPPDATA%', subpath: '' },
  { base: '%USERPROFILE%\\Saved Games', subpath: '' },
  { base: '%PROGRAMDATA%', subpath: '' },
]

/** Known save file extensions. */
const SAVE_EXTENSIONS = new Set([
  '.sav', '.save', '.dat', '.sol', '.json', '.xml', '.srm',
  '.sbs', '.sdf', '.lsd', '.es3', '.rsg', '.cfg', '.savdat',
  '.bak', '.profile', '.steamautocloud.vdf',
])

function expandEnv(str: string): string {
  return str.replace(/%([^%]+)%/g, (_match, key) => process.env[key] || '')
}

function getBackupsDir(): string {
  return path.join(app.getPath('userData'), BACKUPS_DIR)
}

function getGameBackupsDir(appId: string): string {
  return path.join(getBackupsDir(), appId)
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

// ── Save Detection ─────────────────────────────────────────────────────────

/**
 * Detect save files for a given game by scanning known save locations.
 * Filters by common save file extensions and recent file modifications.
 */
export function detectSaves(appId: string, gameName: string): SaveDetectionResult {
  const saves: SaveEntry[] = []
  const searched = new Set<string>()

  for (const pattern of SAVE_PATTERNS) {
    const baseDir = expandEnv(pattern.base)
    if (!fs.existsSync(baseDir) || searched.has(baseDir)) continue
    searched.add(baseDir)

    // Search for game-related folders
    const searchTerms = [appId, gameName]
    let entries: string[] = []
    try { entries = fs.readdirSync(baseDir) } catch { continue }

    for (const entry of entries) {
      const isMatch = searchTerms.some(
        (term) => entry.toLowerCase().includes(term.toLowerCase()),
      )
      if (!isMatch) continue

      const fullPath = path.join(baseDir, entry)
      try {
        scanDirectory(fullPath, saves, 3)
      } catch { /* skip */ }
    }
  }

  const totalSize = saves.reduce((sum, s) => sum + s.size, 0)
  return { appId, saves, totalSize }
}

function scanDirectory(dir: string, results: SaveEntry[], maxDepth: number): void {
  if (maxDepth <= 0) return
  let entries: fs.Dirent[] = []
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      scanDirectory(fullPath, results, maxDepth - 1)
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase()
      if (SAVE_EXTENSIONS.has(ext)) {
        try {
          const stat = fs.statSync(fullPath)
          results.push({ path: fullPath, size: stat.size, lastModified: stat.mtimeMs })
        } catch { /* skip */ }
      }
    }
  }
}

/**
 * Get save detection result for a game, using the game's install directory
 * as an additional search path.
 */
export function detectSavesWithFallback(
  appId: string,
  gameName: string,
  installDir?: string,
): SaveDetectionResult {
  const result = detectSaves(appId, gameName)

  // Also check the install directory for save folders
  if (installDir && fs.existsSync(installDir)) {
    const possibleSaveDirs = ['saves', 'save', 'SaveData', 'Saved', 'Profiles', 'Saves']
    for (const saveDir of possibleSaveDirs) {
      const fullPath = path.join(installDir, saveDir)
      if (fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory()) {
        scanDirectory(fullPath, result.saves, 3)
      }
    }
  }

  // Recalculate total size
  result.totalSize = result.saves.reduce((sum, s) => sum + s.size, 0)
  return result
}

// ── Backup / Restore ───────────────────────────────────────────────────────

/**
 * Create a compressed backup of detected saves.
 * Returns the backup record.
 */
export async function createBackup(
  appId: string,
  saves: SaveEntry[],
  name?: string,
): Promise<SaveBackup> {
  const backupDir = getGameBackupsDir(appId)
  ensureDir(backupDir)

  const timestamp = Date.now()
  const backupId = `${appId}-${timestamp}`
  const backupName = name || `Backup ${new Date(timestamp).toLocaleDateString()}`
  const backupPath = path.join(backupDir, `${backupId}.tar.gz`)

  // Create a tar-like structure (simplified: zip each file individually)
  const manifest: SaveBackup = {
    id: backupId,
    appId,
    name: backupName,
    createdAt: timestamp,
    fileCount: saves.length,
    totalSize: saves.reduce((sum, s) => sum + s.size, 0),
    path: backupPath,
    // The actual backup is stored as a gzip of a JSON manifest + file list
  }

  // Write backup as gzip-compressed JSON with base64 file contents
  await createCompressedBackup(backupPath, saves, manifest)

  // Write readable manifest
  const manifestPath = path.join(backupDir, backupId + '.json')
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8')

  logger.info(`[SaveManager] Created backup for ${appId}: ${saves.length} files (${backupPath})`, 'saves')
  return manifest
}

async function createCompressedBackup(
  archivePath: string,
  saves: SaveEntry[],
  _manifest: SaveBackup,
): Promise<void> {
  const tempPath = archivePath + '.tmp'
  const outStream = createWriteStream(tempPath)
  const gzip = createGzip()

  try {
    const data: Record<string, { content: string; size: number; lastModified: number }> = {}
    for (const save of saves) {
      try {
        const content = fs.readFileSync(save.path)
        data[save.path] = {
          content: content.toString('base64'),
          size: save.size,
          lastModified: save.lastModified,
        }
      } catch { /* skip individual file errors */ }
    }

    // Use a simple JSON+gzip approach
    const json = JSON.stringify(data)
    await pipeline(
      [Buffer.from(json)],
      gzip,
      outStream,
    )
    fs.renameSync(tempPath, archivePath)
  } catch (err: any) {
    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath)
    throw err
  }
}

/**
 * Restore saves from a backup.
 */
export async function restoreBackup(backup: SaveBackup): Promise<{ restored: number; failed: number }> {
  const backupPath = backup.path
  if (!fs.existsSync(backupPath)) {
    throw new Error(`Backup file not found: ${backupPath}`)
  }

  let restored = 0
  let failed = 0

  try {
    const gunzip = createGunzip()
    const readStream = createReadStream(backupPath)
    const chunks: Buffer[] = []

    await pipeline(
      readStream,
      gunzip,
      async function* (source: AsyncIterable<Buffer>) {
        for await (const chunk of source) {
          chunks.push(chunk)
        }
      } as any,
    )

    const data = JSON.parse(Buffer.concat(chunks).toString('utf-8'))
    for (const [filePath, entry] of Object.entries(data) as [string, any][]) {
      try {
        const dir = path.dirname(filePath)
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
        fs.writeFileSync(filePath, Buffer.from(entry.content, 'base64'))
        restored++
      } catch {
        failed++
      }
    }
  } catch (err: any) {
    logger.error(`[SaveManager] Restore failed: ${err.message}`, 'saves')
    throw err
  }

  return { restored, failed }
}

/**
 * List all backups for a game.
 */
export function listBackups(appId: string): SaveBackup[] {
  const backupDir = getGameBackupsDir(appId)
  if (!fs.existsSync(backupDir)) return []

  const backups: SaveBackup[] = []
  try {
    const entries = fs.readdirSync(backupDir)
    for (const entry of entries) {
      if (!entry.endsWith('.json')) continue
      try {
        const data = JSON.parse(fs.readFileSync(path.join(backupDir, entry), 'utf-8'))
        backups.push(data)
      } catch { /* skip corrupt manifests */ }
    }
  } catch { /* ignore */ }

  return backups.sort((a, b) => b.createdAt - a.createdAt)
}

/**
 * Delete a backup.
 */
export function deleteBackup(backup: SaveBackup): boolean {
  try {
    if (fs.existsSync(backup.path)) fs.unlinkSync(backup.path)
    const manifestPath = path.join(getGameBackupsDir(backup.appId), backup.id + '.json')
    if (fs.existsSync(manifestPath)) fs.unlinkSync(manifestPath)
    return true
  } catch (err: any) {
    logger.error(`[SaveManager] Failed to delete backup: ${err.message}`, 'saves')
    return false
  }
}
