// ============================================================================
// electron/services/plugin.service.ts
// ----------------------------------------------------------------------------
// PluginService — wraps plugin-host.ts for the Service Registry.
// All methods delegate to the Plugin Host module.
// ============================================================================

import * as pluginHost from '../modules/plugin-host'
import { logger } from '../logger'

export const pluginService = {
  async listPlugins() {
    return pluginHost.scanPluginsDir()
  },

  async loadPlugin(pluginId: string) {
    return pluginHost.loadPlugin(pluginId)
  },

  async unloadPlugin(pluginId: string) {
    return pluginHost.unloadPlugin(pluginId)
  },

  async enablePlugin(pluginId: string) {
    const result = await pluginHost.loadPlugin(pluginId)
    return { success: result.success, error: result.error }
  },

  async disablePlugin(pluginId: string) {
    await pluginHost.unloadPlugin(pluginId)
    return { success: true }
  },

  async installPlugin(_pluginPath: string) {
    // For now, plugins are installed by placing folders in the plugins directory.
    // Future: support downloading from a marketplace.
    try {
      const plugins = pluginHost.scanPluginsDir()
      return { success: true, plugin: plugins.find((p) => p.installPath === _pluginPath) }
    } catch (err: any) {
      return { success: false, error: err?.message || 'Install failed' }
    }
  },

  async removePlugin(pluginId: string) {
    try {
      await pluginHost.unloadPlugin(pluginId)
      // In a full implementation, remove the plugin directory
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err?.message || 'Remove failed' }
    }
  },

  async scanPlugins() {
    return pluginHost.scanPluginsDir()
  },

  async loadAllPlugins() {
    return pluginHost.loadAllPlugins()
  },

  async unloadAllPlugins() {
    await pluginHost.unloadAllPlugins()
  },

  async executePluginCommand(pluginId: string, commandId: string, args?: unknown[]) {
    try {
      const result = await pluginHost.executePluginCommand(pluginId, commandId, args || [])
      return result
    } catch (err: any) {
      logger.error(`[PluginService] execute command error: ${err?.message}`, 'plugin')
      throw err
    }
  },
}
