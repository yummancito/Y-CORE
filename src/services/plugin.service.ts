// ============================================================================
// src/services/plugin.service.ts
// ----------------------------------------------------------------------------
// Frontend PluginService — wraps Gateway calls for the plugin system.
// ============================================================================

import { BaseService } from './gateway'
import type { PluginInstance } from '../../electron/common/ipc-contract'

class PluginService extends BaseService {
  protected serviceName = 'plugin' as const

  async listPlugins(): Promise<PluginInstance[]> {
    return this.call('listPlugins')
  }

  async loadPlugin(pluginId: string): Promise<{ success: boolean; error?: string }> {
    return this.call('loadPlugin', pluginId)
  }

  async unloadPlugin(pluginId: string): Promise<{ success: boolean }> {
    return this.call('unloadPlugin', pluginId)
  }

  async enablePlugin(pluginId: string): Promise<{ success: boolean; error?: string }> {
    return this.call('enablePlugin', pluginId)
  }

  async disablePlugin(pluginId: string): Promise<{ success: boolean; error?: string }> {
    return this.call('disablePlugin', pluginId)
  }

  async installPlugin(pluginPath: string): Promise<{ success: boolean; plugin?: PluginInstance; error?: string }> {
    return this.call('installPlugin', pluginPath)
  }

  async removePlugin(pluginId: string): Promise<{ success: boolean; error?: string }> {
    return this.call('removePlugin', pluginId)
  }

  async scanPlugins(): Promise<PluginInstance[]> {
    return this.call('scanPlugins')
  }

  async loadAllPlugins(): Promise<{ success: boolean; loaded: number; errors: string[] }> {
    return this.call('loadAllPlugins')
  }

  async unloadAllPlugins(): Promise<void> {
    return this.call('unloadAllPlugins')
  }

  async executePluginCommand(pluginId: string, commandId: string, args?: unknown[]): Promise<unknown> {
    return this.call('executePluginCommand', pluginId, commandId, args)
  }
}

export const pluginService = new PluginService()
