import type {
  GameSummary,
  GameDetail,
  GameListResponse,
  InstallResponse,
  JobResponse,
  ManifestFile,
  DepotKey,
  InstallGameData,
} from '@y-core/shared'

const API_BASE = import.meta.env.VITE_YCORE_API_URL || 'https://y-core-render-api-rxwd.onrender.com'

let cachedUsername: string | null = null

export function setUsername(username: string | null): void {
  cachedUsername = username
}

async function getUsername(): Promise<string | null> {
  if (cachedUsername) return cachedUsername
  try {
    const username = await window.steamtools.getUsername()
    if (username) {
      cachedUsername = username
      return username
    }
  } catch {
    // Non-Electron environment
  }
  return null
}

async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const username = await getUsername()

  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> || {}),
  }

  if (username) {
    headers['X-Username'] = username
  }

  if (options.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json'
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 60000) // Increased timeout to 60s

  try {
    const resp = await fetch(`${API_BASE}${path}`, { ...options, headers, signal: controller.signal })
    clearTimeout(timeout)

    if (!resp.ok) {
      const errorBody = await resp.json().catch(() => ({}))
      // Envelope JSON: parseError del renderer desempaqueta y sustituye {status}
      const env = JSON.stringify({
        k: errorBody.error && /^[a-z]+\.[a-z]+/.test(errorBody.error) ? errorBody.error : 'errors.api.httpRequest',
        p: { status: resp.status, details: errorBody.details || errorBody.message || '' },
        t: errorBody.error || errorBody.message || `HTTP ${resp.status}`,
      })
      const err = new Error(env)
      ;(err as any).status = resp.status
      ;(err as any).fullResponse = errorBody
      throw err
    }

    if (resp.status === 204) return undefined as T
    return resp.json() as T
  } catch (err) {
    clearTimeout(timeout)
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(JSON.stringify({
        k: 'errors.api.timeout',
        p: {},
        t: 'API request timed out after 60s',
      }))
    }
    throw err
  }
}

// ===== Auth =====

export async function isAuthenticated(): Promise<boolean> {
  try {
    return await window.steamtools.isAuthenticated()
  } catch {
    return cachedUsername !== null
  }
}

export async function logout(): Promise<void> {
  try {
    await window.steamtools.logout()
  } catch {
    // Non-Electron environment
  }
  cachedUsername = null
}

// ===== Games =====

export async function listGames(params?: {
  search?: string
  category?: string
  sort?: 'name' | 'downloads' | 'rating' | 'recent'
  limit?: number
  offset?: number
  isDlc?: boolean
}): Promise<GameListResponse> {
  const query = new URLSearchParams()
  if (params?.search) query.set('search', params.search)
  if (params?.category) query.set('category', params.category)
  if (params?.sort) query.set('sort', params.sort)
  if (params?.limit) query.set('limit', String(params.limit))
  if (params?.offset) query.set('offset', String(params.offset))
  if (params?.isDlc !== undefined) query.set('is_dlc', String(params.isDlc))

  const qs = query.toString()
  return apiFetch<GameListResponse>(`/api/games${qs ? `?${qs}` : ''}`)
}

export async function getGameByAppId(appId: string): Promise<GameDetail> {
  return apiFetch<GameDetail>(`/api/games/${appId}`)
}

export interface SearchResultGame {
  app_id: string
  name: string
  header_image_url: string | null
  source: 'catalog' | 'depotbox'
  is_dlc?: boolean
}

export async function searchGamesCombined(query: string, limit = 50, filterNsfw?: 'all' | 'exclude' | 'only'): Promise<{ games: SearchResultGame[]; total: number }> {
  const qs = new URLSearchParams({ q: query, limit: String(limit) })
  if (filterNsfw && filterNsfw !== 'all') qs.set('filter_nsfw', filterNsfw)
  return apiFetch<{ games: SearchResultGame[]; total: number }>(`/api/search?${qs}`)
}

export async function installGame(appId: string): Promise<InstallResponse> {
  return apiFetch<InstallResponse>(`/api/games/${appId}/install`, {
    method: 'POST',
    body: JSON.stringify({}),
  })
}

