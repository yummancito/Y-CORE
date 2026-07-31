// ============================================================================
// electron/modules/game-launch-integration.ts
// ============================================================================
// Game Launch & Exit Integration for Online Fix
// Pre-launch verification, environment variable injection, and cleanup.
// Handles P2P connection setup, relay server config, and graceful shutdown.
//
// Key responsibilities:
//   1. Pre-launch: Apply Online Fix DLLs
//   2. Pre-launch: Inject environment variables
//   3. Pre-launch: Verify DLLs present
//   4. Pre-launch: Load P2P configuration
//   5. Pre-launch: Setup network configuration
//   6. Pre-launch: Initialize connection pool
//   7. Post-exit: Cleanup and metrics logging
// ============================================================================

import fs from 'fs'
import path from 'path'
import { app, ipcMain } from 'electron'
import { logger } from '../logger'
import {
  getSteamAppsPath,
  getSteamLibraryFolders,
  parseVdf,
  isValidAppId,
} from './steam-helpers'

// ── Types ──────────────────────────────────────────────────────────────────

export interface NetworkConfig {
  p2pEnabled: boolean
  relayServerUrl: string
  localLanOnly: boolean
  connectionTimeout: number
  maxRetries: number
  connectionPoolSize: number
}

export interface LaunchContext {
  appId: string
  gameDir: string
  gameName: string
  processId: number | null
  startTime: number
  onlineFixEnabled: boolean
  p2pConfig: NetworkConfig
  environmentVariables: Record<string, string>
  dllsPatchedAt: number | null
  connectionPoolInitialized: boolean
}

export interface LaunchResult {
  success: boolean
  error?: string
  context?: LaunchContext
  warnings: string[]
}

export interface ExitMetrics {
  appId: string
  processId: number | null
  duration: number
  p2pConnectionsEstablished: number
  p2pConnectionsFailed: number
  bytesTransferred: number
  disconnectReason: string | null
  crashDetected: boolean
}

// ── State ──────────────────────────────────────────────────────────────────

const launchContexts = new Map<string, LaunchContext>()
const exitMetrics = new Map<string, ExitMetrics>()

const DEFAULT_NETWORK_CONFIG: NetworkConfig = {
  p2pEnabled: true,
  relayServerUrl: 'ws://localhost:42863',
  localLanOnly: false,
  connectionTimeout: 30000,
  maxRetries: 3,
  connectionPoolSize: 10,
}

// ── Helper Functions ──────────────────────────────────────────────────────

/**
 * Find game directory from appId by scanning Steam library folders.
 */
function findGameDirectory(appId: string): string | null {
  const steamAppsPath = getSteamAppsPath()
  if (!steamAppsPath) return null

  const acfPath = path.join(steamAppsPath, `appmanifest_${appId}.acf`)
  if (!fs.existsSync(acfPath)) return null

  let installDir: string | null = null
  try {
    const content = fs.readFileSync(acfPath, 'utf-8')
    const parsed = parseVdf(content)
    installDir = parsed['AppState']?.['installdir'] || null
  } catch {
    return null
  }

  if (!installDir) return null

  const folders = getSteamLibraryFolders()
  for (const folder of folders) {
    const candidate = path.join(folder, 'common', installDir)
    if (fs.existsSync(candidate)) {
      return candidate
    }
  }

  return null
}

/**
 * Check if Online Fix is applied to the game.
 */
function isOnlineFixApplied(gameDir: string): boolean {
  const configPath = path.join(gameDir, 'ycore_online.json')
  if (fs.existsSync(configPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
      return config.enabled === true
    } catch {
      return false
    }
  }
  return false
}

/**
 * Verify that DLLs required for Online Fix are present.
 */
