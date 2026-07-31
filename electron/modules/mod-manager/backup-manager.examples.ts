// ============================================================================
// electron/modules/mod-manager/backup-manager.examples.ts
// ============================================================================
// Usage examples and test patterns for BackupManager.
// These examples demonstrate real-world integration scenarios.
// ============================================================================

import {
  BackupManager,
  getBackupManager,
  type BackupInfo,
  type BackupProgress,
  type GameStorageStats,
  type BackupStatistics,
} from './index'
import path from 'path'
import fs from 'fs'

// ============================================================================
// Example 1: Basic Backup Creation
// ============================================================================

export async function example_basicBackupCreation() {
  const backupManager = new BackupManager({
    backupsDir: '/path/to/backups',
  })

  const gamePath = '/path/to/game'
  const gameId = 'game-id-123'

  // Create a simple backup
  const backup = await backupManager.createBackup(gamePath, gameId)

  console.log(`Backup created: ${backup.id}`)
  console.log(`Files: ${backup.fileCount}`)
  console.log(`Size: ${(backup.totalSize / 1024 / 1024).toFixed(2)} MB`)
  console.log(`Used hardlinks: ${backup.usedHardlinks}`)

  return backup
}

// ============================================================================
// Example 2: Backup with Progress Tracking
// ============================================================================

export async function example_backupWithProgress() {
  const backupManager = new BackupManager()
  const gamePath = '/path/to/game'
  const gameId = 'game-id-456'

  const backup = await backupManager.createBackup(gamePath, gameId, {
    name: 'My Game Backup',
    description: 'Manual backup for testing',
    onProgress: (progress: BackupProgress) => {
      const percent = progress.percentage.toFixed(1)
      const speed = (
        progress.bytesProcessed /
        (progress.estimatedTimeRemaining || 1)
      ).toFixed(2)

      console.clear()
      console.log('='.repeat(60))
      console.log(`BACKUP PROGRESS: ${percent}%`)
      console.log('='.repeat(60))
      console.log(`Status: ${progress.status}`)
      console.log(`Files: ${progress.filesProcessed}/${progress.totalFiles}`)
      console.log(
        `Size: ${(progress.bytesProcessed / 1024 / 1024).toFixed(2)} MB / ${(progress.totalBytes / 1024 / 1024).toFixed(2)} MB`
      )
      console.log(`Speed: ${speed} MB/s`)
      console.log(`ETA: ${progress.estimatedTimeRemaining || 'calculating'} seconds`)
      if (progress.currentFile) {
        console.log(`Current: ${path.basename(progress.currentFile)}`)
      }
    },
  })

  console.log('Backup complete!')
  return backup
}

// ============================================================================
// Example 3: Pre-Mod Installation with Auto-Rollback
// ============================================================================

export async function example_preModInstallationWithRollback(
  gameId: string,
  gamePath: string,
  modName: string,
  performInstallation: () => Promise<void>
) {
  const backupManager = getBackupManager()

  let preInstallBackup: BackupInfo | undefined

  try {
    // Step 1: Create pre-install backup
    console.log(`Creating pre-installation backup for ${modName}...`)

    preInstallBackup = await backupManager.createBackup(gamePath, gameId, {
      name: `Pre-Install-${modName}`,
      description: `Automatic backup before installing: ${modName}`,
      onProgress: (progress) => {
        console.log(`Backup progress: ${progress.percentage.toFixed(1)}%`)
      },
    })

    console.log(`Pre-install backup created: ${preInstallBackup.id}`)

    // Step 2: Perform mod installation
    console.log(`Installing mod: ${modName}...`)
    await performInstallation()

    console.log(`Mod installation successful!`)
  } catch (error) {
    console.error(`Installation failed: ${error instanceof Error ? error.message : 'unknown error'}`)

    // Step 3: Automatic rollback on failure
    if (preInstallBackup) {
      console.log(`Attempting automatic rollback...`)

      try {
        await backupManager.restoreBackup(gameId, preInstallBackup.id, {
          onProgress: (progress) => {
            console.log(`Restore progress: ${progress.percentage.toFixed(1)}%`)
          },
        })

        console.log(`Successfully rolled back to pre-install state`)
      } catch (restoreError) {
        console.error(
          `Critical: Rollback failed! ${restoreError instanceof Error ? restoreError.message : 'unknown error'}`
        )
        throw new Error('Mod installation and automatic rollback both failed')
      }
    }

    throw error
  }
}

// ============================================================================
// Example 4: Listing and Managing Backups
// ============================================================================

