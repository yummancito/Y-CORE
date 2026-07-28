import { BaseService } from './gateway'
import type { GameProcessServiceContract } from '../../electron/common/ipc-contract'

export class GameProcessService extends BaseService implements GameProcessServiceContract {
  protected serviceName = 'gameProcess' as const

  async launchGame(appId: string, executablePath: string, launchCommand: string, env: any): Promise<any> {
    return this.call('launchGame', appId, executablePath, launchCommand, env)
  }
  async getStatus(appId: string): Promise<any> {
    return this.call('getStatus', appId)
  }
  async killGame(appId: string, timeoutMs?: number): Promise<boolean> {
    return this.call('killGame', appId, timeoutMs)
  }
  async listRunning(): Promise<any[]> {
    return this.call('listRunning')
  }
  async getPlayTime(appId: string): Promise<any> {
    return this.call('getPlayTime', appId)
  }
  async formatPlayTime(totalSeconds: number): Promise<string> {
    return this.call('formatPlayTime', totalSeconds)
  }
  async syncPendingSessions(): Promise<{ success: boolean }> {
    return this.call('syncPendingSessions')
  }
}

export const gameProcessService = new GameProcessService()
