// ============================================================================
// electron/services/config.service.ts — Backend ConfigService
// ============================================================================

import { app } from 'electron'
import fs from 'fs'
import path from 'path'
import { logger } from '../logger'

const ALLOWED_CONFIG_KEYS = new Set([
  'steamGridDbApiKey', 'depotBoxApiKey', 'theme', 'colorTheme', 'language',
  'showAdult', 'showTools', 'showAddGame', 'logsVisible', 'profileImage',
  'defaultInstallDir', 'minimizeToTray', 'autoStartSteam', 'lastWindowBounds',
  'apiUrl', 'customization', 'steamLogMonitor', 'steamPath', 'tourDone',
  'installMethod', 'lastInstallFallbackReason',
  // Round-11: opt-in toggle consumed by electron/modules/steam-ipc.ts::steam:launchGame.
  // Without this entry, configService.write() silently rejects every attempt to
  // persist the toggle (auto-kill IIFE, useSettingsStore.setKillSteamBeforeLaunch,
  // and the user's manual Settings switch). Symptom: [WARN] Rejected unknown
  // config key: killSteamBeforeLaunch followed by the flag never flipping.
  'killSteamBeforeLaunch',
  // Round-14: first-launch gate flag set after successful Defender exclusion
  // of the user's Steam folder (defender-fix.ts::ensureDefenderExclusionForSteam).
  // Prevents UAC re-prompts on every cold start. Conservative: only set on
  // success so a UAC cancel keeps prompting next launch.
  'steamDefenderExclusionAdded',
])

const MAX_CONFIG_DEPTH = 3

function getConfigPath(): string {
  return path.join(app.getPath('userData'), 'ycore-config.json')
}

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

export const configService = {
  async appReady(): Promise<void> {
    try {
      const { showMainWindow } = await import('../modules/windows')
      showMainWindow()
    } catch (err: any) {
      logger.error(`[config] appReady failed: ${err?.message ?? err}`, 'config')
    }
  },

  async read(): Promise<Record<string, unknown> | null> {
    const CONFIG_PATH = getConfigPath()
    try {
      if (!fs.existsSync(CONFIG_PATH)) return null
      const raw = fs.readFileSync(CONFIG_PATH, 'utf-8')
      return JSON.parse(raw, (key, value) => {
        if (key === '__proto__' || key === 'constructor' || key === 'prototype') return undefined
        return value
      })
    } catch (err: any) {
      logger.error(`Failed to read config: ${err?.message ?? err}`, 'config')
      return null
    }
  },

  async write(data: object): Promise<{ success: boolean; error?: string }> {
    const CONFIG_PATH = getConfigPath()
    try {
      if (!data || typeof data !== 'object' || Array.isArray(data)) {
        return { success: false, error: 'Config must be a plain object' }
      }

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

      let existing: Record<string, unknown> = {}
      try {
        if (fs.existsSync(CONFIG_PATH)) {
          const raw = fs.readFileSync(CONFIG_PATH, 'utf-8')
          const parsed = JSON.parse(raw, (k, v) =>
            k === '__proto__' || k === 'constructor' || k === 'prototype' ? undefined : v
          )
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) existing = parsed
        }
      } catch (err: any) {
        logger.warn(`Failed to merge existing config, overwriting: ${err?.message ?? err}`, 'config')
      }

      const merged = { ...existing, ...filtered }
      const serialized = JSON.stringify(merged, null, 2)
      const MAX_CONFIG_SIZE = 256 * 1024
      if (serialized.length > MAX_CONFIG_SIZE) {
        return { success: false, error: 'Config exceeds maximum size of 256KB' }
      }
      fs.writeFileSync(CONFIG_PATH, serialized, 'utf-8')
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  },
}
