import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { logger } from '../logger'
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

// OpenSteamTool was renamed from YCoreTool. Since 1.4.x the DLL reads its
// local spec cache from <Steam>\opensteamtool\{channel}\{component}\<sha>.toml
// and its config from <Steam>\opensteamtool.toml (confirmed from strings
// inside OpenSteamTool.dll). Older Y-Core builds wrote everything under
// <Steam>\ycoretool\..., which the 1.4.x hook never reads — so even though
// Y-Core downloaded the specs, the hook found nothing, never hooked
// steamclient64.dll/steamui.dll, and Steam kept showing "Comprar" (the game
// was never faked as owned). We now write BOTH the legacy and the hook paths
// so the currently-deployed hook always finds its specs without needing the
// remote mirrors (raw.githubusercontent / cdn.jsdelivr), which are blocked or
// DNS-failing on many networks.
export function getHookSignatureCachePath(steamPath: string, channel: SignatureChannel, component: string, sha256: string): string {
  return path.join(steamPath, 'opensteamtool', channel, component, `${sha256}.toml`)
}

export function getAllSignatureCachePaths(steamPath: string, channel: SignatureChannel, component: string, sha256: string): string[] {
  return [
    getHookSignatureCachePath(steamPath, channel, component, sha256),
    getSignatureCachePath(steamPath, channel, component, sha256),
  ]
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
  const resp = await fetch(`${apiUrl}/api/signatures/${component}/${sha256}?channel=${channel}`)
  const body = resp.status === 200 ? await resp.text() : await resp.json().catch(() => ({}))
  return { ok: resp.ok, status: resp.status, body: typeof body === 'string' ? body : JSON.stringify(body) }
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
  const cachePaths = getAllSignatureCachePaths(steamPath, channel, component, sha256)

  const existing = cachePaths.find((p) => fs.existsSync(p))
  if (existing) {
    // Backfill the other path (migration ycoretool → opensteamtool) so the
    // 1.4.x hook always finds its local spec without hitting the remote.
    for (const p of cachePaths) {
      if (p !== existing && !fs.existsSync(p)) {
        try { ensureDir(p); fs.copyFileSync(existing, p) } catch {}
      }
    }
    logger.info(`Signature cache hit for ${channel}/${component}/${sha256}`, 'signature-cache')
    return { ok: true, status: 'cached', component, sha256, channel }
  }

  const result = await apiGetSignature(component, sha256, channel)

  if (result.status === 404) {
    return { ok: false, status: 'not_found', component, sha256, channel, error: 'Signature not found in server' }
  }

  if (result.status === 202) {
    return { ok: false, status: 'pending', component, sha256, channel, error: 'Signature is pending validation by beta testers' }
  }

  if (result.status === 200) {
    try {
      // Write to BOTH cache locations: legacy ycoretool\ + the opensteamtool\
      // path the current 1.4.x hook actually reads.
      for (const p of cachePaths) {
        ensureDir(p)
        fs.writeFileSync(p, result.body, 'utf-8')
      }
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
