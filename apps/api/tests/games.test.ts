import { describe, it, expect, beforeEach, vi } from 'vitest'
import { buildTestApp, signTestToken, TEST_JWT_SECRET } from './setup.js'

vi.mock('../src/lib/supabase.js', () => {
  const mockChain = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    order: vi.fn().mockReturnThis(),
    range: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
  }

  return {
    getSupabase: () => ({ from: () => mockChain }),
    getSupabaseAuth: () => ({
      auth: {
        signUp: vi.fn(),
        signInWithPassword: vi.fn(),
      },
    }),
    getSupabaseAdmin: () => ({ from: () => mockChain }),
  }
})

vi.mock('../src/lib/depotbox.js', () => ({
  initiateDownload: vi.fn(),
  waitForDownloadReady: vi.fn(),
  downloadZip: vi.fn(),
  searchGames: vi.fn().mockResolvedValue({ games: [], total: 0 }),
}))

vi.mock('../src/lib/steam.js', () => ({
  fetchSteamAppDetails: vi.fn().mockResolvedValue(null),
  isSteamGame: vi.fn().mockResolvedValue(true),
}))

vi.mock('../src/lib/github.js', () => ({
  uploadLuaFile: vi.fn().mockResolvedValue(undefined),
  uploadManifestFile: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../src/lib/telemetry.js', () => ({
  trackGameInstalled: vi.fn().mockResolvedValue(undefined),
  trackDepotBoxImportStarted: vi.fn().mockResolvedValue(undefined),
  trackDepotBoxImportCompleted: vi.fn().mockResolvedValue(undefined),
  trackDepotBoxImportFailed: vi.fn().mockResolvedValue(undefined),
  trackEvent: vi.fn().mockResolvedValue(undefined),
}))

process.env.JWT_SECRET = TEST_JWT_SECRET
process.env.SUPABASE_URL = 'http://test.supabase.co'
process.env.SUPABASE_SERVICE_KEY = 'test-service-key'
process.env.SUPABASE_ANON_KEY = 'test-anon-key'

describe('Games Routes', () => {
  let app: any
  let authToken: string

  beforeEach(async () => {
    app = await buildTestApp()
    authToken = signTestToken(app, { userId: 'test-user-id', email: 'test@test.com' })
  })

  describe('GET /api/games', () => {
    it('returns list without auth (public route)', async () => {
      const resp = await app.inject({
        method: 'GET',
        url: '/api/games?limit=10',
      })
      expect(resp.statusCode).toBe(200)
    })

    it('rejects limit > 1000', async () => {
      const resp = await app.inject({
        method: 'GET',
        url: '/api/games?limit=5000',
      })
      expect(resp.statusCode).toBe(400)
    })

    it('rejects negative offset', async () => {
      const resp = await app.inject({
        method: 'GET',
        url: '/api/games?offset=-1',
      })
      expect(resp.statusCode).toBe(400)
    })
  })

  describe('GET /api/games/:app_id', () => {
    it('is a public route (no auth required)', async () => {
      const resp = await app.inject({
        method: 'GET',
        url: '/api/games/12345',
      })
      expect(resp.statusCode).toBe(404)
    })

    it('accepts valid auth token', async () => {
      const resp = await app.inject({
        method: 'GET',
        url: '/api/games/12345',
        headers: { authorization: `Bearer ${authToken}` },
      })
      expect(resp.statusCode).toBe(404)
    })
  })

  describe('GET /api/games/:app_id/depot-keys', () => {
    it('requires authentication', async () => {
      const resp = await app.inject({
        method: 'GET',
        url: '/api/games/12345/depot-keys',
      })
      expect(resp.statusCode).toBe(401)
    })
  })

  describe('POST /api/games/:app_id/install', () => {
    it('requires authentication', async () => {
      const resp = await app.inject({
        method: 'POST',
        url: '/api/games/12345/install',
      })
      expect(resp.statusCode).toBe(401)
    })
  })
})
