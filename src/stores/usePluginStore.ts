// ============================================================================
// src/stores/usePluginStore.ts
// ----------------------------------------------------------------------------
// Zustand store for plugin management. Handles plugin lifecycle, loading
// status, and error/success messages.
// ============================================================================

import { create } from 'zustand'
import { pluginService } from '../services/plugin.service'
import type { PluginInstance } from '../../electron/common/ipc-contract'

interface PluginStore {
  plugins: PluginInstance[]
  loading: boolean
  loadingAll: boolean
  operating: string | null // pluginId being operated on
  error: string | null
  successMessage: string | null

  // Actions
  listPlugins: () => Promise<void>
  loadPlugin: (pluginId: string) => Promise<void>
  unloadPlugin: (pluginId: string) => Promise<void>
  enablePlugin: (pluginId: string) => Promise<void>
  disablePlugin: (pluginId: string) => Promise<void>
  removePlugin: (pluginId: string) => Promise<void>
  loadAllPlugins: () => Promise<void>
  unloadAllPlugins: () => Promise<void>
  executeCommand: (pluginId: string, commandId: string) => Promise<unknown>
  clearMessages: () => void
}

export const usePluginStore = create<PluginStore>((set, get) => ({
  plugins: [],
  loading: false,
  loadingAll: false,
  operating: null,
  error: null,
  successMessage: null,

  listPlugins: async () => {
    set({ loading: true, error: null })
    try {
      const plugins = await pluginService.listPlugins()
      set({ plugins, loading: false })
    } catch (err: any) {
      set({ loading: false, error: err?.message || 'Failed to list plugins' })
    }
  },

  loadPlugin: async (pluginId) => {
    set({ operating: pluginId, error: null })
    try {
      const result = await pluginService.loadPlugin(pluginId)
      if (result.success) {
        set({ operating: null, successMessage: 'Plugin loaded' })
        await get().listPlugins()
      } else {
        set({ operating: null, error: result.error || 'Failed to load plugin' })
      }
    } catch (err: any) {
      set({ operating: null, error: err?.message || 'Failed to load plugin' })
    }
  },

  unloadPlugin: async (pluginId) => {
    set({ operating: pluginId })
    try {
      await pluginService.unloadPlugin(pluginId)
      set({ operating: null, successMessage: 'Plugin unloaded' })
      await get().listPlugins()
    } catch (err: any) {
      set({ operating: null, error: err?.message || 'Failed to unload plugin' })
    }
  },

  enablePlugin: async (pluginId) => {
    set({ operating: pluginId })
    try {
      const result = await pluginService.enablePlugin(pluginId)
      if (result.success) {
        set({ operating: null, successMessage: 'Plugin enabled' })
        await get().listPlugins()
      } else {
        set({ operating: null, error: result.error || 'Failed to enable plugin' })
      }
    } catch (err: any) {
      set({ operating: null, error: err?.message || 'Failed to enable plugin' })
    }
  },

  disablePlugin: async (pluginId) => {
    set({ operating: pluginId })
    try {
      const result = await pluginService.disablePlugin(pluginId)
      if (result.success) {
        set({ operating: null, successMessage: 'Plugin disabled' })
        await get().listPlugins()
      } else {
        set({ operating: null, error: result.error || 'Failed to disable plugin' })
      }
    } catch (err: any) {
      set({ operating: null, error: err?.message || 'Failed to disable plugin' })
    }
  },

  removePlugin: async (pluginId) => {
    set({ operating: pluginId })
    try {
      const result = await pluginService.removePlugin(pluginId)
      if (result.success) {
        set({ operating: null, successMessage: 'Plugin removed' })
        await get().listPlugins()
      } else {
        set({ operating: null, error: result.error || 'Failed to remove plugin' })
      }
    } catch (err: any) {
      set({ operating: null, error: err?.message || 'Failed to remove plugin' })
    }
  },

  loadAllPlugins: async () => {
    set({ loadingAll: true, error: null })
    try {
      const result = await pluginService.loadAllPlugins()
      if (result.success) {
        set({ loadingAll: false, successMessage: `Loaded ${result.loaded} plugin(s)` })
      } else {
        set({ loadingAll: false, error: result.errors.join('; ') })
      }
      await get().listPlugins()
    } catch (err: any) {
      set({ loadingAll: false, error: err?.message || 'Failed to load all plugins' })
    }
  },

  unloadAllPlugins: async () => {
    set({ loadingAll: true })
    try {
      await pluginService.unloadAllPlugins()
      set({ loadingAll: false, successMessage: 'All plugins unloaded' })
      await get().listPlugins()
    } catch (err: any) {
      set({ loadingAll: false, error: err?.message || 'Failed to unload all plugins' })
    }
  },

  executeCommand: async (pluginId, commandId) => {
    try {
      return await pluginService.executePluginCommand(pluginId, commandId)
    } catch (err: any) {
      set({ error: err?.message || 'Command execution failed' })
      return null
    }
  },

  clearMessages: () => set({ error: null, successMessage: null }),
}))
