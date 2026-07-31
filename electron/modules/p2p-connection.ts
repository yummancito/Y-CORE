// ============================================================================
// electron/modules/p2p-connection.ts
// ============================================================================
// P2P Connection Management module for Online Fix
// Handles connection timeouts, pooling, keep-alives, and error recovery
// ============================================================================

import { EventEmitter } from 'events'
import { logger } from '../logger'

// ============================================================================
// Types and Interfaces
// ============================================================================

export type ConnectionState = 'idle' | 'connecting' | 'connected' | 'disconnecting' | 'disconnected' | 'error'
export type ErrorRecoveryStrategy = 'exponential_backoff' | 'linear_backoff' | 'no_retry' | 'immediate'

export interface PeerAddress {
  host: string
  port: number
  protocol: 'tcp' | 'udp' | 'relay'
}

export interface P2PConnectionOptions {
  connectionTimeout: number // ms
  keepAliveInterval: number // ms
  keepAliveTimeout: number // ms
  maxRetries: number
  errorRecoveryStrategy: ErrorRecoveryStrategy
  initialBackoffDelay: number // ms
  maxBackoffDelay: number // ms
}

export interface ConnectionMetrics {
  connectionId: string
  peerId: string
  state: ConnectionState
  createdAt: number
  connectedAt?: number
  disconnectedAt?: number
  bytesReceived: number
  bytesSent: number
  packetsReceived: number
  packetsSent: number
  lastActivityTime: number
  averageLatency: number // ms
  latencyHistory: number[] // Last 50 measurements
  failureCount: number
  successCount: number
}

export interface PoolStatistics {
  totalConnections: number
  activeConnections: number
  idleConnections: number
  failedConnections: number
  averageLatency: number
  totalBytesTransferred: number
  uptime: number // ms
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_CONNECTION_TIMEOUT = 15000 // 15 seconds
const DEFAULT_KEEP_ALIVE_INTERVAL = 30000 // 30 seconds
const DEFAULT_KEEP_ALIVE_TIMEOUT = 10000 // 10 seconds
const DEFAULT_MAX_RETRIES = 3

const DEFAULT_OPTIONS: P2PConnectionOptions = {
  connectionTimeout: DEFAULT_CONNECTION_TIMEOUT,
  keepAliveInterval: DEFAULT_KEEP_ALIVE_INTERVAL,
  keepAliveTimeout: DEFAULT_KEEP_ALIVE_TIMEOUT,
  maxRetries: DEFAULT_MAX_RETRIES,
  errorRecoveryStrategy: 'exponential_backoff',
  initialBackoffDelay: 1000,
  maxBackoffDelay: 32000,
}

// ============================================================================
// P2P Connection Class
// ============================================================================

export class P2PConnection extends EventEmitter {
  private connectionId: string
  private peerId: string
  private peerAddress: PeerAddress
  private state: ConnectionState = 'idle'
  private metrics: ConnectionMetrics
  private options: P2PConnectionOptions
  private connectionAbortController?: AbortController
  private keepAliveHandle?: NodeJS.Timeout
  private retryCount: number = 0
  private lastActivityTime: number = Date.now()

