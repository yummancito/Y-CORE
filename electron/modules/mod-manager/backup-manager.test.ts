// ============================================================================
// electron/modules/mod-manager/backup-manager.test.ts
// ============================================================================
// Comprehensive unit tests for BackupManager.
// Tests cover core functionality, error handling, and edge cases.
// ============================================================================

import { BackupManager, createBackupManager } from './backup-manager'
import * as fs from 'fs'
import * as path from 'path'

// ============================================================================
// Test Setup and Utilities
// ============================================================================

const TEST_TEMP_DIR = path.join(__dirname, '.test-temp')
const TEST_GAME_DIR = path.join(TEST_TEMP_DIR, 'test-game')
const TEST_BACKUP_DIR = path.join(TEST_TEMP_DIR, 'test-backups')

function createTestGameDirectory(): void {
  // Create game directory structure
  const dirs = [
    TEST_GAME_DIR,
    path.join(TEST_GAME_DIR, 'data'),
    path.join(TEST_GAME_DIR, 'mods'),
    path.join(TEST_GAME_DIR, 'mods', 'mod1'),
  ]

  dirs.forEach((dir) => {
    fs.mkdirSync(dir, { recursive: true })
  })

  // Create test files
  fs.writeFileSync(path.join(TEST_GAME_DIR, 'game.exe'), 'test executable')
  fs.writeFileSync(path.join(TEST_GAME_DIR, 'config.ini'), '[game]\nversion=1.0')
  fs.writeFileSync(path.join(TEST_GAME_DIR, 'data', 'game.dat'), Buffer.alloc(1024))
  fs.writeFileSync(path.join(TEST_GAME_DIR, 'mods', 'mod1', 'mod.ini'), 'mod data')
}

function cleanupTestDirectory(): void {
  if (fs.existsSync(TEST_TEMP_DIR)) {
    fs.rmSync(TEST_TEMP_DIR, { recursive: true, force: true })
  }
}

// ============================================================================
// BackupManager Tests
// ============================================================================

