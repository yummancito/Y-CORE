// ============================================================================
// opensteamtool-updater.ts — Auto-update OpenSteamTool DLLs
// ============================================================================
// Verifica y descarga automáticamente la última versión de OpenSteamTool
// desde GitHub, extrae los 3 DLLs necesarios, y los copia a Steam.
// NO interfiere con el flujo de descargas de juegos.

import path from 'path'
import fs from 'fs'
import https from 'https'
import { logger } from '../logger'
import { getSteamPath } from './steam-helpers'

const CACHE_FILE = path.join(__dirname, '..', '..', 'native', 'opensteamtool', '.version-check')
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000 // 24 horas

interface GitHubRelease {
  tag_name: string
  assets: Array<{
    name: string
    browser_download_url: string
  }>
}

function readVersionCache(): { version: string; timestamp: number } | null {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const data = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'))
      return data
    }
  } catch {}
  return null
}

function writeVersionCache(version: string): void {
  try {
    const dir = path.dirname(CACHE_FILE)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(CACHE_FILE, JSON.stringify({ version, timestamp: Date.now() }, null, 2), 'utf-8')
  } catch (err: any) {
    logger.warn(`[opensteamtool-updater] Failed to write cache: ${err.message}`, 'updater')
  }
}

function shouldCheckForUpdates(): boolean {
  const cache = readVersionCache()
  if (!cache) return true
  return Date.now() - cache.timestamp > CHECK_INTERVAL_MS
}

async function fetchLatestRelease(): Promise<GitHubRelease | null> {
  return new Promise((resolve) => {
    const options = {
      hostname: 'api.github.com',
      path: '/repos/OpenSteam001/OpenSteamTool/releases/latest',
      method: 'GET',
      headers: {
        'User-Agent': 'Y-core/1.0',
        'Accept': 'application/vnd.github.v3+json',
      },
      timeout: 10000,
    }

    https.request(options, (res) => {
      let data = ''
      res.on('data', (chunk) => { data += chunk })
      res.on('end', () => {
        try {
          if (res.statusCode === 200) {
            resolve(JSON.parse(data))
          } else {
            resolve(null)
          }
        } catch {
          resolve(null)
        }
      })
    }).on('error', () => {
      resolve(null)
    }).end()
  })
}

async function downloadFile(url: string, destPath: string): Promise<boolean> {
  return new Promise((resolve) => {
    const file = fs.createWriteStream(destPath)
    https.get(url, { timeout: 30000 }, (res) => {
      res.pipe(file)
      file.on('finish', () => {
        file.close()
        resolve(true)
      })
    }).on('error', () => {
      fs.unlink(destPath, () => {})
      resolve(false)
    })
  })
}

function extractZip(zipPath: string, destDir: string): boolean {
  try {
    const AdmZip = require('adm-zip')
    const zip = new AdmZip(zipPath)
    const entries = zip.getEntries()

    const dlls = ['dwmapi.dll', 'xinput1_4.dll', 'OpenSteamTool.dll']
    let found = 0

    for (const entry of entries) {
      const fileName = entry.name.split('/').pop() || ''
      if (dlls.includes(fileName)) {
        const destFile = path.join(destDir, fileName)
        const buffer = entry.getData()
        fs.writeFileSync(destFile, buffer)
        found++
      }
    }

    return found === 3
  } catch {
    return false
  }
}

async function copyDllsToSteam(): Promise<boolean> {
  try {
    const steamPath = getSteamPath()
    if (!steamPath) {
      logger.warn('[opensteamtool-updater] Steam path not found', 'updater')
      return false
    }

    const srcDir = path.join(__dirname, '..', '..', 'native', 'opensteamtool')
    const dlls = ['dwmapi.dll', 'xinput1_4.dll', 'OpenSteamTool.dll']

    for (const dll of dlls) {
      const src = path.join(srcDir, dll)
      const dst = path.join(steamPath, dll)

      if (fs.existsSync(src)) {
        fs.copyFileSync(src, dst)
      }
    }

    return true
  } catch (err: any) {
    logger.warn(`[opensteamtool-updater] Failed to copy DLLs to Steam: ${err.message}`, 'updater')
    return false
  }
}

export async function checkAndUpdateOpenSteamTool(): Promise<{ updated: boolean; version?: string; error?: string }> {
  try {
    if (!shouldCheckForUpdates()) {
      return { updated: false }
    }

    logger.info('[opensteamtool-updater] Checking for updates...', 'updater')

    const release = await fetchLatestRelease()
    if (!release) {
      return { updated: false, error: 'Failed to fetch GitHub release' }
    }

    const currentCache = readVersionCache()
    const newVersion = release.tag_name
    if (currentCache?.version === newVersion) {
      writeVersionCache(newVersion)
      return { updated: false, version: newVersion }
    }

    const releaseAsset = release.assets.find((a) => a.name.includes('Release') && a.name.endsWith('.zip'))
    if (!releaseAsset) {
      return { updated: false, error: 'No Release.zip found in GitHub' }
    }

    logger.info(`[opensteamtool-updater] Downloading OpenSteamTool ${newVersion}...`, 'updater')

    const tmpDir = path.join(__dirname, '..', '..', '.tmp-opensteamtool')
    const tmpZip = path.join(tmpDir, 'opensteamtool.zip')

    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true })

    const downloaded = await downloadFile(releaseAsset.browser_download_url, tmpZip)
    if (!downloaded) {
      return { updated: false, error: 'Download failed' }
    }

    const dllDir = path.join(__dirname, '..', '..', 'native', 'opensteamtool')
    if (!fs.existsSync(dllDir)) fs.mkdirSync(dllDir, { recursive: true })

    const extracted = extractZip(tmpZip, dllDir)
    if (!extracted) {
      return { updated: false, error: 'Extraction failed' }
    }

    const copied = await copyDllsToSteam()
    if (copied) {
      writeVersionCache(newVersion)
      logger.info(`[opensteamtool-updater] Successfully updated to ${newVersion}`, 'updater')
      return { updated: true, version: newVersion }
    } else {
      return { updated: false, error: 'Failed to copy DLLs to Steam' }
    }
  } catch (err: any) {
    logger.error(`[opensteamtool-updater] Unexpected error: ${err.message}`, 'updater')
    return { updated: false, error: err.message }
  } finally {
    // Cleanup temp directory
    try {
      const tmpDir = path.join(__dirname, '..', '..', '.tmp-opensteamtool')
      if (fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true })
      }
    } catch {}
  }
}
