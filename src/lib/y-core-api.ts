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
  const timeout = setTimeout(() => controller.abort(), 30000)

  try {
    const resp = await fetch(`${API_BASE}${path}`, { ...options, headers, signal: controller.signal })
    clearTimeout(timeout)

    if (!resp.ok) {
      const errorBody = await resp.json().catch(() => ({ error: 'Request failed' }))
      const err = new Error(errorBody.error || `HTTP ${resp.status}`)
      ;(err as any).status = resp.status
      throw err
    }

    if (resp.status === 204) return undefined as T
    return resp.json() as T
  } finally {
    clearTimeout(timeout)
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

  throw new Error('Job polling timed out')
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
    throw new Error(`Failed to download manifest: ${resp.status}`)
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
