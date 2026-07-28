// ============================================================================
// src/services/storage.service.ts
// ----------------------------------------------------------------------------
// Frontend Storage Service — calls backend via Gateway IPC.
// ============================================================================

import { BaseService } from './gateway'
import type { StorageServiceContract } from '../../electron/common/ipc-contract'

export class StorageService extends BaseService implements StorageServiceContract {
  protected serviceName = 'storage' as const

  async scanLibraries(opts?: {
    extraPaths?: string[]
    games?: { appId: string; name: string; installDir: string; sizeOnDisk: number }[]
  }): Promise<any> {
    return this.call('scanLibraries', opts)
  }

  async checkDiskSpace(targetPath?: string): Promise<any> {
    return this.call('checkDiskSpace', targetPath)
  }

  async moveGame(appId: string, sourceDir: string, targetLibPath: string): Promise<any> {
    return this.call('moveGame', appId, sourceDir, targetLibPath)
  }

  async cleanGameFolders(libraryPaths: string[]): Promise<any> {
    return this.call('cleanGameFolders', libraryPaths)
  }

  async getStorageDiagnostics(games?: { installDir: string; sizeOnDisk: number }[]): Promise<any> {
    return this.call('getStorageDiagnostics', games)
  }
}

export const storageService = new StorageService()
