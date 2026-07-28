// ============================================================================
// src/services/gateway.ts
// ----------------------------------------------------------------------------
// Frontend ServiceGateway — typed wrapper around window.steamtools.gateway.
// Every frontend service imports this class instead of calling IPC directly.
// Stores call services, not the gateway — keeping the store layer clean.
//
// Inspired by: tRPC proxy pattern + Heroic's shared IPC types
// ============================================================================

import type { ServiceContracts, ServiceEvents } from '../../electron/common/ipc-contract'

// ── Gateway Definition ─────────────────────────────────────────────────────

export interface Gateway {
  call: <T = unknown>(service: string, method: string, ...args: unknown[]) => Promise<T>
  on: <T = unknown>(event: string, callback: (data: T) => void) => () => void
}

function getGateway(): Gateway | null {
  if (typeof window !== 'undefined' && (window as any).steamtools?.gateway) {
    return (window as any).steamtools.gateway as Gateway
  }
  return null
}

// ── Service Base ───────────────────────────────────────────────────────────

/**
 * Base class for all frontend services.
 * Provides typed `call` and `on` methods that delegate to the gateway.
 */
export abstract class BaseService {
  protected abstract serviceName: keyof ServiceContracts

  protected async call<T>(
    method: string,
    ...args: unknown[]
  ): Promise<T> {
    const gw = getGateway()
    if (!gw) {
      throw new Error(`Gateway not available (steamtools not initialized)`)
    }
    return gw.call<T>(this.serviceName as string, method, ...args)
  }

  protected on<E extends keyof ServiceEvents>(
    event: E,
    callback: (data: ServiceEvents[E]) => void,
  ): () => void {
    const gw = getGateway()
    if (!gw || typeof gw.on !== 'function') {
      // Return no-op cleanup
      return () => {}
    }
    return gw.on(event as string, callback as (data: unknown) => void)
  }
}

// ── Typed Event Hook Helper ────────────────────────────────────────────────

/**
 * Hook-like helper for subscribing to IPC events with auto-cleanup.
 * Returns an unsubscribe function. Call in useEffect return.
 */
export function subscribeToEvent<E extends keyof ServiceEvents>(
  event: E,
  callback: (data: ServiceEvents[E]) => void,
): () => void {
  const gw = getGateway()
  if (!gw || typeof gw.on !== 'function') {
    if (gw && typeof gw.on !== 'function') {
      // eslint-disable-next-line no-console
      console.warn(`[Gateway] gw.on is not a function (got ${typeof gw.on}) — subscribeToEvent('${event as string}') returning no-op`)
    }
    return () => {}
  }
  return gw.on(event, callback as (data: unknown) => void)
}


