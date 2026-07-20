import path from 'path'
import fs from 'fs'
import os from 'os'
import https from 'https'
import { logger } from '../logger'
import {
  getSteamAppsPath,
  getLuaScriptsDir,
  getDepotCachePath,
  pathExists,
} from './steam-helpers'
import {
  createAppManifestFromLua,
  createGoldSrcBaseAppManifest,
  shouldRepairAcf,
  extractDepotSizesFromLua,
  patchAcfForDownload,
} from './acf'
import {
  GOLDSRC_MOD_APP_IDS,
  ensureGoldSrcBaseDepots,
} from './goldsrc'
import { injectDepotKeysIntoConfigVdf } from './depot-keys'
import { parseLuaScript, type ParsedLuaScript, type ParsedLuaAppId, type ParsedLuaManifest } from './lua'
import { installHookDll } from './dll-inject'
import { getApiUrl } from './auth-ipc'

export function fetchGameName(appId: string): Promise<string> {
  return new Promise((resolve) => {
    const url = `https://store.steampowered.com/api/appdetails?appids=${appId}&l=english`
    https.get(url, { headers: { 'User-Agent': 'Y-core/1.0' } }, (res) => {
      let data = ''
      res.on('data', (chunk) => data += chunk)
      res.on('end', () => {
        try {
          const json = JSON.parse(data)
          const name = json[appId]?.data?.name
          if (name) {
            resolve(name)
          } else {
            resolve(appId)
          }
        } catch {
          resolve(appId)
        }
      })
    }).on('error', () => resolve(appId))
  })
}

const freeStatusCache = new Map<string, { isFree: boolean; fetchedAt: number }>()
const FREE_STATUS_CACHE_TTL_MS = 24 * 60 * 60 * 1000

export function fetchAppFreeStatus(appId: string): Promise<boolean> {
  const cached = freeStatusCache.get(appId)
  if (cached && Date.now() - cached.fetchedAt < FREE_STATUS_CACHE_TTL_MS) {
    return Promise.resolve(cached.isFree)
  }

  return new Promise((resolve) => {
    const url = `https://store.steampowered.com/api/appdetails?appids=${appId}&l=english`
    https.get(url, { headers: { 'User-Agent': 'Y-core/1.0' }, timeout: 10000 }, (res) => {
      let data = ''
      res.on('data', (chunk) => data += chunk)
      res.on('end', () => {
        if (res.statusCode !== 200) {
          logger.warn(`[fetchAppFreeStatus] ${appId} HTTP ${res.statusCode}, skipping`, 'store')
          resolve(false)
          return
        }
        try {
          const json = JSON.parse(data)
          const appData = json[appId]?.data
          const isFree = !!appData?.is_free || appData?.price_overview?.final === 0
          freeStatusCache.set(appId, { isFree, fetchedAt: Date.now() })
          resolve(isFree)
        } catch {
          logger.warn(`[fetchAppFreeStatus] ${appId} invalid JSON, skipping`, 'store')
          resolve(false)
        }
      })
    }).on('error', (err) => {
      logger.warn(`[fetchAppFreeStatus] ${appId} request error ${err.message}`, 'store')
      resolve(false)
    }).on('timeout', () => {
      logger.warn(`[fetchAppFreeStatus] ${appId} timeout`, 'store')
      resolve(false)
    })
  })
}

export function autoCopyManifestsFromFolder(luaPath: string, parsed: ParsedLuaScript): { copied: number; missing: string[] } {
  const folder = path.dirname(luaPath)
  const depotCachePath = getDepotCachePath()
  if (!depotCachePath) return { copied: 0, missing: [] }

  if (!fs.existsSync(depotCachePath)) {
    fs.mkdirSync(depotCachePath, { recursive: true })
  }

  let copied = 0
  const missing: string[] = []

  for (const m of parsed.manifestIds) {
    const manifestFileName = `${m.depotId}_${m.manifestId}.manifest`
    const srcPath = path.join(folder, manifestFileName)
    const destPath = path.join(depotCachePath, manifestFileName)

    if (fs.existsSync(srcPath)) {
      fs.copyFileSync(srcPath, destPath)
      copied++
    } else if (!fs.existsSync(destPath)) {
      missing.push(manifestFileName)
    }
  }

  return { copied, missing }
}

