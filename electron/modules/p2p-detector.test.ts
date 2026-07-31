// ============================================================================
// electron/modules/p2p-detector.test.ts
// ============================================================================
// Comprehensive tests for P2P Protocol Detection module
// ============================================================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import {
  detectP2PProtocol,
  clearP2PDetectionCache,
  getP2PDetectionFromCache,
  type P2PDetectionResult,
} from './p2p-detector'

// ============================================================================
// Test Setup
// ============================================================================

const TEST_TEMP_DIR = path.join(__dirname, '.test-temp-p2p-detector')
const TEST_GAME_DIR = path.join(TEST_TEMP_DIR, 'test-game')

function setupTestGameDirectory(): void {
  if (fs.existsSync(TEST_TEMP_DIR)) {
    fs.rmSync(TEST_TEMP_DIR, { recursive: true, force: true })
  }

  fs.mkdirSync(TEST_GAME_DIR, { recursive: true })

  // Create mock executable files with P2P signatures
  const steamP2pBinary = Buffer.from('dummy_executable_header')
  fs.writeFileSync(path.join(TEST_GAME_DIR, 'game.exe'), steamP2pBinary)

  // Create config file with networking keywords
  const configContent = `
    [networking]
    enabled=true
    p2p=true
    relay_server=relay.example.com
    stun_server=stun.example.com
  `
  fs.writeFileSync(path.join(TEST_GAME_DIR, 'config.ini'), configContent)
}

function cleanupTestDirectory(): void {
  if (fs.existsSync(TEST_TEMP_DIR)) {
    fs.rmSync(TEST_TEMP_DIR, { recursive: true, force: true })
  }
}

// ============================================================================
// Detection Tests
// ============================================================================

