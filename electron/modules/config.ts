import { ipcMain, app } from 'electron'
import fs from 'fs'
import path from 'path'
import { logger } from '../logger'

const CONFIG_PATH = path.join(app.getPath('userData'), 'ycore-config.json')

const ALLOWED_CONFIG_KEYS = new Set([
  'steamGridDbApiKey',
  'depotBoxApiKey',
  'theme',
  'colorTheme',
  'language',
  'showAdult',
  'showTools',
  'showAddGame',
  'logsVisible',
  'profileImage',
  'defaultInstallDir',
  'minimizeToTray',
  'autoStartSteam',
  'lastWindowBounds',
  'apiUrl',
  'customization',
  'steamLogMonitor',
  'steamPath',
  'tourDone',
])

const MAX_CONFIG_DEPTH = 3

function validateConfigValue(value: unknown, depth: number): boolean {
  if (depth > MAX_CONFIG_DEPTH) return false
  if (value === null || typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') {
    if (typeof value === 'string' && value.length > 1024) return false
    return true
  }
  if (Array.isArray(value)) {
    if (value.length > 100) return false
    return value.every((v) => validateConfigValue(v, depth + 1))
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value as object)
    if (keys.length > 50) return false
    return Object.entries(value as object).every(([k, v]) =>
      typeof k === 'string' && k.length < 100 && validateConfigValue(v, depth + 1)
    )
  }
  return false
}

export function registerConfigHandlers() {
  ipcMain.handle('config:read', async () => {
    try {
      if (!fs.existsSync(CONFIG_PATH)) return null
      const raw = fs.readFileSync(CONFIG_PATH, 'utf-8')
      return JSON.parse(raw, (key, value) => {
        if (key === '__proto__' || key === 'constructor' || key === 'prototype') return undefined
        return value
      })
    } catch {
      return null
    }
  })

  ipcMain.handle('config:write', async (_event, data: object) => {
    try {
      if (!data || typeof data !== 'object' || Array.isArray(data)) {
        return { success: false, error: 'Config must be a plain object' }
      }

      // Filter to allowed keys only
      const filtered: Record<string, unknown> = {}
      for (const [key, value] of Object.entries(data)) {
        if (!ALLOWED_CONFIG_KEYS.has(key)) {
          logger.warn(`Rejected unknown config key: ${key}`, 'config')
          continue
        }
        if (!validateConfigValue(value, 0)) {
          return { success: false, error: `Invalid value for config key: ${key}` }
        }
        filtered[key] = value
      }

      const serialized = JSON.stringify(filtered, null, 2)
      const MAX_CONFIG_SIZE = 256 * 1024
      if (serialized.length > MAX_CONFIG_SIZE) {
        return { success: false, error: 'Config exceeds maximum size of 256KB' }
      }
      fs.writeFileSync(CONFIG_PATH, serialized, 'utf-8')
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })
}
