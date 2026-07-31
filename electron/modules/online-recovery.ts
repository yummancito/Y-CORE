// ============================================================================
// electron/modules/online-recovery.ts
// ============================================================================
// Error Recovery & Resilience System for Online Fix
// Detects failed P2P connections, retries with exponential backoff,
// and provides graceful degradation to LAN-only mode.
//
// Key responsibilities:
//   1. Detect failed P2P connections
//   2. Retry logic with exponential backoff
//   3. Reconnection mechanism
//   4. Fallback to LAN-only if network fails
//   5. Graceful degradation (disable Online Fix if repeated failures)
//   6. User notification system
// ============================================================================

import { ipcMain, BrowserWindow } from 'electron'
import { logger } from '../logger'

// ── Types ──────────────────────────────────────────────────────────────────

export interface ConnectionError {
  appId: string
  timestamp: number
  type: 'p2p_connect' | 'relay_connect' | 'handshake' | 'peer_discovery' | 'unknown'
  message: string
  retriable: boolean
  lastAttempt?: number
  attemptCount: number
  nextRetryTime?: number
}

export interface RecoveryState {
  appId: string
  connected: boolean
  connectionMode: 'p2p' | 'relay' | 'lan' | 'offline' | 'disabled'
  lastError: ConnectionError | null
  attemptCount: number
  failureCount: number
  lastSuccessfulConnection: number | null
  degradationLevel: 'healthy' | 'degraded' | 'critical' | 'disabled'
}

export interface RecoveryAction {
  action: 'retry' | 'switch_to_lan' | 'disable_online_fix' | 'notify_user' | 'wait'
  delay?: number
  message?: string
  notify: boolean
}

// ── State Management ───────────────────────────────────────────────────────

const recoveryStates = new Map<string, RecoveryState>()
const connectionErrors = new Map<string, ConnectionError[]>()
const retryTimers = new Map<string, NodeJS.Timeout>()

const ERROR_HISTORY_LIMIT = 50
const MAX_RETRIES = 3
const BASE_RETRY_DELAY_MS = 1000
const MAX_RETRY_DELAY_MS = 30000

// ── Configuration ──────────────────────────────────────────────────────────

export interface RecoveryConfig {
  autoRetryEnabled: boolean
  maxRetries: number
  initialRetryDelay: number
  maxRetryDelay: number
  exponentialBackoffFactor: number
  degradationThreshold: number
  autoDisableThreshold: number
  notifyOnDegradation: boolean
  lanFallbackEnabled: boolean
}

const DEFAULT_RECOVERY_CONFIG: RecoveryConfig = {
  autoRetryEnabled: true,
  maxRetries: MAX_RETRIES,
  initialRetryDelay: BASE_RETRY_DELAY_MS,
  maxRetryDelay: MAX_RETRY_DELAY_MS,
  exponentialBackoffFactor: 2,
  degradationThreshold: 3, // After 3 failures, enter degraded mode
  autoDisableThreshold: 10, // After 10 failures, disable Online Fix
  notifyOnDegradation: true,
  lanFallbackEnabled: true,
}

let recoveryConfig = { ...DEFAULT_RECOVERY_CONFIG }

// ── Helper Functions ──────────────────────────────────────────────────────

/**
 * Calculate exponential backoff delay.
 */
function calculateBackoffDelay(attemptNumber: number, config: RecoveryConfig): number {
  const delay = Math.min(
    config.initialRetryDelay * Math.pow(config.exponentialBackoffFactor, attemptNumber - 1),
    config.maxRetryDelay
  )
  // Add jitter (±10%) to avoid thundering herd
  const jitter = delay * 0.1 * (Math.random() - 0.5)
  return Math.round(delay + jitter)
}

/**
 * Determine connection error type from message.
 */
function classifyError(message: string): ConnectionError['type'] {
  const lower = message.toLowerCase()
  if (lower.includes('relay') || lower.includes('signaling')) return 'relay_connect'
  if (lower.includes('handshake')) return 'handshake'
  if (lower.includes('peer') || lower.includes('discovery')) return 'peer_discovery'
  if (lower.includes('connect')) return 'p2p_connect'
  return 'unknown'
}

/**
 * Determine if an error is retriable.
 */
