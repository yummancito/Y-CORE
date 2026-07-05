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
    is: vi.fn().mockReturnThis(),
  }

  return {
    getSupabase: () => ({ from: () => mockChain }),
    getSupabaseAuth: () => ({
      auth: {
        signUp: vi.fn().mockResolvedValue({ data: { user: { id: 'test-user-id' } }, error: null }),
        signInWithPassword: vi.fn().mockResolvedValue({ data: { user: { id: 'test-user-id' } }, error: null }),
        admin: { updateUserById: vi.fn().mockResolvedValue({ data: {}, error: null }) },
      },
    }),
    getSupabaseAdmin: () => ({ from: () => mockChain }),
  }
})

vi.mock('../src/lib/telemetry.js', () => ({
  trackEvent: vi.fn().mockResolvedValue(undefined),
}))

process.env.JWT_SECRET = TEST_JWT_SECRET
process.env.SUPABASE_URL = 'http://test.supabase.co'
process.env.SUPABASE_SERVICE_KEY = 'test-service-key'
process.env.SUPABASE_ANON_KEY = 'test-anon-key'

describe('Auth Routes', () => {
  let app: any

  beforeEach(async () => {
    app = await buildTestApp()
  })

  describe('POST /api/auth/register', () => {
    it('rejects invalid email', async () => {
      const resp = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: { email: 'not-an-email', password: 'password123', username: 'testuser' },
      })
      expect(resp.statusCode).toBe(400)
    })

    it('rejects short password', async () => {
      const resp = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: { email: 'test@test.com', password: 'short', username: 'testuser' },
      })
      expect(resp.statusCode).toBe(400)
    })

    it('rejects invalid username', async () => {
      const resp = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: { email: 'test@test.com', password: 'password123', username: 'a!' },
      })
      expect(resp.statusCode).toBe(400)
    })
  })

  describe('POST /api/auth/login', () => {
    it('rejects missing password', async () => {
      const resp = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email: 'test@test.com' },
      })
      expect(resp.statusCode).toBe(400)
    })

    it('rejects invalid email format', async () => {
      const resp = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email: 'not-email', password: 'password123' },
      })
      expect(resp.statusCode).toBe(400)
    })
  })

  describe('POST /api/auth/refresh', () => {
    it('rejects non-UUID refresh token', async () => {
      const resp = await app.inject({
        method: 'POST',
        url: '/api/auth/refresh',
        payload: { refresh_token: 'not-a-uuid' },
      })
      expect(resp.statusCode).toBe(400)
    })

    it('rejects missing refresh token', async () => {
      const resp = await app.inject({
        method: 'POST',
        url: '/api/auth/refresh',
        payload: {},
      })
      expect(resp.statusCode).toBe(400)
    })
  })

  describe('POST /api/auth/forgot-password', () => {
    it('rejects invalid email', async () => {
      const resp = await app.inject({
        method: 'POST',
        url: '/api/auth/forgot-password',
        payload: { email: 'not-email' },
      })
      expect(resp.statusCode).toBe(400)
    })
  })

  describe('POST /api/auth/reset-password', () => {
    it('rejects short password', async () => {
      const resp = await app.inject({
        method: 'POST',
        url: '/api/auth/reset-password',
        payload: { code: '123456', password: 'short' },
      })
      expect(resp.statusCode).toBe(400)
    })

    it('rejects short code', async () => {
      const resp = await app.inject({
        method: 'POST',
        url: '/api/auth/reset-password',
        payload: { code: '123', password: 'password123' },
      })
      expect(resp.statusCode).toBe(400)
    })
  })

  describe('Health check', () => {
    it('returns ok', async () => {
      const resp = await app.inject({ method: 'GET', url: '/health' })
      expect(resp.statusCode).toBe(200)
      expect(resp.json().status).toBe('ok')
    })
  })
})
