import { BaseService } from './gateway'
import type { LogServiceContract } from '../../electron/common/ipc-contract'
import type { LogEntry, LogConfig } from '../domain/types'

export class LogService extends BaseService implements LogServiceContract {
  protected serviceName = 'log' as const

  async getEntries(filter?: { level?: string; search?: string; limit?: number; source?: string }): Promise<LogEntry[]> {
    return this.call('getEntries', filter)
  }
  async add(entry: { level?: string; message: string }): Promise<{ success: boolean }> {
    return this.call('add', entry)
  }
  async clear(): Promise<{ success: boolean }> {
    return this.call('clear')
  }
  async export(): Promise<{ success: boolean; error?: string; path?: string }> {
    return this.call('export')
  }
  async getConfig(): Promise<LogConfig> {
    return this.call('getConfig')
  }
  async setConfig(partial: Partial<LogConfig>): Promise<{ success: boolean }> {
    return this.call('setConfig', partial)
  }
}

export const logService = new LogService()
