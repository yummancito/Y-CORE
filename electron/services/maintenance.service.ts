// ============================================================================
// electron/services/maintenance.service.ts
// ----------------------------------------------------------------------------
// MaintenanceService — coordinates health checks, diagnostics, and cleanup
// across all subsystems by reusing existing backend services directly.
// ============================================================================

import { getServiceRegistry } from './registry'
import { logger } from '../logger'
import type { FullHealthReport, RuntimeHealthReport, SaveHealthReport, LibraryScanReport, FullDiagnostics } from '../common/ipc-contract'

const REGISTRY = () => getServiceRegistry()

export const maintenanceService = {
  async runFullHealthCheck(): Promise<FullHealthReport> {
    const [runtime, saves, library] = await Promise.all([
      this.checkRuntimeHealth().catch((err: Error) => {
        logger.error(`[Maintenance] runtime health check failed: ${err.message}`, 'maintenance')
        return { healthy: false, runtimes: [], directX: 'unknown', missing: [], warnings: [err.message] } as RuntimeHealthReport
      }),
      this.checkSaveHealth().catch((err: Error) => {
        logger.error(`[Maintenance] save health check failed: ${err.message}`, 'maintenance')
        return { healthy: false, totalBackups: 0, totalSaves: 0, totalSizeBytes: 0, gamesWithBackups: 0, gamesWithoutBackups: 0, gamesWithoutDetection: 0, oldestBackupAge: 0, warnings: [err.message] } as SaveHealthReport
      }),
      this.runLibraryScan().catch((err: Error) => {
        logger.error(`[Maintenance] library scan failed: ${err.message}`, 'maintenance')
        return { healthy: false, totalGames: 0, verified: 0, corrupted: 0, missingFiles: 0, orphanedEntries: 0, duplicateEntries: 0, totalSizeBytes: 0, warnings: [err.message], scannedPaths: [], scanDurationMs: 0 } as LibraryScanReport
      }),
    ])

    const overallWarnings = [...runtime.warnings, ...saves.warnings, ...library.warnings]
    const overallIssues = runtime.missing.length + (saves.healthy ? 0 : 1) + (library.healthy ? 0 : 1)

    return {
      healthy: runtime.healthy && saves.healthy && library.healthy,
      runtime,
      saves,
      library,
      overallWarnings,
      overallIssues,
      timestamp: Date.now(),
    }
  },

  async checkRuntimeHealth(): Promise<RuntimeHealthReport> {
    const registry = REGISTRY()
    if (!registry.has('runtimeDetect')) {
      return { healthy: false, runtimes: [], directX: 'unknown', missing: [], warnings: ['Runtime detection service not registered'] }
    }
    const result = await registry.call('runtimeDetect', 'detectAll', []) as { runtimes: { name: string; installed: boolean; version?: string }[]; directX: string }
    const missing = result.runtimes
      .filter((r) => !r.installed)
      .map((r) => ({ name: r.name, severity: 'recommended' as const }))

    return {
      healthy: missing.length === 0,
      runtimes: result.runtimes,
      directX: result.directX || 'unknown',
      missing,
      warnings: missing.length > 0 ? [`${missing.length} runtime(s) not installed`] : [],
    }
  },

  async checkSaveHealth(): Promise<SaveHealthReport> {
    const registry = REGISTRY()
    if (!registry.has('saveManager')) {
      return { healthy: false, totalBackups: 0, totalSaves: 0, totalSizeBytes: 0, gamesWithBackups: 0, gamesWithoutBackups: 0, gamesWithoutDetection: 0, oldestBackupAge: 0, warnings: ['Save manager service not registered'] }
    }

    let totalBackups = 0
    let totalSaves = 0
    let totalSizeBytes = 0
    let gamesWithBackups = 0
    let oldestBackupAge = Infinity

    try {
      // Try to get game list and check saves for each
      if (registry.has('game')) {
        const gamesResult = await registry.call('game', 'listInstalled', []) as { success: boolean; games: { appId: string }[] }
        if (gamesResult.success && gamesResult.games) {
          for (const game of gamesResult.games) {
            try {
              const backups = await registry.call('saveManager', 'listBackups', [game.appId]) as any[]
              if (backups && backups.length > 0) {
                gamesWithBackups++
                totalBackups += backups.length
                for (const b of backups) {
                  if (b.totalSize) totalSizeBytes += b.totalSize
                  if (b.createdAt && b.createdAt < oldestBackupAge) oldestBackupAge = b.createdAt
                }
              }
            } catch {
              // Skip games without save manager support
            }
          }
        }
      }
    } catch (err: any) {
      logger.warn(`[Maintenance] save health scan error: ${err?.message}`, 'maintenance')
    }

    const warnings: string[] = []
    if (totalBackups === 0) warnings.push('No save backups found for any game')

    return {
      healthy: totalBackups > 0,
      totalBackups,
      totalSaves,
      totalSizeBytes,
      gamesWithBackups,
      gamesWithoutBackups: 0,
      gamesWithoutDetection: 0,
      oldestBackupAge: oldestBackupAge === Infinity ? 0 : oldestBackupAge,
      warnings,
    }
  },

  async runLibraryScan(): Promise<LibraryScanReport> {
    const registry = REGISTRY()
    const startTime = Date.now()

    let totalGames = 0
    let totalSizeBytes = 0
    const warnings: string[] = []
    const scannedPaths: string[] = []

    if (registry.has('game')) {
      try {
        const gamesResult = await registry.call('game', 'listInstalled', []) as { success: boolean; games: { appId: string; installDir?: string; sizeOnDisk?: number }[]; error?: string }
        if (gamesResult.success && gamesResult.games) {
          totalGames = gamesResult.games.length
          for (const g of gamesResult.games) {
            if (g.sizeOnDisk) totalSizeBytes += g.sizeOnDisk
            if (g.installDir) scannedPaths.push(g.installDir)
          }
        } else {
          warnings.push(gamesResult.error || 'Failed to list installed games')
        }
      } catch (err: any) {
        warnings.push(`Game list error: ${err?.message}`)
      }
    }

    // Also scan storage libraries
    if (registry.has('storage')) {
      try {
        const storageResult = await registry.call('storage', 'scanLibraries', [{}]) as any
        if (storageResult?.libraries) {
          for (const lib of storageResult.libraries) {
            if (lib.path && !scannedPaths.includes(lib.path)) {
              scannedPaths.push(lib.path)
            }
          }
          if (storageResult.totalGames && storageResult.totalGames > totalGames) {
            totalGames = storageResult.totalGames
          }
          if (storageResult.totalUsedByGames) {
            totalSizeBytes = Math.max(totalSizeBytes, storageResult.totalUsedByGames)
          }
        }
      } catch (err: any) {
        warnings.push(`Storage scan error: ${err?.message}`)
      }
    }

    const scanDurationMs = Date.now() - startTime

    return {
      healthy: warnings.length === 0,
      totalGames,
      verified: totalGames,
      corrupted: 0,
      missingFiles: 0,
      orphanedEntries: 0,
      duplicateEntries: 0,
      totalSizeBytes,
      warnings,
      scannedPaths,
      scanDurationMs,
    }
  },

  async getMaintenanceDiagnostics(): Promise<FullDiagnostics> {
    const registry = REGISTRY()
    const services = registry.listServices().map((s) => ({
      name: s.name,
      methods: s.methods.length,
      status: 'registered' as const,
    }))

    return {
      services,
      modules: [
        { name: 'electron', version: process.versions.electron || 'unknown', loaded: true },
        { name: 'chrome', version: process.versions.chrome || 'unknown', loaded: true },
        { name: 'node', version: process.versions.node || 'unknown', loaded: true },
        { name: 'v8', version: process.versions.v8 || 'unknown', loaded: true },
      ],
      system: {
        platform: process.platform,
        arch: process.arch,
        electronVersion: process.versions.electron || 'unknown',
        userData: '',
      },
      warnings: [],
    }
  },

  async clearAllCaches(): Promise<{ success: boolean; error?: string; bytesFreed?: number }> {
    const registry = REGISTRY()
    let bytesFreed = 0
    const errors: string[] = []

    // Clear download cache
    if (registry.has('download')) {
      try {
        const result = await registry.call('download', 'clearCache', []) as { success: boolean; error?: string }
        if (!result.success) errors.push(`Download cache: ${result.error || 'unknown'}`)
      } catch (err: any) {
        errors.push(`Download cache: ${err?.message}`)
      }
    }

    // Clear completed tasks history
    if (registry.has('download')) {
      try {
        await registry.call('download', 'clearCompleted', [])
        await registry.call('download', 'clearHistory', [])
      } catch {
        // Non-critical
      }
    }

    if (errors.length > 0) {
      return { success: false, error: errors.join('; '), bytesFreed }
    }

    return { success: true, bytesFreed }
  },
}
