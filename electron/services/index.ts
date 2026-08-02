// ============================================================================
// electron/services/index.ts
// ----------------------------------------------------------------------------
// Barrel export for all backend services.
// ============================================================================

export { configService } from './config.service'
export { authService } from './auth.service'
export { gameService } from './game.service'
export { storeService } from './store.service'
export { downloadService } from './download.service'
export { logService } from './log.service'
export { steamService } from './steam.service'
export { updateService } from './update.service'
export { onlinefixService } from './onlinefix.service'
export { drmService } from './drm.service'
export { runtimeDetectorService } from './runtime-detector.service'
export { launchProfilesService } from './launch-profiles.service'
export { saveManagerService } from './save-manager.service'
export { gameProcessService } from './game-process.service'

export { registerGatewayRouter } from './gateway-router'
export { getServiceRegistry, ServiceRegistry } from './registry'
export { getMiddlewareChain, MiddlewareChain } from './middleware'
export type { CallContext, MiddlewareFn } from './middleware'
