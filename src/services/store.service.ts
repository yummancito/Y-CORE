import { BaseService } from './gateway'
import type { StoreServiceContract } from '../../electron/common/ipc-contract'

export class StoreService extends BaseService implements StoreServiceContract {
  protected serviceName = 'store' as const

  async installGame(game: {
    app_id: string
    name: string
    lua_content: string
    manifest_files: { depot_id: string; manifest_id: string }[]
    depot_keys: { depot_id: string; key: string }[]
  }): Promise<{ success: boolean; error?: string; actions?: string[] }> {
    return this.call('installGame', game)
  }

  async getLocalGameData(appId: string): Promise<{ success: boolean; data?: any; error?: string }> {
    return this.call('getLocalGameData', appId)
  }

  async getLocalAppIds(): Promise<string[]> {
    return this.call('getLocalAppIds')
  }

  async fetchAppDetails(appId: string, cc?: string, lang?: string): Promise<any> {
    return this.call('fetchAppDetails', appId, cc, lang)
  }

  async checkAppTypes(appIds: string[]): Promise<Record<string, string>> {
    return this.call('checkAppTypes', appIds)
  }

  async downloadDepot(options: {
    appId: number
    depotId: number
    manifestId: string | number
    installDir: string
    cellId?: number
  }): Promise<any> {
    return this.call('downloadDepot', options)
  }
}

export const storeService = new StoreService()
