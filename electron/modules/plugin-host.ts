// ============================================================================
// electron/modules/plugin-host.ts
// ----------------------------------------------------------------------------
// Plugin Host — manages plugin lifecycle (load, run, unload) in a sandboxed
// Node.js vm context. Plugins are ES modules located in the plugins/ directory
// under userData. Each plugin must have a plugin.json manifest.
// ============================================================================

import fs from 'fs'
import path from 'path'
import vm from 'vm'
import { app } from 'electron'
import { logger } from '../logger'
import type { PluginInstance } from '../common/ipc-contract'

// ── Types ──────────────────────────────────────────────────────────────────

interface PluginManifest {
  id: string
  name: string
  version: string
  author: string
  description: string
  entryPoint: string
  apiVersion: string
  contributions?: {
    commands?: { id: string; label: string }[]
    menuItems?: { id: string; label: string; route?: string }[]
    hooks?: string[]
  }
}

interface LoadedPlugin {
  manifest: PluginManifest
  context: vm.Context | null
  script: vm.Script | null
  enabled: boolean
  loaded: boolean
  installPath: string
  installedAt: number
  exports: Record<string, unknown>
}

// ── Plugin Timer Tracking ──────────────────────────────────────────────────

const pluginTimers = new Map<string, Set<ReturnType<typeof setInterval | typeof setTimeout>>>()

function trackTimer(pluginId: string, timerId: ReturnType<typeof setInterval | typeof setTimeout>): void {
  if (!pluginTimers.has(pluginId)) {
    pluginTimers.set(pluginId, new Set())
  }
  pluginTimers.get(pluginId)!.add(timerId)
}

function clearPluginTimers(pluginId: string): void {
  const timers = pluginTimers.get(pluginId)
  if (timers) {
    for (const id of timers) {
      clearTimeout(id)
      clearInterval(id)
    }
    pluginTimers.delete(pluginId)
  }
}

// ── Plugin API (what plugins can access) ──────────────────────────────────

function createPluginAPI(pluginId: string): Record<string, unknown> {
  return {
    log: {
      info: (msg: string) => logger.info(`[Plugin:${pluginId}] ${msg}`, 'plugin'),
      warn: (msg: string) => logger.warn(`[Plugin:${pluginId}] ${msg}`, 'plugin'),
      error: (msg: string) => logger.error(`[Plugin:${pluginId}] ${msg}`, 'plugin'),
    },
    plugin: {
      id: pluginId,
      apiVersion: '1.0.0',
    },
    // Read-only access to app metadata
    app: {
      name: 'Y-core',
      version: app.getVersion(),
      platform: process.platform,
    },
    // Tracked timer wrappers for safe cleanup on unload
    setTimeout: (fn: (...args: unknown[]) => void, ms: number, ...args: unknown[]) => {
      const id = setTimeout(fn, ms, ...args)
      trackTimer(pluginId, id)
      return id
    },
    setInterval: (fn: (...args: unknown[]) => void, ms: number, ...args: unknown[]) => {
      const id = setInterval(fn, ms, ...args)
      trackTimer(pluginId, id)
      return id
    },
    clearTimeout: (id: ReturnType<typeof setTimeout>) => {
      clearTimeout(id)
      const timers = pluginTimers.get(pluginId)
      if (timers) timers.delete(id)
    },
    clearInterval: (id: ReturnType<typeof setInterval>) => {
      clearInterval(id)
      const timers = pluginTimers.get(pluginId)
      if (timers) timers.delete(id)
    },
  }
}

// ── Plugin Host ────────────────────────────────────────────────────────────

const loadedPlugins = new Map<string, LoadedPlugin>()

function getPluginsDir(): string {
  return path.join(app.getPath('userData'), 'plugins')
}

function getPluginDir(pluginId: string): string {
  return path.join(getPluginsDir(), pluginId)
}

function ensurePluginsDir(): void {
  const dir = getPluginsDir()
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
    logger.info(`[PluginHost] Created plugins directory: ${dir}`, 'plugin')
  }
}