/**
 * Obtiene las depot keys de un juego desde el backend Y-core API.
 * El endpoint /api/games/{appId}/depot-keys devuelve las claves de descifrado
 * que Y-core consigue de su base de datos (depotbox). Estas se usan para
 * descargar depots directamente vía steampipe sin necesidad de Steam.
 */
export async function fetchDepotKeysFromApi(appId: string): Promise<{ depot_id: string; key: string }[]> {
  const data = await apiFetch<{ depot_keys?: { depot_id: string; decryption_key: string }[] }>(
    `/api/games/${appId}/depot-keys`
  )
  return (data.depot_keys || []).map((k) => ({
    depot_id: k.depot_id,
    key: k.decryption_key,
  }))
}

export async function reportDownloaded(appId: string): Promise<void> {
  await apiFetch(`/api/games/${appId}/downloaded`, { method: 'POST' })
}

export async function getOnlineFixCompatibility(appId: string): Promise<{ status: 'compatible' | 'incompatible' | 'unknown'; reason?: string }> {
  return apiFetch(`/api/games/${appId}/onlinefix-compat`)
}

const compatCache = new Map<string, { result: Record<string, { status: 'compatible' | 'incompatible' | 'unknown'; reason?: string }>; expiresAt: number }>()
const CACHE_TTL_MS = 60 * 1000 // 1 minute

export async function getOnlineFixCompatibilityBatch(appIds: string[]): Promise<Record<string, { status: 'compatible' | 'incompatible' | 'unknown'; reason?: string }>> {
  const key = [...appIds].sort().join(',')
  const cached = compatCache.get(key)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.result
  }

  const result = await apiFetch<Record<string, { status: 'compatible' | 'incompatible' | 'unknown'; reason?: string }>>('/api/games/onlinefix-compat', {
    method: 'POST',
    body: JSON.stringify({ app_ids: appIds }),
  })

  compatCache.set(key, { result, expiresAt: Date.now() + CACHE_TTL_MS })
  return result
}

// ===== Jobs =====

export async function getJobStatus(jobId: string): Promise<JobResponse> {
  return apiFetch<JobResponse>(`/api/jobs/${jobId}`)
}

export async function pollJobUntilDone(
  jobId: string,
  onUpdate: (job: JobResponse) => void,
  intervalMs = 3000,
  maxAttempts = 300 // ~15 min — large DepotBox imports (download + extract + upload) can be slow
): Promise<JobResponse> {
  let attempts = 0

  while (attempts < maxAttempts) {
    const job = await getJobStatus(jobId)
    onUpdate(job)

    if (job.status === 'completed' || job.status === 'failed') {
      return job
    }

    await new Promise(resolve => setTimeout(resolve, intervalMs))
    attempts++
  }

  throw new Error('errors.api.jobTimeout')
}

// ===== Manifests =====

export function getManifestDownloadUrl(appId: string, depotId: string, manifestGid: string): string {
  return `${API_BASE}/api/manifests/${appId}/${depotId}/${manifestGid}`
}

export async function downloadManifest(
  appId: string,
  depotId: string,
  manifestGid: string
): Promise<Buffer> {
  const username = await getUsername()
  const headers: Record<string, string> = {}

  if (username) {
    headers['X-Username'] = username
  }

  const resp = await fetch(getManifestDownloadUrl(appId, depotId, manifestGid), { headers })

  if (!resp.ok) {
    // Envelope JSON con k (i18n key), p (params status), t (detalle)
    throw new Error(JSON.stringify({
      k: 'errors.api.downloadManifest',
      p: { status: resp.status },
      t: `Failed to download manifest: ${resp.status}`,
    }))
  }

  const arrayBuffer = await resp.arrayBuffer()
  return Buffer.from(arrayBuffer)
}

// ===== Support chat =====

export interface SupportChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export async function sendSupportMessage(messages: SupportChatMessage[]): Promise<string> {
  const resp = await apiFetch<{ reply: string }>('/api/support/chat', {
    method: 'POST',
    body: JSON.stringify({ messages }),
  })
  return resp.reply
}

// Re-export types for convenience
export type {
  GameSummary,
  GameDetail,
  GameListResponse,
  InstallResponse,
  JobResponse,
  ManifestFile,
  DepotKey,
  InstallGameData,
}
