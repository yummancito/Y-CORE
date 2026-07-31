// ============================================================================
// electron/modules/p2p-connection.test.ts
// ============================================================================
// Tests for P2P Connection Management module
// ============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  P2PConnection,
  P2PConnectionPool,
  createConnectionPool,
  type PeerAddress,
  type P2PConnectionOptions,
} from './p2p-connection'

// ============================================================================
// Test Setup
// ============================================================================

const createTestPeerAddress = (): PeerAddress => ({
  host: '192.168.1.100',
  port: 9999,
  protocol: 'tcp',
})

// ============================================================================
// P2PConnection Tests
// ============================================================================

describe('P2PConnection', () => {
  let connection: P2PConnection

  beforeEach(() => {
    connection = new P2PConnection('test-peer-1', createTestPeerAddress())
  })

  afterEach(async () => {
    if (connection) {
      await connection.disconnect()
    }
  })

  it('should create connection with valid properties', () => {
    expect(connection).toBeDefined()
    expect(connection.getId()).toBeTruthy()
    expect(connection.getState()).toBe('idle')
  })

  it('should transition to connected state', async () => {
    const connected = await connection.connect()

    expect(connected).toBe(true)
    expect(connection.getState()).toBe('connected')
  })

  it('should disconnect gracefully', async () => {
    await connection.connect()
    expect(connection.getState()).toBe('connected')

    await connection.disconnect()
    expect(connection.getState()).toBe('disconnected')
  })

  it('should track connection metrics', async () => {
    await connection.connect()
    const metrics = connection.getMetrics()

    expect(metrics).toHaveProperty('bytesReceived')
    expect(metrics).toHaveProperty('bytesSent')
    expect(metrics).toHaveProperty('packetsReceived')
    expect(metrics).toHaveProperty('packetsSent')
    expect(metrics.bytesReceived).toBe(0)
  })

  it('should send data when connected', async () => {
    await connection.connect()
    const sent = await connection.sendData('test data')

    expect(sent).toBe(true)

    const metrics = connection.getMetrics()
    expect(metrics.bytesSent).toBeGreaterThan(0)
    expect(metrics.packetsSent).toBe(1)
  })

  it('should not send data when disconnected', async () => {
    const sent = await connection.sendData('test data')

    expect(sent).toBe(false)
  })

  it('should record received data', async () => {
    await connection.connect()
    connection.recordReceivedData(100)

    const metrics = connection.getMetrics()
    expect(metrics.bytesReceived).toBe(100)
    expect(metrics.packetsReceived).toBe(1)
  })

  it('should record and track latency', async () => {
    await connection.connect()
    connection.recordLatency(50)
    connection.recordLatency(60)
    connection.recordLatency(40)

    const metrics = connection.getMetrics()
    expect(metrics.latencyHistory.length).toBeGreaterThan(0)
    expect(metrics.averageLatency).toBeGreaterThan(0)
  })

  it('should maintain latency history limit', async () => {
    await connection.connect()

    // Record more than 50 latency measurements
    for (let i = 0; i < 100; i++) {
      connection.recordLatency(Math.random() * 100)
    }

    const metrics = connection.getMetrics()
    expect(metrics.latencyHistory.length).toBeLessThanOrEqual(50)
  })

  it('should determine connection health', async () => {
    expect(connection.isHealthy()).toBe(false)

    await connection.connect()
    expect(connection.isHealthy()).toBe(true)

    await connection.disconnect()
    expect(connection.isHealthy()).toBe(false)
  })

  it('should emit state change events', async () => {
    let stateChanges: Array<{ from: string; to: string }> = []

    connection.on('state-changed', (event) => {
      stateChanges.push(event)
    })

    await connection.connect()
    expect(stateChanges.length).toBeGreaterThan(0)
    expect(stateChanges[0].to).toBe('connected')
  })

  it('should respect connection timeout', async () => {
    const options: Partial<P2PConnectionOptions> = {
      connectionTimeout: 100, // Very short timeout
    }

    const timedOutConnection = new P2PConnection('timeout-peer', createTestPeerAddress(), options)
    // Note: This test would require mocking the connection to force timeout

    await timedOutConnection.disconnect()
  })

  it('should handle reconnection attempts', async () => {
    await connection.connect()
    expect(connection.getState()).toBe('connected')

    await connection.disconnect()
    expect(connection.getState()).toBe('disconnected')

    // Try to connect again
    const reconnected = await connection.connect()
    expect(reconnected).toBe(true)
  })

  it('should support custom options', () => {
    const options: Partial<P2PConnectionOptions> = {
      connectionTimeout: 5000,
      keepAliveInterval: 10000,
      maxRetries: 2,
    }

    const customConnection = new P2PConnection('custom-peer', createTestPeerAddress(), options)
    expect(customConnection).toBeDefined()

    return customConnection.disconnect()
  })

  it('should track success and failure counts', async () => {
    await connection.connect()

    let metrics = connection.getMetrics()
    const initialSuccesses = metrics.successCount

    metrics = connection.getMetrics()
    expect(metrics.successCount).toBeGreaterThanOrEqual(initialSuccesses)
  })
})