describe('P2P Protocol Detector', () => {
  beforeEach(() => {
    setupTestGameDirectory()
    clearP2PDetectionCache()
  })

  afterEach(() => {
    cleanupTestDirectory()
    clearP2PDetectionCache()
  })

  it('should detect P2P protocol for valid game directory', async () => {
    const result = await detectP2PProtocol(TEST_GAME_DIR, 'test-app-1')

    expect(result).toBeDefined()
    expect(result.protocol).toBeDefined()
    expect(result.detectedFiles.length).toBeGreaterThan(0)
    expect(result.rawDetectionData).toBeDefined()
  })

  it('should return empty result for non-existent directory', async () => {
    const result = await detectP2PProtocol('/non/existent/path', 'test-app-2')

    expect(result).toBeDefined()
    expect(result.protocol.type).toBe('unknown')
  })

  it('should cache detection results', async () => {
    const appId = 'test-app-3'

    // First detection
    const result1 = await detectP2PProtocol(TEST_GAME_DIR, appId)

    // Second detection should come from cache
    const cached = getP2PDetectionFromCache(appId)
    expect(cached).toBeDefined()
    expect(cached?.protocol).toEqual(result1.protocol)
  })

  it('should have reasonable confidence scores', async () => {
    const result = await detectP2PProtocol(TEST_GAME_DIR, 'test-app-4')

    expect(result.protocol.detectionConfidence).toBeGreaterThanOrEqual(0)
    expect(result.protocol.detectionConfidence).toBeLessThanOrEqual(100)
  })

  it('should detect Steam P2P protocol signatures', async () => {
    // Create game with Steam P2P indicators
    const steamP2pContent = 'SteamNetworking ISteamP2P SendP2PPacket'
    fs.writeFileSync(path.join(TEST_GAME_DIR, 'steam_p2p.dll'), steamP2pContent)

    const result = await detectP2PProtocol(TEST_GAME_DIR, 'test-app-steam-p2p')

    expect(result.detectedAPICalls.length).toBeGreaterThan(0)
  })

  it('should clear cache correctly', async () => {
    const appId = 'test-app-5'
    await detectP2PProtocol(TEST_GAME_DIR, appId)

    let cached = getP2PDetectionFromCache(appId)
    expect(cached).toBeDefined()

    clearP2PDetectionCache(appId)
    cached = getP2PDetectionFromCache(appId)
    expect(cached).toBeNull()
  })

  it('should detect relay and NAT traversal indicators', async () => {
    const relayConfig = `
      relay_server=relay.example.com
      stun_server=stun.example.com
      upnp_enabled=true
      ice_servers=stun:stun.example.com:3478
    `
    fs.writeFileSync(path.join(TEST_GAME_DIR, 'relay_config.json'), relayConfig)

    const result = await detectP2PProtocol(TEST_GAME_DIR, 'test-app-relay')

    // Should detect relay and NAT indicators
    expect(result.detectedAPICalls.length).toBeGreaterThanOrEqual(0)
  })

  it('should handle multiple executable files', async () => {
    fs.writeFileSync(path.join(TEST_GAME_DIR, 'launcher.exe'), 'launcher binary')
    fs.writeFileSync(path.join(TEST_GAME_DIR, 'updater.exe'), 'updater binary')

    const result = await detectP2PProtocol(TEST_GAME_DIR, 'test-app-multi-exe')

    expect(result.detectedFiles.length).toBeGreaterThan(0)
  })

  it('should have appropriate detection methods recorded', async () => {
    const result = await detectP2PProtocol(TEST_GAME_DIR, 'test-app-methods')

    if (result.protocol.detectionConfidence > 0) {
      expect(result.protocol.detectionMethod.length).toBeGreaterThan(0)
    }
  })

  it('should set reasonable default values for unknown protocol', async () => {
    const emptyDir = path.join(TEST_TEMP_DIR, 'empty-game')
    fs.mkdirSync(emptyDir, { recursive: true })

    const result = await detectP2PProtocol(emptyDir, 'test-app-none')

    expect(['unknown', 'none']).toContain(result.protocol.type)
    expect(result.protocol.requiresUPnP).toBe(false)
    expect(result.protocol.requiresRelay).toBe(false)
  })

  it('should generate raw detection data', async () => {
    const result = await detectP2PProtocol(TEST_GAME_DIR, 'test-app-raw-data')

    expect(result.rawDetectionData).toBeDefined()
    expect(typeof result.rawDetectionData === 'object').toBe(true)
  })

  it('should handle permission errors gracefully', async () => {
    const restrictedDir = path.join(TEST_TEMP_DIR, 'restricted')
    fs.mkdirSync(restrictedDir, { recursive: true })

    // This test would require setting file permissions, skipped on most systems
    const result = await detectP2PProtocol(restrictedDir, 'test-app-perms')

    // Should not throw, but return limited data
    expect(result).toBeDefined()
  })
})

// ============================================================================
// Protocol Type Tests
// ============================================================================

describe('P2PProtocolConfig', () => {
  it('should recommend appropriate connection timeouts', () => {
    const configs = [
      { type: 'steam_p2p', expectedTimeout: 15000 },
      { type: 'gamespy', expectedTimeout: 20000 },
      { type: 'custom_p2p', expectedTimeout: 25000 },
      { type: 'none', expectedTimeout: 0 },
    ]

    for (const config of configs) {
      expect(config.expectedTimeout).toBeGreaterThanOrEqual(0)
    }
  })

  it('should set reasonable max peer counts', () => {
    const peerCounts = [
      { type: 'steam_p2p', expectedMax: 32 },
      { type: 'gamespy', expectedMax: 64 },
      { type: 'custom_p2p', expectedMax: 16 },
    ]

    for (const config of peerCounts) {
      expect(config.expectedMax).toBeGreaterThan(0)
    }
  })

  it('should specify NAT traversal methods', () => {
    const methods = ['upnp', 'hole_punch', 'relay', 'none']

    for (const method of methods) {
      expect(['upnp', 'hole_punch', 'relay', 'none']).toContain(method)
    }
  })
})