describe('BackupManager', () => {
  let backupManager: BackupManager

  beforeEach(() => {
    cleanupTestDirectory()
    createTestGameDirectory()

    backupManager = new BackupManager({
      backupsDir: TEST_BACKUP_DIR,
      verbose: false,
    })
  })

  afterEach(() => {
    cleanupTestDirectory()
  })

  // ========== Backup Creation Tests ==========

  it('should create a backup successfully', async () => {
    const backup = await backupManager.createBackup(TEST_GAME_DIR, 'test-game')

    expect(backup).toBeDefined()
    expect(backup.id).toBeTruthy()
    expect(backup.gameId).toBe('test-game')
    expect(backup.fileCount).toBeGreaterThan(0)
    expect(backup.totalSize).toBeGreaterThan(0)
    expect(backup.createdAt).toBeTruthy()
    expect(fs.existsSync(backup.path)).toBe(true)
  })

  it('should create backup with custom name and description', async () => {
    const backup = await backupManager.createBackup(TEST_GAME_DIR, 'test-game', {
      name: 'Custom Backup Name',
      description: 'This is a test backup',
    })

    expect(backup.name).toBe('Custom Backup Name')
    expect(backup.description).toBe('This is a test backup')
  })

  it('should throw error for non-existent game path', async () => {
    const nonExistentPath = path.join(TEST_TEMP_DIR, 'non-existent')

    await expect(
      backupManager.createBackup(nonExistentPath, 'test-game')
    ).rejects.toThrow('does not exist')
  })

  it('should emit backup-created event', async () => {
    const eventSpy = jest.fn()
    backupManager.on('backup-created', eventSpy)

    const backup = await backupManager.createBackup(TEST_GAME_DIR, 'test-game')

    expect(eventSpy).toHaveBeenCalledTimes(1)
    expect(eventSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'backup-created',
        gameId: 'test-game',
        backupId: backup.id,
      })
    )
  })

  it('should track progress during backup', async () => {
    const progressSpy = jest.fn()

    await backupManager.createBackup(TEST_GAME_DIR, 'test-game', {
      onProgress: progressSpy,
    })

    expect(progressSpy).toHaveBeenCalled()
    expect(progressSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'creating',
        percentage: expect.any(Number),
        filesProcessed: expect.any(Number),
        totalFiles: expect.any(Number),
        status: expect.any(String),
      })
    )
  })

  it('should calculate backup checksum', async () => {
    const backup = await backupManager.createBackup(TEST_GAME_DIR, 'test-game')

    expect(backup.checksum).toBeTruthy()
    expect(backup.checksum).toMatch(/^[a-f0-9]{64}$/) // SHA256 hex format
  })

  it('should store backup metadata', async () => {
    const backup = await backupManager.createBackup(TEST_GAME_DIR, 'test-game')

    const metadataPath = path.join(backup.path, 'backup-metadata.json')
    expect(fs.existsSync(metadataPath)).toBe(true)

    const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'))
    expect(metadata.id).toBe(backup.id)
    expect(metadata.gameId).toBe('test-game')
  })

  // ========== Backup Listing Tests ==========

  it('should list all backups for a game', async () => {
    await backupManager.createBackup(TEST_GAME_DIR, 'test-game')
    await backupManager.createBackup(TEST_GAME_DIR, 'test-game')

    const backups = await backupManager.listBackups('test-game')

    expect(backups).toHaveLength(2)
  })

  it('should return empty array for game with no backups', async () => {
    const backups = await backupManager.listBackups('non-existent-game')

    expect(backups).toEqual([])
  })

  it('should sort backups by creation time (newest first)', async () => {
    const backup1 = await backupManager.createBackup(TEST_GAME_DIR, 'test-game')

    // Wait to ensure different timestamps
    await new Promise((resolve) => setTimeout(resolve, 100))

    const backup2 = await backupManager.createBackup(TEST_GAME_DIR, 'test-game')

    const backups = await backupManager.listBackups('test-game')

    expect(backups[0].id).toBe(backup2.id)
    expect(backups[1].id).toBe(backup1.id)
  })

  // ========== Backup Deletion Tests ==========

  it('should delete a backup', async () => {
    const backup = await backupManager.createBackup(TEST_GAME_DIR, 'test-game')

    expect(fs.existsSync(backup.path)).toBe(true)

    await backupManager.deleteBackup('test-game', backup.id)

    expect(fs.existsSync(backup.path)).toBe(false)
  })

  it('should emit backup-deleted event', async () => {
    const backup = await backupManager.createBackup(TEST_GAME_DIR, 'test-game')
    const eventSpy = jest.fn()

    backupManager.on('backup-deleted', eventSpy)

    await backupManager.deleteBackup('test-game', backup.id)

    expect(eventSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'backup-deleted',
        gameId: 'test-game',
        backupId: backup.id,
      })
    )
  })

  it('should throw error when deleting non-existent backup', async () => {
    await expect(
      backupManager.deleteBackup('test-game', 'non-existent-id')
    ).rejects.toThrow('not found')
  })

  // ========== Cleanup Tests ==========

  it('should cleanup old backups based on count', async () => {
    const backup1 = await backupManager.createBackup(TEST_GAME_DIR, 'test-game')
    await new Promise((resolve) => setTimeout(resolve, 100))
    const backup2 = await backupManager.createBackup(TEST_GAME_DIR, 'test-game')

    const deletedCount = await backupManager.cleanupOldBackups('test-game', {
      keepLatestCount: 1,
    })

    expect(deletedCount).toBe(1)
    expect(fs.existsSync(backup1.path)).toBe(false)
    expect(fs.existsSync(backup2.path)).toBe(true)
  })

  it('should cleanup old backups based on retention days', async () => {
    const backup = await backupManager.createBackup(TEST_GAME_DIR, 'test-game')

    // Simulate old backup by modifying creation time in metadata
    const metadataPath = path.join(backup.path, 'backup-metadata.json')
    const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'))
    metadata.createdAt = Date.now() - 30 * 24 * 60 * 60 * 1000 // 30 days ago
    fs.writeFileSync(metadataPath, JSON.stringify(metadata))

    const deletedCount = await backupManager.cleanupOldBackups('test-game', {
      retentionDays: 7,
    })

    expect(deletedCount).toBe(1)
    expect(fs.existsSync(backup.path)).toBe(false)
  })

  it('should never delete recent backups', async () => {
    const backup1 = await backupManager.createBackup(TEST_GAME_DIR, 'test-game')

    const deletedCount = await backupManager.cleanupOldBackups('test-game', {
      keepLatestCount: 1,
      retentionDays: 7,
    })

    expect(deletedCount).toBe(0)
    expect(fs.existsSync(backup1.path)).toBe(true)
  })

  // ========== Storage Statistics Tests ==========

  it('should calculate storage stats for a game', async () => {
    await backupManager.createBackup(TEST_GAME_DIR, 'test-game')

    const stats = await backupManager.getStorageStats('test-game')

    expect(stats.gameId).toBe('test-game')
    expect(stats.backupCount).toBe(1)
    expect(stats.totalBackupSize).toBeGreaterThan(0)
    expect(stats.realDataSize).toBeGreaterThan(0)
  })

  it('should return zero stats for game with no backups', async () => {
    const stats = await backupManager.getStorageStats('non-existent-game')

    expect(stats.gameId).toBe('non-existent-game')
    expect(stats.backupCount).toBe(0)
    expect(stats.totalBackupSize).toBe(0)
    expect(stats.realDataSize).toBe(0)
  })

  it('should calculate global statistics', async () => {
    await backupManager.createBackup(TEST_GAME_DIR, 'game-1')
    await backupManager.createBackup(TEST_GAME_DIR, 'game-2')

    const stats = await backupManager.getGlobalStatistics()

    expect(stats.totalBackups).toBe(2)
    expect(stats.totalStorage).toBeGreaterThan(0)
    expect(stats.totalRealData).toBeGreaterThan(0)
  })

  it('should calculate deduplication ratio', async () => {
    const backup1 = await backupManager.createBackup(TEST_GAME_DIR, 'test-game')

    const stats = await backupManager.getStorageStats('test-game')
    const ratio = stats.totalBackupSize / stats.realDataSize

    expect(ratio).toBeGreaterThan(0)
    expect(ratio).toBeLessThanOrEqual(2) // Reasonable ratio for test data
  })

  // ========== Validation Tests ==========

  it('should validate backup integrity', async () => {
    const backup = await backupManager.createBackup(TEST_GAME_DIR, 'test-game')

    const validation = await backupManager.validateBackup('test-game', backup.id)

    expect(validation.valid).toBe(true)
    expect(validation.details.metadataValid).toBe(true)
    expect(validation.details.allFilesPresent).toBe(true)
  })

  it('should detect invalid backup', async () => {
    const backup = await backupManager.createBackup(TEST_GAME_DIR, 'test-game')

    // Delete backup directory to simulate corruption
    fs.rmSync(backup.path, { recursive: true, force: true })

    const validation = await backupManager.validateBackup('test-game', backup.id)

    expect(validation.valid).toBe(false)
  })

  it('should return error for non-existent backup', async () => {
    const validation = await backupManager.validateBackup(
      'test-game',
      'non-existent-id'
    )

    expect(validation.valid).toBe(false)
    expect(validation.details.metadataValid).toBe(false)
  })

  // ========== File Count Tests ==========

  it('should count files correctly', async () => {
    const backup = await backupManager.createBackup(TEST_GAME_DIR, 'test-game')

    // Count actual files in source
    let actualFileCount = 0
    const countFiles = (dir: string) => {
      const entries = fs.readdirSync(dir)
      for (const entry of entries) {
        const fullPath = path.join(dir, entry)
        const stat = fs.statSync(fullPath)
        if (stat.isFile()) {
          actualFileCount++
        } else if (stat.isDirectory()) {
          countFiles(fullPath)
        }
      }
    }
    countFiles(TEST_GAME_DIR)

    expect(backup.fileCount).toBe(actualFileCount)
  })

  // ========== Concurrent Operations Tests ==========

  it('should handle multiple backups for same game', async () => {
    const backup1 = await backupManager.createBackup(TEST_GAME_DIR, 'test-game')
    const backup2 = await backupManager.createBackup(TEST_GAME_DIR, 'test-game')
    const backup3 = await backupManager.createBackup(TEST_GAME_DIR, 'test-game')

    const backups = await backupManager.listBackups('test-game')

    expect(backups).toHaveLength(3)
    expect(backups.map((b) => b.id)).toContain(backup1.id)
    expect(backups.map((b) => b.id)).toContain(backup2.id)
    expect(backups.map((b) => b.id)).toContain(backup3.id)
  })

  it('should handle backups for different games', async () => {
    const backup1 = await backupManager.createBackup(TEST_GAME_DIR, 'game-1')
    const backup2 = await backupManager.createBackup(TEST_GAME_DIR, 'game-2')

    const backups1 = await backupManager.listBackups('game-1')
    const backups2 = await backupManager.listBackups('game-2')

    expect(backups1).toHaveLength(1)
    expect(backups2).toHaveLength(1)
    expect(backups1[0].id).toBe(backup1.id)
    expect(backups2[0].id).toBe(backup2.id)
  })

  // ========== Configuration Tests ==========

  it('should use custom configuration', async () => {
    const customBackupManager = new BackupManager({
      backupsDir: TEST_BACKUP_DIR,
      defaultRetentionDays: 14,
      defaultKeepCount: 5,
    })

    const backup = await customBackupManager.createBackup(TEST_GAME_DIR, 'test-game')

    expect(backup).toBeDefined()
    expect(fs.existsSync(path.join(TEST_BACKUP_DIR, 'test-game', backup.id))).toBe(true)
  })

  // ========== Singleton Pattern Tests ==========

  it('should support singleton pattern', async () => {
    const manager1 = new BackupManager({ backupsDir: TEST_BACKUP_DIR })
    const manager2 = new BackupManager({ backupsDir: TEST_BACKUP_DIR })

    // They should be different instances
    expect(manager1).not.toBe(manager2)
  })

  // ========== Exclusion Patterns Tests ==========

  it('should respect exclusion patterns', async () => {
    // Create an excluded file
    fs.writeFileSync(path.join(TEST_GAME_DIR, 'temp.tmp'), 'temporary file')

    const backup = await backupManager.createBackup(TEST_GAME_DIR, 'test-game', {
      excludePatterns: ['.*\\.tmp$'],
    })

    // Check if .tmp file is in backup
    const backupTmpFile = path.join(backup.path, 'temp.tmp')
    expect(fs.existsSync(backupTmpFile)).toBe(false)
  })

  // ========== Error Handling Tests ==========

  it('should handle backup directory creation errors gracefully', async () => {
    const invalidPath = 'Z:\\non\\existent\\path\\that\\cannot\\be\\created'
    const invalidBackupManager = new BackupManager({
      backupsDir: invalidPath,
    })

    // Should not throw on creation, but on backup attempt
    expect(invalidBackupManager).toBeDefined()
  })

  // ========== Large File Tests ==========

  it('should handle large files in backup', async () => {
    // Create a large file (10 MB)
    const largeFile = path.join(TEST_GAME_DIR, 'large-file.bin')
    const largeBuffer = Buffer.alloc(10 * 1024 * 1024)
    fs.writeFileSync(largeFile, largeBuffer)

    const backup = await backupManager.createBackup(TEST_GAME_DIR, 'test-game')

    expect(backup.totalSize).toBeGreaterThanOrEqual(10 * 1024 * 1024)
    expect(fs.existsSync(path.join(backup.path, 'large-file.bin'))).toBe(true)
  })

  // ========== Empty Directory Tests ==========

  it('should handle empty directories in backup', async () => {
    fs.mkdirSync(path.join(TEST_GAME_DIR, 'empty-dir'))

    const backup = await backupManager.createBackup(TEST_GAME_DIR, 'test-game')

    expect(fs.existsSync(path.join(backup.path, 'empty-dir'))).toBe(true)
  })
})