export function listLuaScripts(): { fileName: string; content: string; parsed: ParsedLuaScript }[] {
  const scriptsDir = getLuaScriptsDir()
    if (!scriptsDir || !fs.existsSync(scriptsDir))
        return [];
    var files = fs.readdirSync(scriptsDir).filter(function (f) { return f.endsWith('.lua'); });
    return files.map(function (file) {
        var filePath = path.join(scriptsDir, file);
        var content = fs.readFileSync(filePath, 'utf-8');
        const parsed = parseLuaScript(content, file)
        return { fileName: file, content: content, parsed: parsed };
    });
}

export function listManifestFiles(): { fileName: string; size: number; depotId: string; manifestId: string }[] {
  const depotCachePath = getDepotCachePath()
    if (!depotCachePath || !fs.existsSync(depotCachePath))
        return [];
    var files = fs.readdirSync(depotCachePath).filter(function (f) { return /\d+_\d+\.manifest$/.test(f); });
    return files.map(function (file) {
        var filePath = path.join(depotCachePath, file);
        var stat = fs.statSync(filePath);
        var match = file.match(/^(\d+)_(\d+)\.manifest$/);
        return {
            fileName: file,
            size: stat.size,
            depotId: match ? match[1] : '',
            manifestId: match ? match[2] : '',
        };
    });
}

export async function downloadManifestFromApi(
  appId: string,
  depotId: string,
  manifestGid: string,
  destPath: string
): Promise<boolean> {
  const url = `${getApiUrl()}/api/manifests/${appId}/${depotId}/${manifestGid}`
  const maxRetries = 3
  let lastError = ''

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    if (attempt > 0) {
      const delay = Math.min(1000 * Math.pow(2, attempt), 8000)
      await new Promise((resolve) => setTimeout(resolve, delay))
      logger.info(`Retry ${attempt + 1}/${maxRetries} for manifest ${depotId}_${manifestGid}`, 'store')
    }

    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 30000)
      const resp = await fetch(url, {
        headers: { 'Accept': 'application/octet-stream' },
        signal: controller.signal,
      })
      clearTimeout(timeout)

      if (resp.status === 404) {
        logger.warn(`Manifest ${depotId}_${manifestGid} not found (404)`, 'store')
        return false
      }

      if (!resp.ok) {
        lastError = `HTTP ${resp.status}`
        continue
      }

      const arrayBuffer = await resp.arrayBuffer()
      fs.writeFileSync(destPath, Buffer.from(arrayBuffer))
      return true
    } catch (err: any) {
      lastError = err.message
      if ((err as any)?.name === 'AbortError') {
        lastError = 'Request timeout'
      }
    }
  }

  logger.error(`Failed to download manifest ${depotId}_${manifestGid} after ${maxRetries} attempts: ${lastError}`, 'store')
  return false
}

