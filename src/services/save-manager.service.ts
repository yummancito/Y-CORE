import { BaseService } from './gateway'
import type { SaveManagerServiceContract } from '../../electron/common/ipc-contract'

export class SaveManagerService extends BaseService implements SaveManagerServiceContract {
  protected serviceName = 'saveManager' as const

  async detectSaves(appId: string, gameName: string): Promise<any> {
    return this.call('detectSaves', appId, gameName)
  }
  async detectSavesWithFallback(appId: string, gameName: string, installDir?: string): Promise<any> {
    return this.call('detectSavesWithFallback', appId, gameName, installDir)
  }
  async createBackup(appId: string, saves: any[], name?: string): Promise<any> {
    return this.call('createBackup', appId, saves, name)
  }
  async restoreBackup(backup: any): Promise<any> {
    return this.call('restoreBackup', backup)
  }
  async listBackups(appId: string): Promise<any[]> {
    return this.call('listBackups', appId)
  }
  async deleteBackup(backup: any): Promise<boolean> {
    return this.call('deleteBackup', backup)
  }
}

export const saveManagerService = new SaveManagerService()
