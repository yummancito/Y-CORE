// ============================================================================
// electron/modules/onlinefix-network-integration.ts
// ============================================================================
// Online Fix Network and P2P Layer Integration
// Integrates P2P detection, network config, connection management, and LAN fallback
// ============================================================================

import { ipcMain } from 'electron'
import fs from 'fs'
import path from 'path'
import { logger } from '../logger'
import {
  detectP2PProtocol,
  clearP2PDetectionCache,
  type P2PDetectionResult,
  type P2PProtocolConfig,
} from './p2p-detector'
import {
  buildNetworkConfiguration,
  exportNetworkConfigToJSON,
  exportNetworkConfigToEnv,
  type NetworkConfiguration,
} from './network-config'
import {
  P2PConnectionPool,
  createConnectionPool,
  type P2PConnectionOptions,
} from './p2p-connection'
import {
  LANFallbackManager,
  createLANFallbackManager,
  type LANFallbackConfig,
  type LANStatus,
} from './lan-fallback'

// ============================================================================
// Types
// ============================================================================

export interface OnlineFixNetworkConfig {
  enabled: boolean
  originalAppId: number
  spoofAppId: number
  steamId: number
  language: string
  generatedAt: string
  ycoreVersion: string
  // Network configuration
  p2pProtocol?: P2PProtocolConfig
  networkConfiguration?: NetworkConfiguration
  localPort?: number
  useRelay?: boolean
  useLANFallback?: boolean
}

export interface ConnectionManagerInstance {
  appId: string
  pool: P2PConnectionPool
  lanManager?: LANFallbackManager
  config: OnlineFixNetworkConfig
}

// ============================================================================
// Global State
// ============================================================================

const connectionManagers = new Map<string, ConnectionManagerInstance>()

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Load or create ycore_online.json with network configuration
 */
async function ensureNetworkConfig(gameDir: string, appId: string): Promise<OnlineFixNetworkConfig> {
  const configPath = path.join(gameDir, 'ycore_online.json')

  try {
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, 'utf-8')
      const config = JSON.parse(content) as OnlineFixNetworkConfig
      return config
    }
  } catch (err: any) {
    logger.warn(`Failed to load existing config: ${err.message}`, 'onlinefix-network')
  }

  // Create new config with network detection
  return {
    enabled: true,
    originalAppId: parseInt(appId, 10),
    spoofAppId: 480,
    steamId: 0,
    language: 'english',
    generatedAt: new Date().toISOString(),
    ycoreVersion: '3.0.1', // Should be from app.getVersion()
  }
}

/**
 * Save enhanced ycore_online.json with network configuration
 */
async function saveNetworkConfig(
  gameDir: string,
  config: OnlineFixNetworkConfig
): Promise<boolean> {
  try {
    const configPath = path.join(gameDir, 'ycore_online.json')
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8')
    logger.info(`Saved network configuration to ${configPath}`, 'onlinefix-network')
    return true
  } catch (err: any) {
    logger.error(`Failed to save network config: ${err.message}`, 'onlinefix-network')
    return false
  }
}

// ============================================================================
// Network Configuration Build
// ============================================================================

/**
 * Initialize network and P2P configuration for a game
 */
export async function initializeGameNetworking(
  gameDir: string,
  appId: string,
  localPort: number = 0
): Promise<OnlineFixNetworkConfig | null> {
  try {
    logger.info(`Initializing network configuration for appId ${appId}`, 'onlinefix-network')

    // Load existing config
    let config = await ensureNetworkConfig(gameDir, appId)

    // Detect P2P protocol
    logger.info('Detecting P2P protocol...', 'onlinefix-network')
    const p2pDetection = await detectP2PProtocol(gameDir, appId)
    config.p2pProtocol = p2pDetection.protocol

    // Build network configuration
    logger.info('Building network configuration...', 'onlinefix-network')
    const netConfig = await buildNetworkConfiguration(localPort)
    config.networkConfiguration = netConfig
    config.localPort = localPort

    // Determine fallback strategy
    const needsRelay = config.p2pProtocol.requiresRelay || config.p2pProtocol.natTraversalMethod === 'relay'
    const useLANFallback = true // Enable by default
    config.useRelay = needsRelay
    config.useLANFallback = useLANFallback

    // Save enhanced configuration
    await saveNetworkConfig(gameDir, config)

    logger.info(
      `Network configuration initialized: P2P=${config.p2pProtocol.type}, NAT=${netConfig.natType}, Relay=${config.useRelay}`,
      'onlinefix-network'
    )

    return config
  } catch (err: any) {
    logger.error(`Failed to initialize game networking: ${err.message}`, 'onlinefix-network')
    return null
  }
}