function isErrorRetriable(type: ConnectionError['type']): boolean {
  switch (type) {
    case 'p2p_connect':
    case 'relay_connect':
    case 'handshake':
    case 'peer_discovery':
      return true
    default:
      return false
  }
}

/**
 * Get or create recovery state for an app.
 */
function getOrCreateRecoveryState(appId: string): RecoveryState {
  if (!recoveryStates.has(appId)) {
    recoveryStates.set(appId, {
      appId,
      connected: false,
      connectionMode: 'offline',
      lastError: null,
      attemptCount: 0,
      failureCount: 0,
      lastSuccessfulConnection: null,
      degradationLevel: 'healthy',
    })
  }
  return recoveryStates.get(appId)!
}

/**
 * Determine the recovery action for a given error.
 */
function determineRecoveryAction(error: ConnectionError, state: RecoveryState, config: RecoveryConfig): RecoveryAction {
  if (!error.retriable) {
    return {
      action: 'disable_online_fix',
      message: 'Non-retriable error occurred. Online Fix will be disabled.',
      notify: true,
    }
  }

  // Check if we've exceeded max retries
  if (error.attemptCount >= config.maxRetries) {
    // Try LAN-only mode as fallback
    if (config.lanFallbackEnabled && state.connectionMode !== 'lan') {
      return {
        action: 'switch_to_lan',
        message: 'P2P connection failed. Falling back to LAN-only mode.',
        notify: config.notifyOnDegradation,
      }
    }

    // If already in LAN mode, disable Online Fix
    return {
      action: 'disable_online_fix',
      message: 'LAN-only mode also failed. Online Fix will be disabled.',
      notify: true,
    }
  }

  // Calculate retry delay
  const delay = calculateBackoffDelay(error.attemptCount + 1, config)

  // Check degradation status
  if (state.failureCount >= config.autoDisableThreshold) {
    return {
      action: 'disable_online_fix',
      message: `Too many failures (${state.failureCount}). Online Fix will be disabled.`,
      notify: true,
    }
  }

  if (state.failureCount >= config.degradationThreshold && state.degradationLevel === 'healthy') {
    return {
      action: 'notify_user',
      message: 'P2P connection issues detected. Your game may experience reduced functionality.',
      delay,
      notify: true,
    }
  }

  return {
    action: 'retry',
    delay,
    message: `Retrying P2P connection (attempt ${error.attemptCount + 1}/${config.maxRetries})...`,
    notify: false,
  }
}

/**
 * Update degradation level based on failure count.
 */
