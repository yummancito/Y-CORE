// ============================================================================
// src/services/__mocks__/gateway.ts
// ----------------------------------------------------------------------------
// Mock gateway for unit-testing services without Electron IPC.
// Overrides the real gateway with a controlled mock.
//
// Usage:
//   import { createMockGateway } from '../__mocks__/gateway'
//   import { setTestGateway, clearTestGateway } from '../gateway'
//
//   const gw = createMockGateway()
//   gw.mock('config', 'read', { theme: 'dark' })
//   setTestGateway(gw)
//
//   const result = await configService.read()
//   expect(result).toEqual({ theme: 'dark' })
// ============================================================================

import type { Gateway } from '../gateway'

type MockHandler = (...args: unknown[]) => unknown | Promise<unknown>

export interface MockGateway extends Gateway {
  /** Register a return value for a service method call. */
  mock(service: string, method: string, result: unknown): void
  /** Get all calls made to the gateway. */
  getCalls(): { service: string; method: string; args: unknown[] }[]
  /** Get all events that were listened to. */
  getListeners(): Record<string, number>
  /** Reset all mocks, calls, and listeners. */
  clear(): void
}

/**
 * Creates a mock Gateway for testing services.
 */
export function createMockGateway(): MockGateway {
  const mocks = new Map<string, MockHandler>()
  const calls: { service: string; method: string; args: unknown[] }[] = []
  const listeners: Record<string, ((data: unknown) => void)[]> = {}

  const key = (service: string, method: string) => `${service}:${method}`

  const gw: Gateway = {
    call: async <T>(service: string, method: string, ...args: unknown[]): Promise<T> => {
      calls.push({ service, method, args })
      const handler = mocks.get(key(service, method))
      if (handler) {
        return handler(...args) as Promise<T>
      }
      throw new Error(`Unmocked call: ${service}.${method}(${JSON.stringify(args)})`)
    },

    on: <T>(event: string, callback: (data: T) => void) => {
      if (!listeners[event]) listeners[event] = []
      listeners[event].push(callback as (data: unknown) => void)
      return () => {
        if (listeners[event]) {
          listeners[event] = listeners[event].filter((cb) => cb !== callback)
        }
      }
    },
  }

  return {
    ...gw,

    mock(service: string, method: string, result: unknown): void {
      mocks.set(
        key(service, method),
        typeof result === 'function'
          ? (result as MockHandler)
          : async () => result,
      )
    },

    getCalls() {
      return [...calls]
    },

    getListeners(): Record<string, number> {
      const result: Record<string, number> = {}
      for (const ev of Object.keys(listeners)) {
        result[ev] = listeners[ev].length
      }
      return result
    },

    clear(): void {
      calls.length = 0
      for (const ev of Object.keys(listeners)) {
        delete listeners[ev]
      }
      mocks.clear()
    },
  }
}

/**
 * Attaches a mock gateway to `window.steamtools.gateway` for test environments.
 * Services using `getGateway()` will pick it up automatically in jsdom.
 */
export function attachMockGateway(gw: MockGateway): void {
  if (typeof window !== 'undefined') {
    ;(window as any).steamtools = {
      ...((window as any).steamtools || {}),
      gateway: gw,
    }
  }
}

/**
 * Removes the mock gateway from window and restores clean state.
 */
export function detachMockGateway(): void {
  if (typeof window !== 'undefined' && (window as any).steamtools) {
    delete (window as any).steamtools.gateway
  }
}
