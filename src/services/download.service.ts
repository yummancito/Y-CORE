import { BaseService } from './gateway'
import type { DownloadServiceContract } from '../../electron/common/ipc-contract'

export class DownloadService extends BaseService implements DownloadServiceContract {
  protected serviceName = 'download' as const

  async createTask(opts: any): Promise<{ success: boolean; task?: any; error?: string }> {
    return this.call('createTask', opts)
  }

  async getTask(taskId: string): Promise<{ success: boolean; task?: any; error?: string }> {
    return this.call('getTask', taskId)
  }
  async startTask(taskId: string): Promise<{ success: boolean; error?: string }> {
    return this.call('startTask', taskId)
  }
  async pauseTask(taskId: string): Promise<{ success: boolean; error?: string }> {
    return this.call('pauseTask', taskId)
  }
  async cancelTask(taskId: string): Promise<{ success: boolean; error?: string }> {
    return this.call('cancelTask', taskId)
  }
  async getTasks(): Promise<{ success: boolean; tasks: any[]; queue: any[]; error?: string }> {
    return this.call('getTasks')
  }
  async getHistory(): Promise<{ success: boolean; history: any[]; error?: string }> {
    return this.call('getHistory')
  }
  async getStatus(): Promise<{ success: boolean; status?: any; error?: string }> {
    return this.call('getStatus')
  }
  async setPriority(taskId: string, priority: number): Promise<{ success: boolean; error?: string }> {
    return this.call('setPriority', taskId, priority)
  }
  async reorderTask(taskId: string, newIndex: number): Promise<{ success: boolean; error?: string }> {
    return this.call('reorderTask', taskId, newIndex)
  }
  async setPaused(paused: boolean): Promise<{ success: boolean }> {
    return this.call('setPaused', paused)
  }
  async clearCompleted(): Promise<{ success: boolean }> {
    return this.call('clearCompleted')
  }
  async clearHistory(): Promise<{ success: boolean }> {
    return this.call('clearHistory')
  }
  async startFromApi(opts: any): Promise<{ success: boolean; tasks: any[]; error?: string }> {
    return this.call('startFromApi', opts)
  }

  async integrityCheck(appId: string, installDir: string): Promise<{ success: boolean; result?: any; error?: string }> {
    return this.call('integrityCheck', appId, installDir)
  }
  async repairFiles(appId: string, installDir: string, corruptedPaths: string[], missingPaths: string[]): Promise<{ success: boolean; result?: any; error?: string }> {
    return this.call('repairFiles', appId, installDir, corruptedPaths, missingPaths)
  }
  async diskPreallocate(filePath: string, size: number): Promise<{ success: boolean; error?: string }> {
    return this.call('diskPreallocate', filePath, size)
  }
  async checkDiskSpace(dirPath: string, requiredBytes: number): Promise<{ success: boolean; available?: number; message?: string; error?: string }> {
    return this.call('checkDiskSpace', dirPath, requiredBytes)
  }
  async getCacheStats(): Promise<{ success: boolean; stats?: any; error?: string }> {
    return this.call('getCacheStats')
  }
  async clearCache(): Promise<{ success: boolean; error?: string }> {
    return this.call('clearCache')
  }
}

export const downloadService = new DownloadService()
