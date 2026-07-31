// ============================================================================
// electron/handlers/remote-play.handler.ts
// ============================================================================
// Remote Play IPC Handlers
// Registers IPC handlers for Remote Play and LAN mode operations
// ============================================================================

import { ipcMain } from 'electron'
import { logger } from '../logger'
import * as remotePlay from '../modules/remote-play'
import { remotePlayService } from '../services/remote-play.service'

/**
 * Register all Remote Play-related IPC handlers
 */
export function registerRemotePlayHandlers(): void {
  logger.info('Registering Remote Play handlers', 'remote-play-ipc')

  // ── Core Remote Play Handlers ────────────────────────────────────────────
  ipcMain.handle('remote:start-hosting', handleStartHosting)
  ipcMain.handle('remote:stop-hosting', handleStopHosting)
  ipcMain.handle('remote:discover-hosts', handleDiscoverHosts)
  ipcMain.handle('remote:connect-to-host', handleConnectToHost)
  ipcMain.handle('remote:disconnect', handleDisconnect)
  ipcMain.handle('remote:get-status', handleGetStatus)
  ipcMain.handle('remote:get-settings', handleGetSettings)
  ipcMain.handle('remote:update-settings', handleUpdateSettings)
  ipcMain.handle('remote:broadcast-signal', handleBroadcastSignal)

  // ── LAN Mode ─────────────────────────────────────────────────────────────
  // FIX #2: Remote Play LAN Mode — disable cloud signaling, use LAN discovery only
  ipcMain.handle('remote:enable-lan-mode', handleEnableLANMode)
  ipcMain.handle('remote:disable-lan-mode', handleDisableLANMode)
  ipcMain.handle('remote:is-lan-mode-enabled', handleIsLANModeEnabled)

  logger.info('Remote Play handlers registered successfully', 'remote-play-ipc')
}

// ============================================================================
// LAN Mode Handlers
// ============================================================================

/**
 * Enable LAN mode: disable cloud signaling, use LAN discovery only.
 * Returns status and available LAN peers.
 */
async function handleEnableLANMode(
  _event: any
): Promise<{ success: boolean; status: string; peers: any[] }> {
  try {
    logger.info('Enable LAN mode requested', 'remote-play-ipc')
    const result = await remotePlay.enableLANMode()

    return {
      success: result.success,
      status: result.status,
      peers: result.peers || [],
    }
  } catch (err: any) {
    logger.error(`Enable LAN mode failed: ${err?.message}`, 'remote-play-ipc')
    return {
      success: false,
      status: `Failed to enable LAN mode: ${err?.message || 'Unknown error'}`,
      peers: [],
    }
  }
}

/**
 * Disable LAN mode: return to cloud signaling
 */
async function handleDisableLANMode(
  _event: any
): Promise<{ success: boolean; status: string }> {
  try {
    logger.info('Disable LAN mode requested', 'remote-play-ipc')
    const result = await remotePlay.disableLANMode()

    return {
      success: result.success,
      status: result.status,
    }
  } catch (err: any) {
    logger.error(`Disable LAN mode failed: ${err?.message}`, 'remote-play-ipc')
    return {
      success: false,
      status: `Failed to disable LAN mode: ${err?.message || 'Unknown error'}`,
    }
  }
}

/**
 * Check if LAN mode is currently enabled
 */
async function handleIsLANModeEnabled(
  _event: any
): Promise<{ enabled: boolean }> {
  try {
    const enabled = remotePlay.isLANModeEnabled()
    return { enabled }
  } catch (err: any) {
    logger.error(`Check LAN mode status failed: ${err?.message}`, 'remote-play-ipc')
    return { enabled: false }
  }
}

// ============================================================================
// Core Remote Play Handlers (Implementaciones)
// ============================================================================

/**
 * Start hosting as server
 */
async function handleStartHosting(
  _event: any,
  opts?: any
): Promise<{ success: boolean; error?: string }> {
  try {
    logger.info('Starting Remote Play hosting', 'remote-play-ipc')
    const name = opts?.name || 'Y-Core Host'
    const port = opts?.port
    await remotePlay.startHosting(name, port)
    return { success: true }
  } catch (err: any) {
    logger.error(`Start hosting failed: ${err?.message}`, 'remote-play-ipc')
    return { success: false, error: err?.message || 'Unknown error' }
  }
}