/**
 * Export network configuration for game use
 */
export async function exportGameNetworkConfig(
  gameDir: string,
  exportFormat: 'json' | 'env' = 'json'
): Promise<string | null> {
  try {
    const configPath = path.join(gameDir, 'ycore_online.json')

    if (!fs.existsSync(configPath)) {
      logger.warn('No network configuration found to export', 'onlinefix-network')
      return null
    }

    const content = fs.readFileSync(configPath, 'utf-8')
    const config = JSON.parse(content) as OnlineFixNetworkConfig

    if (!config.networkConfiguration) {
      logger.warn('Network configuration is incomplete', 'onlinefix-network')
      return null
    }

    if (exportFormat === 'env') {
      return exportNetworkConfigToEnv(config.networkConfiguration)
    } else {
      return exportNetworkConfigToJSON(config.networkConfiguration)
    }
  } catch (err: any) {
    logger.error(`Failed to export network config: ${err.message}`, 'onlinefix-network')
    return null
  }
}

// ============================================================================
// Connection Pool Management
// ============================================================================

/**
 * Create connection pool for game
 */
export function createGameConnectionPool(
  appId: string,
  maxConnections: number = 32,
  options?: Partial<P2PConnectionOptions>
): P2PConnectionPool {
  const pool = createConnectionPool(maxConnections, options)
  logger.info(`Created connection pool for appId ${appId} (max: ${maxConnections})`, 'onlinefix-network')
  return pool
}

/**
 * Get or create connection manager for app
 */
export async function getOrCreateConnectionManager(
  appId: string,
  gameDir: string,
  useLANFallback: boolean = true
): Promise<ConnectionManagerInstance | null> {
  try {
    // Check if already exists
    if (connectionManagers.has(appId)) {
      return connectionManagers.get(appId)!
    }

    // Load network config
    const config = await ensureNetworkConfig(gameDir, appId)

    // Create connection pool
    const connectionTimeout = config.p2pProtocol?.recommendedConnectionTimeout || 15000
    const pool = createGameConnectionPool(appId, 32, { connectionTimeout })

    // Create LAN fallback manager if enabled
    let lanManager: LANFallbackManager | undefined
    if (useLANFallback && config.p2pProtocol) {
      lanManager = createLANFallbackManager(appId)
      await lanManager.initialize()
      logger.info(`Initialized LAN fallback for appId ${appId}`, 'onlinefix-network')
    }

    const manager: ConnectionManagerInstance = {
      appId,
      pool,
      lanManager,
      config,
    }

    connectionManagers.set(appId, manager)
    logger.info(`Created connection manager for appId ${appId}`, 'onlinefix-network')

    return manager
  } catch (err: any) {
    logger.error(`Failed to create connection manager: ${err.message}`, 'onlinefix-network')
    return null
  }
}

/**
 * Get connection manager for app
 */
export function getConnectionManager(appId: string): ConnectionManagerInstance | null {
  return connectionManagers.get(appId) || null
}

/**
 * Close connection manager for app
 */
