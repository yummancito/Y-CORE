import { BaseService } from './gateway'
import type { GameServiceContract } from '../../electron/common/ipc-contract'

export class GameService extends BaseService implements GameServiceContract {
  protected serviceName = 'game' as const

  async listInstalled(): Promise<{ success: boolean; games: any[]; error?: string }> {
    return this.call('listInstalled')
  }
  async resolveOrphanNames(games: { appId: string; installDir: string }[]): Promise<{ resolved: { appId: string; newName: string }[] }> {
    return this.call('resolveOrphanNames', games)
  }
  async launchGame(appId: string): Promise<{ success: boolean; error?: string }> {
    return this.call('launchGame', appId)
  }
  async uninstallGame(appId: string): Promise<{ success: boolean; error?: string }> {
    return this.call('uninstallGame', appId)
  }
  async deleteGame(appId: string, installDir: string): Promise<{ success: boolean; error?: string }> {
    return this.call('deleteGame', appId, installDir)
  }
  async openGameLocation(appId: string, installDir: string): Promise<void> {
    return this.call('openGameLocation', appId, installDir)
  }
  async verifyGame(appId: string): Promise<{ success: boolean; error?: string }> {
    return this.call('verifyGame', appId)
  }
  async getStoreImage(appId: string, steamGridDbApiKey?: string): Promise<string | null> {
    return this.call('getStoreImage', appId, steamGridDbApiKey)
  }
  async searchGames(query: string): Promise<{ appId: string; name: string }[]> {
    return this.call('searchGames', query)
  }
  async isFreeToPlay(appId: string): Promise<boolean> {
    return this.call('isFreeToPlay', appId)
  }

  async getSteamDetails(appId: string): Promise<import('../../electron/common/ipc-contract').SteamAppDetails | null> {
    return this.call('getSteamDetails', appId)
  }
  async getSteamPath(): Promise<string | null> {
    return this.call('getSteamPath')
  }
  async openSteamFolderDialog(): Promise<string | null> {
    return this.call('openSteamFolderDialog')
  }
  async getLibraryFolders(): Promise<string[]> {
    return this.call('getLibraryFolders')
  }
}

export const gameService = new GameService()
