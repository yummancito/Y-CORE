import { app } from 'electron'
import path from 'path'
import fs from 'fs'
import { exec, execSync } from 'child_process'
import { logger } from '../logger'

export function getSteamPath(): string | null {
  const platform = process.platform

  let steamPaths: string[] = []

  if (platform === 'win32') {
    const programFiles = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)'
    const programFiles64 = process.env['ProgramFiles'] || 'C:\\Program Files'
    steamPaths = [
      path.join(programFiles, 'Steam'),
      path.join(programFiles64, 'Steam'),
      'C:\\Program Files (x86)\\Steam',
      'C:\\Program Files\\Steam',
      'D:\\Steam',
      'E:\\Steam',
    ]
  } else if (platform === 'darwin') {
    steamPaths = [
      path.join(app.getPath('home'), 'Library', 'Application Support', 'Steam'),
    ]
  } else if (platform === 'linux') {
    steamPaths = [
      path.join(app.getPath('home'), '.steam', 'steam'),
      path.join(app.getPath('home'), '.local', 'share', 'Steam'),
    ]
  }

  for (const steamPath of steamPaths) {
    if (fs.existsSync(steamPath)) {
      return steamPath
    }
  }

  return null
}

export function getSteamAppsPath(): string | null {
  const steamPath = getSteamPath()
  if (!steamPath) return null

  const steamAppsPath = path.join(steamPath, 'steamapps')
  if (fs.existsSync(steamAppsPath)) {
    return steamAppsPath
  }

  return null
}

export function getSteamUserId(): string | null {
  const steamPath = getSteamPath()
  if (!steamPath) return null
  const loginUsersPath = path.join(steamPath, 'config', 'loginusers.vdf')
  if (!fs.existsSync(loginUsersPath)) return null
  try {
    const content = fs.readFileSync(loginUsersPath, 'utf-8')
    const mostRecentMatch = content.match(/"(\d+)"\s*\{[^}]*"MostRecent"\s*"1"/)
    if (mostRecentMatch) return mostRecentMatch[1]
    const firstMatch = content.match(/"(\d{17})"/)
    if (firstMatch) return firstMatch[1]
    return null
  } catch {
    return null
  }
}

export function isValidAppId(appId: string): boolean {
  return /^\d+$/.test(appId)
}

export function parseVdf(content: string): Record<string, any> {
  const tokens: string[] = []
  let i = 0
  let current = ''
  let inString = false

  while (i < content.length) {
    const char = content[i]

    if (char === '"') {
      if (inString) {
        tokens.push(current)
        current = ''
        inString = false
      } else {
        inString = true
      }
    } else if (inString) {
      current += char
    } else if (char === '{' || char === '}') {
      tokens.push(char)
    }
    i++
  }

  function parseTokens(idx: number): [Record<string, any>, number] {
    const result: Record<string, any> = {}
    let tokenIdx = idx

    while (tokenIdx < tokens.length) {
      const token = tokens[tokenIdx]

      if (token === '}') {
        return [result, tokenIdx + 1]
      }

      const key = token
      tokenIdx++

      if (tokens[tokenIdx] === '{') {
        const [nested, nextIdx] = parseTokens(tokenIdx + 1)
        result[key] = nested
        tokenIdx = nextIdx
      } else {
        result[key] = tokens[tokenIdx]
        tokenIdx++
      }
    }

    return [result, tokenIdx]
  }

  const [parsed] = parseTokens(0)
  return parsed
}

export function isSteamRunning(): Promise<boolean> {
  return new Promise((resolve) => {
    if (process.platform === 'win32') {
      exec('tasklist /FI "IMAGENAME eq steam.exe"', (err, stdout) => {
        if (err) { resolve(false); return }
        resolve(stdout.toLowerCase().includes('steam.exe'))
      })
    } else if (process.platform === 'darwin' || process.platform === 'linux') {
      exec('pgrep steam', (err, stdout) => {
        resolve(!err && stdout.trim().length > 0)
      })
    } else {
      resolve(false)
    }
  })
}