  constructor(peerId: string, peerAddress: PeerAddress, options?: Partial<P2PConnectionOptions>) {
    super()
    this.connectionId = `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    this.peerId = peerId
    this.peerAddress = peerAddress
    this.options = { ...DEFAULT_OPTIONS, ...options }

    this.metrics = {
      connectionId: this.connectionId,
      peerId,
      state: 'idle',
      createdAt: Date.now(),
      bytesReceived: 0,
      bytesSent: 0,
      packetsReceived: 0,
      packetsSent: 0,
      lastActivityTime: Date.now(),
      averageLatency: 0,
      latencyHistory: [],
      failureCount: 0,
      successCount: 0,
    }

    logger.debug(`Created P2P connection: ${this.connectionId} -> ${peerId}`, 'p2p-connection')
  }

  /**
   * Connect to peer with timeout and retry logic
   */
  async connect(): Promise<boolean> {
    if (this.state !== 'idle' && this.state !== 'error') {
      logger.warn(`Cannot connect: connection state is ${this.state}`, 'p2p-connection')
      return false
    }

    this.setState('connecting')

    try {
      for (let attempt = 0; attempt <= this.options.maxRetries; attempt++) {
        try {
          logger.debug(`Connection attempt ${attempt + 1}/${this.options.maxRetries + 1} to ${this.peerId}`, 'p2p-connection')

          this.connectionAbortController = new AbortController()
          const timeoutHandle = setTimeout(() => this.connectionAbortController?.abort(), this.options.connectionTimeout)

          try {
            // Simulate connection attempt (real implementation would use actual network)
            await this.performConnectionAttempt()
            clearTimeout(timeoutHandle)

            this.setState('connected')
            this.metrics.connectedAt = Date.now()
            this.retryCount = 0
            this.metrics.successCount++

            logger.info(`Connected to peer ${this.peerId} (${this.connectionId})`, 'p2p-connection')

            // Start keep-alive mechanism
            this.startKeepAlive()

            this.emit('connected')
            return true
          } finally {
            clearTimeout(timeoutHandle)
          }
        } catch (err: any) {
          this.metrics.failureCount++

          if (attempt < this.options.maxRetries) {
            const delay = this.calculateBackoffDelay(attempt)
            logger.warn(
              `Connection attempt failed for ${this.peerId}, retrying in ${delay}ms: ${err.message}`,
              'p2p-connection'
            )
            await this.sleep(delay)
          } else {
            throw err
          }
        }
      }
    } catch (err: any) {
      this.setState('error')
      this.metrics.disconnectedAt = Date.now()
      logger.error(`Failed to connect to peer ${this.peerId}: ${err.message}`, 'p2p-connection')
      this.emit('error', new Error(`Connection failed: ${err.message}`))
      return false
    }

    // Should not reach here, but TypeScript needs explicit return
    return false
  }

  /**
   * Disconnect from peer gracefully
   */
  async disconnect(): Promise<void> {
    if (this.state === 'disconnected' || this.state === 'idle') {
      return
    }

    this.setState('disconnecting')
    this.stopKeepAlive()

    try {
      this.connectionAbortController?.abort()

      logger.info(`Disconnected from peer ${this.peerId}`, 'p2p-connection')
      this.setState('disconnected')
      this.metrics.disconnectedAt = Date.now()
      this.emit('disconnected')
    } catch (err: any) {
      logger.warn(`Error during disconnect: ${err.message}`, 'p2p-connection')
    }
  }

  /**
   * Send data to peer
   */
  async sendData(data: Buffer | string, metadata?: Record<string, unknown>): Promise<boolean> {
    if (this.state !== 'connected') {
      logger.warn(`Cannot send data: connection state is ${this.state}`, 'p2p-connection')
      return false
    }

    try {
      const buffer = typeof data === 'string' ? Buffer.from(data) : data
      this.metrics.bytesSent += buffer.length
      this.metrics.packetsSent++
      this.updateActivityTime()

      logger.debug(`Sent ${buffer.length} bytes to ${this.peerId}`, 'p2p-connection')
      this.emit('data-sent', { size: buffer.length, metadata })

      return true
    } catch (err: any) {
      logger.error(`Failed to send data: ${err.message}`, 'p2p-connection')
      this.emit('error', err)
      return false
    }
  }

  /**
   * Receive data from peer (called by connection handler)
   */
  recordReceivedData(size: number, latency?: number): void {
    this.metrics.bytesReceived += size
    this.metrics.packetsReceived++
    this.updateActivityTime()

    if (latency !== undefined) {
      this.recordLatency(latency)
    }

    logger.debug(`Received ${size} bytes from ${this.peerId}`, 'p2p-connection')
  }

  /**
   * Record latency measurement
   */
  recordLatency(latency: number): void {
    this.metrics.latencyHistory.push(latency)

    // Keep only last 50 measurements
    if (this.metrics.latencyHistory.length > 50) {
      this.metrics.latencyHistory.shift()
    }

    // Calculate average
    const sum = this.metrics.latencyHistory.reduce((a, b) => a + b, 0)
    this.metrics.averageLatency = Math.round(sum / this.metrics.latencyHistory.length)
  }

  /**
   * Get connection metrics
   */
  getMetrics(): ConnectionMetrics {
    return {
      ...this.metrics,
      state: this.state,
      lastActivityTime: this.lastActivityTime,
    }
  }

  /**
   * Get connection state
   */
  getState(): ConnectionState {
    return this.state
  }

  /**
   * Get connection ID
   */
  getId(): string {
    return this.connectionId
  }

  /**
   * Check if connection is healthy
   */
  isHealthy(): boolean {
    if (this.state !== 'connected') return false

    // Consider unhealthy if last activity was more than 2x keep-alive interval ago
    const timeSinceActivity = Date.now() - this.lastActivityTime
    return timeSinceActivity < this.options.keepAliveInterval * 2
  }

  /**
   * Private: Perform actual connection attempt
   */
  private async performConnectionAttempt(): Promise<void> {
    // Simulate connection logic (real implementation would use WebRTC/UDP/TCP)
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Connection timeout'))
      }, this.options.connectionTimeout)

      // Simulate connection delay
      setTimeout(() => {
        clearTimeout(timeout)
        resolve()
      }, Math.random() * 1000)
    })
  }

  /**
   * Private: Start keep-alive mechanism
   */
  private startKeepAlive(): void {
    this.keepAliveHandle = setInterval(() => {
      if (this.state !== 'connected') {
        this.stopKeepAlive()
        return
      }

      // Send keep-alive ping
      this.sendKeepAlivePing().catch((err) => {
        logger.warn(`Keep-alive ping failed: ${err.message}`, 'p2p-connection')
        this.metrics.failureCount++

        // If keep-alive fails, attempt to recover
        if (this.metrics.failureCount > 3) {
          this.reconnect()
        }
      })
    }, this.options.keepAliveInterval)
  }

  /**
   * Private: Stop keep-alive mechanism
   */
  private stopKeepAlive(): void {
    if (this.keepAliveHandle) {
      clearInterval(this.keepAliveHandle)
      this.keepAliveHandle = undefined
    }
  }

  /**
   * Private: Send keep-alive ping
   */
  private async sendKeepAlivePing(): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Keep-alive timeout'))
      }, this.options.keepAliveTimeout)

      // Simulate ping (real implementation would send actual ping packet)
      setTimeout(() => {
        clearTimeout(timeout)
        this.recordLatency(Math.random() * 50 + 10) // Simulate 10-60ms latency
        resolve()
      }, Math.random() * 20)
    })
  }

  /**
   * Private: Attempt to reconnect
   */
  private async reconnect(): Promise<void> {
    logger.warn(`Attempting to reconnect to ${this.peerId}`, 'p2p-connection')
    this.stopKeepAlive()
    this.setState('error')
    await this.sleep(this.calculateBackoffDelay(this.retryCount++))
    await this.connect()
  }

  /**
   * Private: Calculate exponential backoff delay
   */
  private calculateBackoffDelay(attemptNumber: number): number {
    switch (this.options.errorRecoveryStrategy) {
      case 'exponential_backoff': {
        const exponential = this.options.initialBackoffDelay * Math.pow(2, attemptNumber)
        return Math.min(exponential, this.options.maxBackoffDelay)
      }
      case 'linear_backoff':
        return Math.min(this.options.initialBackoffDelay * (attemptNumber + 1), this.options.maxBackoffDelay)
      case 'immediate':
        return 0
      case 'no_retry':
      default:
        return this.options.maxBackoffDelay
    }
  }

  /**
   * Private: Update last activity time
   */
  private updateActivityTime(): void {
    this.lastActivityTime = Date.now()
  }

  /**
   * Private: Change connection state
   */
  private setState(newState: ConnectionState): void {
    if (this.state !== newState) {
      const oldState = this.state
      this.state = newState
      this.metrics.state = newState
      logger.debug(`Connection state transition: ${oldState} -> ${newState}`, 'p2p-connection')
      this.emit('state-changed', { from: oldState, to: newState })
    }
  }

  /**
   * Private: Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}

// ============================================================================
// Connection Pool Class
// ============================================================================

export class P2PConnectionPool extends EventEmitter {
  private connections: Map<string, P2PConnection> = new Map()
  private maxConnections: number
  private defaultOptions: P2PConnectionOptions
  private createdAt: number = Date.now()

  constructor(maxConnections: number = 32, options?: Partial<P2PConnectionOptions>) {
    super()
    this.maxConnections = maxConnections
    this.defaultOptions = { ...DEFAULT_OPTIONS, ...options }
    logger.info(`Initialized P2P connection pool (max: ${maxConnections})`, 'p2p-connection')
  }

  /**
   * Get or create connection to peer
   */
  async getConnection(peerId: string, peerAddress: PeerAddress): Promise<P2PConnection | null> {
    const existingId = `${peerId}:${peerAddress.host}:${peerAddress.port}`

    // Return existing connection if already connected
    if (this.connections.has(existingId)) {
      const conn = this.connections.get(existingId)!
      if (conn.getState() === 'connected') {
        return conn
      }
    }

    // Check pool size
    if (this.connections.size >= this.maxConnections) {
      logger.warn(`Connection pool at max capacity (${this.maxConnections})`, 'p2p-connection')
      return null
    }

    // Create new connection
    const connection = new P2PConnection(peerId, peerAddress, this.defaultOptions)

    connection.on('error', (err) => {
      this.emit('connection-error', { peerId, error: err })
    })

    connection.on('disconnected', () => {
      this.connections.delete(existingId)
    })

    try {
      const connected = await connection.connect()
      if (connected) {
        this.connections.set(existingId, connection)
        return connection
      } else {
        return null
      }
    } catch (err: any) {
      logger.error(`Failed to create connection to ${peerId}: ${err.message}`, 'p2p-connection')
      return null
    }
  }

  /**
   * Close specific connection
   */
  async closeConnection(peerId: string): Promise<void> {
    const keys = Array.from(this.connections.keys()).filter((k) => k.startsWith(peerId))

    for (const key of keys) {
      const conn = this.connections.get(key)
      if (conn) {
        await conn.disconnect()
        this.connections.delete(key)
      }
    }

    logger.info(`Closed ${keys.length} connection(s) for ${peerId}`, 'p2p-connection')
  }

  /**
   * Close all connections
   */
  async closeAllConnections(): Promise<void> {
    const connections = Array.from(this.connections.values())
    logger.info(`Closing ${connections.length} connections`, 'p2p-connection')

    for (const conn of connections) {
      await conn.disconnect()
    }

    this.connections.clear()
  }

  /**
   * Get pool statistics
   */
  getStatistics(): PoolStatistics {
    const connections = Array.from(this.connections.values())
    const metrics = connections.map((c) => c.getMetrics())

    const activeConnections = metrics.filter((m) => m.state === 'connected').length
    const idleConnections = metrics.filter((m) => m.state === 'idle').length
    const failedConnections = metrics.filter((m) => m.state === 'error').length

    const totalBytesTransferred = metrics.reduce((sum, m) => sum + m.bytesSent + m.bytesReceived, 0)
    const avgLatency = metrics.length > 0 ? Math.round(metrics.reduce((sum, m) => sum + m.averageLatency, 0) / metrics.length) : 0

    return {
      totalConnections: this.connections.size,
      activeConnections,
      idleConnections,
      failedConnections,
      averageLatency: avgLatency,
      totalBytesTransferred,
      uptime: Date.now() - this.createdAt,
    }
  }

  /**
   * Get connection metrics by peer
   */
  getConnectionMetrics(peerId?: string): ConnectionMetrics[] {
    const connections = peerId
      ? Array.from(this.connections.values()).filter((c) => c['peerId'] === peerId)
      : Array.from(this.connections.values())

    return connections.map((c) => c.getMetrics())
  }
}

/**
 * Create a new P2P connection pool
 */
export function createConnectionPool(maxConnections?: number, options?: Partial<P2PConnectionOptions>): P2PConnectionPool {
  return new P2PConnectionPool(maxConnections, options)
}