function readPluginManifest(pluginDir: string): PluginManifest | null {
  const manifestPath = path.join(pluginDir, 'plugin.json')
  if (!fs.existsSync(manifestPath)) {
    logger.warn(`[PluginHost] No plugin.json found at ${manifestPath}`, 'plugin')
    return null
  }
  try {
    const raw = fs.readFileSync(manifestPath, 'utf-8')
    const manifest = JSON.parse(raw) as PluginManifest
    if (!manifest.id || !manifest.name || !manifest.version) {
      logger.warn(`[PluginHost] Invalid plugin.json (missing required fields) at ${manifestPath}`, 'plugin')
      return null
    }
    return manifest
  } catch (err: any) {
    logger.warn(`[PluginHost] Failed to parse plugin.json at ${manifestPath}: ${err?.message}`, 'plugin')
    return null
  }
}

export function scanPluginsDir(): PluginInstance[] {
  ensurePluginsDir()
  const dir = getPluginsDir()
  const instances: PluginInstance[] = []

  if (!fs.existsSync(dir)) return instances

  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const pluginDir = path.join(dir, entry.name)
    const manifest = readPluginManifest(pluginDir)
    if (!manifest) continue

    const loaded = loadedPlugins.get(manifest.id)
    const stat = fs.statSync(pluginDir)
    const commands = manifest.contributions?.commands || []
    const menuItems = manifest.contributions?.menuItems || []

    instances.push({
      id: manifest.id,
      name: manifest.name,
      version: manifest.version,
      author: manifest.author || 'Unknown',
      description: manifest.description || '',
      apiVersion: manifest.apiVersion || '1.0.0',
      enabled: loaded?.enabled ?? true,
      loaded: loaded?.loaded ?? false,
      installPath: pluginDir,
      installedAt: stat.birthtimeMs || stat.ctimeMs,
      entryPoint: manifest.entryPoint || 'index.js',
      hasCommands: commands.length > 0,
      hasMenuItems: menuItems.length > 0,
      commands,
      menuItems,
    })
  }

  return instances
}

export async function loadPlugin(pluginId: string): Promise<{ success: boolean; error?: string }> {
  const dir = getPluginDir(pluginId)
  if (!fs.existsSync(dir)) {
    return { success: false, error: `Plugin directory not found: ${dir}` }
  }

  const manifest = readPluginManifest(dir)
  if (!manifest) {
    return { success: false, error: `Invalid manifest for plugin: ${pluginId}` }
  }

  // Check if already loaded
  const existing = loadedPlugins.get(pluginId)
  if (existing?.loaded) {
    return { success: true }
  }

  const entryPath = path.join(dir, manifest.entryPoint || 'index.js')
  if (!fs.existsSync(entryPath)) {
    return { success: false, error: `Entry point not found: ${entryPath}` }
  }

  try {
    const code = fs.readFileSync(entryPath, 'utf-8')
    const api = createPluginAPI(pluginId)

    // Create sandbox context
    const context = vm.createContext({
      ...api,
      console: {
        log: (...args: unknown[]) => logger.info(`[Plugin:${pluginId}:console] ${args.join(' ')}`, 'plugin'),
        warn: (...args: unknown[]) => logger.warn(`[Plugin:${pluginId}:console] ${args.join(' ')}`, 'plugin'),
        error: (...args: unknown[]) => logger.error(`[Plugin:${pluginId}:console] ${args.join(' ')}`, 'plugin'),
      },
      // Tracked timers are now provided via createPluginAPI
      module: { exports: {} },
      exports: {},
      require: (moduleName: string) => {
        // Only allow safe built-ins
        const safelist = ['path', 'fs', 'os', 'url', 'util', 'assert', 'events']
        if (safelist.includes(moduleName)) {
          return require(moduleName)
        }
        throw new Error(`Plugin "${pluginId}" attempted to require unsupported module: "${moduleName}"`)
      },
    })

    const script = new vm.Script(
      `(function(module, exports) { ${code} })(module, exports);`,
      { filename: entryPath },
    )
    script.runInContext(context, { timeout: 10000 })

    const pluginExports = (context as any).module?.exports || {}

    loadedPlugins.set(pluginId, {
      manifest,
      context,
      script,
      enabled: existing?.enabled ?? true,
      loaded: true,
      installPath: dir,
      installedAt: existing?.installedAt ?? Date.now(),
      exports: pluginExports,
    })

    logger.info(`[PluginHost] Loaded plugin: ${manifest.name} v${manifest.version}`, 'plugin')

    // Call onLoad if exported
    if (typeof pluginExports.onLoad === 'function') {
      try {
        pluginExports.onLoad()
      } catch (err: any) {
        logger.warn(`[PluginHost] Plugin "${manifest.name}" onLoad error: ${err?.message}`, 'plugin')
      }
    }

    return { success: true }
  } catch (err: any) {
    logger.error(`[PluginHost] Failed to load plugin "${pluginId}": ${err?.message}`, 'plugin')
    return { success: false, error: err?.message || 'Unknown error loading plugin' }
  }
}

