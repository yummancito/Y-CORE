// ============================================================================
// electron/services/steam.service.ts — Backend SteamService
// ============================================================================

import { app } from 'electron'
import path from 'path'
import fs from 'fs'
import { logger } from '../logger'
import {
  getSteamPath,
  getSteamAppsPath,
  getSteamLibraryFolders,
  closeSteamProcess,
  isSteamRunning,
  parseVdf,
  isValidAppId,
} from '../modules/steam-helpers'
import { invalidateGamesCache } from '../modules/steam-ipc'

function getLuaScriptsDir(): string {
  return path.join(app.getPath('userData'), 'Library', 'scripts')
}

export const steamService = {
  async isRunning() {
    return isSteamRunning()
  },

  async restartSteam() {
    try {
      const { spawn } = await import('child_process')
      const steamPath = getSteamPath()
      if (!steamPath) return { success: false, error: 'Steam not found' }
      closeSteamProcess()
      await new Promise(resolve => setTimeout(resolve, 2000))
      spawn(path.join(steamPath, 'steam.exe'), [], { detached: true }).unref()
      return { success: true }
    } catch (err: any) { return { success: false, error: err.message } }
  },

  async verifySteam() {
    const steamPath = getSteamPath()
    if (!steamPath) return { success: false, error: 'Steam not found' }
    const exePath = path.join(steamPath, 'steam.exe')
    if (!fs.existsSync(exePath)) return { success: false, error: 'steam.exe not found' }
    return { success: true }
  },

  async checkVerification() {
    const steamPath = getSteamPath()
    const exePath = steamPath ? path.join(steamPath, 'steam.exe') : null
    if (!steamPath) return { verified: false, error: 'Steam not found' }
    if (!exePath || !fs.existsSync(exePath)) return { verified: false, error: 'steam.exe not found' }
    return { verified: true }
  },

  async closeSteam() {
    try {
      closeSteamProcess()
      return { success: true }
    } catch (err: any) { return { success: false, error: err.message } }
  },

  async importManifest(options: { manifestPath: string }) {
    const { manifestPath } = options
    if (!fs.existsSync(manifestPath)) return { success: false, error: 'File not found' }
    const steamAppsPath = getSteamAppsPath()
    if (!steamAppsPath) return { success: false, error: 'Steam apps path not found' }
    const destPath = path.join(steamAppsPath, path.basename(manifestPath))
    try {
      fs.copyFileSync(manifestPath, destPath)
      return { success: true, path: destPath }
    } catch (err: any) { return { success: false, error: err.message } }
  },

  async listManifestFiles() {
    const steamAppsPath = getSteamAppsPath()
    if (!steamAppsPath) return []
    const files: any[] = []
    try {
      const entries = fs.readdirSync(steamAppsPath)
      for (const entry of entries) {
        if (!entry.startsWith('appmanifest_') || !entry.endsWith('.acf')) continue
        try {
          const content = fs.readFileSync(path.join(steamAppsPath, entry), 'utf-8')
          const parsed = parseVdf(content)
          files.push({
            fileName: entry,
            size: fs.statSync(path.join(steamAppsPath, entry)).size,
            name: parsed.AppState?.name || '',
            appId: String(parsed.AppState?.appid || ''),
          })
        } catch { /* skip */ }
      }
    } catch { /* ignore */ }
    return files
  },

  async deleteManifestFile(fileName: string) {
    const steamAppsPath = getSteamAppsPath()
    if (!steamAppsPath) return { success: false }
    const filePath = path.join(steamAppsPath, fileName)
    try {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
      return { success: true }
    } catch { return { success: false } }
  },

  async listLuaScripts() {
    const scriptsDir = getLuaScriptsDir()
    if (!fs.existsSync(scriptsDir)) return []
    try {
      return fs.readdirSync(scriptsDir)
        .filter(f => f.endsWith('.lua'))
        .map(f => ({ fileName: f }))
    } catch { return [] }
  },

  async parseLuaScript(options: { luaPath: string }) {
    try {
      const { parseLuaScript } = await import('../modules/lua')
      return parseLuaScript(fs.readFileSync(options.luaPath, 'utf-8'), path.basename(options.luaPath))
    } catch (err: any) { return { error: err.message } }
  },

  async importLuaScript(options: { luaPath: string }) {
    const destDir = getLuaScriptsDir()
    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true })
    const destPath = path.join(destDir, path.basename(options.luaPath))
    try {
      fs.copyFileSync(options.luaPath, destPath)
      return { success: true, path: destPath }
    } catch (err: any) { return { success: false, error: err.message } }
  },

  async deleteLuaScript(fileName: string) {
    const filePath = path.join(getLuaScriptsDir(), fileName)
    try {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
      return { success: true }
    } catch { return { success: false } }
  },

  async importGameFolder(options: { folderPath: string }) {
    const { folderPath } = options
    if (!fs.existsSync(folderPath)) return { success: false, error: 'Folder not found' }

    // Check for .acf files in the folder
    const entries = fs.readdirSync(folderPath)
    const acfFiles = entries.filter(e => e.endsWith('.acf'))
    const luaFiles = entries.filter(e => e.endsWith('.lua'))
    const results: string[] = []
    const errors: string[] = []

    if (acfFiles.length > 0) {
      const steamAppsPath = getSteamAppsPath()
      if (steamAppsPath) {
        for (const acf of acfFiles) {
          try {
            fs.copyFileSync(path.join(folderPath, acf), path.join(steamAppsPath, acf))
            results.push(`Imported ${acf}`)
          } catch (err: any) { errors.push(`Failed to import ${acf}: ${err.message}`) }
        }
      }
    }

    if (luaFiles.length > 0) {
      const scriptsDir = getLuaScriptsDir()
      if (!fs.existsSync(scriptsDir)) fs.mkdirSync(scriptsDir, { recursive: true })
      for (const lua of luaFiles) {
        try {
          fs.copyFileSync(path.join(folderPath, lua), path.join(scriptsDir, lua))
          results.push(`Imported ${lua}`)
        } catch (err: any) { errors.push(`Failed to import ${lua}: ${err.message}`) }
      }
    }

    invalidateGamesCache()
    return { success: errors.length === 0, results, errors }
  },

  async retrySignatureCheck() {
    logger.info('[SteamService] retrySignatureCheck', 'services')
    return { success: true }
  },
}