export function stripDepotsWithoutKeys(
  lua: string,
  mainAppId: string,
  depotKeys: { depot_id: string; key: string }[]
): { strippedDepots: string[]; cleanedLua: string } {
  const keyedDepotIds = new Set(depotKeys.map((d) => d.depot_id))
  keyedDepotIds.add(mainAppId)
  const strippedDepots: string[] = []
  const lines = lua.split('\n')
  const keepLines: string[] = []

  for (const line of lines) {
    const addAppMatch = line.match(/addappid\((\d+)/)
    if (addAppMatch) {
      const depotId = addAppMatch[1]
      if (!keyedDepotIds.has(depotId)) {
        strippedDepots.push(depotId)
        continue
      }
    }

    const manifestMatch = line.match(/setManifestid\((\d+)/)
    if (manifestMatch) {
      const depotId = manifestMatch[1]
      if (!keyedDepotIds.has(depotId)) {
        continue
      }
    }

    keepLines.push(line)
  }

  const cleanedLua = keepLines.join('\n').replace(/\n\s*\n/g, '\n').trim()
  return { strippedDepots, cleanedLua }
}

export async function installGameCore(
  appId: string,
  gameName: string,
  luaContent: string,
  depotKeys: { depot_id: string; key: string }[],
  steamPath: string
): Promise<{ actions: string[]; errors: string[]; warnings: string[] }> {
  const actions: string[] = []
  const errors: string[] = []
  const warnings: string[] = []

  const hookResult = await installHookDll(steamPath)
  if (hookResult.success) {
    actions.push(hookResult.installed ? 'Hook DLL installed' : 'Hook DLL already installed')
  } else {
    errors.push(`Hook DLL: ${hookResult.error}`)
  }

  const scriptsDir = getLuaScriptsDir()
  if (scriptsDir) {
    if (!(await pathExists(scriptsDir))) {
      await fs.promises.mkdir(scriptsDir, { recursive: true })
    }
    const luaFileName = `${appId}.lua`
    const luaDest = path.join(scriptsDir, luaFileName)
    await fs.promises.writeFile(luaDest, luaContent, 'utf-8')
    actions.push(`Lua: ${luaFileName} \u2192 config\\\\stplug-in`)
  }

  if (depotKeys.length > 0) {
    const injectResult = await injectDepotKeysIntoConfigVdf(depotKeys.map(k => ({ depotId: k.depot_id, key: k.key })))
    if (injectResult.success) {
      actions.push(`${injectResult.added} depot keys injected into config.vdf`)
    } else {
      errors.push(`Failed to inject depot keys: ${injectResult.error}`)
    }
  }

  const steamAppsPath = getSteamAppsPath()
  if (steamAppsPath) {
    const depotIdsWithKeys = new Set(depotKeys.map((k) => k.depot_id))
    const acfResult = await createAppManifestFromLua(steamAppsPath, appId, luaContent, depotIdsWithKeys)
    if (acfResult.success) {
      actions.push(`appmanifest_${appId}.acf created`)
      if (GOLDSRC_MOD_APP_IDS.has(appId)) {
        const baseAcfResult = await createGoldSrcBaseAppManifest(luaContent, depotIdsWithKeys)
        if (baseAcfResult.success) {
          actions.push('appmanifest_70.acf created for Half-Life base depots')
        } else {
          warnings.push(`Could not create Half-Life base appmanifest: ${baseAcfResult.error}`)
        }
      }
    } else {
      errors.push(`Failed to create appmanifest: ${acfResult.error}`)
    }
  }

  return { actions, errors, warnings }
}

export async function smartManifestSync(
  appId: string,
  luaContent: string,
  depotKeys: { depot_id: string; key: string }[]
): Promise<{ updatedLua: string; actions: string[]; warnings: string[] }> {
  const actions: string[] = []
  const warnings: string[] = []
  let updatedLua = luaContent

  const depotCachePath = getDepotCachePath()
  if (!depotCachePath) {
    warnings.push('depotcache path not found')
    return { updatedLua, actions, warnings }
  }

  if (!(await pathExists(depotCachePath))) {
    await fs.promises.mkdir(depotCachePath, { recursive: true })
  }

  const manifestRegex = /setManifestid\\s*\\((\\d+)\\s*,\\s*\"(\\d+)\"\\s*(?:,\\s*(\\d+))?\\s*\\)/g
  const manifestEntries: { depotId: string; gid: string; size: string }[] = []
  let m: RegExpExecArray | null
  while ((m = manifestRegex.exec(luaContent)) !== null) {
    manifestEntries.push({ depotId: m[1], gid: m[2], size: m[3] })
  }

  if (manifestEntries.length === 0) {
    warnings.push('No setManifestid entries in Lua')
    return { updatedLua, actions, warnings }
  }

  // Build map of existing manifests in depotcache
  const existingManifests = new Map<string, { gid: string; fileName: string }>()
  const files = fs.readdirSync(depotCachePath).filter((f) => /\\d+_\\d+\\.manifest$/.test(f))
  for (const file of files) {
    const match = file.match(/^(\\d+)_(\\d+)\\.manifest$/)
    if (match) {
      const depotId = match[1]
      const gid = match[2]
      existingManifests.set(depotId, { gid, fileName: file })
    }
  }

  // Search directories for manifest files
  const searchDirs = [
    path.join(os.homedir(), 'Downloads'),
    path.join(os.homedir(), 'Downloads', appId),
    path.join(os.homedir(), 'Desktop'),
    path.join(os.homedir(), 'Documents'),
  ]

  const downloadedManifests = new Map<string, { gid: string; filePath: string }>()
  for (const dir of searchDirs) {
    if (!fs.existsSync(dir)) continue
    const dirFiles = fs.readdirSync(dir).filter((f) => /\\d+_\\d+\\.manifest$/.test(f))
    for (const file of dirFiles) {
      const match = file.match(/^(\\d+)_(\\d+)\\.manifest$/)
      if (match) {
        const depotId = match[1]
        const gid = match[2]
        if (!downloadedManifests.has(depotId)) {
          downloadedManifests.set(depotId, { gid, filePath: path.join(dir, file) })
        }
      }
    }
  }

  let fixedCount = 0
  let copiedCount = 0
  const toDownload: { depotId: string; gid: string; fileName: string }[] = []

  for (const entry of manifestEntries) {
    const { depotId, gid: luaGid, size } = entry
    const expectedFileName = `${depotId}_${luaGid}.manifest`
    const expectedPath = path.join(depotCachePath, expectedFileName)

    // Check if already in depotcache with correct GID
    const existing = existingManifests.get(depotId)
    if (existing && existing.gid === luaGid && fs.existsSync(expectedPath)) {
      continue
    }

    // Check if GID mismatch - fix it
    if (existing && existing.gid !== luaGid) {
      const sizeSuffix = size ? `,${size}` : ''
      const oldRegex = new RegExp(`setManifestid\(${depotId}\s*,\s*"${luaGid}"${size ? `\s*,\s*${size}` : ''}\s*\)`)
      const newPattern = `setManifestid(${depotId},\"${existing.gid}\"${sizeSuffix})`
      updatedLua = updatedLua.replace(oldRegex, newPattern)
      fixedCount++
      actions.push(`Fixed manifest GID for depot ${depotId}: ${luaGid} \u2192 ${existing.gid}`)
      continue
    }

    // Check if found in search directories
    const downloaded = downloadedManifests.get(depotId)
    if (downloaded) {
      const destPath = path.join(depotCachePath, expectedFileName)
      fs.copyFileSync(downloaded.filePath, destPath)
      copiedCount++
      const sizeSuffix = size ? `,${size}` : ''
      const oldRegex = new RegExp(`setManifestid\(${depotId}\s*,\s*"${luaGid}"${size ? `\s*,\s*${size}` : ''}\s*\)`)
      const newPattern = `setManifestid(${depotId},\"${downloaded.gid}\"${sizeSuffix})`
      updatedLua = updatedLua.replace(oldRegex, newPattern)
      fixedCount++
      actions.push(`Copied manifest ${depotId}_${downloaded.gid}.manifest \u2192 depotcache (GID fixed, protected)`)
      continue
    }

    toDownload.push({ depotId, gid: luaGid, fileName: expectedFileName })
  }

  // Download missing manifests
  if (toDownload.length > 0) {
    const CONCURRENCY = 5
    for (let i = 0; i < toDownload.length; i += CONCURRENCY) {
      const batch = toDownload.slice(i, i + CONCURRENCY)
      const results = await Promise.allSettled(
        batch.map(async (item) => {
          const destPath = path.join(depotCachePath, item.fileName)
          const ok = await downloadManifestFromApi(appId, item.depotId, item.gid, destPath)
          return { ...item, ok }
        })
      )
      for (const r of results) {
        if (r.status === 'fulfilled' && r.value.ok) {
          copiedCount++
          actions.push(`Downloaded manifest ${r.value.fileName} from API`)
        } else {
          warnings.push(`Missing manifest: ${r.status === 'fulfilled' ? r.value.fileName : 'unknown'} (not in depotcache, Downloads, or API)`)
        }
      }
    }
  }

  if (fixedCount > 0 || copiedCount > 0) {
    actions.push(`Smart sync: ${fixedCount} manifest GIDs corrected, ${copiedCount} manifests copied`)
  }

  return { updatedLua, actions, warnings }
}

export function startAcfWatcher(): void {
  const steamAppsPath = getSteamAppsPath()
  const scriptsDir = getLuaScriptsDir()
  if (!steamAppsPath || !scriptsDir) return

  let isRunning = false

  const check = async () => {
    if (isRunning) return
    isRunning = true
    try {
      if (!fs.existsSync(steamAppsPath) || !fs.existsSync(scriptsDir)) return

      const luaFiles = (await fs.promises.readdir(scriptsDir)).filter(f => f.toLowerCase().endsWith('.lua'))
      for (const luaFile of luaFiles) {
        const appId = path.basename(luaFile, '.lua')
        const acfPath = path.join(steamAppsPath, `appmanifest_${appId}.acf`)
        const luaPath = path.join(scriptsDir, luaFile)
        if (!fs.existsSync(acfPath) || !fs.existsSync(luaPath)) continue

        try {
          const content = await fs.promises.readFile(acfPath, 'utf-8')
          if (shouldRepairAcf(content)) {
            const luaContent = await fs.promises.readFile(luaPath, 'utf-8')
            const depotSizes = extractDepotSizesFromLua(luaContent)
            const fixed = patchAcfForDownload(content, depotSizes)
            await fs.promises.writeFile(acfPath, fixed, 'utf-8')
            logger.info(`ACF watcher repaired appmanifest_${appId}.acf`, 'acfwatcher')
          }
        } catch (err: any) {
          logger.warn(`ACF watcher failed for ${appId}: ${err.message}`, 'acfwatcher')
        }
      }
    } catch (err: any) {
      logger.warn(`ACF watcher error: ${err.message}`, 'acfwatcher')
    } finally {
      isRunning = false
    }
  }

  check()
  setInterval(check, 5000)
}
