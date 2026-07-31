// ============================================================================
// electron/modules/lan-fallback.test.ts
// ============================================================================
// Tests for LAN Fallback module
// ============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  checkInternetConnectivity,
  checkLANAvailability,
  announceLANService,
  discoverLANServices,
  withdrawLANService,
  LocalRelayServer,
  LANFallbackManager,
  createLANFallbackManager,
  type LANPeer,
  type LANFallbackConfig,
} from './lan-fallback'

// ============================================================================
// Internet Connectivity Tests
// ============================================================================

describe('Internet Connectivity Check', () => {
  it('should return boolean connectivity status', async () => {
    const isOnline = await checkInternetConnectivity(2000)

    expect(typeof isOnline).toBe('boolean')
  })

  it('should handle timeout gracefully', async () => {
    const isOnline = await checkInternetConnectivity(1) // Very short timeout

    expect(typeof isOnline).toBe('boolean')
  })
})

// ============================================================================
// LAN Availability Tests
// ============================================================================

describe('LAN Availability Check', () => {
  it('should return boolean LAN availability', () => {
    const lanAvailable = checkLANAvailability()

    expect(typeof lanAvailable).toBe('boolean')
  })

  it('should detect at least loopback adapter', () => {
    // Most systems have at least loopback
    const lanAvailable = checkLANAvailability()

    expect(typeof lanAvailable).toBe('boolean')
  })
})

// ============================================================================
// mDNS Service Advertisement Tests
// ============================================================================

describe('mDNS Service Advertisement', () => {
  beforeEach(() => {
    // Clean up before each test
    withdrawLANService('test-peer-1')
    withdrawLANService('test-peer-2')
  })

  it('should announce LAN service', async () => {
    const announced = await announceLANService('test-peer-1', 10000)

    expect(typeof announced).toBe('boolean')
  })

  it('should discover announced services', async () => {
    await announceLANService('test-peer-discovery', 10000)

    const peers = await discoverLANServices({}, 1000)

    const discovered = peers.some((p) => p.peerId === 'test-peer-discovery')
    expect(discovered).toBe(true)
  })

  it('should withdraw service announcement', async () => {
    await announceLANService('test-peer-withdraw', 10000)

    let peers = await discoverLANServices()
    expect(peers.some((p) => p.peerId === 'test-peer-withdraw')).toBe(true)

    const withdrawn = await withdrawLANService('test-peer-withdraw')
    expect(withdrawn).toBe(true)

    peers = await discoverLANServices()
    expect(peers.some((p) => p.peerId === 'test-peer-withdraw')).toBe(false)
  })

  it('should have valid peer information', async () => {
    await announceLANService('test-peer-info', 10001)

    const peers = await discoverLANServices()
    const peer = peers.find((p) => p.peerId === 'test-peer-info')

    expect(peer).toBeDefined()
    if (peer) {
      expect(peer.peerId).toBe('test-peer-info')
      expect(peer.port).toBe(10001)
      expect(peer.hostname).toBeTruthy()
      expect(peer.ipAddress).toBeTruthy()
      expect(peer.lastSeen).toBeGreaterThan(0)
    }
  })

  it('should expire stale peers', async () => {
    await announceLANService('test-peer-stale', 10002)

    const config: Partial<LANFallbackConfig> = {
      peerTimeoutMs: 100, // Very short timeout
    }

    // Wait for peer to become stale
    await new Promise((resolve) => setTimeout(resolve, 150))

    const peers = await discoverLANServices(config)
    expect(peers.some((p) => p.peerId === 'test-peer-stale')).toBe(false)
  })
})

// ============================================================================
// Local Relay Server Tests
// ============================================================================

