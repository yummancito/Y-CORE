/**
 * Mods Database Service
 * SQLite database for mod metadata, backup info, and installation tracking
 * Features: Schema migrations, query builders, transaction support
 */

import sqlite3 from 'sqlite3'
import path from 'path'
import fs from 'fs'
import { app } from 'electron'
import { logger } from '../logger'
import {
  MalwareScanStatus,
  type ModInfo,
  type ModStatus,
  type BackupInfo,
  type InstalledModRecord,
  type BackupRecord,
  type ModQueryResult,
  type ModStatistics,
  type ModSourceType,
} from '../common/mod-types'

// ============================================================================
// Database Manager
// ============================================================================

class ModsDatabaseService {
  [key: string]: any
  private db: sqlite3.Database | null = null
  private dbPath: string
  private initialized = false

  constructor() {
    this.dbPath = path.join(app.getPath('userData'), 'mods-database.db')
  }

  /**
   * Initialize database and run migrations
   * FIX #1, #6: Preemptive lock detection and recovery
   * FIX #11: Detect and recover zombie installations
   */
  async initialize(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.initialized) {
        resolve()
        return
      }

      // FIX #6: Test database accessibility BEFORE opening
      if (fs.existsSync(this.dbPath)) {
        try {
          const handle = fs.openSync(this.dbPath, 'r')
          fs.closeSync(handle)
        } catch (err) {
          return reject(new Error(`Database file locked or inaccessible: ${(err as Error).message}`))
        }
      }

