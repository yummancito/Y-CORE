// ============================================================================
// electron/modules/game-helpers.ts
// ----------------------------------------------------------------------------
// Game helpers — provides lazy access to the game service for cloud signaling.
// Avoids circular dependencies by using lazy import resolution.
// Caches the service after the first successful import.
// ============================================================================

import type { GameServiceContract } from '../common/ipc-contract'

// Cache the game service after first import to avoid repeated dynamic imports
let cachedService: {
  listInstalled: GameServiceContract['listInstalled']
  launchGame: GameServiceContract['launchGame']
} | null = null

/**
 * Returns the game service instance for cloud signaling handlers.
 * Uses lazy import to avoid circular dependencies, caches after first call.
 */
export async function getGameService(): Promise<{
  listInstalled: GameServiceContract['listInstalled']
  launchGame: GameServiceContract['launchGame']
}> {
  if (cachedService) return cachedService

  const { gameService } = await import('../services/game.service')
  cachedService = {
    listInstalled: () => gameService.listInstalled(),
    launchGame: (appId: string) => gameService.launchGame(appId),
  }
  return cachedService
}

/**
 * Format game list for cloud response (lightweight, no full objects).
 */
export function formatGameForCloud(game: any): {
  appId: string
  name: string
  installDir: string
  sizeOnDisk: number
  lastPlayed: number | null
  playTime: number
  headerImage: string | null
  isInstalled: boolean
} {
  return {
    appId: game.appId || game.app_id || '',
    name: game.name || 'Unknown',
    installDir: game.installDir || '',
    sizeOnDisk: game.sizeOnDisk || 0,
    lastPlayed: game.lastPlayed || null,
    playTime: game.playTime || 0,
    headerImage: game.headerImage || game.header_image_url || null,
    isInstalled: true,
  }
}
