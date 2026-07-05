import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { logger } from '../logger'
import { state } from '../state'
import { getApiUrl } from './auth-ipc'

export type SignatureChannel = 'pattern' | 'ipc'

export interface SignatureCacheResult {
  ok: boolean
  status: 'cached' | 'downloaded' | 'pending' | 'rejected' | 'not_found' | 'error'
  component: string
  sha256: string
  channel: SignatureChannel
  error?: string
}

export function getSignatureCachePath(steamPath: string, channel: SignatureChannel, component: string, sha256: string): string {
  return path.join(steamPath, 'ycoretool', channel, component, `${sha256}.toml`)
}

export function getSteamDllPath(steamPath: string, component: string): string {
  const dllName = component === 'steamui' ? 'steamui.dll' : 'steamclient64.dll'
  return path.join(steamPath, dllName)
}

export function sha256OfFile(filePath: string): string {
  const hash = crypto.createHash('sha256')
  hash.update(fs.readFileSync(filePath))
  return hash.digest('hex').toLowerCase()
}

function ensureDir(filePath: string): void {
  const dir = path.dirname(filePath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

async function apiGetSignature(component: string, sha256: string, channel: SignatureChannel): Promise<{ ok: boolean; status: number; body: string }> {
  const apiUrl = getApiUrl()
  const token = state.authSession?.access_token
  const resp = await fetch(`${apiUrl}/api/signatures/${component}/${sha256}?channel=${channel}`, {
    headers: {
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    },
  })
  const body = resp.status === 200 ? await resp.text() : await resp.json().catch(() => ({}))
  return { ok: resp.ok, status: resp.status, body: typeof body === 'string' ? body : JSON.stringify(body) }
}

async function refreshTokenAndRetry(): Promise<boolean> {
  const { refreshAuthToken } = await import('./auth-ipc')
  return refreshAuthToken()
}

export async function ensureSignatureCached(
  steamPath: string,
  component: string,
  channel: SignatureChannel = 'pattern'
): Promise<SignatureCacheResult> {
  const dllPath = getSteamDllPath(steamPath, component)
  if (!fs.existsSync(dllPath)) {
    return { ok: false, status: 'error', component, sha256: '', channel, error: `DLL not found: ${dllPath}` }
  }

  const sha256 = sha256OfFile(dllPath)
  const cachePath = getSignatureCachePath(steamPath, channel, component, sha256)

  if (fs.existsSync(cachePath)) {
    logger.info(`Signature cache hit for ${channel}/${component}/${sha256}`, 'signature-cache')
    return { ok: true, status: 'cached', component, sha256, channel }
  }

  let result = await apiGetSignature(component, sha256, channel)

  if (result.status === 401 && state.authSession?.refresh_token) {
    const refreshed = await refreshTokenAndRetry()
    if (refreshed) {
      result = await apiGetSignature(component, sha256, channel)
    }
  }

  if (result.status === 404) {
    return { ok: false, status: 'not_found', component, sha256, channel, error: 'Signature not found in server' }
  }

  if (result.status === 202) {
    return { ok: false, status: 'pending', component, sha256, channel, error: 'Signature is pending validation by beta testers' }
  }

  if (result.status === 200) {
    try {
      ensureDir(cachePath)
      fs.writeFileSync(cachePath, result.body, 'utf-8')
      logger.info(`${channel} signature downloaded and cached for ${component}/${sha256}`, 'signature-cache')
      return { ok: true, status: 'downloaded', component, sha256, channel }
    } catch (err: any) {
      return { ok: false, status: 'error', component, sha256, channel, error: `Failed to write cache: ${err.message}` }
    }
  }

  return { ok: false, status: 'error', component, sha256, channel, error: `Unexpected HTTP ${result.status}: ${result.body}` }
}

export async function ensureAllSignaturesCached(
  steamPath: string,
  channel: SignatureChannel = 'pattern'
): Promise<SignatureCacheResult[]> {
  const components = ['steamclient', 'steamui']
  const results: SignatureCacheResult[] = []
  for (const component of components) {
    results.push(await ensureSignatureCached(steamPath, component, channel))
  }
  return results
}

export async function ensureAllChannelsCached(steamPath: string): Promise<SignatureCacheResult[]> {
  const patternResults = await ensureAllSignaturesCached(steamPath, 'pattern')
  const ipcResults = await ensureAllSignaturesCached(steamPath, 'ipc')
  return [...patternResults, ...ipcResults]
}
