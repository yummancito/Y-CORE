import path from 'path'
import fs from 'fs'
import { getSteamPath } from './steam-helpers'

const CACHE_DIR_NAME = 'ycore-steamspy-cache'
const CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

function getCacheDir(): string | null {
  const steamPath = getSteamPath()
  if (!steamPath) return null
  const cacheDir = path.join(steamPath, 'config', CACHE_DIR_NAME)
  if (!fs.existsSync(cacheDir)) {
    try {
      fs.mkdirSync(cacheDir, { recursive: true })
    } catch {
      return null
    }
  }
  return cacheDir
}

function getCacheFilePath(appId: string): string | null {
  const dir = getCacheDir()
  if (!dir) return null
  return path.join(dir, `${appId}.json`)
}

interface CachedEntry {
  result: { isGame: boolean; isAdult: boolean }
  timestamp: number
}

export function getCachedAppType(appId: string): { isGame: boolean; isAdult: boolean } | null {
  const file = getCacheFilePath(appId)
  if (!file || !fs.existsSync(file)) return null
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf-8')) as CachedEntry
    if (Date.now() - data.timestamp > CACHE_TTL_MS) return null
    return data.result
  } catch {
    return null
  }
}

export function setCachedAppType(appId: string, result: { isGame: boolean; isAdult: boolean }): void {
  const file = getCacheFilePath(appId)
  if (!file) return
  try {
    const entry: CachedEntry = { result, timestamp: Date.now() }
    fs.writeFileSync(file, JSON.stringify(entry), 'utf-8')
  } catch {
    // Silently fail — cache is best-effort
  }
}
