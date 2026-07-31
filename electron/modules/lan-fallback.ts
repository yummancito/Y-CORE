// ============================================================================
// electron/modules/lan-fallback.ts
// ============================================================================
// LAN Fallback module for Online Fix
// Handles switching to LAN-only mode when internet is unavailable
// Provides local peer discovery (mDNS simulation) and local relay server setup
// ============================================================================

import { EventEmitter } from 'events'
import os from 'os'
import { logger } from '../logger'
import { getNetworkAdapters, getPrimaryNetworkAddress } from './network-config'

// ============================================================================
// Types and Interfaces
// ============================================================================

export type LANMode = 'online' | 'lan_only' | 'offline'

export interface LANPeer {
  peerId: string
  hostname: string
  ipAddress: string
  port: number
  lastSeen: number
  serviceType: string // e.g., '_ycore-p2p._tcp.local'
  txtRecords?: Record<string, string>
}

export interface LocalRelayServer {
  name: string
  ipAddress: string
  port: number
  protocol: 'tcp' | 'udp'
  maxConnections: number
  currentConnections: number
  isRunning: boolean
}

export interface LANFallbackConfig {
  enabled: boolean
  mdnsServiceName: string
  mdnsServiceType: string
  mdnsTTL: number // seconds
  localDiscoveryPort: number
  localRelayPort: number
  heartbeatInterval: number // ms
  peerTimeoutMs: number // ms (time before peer is considered offline)
  checkInternetInterval: number // ms
}

export interface LANStatus {
  mode: LANMode
  isInternetAvailable: boolean
  lastInternetCheckTime: number
  connectedPeers: LANPeer[]
  localRelayServers: { name: string; ipAddress: string; port: number; protocol: 'tcp' | 'udp'; maxConnections: number; currentConnections: number; isRunning: boolean }[]
  primaryIpAddress: string | null
  networkAdapters: number
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_LAN_CONFIG: LANFallbackConfig = {
  enabled: true,
  mdnsServiceName: 'ycore-p2p',
  mdnsServiceType: '_ycore-p2p._tcp.local',
  mdnsTTL: 120,
  localDiscoveryPort: 5354, // Local mDNS port
  localRelayPort: 10000,
  heartbeatInterval: 5000, // 5 seconds
  peerTimeoutMs: 30000, // 30 seconds
  checkInternetInterval: 10000, // 10 seconds
}

// ============================================================================
// Internet Connectivity Check
// ============================================================================

/**
 * Check if internet connection is available
 */
export async function checkInternetConnectivity(timeoutMs: number = 5000): Promise<boolean> {
  const dnsServers = [
    'https://8.8.8.8', // Google
    'https://1.1.1.1', // Cloudflare
    'https://208.67.222.222', // OpenDNS
  ]

  for (const dnsServer of dnsServers) {
    try {
      const controller = new AbortController()
      const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs)

      const response = await fetch('https://www.google.com/generate_204', {
        signal: controller.signal,
        headers: { 'Cache-Control': 'no-cache' },
      })

      clearTimeout(timeoutHandle)

      if (response.ok) {
        logger.debug('Internet connectivity check: online', 'lan-fallback')
        return true
      }
    } catch (err) {
      // Continue to next server
    }
  }

  logger.warn('Internet connectivity check: offline or unavailable', 'lan-fallback')
  return false
}

/**
 * Check if LAN is available (at least one non-loopback adapter with IP)
 */
export function checkLANAvailability(): boolean {
  const adapters = getNetworkAdapters()
  const available = adapters.length > 0
  logger.debug(`LAN availability check: ${available ? 'available' : 'unavailable'}`, 'lan-fallback')
  return available
}

// ============================================================================
// mDNS Service Simulation
// ============================================================================

/**
 * Service advertisement cache (simulates mDNS)
 */
let advertisedServices = new Map<string, LANPeer>()

/**
 * Announce service on local network (mDNS simulation)
 */
export async function announceLANService(
  peerId: string,
  port: number,
  config: Partial<LANFallbackConfig> = {}
): Promise<boolean> {
  try {
    const cfg = { ...DEFAULT_LAN_CONFIG, ...config }
    const hostname = os.hostname()
    const ipAddress = getPrimaryNetworkAddress()

    if (!ipAddress) {
      logger.warn('Cannot announce LAN service: no valid network adapter found', 'lan-fallback')
      return false
    }

    const peer: LANPeer = {
      peerId,
      hostname,
      ipAddress,
      port,
      lastSeen: Date.now(),
      serviceType: cfg.mdnsServiceType,
      txtRecords: {
        version: '1',
        capabilities: 'p2p,relay',
        protocol: 'udp,tcp',
      },
    }

    advertisedServices.set(peerId, peer)
    logger.info(`Announced LAN service: ${peerId} at ${ipAddress}:${port}`, 'lan-fallback')
    return true
  } catch (err: any) {
    logger.error(`Failed to announce LAN service: ${err.message}`, 'lan-fallback')
    return false
  }
}

