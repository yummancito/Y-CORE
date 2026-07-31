// ============================================================================
// electron/handlers/online.handler.ts
// ============================================================================
// Online Fix Integration & Recovery IPC Handlers
// Registers IPC handlers for game launch prep, exit cleanup, and recovery.
// ============================================================================

import { logger } from '../logger'
import { registerGameLaunchIntegrationHandlers } from '../modules/game-launch-integration'
import { registerOnlineRecoveryHandlers } from '../modules/online-recovery'

/**
 * Register all Online Fix-related IPC handlers.
 * This should be called during main process initialization.
 */
export function registerOnlineHandlers(): void {
  logger.info('Registering Online Fix handlers', 'online-ipc')

  // Register game launch integration handlers
  registerGameLaunchIntegrationHandlers()

  // Register online recovery handlers
  registerOnlineRecoveryHandlers()

  logger.info('Online Fix handlers registered successfully', 'online-ipc')
}