export async function unloadPlugin(pluginId: string): Promise<{ success: boolean }> {
  const plugin = loadedPlugins.get(pluginId)
  if (!plugin) return { success: true }

  // Call onUnload if exported
  if (typeof plugin.exports?.onUnload === 'function') {
    try {
      plugin.exports.onUnload()
    } catch {
      // Silently fail on unload
    }
  }

  clearPluginTimers(pluginId)
  loadedPlugins.delete(pluginId)
  logger.info(`[PluginHost] Unloaded plugin: ${pluginId}`, 'plugin')
  return { success: true }
}

export async function loadAllPlugins(): Promise<{ success: boolean; loaded: number; errors: string[] }> {
  const plugins = scanPluginsDir()
  let loaded = 0
  const errors: string[] = []

  for (const plugin of plugins) {
    if (!plugin.enabled) continue
    const result = await loadPlugin(plugin.id)
    if (result.success) {
      loaded++
    } else {
      errors.push(`${plugin.name}: ${result.error}`)
    }
  }

  return { success: errors.length === 0, loaded, errors }
}

export async function unloadAllPlugins(): Promise<void> {
  for (const [id] of loadedPlugins) {
    await unloadPlugin(id)
  }
}

export function getLoadedPlugin(pluginId: string): LoadedPlugin | undefined {
  return loadedPlugins.get(pluginId)
}

export function isPluginLoaded(pluginId: string): boolean {
  return loadedPlugins.has(pluginId) && loadedPlugins.get(pluginId)!.loaded
}

export async function executePluginCommand(
  pluginId: string,
  commandId: string,
  args: unknown[] = [],
): Promise<unknown> {
  const plugin = loadedPlugins.get(pluginId)
  if (!plugin || !plugin.loaded) {
    throw new Error(`Plugin not loaded: ${pluginId}`)
  }

  const handler = plugin.exports?.commands?.[commandId]
  if (typeof handler !== 'function') {
    throw new Error(`Command not found: ${pluginId}.${commandId}`)
  }

  return handler(...args)
}

export function createSamplePlugin(): boolean {
  ensurePluginsDir()
  const sampleDir = path.join(getPluginsDir(), 'sample-hello')

  if (fs.existsSync(sampleDir)) return false

  fs.mkdirSync(sampleDir, { recursive: true })

  const manifest: PluginManifest = {
    id: 'sample-hello',
    name: 'Hello World',
    version: '1.0.0',
    author: 'Y-Core',
    description: 'A sample plugin that demonstrates the Y-Core plugin API',
    entryPoint: 'index.js',
    apiVersion: '1.0.0',
    contributions: {
      commands: [
        { id: 'greet', label: 'Say Hello' },
        { id: 'systemInfo', label: 'Show System Info' },
      ],
      menuItems: [
        { id: 'sample-menu', label: 'Sample Plugin', route: '/plugins' },
      ],
    },
  }

  const code = `
// Y-Core Sample Plugin
// Demonstrates the plugin API

function onLoad() {
  log.info('Hello World plugin loaded!');
}

function onUnload() {
  log.info('Hello World plugin unloaded!');
}

// Commands
commands = {
  greet: function() {
    log.info('Hello from the sample plugin!');
    return { greeting: 'Hello!', plugin: plugin.id };
  },
  systemInfo: function() {
    var info = {
      plugin: plugin.id,
      apiVersion: plugin.apiVersion,
      app: app.name + ' v' + app.version,
      platform: app.platform,
    };
    log.info('System info requested: ' + JSON.stringify(info));
    return info;
  }
};

module.exports = {
  onLoad: onLoad,
  onUnload: onUnload,
  commands: commands,
};
`

  fs.writeFileSync(path.join(sampleDir, 'plugin.json'), JSON.stringify(manifest, null, 2), 'utf-8')
  fs.writeFileSync(path.join(sampleDir, 'index.js'), code, 'utf-8')

  logger.info(`[PluginHost] Created sample plugin at: ${sampleDir}`, 'plugin')
  return true
}
