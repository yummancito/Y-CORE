// ============================================================================
// src/services/__tests__/gateway.test.ts
// ----------------------------------------------------------------------------
// Tests for the Service Gateway + mock infrastructure.
// ============================================================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createMockGateway, attachMockGateway, detachMockGateway } from '../__mocks__/gateway'

describe('MockGateway', () => {
  let gw: ReturnType<typeof createMockGateway>

  beforeEach(() => {
    gw = createMockGateway()
  })

  it('throws on unmocked call', async () => {
    await expect(gw.call('config', 'read')).rejects.toThrow('Unmocked call')
  })

  it('returns mocked value', async () => {
    gw.mock('config', 'read', { theme: 'dark', language: 'es' })
    const result = await gw.call('config', 'read')
    expect(result).toEqual({ theme: 'dark', language: 'es' })
  })

  it('tracks calls', async () => {
    gw.mock('config', 'read', null)
    gw.mock('auth', 'isAuthenticated', true)

    await gw.call('config', 'read')
    await gw.call('auth', 'isAuthenticated')

    const calls = gw.getCalls()
    expect(calls).toHaveLength(2)
    expect(calls[0]).toEqual({ service: 'config', method: 'read', args: [] })
    expect(calls[1]).toEqual({ service: 'auth', method: 'isAuthenticated', args: [] })
  })

  it('supports event listeners', () => {
    const handler1 = () => {}
    const handler2 = () => {}

    const unsub1 = gw.on('steam:error', handler1)
    const unsub2 = gw.on('download:progress', handler2)

    expect(gw.getListeners()['steam:error']).toBe(1)
    expect(gw.getListeners()['download:progress']).toBe(1)

    unsub1()
    expect(gw.getListeners()['steam:error']).toBe(0)
  })

  it('clears everything on clear()', async () => {
    gw.mock('config', 'read', {})
    gw.on('steam:error', () => {})

    await gw.call('config', 'read')
    gw.clear()

    expect(gw.getCalls()).toHaveLength(0)
    expect(Object.keys(gw.getListeners())).toHaveLength(0)
    await expect(gw.call('config', 'read')).rejects.toThrow('Unmocked call')
  })

  it('supports async mock handlers', async () => {
    gw.mock('game', 'listInstalled', async () => ({
      success: true,
      games: [{ appId: '123', name: 'Test Game' }],
    }))

    const result = await gw.call<{ success: boolean; games: any[] }>('game', 'listInstalled')
    expect(result.success).toBe(true)
    expect(result.games).toHaveLength(1)
  })
})

describe('attachMockGateway', () => {
  beforeEach(() => {
    detachMockGateway()
  })

  afterEach(() => {
    detachMockGateway()
  })

  it('attaches to window.steamtools.gateway', () => {
    const gw = createMockGateway()
    attachMockGateway(gw)

    expect(window.steamtools?.gateway).toBeDefined()
    expect(window.steamtools.gateway).toBe(gw)
  })

  it('detaches cleanly', () => {
    const gw = createMockGateway()
    attachMockGateway(gw)
    detachMockGateway()

    expect(window.steamtools?.gateway).toBeUndefined()
  })
})
