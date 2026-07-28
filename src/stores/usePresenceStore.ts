// ============================================================================
// src/stores/usePresenceStore.ts
// ----------------------------------------------------------------------------
// Zustand store for Remote Play presence — host registration, heartbeat,
// connection requests, trusted devices, and WAN WebSocket signaling.
// ============================================================================

import { create } from 'zustand'
import { presenceService } from '../services/presence.service'
import { subscribeToEvent } from '../services/gateway'
import type {
  HostRegistration,
  ConnectionRequest,
  DeviceInfo,
  WsSignalPayload,
} from '../../electron/common/ipc-contract'

interface PresenceState {
  registration: HostRegistration | null
  pendingRequests: ConnectionRequest[]
  trustedDevices: DeviceInfo[]
  registered: boolean
  heartbeatActive: boolean
  wsConnected: boolean
  error: string | null
  successMessage: string | null

  registerHost: (name: string) => Promise<void>
  unregisterHost: () => Promise<void>
  respondToRequest: (requestId: string, accept: boolean, rememberDevice?: boolean) => Promise<void>
  loadTrustedDevices: () => Promise<void>
  removeTrustedDevice: (deviceId: string) => Promise<void>
  connectWs: (token: string) => Promise<void>
  disconnectWs: () => Promise<void>
  clearMessages: () => void
  /** Subscribe to incoming connection requests (call once on mount) */
  subscribeToConnectionRequests: () => () => void
  /** Subscribe to incoming WS signaling messages */
  subscribeToWsSignals: (handler: (signal: WsSignalPayload) => void) => () => void
}

export const usePresenceStore = create<PresenceState>((set, get) => ({
  registration: null,
  pendingRequests: [],
  trustedDevices: [],
  registered: false,
  heartbeatActive: false,
  wsConnected: false,
  error: null,
  successMessage: null,

  registerHost: async (name) => {
    set({ error: null })
    try {
      const registration = await presenceService.registerHost(name)
      set({
        registration,
        registered: true,
        heartbeatActive: true,
        successMessage: `PC registered as "${name}"`,
      })
    } catch (err: any) {
      set({ error: err?.message || 'Failed to register host' })
    }
  },

  unregisterHost: async () => {
    try {
      await presenceService.unregisterHost()
      set({
        registration: null,
        registered: false,
        heartbeatActive: false,
        wsConnected: false,
        successMessage: 'Host unregistered',
      })
    } catch (err: any) {
      set({ error: err?.message || 'Failed to unregister host' })
    }
  },

  respondToRequest: async (requestId, accept, rememberDevice) => {
    try {
      await presenceService.respondToRequest(requestId, accept, rememberDevice)
      set((s) => ({
        pendingRequests: s.pendingRequests.filter((r) => r.id !== requestId),
        successMessage: accept ? 'Connection accepted' : 'Connection rejected',
      }))
    } catch (err: any) {
      set({ error: err?.message || 'Failed to respond to request' })
    }
  },

  loadTrustedDevices: async () => {
    try {
      const devices = await presenceService.getTrustedDevices()
      set({ trustedDevices: devices })
    } catch { /* silently fail */ }
  },

  removeTrustedDevice: async (deviceId) => {
    try {
      await presenceService.removeTrustedDevice(deviceId)
      set((s) => ({ trustedDevices: s.trustedDevices.filter((d) => d.deviceId !== deviceId) }))
    } catch (err: any) {
      set({ error: err?.message || 'Failed to remove device' })
    }
  },

  connectWs: async (token) => {
    set({ error: null })
    try {
      await presenceService.connectWsSignaling(token)
      set({ wsConnected: true })
    } catch (err: any) {
      set({ error: err?.message || 'Failed to connect signaling' })
    }
  },

  disconnectWs: async () => {
    try {
      await presenceService.disconnectWsSignaling()
      set({ wsConnected: false })
    } catch { set({ wsConnected: false }) }
  },

  clearMessages: () => set({ error: null, successMessage: null }),

  subscribeToConnectionRequests: () => {
    return subscribeToEvent('remotePlay:connectionRequest', (request) => {
      set((s) => ({
        pendingRequests: s.pendingRequests.some((r) => r.id === request.id)
          ? s.pendingRequests.map((r) => r.id === request.id ? request : r)
          : [...s.pendingRequests, request],
      }))
    })
  },

  subscribeToWsSignals: (handler) => {
    return subscribeToEvent('remotePlay:wsSignal', handler)
  },
}))
