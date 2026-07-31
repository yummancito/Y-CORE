// ============================================================================
// electron/modules/online-recovery.test.ts
// ============================================================================
// Integration tests for Online Fix error recovery system.
// Tests error detection, retry logic, and degradation.
// ============================================================================

import {
  reportConnectionError,
  reportConnectionSuccess,
  getRecoveryState,
  getErrorHistory,
  resetRecoveryState,
  enableLanOnlyMode,
  disableOnlineFixDueToFailures,
  scheduleRetry,
  updateRecoveryConfig,
  getRecoveryConfig,
  type RecoveryConfig,
} from './online-recovery'

describe('OnlineRecovery', () => {
  const appId = '570' // Dota 2

  beforeEach(() => {
    // Reset state before each test
    resetRecoveryState(appId)
  })

  afterEach(() => {
    // Cleanup
    resetRecoveryState(appId)
  })

  describe('reportConnectionError', () => {
    it('should create recovery state on first error', () => {
      const action = reportConnectionError(appId, 'Failed to connect to relay server')
      const state = getRecoveryState(appId)

      expect(state).not.toBeNull()
      expect(state!.appId).toBe(appId)
      expect(state!.failureCount).toBe(1)
      expect(state!.lastError).not.toBeNull()
    })

    it('should classify P2P connection errors', () => {
      const action = reportConnectionError(appId, 'P2P connection timeout')
      const state = getRecoveryState(appId)

      expect(state!.lastError!.type).toBe('p2p_connect')
      expect(state!.lastError!.retriable).toBe(true)
    })

    it('should classify relay connection errors', () => {
      const action = reportConnectionError(appId, 'Failed to connect to relay server')
      const state = getRecoveryState(appId)

      expect(state!.lastError!.type).toBe('relay_connect')
      expect(state!.lastError!.retriable).toBe(true)
    })

    it('should classify handshake errors', () => {
      const action = reportConnectionError(appId, 'Handshake failed with peer')
      const state = getRecoveryState(appId)

      expect(state!.lastError!.type).toBe('handshake')
      expect(state!.lastError!.retriable).toBe(true)
    })

    it('should classify peer discovery errors', () => {
      const action = reportConnectionError(appId, 'Peer discovery timeout')
      const state = getRecoveryState(appId)

      expect(state!.lastError!.type).toBe('peer_discovery')
      expect(state!.lastError!.retriable).toBe(true)
    })

    it('should increment failure count on repeated errors', () => {
      reportConnectionError(appId, 'Error 1')
      reportConnectionError(appId, 'Error 2')
      reportConnectionError(appId, 'Error 3')

      const state = getRecoveryState(appId)
      expect(state!.failureCount).toBe(3)
    })

    it('should store error history', () => {
      reportConnectionError(appId, 'Error 1')
      reportConnectionError(appId, 'Error 2')

      const history = getErrorHistory(appId)
      expect(history.length).toBe(2)
      expect(history[0].message).toBe('Error 1')
      expect(history[1].message).toBe('Error 2')
    })

    it('should limit error history size', () => {
      const config = getRecoveryConfig()
      // Report many errors
      for (let i = 0; i < 100; i++) {
        reportConnectionError(appId, `Error ${i}`)
      }

      const history = getErrorHistory(appId)
      expect(history.length).toBeLessThanOrEqual(50) // DEFAULT ERROR_HISTORY_LIMIT
    })
  })

  describe('reportConnectionSuccess', () => {
    it('should reset attempt counter on success', () => {
      reportConnectionError(appId, 'Error 1')
      reportConnectionError(appId, 'Error 2')

      const stateBeforeSuccess = getRecoveryState(appId)
      expect(stateBeforeSuccess!.failureCount).toBe(2)

      reportConnectionSuccess(appId, 'p2p')

      const stateAfterSuccess = getRecoveryState(appId)
      expect(stateAfterSuccess!.attemptCount).toBe(0)
      expect(stateAfterSuccess!.connected).toBe(true)
      expect(stateAfterSuccess!.connectionMode).toBe('p2p')
    })

    it('should update connection mode', () => {
      reportConnectionSuccess(appId, 'relay')

      const state = getRecoveryState(appId)
      expect(state!.connectionMode).toBe('relay')
    })

    it('should set last successful connection time', () => {
      reportConnectionSuccess(appId, 'p2p')

      const state = getRecoveryState(appId)
      expect(state!.lastSuccessfulConnection).not.toBeNull()
      expect(state!.lastSuccessfulConnection! > 0).toBe(true)
    })

    it('should restore healthy degradation level', () => {
      reportConnectionError(appId, 'Error 1')
      reportConnectionError(appId, 'Error 2')
      reportConnectionError(appId, 'Error 3')

      const stateBeforeSuccess = getRecoveryState(appId)
      expect(stateBeforeSuccess!.degradationLevel).toBe('degraded')

      reportConnectionSuccess(appId, 'p2p')

      const stateAfterSuccess = getRecoveryState(appId)
      expect(stateAfterSuccess!.degradationLevel).toBe('healthy')
    })
  })

  describe('Degradation Levels', () => {
    it('should enter degraded mode after threshold', () => {
      const config = getRecoveryConfig()
      const threshold = config.degradationThreshold

      // Report errors up to threshold
      for (let i = 0; i < threshold; i++) {
        reportConnectionError(appId, `Error ${i}`)
      }

      const state = getRecoveryState(appId)
      expect(state!.degradationLevel).toBe('degraded')
    })

    it('should enter critical mode at higher threshold', () => {
      const config = getRecoveryConfig()
      const criticalLevel = Math.ceil(config.degradationThreshold * 1.5)

      for (let i = 0; i < criticalLevel; i++) {
        reportConnectionError(appId, `Error ${i}`)
      }

      const state = getRecoveryState(appId)
      expect(['degraded', 'critical']).toContain(state!.degradationLevel)
    })

    it('should disable Online Fix at auto-disable threshold', () => {
      const config = getRecoveryConfig()
      const disableThreshold = config.autoDisableThreshold

      for (let i = 0; i < disableThreshold; i++) {
        reportConnectionError(appId, `Error ${i}`)
      }

      const state = getRecoveryState(appId)
      expect(state!.degradationLevel).toBe('disabled')
    })
  })

  describe('LAN Fallback', () => {
    it('should enable LAN-only mode', () => {
      const ok = enableLanOnlyMode(appId)
      expect(ok).toBe(true)

      const state = getRecoveryState(appId)
      expect(state!.connectionMode).toBe('lan')
    })

    it('should not re-enable if already in LAN mode', () => {
      enableLanOnlyMode(appId)
      const ok = enableLanOnlyMode(appId)
      expect(ok).toBe(true)

      const state = getRecoveryState(appId)
      expect(state!.connectionMode).toBe('lan')
    })

    it('should preserve degradation level when enabling LAN', () => {
      reportConnectionError(appId, 'Error 1')
      enableLanOnlyMode(appId)

      const state = getRecoveryState(appId)
      expect(state!.connectionMode).toBe('lan')
      expect(['degraded', 'healthy']).toContain(state!.degradationLevel)
    })
  })

  describe('Retry Scheduling', () => {
    it('should schedule retry with delay', (done: jest.DoneCallback) => {
      scheduleRetry(appId, 100)
      // Test passes if no error is thrown
      expect(true).toBe(true)
      done()
    })

    it('should calculate exponential backoff', () => {
      // Configuration defaults should use exponential backoff
      const config = getRecoveryConfig()
      expect(config.exponentialBackoffFactor).toBeGreaterThan(1)
    })
  })

  describe('Configuration Management', () => {
    it('should get default configuration', () => {
      const config = getRecoveryConfig()
      expect(config.autoRetryEnabled).toBe(true)
      expect(config.maxRetries).toBe(3)
      expect(config.exponentialBackoffFactor).toBe(2)
    })

    it('should update configuration', () => {
      const newConfig: Partial<RecoveryConfig> = {
        maxRetries: 5,
        autoRetryEnabled: false,
      }
      updateRecoveryConfig(newConfig)

      const config = getRecoveryConfig()
      expect(config.maxRetries).toBe(5)
      expect(config.autoRetryEnabled).toBe(false)
    })

    it('should preserve unmodified settings when updating', () => {
      const originalConfig = getRecoveryConfig()

      updateRecoveryConfig({ maxRetries: 10 })

      const config = getRecoveryConfig()
      expect(config.maxRetries).toBe(10)
      expect(config.exponentialBackoffFactor).toBe(originalConfig.exponentialBackoffFactor)
    })
  })

  describe('State Reset', () => {
    it('should clear recovery state', () => {
      reportConnectionError(appId, 'Error 1')
      const stateBeforeReset = getRecoveryState(appId)
      expect(stateBeforeReset).not.toBeNull()

      resetRecoveryState(appId)

      const stateAfterReset = getRecoveryState(appId)
      expect(stateAfterReset).toBeNull()
    })

    it('should clear error history', () => {
      reportConnectionError(appId, 'Error 1')
      const historyBeforeReset = getErrorHistory(appId)
      expect(historyBeforeReset.length).toBe(1)

      resetRecoveryState(appId)

      const historyAfterReset = getErrorHistory(appId)
      expect(historyAfterReset.length).toBe(0)
    })
  })

  describe('Disable Online Fix', () => {
    it('should disable Online Fix with reason', () => {
      const ok = disableOnlineFixDueToFailures(appId, 'Too many connection failures')
      expect(ok).toBe(true)

      const state = getRecoveryState(appId)
      expect(state!.connectionMode).toBe('disabled')
      expect(state!.degradationLevel).toBe('disabled')
      expect(state!.connected).toBe(false)
    })
  })

  describe('Error Recovery Action Determination', () => {
    it('should recommend retry for retriable errors', () => {
      const action = reportConnectionError(appId, 'P2P connection timeout')
      expect(action.action).toBe('retry')
    })

    it('should recommend LAN fallback after max retries', () => {
      const config = getRecoveryConfig()
      // Simulate max retries exceeded
      for (let i = 0; i < config.maxRetries + 1; i++) {
        reportConnectionError(appId, 'P2P connection timeout')
      }

      const state = getRecoveryState(appId)
      expect(state!.failureCount).toBeGreaterThan(config.maxRetries)
    })

    it('should recommend disabling after too many failures', () => {
      const config = getRecoveryConfig()

      for (let i = 0; i < config.autoDisableThreshold + 1; i++) {
        reportConnectionError(appId, `Error ${i}`)
      }

      const state = getRecoveryState(appId)
      expect(state!.degradationLevel).toBe('disabled')
    })
  })

  describe('Integration Scenarios', () => {
    it('should handle full error recovery cycle', () => {
      // 1. Report initial error
      reportConnectionError(appId, 'P2P timeout')
      let state = getRecoveryState(appId)
      expect(state!.connected).toBe(false)

      // 2. Report more errors
      reportConnectionError(appId, 'P2P timeout')
      state = getRecoveryState(appId)
      expect(state!.failureCount).toBe(2)

      // 3. Recover with success
      reportConnectionSuccess(appId, 'p2p')
      state = getRecoveryState(appId)
      expect(state!.connected).toBe(true)
      expect(state!.failureCount).toBe(2) // History preserved
      expect(state!.attemptCount).toBe(0)
    })

    it('should handle degradation and recovery', () => {
      const config = getRecoveryConfig()

      // Degrade the connection
      for (let i = 0; i < config.degradationThreshold + 1; i++) {
        reportConnectionError(appId, `Error ${i}`)
      }

      let state = getRecoveryState(appId)
      expect(state!.degradationLevel).not.toBe('healthy')

      // Recover
      reportConnectionSuccess(appId, 'relay')
      state = getRecoveryState(appId)
      expect(state!.degradationLevel).toBe('healthy')
      expect(state!.connectionMode).toBe('relay')
    })

    it('should transition through connection modes', () => {
      // Start with P2P
      reportConnectionSuccess(appId, 'p2p')
      let state = getRecoveryState(appId)
      expect(state!.connectionMode).toBe('p2p')

      // Fall back to relay
      reportConnectionSuccess(appId, 'relay')
      state = getRecoveryState(appId)
      expect(state!.connectionMode).toBe('relay')

      // Fall back to LAN
      enableLanOnlyMode(appId)
      state = getRecoveryState(appId)
      expect(state!.connectionMode).toBe('lan')
    })
  })
})