export function waitForSteamClosed(timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const start = Date.now()
    const check = async () => {
      const running = await isSteamRunning()
      if (!running) { resolve(true); return }
      if (Date.now() - start > timeoutMs) { resolve(false); return }
      setTimeout(check, 500)
    }
    check()
  })
}

export async function closeSteamProcess(): Promise<{ success: boolean; error?: string }> {
  if (process.platform === 'win32') {
    try { execSync('taskkill /IM steam.exe /F 2>nul', { timeout: 5000 }) } catch {}
    try { execSync('taskkill /IM steamwebhelper.exe /F 2>nul', { timeout: 10000 }) } catch {}
  } else if (process.platform === 'darwin' || process.platform === 'linux') {
    try { execSync('killall steam steamwebhelper 2>/dev/null', { timeout: 5000 }) } catch {}
  }

  const closed = await waitForSteamClosed(15000)
  if (!closed) {
    return { success: false, error: 'Steam is still running. Please close it manually and try again.' }
  }
  return { success: true }
}

export function getLuaScriptsDir(): string | null {
  const steamPath = getSteamPath()
  if (!steamPath) return null

  const ycoreToolDll = path.join(steamPath, 'YCoreTool.dll')
  if (fs.existsSync(ycoreToolDll)) {
    return path.join(steamPath, 'config', 'lua')
  }

  const stplugDir = path.join(steamPath, 'config', 'stplug-in')
  return stplugDir
}

export function getDepotCachePath(): string | null {
  const steamPath = getSteamPath()
  if (!steamPath) return null

  return path.join(steamPath, 'depotcache')
}

export function getSteamLibraryFolders(): string[] {
  const steamAppsPath = getSteamAppsPath()
  if (!steamAppsPath) return []
  const vdfPath = path.join(steamAppsPath, 'libraryfolders.vdf')
  if (!fs.existsSync(vdfPath)) return [steamAppsPath]
  try {
    const content = fs.readFileSync(vdfPath, 'utf-8')
    const parsed = parseVdf(content)
    const libraryFolders = parsed['libraryfolders'] || {}
    const folders: string[] = []
    let idx = 0
    while (libraryFolders[String(idx)]) {
      const entry = libraryFolders[String(idx)]
      if (entry['path']) {
        folders.push(path.join(entry['path'], 'steamapps'))
      }
      idx++
    }
    if (folders.length === 0) folders.push(steamAppsPath)
    return folders
  } catch {
    return [steamAppsPath]
  }
}

export function removeAppFromLibraryFolders(appId: string): void {
  const steamAppsPath = getSteamAppsPath()
  if (!steamAppsPath) return
  const vdfPath = path.join(steamAppsPath, 'libraryfolders.vdf')
  if (!fs.existsSync(vdfPath)) return
  try {
    let content = fs.readFileSync(vdfPath, 'utf-8')
    const lineRegex = new RegExp(`^[\\t ]*"${appId}"[\\t ]+"[^"]*"[\\t ]*\\r?\\n`, 'gm')
    if (!lineRegex.test(content)) return
    lineRegex.lastIndex = 0
    const newContent = content.replace(lineRegex, '')
    fs.writeFileSync(`${vdfPath}.bak`, content, 'utf-8')
    fs.writeFileSync(vdfPath, newContent, 'utf-8')
    logger.info(`[deleteGame] removed app ${appId} from libraryfolders.vdf`, 'steam')
  } catch (err: any) {
    logger.error(`[deleteGame] failed to remove app ${appId} from libraryfolders.vdf: ${err.message}`, 'steam')
  }
}

export async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.promises.access(p)
    return true
  } catch {
    return false
  }
}

export async function findFilesAsync(dir: string, ext: string): Promise<string[]> {
  const results: string[] = []
  const entries = await fs.promises.readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      const nested = await findFilesAsync(fullPath, ext)
      results.push(...nested)
    } else if (entry.name.toLowerCase().endsWith(ext)) {
      results.push(fullPath)
    }
  }
  return results
}
