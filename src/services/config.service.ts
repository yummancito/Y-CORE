import { BaseService } from './gateway'
import type { ConfigServiceContract } from '../../electron/common/ipc-contract'

export class ConfigService extends BaseService implements ConfigServiceContract {
  protected serviceName = 'config' as const

  async read(): Promise<Record<string, unknown> | null> {
    return this.call('read')
  }

  async write(data: object): Promise<{ success: boolean; error?: string }> {
    return this.call('write', data)
  }

  async appReady(): Promise<void> {
    return this.call('appReady')
  }
}

export const configService = new ConfigService()
