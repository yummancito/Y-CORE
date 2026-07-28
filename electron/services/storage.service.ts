// ============================================================================
// electron/services/storage.service.ts
// ----------------------------------------------------------------------------
// Storage Service — registers with ServiceRegistry and wraps
// electron/modules/storage-center.ts for IPC dispatch.
// ============================================================================

import {
  scanLibraries,
  checkDiskSpace,
  moveGame,
  cleanGameFolders,
  getStorageDiagnostics,
} from '../modules/storage-center'
import { logger } from '../logger'
import type { ScanLibrariesOptions, CheckDiskSpaceResult, MoveGameResult, CleanupResult, StorageDiagnostics, StorageAnalysis } from '../modules/storage-center'

export const storageService = {
  async scanLibraries(opts?: ScanLibrariesOptions): Promise<StorageAnalysis> {
    try {
      return scanLibraries(opts)
    } catch (err: any) {
      logger.error(`[StorageService] scanLibraries failed: ${err.message}`, 'storage')
      throw err
    }
  },

  async checkDiskSpace(targetPath?: string): Promise<CheckDiskSpaceResult> {
    try {
      return checkDiskSpace(targetPath)
    } catch (err: any) {
      logger.error(`[StorageService] checkDiskSpace failed: ${err.message}`, 'storage')
      throw err
    }
  },

  async moveGame(
    appId: string,
    sourceDir: string,
    targetLibPath: string,
  ): Promise<MoveGameResult> {
    try {
      return await moveGame(appId, sourceDir, targetLibPath)
    } catch (err: any) {
      logger.error(`[StorageService] moveGame failed: ${err.message}`, 'storage')
      return { success: false, error: err.message }
    }
  },

  async cleanGameFolders(libraryPaths: string[]): Promise<CleanupResult> {
    try {
      return cleanGameFolders(libraryPaths)
    } catch (err: any) {
      logger.error(`[StorageService] cleanGameFolders failed: ${err.message}`, 'storage')
      return { success: false, bytesFreed: 0, itemsRemoved: [], errors: [err.message] }
    }
  },

  async getStorageDiagnostics(games?: { installDir: string; sizeOnDisk: number }[]): Promise<StorageDiagnostics> {
    try {
      return getStorageDiagnostics(games)
    } catch (err: any) {
      logger.error(`[StorageService] getStorageDiagnostics failed: ${err.message}`, 'storage')
      throw err
    }
  },
}