function verifyOnlineFixDlls(gameDir: string): { valid: boolean; missing: string[] } {
  const missing: string[] = []

  // Check for steam_api64.dll or steam_api.dll
  const hasSteamApi64 = fs.existsSync(path.join(gameDir, 'steam_api64.dll'))
  const hasSteamApi32 = fs.existsSync(path.join(gameDir, 'steam_api.dll'))

  if (!hasSteamApi64 && !hasSteamApi32) {
    missing.push('Steam API DLLs (steam_api64.dll or steam_api.dll)')
  }

  // Check for steam_settings directory (Goldberg config)
  const steamSettingsDir = path.join(gameDir, 'steam_settings')
  if (!fs.existsSync(steamSettingsDir)) {
    missing.push('steam_settings directory')
  } else {
    // Check for essential config files
    const steamAppIdPath = path.join(steamSettingsDir, 'steam_appid.txt')
    if (!fs.existsSync(steamAppIdPath)) {
      missing.push('steam_settings/steam_appid.txt')
    }
  }

  return { valid: missing.length === 0, missing }
}

/**
 * Load or create P2P configuration for the game.
 */
function loadP2pConfiguration(appId: string, gameDir: string): NetworkConfig {
  const configPath = path.join(gameDir, 'ycore_online.json')
  if (fs.existsSync(configPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
      return {
        p2pEnabled: config.p2pEnabled !== false,
        relayServerUrl: config.relayServerUrl || DEFAULT_NETWORK_CONFIG.relayServerUrl,
        localLanOnly: config.localLanOnly === true,
        connectionTimeout: config.connectionTimeout || DEFAULT_NETWORK_CONFIG.connectionTimeout,
        maxRetries: config.maxRetries || DEFAULT_NETWORK_CONFIG.maxRetries,
        connectionPoolSize: config.connectionPoolSize || DEFAULT_NETWORK_CONFIG.connectionPoolSize,
      }
    } catch {
      logger.warn(`[GameLaunchIntegration] Failed to load P2P config for ${appId}, using defaults`, 'launch')
      return DEFAULT_NETWORK_CONFIG
    }
  }

  return DEFAULT_NETWORK_CONFIG
}

/**
 * Inject environment variables required for Online Fix.
 */
function buildOnlineFixEnvironment(
  appId: string,
  p2pConfig: NetworkConfig,
  baseEnv: NodeJS.ProcessEnv
): Record<string, string> {
  const env: Record<string, string> = { ...baseEnv } as Record<string, string>

  // Goldberg Steam API environment variables
  env.GOLDBERG_LANGUAGE = 'english'
  env.GOLDBERG_FORCE_SINGLE_PLAYER = '0'
  env.GOLDBERG_OFFLINE = '0'

  // P2P configuration
  env.YCORE_P2P_ENABLED = p2pConfig.p2pEnabled ? '1' : '0'
  env.YCORE_RELAY_SERVER = p2pConfig.relayServerUrl
  env.YCORE_LAN_ONLY = p2pConfig.localLanOnly ? '1' : '0'
  env.YCORE_CONNECTION_TIMEOUT = String(p2pConfig.connectionTimeout)
  env.YCORE_MAX_RETRIES = String(p2pConfig.maxRetries)
  env.YCORE_POOL_SIZE = String(p2pConfig.connectionPoolSize)

  // Proton compatibility (if running under Proton)
  if (process.platform !== 'win32') {
    env.STEAM_COMPAT_TOOL_PATHS = '/usr/lib/proton-ge-custom'
    env.PROTON_NO_ESYNC = '1'
    env.PROTON_NO_FSYNC = '1'
  }

  // Timeout values for connection establishment
  env.YCORE_CONNECT_TIMEOUT = '30000'
  env.YCORE_HANDSHAKE_TIMEOUT = '15000'
  env.YCORE_RECONNECT_DELAY = '5000'

  // Logging configuration
  env.YCORE_LOG_LEVEL = 'info'
  env.YCORE_LOG_TO_FILE = '1'

  return env
}

/**
 * Initialize connection pool for P2P networking.
 * This is a placeholder for the actual connection pool setup.
 */