export async function example_listingAndManagingBackups(gameId: string) {
  const backupManager = getBackupManager()

  // List all backups for a game
  const backups = await backupManager.listBackups(gameId)

  console.log(`Found ${backups.length} backups for ${gameId}`)
  console.log('Backups (newest first):')

  for (const backup of backups) {
    const date = new Date(backup.createdAt).toLocaleString()
    const size = (backup.totalSize / 1024 / 1024 / 1024).toFixed(2)
    const dedupRatio = (backup.totalSize / backup.realDataSize).toFixed(2)

    console.log(`  ${backup.id}`)
    console.log(`    Name: ${backup.name}`)
    console.log(`    Date: ${date}`)
    console.log(`    Files: ${backup.fileCount}`)
    console.log(`    Size: ${size} GB (${dedupRatio}x deduplication)`)
    console.log(`    Hardlinks: ${backup.usedHardlinks ? 'Yes' : 'No'}`)
    console.log()
  }

  // Keep only last 3 backups
  const cleanedCount = await backupManager.cleanupOldBackups(gameId, {
    keepLatestCount: 3,
    retentionDays: 7,
  })

  if (cleanedCount > 0) {
    console.log(`Cleaned up ${cleanedCount} old backups`)
  }

  return backups
}

// ============================================================================
// Example 5: Restore from Backup
// ============================================================================

export async function example_restoreFromBackup(
  gameId: string,
  backupId: string,
  gamePath: string
) {
  const backupManager = getBackupManager()

  // Get backup info
  const backups = await backupManager.listBackups(gameId)
  const backup = backups.find((b) => b.id === backupId)

  if (!backup) {
    throw new Error(`Backup not found: ${backupId}`)
  }

  // Validate backup integrity before restore
  console.log('Validating backup integrity...')
  const validation = await backupManager.validateBackup(gameId, backupId)

  if (!validation.valid) {
    console.error('Backup validation failed:')
    validation.details.errorMessages.forEach((msg) => console.error(`  - ${msg}`))
    throw new Error('Cannot restore from corrupted backup')
  }

  console.log('Backup validation passed')

  // Restore backup
  console.log(`Restoring backup: ${backup.name}`)

  await backupManager.restoreBackup(gameId, backupId, {
    createSnapshot: true,
    verify: true,
    onProgress: (progress) => {
      console.log(`Restore progress: ${progress.percentage.toFixed(1)}%`)
    },
  })

  console.log('Restore complete!')
}

// ============================================================================
// Example 6: Storage Statistics and Monitoring
// ============================================================================

export async function example_storageStatistics() {
  const backupManager = getBackupManager()

  // Get stats for specific game
  const gameStats = await backupManager.getStorageStats('game-id-123')

  console.log('Game Storage Statistics:')
  console.log(`  Game: ${gameStats.gameId}`)
  console.log(`  Backups: ${gameStats.backupCount}`)
  console.log(
    `  Total Size: ${(gameStats.totalBackupSize / 1024 / 1024 / 1024).toFixed(2)} GB`
  )
  console.log(
    `  Real Data: ${(gameStats.realDataSize / 1024 / 1024 / 1024).toFixed(2)} GB`
  )
  console.log(
    `  Deduplication: ${(gameStats.totalBackupSize / gameStats.realDataSize).toFixed(2)}x`
  )
  console.log()

  // Get global statistics
  const globalStats = await backupManager.getGlobalStatistics()

  console.log('Global Backup Statistics:')
  console.log(`  Total Backups: ${globalStats.totalBackups}`)
  console.log(`  Total Storage: ${(globalStats.totalStorage / 1024 / 1024 / 1024).toFixed(2)} GB`)
  console.log(`  Real Data: ${(globalStats.totalRealData / 1024 / 1024 / 1024).toFixed(2)} GB`)
  console.log(
    `  Deduplication: ${(globalStats.totalStorage / globalStats.totalRealData).toFixed(2)}x`
  )
  console.log(`  Hardlink Backups: ${globalStats.hardlinkBackupCount}`)
  console.log(`  Full Copy Backups: ${globalStats.fullCopyBackupCount}`)
  console.log(
    `  Space Saved: ${(globalStats.spacesSavedByDeduplication / 1024 / 1024 / 1024).toFixed(2)} GB`
  )
}

// ============================================================================
// Example 7: Event-Driven Architecture
// ============================================================================

export function example_eventDrivenArchitecture() {
  const backupManager = getBackupManager()

  // Listen for backup created
  backupManager.on('backup-created', (event) => {
    console.log(`[EVENT] Backup created: ${event.backupId}`)
    console.log(`  Game: ${event.gameId}`)
    console.log(`  Time: ${new Date(event.timestamp).toISOString()}`)

    // Update UI, send notification, etc.
    if (event.data) {
      console.log(`  Files: ${event.data.fileCount}`)
      console.log(`  Size: ${(event.data.totalSize / 1024 / 1024).toFixed(2)} MB`)
    }
  })

  // Listen for backup deleted
  backupManager.on('backup-deleted', (event) => {
    console.log(`[EVENT] Backup deleted: ${event.backupId}`)

    // Refresh UI backup list
  })

  // Listen for backup restored
  backupManager.on('backup-restored', (event) => {
    console.log(`[EVENT] Backup restored: ${event.backupId}`)

    // Notify user, refresh game state, etc.
  })

  return backupManager
}

