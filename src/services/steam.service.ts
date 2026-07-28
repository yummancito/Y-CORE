import { BaseService } from './gateway'
import type { SteamServiceContract } from '../../electron/common/ipc-contract'

export class SteamService extends BaseService implements SteamServiceContract {
  protected serviceName = 'steam' as const

  async isRunning(): Promise<boolean> {
    return this.call('isRunning')
  }
  async restartSteam(): Promise<{ success: boolean; error?: string }> {
    return this.call('restartSteam')
  }
  async verifySteam(): Promise<{ success: boolean; error?: string }> {
    return this.call('verifySteam')
  }
  async checkVerification(): Promise<{ verified: boolean; error?: string }> {
    return this.call('checkVerification')
  }
  async closeSteam(): Promise<{ success: boolean; error?: string }> {
    return this.call('closeSteam')
  }
  async importManifest(options: { manifestPath: string }): Promise<any> {
    return this.call('importManifest', options)
  }
  async listManifestFiles(): Promise<any[]> {
    return this.call('listManifestFiles')
  }
  async deleteManifestFile(fileName: string): Promise<{ success: boolean }> {
    return this.call('deleteManifestFile', fileName)
  }
  async listLuaScripts(): Promise<any[]> {
    return this.call('listLuaScripts')
  }
  async parseLuaScript(options: { luaPath: string }): Promise<any> {
    return this.call('parseLuaScript', options)
  }
  async importLuaScript(options: { luaPath: string }): Promise<any> {
    return this.call('importLuaScript', options)
  }
  async deleteLuaScript(fileName: string): Promise<{ success: boolean }> {
    return this.call('deleteLuaScript', fileName)
  }
  async importGameFolder(options: { folderPath: string }): Promise<any> {
    return this.call('importGameFolder', options)
  }
  async retrySignatureCheck(): Promise<{ success: boolean; error?: string }> {
    return this.call('retrySignatureCheck')
  }
}

export const steamService = new SteamService()
