import { BaseService } from './gateway'
import type { LaunchProfileServiceContract } from '../../electron/common/ipc-contract'

export class LaunchProfileService extends BaseService implements LaunchProfileServiceContract {
  protected serviceName = 'launchProfiles' as const

  async listProfiles(gameId: string): Promise<any[]> {
    return this.call('listProfiles', gameId)
  }
  async getDefaultProfile(gameId: string): Promise<any> {
    return this.call('getDefaultProfile', gameId)
  }
  async getProfile(gameId: string, profileName: string): Promise<any | null> {
    return this.call('getProfile', gameId, profileName)
  }
  async createProfile(gameId: string, profile: any): Promise<any> {
    return this.call('createProfile', gameId, profile)
  }
  async updateProfile(gameId: string, profileName: string, updates: any): Promise<any | null> {
    return this.call('updateProfile', gameId, profileName, updates)
  }
  async deleteProfile(gameId: string, profileName: string): Promise<boolean> {
    return this.call('deleteProfile', gameId, profileName)
  }
  async setDefaultProfile(gameId: string, profileName: string): Promise<boolean> {
    return this.call('setDefaultProfile', gameId, profileName)
  }
  async createDefaultProfile(): Promise<any> {
    return this.call('createDefaultProfile')
  }
  async findCompatLayerPath(config: any): Promise<string | null> {
    return this.call('findCompatLayerPath', config)
  }
}

export const launchProfileService = new LaunchProfileService()