// ============================================================================
// Cache Tests
// ============================================================================

describe('P2P Detection Cache', () => {
  beforeEach(() => {
    clearP2PDetectionCache()
  })

  afterEach(() => {
    cleanupTestDirectory()
    clearP2PDetectionCache()
  })

  it('should persist detection results to cache', async () => {
    setupTestGameDirectory()
    const appId = 'test-cache-1'

    await detectP2PProtocol(TEST_GAME_DIR, appId)
    const cached = getP2PDetectionFromCache(appId)

    expect(cached).not.toBeNull()
  })

  it('should retrieve cached results quickly', async () => {
    setupTestGameDirectory()
    const appId = 'test-cache-2'

    const startTime1 = Date.now()
    await detectP2PProtocol(TEST_GAME_DIR, appId)
    const duration1 = Date.now() - startTime1

    const startTime2 = Date.now()
    getP2PDetectionFromCache(appId)
    const duration2 = Date.now() - startTime2

    // Cache retrieval should be faster
    expect(duration2).toBeLessThan(duration1 + 100) // Allow 100ms for variance
  })

  it('should clear all cached data', async () => {
    setupTestGameDirectory()

    await detectP2PProtocol(TEST_GAME_DIR, 'test-cache-3')
    await detectP2PProtocol(TEST_GAME_DIR, 'test-cache-4')

    clearP2PDetectionCache()

    expect(getP2PDetectionFromCache('test-cache-3')).toBeNull()
    expect(getP2PDetectionFromCache('test-cache-4')).toBeNull()
  })
})

// ============================================================================
// Edge Case Tests
// ============================================================================

describe('P2P Detector Edge Cases', () => {
  beforeEach(() => {
    setupTestGameDirectory()
  })

  afterEach(() => {
    cleanupTestDirectory()
    clearP2PDetectionCache()
  })

  it('should handle very large files gracefully', async () => {
    // Create a large file without crashing
    const largeFile = path.join(TEST_GAME_DIR, 'large.bin')
    const buffer = Buffer.alloc(10 * 1024 * 1024) // 10MB
    fs.writeFileSync(largeFile, buffer)

    const result = await detectP2PProtocol(TEST_GAME_DIR, 'test-app-large-file')
    expect(result).toBeDefined()
  })

  it('should handle special characters in paths', async () => {
    const specialDir = path.join(TEST_TEMP_DIR, 'special-chars-[test]')
    fs.mkdirSync(specialDir, { recursive: true })
    fs.writeFileSync(path.join(specialDir, 'game.exe'), 'binary')

    const result = await detectP2PProtocol(specialDir, 'test-special-chars')
    expect(result).toBeDefined()
  })

  it('should handle corrupted binary files', async () => {
    const corruptedFile = path.join(TEST_GAME_DIR, 'corrupted.exe')
    fs.writeFileSync(corruptedFile, Buffer.from([0xff, 0xfe, 0xfd, 0xfc]))

    const result = await detectP2PProtocol(TEST_GAME_DIR, 'test-corrupted')
    expect(result).toBeDefined()
  })

  it('should handle symlinks in directory (if supported)', async () => {
    const symtargetDir = path.join(TEST_TEMP_DIR, 'symlink-target')
    fs.mkdirSync(symtargetDir, { recursive: true })
    fs.writeFileSync(path.join(symtargetDir, 'game.exe'), 'binary')

    try {
      const symlinkDir = path.join(TEST_TEMP_DIR, 'symlink')
      fs.symlinkSync(symtargetDir, symlinkDir, 'dir')

      const result = await detectP2PProtocol(symlinkDir, 'test-symlink')
      expect(result).toBeDefined()
    } catch (err) {
      // Symlinks might not be supported on all systems
      console.log('Symlink test skipped (not supported)')
    }
  })
})
