// ============================================================================
// electron/services/registry.ts
// ----------------------------------------------------------------------------
// ServiceRegistry — maps service names to handler objects.
// Inspired by SteamKit2's handler pattern: handlers register with a central
// dispatcher, and the dispatcher routes incoming calls to the right handler.
// ============================================================================

import { logger } from '../logger'

export type ServiceHandler = Record<string, (...args: any[]) => any>

export class ServiceRegistry {
  private services = new Map<string, ServiceHandler>()
  private serviceVersions = new Map<string, number>()

  /**
   * Register a service with its handler methods.
   * ERROR #5 FIX: Track service versions to detect stale references
   * @param name - Service name (must match the contract key)
   * @param handler - Object whose methods are the service's handlers
   */
  register(name: string, handler: ServiceHandler): number {
    const currentVersion = (this.serviceVersions.get(name) ?? 0) + 1
    this.serviceVersions.set(name, currentVersion)
    if (this.services.has(name)) {
      logger.warn(`[ServiceRegistry] Overwriting existing service: ${name} (v${this.serviceVersions.get(name) ?? 0} → v${currentVersion})`, 'services')
    }
    this.services.set(name, handler)
    logger.info(`[ServiceRegistry] Registered service: ${name} (v${currentVersion}, ${Object.keys(handler).length} methods)`, 'services')
    return currentVersion
  }

  /**
   * Call a method on a registered service.
   * @param serviceName - Registered service name
   * @param methodName - Method name on the handler object
   * @param args - Arguments to pass to the method
   * @returns The return value of the method
   */
  async call(serviceName: string, methodName: string, args: unknown[]): Promise<unknown> {
    console.log('[STARTUP] [SR] serviceRegistry.call(' + serviceName + '.' + methodName + ')')
    const service = this.services.get(serviceName)
    if (!service) {
      throw new Error(`Service not found: ${serviceName}`)
    }

    const method = service[methodName] as ((...args: any[]) => any) | undefined
    if (!method || typeof method !== 'function') {
      throw new Error(`Method not found: ${serviceName}.${methodName}`)
    }

    const result = method(...args)
    console.log('[STARTUP] [SR] serviceRegistry.call(' + serviceName + '.' + methodName + ') returning')
    return result
  }

  /**
   * Check if a service + method is registered.
   */
  has(serviceName: string, methodName?: string): boolean {
    const service = this.services.get(serviceName)
    if (!service) return false
    if (methodName) return typeof service[methodName] === 'function'
    return true
  }

  /**
   * Get a list of all registered services and their methods.
   */
  listServices(): { name: string; methods: string[] }[] {
    const result: { name: string; methods: string[] }[] = []
    for (const [name, handler] of this.services) {
      result.push({
        name,
        methods: Object.keys(handler).filter((k) => typeof handler[k] === 'function'),
      })
    }
    return result
  }

  /**
   * Remove a registered service (for testing / cleanup).
   * ERROR #5 FIX: Also remove version tracking
   */
  unregister(name: string): void {
    this.services.delete(name)
    this.serviceVersions.delete(name)
    logger.info(`[ServiceRegistry] Unregistered service: ${name}`, 'services')
  }

  /**
   * Get the current version of a service (ERROR #5 FIX)
   */
  getVersion(serviceName: string): number {
    return this.serviceVersions.get(serviceName) ?? 0
  }

  /**
   * Check if a service is available and ready (ERROR #3 FIX for database dependency)
   */
  isReady(serviceName: string): boolean {
    return this.services.has(serviceName)
  }
}

// ── Singleton ──────────────────────────────────────────────────────────────

let _instance: ServiceRegistry | null = null

export function getServiceRegistry(): ServiceRegistry {
  if (!_instance) {
    _instance = new ServiceRegistry()
  }
  return _instance
}