// ============================================================================
// Example 8: Scheduled Cleanup
// ============================================================================

export async function example_scheduledCleanup() {
  const backupManager = getBackupManager()

  // Run cleanup every 12 hours
  const cleanupInterval = setInterval(async () => {
    try {
      console.log('[Cleanup] Starting scheduled backup cleanup...')

      // Get all games with backups
      const backupsDir = '/path/to/backups'
      if (!fs.existsSync(backupsDir)) return

      const gameIds = fs.readdirSync(backupsDir)

      let totalDeleted = 0

      for (const gameId of gameIds) {
        const deletedCount = await backupManager.cleanupOldBackups(gameId, {
          retentionDays: 7,
          keepLatestCount: 3,
        })

        if (deletedCount > 0) {
          console.log(`[Cleanup] Deleted ${deletedCount} backups for ${gameId}`)
          totalDeleted += deletedCount
        }
      }

      console.log(`[Cleanup] Total backups cleaned: ${totalDeleted}`)
    } catch (error) {
      console.error(`[Cleanup] Error: ${error instanceof Error ? error.message : 'unknown error'}`)
    }
  }, 12 * 60 * 60 * 1000) // 12 hours

  return cleanupInterval
}

// ============================================================================
// Example 9: Error Handling and Recovery
// ============================================================================

export async function example_errorHandlingAndRecovery(
  gameId: string,
  gamePath: string
) {
  const backupManager = getBackupManager()

  try {
    // Attempt backup
    const backup = await backupManager.createBackup(gamePath, gameId)
    console.log(`Backup successful: ${backup.id}`)
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('not exist')) {
        console.error('Game path does not exist')
        // Handle missing game directory
      } else if (error.message.includes('permission')) {
        console.error('Permission denied')
        // Handle permission error
      } else if (error.message.includes('space')) {
        console.error('Insufficient disk space')
        // Handle low disk space
      } else {
        console.error(`Backup failed: ${error.message}`)
        // Generic error handling
      }
    }

    throw error
  }
}

// ============================================================================
// Example 10: Batch Backup Operations
// ============================================================================

export async function example_batchBackupOperations(
  gameIds: string[],
  gamePaths: Map<string, string>
) {
  const backupManager = getBackupManager()
  const results = new Map<string, BackupInfo | Error>()

  console.log(`Starting batch backup for ${gameIds.length} games...`)

  for (const gameId of gameIds) {
    const gamePath = gamePaths.get(gameId)
    if (!gamePath) {
      results.set(gameId, new Error('Game path not found'))
      continue
    }

    try {
      console.log(`Backing up ${gameId}...`)
      const backup = await backupManager.createBackup(gamePath, gameId, {
        name: `Batch-Backup-${new Date().toISOString().split('T')[0]}`,
      })
      results.set(gameId, backup)
      console.log(`  ✓ Complete: ${backup.id}`)
    } catch (error) {
      results.set(gameId, error as Error)
      console.log(`  ✗ Failed: ${error instanceof Error ? error.message : 'unknown error'}`)
    }
  }

  // Print summary
  console.log('\nBatch Backup Summary:')
  let successful = 0
  let failed = 0

  for (const [gameId, result] of results) {
    if (result instanceof Error) {
      console.log(`  ${gameId}: FAILED - ${result.message}`)
      failed++
    } else {
      console.log(`  ${gameId}: SUCCESS - ${result.id}`)
      successful++
    }
  }

  console.log(`Total: ${successful} successful, ${failed} failed`)

  return results
}

// ============================================================================
// Example 11: Backup Validation and Integrity Check
// ============================================================================

export async function example_backupValidation(gameId: string, backupId: string) {
  const backupManager = getBackupManager()

  console.log(`Validating backup ${backupId}...`)

  const validation = await backupManager.validateBackup(gameId, backupId)

  console.log('Validation Results:')
  console.log(`  Overall Valid: ${validation.valid ? '✓ Yes' : '✗ No'}`)
  console.log(`  Metadata: ${validation.details.metadataValid ? '✓ Valid' : '✗ Invalid'}`)
  console.log(`  Checksum: ${validation.details.checksumMatch ? '✓ Match' : '✗ Mismatch'}`)
  console.log(`  Files: ${validation.details.allFilesPresent ? '✓ Present' : '✗ Missing'}`)
  console.log(`  Integrity: ${validation.details.integrityVerified ? '✓ Verified' : '✗ Corrupted'}`)

  if (validation.details.errorMessages.length > 0) {
    console.log('\nErrors:')
    validation.details.errorMessages.forEach((msg) => console.log(`  - ${msg}`))
  }

  return validation
}