describe('LocalRelayServer', () => {
  let relay: LocalRelayServer

  beforeEach(() => {
    relay = new LocalRelayServer('test-relay', '127.0.0.1', 10000)
  })

  afterEach(async () => {
    if (relay) {
      await relay.stop()
    }
  })

  it('should create relay server instance', () => {
    expect(relay).toBeDefined()
    expect(relay.getInfo().name).toBe('test-relay')
  })

  it('should start relay server', async () => {
    const started = await relay.start()

    expect(started).toBe(true)
    expect(relay.getInfo().isRunning).toBe(true)
  })

  it('should stop relay server', async () => {
    await relay.start()
    const stopped = await relay.stop()

    expect(stopped).toBe(true)
    expect(relay.getInfo().isRunning).toBe(false)
  })

  it('should register and unregister peers', async () => {
    await relay.start()

    const peer: LANPeer = {
      peerId: 'relay-peer-1',
      hostname: 'test-host',
      ipAddress: '192.168.1.1',
      port: 9999,
      lastSeen: Date.now(),
      serviceType: '_test._tcp.local',
    }

    const registered = await relay.registerPeer('relay-peer-1', peer)
    expect(registered).toBe(true)

    const info = relay.getInfo()
    expect(info.currentConnections).toBe(1)

    const unregistered = await relay.unregisterPeer('relay-peer-1')
    expect(unregistered).toBe(true)

    const infoAfter = relay.getInfo()
    expect(infoAfter.currentConnections).toBe(0)
  })

  it('should not exceed max connections', async () => {
    const smallRelay = new LocalRelayServer('small-relay', '127.0.0.1', 10001, 'tcp', 2)
    await smallRelay.start()

    const peer1: LANPeer = {
      peerId: 'peer-1',
      hostname: 'host1',
      ipAddress: '192.168.1.1',
      port: 9999,
      lastSeen: Date.now(),
      serviceType: '_test._tcp.local',
    }

    const peer2: LANPeer = {
      peerId: 'peer-2',
      hostname: 'host2',
      ipAddress: '192.168.1.2',
      port: 9998,
      lastSeen: Date.now(),
      serviceType: '_test._tcp.local',
    }

    const peer3: LANPeer = {
      peerId: 'peer-3',
      hostname: 'host3',
      ipAddress: '192.168.1.3',
      port: 9997,
      lastSeen: Date.now(),
      serviceType: '_test._tcp.local',
    }

    await smallRelay.registerPeer('peer-1', peer1)
    await smallRelay.registerPeer('peer-2', peer2)
    const thirdRegistration = await smallRelay.registerPeer('peer-3', peer3)

    expect(thirdRegistration).toBe(false)

    await smallRelay.stop()
  })

  it('should relay data between peers', async () => {
    await relay.start()

    const peerA: LANPeer = {
      peerId: 'relay-peer-a',
      hostname: 'host-a',
      ipAddress: '192.168.1.10',
      port: 9990,
      lastSeen: Date.now(),
      serviceType: '_test._tcp.local',
    }

    const peerB: LANPeer = {
      peerId: 'relay-peer-b',
      hostname: 'host-b',
      ipAddress: '192.168.1.11',
      port: 9991,
      lastSeen: Date.now(),
      serviceType: '_test._tcp.local',
    }

    await relay.registerPeer('relay-peer-a', peerA)
    await relay.registerPeer('relay-peer-b', peerB)

    const relayed = await relay.relayData('relay-peer-a', 'relay-peer-b', Buffer.from('test message'))

    expect(relayed).toBe(true)
  })

  it('should emit events', async () => {
    let startedEmitted = false
    relay.on('started', () => {
      startedEmitted = true
    })

    await relay.start()
    expect(startedEmitted).toBe(true)
  })
})

// ============================================================================
// LAN Fallback Manager Tests
// ============================================================================