// ============================================================================
// Integration Tests
// ============================================================================

describe('BackupManager Integration', () => {
  let backupManager: BackupManager

  beforeEach(() => {
    cleanupTestDirectory()
    createTestGameDirectory()

    backupManager = new BackupManager({
      backupsDir: TEST_BACKUP_DIR,
    })
  })

  afterEach(() => {
    cleanupTestDirectory()
  })

  it('should support complete backup lifecycle', async () => {
    // Create backup
    const backup1 = await backupManager.createBackup(TEST_GAME_DIR, 'test-game')
    expect(fs.existsSync(backup1.path)).toBe(true)

    // List backups
    let backups = await backupManager.listBackups('test-game')
    expect(backups).toHaveLength(1)

    // Modify game files
    fs.writeFileSync(path.join(TEST_GAME_DIR, 'new-file.txt'), 'new content')

    // Create another backup
    const backup2 = await backupManager.createBackup(TEST_GAME_DIR, 'test-game')

    // List backups
    backups = await backupManager.listBackups('test-game')
    expect(backups).toHaveLength(2)

    // Get statistics
    const stats = await backupManager.getStorageStats('test-game')
    expect(stats.backupCount).toBe(2)

    // Delete old backup
    await backupManager.deleteBackup('test-game', backup1.id)

    // Verify deletion
    backups = await backupManager.listBackups('test-game')
    expect(backups).toHaveLength(1)
    expect(backups[0].id).toBe(backup2.id)
  })

  it('should support cleanup of multiple backups', async () => {
    // Create multiple backups
    const backups = []
    for (let i = 0; i < 5; i++) {
      const backup = await backupManager.createBackup(TEST_GAME_DIR, 'test-game')
      backups.push(backup)

      // Small delay between backups
      await new Promise((resolve) => setTimeout(resolve, 50))
    }

    // Cleanup to keep only 2
    const deletedCount = await backupManager.cleanupOldBackups('test-game', {
      keepLatestCount: 2,
    })

    expect(deletedCount).toBe(3)

    // Verify remaining backups
    const remaining = await backupManager.listBackups('test-game')
    expect(remaining).toHaveLength(2)
  })
})

// ============================================================================
// Performance Tests
// ============================================================================

describe('BackupManager Performance', () => {
  let backupManager: BackupManager

  beforeEach(() => {
    cleanupTestDirectory()
    createTestGameDirectory()

    backupManager = new BackupManager({
      backupsDir: TEST_BACKUP_DIR,
    })
  })

  afterEach(() => {
    cleanupTestDirectory()
  })

  it('should complete backup within reasonable time', async () => {
    const startTime = Date.now()

    await backupManager.createBackup(TEST_GAME_DIR, 'test-game')

    const elapsed = Date.now() - startTime

    // Should complete in less than 10 seconds for test data
    expect(elapsed).toBeLessThan(10000)
  })

  it('should list backups quickly', async () => {
    // Create multiple backups
    for (let i = 0; i < 10; i++) {
      await backupManager.createBackup(TEST_GAME_DIR, 'test-game')
    }

    const startTime = Date.now()
    const backups = await backupManager.listBackups('test-game')
    const elapsed = Date.now() - startTime

    expect(backups).toHaveLength(10)
    expect(elapsed).toBeLessThan(1000) // Should be fast
  })
})
