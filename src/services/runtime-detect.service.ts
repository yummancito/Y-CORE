import { BaseService } from './gateway'
import type { RuntimeDetectServiceContract } from '../../electron/common/ipc-contract'

export class RuntimeDetectService extends BaseService implements RuntimeDetectServiceContract {
  protected serviceName = 'runtimeDetect' as const

  async detectAll(): Promise<{ runtimes: any[]; directX: string }> {
    return this.call('detectAll')
  }
  async detectRuntime(type: string): Promise<any> {
    return this.call('detectRuntime', type)
  }
  async checkRequirements(): Promise<{ met: boolean; checks: any[]; missing: any[] }> {
    return this.call('checkRequirements')
  }
  async installRuntime(type: string): Promise<{ success: boolean; message: string }> {
    return this.call('installRuntime', type)
  }
  async detectDirectX(): Promise<string> {
    return this.call('detectDirectX')
  }
}

export const runtimeDetectService = new RuntimeDetectService()