/**
 * Discover services on local network (mDNS simulation)
 */
export async function discoverLANServices(
  config: Partial<LANFallbackConfig> = {},
  timeoutMs: number = 5000
): Promise<LANPeer[]> {
  const cfg = { ...DEFAULT_LAN_CONFIG, ...config }
  const now = Date.now()
  const peers: LANPeer[] = []

  logger.debug('Starting LAN service discovery...', 'lan-fallback')

  try {
    // Simulate mDNS discovery by returning advertised services that haven't timed out
    for (const [peerId, peer] of advertisedServices.entries()) {
      if (now - peer.lastSeen < cfg.peerTimeoutMs) {
        peers.push(peer)
      } else {
        // Remove stale peer
        advertisedServices.delete(peerId)
      }
    }

    logger.info(`LAN service discovery found ${peers.length} peer(s)`, 'lan-fallback')
    return peers
  } catch (err: any) {
    logger.error(`LAN service discovery failed: ${err.message}`, 'lan-fallback')
    return []
  }
}

/**
 * Withdraw service announcement from local network
 */
export async function withdrawLANService(peerId: string): Promise<boolean> {
  try {
    if (advertisedServices.has(peerId)) {
      advertisedServices.delete(peerId)
      logger.info(`Withdrew LAN service: ${peerId}`, 'lan-fallback')
      return true
    }
    return false
  } catch (err: any) {
    logger.error(`Failed to withdraw LAN service: ${err.message}`, 'lan-fallback')
    return false
  }
}

// ============================================================================
// Local Relay Server
// ============================================================================

/**
 * Local relay server implementation (simplified)
 */
export class LocalRelayServer extends EventEmitter {
  name: string
  ipAddress: string
  port: number
  protocol: 'tcp' | 'udp'
  maxConnections: number
  currentConnections: number = 0
  isRunning: boolean = false
  private peersMap: Map<string, LANPeer> = new Map()

  constructor(
    name: string,
    ipAddress: string,
    port: number,
    protocol: 'tcp' | 'udp' = 'tcp',
    maxConnections: number = 100
  ) {
    super()
    this.name = name
    this.ipAddress = ipAddress
    this.port = port
    this.protocol = protocol
    this.maxConnections = maxConnections

    logger.info(
      `Initialized local relay server: ${name} (${ipAddress}:${port}/${protocol})`,
      'lan-fallback'
    )
  }

  /**
   * Start relay server
   */
  async start(): Promise<boolean> {
    try {
      logger.info(`Starting local relay server: ${this.name}`, 'lan-fallback')
      this.isRunning = true
      this.emit('started')
      return true
    } catch (err: any) {
      logger.error(`Failed to start relay server: ${err.message}`, 'lan-fallback')
      this.isRunning = false
      this.emit('error', err)
      return false
    }
  }

  /**
   * Stop relay server
   */
  async stop(): Promise<boolean> {
    try {
      logger.info(`Stopping local relay server: ${this.name}`, 'lan-fallback')
      this.isRunning = false
      this.currentConnections = 0
      this.peersMap.clear()
      this.emit('stopped')
      return true
    } catch (err: any) {
      logger.error(`Failed to stop relay server: ${err.message}`, 'lan-fallback')
      return false
    }
  }

  /**
   * Register peer connection to relay
   */
  async registerPeer(peerId: string, peer: LANPeer): Promise<boolean> {
    if (!this.isRunning) {
      logger.warn('Cannot register peer: relay server not running', 'lan-fallback')
      return false
    }

    if (this.currentConnections >= this.maxConnections) {
      logger.warn(`Relay server at max capacity (${this.maxConnections})`, 'lan-fallback')
      return false
    }

    try {
      this.peersMap.set(peerId, peer)
      this.currentConnections++
      logger.debug(`Peer registered on relay: ${peerId}`, 'lan-fallback')
      this.emit('peer-registered', { peerId, totalPeers: this.currentConnections })
      return true
    } catch (err: any) {
      logger.error(`Failed to register peer: ${err.message}`, 'lan-fallback')
      return false
    }
  }

  /**
   * Unregister peer from relay
   */
  async unregisterPeer(peerId: string): Promise<boolean> {
    try {
      if (this.peersMap.has(peerId)) {
        this.peersMap.delete(peerId)
        this.currentConnections = Math.max(0, this.currentConnections - 1)
        logger.debug(`Peer unregistered from relay: ${peerId}`, 'lan-fallback')
        this.emit('peer-unregistered', { peerId, totalPeers: this.currentConnections })
        return true
      }
      return false
    } catch (err: any) {
      logger.error(`Failed to unregister peer: ${err.message}`, 'lan-fallback')
      return false
    }
  }