/**
 * Stop hosting
 */
async function handleStopHosting(
  _event: any
): Promise<{ success: boolean; error?: string }> {
  try {
    logger.info('Stopping Remote Play hosting', 'remote-play-ipc')
    await remotePlay.stopHosting()
    return { success: true }
  } catch (err: any) {
    logger.error(`Stop hosting failed: ${err?.message}`, 'remote-play-ipc')
    return { success: false, error: err?.message || 'Unknown error' }
  }
}

/**
 * Discover available hosts on LAN
 */
async function handleDiscoverHosts(
  _event: any,
  timeout?: number
): Promise<{ success: boolean; hosts?: any[]; error?: string }> {
  try {
    logger.info('Discovering Remote Play hosts', 'remote-play-ipc')
    const hosts = await remotePlay.discoverHosts(timeout || 5000)
    return { success: true, hosts }
  } catch (err: any) {
    logger.error(`Discover hosts failed: ${err?.message}`, 'remote-play-ipc')
    return { success: false, error: err?.message || 'Unknown error' }
  }
}

/**
 * Connect to a remote host
 */
async function handleConnectToHost(
  _event: any,
  opts?: any
): Promise<{ success: boolean; error?: string }> {
  try {
    logger.info('Connecting to Remote Play host', 'remote-play-ipc')
    const host = opts?.host || 'localhost'
    const port = opts?.port || 42861
    await remotePlay.connectToHost(host, port)
    return { success: true }
  } catch (err: any) {
    logger.error(`Connect to host failed: ${err?.message}`, 'remote-play-ipc')
    return { success: false, error: err?.message || 'Unknown error' }
  }
}

/**
 * Disconnect from host
 */
async function handleDisconnect(
  _event: any
): Promise<{ success: boolean; error?: string }> {
  try {
    logger.info('Disconnecting from Remote Play', 'remote-play-ipc')
    await remotePlay.disconnect()
    return { success: true }
  } catch (err: any) {
    logger.error(`Disconnect failed: ${err?.message}`, 'remote-play-ipc')
    return { success: false, error: err?.message || 'Unknown error' }
  }
}

/**
 * Get current connection status
 */
async function handleGetStatus(
  _event: any
): Promise<{ success: boolean; status?: any; error?: string }> {
  try {
    const status = remotePlay.getStatus()
    return { success: true, status }
  } catch (err: any) {
    logger.error(`Get status failed: ${err?.message}`, 'remote-play-ipc')
    return { success: false, error: err?.message || 'Unknown error' }
  }
}

/**
 * Get current settings
 */
async function handleGetSettings(
  _event: any
): Promise<{ success: boolean; settings?: any; error?: string }> {
  try {
    const settings = remotePlay.getSettings()
    return { success: true, settings }
  } catch (err: any) {
    logger.error(`Get settings failed: ${err?.message}`, 'remote-play-ipc')
    return { success: false, error: err?.message || 'Unknown error' }
  }
}

/**
 * Update settings
 */
async function handleUpdateSettings(
  _event: any,
  settings?: any
): Promise<{ success: boolean; error?: string }> {
  try {
    logger.info('Updating Remote Play settings', 'remote-play-ipc')
    await remotePlay.updateSettings(settings || {})
    return { success: true }
  } catch (err: any) {
    logger.error(`Update settings failed: ${err?.message}`, 'remote-play-ipc')
    return { success: false, error: err?.message || 'Unknown error' }
  }
}

/**
 * Broadcast signal to connected clients
 */
async function handleBroadcastSignal(
  _event: any,
  signal?: any
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!signal) {
      logger.warn('Broadcast signal called without signal payload', 'remote-play-ipc')
      return { success: false, error: 'Signal payload is required' }
    }
    await remotePlayService.broadcastSignal(signal)
    return { success: true }
  } catch (err: any) {
    logger.error(`Broadcast signal failed: ${err?.message}`, 'remote-play-ipc')
    return { success: false, error: err?.message || 'Unknown error' }
  }
}