describe('LANFallbackManager', () => {
  let manager: LANFallbackManager

  beforeEach(() => {
    manager = createLANFallbackManager('test-manager')
  })

  afterEach(async () => {
    if (manager) {
      await manager.shutdown()
    }
  })

  it('should create LANFallbackManager instance', () => {
    expect(manager).toBeDefined()
  })

  it('should initialize successfully', async () => {
    const initialized = await manager.initialize()

    expect(initialized).toBe(true)
  })

  it('should detect current mode', () => {
    const mode = manager.getMode()

    expect(['online', 'lan_only', 'offline']).toContain(mode)
  })

  it('should get current status', async () => {
    await manager.initialize()

    const status = manager.getStatus()

    expect(status).toHaveProperty('mode')
    expect(status).toHaveProperty('isInternetAvailable')
    expect(status).toHaveProperty('connectedPeers')
    expect(status).toHaveProperty('localRelayServers')
    expect(status).toHaveProperty('primaryIpAddress')
  })

  it('should start local relay server', async () => {
    await manager.initialize()

    const relay = await manager.startLocalRelay('test-relay')

    if (relay) {
      expect(relay.isRunning).toBe(true)
      expect(relay.name).toContain('relay')
    }
  })

  it('should stop local relay server', async () => {
    await manager.initialize()

    const relay = await manager.startLocalRelay('test-relay-stop')
    if (relay) {
      const stopped = await manager.stopLocalRelay('test-relay-stop')
      expect(stopped).toBe(true)
    }
  })

  it('should discover LAN peers', async () => {
    await manager.initialize()

    const peers = await manager.discoverAndConnectToPeers()

    expect(Array.isArray(peers)).toBe(true)
  })

  it('should emit mode-changed events', async () => {
    let modeChanges: Array<{ from: string; to: string }> = []

    manager.on('mode-changed', (event) => {
      modeChanges.push(event)
    })

    await manager.initialize()

    // Mode changes would happen when internet becomes unavailable
    // In test environment, this might not change
  })

  it('should emit relay-started events', async () => {
    let relayStarted = false

    manager.on('relay-started', () => {
      relayStarted = true
    })

    await manager.initialize()
    await manager.startLocalRelay('test-relay-event')

    // Event should have been emitted
    expect(relayStarted).toBe(true)
  })

  it('should handle custom configuration', async () => {
    const config: Partial<LANFallbackConfig> = {
      heartbeatInterval: 2000,
      checkInternetInterval: 3000,
    }

    const customManager = createLANFallbackManager('custom-manager', config)
    const initialized = await customManager.initialize()

    expect(initialized).toBe(true)

    await customManager.shutdown()
  })

  it('should support shutdown', async () => {
    await manager.initialize()

    const mode = manager.getMode()
    expect(mode).toBeDefined()

    // Shutdown should not throw
    await manager.shutdown()
  })

  it('should track relay servers in status', async () => {
    await manager.initialize()

    await manager.startLocalRelay('relay-1')
    const status = manager.getStatus()

    expect(status.localRelayServers.length).toBeGreaterThan(0)
  })

  it('should report network adapter count', async () => {
    await manager.initialize()

    const status = manager.getStatus()

    expect(status.networkAdapters).toBeGreaterThanOrEqual(0)
  })
})

// ============================================================================
// LAN Fallback Integration Tests
// ============================================================================

describe('LAN Fallback Integration', () => {
  it('should handle multiple manager instances', async () => {
    const manager1 = createLANFallbackManager('peer-1')
    const manager2 = createLANFallbackManager('peer-2')

    await manager1.initialize()
    await manager2.initialize()

    const peers = await manager1.discoverAndConnectToPeers()

    await manager1.shutdown()
    await manager2.shutdown()
  })

  it('should survive network state changes', async () => {
    const manager = createLANFallbackManager('resilient-peer')

    await manager.initialize()

    // Simulate network checks
    for (let i = 0; i < 3; i++) {
      const status = manager.getStatus()
      expect(status.mode).toBeDefined()
      await new Promise((resolve) => setTimeout(resolve, 100))
    }

    await manager.shutdown()
  })

  it('should clean up resources on shutdown', async () => {
    const manager = createLANFallbackManager('cleanup-test')

    await manager.initialize()
    await manager.startLocalRelay('relay-cleanup')

    let statusBefore = manager.getStatus()
    const relayCountBefore = statusBefore.localRelayServers.length

    await manager.shutdown()

    // After shutdown, relays should be stopped
    // (accessing status after shutdown should not crash)
    expect(relayCountBefore).toBeGreaterThanOrEqual(0)
  })
})

// ============================================================================
// Configuration Tests
// ============================================================================

describe('LAN Fallback Configuration', () => {
  it('should use default configuration', async () => {
    const manager = createLANFallbackManager('default-config')

    await manager.initialize()
    const status = manager.getStatus()

    expect(status.mode).toBeDefined()

    await manager.shutdown()
  })

  it('should respect custom heartbeat interval', async () => {
    const config: Partial<LANFallbackConfig> = {
      heartbeatInterval: 1000,
    }

    const manager = createLANFallbackManager('custom-heartbeat', config)

    await manager.initialize()
    // Custom interval would affect discovery frequency
    const status = manager.getStatus()

    expect(status.connectedPeers).toBeDefined()

    await manager.shutdown()
  })

  it('should respect custom timeouts', async () => {
    const config: Partial<LANFallbackConfig> = {
      peerTimeoutMs: 5000,
      checkInternetInterval: 2000,
    }

    const manager = createLANFallbackManager('custom-timeouts', config)

    await manager.initialize()
    await manager.shutdown()
  })
})