      this.db = new sqlite3.Database(this.dbPath, (err: Error | null) => {
        if (err) {
          logger.error(`Database connection failed: ${err.message}`, 'mods-db')
          reject(err)
          return
        }

        this.db!.configure('busyTimeout', 10000) // Increased from 5s to 10s
        this.runMigrations()
          .then(async () => {
            // FIX #11: Recover zombie installations on startup
            await this.recoverZombieInstallations()
            this.initialized = true
            logger.info('Mods database initialized', 'mods-db')
            resolve()
          })
          .catch(reject)
      })
    })
  }

  /**
   * Run database migrations
   * FIX #9: Use transaction to ensure all-or-nothing schema creation
   */
  private async runMigrations(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db!.serialize(() => {
        // FIX #9: Wrap migrations in transaction for data consistency
        this.db!.run('BEGIN TRANSACTION', (beginErr: Error | null) => {
          if (beginErr) {
            logger.error(`Failed to begin transaction: ${beginErr.message}`, 'mods-db')
            reject(beginErr)
            return
          }

          // Create installed_mods table
          this.db!.run(
            `CREATE TABLE IF NOT EXISTS installed_mods (
              id TEXT PRIMARY KEY,
              gameAppId TEXT NOT NULL,
              fileId TEXT NOT NULL,
              title TEXT NOT NULL,
              author TEXT NOT NULL,
              description TEXT,
              version TEXT,
              source TEXT NOT NULL DEFAULT 'steam_workshop',
              installPath TEXT NOT NULL,
              fileSize INTEGER,
              fileUrl TEXT,
              previewUrl TEXT,
              tags TEXT,
              dependencies TEXT,
              enabled BOOLEAN DEFAULT 1,
              loadOrder INTEGER DEFAULT 0,
              status TEXT DEFAULT 'installed',
              malwareScanStatus TEXT DEFAULT 'not_scanned',
              installedAt INTEGER NOT NULL,
              lastUpdatedAt INTEGER NOT NULL,
              lastEnabledAt INTEGER,
              checksums TEXT,
              metadata TEXT,
              createdAt INTEGER NOT NULL,
              updatedAt INTEGER NOT NULL,
              UNIQUE(gameAppId, fileId)
            )`,
            (err: Error | null) => {
              if (err) {
                logger.error(`Failed to create installed_mods table: ${err.message}`, 'mods-db')
                this.db!.run('ROLLBACK', () => reject(err))
                return
              }

              // Create backups table
              this.db!.run(
                `CREATE TABLE IF NOT EXISTS backups (
                  id TEXT PRIMARY KEY,
                  modId TEXT NOT NULL,
                  gameAppId TEXT NOT NULL,
                  timestamp INTEGER NOT NULL,
                  status TEXT NOT NULL DEFAULT 'completed',
                  size INTEGER,
                  path TEXT NOT NULL,
                  createdBy TEXT,
                  notes TEXT,
                  fileCount INTEGER,
                  checksumValid BOOLEAN DEFAULT 1,
                  lastVerified INTEGER,
                  expiresAt INTEGER,
                  metadata TEXT,
                  createdAt INTEGER NOT NULL,
                  updatedAt INTEGER NOT NULL,
                  FOREIGN KEY(modId) REFERENCES installed_mods(id) ON DELETE CASCADE
                )`,
                (err: Error | null) => {
                  if (err) {
                    logger.error(`Failed to create backups table: ${err.message}`, 'mods-db')
                    this.db!.run('ROLLBACK', () => reject(err))
                    return
                  }

                  // Create indexes for better query performance
                  let indexErrors = false
                  const createIndexes = () => {
                    this.db!.run('CREATE INDEX IF NOT EXISTS idx_installed_mods_gameAppId ON installed_mods(gameAppId)', (err: Error | null) => {
                      if (err) {
                        logger.warn(`Index creation failed: ${err.message}`, 'mods-db')
                        indexErrors = true
                      }

                      this.db!.run('CREATE INDEX IF NOT EXISTS idx_installed_mods_status ON installed_mods(status)', (err: Error | null) => {
                        if (err) {
                          logger.warn(`Index creation failed: ${err.message}`, 'mods-db')
                          indexErrors = true
                        }

                        this.db!.run('CREATE INDEX IF NOT EXISTS idx_installed_mods_enabled ON installed_mods(enabled)', (err: Error | null) => {
                          if (err) {
                            logger.warn(`Index creation failed: ${err.message}`, 'mods-db')
                            indexErrors = true
                          }

                          this.db!.run('CREATE INDEX IF NOT EXISTS idx_backups_modId ON backups(modId)', (err: Error | null) => {
                            if (err) {
                              logger.warn(`Index creation failed: ${err.message}`, 'mods-db')
                              indexErrors = true
                            }

                            this.db!.run('CREATE INDEX IF NOT EXISTS idx_backups_timestamp ON backups(timestamp)', (err: Error | null) => {
                              if (err) {
                                logger.warn(`Index creation failed: ${err.message}`, 'mods-db')
                                indexErrors = true
                              }

                              // Commit transaction
                              this.db!.run('COMMIT', (commitErr: Error | null) => {
                                if (commitErr) {
                                  logger.error(`Failed to commit transaction: ${commitErr.message}`, 'mods-db')
                                  reject(commitErr)
                                } else if (indexErrors) {
                                  logger.warn('Migration completed with index warnings', 'mods-db')
                                  resolve()
                                } else {
                                  resolve()
                                }
                              })
                            })
                          })
                        })
                      })
                    })
                  }

                  createIndexes()
                }
              )
            }
          )
        })
      })
    })
  }

  /**
   * Add or update installed mod
   */
  async addInstalledMod(modInfo: ModInfo): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const now = Date.now()
      const stmt = this.db!.prepare(`
        INSERT OR REPLACE INTO installed_mods (
          id, gameAppId, fileId, title, author, description, version,
          source, installPath, fileSize, fileUrl, previewUrl, tags,
          dependencies, enabled, loadOrder, status, malwareScanStatus,
          installedAt, lastUpdatedAt, lastEnabledAt, checksums, metadata,
          createdAt, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)

      stmt.run(
        modInfo.id,
        modInfo.gameAppId,
        modInfo.id,
        modInfo.title,
        modInfo.author,
        modInfo.description,
        modInfo.version,
        modInfo.source,
        modInfo.installPath,
        modInfo.fileSize,
        modInfo.fileUrl,
        modInfo.previewUrl,
        JSON.stringify(modInfo.tags),
        JSON.stringify(modInfo.dependencies),
        modInfo.enabled ? 1 : 0,
        modInfo.loadOrder,
        modInfo.status,
        'not_scanned',
        modInfo.installedAt,
        now,
        modInfo.lastEnabledAt || null,
        JSON.stringify({}),
        JSON.stringify(modInfo),
        now,
        now,
        (err: Error | null) => {
          if (err) {
            logger.error(`Failed to add mod: ${err.message}`, 'mods-db')
            reject(err)
            return
          }
          resolve(true)
        }
      )

      stmt.finalize()
    })
  }

  /**
   * Get installed mod by ID
   */
  async getInstalledMod(modId: string): Promise<ModInfo | null> {
    return new Promise((resolve, reject) => {
      this.db!.get(
        'SELECT * FROM installed_mods WHERE id = ?',
        [modId],
        (err, row: any) => {
          if (err) {
            logger.error(`Failed to get mod: ${err.message}`, 'mods-db')
            reject(err)
            return
          }
          resolve(row ? this.rowToModInfo(row) : null)
        }
      )
    })
  }

  /**
   * Get all installed mods for a game
   */
  async getGameMods(gameAppId: string): Promise<ModInfo[]> {
    return new Promise((resolve, reject) => {
      this.db!.all(
        'SELECT * FROM installed_mods WHERE gameAppId = ? ORDER BY loadOrder ASC, installedAt DESC',
        [gameAppId],
        (err, rows: any[]) => {
          if (err) {
            logger.error(`Failed to get game mods: ${err.message}`, 'mods-db')
            reject(err)
            return
          }
          resolve((rows || []).map(row => this.rowToModInfo(row)))
        }
      )
    })
  }

  /**
   * Search installed mods
   */
  async searchMods(query: string, gameAppId?: string): Promise<ModInfo[]> {
    return new Promise((resolve, reject) => {
      let sql = 'SELECT * FROM installed_mods WHERE (title LIKE ? OR author LIKE ? OR description LIKE ?)'
      const params = [`%${query}%`, `%${query}%`, `%${query}%`]

      if (gameAppId) {
        sql += ' AND gameAppId = ?'
        params.push(gameAppId)
      }

      sql += ' ORDER BY installedAt DESC'

      this.db!.all(sql, params, (err, rows: any[]) => {
        if (err) {
          logger.error(`Search failed: ${err.message}`, 'mods-db')
          reject(err)
          return
        }
        resolve((rows || []).map(row => this.rowToModInfo(row)))
      })
    })
  }

  /**
   * Query mods with filters
   */
  async queryMods(
    gameAppId: string,
    filters?: {
      enabled?: boolean
      status?: ModStatus
      source?: ModSourceType
      search?: string
    }
  ): Promise<ModQueryResult> {
    return new Promise((resolve, reject) => {
      let sql = 'SELECT * FROM installed_mods WHERE gameAppId = ?'
      const params: any[] = [gameAppId]

      if (filters?.enabled !== undefined) {
        sql += ' AND enabled = ?'
        params.push(filters.enabled ? 1 : 0)
      }

      if (filters?.status) {
        sql += ' AND status = ?'
        params.push(filters.status)
      }

      if (filters?.source) {
        sql += ' AND source = ?'
        params.push(filters.source)
      }

      if (filters?.search) {
        sql += ' AND (title LIKE ? OR author LIKE ?)'
        params.push(`%${filters.search}%`, `%${filters.search}%`)
      }

      sql += ' ORDER BY loadOrder ASC, installedAt DESC'

      this.db!.all(sql, params, (err, rows: any[]) => {
        if (err) {
          logger.error(`Query failed: ${err.message}`, 'mods-db')
          reject(err)
          return
        }

        const mods = (rows || []).map(row => this.rowToModInfo(row))
        resolve({
          mods,
          total: mods.length,
          hasMore: false,
          offset: 0,
          limit: mods.length,
        })
      })
    })
  }

  /**
   * Update mod status
   */
  async updateModStatus(modId: string, status: ModStatus): Promise<boolean> {
    return new Promise((resolve, reject) => {
      this.db!.run(
        'UPDATE installed_mods SET status = ?, updatedAt = ? WHERE id = ?',
        [status, Date.now(), modId],
        (err: Error | null) => {
          if (err) {
            logger.error(`Failed to update mod status: ${err.message}`, 'mods-db')
            reject(err)
            return
          }
          resolve(true)
        }
      )
    })
  }

  /**
   * Update mod enabled state
   */
  async updateModEnabled(modId: string, enabled: boolean): Promise<boolean> {
    return new Promise((resolve, reject) => {
      this.db!.run(
        'UPDATE installed_mods SET enabled = ?, lastEnabledAt = ?, updatedAt = ? WHERE id = ?',
        [enabled ? 1 : 0, enabled ? Date.now() : null, Date.now(), modId],
        (err: Error | null) => {
          if (err) {
            logger.error(`Failed to update mod enabled state: ${err.message}`, 'mods-db')
            reject(err)
            return
          }
          resolve(true)
        }
      )
    })
  }

  /**
   * Delete installed mod
   * FIX #3: Delete backup files when deleting mod (cascade-safe)
   */
  async deleteInstalledMod(modId: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
      // Step 1: Get all backup IDs for cleanup
      this.db!.all(
        'SELECT id FROM backups WHERE modId = ?',
        [modId],
        (err, backupIds: any[]) => {
          if (err) return reject(err)

          // Step 2: Delete mod record (cascade deletes backups)
          this.db!.run('DELETE FROM installed_mods WHERE id = ?', [modId], (deleteErr: Error | null) => {
            if (deleteErr) return reject(deleteErr)

            // Step 3: Clean up backup files asynchronously
            if (backupIds && backupIds.length > 0) {
              for (const backup of backupIds) {
                this.deleteBackupFiles(backup.id).catch(err =>
                  logger.warn(`Backup file cleanup failed for ${backup.id}: ${err instanceof Error ? err.message : 'unknown'}`)
                )
              }
            }

            resolve(true)
          })
        }
      )
    })
  }

  /**
   * Helper: Delete backup files associated with a backup record
   * FIX #3: Ensure backup files are cleaned when records deleted
   */
  private async deleteBackupFiles(backupId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db!.get('SELECT path FROM backups WHERE id = ?', [backupId], (err, row: any) => {
        if (err) return reject(err)
        if (!row || !row.path) return resolve()

        try {
          if (fs.existsSync(row.path)) {
            fs.rmSync(row.path, { recursive: true, force: true })
            logger.info(`Backup files deleted: ${backupId}`)
          }
          resolve()
        } catch (error) {
          reject(error)
        }
      })
    })
  }

  /**
   * Add backup
   */
  async addBackup(backupInfo: BackupInfo): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const now = Date.now()
      const stmt = this.db!.prepare(`
        INSERT INTO backups (
          id, modId, gameAppId, timestamp, status, size, path,
          createdBy, notes, fileCount, checksumValid, lastVerified,
          expiresAt, metadata, createdAt, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)

      stmt.run(
        backupInfo.id,
        backupInfo.modId,
        backupInfo.gameAppId,
        backupInfo.timestamp,
        backupInfo.status,
        backupInfo.size,
        backupInfo.path,
        backupInfo.createdBy,
        backupInfo.notes || null,
        backupInfo.integrity.fileCount,
        backupInfo.integrity.checksumValid ? 1 : 0,
        backupInfo.integrity.lastVerified || null,
        backupInfo.expiresAt || null,
        JSON.stringify(backupInfo),
        now,
        now,
        (err: Error | null) => {
          if (err) {
            logger.error(`Failed to add backup: ${err.message}`, 'mods-db')
            reject(err)
            return
          }
          resolve(true)
        }
      )

      stmt.finalize()
    })
  }

  /**
   * Get backups for mod
   */
  async getModBackups(modId: string): Promise<BackupInfo[]> {
    return new Promise((resolve, reject) => {
      this.db!.all(
        'SELECT * FROM backups WHERE modId = ? ORDER BY timestamp DESC',
        [modId],
        (err, rows: any[]) => {
          if (err) {
            logger.error(`Failed to get backups: ${err.message}`, 'mods-db')
            reject(err)
            return
          }
          resolve((rows || []).map(row => this.rowToBackupInfo(row)))
        }
      )
    })
  }

  /**
   * Get backup by ID
   */
  async getBackup(backupId: string): Promise<BackupInfo | null> {
    return new Promise((resolve, reject) => {
      this.db!.get(
        'SELECT * FROM backups WHERE id = ?',
        [backupId],
        (err, row: any) => {
          if (err) {
            logger.error(`Failed to get backup: ${err.message}`, 'mods-db')
            reject(err)
            return
          }
          resolve(row ? this.rowToBackupInfo(row) : null)
        }
      )
    })
  }

  /**
   * Delete backup
   */
  async deleteBackup(backupId: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
      this.db!.run('DELETE FROM backups WHERE id = ?', [backupId], (err: Error | null) => {
        if (err) {
          logger.error(`Failed to delete backup: ${err.message}`, 'mods-db')
          reject(err)
          return
        }
        resolve(true)
      })
    })
  }

  /**
   * Get mod statistics
   * FIX #8: Combine queries to eliminate N+1 problem - use subqueries in single query
   */
  async getStatistics(gameAppId: string): Promise<ModStatistics> {
    return new Promise((resolve, reject) => {
      // FIXED: Single query using subqueries instead of N+1 sequential queries
      // This prevents multiple database hits and lock contention
      this.db!.get(
        `SELECT
          (SELECT COUNT(*) FROM installed_mods WHERE gameAppId = ?) as totalMods,
          (SELECT SUM(CASE WHEN enabled = 1 THEN 1 ELSE 0 END) FROM installed_mods WHERE gameAppId = ?) as enabledMods,
          (SELECT SUM(CASE WHEN enabled = 0 THEN 1 ELSE 0 END) FROM installed_mods WHERE gameAppId = ?) as disabledMods,
          (SELECT COUNT(*) FROM backups WHERE gameAppId = ?) as totalBackups,
          (SELECT SUM(size) FROM backups WHERE gameAppId = ?) as backupSize`,
        [gameAppId, gameAppId, gameAppId, gameAppId, gameAppId],
        (err, row: any) => {
          if (err) {
            logger.error(`Failed to get statistics: ${err.message}`, 'mods-db')
            reject(err)
            return
          }

          const stats: ModStatistics = {
            totalMods: row?.totalMods || 0,
            enabledMods: row?.enabledMods || 0,
            disabledMods: row?.disabledMods || 0,
            totalBackups: row?.totalBackups || 0,
            backupSize: row?.backupSize || 0,
            lastScan: 0,
            scanStatus: MalwareScanStatus.NOT_SCANNED,
            conflicts: 0,
          }

          resolve(stats)
        }
      )
    })
  }

  /**
   * Close database connection
   */
  async close(): Promise<void> {
    return new Promise((resolve) => {
      if (this.db) {
        this.db.close((err: Error | null) => {
          if (err) {
            logger.warn(`Error closing database: ${err.message}`, 'mods-db')
          }
          this.db = null
          this.initialized = false
          resolve()
        })
      } else {
        resolve()
      }
    })
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  // FIX #47: Safe JSON parsing with error handling to prevent crashes from corrupted DB
  private parseSafe(jsonStr: string | null, fallback: any = []): any {
    try {
      return jsonStr ? JSON.parse(jsonStr) : fallback
    } catch (err) {
      logger.warn(`Failed to parse JSON: ${jsonStr}, using fallback`, 'mods-db')
      return fallback
    }
  }

  private rowToModInfo(row: any): ModInfo {
    return {
      id: row.id,
      gameAppId: row.gameAppId,
      gameTitle: '', // Would need to join with games table
      title: row.title,
      author: row.author,
      description: row.description || '',
      version: row.version || '',
      status: row.status,
      source: row.source,
      installPath: row.installPath,
      fileSize: row.fileSize || 0,
      fileUrl: row.fileUrl || '',
      previewUrl: row.previewUrl || '',
      // FIX #47: Use safe JSON parsing
      tags: this.parseSafe(row.tags),
      dependencies: this.parseSafe(row.dependencies),
      loadOrder: row.loadOrder || 0,
      enabled: row.enabled === 1,
      installedAt: row.installedAt,
      lastUpdatedAt: row.lastUpdatedAt,
      lastEnabledAt: row.lastEnabledAt,
      compatibleVersions: [],
      requiredDependencies: [],
    }
  }

  private rowToBackupInfo(row: any): BackupInfo {
    return {
      id: row.id,
      modId: row.modId,
      gameAppId: row.gameAppId,
      timestamp: row.timestamp,
      status: row.status,
      size: row.size || 0,
      path: row.path,
      createdBy: row.createdBy || 'manual',
      notes: row.notes,
      integrity: {
        fileCount: row.fileCount || 0,
        checksumValid: row.checksumValid === 1,
        lastVerified: row.lastVerified,
      },
      expiresAt: row.expiresAt,
    }
  }

  /**
   * FIX #11: Recover zombie installations on startup
   * Detects mods stuck in 'installing' or 'uninstalling' status and resets them
   * FIXED: Use Promise.all() for concurrent safety instead of manual counter
   */
  private async recoverZombieInstallations(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db!.all(
        `SELECT id, installPath FROM installed_mods WHERE status = 'installing' OR status = 'uninstalling'`,
        (err, rows: any[]) => {
          if (err) return reject(err)
          if (!rows || rows.length === 0) return resolve()

          // Recover each zombie using Promise.all for concurrent safety
          const recoveryPromises = rows.map(row => {
            return new Promise<void>((resolveUpdate) => {
              // Check if mod files actually exist
              const exists = fs.existsSync(row.installPath)
              const newStatus = exists ? 'installed' : 'unknown'

              this.db!.run(
                'UPDATE installed_mods SET status = ? WHERE id = ?',
                [newStatus, row.id],
                (updateErr: Error | null) => {
                  if (!updateErr) {
                    logger.info(`Recovered zombie installation: ${row.id} -> ${newStatus}`, 'mods-db')
                  } else {
                    logger.error(`Failed to recover zombie ${row.id}: ${updateErr.message}`, 'mods-db')
                  }
                  resolveUpdate()
                }
              )
            })
          })

          Promise.all(recoveryPromises)
            .then(() => resolve())
            .catch(reject)
        }
      )
    })
  }

  /**
   * FIX #13: Update load order atomically with transaction
   */
  async updateLoadOrder(gameAppId: string, modIds: string[]): Promise<boolean> {
    return new Promise((resolve, reject) => {
      this.db!.serialize(() => {
        // Wrap entire reorder in transaction
        this.db!.run('BEGIN TRANSACTION', (beginErr: Error | null) => {
          if (beginErr) return reject(beginErr)

          let completed = 0
          let hasError = false

          for (let i = 0; i < modIds.length; i++) {
            this.db!.run(
              'UPDATE installed_mods SET loadOrder = ?, updatedAt = ? WHERE id = ? AND gameAppId = ?',
              [i, Date.now(), modIds[i], gameAppId],
              (err: Error | null) => {
                if (err && !hasError) {
                  hasError = true
                  this.db!.run('ROLLBACK', () => reject(err))
                  return
                }

                completed++
                if (completed === modIds.length) {
                  // All updates done - commit
                  this.db!.run('COMMIT', (commitErr: Error | null) => {
                    commitErr ? reject(commitErr) : resolve(true)
                  })
                }
              }
            )
          }
        })
      })
    })
  }

  /**
   * Check database integrity - useful for debugging
   */
  async checkDatabaseHealth(): Promise<{ healthy: boolean; errors: string[] }> {
    return new Promise((resolve) => {
      const errors: string[] = []

      // Check foreign key constraints
      this.db!.all('PRAGMA foreign_key_check', (err, rows: any[]) => {
        if (err) {
          errors.push(`Foreign key check error: ${err.message}`)
        } else if (rows && rows.length > 0) {
          errors.push(`Foreign key violations: ${rows.length}`)
        }

        // Check for duplicate loadOrders
        this.db!.all(
          `SELECT loadOrder, COUNT(*) as count FROM installed_mods
           GROUP BY loadOrder HAVING count > 1`,
          (err, rows: any[]) => {
            if (err) {
              errors.push(`Duplicate check error: ${err.message}`)
            } else if (rows && rows.length > 0) {
              errors.push(`Duplicate load orders: ${rows.length}`)
            }

            resolve({
              healthy: errors.length === 0,
              errors,
            })
          }
        )
      })
    })
  }
}

// ============================================================================
// Export Service Instance
// ============================================================================

export const modsDatabaseService = new ModsDatabaseService()