  /**
   * Relay data between peers
   */
  async relayData(fromPeerId: string, toPeerId: string, data: Buffer): Promise<boolean> {
    try {
      const fromPeer = this.peersMap.get(fromPeerId)
      const toPeer = this.peersMap.get(toPeerId)

      if (!fromPeer || !toPeer) {
        logger.warn(`Cannot relay: peer not found (${fromPeerId} -> ${toPeerId})`, 'lan-fallback')
        return false
      }

      // Simulate data relay
      logger.debug(`Relaying ${data.length} bytes from ${fromPeerId} to ${toPeerId}`, 'lan-fallback')
      this.emit('data-relayed', { fromPeerId, toPeerId, size: data.length })
      return true
    } catch (err: any) {
      logger.error(`Failed to relay data: ${err.message}`, 'lan-fallback')
      return false
    }
  }

  /**
   * Get relay server info
   */
  getInfo(): { name: string; ipAddress: string; port: number; protocol: 'tcp' | 'udp'; maxConnections: number; currentConnections: number; isRunning: boolean } {
    return {
      name: this.name,
      ipAddress: this.ipAddress,
      port: this.port,
      protocol: this.protocol,
      maxConnections: this.maxConnections,
      currentConnections: this.currentConnections,
      isRunning: this.isRunning,
    }
  }
}

// ============================================================================
// LAN Fallback Manager
// ============================================================================

export class LANFallbackManager extends EventEmitter {
  private config: LANFallbackConfig
  private currentMode: LANMode = 'online'
  private isInternetAvailable: boolean = true
  private lastInternetCheckTime: number = Date.now()
  private connectedPeers: Map<string, LANPeer> = new Map()
  private localRelayServers: Map<string, LocalRelayServer> = new Map()
  private internetCheckHandle?: NodeJS.Timeout
  private heartbeatHandle?: NodeJS.Timeout
  private peerId: string

  constructor(peerId: string, config?: Partial<LANFallbackConfig>) {
    super()
    this.peerId = peerId
    this.config = { ...DEFAULT_LAN_CONFIG, ...config }
    logger.info(`Initialized LAN fallback manager for peer ${peerId}`, 'lan-fallback')
  }

  /**
   * Initialize LAN fallback (start monitoring and local relay)
   */
  async initialize(): Promise<boolean> {
    try {
      logger.info('Initializing LAN fallback...', 'lan-fallback')

      // Check initial internet status
      this.isInternetAvailable = await checkInternetConnectivity()
      this.updateMode()

      // Start internet connectivity monitoring
      this.startInternetMonitoring()

      // Start heartbeat for peer discovery
      this.startHeartbeat()

      // Announce this peer on LAN
      await announceLANService(this.peerId, this.config.localRelayPort, this.config)

      logger.info(`LAN fallback initialized (mode: ${this.currentMode})`, 'lan-fallback')
      return true
    } catch (err: any) {
      logger.error(`Failed to initialize LAN fallback: ${err.message}`, 'lan-fallback')
      return false
    }
  }

  /**
   * Shutdown LAN fallback
   */
  async shutdown(): Promise<void> {
    try {
      logger.info('Shutting down LAN fallback...', 'lan-fallback')

      this.stopInternetMonitoring()
      this.stopHeartbeat()

      // Withdraw service announcement
      await withdrawLANService(this.peerId)

      // Stop all relay servers
      for (const relay of this.localRelayServers.values()) {
        await relay.stop()
      }

      this.localRelayServers.clear()
      this.connectedPeers.clear()

      logger.info('LAN fallback shutdown complete', 'lan-fallback')
    } catch (err: any) {
      logger.error(`Error during LAN fallback shutdown: ${err.message}`, 'lan-fallback')
    }
  }

  /**
   * Start a local relay server
   */
  async startLocalRelay(name?: string): Promise<LocalRelayServer | null> {
    try {
      const ipAddress = getPrimaryNetworkAddress()
      if (!ipAddress) {
        logger.warn('Cannot start local relay: no network adapter found', 'lan-fallback')
        return null
      }

      const relayName = name || `relay_${this.peerId}`
      const relay = new LocalRelayServer(relayName, ipAddress, this.config.localRelayPort)

      if (await relay.start()) {
        this.localRelayServers.set(relayName, relay)
        logger.info(`Local relay server started: ${relayName}`, 'lan-fallback')
        this.emit('relay-started', relay.getInfo())
        return relay
      }

      return null
    } catch (err: any) {
      logger.error(`Failed to start local relay: ${err.message}`, 'lan-fallback')
      return null
    }
  }

