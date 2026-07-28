import { BaseService } from './gateway'
import type { UpdateServiceContract } from '../../electron/common/ipc-contract'

export class UpdateService extends BaseService implements UpdateServiceContract {
  protected serviceName = 'update' as const

  async installUpdate(): Promise<void> {
    return this.call('installUpdate')
  }
  async getNativeDiagnostics(): Promise<any> {
    return this.call('getNativeDiagnostics')
  }
  async manualDownloadUpdate(url: string): Promise<{ path: string }> {
    return this.call('manualDownloadUpdate', url)
  }
  async runManualInstaller(installerPath: string): Promise<void> {
    return this.call('runManualInstaller', installerPath)
  }
}

export const updateService = new UpdateService()