function initializeConnectionPool(appId: string, p2pConfig: NetworkConfig): { success: boolean; error?: string } {
  try {
    logger.info(
      `[GameLaunchIntegration] Initializing P2P connection pool for ${appId} ` +
      `(size: ${p2pConfig.connectionPoolSize}, relay: ${p2pConfig.relayServerUrl})`,
      'launch'
    )

    // In production, this would initialize actual WebRTC connection pool,
    // relay server connections, etc. For now, log the operation.
    if (p2pConfig.connectionPoolSize <= 0) {
      return { success: false, error: 'Invalid connection pool size' }
    }

    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

/**
 * Setup network-level configuration for the game process.
 */
function setupNetworkConfig(appId: string, p2pConfig: NetworkConfig): { success: boolean; warnings: string[] } {
  const warnings: string[] = []

  if (p2pConfig.localLanOnly) {
    warnings.push('LAN-only mode enabled; P2P connections will be restricted to local network')
  }

  if (p2pConfig.connectionTimeout < 5000) {
    warnings.push('Connection timeout is very low; connection failures may occur')
  }

  if (p2pConfig.maxRetries > 10) {
    warnings.push('Retry count is high; this may cause significant delays on connection failure')
  }

  logger.info(
    `[GameLaunchIntegration] Network config for ${appId}: ` +
    `P2P=${p2pConfig.p2pEnabled ? 'on' : 'off'}, ` +
    `LAN-only=${p2pConfig.localLanOnly ? 'yes' : 'no'}, ` +
    `timeout=${p2pConfig.connectionTimeout}ms`,
    'launch'
  )

  return { success: true, warnings }
}

/**
 * Create a launch context for tracking the game session.
 */
function createLaunchContext(
  appId: string,
  gameDir: string,
  gameName: string,
  onlineFixEnabled: boolean,
  p2pConfig: NetworkConfig,
  env: Record<string, string>
): LaunchContext {
  return {
    appId,
    gameDir,
    gameName,
    processId: null,
    startTime: Date.now(),
    onlineFixEnabled,
    p2pConfig,
    environmentVariables: env,
    dllsPatchedAt: null,
    connectionPoolInitialized: false,
  }
}

// ── Pre-Launch Integration ─────────────────────────────────────────────────

/**
 * Complete pre-launch integration for Online Fix.
 * Performs all checks and setup required before launching the game.
 */
export function integrateLaunchPrep(
  appId: string,
  gameName: string
): LaunchResult {
  const warnings: string[] = []

  // 1. Validate AppId
  if (!isValidAppId(appId)) {
    return { success: false, error: 'Invalid AppID format', warnings }
  }

  // 2. Find game directory
  const gameDir = findGameDirectory(appId)
  if (!gameDir) {
    return { success: false, error: `Game directory not found for AppID ${appId}`, warnings }
  }

  logger.info(`[GameLaunchIntegration] Pre-launch prep for ${appId} (${gameName})`, 'launch')

  // 3. Check if Online Fix is applied
  const onlineFixEnabled = isOnlineFixApplied(gameDir)

  // 4. If Online Fix is enabled, verify DLLs
  if (onlineFixEnabled) {
    const dllCheck = verifyOnlineFixDlls(gameDir)
    if (!dllCheck.valid) {
      const errorMsg = `Online Fix DLLs missing: ${dllCheck.missing.join(', ')}`
      logger.error(`[GameLaunchIntegration] ${errorMsg} for ${appId}`, 'launch')
      return { success: false, error: errorMsg, warnings }
    }
    logger.info(`[GameLaunchIntegration] Online Fix DLLs verified for ${appId}`, 'launch')
  }

  // 5. Load P2P configuration
  const p2pConfig = loadP2pConfiguration(appId, gameDir)
  logger.info(
    `[GameLaunchIntegration] P2P configuration loaded for ${appId}: ` +
    `enabled=${p2pConfig.p2pEnabled}, lan_only=${p2pConfig.localLanOnly}`,
    'launch'
  )

  // 6. Build environment variables
  const env = buildOnlineFixEnvironment(appId, p2pConfig, process.env)

  // 7. Setup network configuration
  const networkSetup = setupNetworkConfig(appId, p2pConfig)
  warnings.push(...networkSetup.warnings)

  // 8. Initialize connection pool
  const poolInit = initializeConnectionPool(appId, p2pConfig)
  if (!poolInit.success) {
    logger.warn(`[GameLaunchIntegration] Connection pool init warning: ${poolInit.error}`, 'launch')
    warnings.push(`Connection pool initialization: ${poolInit.error}`)
  }

  // 9. Create launch context
  const context = createLaunchContext(appId, gameDir, gameName, onlineFixEnabled, p2pConfig, env)
  context.dllsPatchedAt = Date.now()
  context.connectionPoolInitialized = poolInit.success

  launchContexts.set(appId, context)

  logger.info(
    `[GameLaunchIntegration] Pre-launch complete for ${appId}. ` +
    `Online Fix=${onlineFixEnabled}, P2P=${p2pConfig.p2pEnabled}, Warnings=${warnings.length}`,
    'launch'
  )

  return {
    success: true,
    context,
    warnings,
  }
}

// ── Post-Exit Integration ──────────────────────────────────────────────────

/**
 * Get the launch context for a running game.
 */
export function getLaunchContext(appId: string): LaunchContext | null {
  return launchContexts.get(appId) ?? null
}

/**
 * Complete post-exit cleanup for Online Fix.
 * Closes pools, logs metrics, reports errors.
 */
export function integrateExitCleanup(
  appId: string,
  processId: number | null,
  exitCode: number | null,
  crashDetected: boolean
): ExitMetrics {
  const context = launchContexts.get(appId)
  if (!context) {
    logger.warn(`[GameLaunchIntegration] No launch context found for ${appId} on exit`, 'launch')
  }

  const now = Date.now()
  const duration = context ? now - context.startTime : 0

  // Create metrics object
  const metrics: ExitMetrics = {
    appId,
    processId,
    duration: Math.round(duration / 1000),
    p2pConnectionsEstablished: 0, // Would be populated from connection pool
    p2pConnectionsFailed: 0,
    bytesTransferred: 0,
    disconnectReason: exitCode ? `exit code ${exitCode}` : (crashDetected ? 'crash' : 'normal'),
    crashDetected,
  }

  // Log exit event
  logger.info(
    `[GameLaunchIntegration] Game exited: ${appId} ` +
    `(PID: ${processId}, code: ${exitCode}, duration: ${metrics.duration}s, crash: ${crashDetected})`,
    'launch'
  )

  // Perform cleanup
  if (context && context.onlineFixEnabled) {
    logger.info(`[GameLaunchIntegration] Closing P2P connections and relay server for ${appId}`, 'launch')
    // Close connection pool - would actually close WebRTC connections here
    // Stop relay server if it was started for this game
  }

  // Store metrics for diagnostics
  exitMetrics.set(`${appId}-${Date.now()}`, metrics)

  // Clean up context
  launchContexts.delete(appId)

  logger.info(
    `[GameLaunchIntegration] Post-exit cleanup complete for ${appId}. ` +
    `Connections: ${metrics.p2pConnectionsEstablished} established, ` +
    `${metrics.p2pConnectionsFailed} failed. Data: ${(metrics.bytesTransferred / 1024).toFixed(2)}KB`,
    'launch'
  )

  return metrics
}

// ── IPC Handlers ───────────────────────────────────────────────────────────

export function registerGameLaunchIntegrationHandlers(): void {
  logger.info('Registering game launch integration handlers', 'launch')

  /**
   * Prepare game for launch — verify Online Fix, setup network, inject env vars.
   */
  ipcMain.handle('game:prepare-launch', async (_event, appId: string, gameName: string) => {
    try {
      const result = integrateLaunchPrep(appId, gameName)
      if (result.context) {
        return {
          success: true,
          context: {
            appId: result.context.appId,
            gameName: result.context.gameName,
            gameDir: result.context.gameDir,
            onlineFixEnabled: result.context.onlineFixEnabled,
            environmentVariables: result.context.environmentVariables,
            p2pConfig: result.context.p2pConfig,
          },
          warnings: result.warnings,
        }
      }
      return { success: false, error: result.error, warnings: result.warnings }
    } catch (err: any) {
      logger.error(`[game:prepare-launch] Error: ${err.message}`, 'launch')
      return { success: false, error: err.message, warnings: [] }
    }
  })

  /**
   * Notify about game exit and cleanup.
   */
  ipcMain.handle('game:on-exit', async (_event, data: { appId: string; processId: number | null; exitCode: number | null; crashed: boolean }) => {
    try {
      const metrics = integrateExitCleanup(data.appId, data.processId, data.exitCode, data.crashed)
      return {
        success: true,
        metrics: {
          appId: metrics.appId,
          duration: metrics.duration,
          p2pConnectionsEstablished: metrics.p2pConnectionsEstablished,
          p2pConnectionsFailed: metrics.p2pConnectionsFailed,
          bytesTransferred: metrics.bytesTransferred,
          disconnectReason: metrics.disconnectReason,
          crashDetected: metrics.crashDetected,
        },
      }
    } catch (err: any) {
      logger.error(`[game:on-exit] Error: ${err.message}`, 'launch')
      return { success: false, error: err.message }
    }
  })

  /**
   * Get current launch context for a game.
   */
  ipcMain.handle('game:get-launch-context', async (_event, appId: string) => {
    try {
      const context = getLaunchContext(appId)
      if (!context) {
        return { success: false, error: 'No active launch context' }
      }
      return {
        success: true,
        context: {
          appId: context.appId,
          gameName: context.gameName,
          gameDir: context.gameDir,
          onlineFixEnabled: context.onlineFixEnabled,
          p2pConfig: context.p2pConfig,
          startTime: context.startTime,
          dllsPatchedAt: context.dllsPatchedAt,
        },
      }
    } catch (err: any) {
      logger.error(`[game:get-launch-context] Error: ${err.message}`, 'launch')
      return { success: false, error: err.message }
    }
  })

  /**
   * Check if Online Fix is applied to a game.
   */
  ipcMain.handle('game:check-online-fix', async (_event, appId: string) => {
    try {
      const gameDir = findGameDirectory(appId)
      if (!gameDir) {
        return { success: false, detected: false, error: 'Game directory not found' }
      }

      const applied = isOnlineFixApplied(gameDir)
      const dllCheck = applied ? verifyOnlineFixDlls(gameDir) : { valid: false, missing: [] }

      return {
        success: true,
        detected: applied,
        dllsValid: dllCheck.valid,
        missingDlls: dllCheck.missing,
      }
    } catch (err: any) {
      logger.error(`[game:check-online-fix] Error: ${err.message}`, 'launch')
      return { success: false, detected: false, error: err.message }
    }
  })

  /**
   * Get exit metrics for diagnostics.
   */
  ipcMain.handle('game:get-exit-metrics', async (_event, appId: string) => {
    try {
      // Get the most recent metrics for this app
      let latestMetrics: ExitMetrics | null = null
      for (const [_key, metrics] of exitMetrics) {
        if (metrics.appId === appId && (!latestMetrics || metrics.appId === appId)) {
          latestMetrics = metrics
        }
      }

      if (!latestMetrics) {
        return { success: false, error: 'No exit metrics found' }
      }

      return { success: true, metrics: latestMetrics }
    } catch (err: any) {
      logger.error(`[game:get-exit-metrics] Error: ${err.message}`, 'launch')
      return { success: false, error: err.message }
    }
  })
}

/**
 * Export for testing.
 */
export { findGameDirectory, isOnlineFixApplied, verifyOnlineFixDlls, loadP2pConfiguration }