  /**
   * Stop a local relay server
   */
  async stopLocalRelay(name: string): Promise<boolean> {
    try {
      const relay = this.localRelayServers.get(name)
      if (relay) {
        await relay.stop()
        this.localRelayServers.delete(name)
        logger.info(`Local relay server stopped: ${name}`, 'lan-fallback')
        this.emit('relay-stopped', { name })
        return true
      }
      return false
    } catch (err: any) {
      logger.error(`Failed to stop local relay: ${err.message}`, 'lan-fallback')
      return false
    }
  }

  /**
   * Discover and connect to LAN peers
   */
  async discoverAndConnectToPeers(): Promise<LANPeer[]> {
    try {
      const peers = await discoverLANServices(this.config)
      this.connectedPeers.clear()

      for (const peer of peers) {
        if (peer.peerId !== this.peerId) {
          this.connectedPeers.set(peer.peerId, peer)
        }
      }

      logger.info(`Discovered ${this.connectedPeers.size} LAN peer(s)`, 'lan-fallback')
      this.emit('peers-discovered', Array.from(this.connectedPeers.values()))

      return Array.from(this.connectedPeers.values())
    } catch (err: any) {
      logger.error(`Failed to discover LAN peers: ${err.message}`, 'lan-fallback')
      return []
    }
  }

  /**
   * Get current LAN status
   */
  getStatus(): LANStatus {
    return {
      mode: this.currentMode,
      isInternetAvailable: this.isInternetAvailable,
      lastInternetCheckTime: this.lastInternetCheckTime,
      connectedPeers: Array.from(this.connectedPeers.values()),
      localRelayServers: Array.from(this.localRelayServers.values()).map((relay) => relay.getInfo()),
      primaryIpAddress: getPrimaryNetworkAddress(),
      networkAdapters: getNetworkAdapters().length,
    }
  }

  /**
   * Get current mode
   */
  getMode(): LANMode {
    return this.currentMode
  }

  /**
   * Private: Update mode based on internet availability
   */
  private updateMode(): void {
    const lanAvailable = checkLANAvailability()
    const oldMode = this.currentMode

    if (this.isInternetAvailable) {
      this.currentMode = 'online'
    } else if (lanAvailable) {
      this.currentMode = 'lan_only'
    } else {
      this.currentMode = 'offline'
    }

    if (oldMode !== this.currentMode) {
      logger.info(`LAN fallback mode changed: ${oldMode} -> ${this.currentMode}`, 'lan-fallback')
      this.emit('mode-changed', { from: oldMode, to: this.currentMode })

      // Start local relay if switching to LAN-only mode
      if (this.currentMode === 'lan_only' && oldMode === 'online') {
        this.startLocalRelay().catch((err) => logger.warn(`Failed to auto-start relay: ${err.message}`, 'lan-fallback'))
      }
    }
  }

  /**
   * Private: Start internet monitoring
   */
  private startInternetMonitoring(): void {
    this.internetCheckHandle = setInterval(async () => {
      const wasOnline = this.isInternetAvailable
      this.isInternetAvailable = await checkInternetConnectivity()
      this.lastInternetCheckTime = Date.now()

      if (wasOnline !== this.isInternetAvailable) {
        logger.info(
          `Internet connectivity changed: ${wasOnline ? 'online' : 'offline'} -> ${this.isInternetAvailable ? 'online' : 'offline'}`,
          'lan-fallback'
        )
        this.updateMode()
      }
    }, this.config.checkInternetInterval)
  }

  /**
   * Private: Stop internet monitoring
   */
  private stopInternetMonitoring(): void {
    if (this.internetCheckHandle) {
      clearInterval(this.internetCheckHandle)
      this.internetCheckHandle = undefined
    }
  }

  /**
   * Private: Start heartbeat for peer discovery
   */
  private startHeartbeat(): void {
    this.heartbeatHandle = setInterval(async () => {
      if (this.currentMode === 'lan_only' || this.currentMode === 'offline') {
        // Periodically discover peers in LAN-only mode
        await this.discoverAndConnectToPeers()
      }
    }, this.config.heartbeatInterval)
  }

  /**
   * Private: Stop heartbeat
   */
  private stopHeartbeat(): void {
    if (this.heartbeatHandle) {
      clearInterval(this.heartbeatHandle)
      this.heartbeatHandle = undefined
    }
  }
}

/**
 * Create a new LAN fallback manager
 */
export function createLANFallbackManager(peerId: string, config?: Partial<LANFallbackConfig>): LANFallbackManager {
  return new LANFallbackManager(peerId, config)
}