export async function closeConnectionManager(appId: string): Promise<void> {
  try {
    const manager = connectionManagers.get(appId)
    if (manager) {
      await manager.pool.closeAllConnections()

      if (manager.lanManager) {
        await manager.lanManager.shutdown()
      }

      connectionManagers.delete(appId)
      logger.info(`Closed connection manager for appId ${appId}`, 'onlinefix-network')
    }
  } catch (err: any) {
    logger.error(`Failed to close connection manager: ${err.message}`, 'onlinefix-network')
  }
}

/**
 * Close all connection managers
 */
export async function closeAllConnectionManagers(): Promise<void> {
  try {
    const appIds = Array.from(connectionManagers.keys())

    for (const appId of appIds) {
      await closeConnectionManager(appId)
    }

    logger.info('Closed all connection managers', 'onlinefix-network')
  } catch (err: any) {
    logger.error(`Failed to close all managers: ${err.message}`, 'onlinefix-network')
  }
}

// ============================================================================
// IPC Handlers
// ============================================================================

export function registerNetworkConfigHandlers() {
  /**
   * Initialize network configuration for a game
   */
  ipcMain.handle('onlinefix:network:initialize', async (_event, data: { appId: string; gameDir: string }) => {
    const { appId, gameDir } = data

    try {
      const config = await initializeGameNetworking(gameDir, appId)
      if (config) {
        return {
          success: true,
          config,
        }
      }
      return { success: false, error: 'Failed to initialize network configuration' }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  /**
   * Export network configuration
   */
  ipcMain.handle('onlinefix:network:export', async (_event, data: { appId: string; gameDir: string; format?: string }) => {
    const { gameDir, format } = data

    try {
      const exported = await exportGameNetworkConfig(gameDir, (format as any) || 'json')
      if (exported) {
        return {
          success: true,
          data: exported,
          format: format || 'json',
        }
      }
      return { success: false, error: 'No configuration to export' }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  /**
   * Get P2P protocol detection result
   */
  ipcMain.handle('onlinefix:network:detect-protocol', async (_event, data: { appId: string; gameDir: string }) => {
    const { appId, gameDir } = data

    try {
      const result = await detectP2PProtocol(gameDir, appId)
      return {
        success: true,
        protocol: result.protocol,
        confidence: result.protocol.detectionConfidence,
        detectedAPICalls: result.detectedAPICalls,
      }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  /**
   * Clear P2P detection cache
   */
  ipcMain.handle('onlinefix:network:clear-cache', async (_event, data?: { appId?: string }) => {
    try {
      clearP2PDetectionCache(data?.appId)
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  /**
   * Get connection pool statistics
   */
  ipcMain.handle('onlinefix:network:pool-stats', async (_event, data: { appId: string }) => {
    const { appId } = data

    try {
      const manager = getConnectionManager(appId)
      if (manager) {
        const stats = manager.pool.getStatistics()
        return {
          success: true,
          stats,
        }
      }
      return { success: false, error: 'Connection manager not found' }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  /**
   * Get LAN fallback status
   */
  ipcMain.handle('onlinefix:network:lan-status', async (_event, data: { appId: string }) => {
    const { appId } = data

    try {
      const manager = getConnectionManager(appId)
      if (manager && manager.lanManager) {
        const status = manager.lanManager.getStatus()
        return {
          success: true,
          status,
        }
      }
      return { success: false, error: 'LAN manager not found' }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  /**
   * Initialize connection manager
   */
  ipcMain.handle('onlinefix:network:init-manager', async (_event, data: { appId: string; gameDir: string }) => {
    const { appId, gameDir } = data

    try {
      const manager = await getOrCreateConnectionManager(appId, gameDir, true)
      if (manager) {
        return {
          success: true,
          appId,
          message: 'Connection manager initialized',
        }
      }
      return { success: false, error: 'Failed to create connection manager' }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  /**
   * Close connection manager
   */
  ipcMain.handle('onlinefix:network:close-manager', async (_event, data: { appId: string }) => {
    const { appId } = data

    try {
      await closeConnectionManager(appId)
      return {
        success: true,
        message: `Closed connection manager for ${appId}`,
      }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  logger.info('Network configuration IPC handlers registered', 'onlinefix-network')
}
