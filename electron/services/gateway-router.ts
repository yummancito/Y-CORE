// ============================================================================
// electron/services/gateway-router.ts
// ----------------------------------------------------------------------------
// GatewayRouter — single ipcMain.handle('gateway:call') that routes to the
// ServiceRegistry through the MiddlewareChain.
//
// Instead of 88+ ipcMain.handle() calls in main.ts, this ONE handler serves
// all service calls. Services register themselves, and the router dispatches.
// ============================================================================

import { ipcMain } from 'electron'
import { getServiceRegistry } from './registry'
import { getMiddlewareChain } from './middleware'
import { logger } from '../logger'

export interface GatewayRequest {
  service: string
  method: string
  args: unknown[]
}

/**
 * Register the single 'gateway:call' IPC handler.
 * Call once from main.ts after all services are registered.
 */
export function registerGatewayRouter(): void {
  ipcMain.handle('gateway:call', async (_event, req: GatewayRequest) => {
    const { service, method, args } = req

    if (!service || !method) {
      logger.warn(
        `[Gateway] Invalid request: missing service or method (service=${service}, method=${method})`,
        'services',
      )
      throw new Error('Invalid gateway request: service and method are required')
    }

    const registry = getServiceRegistry()
    const chain = getMiddlewareChain()
    const safeArgs = Array.isArray(args) ? args : []
    const ctx = {
      service,
      method,
      args: safeArgs,
      startTime: Date.now(),
    }

    return chain.execute(ctx, async () => {
      return registry.call(service, method, safeArgs)
    })
  })

  logger.info('[Gateway] GatewayRouter registered (single IPC handler)', 'services')
}