// ============================================================================
// Example 12: Configuration and Performance Tuning
// ============================================================================

export function example_configurationAndTuning() {
  // Custom configuration for performance
  const backupManager = new BackupManager({
    backupsDir: '/mnt/backups', // Fast SSD for backups
    autoBackupBeforeInstall: true,
    autoRollbackOnFailure: true,
    defaultRetentionDays: 14, // Keep backups longer
    defaultKeepCount: 5, // Keep more recent backups
    maxConcurrentOps: 4, // Parallel operations
    operationTimeoutMs: 2 * 60 * 60 * 1000, // 2 hours timeout
    enableCompression: true, // Compress old backups
    compressionRetentionDays: 30, // Compress after 30 days
    verbose: true, // Detailed logging
  })

  return backupManager
}

// ============================================================================
// Example 13: Integration with Game Service
// ============================================================================

export async function example_gameServiceIntegration() {
  const backupManager = getBackupManager()

  // Example: Game installation service
  class GameInstallationService {
    async installMod(
      gameId: string,
      gamePath: string,
      modInfo: { name: string; version: string }
    ) {
      // Pre-installation backup
      const backup = await backupManager.createBackup(gamePath, gameId, {
        name: `Pre-Install-${modInfo.name}-${modInfo.version}`,
        description: `Before mod: ${modInfo.name} v${modInfo.version}`,
      })

      console.log(`Pre-installation backup created: ${backup.id}`)

      try {
        // Install mod (mock)
        console.log(`Installing ${modInfo.name}...`)
        // ... installation logic ...
        console.log('Installation complete')
      } catch (error) {
        console.error('Installation failed, rolling back...')

        // Automatic rollback
        await backupManager.restoreBackup(gameId, backup.id)
        console.log('Rollback complete')

        throw error
      }
    }

    async uninstallMod(gameId: string, gamePath: string, modName: string) {
      // Optional pre-uninstall backup
      const backup = await backupManager.createBackup(gamePath, gameId, {
        name: `Pre-Uninstall-${modName}`,
      })

      console.log(`Pre-uninstall backup: ${backup.id}`)

      // Perform uninstall
      console.log(`Uninstalling ${modName}...`)
      // ... uninstall logic ...
    }

    async listBackups(gameId: string) {
      return await backupManager.listBackups(gameId)
    }

    async restoreToBackup(gameId: string, backupId: string) {
      await backupManager.restoreBackup(gameId, backupId)
    }
  }

  return new GameInstallationService()
}

// ============================================================================
// Example 14: Progress UI Integration
// ============================================================================

export async function example_progressUIIntegration(
  gamePath: string,
  gameId: string
) {
  const backupManager = getBackupManager()

  // Example: React component state updates
  const backupState = {
    isBackingUp: false,
    progress: 0,
    currentFile: '',
    speed: 0,
    eta: 0,
    error: null,
  }

  const backup = await backupManager.createBackup(gamePath, gameId, {
    onProgress: (progress) => {
      // Update UI state
      backupState.progress = progress.percentage
      backupState.currentFile = progress.currentFile || ''
      backupState.eta = progress.estimatedTimeRemaining || 0

      // Calculate speed (bytes/sec)
      if (progress.estimatedTimeRemaining && progress.estimatedTimeRemaining > 0) {
        const remaining = progress.totalBytes - progress.bytesProcessed
        backupState.speed = remaining / progress.estimatedTimeRemaining
      }

      // Dispatch UI update
      console.log(
        `Progress: ${backupState.progress.toFixed(1)}% | ` +
          `Speed: ${(backupState.speed / 1024 / 1024).toFixed(2)} MB/s | ` +
          `ETA: ${backupState.eta}s | ` +
          `File: ${path.basename(backupState.currentFile)}`
      )
    },
  })

  return backup
}

// ============================================================================
// Example 15: Singleton Pattern Usage
// ============================================================================

export async function example_singletonPattern() {
  // Get singleton instance (created once globally)
  const backupManager1 = getBackupManager()
  const backupManager2 = getBackupManager()

  // Both are the same instance
  console.log(
    `Singleton check: ${backupManager1 === backupManager2 ? 'True' : 'False'}`
  )

  // Use consistently across the application
  await backupManager1.createBackup('/game/path', 'game-id')

  return backupManager1
}