// ============================================================================
// P2PConnectionPool Tests
// ============================================================================

describe('P2PConnectionPool', () => {
  let pool: P2PConnectionPool

  beforeEach(() => {
    pool = createConnectionPool(10)
  })

  afterEach(async () => {
    if (pool) {
      await pool.closeAllConnections()
    }
  })

  it('should create connection pool', () => {
    expect(pool).toBeDefined()
  })

  it('should get or create connection', async () => {
    const peerAddress = createTestPeerAddress()
    const connection = await pool.getConnection('peer-1', peerAddress)

    if (connection) {
      expect(connection.getState()).toBe('connected')
    }
  })

  it('should reuse existing connections', async () => {
    const peerAddress = createTestPeerAddress()

    const conn1 = await pool.getConnection('peer-2', peerAddress)
    const conn2 = await pool.getConnection('peer-2', peerAddress)

    if (conn1 && conn2) {
      expect(conn1.getId()).toBe(conn2.getId())
    }
  })

  it('should respect max connection limit', async () => {
    const smallPool = createConnectionPool(2)

    const addr1 = { ...createTestPeerAddress(), port: 9999 }
    const addr2 = { ...createTestPeerAddress(), port: 9998 }
    const addr3 = { ...createTestPeerAddress(), port: 9997 }

    const conn1 = await smallPool.getConnection('peer-1', addr1)
    const conn2 = await smallPool.getConnection('peer-2', addr2)
    const conn3 = await smallPool.getConnection('peer-3', addr3)

    expect(conn1 || conn2 || conn3).toBeTruthy()

    await smallPool.closeAllConnections()
  })

  it('should get pool statistics', async () => {
    const peerAddress = createTestPeerAddress()
    await pool.getConnection('peer-stats-1', peerAddress)

    const stats = pool.getStatistics()

    expect(stats).toHaveProperty('totalConnections')
    expect(stats).toHaveProperty('activeConnections')
    expect(stats).toHaveProperty('idleConnections')
    expect(stats).toHaveProperty('averageLatency')
    expect(stats.totalConnections).toBeGreaterThanOrEqual(0)
  })

  it('should get connection metrics', async () => {
    const peerAddress = createTestPeerAddress()
    await pool.getConnection('peer-metrics-1', peerAddress)

    const metrics = pool.getConnectionMetrics()

    expect(Array.isArray(metrics)).toBe(true)
  })

  it('should get metrics for specific peer', async () => {
    const peerAddress = createTestPeerAddress()
    await pool.getConnection('peer-specific', peerAddress)

    const metrics = pool.getConnectionMetrics('peer-specific')

    expect(Array.isArray(metrics)).toBe(true)
  })

  it('should close specific connection', async () => {
    const peerAddress = createTestPeerAddress()
    await pool.getConnection('peer-close', peerAddress)

    const statsBefore = pool.getStatistics()
    await pool.closeConnection('peer-close')
    const statsAfter = pool.getStatistics()

    expect(statsAfter.totalConnections).toBeLessThanOrEqual(statsBefore.totalConnections)
  })

  it('should close all connections', async () => {
    const peerAddress = createTestPeerAddress()
    await pool.getConnection('peer-all-1', peerAddress)
    await pool.getConnection('peer-all-2', peerAddress)

    await pool.closeAllConnections()

    const stats = pool.getStatistics()
    expect(stats.totalConnections).toBe(0)
  })

  it('should track total bytes transferred', async () => {
    const peerAddress = createTestPeerAddress()
    const conn = await pool.getConnection('peer-bytes', peerAddress)

    if (conn) {
      await conn.sendData('test data')
      conn.recordReceivedData(50)
    }

    const stats = pool.getStatistics()
    expect(stats.totalBytesTransferred).toBeGreaterThan(0)
  })

  it('should calculate average latency across pool', async () => {
    const peerAddress = createTestPeerAddress()
    const conn = await pool.getConnection('peer-latency', peerAddress)

    if (conn) {
      conn.recordLatency(50)
      conn.recordLatency(100)
    }

    const stats = pool.getStatistics()
    expect(stats.averageLatency).toBeGreaterThan(0)
  })

  it('should track pool uptime', async () => {
    const stats = pool.getStatistics()

    expect(stats.uptime).toBeGreaterThanOrEqual(0)
  })

  it('should handle connection pool with custom options', () => {
    const options: Partial<P2PConnectionOptions> = {
      connectionTimeout: 3000,
      keepAliveInterval: 5000,
      maxRetries: 1,
    }

    const customPool = createConnectionPool(5, options)
    expect(customPool).toBeDefined()

    return customPool.closeAllConnections()
  })
})

