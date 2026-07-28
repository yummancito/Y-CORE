// ============================================================================
// src/stores/useRemotePlayStore.ts
// ----------------------------------------------------------------------------
// Zustand store for Remote Play — session management, discovery, settings,
// and screen capture state for streaming.
// ============================================================================

import { create } from 'zustand'
import { remotePlayService } from '../services/remote-play.service'
import type { RemotePlaySession, RemotePlaySettings } from '../../electron/common/ipc-contract'

interface RemotePlayState {
  status: string
  currentSession: RemotePlaySession | null
  discoveredHosts: RemotePlaySession[]
  settings: RemotePlaySettings
  discovering: boolean
  connecting: boolean
  hosting: boolean
  error: string | null
  successMessage: string | null

  startHosting: (name: string, port?: number) => Promise<void>
  stopHosting: () => Promise<void>
  discoverHosts: () => Promise<void>
  connectToHost: (host: string, port: number) => Promise<void>
  disconnect: () => Promise<void>
  getStatus: () => Promise<void>
  loadSettings: () => Promise<void>
  updateSettings: (settings: Partial<RemotePlaySettings>) => Promise<void>
  clearMessages: () => void
}

const DEFAULT_SETTINGS: RemotePlaySettings = {
  maxBitrate: 20000,
  resolution: '1920x1080',
  fps: 60,
  enableAudio: true,
  enableGamepad: true,
  discoveryPort: 42860,
  streamPort: 42861,
  autoAccept: false,
}

export const useRemotePlayStore = create<RemotePlayState>((set, get) => ({
  status: 'idle',
  currentSession: null,
  discoveredHosts: [],
  settings: DEFAULT_SETTINGS,
  discovering: false,
  connecting: false,
  hosting: false,
  error: null,
  successMessage: null,

  startHosting: async (name, port) => {
    set({ hosting: true, error: null })
    try {
      const session = await remotePlayService.startHosting(name, port)
      set({
        status: 'hosting',
        currentSession: session,
        hosting: false,
        successMessage: `Hosting "${name}"`,
      })
    } catch (err: any) {
      set({ hosting: false, error: err?.message || 'Failed to start hosting' })
    }
  },

  stopHosting: async () => {
    set({ hosting: true })
    try {
      await remotePlayService.stopHosting()
      set({
        status: 'idle',
        currentSession: null,
        hosting: false,
        successMessage: 'Hosting stopped',
      })
    } catch (err: any) {
      set({ hosting: false, error: err?.message || 'Failed to stop hosting' })
    }
  },

  discoverHosts: async () => {
    set({ discovering: true, error: null })
    try {
      const hosts = await remotePlayService.discoverHosts()
      set({ discoveredHosts: hosts, discovering: false })
    } catch (err: any) {
      set({ discovering: false, error: err?.message || 'Discovery failed' })
    }
  },

  connectToHost: async (host, port) => {
    set({ connecting: true, error: null })
    try {
      const session = await remotePlayService.connectToHost(host, port)
      set({
        status: 'connected',
        currentSession: session,
        connecting: false,
        successMessage: `Connected to ${host}`,
      })
    } catch (err: any) {
      set({ connecting: false, error: err?.message || 'Connection failed' })
    }
  },

  disconnect: async () => {
    try {
      await remotePlayService.disconnect()
      set({
        status: 'idle',
        currentSession: null,
        successMessage: 'Disconnected',
      })
    } catch (err: any) {
      set({ error: err?.message || 'Disconnect failed' })
    }
  },

  getStatus: async () => {
    try {
      const result = await remotePlayService.getStatus()
      set({ status: result.status, currentSession: result.session })
    } catch {
      // Ignore polling errors
    }
  },

  loadSettings: async () => {
    try {
      const settings = await remotePlayService.getSettings()
      set({ settings })
    } catch {
      // Use defaults
    }
  },

  updateSettings: async (partial) => {
    try {
      await remotePlayService.updateSettings(partial)
      set((s) => ({ settings: { ...s.settings, ...partial }, successMessage: 'Settings saved' }))
    } catch (err: any) {
      set({ error: err?.message || 'Failed to save settings' })
    }
  },

  clearMessages: () => set({ error: null, successMessage: null }),
}))