function updateDegradationLevel(state: RecoveryState, config: RecoveryConfig): void {
  const previous = state.degradationLevel

  if (state.failureCount >= config.autoDisableThreshold) {
    state.degradationLevel = 'disabled'
  } else if (state.failureCount >= config.degradationThreshold) {
    state.degradationLevel = 'critical'
  } else if (state.failureCount > 0) {
    state.degradationLevel = 'degraded'
  } else {
    state.degradationLevel = 'healthy'
  }

  if (previous !== state.degradationLevel) {
    logger.info(
      `[OnlineRecovery] Degradation level changed for ${state.appId}: ${previous} → ${state.degradationLevel}`,
      'recovery'
    )
  }
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Report a connection error and get recovery action.
 */
export function reportConnectionError(appId: string, errorMessage: string): RecoveryAction {
  logger.warn(`[OnlineRecovery] Connection error reported for ${appId}: ${errorMessage}`, 'recovery')

  const state = getOrCreateRecoveryState(appId)
  const type = classifyError(errorMessage)
  const retriable = isErrorRetriable(type)

  const error: ConnectionError = {
    appId,
    timestamp: Date.now(),
    type,
    message: errorMessage,
    retriable,
    attemptCount: state.attemptCount + 1,
    lastAttempt: Date.now(),
  }

  // Add to error history
  if (!connectionErrors.has(appId)) {
    connectionErrors.set(appId, [])
  }
  const errors = connectionErrors.get(appId)!
  errors.push(error)
  if (errors.length > ERROR_HISTORY_LIMIT) {
    errors.shift()
  }

  // Update state
  state.lastError = error
  state.attemptCount = error.attemptCount
  state.failureCount += 1
  updateDegradationLevel(state, recoveryConfig)

  // Determine recovery action
  const action = determineRecoveryAction(error, state, recoveryConfig)

  // Log the action
  logger.info(
    `[OnlineRecovery] Recovery action for ${appId}: ${action.action} ` +
    `(failures: ${state.failureCount}, degradation: ${state.degradationLevel})`,
    'recovery'
  )

  return action
}

/**
 * Report successful connection.
 */
export function reportConnectionSuccess(appId: string, connectionMode: 'p2p' | 'relay' | 'lan' = 'p2p'): void {
  const state = getOrCreateRecoveryState(appId)
  state.connected = true
  state.connectionMode = connectionMode
  state.attemptCount = 0
  state.lastSuccessfulConnection = Date.now()
  state.degradationLevel = 'healthy'

  // Clear any pending retry timer
  const timerId = retryTimers.get(appId)
  if (timerId) {
    clearTimeout(timerId)
    retryTimers.delete(appId)
  }

  logger.info(`[OnlineRecovery] Connection successful for ${appId} (mode: ${connectionMode})`, 'recovery')
}

/**
 * Start a retry attempt.
 */
export function scheduleRetry(appId: string, delayMs: number): void {
  // Clear existing timer
  const existingId = retryTimers.get(appId)
  if (existingId) {
    clearTimeout(existingId)
  }

  logger.info(`[OnlineRecovery] Scheduling retry for ${appId} in ${delayMs}ms`, 'recovery')

  const timer = setTimeout(() => {
    retryTimers.delete(appId)
    logger.info(`[OnlineRecovery] Retry timer expired for ${appId}`, 'recovery')
    // Emit event to trigger actual retry
    const windows = BrowserWindow.getAllWindows()
    for (const win of windows) {
      win.webContents.send('recovery:retry-ready', { appId })
    }
  }, delayMs)

  retryTimers.set(appId, timer)
}

/**
 * Enable LAN-only mode for a game.
 */
export function enableLanOnlyMode(appId: string): boolean {
  const state = getOrCreateRecoveryState(appId)
  if (state.connectionMode === 'lan') {
    return true // Already in LAN mode
  }

  state.connectionMode = 'lan'
  state.degradationLevel = state.degradationLevel === 'healthy' ? 'healthy' : 'degraded'

  logger.info(`[OnlineRecovery] LAN-only mode enabled for ${appId}`, 'recovery')

  // Notify user
  const windows = BrowserWindow.getAllWindows()
  for (const win of windows) {
    win.webContents.send('recovery:mode-changed', {
      appId,
      mode: 'lan',
      message: 'Switched to LAN-only mode. Online features will be limited.',
    })
  }

  return true
}

/**
 * Disable Online Fix for a game due to repeated failures.
 */
export function disableOnlineFixDueToFailures(appId: string, reason: string): boolean {
  const state = getOrCreateRecoveryState(appId)
  state.connectionMode = 'disabled'
  state.degradationLevel = 'disabled'
  state.connected = false

  logger.error(`[OnlineRecovery] Online Fix disabled for ${appId}: ${reason}`, 'recovery')

  // Notify user
  const windows = BrowserWindow.getAllWindows()
  for (const win of windows) {
    win.webContents.send('recovery:disabled', {
      appId,
      reason,
      message: `Online Fix has been disabled due to: ${reason}. Try re-enabling it in game settings.`,
    })
  }

  return true
}

/**
 * Get current recovery state for an app.
 */
export function getRecoveryState(appId: string): RecoveryState | null {
  return recoveryStates.get(appId) ?? null
}

/**
 * Get error history for an app.
 */
export function getErrorHistory(appId: string): ConnectionError[] {
  return connectionErrors.get(appId) ?? []
}

/**
 * Reset recovery state for an app.
 */
export function resetRecoveryState(appId: string): void {
  recoveryStates.delete(appId)
  connectionErrors.delete(appId)
  const timerId = retryTimers.get(appId)
  if (timerId) {
    clearTimeout(timerId)
    retryTimers.delete(appId)
  }
  logger.info(`[OnlineRecovery] Recovery state reset for ${appId}`, 'recovery')
}

/**
 * Update recovery configuration.
 */
export function updateRecoveryConfig(partial: Partial<RecoveryConfig>): void {
  recoveryConfig = { ...recoveryConfig, ...partial }
  logger.info(`[OnlineRecovery] Configuration updated: ${JSON.stringify(partial)}`, 'recovery')
}

/**
 * Get current recovery configuration.
 */
export function getRecoveryConfig(): RecoveryConfig {
  return { ...recoveryConfig }
}

// ── IPC Handlers ───────────────────────────────────────────────────────────

export function registerOnlineRecoveryHandlers(): void {
  logger.info('Registering online recovery handlers', 'recovery')

  /**
   * Report a connection error.
   */
  ipcMain.handle('recovery:report-error', async (_event, appId: string, errorMessage: string) => {
    try {
      const action = reportConnectionError(appId, errorMessage)
      return { success: true, action }
    } catch (err: any) {
      logger.error(`[recovery:report-error] Error: ${err.message}`, 'recovery')
      return { success: false, error: err.message }
    }
  })

  /**
   * Report successful connection.
   */
  ipcMain.handle('recovery:report-success', async (_event, appId: string, connectionMode: string) => {
    try {
      reportConnectionSuccess(appId, connectionMode as any)
      return { success: true }
    } catch (err: any) {
      logger.error(`[recovery:report-success] Error: ${err.message}`, 'recovery')
      return { success: false, error: err.message }
    }
  })

  /**
   * Get recovery state.
   */
  ipcMain.handle('recovery:get-state', async (_event, appId: string) => {
    try {
      const state = getRecoveryState(appId)
      if (!state) {
        return { success: false, error: 'No recovery state found' }
      }
      return { success: true, state }
    } catch (err: any) {
      logger.error(`[recovery:get-state] Error: ${err.message}`, 'recovery')
      return { success: false, error: err.message }
    }
  })

  /**
   * Get error history.
   */
  ipcMain.handle('recovery:get-error-history', async (_event, appId: string) => {
    try {
      const history = getErrorHistory(appId)
      return { success: true, errors: history }
    } catch (err: any) {
      logger.error(`[recovery:get-error-history] Error: ${err.message}`, 'recovery')
      return { success: false, error: err.message }
    }
  })

  /**
   * Enable LAN-only mode.
   */
  ipcMain.handle('recovery:enable-lan-mode', async (_event, appId: string) => {
    try {
      const ok = enableLanOnlyMode(appId)
      return { success: ok }
    } catch (err: any) {
      logger.error(`[recovery:enable-lan-mode] Error: ${err.message}`, 'recovery')
      return { success: false, error: err.message }
    }
  })

  /**
   * Disable Online Fix due to failures.
   */
  ipcMain.handle('recovery:disable-online-fix', async (_event, appId: string, reason: string) => {
    try {
      const ok = disableOnlineFixDueToFailures(appId, reason)
      return { success: ok }
    } catch (err: any) {
      logger.error(`[recovery:disable-online-fix] Error: ${err.message}`, 'recovery')
      return { success: false, error: err.message }
    }
  })

  /**
   * Reset recovery state.
   */
  ipcMain.handle('recovery:reset-state', async (_event, appId: string) => {
    try {
      resetRecoveryState(appId)
      return { success: true }
    } catch (err: any) {
      logger.error(`[recovery:reset-state] Error: ${err.message}`, 'recovery')
      return { success: false, error: err.message }
    }
  })

  /**
   * Get recovery configuration.
   */
  ipcMain.handle('recovery:get-config', async () => {
    try {
      const config = getRecoveryConfig()
      return { success: true, config }
    } catch (err: any) {
      logger.error(`[recovery:get-config] Error: ${err.message}`, 'recovery')
      return { success: false, error: err.message }
    }
  })

  /**
   * Update recovery configuration.
   */
  ipcMain.handle('recovery:update-config', async (_event, partial: Partial<RecoveryConfig>) => {
    try {
      updateRecoveryConfig(partial)
      return { success: true, config: getRecoveryConfig() }
    } catch (err: any) {
      logger.error(`[recovery:update-config] Error: ${err.message}`, 'recovery')
      return { success: false, error: err.message }
    }
  })
}