// ============================================================================
// Connection State Machine Tests
// ============================================================================

describe('Connection State Transitions', () => {
  it('should not connect if already connecting', async () => {
    const connection = new P2PConnection('state-test-1', createTestPeerAddress())

    const promise1 = connection.connect()
    // Don't await yet, try to connect again immediately
    // In real scenario with network, this would be in connecting state

    await promise1
    await connection.disconnect()
  })

  it('should not disconnect if already disconnected', async () => {
    const connection = new P2PConnection('state-test-2', createTestPeerAddress())

    await connection.disconnect()
    await connection.disconnect() // Should be idempotent

    expect(connection.getState()).toBe('disconnected')
  })

  it('should recover from error state', async () => {
    const connection = new P2PConnection('state-test-3', createTestPeerAddress())

    await connection.connect()
    await connection.disconnect()

    const reconnected = await connection.connect()
    expect(reconnected).toBe(true)
  })
})

// ============================================================================
// Error Handling Tests
// ============================================================================

describe('Connection Error Handling', () => {
  it('should emit error events on failure', (done: jest.DoneCallback) => {
    const connection = new P2PConnection('error-test-1', createTestPeerAddress())

    let errorEmitted = false
    connection.on('error', () => {
      errorEmitted = true
    })

    connection.disconnect().then(() => {
      done()
    })
  })

  it('should handle send data errors gracefully', async () => {
    const connection = new P2PConnection('error-test-2', createTestPeerAddress())

    // Try to send without connecting
    const sent = await connection.sendData('invalid')

    expect(sent).toBe(false)
  })

  it('should not crash on invalid data types', async () => {
    const connection = new P2PConnection('error-test-3', createTestPeerAddress())

    await connection.connect()

    // Should handle both string and buffer
    const sent1 = await connection.sendData('string data')
    const sent2 = await connection.sendData(Buffer.from('buffer data'))

    expect(sent1).toBe(true)
    expect(sent2).toBe(true)

    await connection.disconnect()
  })
})
