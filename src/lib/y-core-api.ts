import type {
  AuthSession,
  AuthUser,
  GameSummary,
  GameDetail,
  GameListResponse,
  InstallResponse,
  JobResponse,
  ManifestFile,
  DepotKey,
  InstallGameData,
} from '@y-core/shared'
import { t } from './i18n'

const API_BASE = import.meta.env.VITE_YCORE_API_URL || 'https://y-core-render-api.onrender.com'

let cachedAccessToken: string | null = null
let tokenLoadPromise: Promise<string | null> | null = null

async function getToken(): Promise<{ accessToken: string; refreshToken: string } | null> {
  // Renderer only gets access token from main process — refresh token never leaves main
  if (cachedAccessToken) {
    return { accessToken: cachedAccessToken, refreshToken: '' }
  }

  if (!tokenLoadPromise) {
    tokenLoadPromise = (async () => {
      try {
        const token = await window.steamtools.getAccessToken()
        if (token) {
          cachedAccessToken = token
          return token
        }
      } catch {
        // Non-Electron environment or IPC not available
      }
      return null
    })()
  }
  const result = await tokenLoadPromise
  tokenLoadPromise = null
  if (result) {
    return { accessToken: result, refreshToken: '' }
  }
  return null
}

const PUBLIC_ENDPOINTS = [
  /^\/api\/auth\//, // all auth endpoints are public
  /^\/api\/search$/, // search is public
  /^\/api\/games$/, // game list is public
  /^\/api\/games\/\d+$/, // game detail is public
  /^\/api\/games\/\d+\/onlinefix-compat$/, // onlinefix compat is public
  /^\/api\/games\/onlinefix-compat$/, // batch onlinefix compat is public
]

function isPublicEndpoint(path: string): boolean {
  return PUBLIC_ENDPOINTS.some((pattern) => pattern.test(path))
}

function setToken(session: { accessToken: string; refreshToken: string }): void {
  cachedAccessToken = session.accessToken
  // Store both tokens in Electron main process (refresh token stays in main, never in renderer)
  try {
    window.steamtools.setAuthSession({
      access_token: session.accessToken,
      refresh_token: session.refreshToken,
    })
  } catch {
    // Non-Electron environment
  }
}

function clearToken(): void {
  cachedAccessToken = null
  try {
    window.steamtools.setAuthSession(null)
  } catch {
    // Non-Electron environment
  }
}

let refreshPromise: Promise<string> | null = null

async function refreshAccessToken(): Promise<string> {
  if (refreshPromise) return refreshPromise

  refreshPromise = (async () => {
    // Delegate token refresh to main process — refresh token never leaves main
    const newToken = await window.steamtools.refreshToken()
    if (!newToken) {
      clearToken()
      throw new Error(t('api.sessionExpired'))
    }
    cachedAccessToken = newToken
    return newToken
  })()

  try {
    return await refreshPromise
  } finally {
    refreshPromise = null
  }
}

async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const session = await getToken()
  const isAuthEndpoint = path.startsWith('/api/auth')
  const isPublic = isPublicEndpoint(path)
  if (!session?.accessToken && !isAuthEndpoint && !isPublic) {
    const err = new Error(t('api.sessionExpiredLogin')) as any
    err.status = 401
    throw err
  }

  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> || {}),
  }

  if (session?.accessToken) {
    headers['Authorization'] = `Bearer ${session.accessToken}`
  }

  if (options.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json'
  }

  let resp = await fetch(`${API_BASE}${path}`, { ...options, headers })

  if (resp.status === 401 && session?.accessToken) {
    // Token expired — ask main process to refresh using the refresh token it holds
    const newToken = await refreshAccessToken()
    headers['Authorization'] = `Bearer ${newToken}`
    resp = await fetch(`${API_BASE}${path}`, { ...options, headers })
  }

  if (!resp.ok) {
    const errorBody = await resp.json().catch(() => ({ error: t('api.requestFailed') }))
    const err = new Error(errorBody.error || `HTTP ${resp.status}`)
    ;(err as any).status = resp.status
    throw err
  }

  if (resp.status === 204) return undefined as T
  return resp.json() as T
}

// ===== Auth =====

export async function register(email: string, password: string, username: string): Promise<AuthSession> {
  const data = await apiFetch<AuthSession>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password, username }),
  })
  setToken({ accessToken: data.access_token, refreshToken: data.refresh_token })
  return data
}

export async function login(email: string, password: string): Promise<AuthSession> {
  const data = await apiFetch<AuthSession>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
  setToken({ accessToken: data.access_token, refreshToken: data.refresh_token })
  return data
}

export async function getAuthConfig(): Promise<{ emailConfigured: boolean; fromEmail: string }> {
  return apiFetch<{ emailConfigured: boolean; fromEmail: string }>('/api/auth/config')
}

export async function forgotPassword(email: string): Promise<{ message: string }> {
  console.log(`[forgotPassword] Calling ${API_BASE}/api/auth/forgot-password for ${email}`)
  try {
    const result = await apiFetch<{ message: string }>('/api/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    })
    console.log('[forgotPassword] Success:', result)
    return result
  } catch (err: any) {
    console.error('[forgotPassword] Failed:', err.status, err.message)
    throw err
  }
}

export async function verifyResetCode(code: string): Promise<{ message: string }> {
  return apiFetch<{ message: string }>('/api/auth/verify-reset-code', {
    method: 'POST',
    body: JSON.stringify({ code }),
  })
}

export async function resetPassword(code: string, password: string): Promise<{ message: string }> {
  return apiFetch<{ message: string }>('/api/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ code, password }),
  })
}

export async function logout(): Promise<void> {
  // Logout is handled by main process which has the refresh token
  try {
    await window.steamtools.logout()
  } catch {
    // Non-Electron environment
  }
  clearToken()
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  try {
    return await apiFetch<AuthUser>('/api/users/me')
  } catch {
    return null
  }
}

export async function updateBetaStatus(isBetaTester: boolean): Promise<AuthUser> {
  return apiFetch<AuthUser>('/api/users/beta', {
    method: 'PATCH',
    body: JSON.stringify({ is_beta_tester: isBetaTester }),
  })
}

export async function isAuthenticated(): Promise<boolean> {
  // Fast check via main process IPC — no token needed
  try {
    return await window.steamtools.isAuthenticated()
  } catch {
    // Non-Electron environment — fall back to token check
    const session = await getToken()
    return session !== null
  }
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
  maxAttempts = 100
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

  throw new Error(t('api.jobPollingTimeout'))
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
  const session = await getToken()
  const headers: Record<string, string> = {}

  if (session?.accessToken) {
    headers['Authorization'] = `Bearer ${session.accessToken}`
  }

  let resp = await fetch(getManifestDownloadUrl(appId, depotId, manifestGid), { headers })

  if (resp.status === 401 && session?.accessToken) {
    const newToken = await refreshAccessToken()
    headers['Authorization'] = `Bearer ${newToken}`
    resp = await fetch(getManifestDownloadUrl(appId, depotId, manifestGid), { headers })
  }

  if (!resp.ok) {
    throw new Error(`Failed to download manifest: ${resp.status}`)
  }

  const arrayBuffer = await resp.arrayBuffer()
  return Buffer.from(arrayBuffer)
}

// Re-export types for convenience
export type {
  AuthSession,
  AuthUser,
  GameSummary,
  GameDetail,
  GameListResponse,
  InstallResponse,
  JobResponse,
  ManifestFile,
  DepotKey,
  InstallGameData,
}
