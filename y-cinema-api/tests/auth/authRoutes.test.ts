import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { PrismaClient } from '@prisma/client'
import { loadEnv, __resetEnvCacheForTests } from '../../src/config/env.js'
import { buildApp } from '../../src/app/build.js'
import { areInfraServicesAvailable, isSupabaseAuthAvailable } from '../setup/servicesAvailable.js'

describe('auth (register/login/refresh/logout/me)', () => {
  let app: FastifyInstance | undefined
  let prisma: PrismaClient | undefined
  let available = false
  const testEmail = `auth-test-${Date.now()}@example.com`
  const testPassword = 'correcthorsebatterystaple'

  beforeAll(async () => {
    available = (await areInfraServicesAvailable()) && (await isSupabaseAuthAvailable())
    if (!available) return

    __resetEnvCacheForTests()
    const env = loadEnv()
    app = await buildApp({ env })
    await app.ready()
    prisma = new PrismaClient()
  })

  afterAll(async () => {
    if (prisma) {
      await prisma.user.deleteMany({ where: { email: testEmail } }).catch(() => {})
    }
    await prisma?.$disconnect()
    await app?.close()
  })

  it('POST /auth/register crea la cuenta y devuelve tokens', async () => {
    if (!available || !app) {
      console.warn('[SKIP] Supabase Auth no disponible — ver docs/ROADMAP.md, migración a Supabase.')
      return
    }
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: testEmail, password: testPassword },
    })

    expect(res.statusCode).toBe(201)
    const body = res.json()
    expect(body.user.email).toBe(testEmail)
    expect(body.tokens.accessToken).toBeTruthy()
    expect(body.tokens.refreshToken).toBeTruthy()
  })

  it('POST /auth/register rechaza un email ya registrado con 409', async () => {
    if (!available || !app) {
      console.warn('[SKIP] Supabase Auth no disponible — ver docs/ROADMAP.md, migración a Supabase.')
      return
    }
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: testEmail, password: testPassword },
    })
    expect(res.statusCode).toBe(409)
  })

  it('POST /auth/login con credenciales correctas devuelve tokens', async () => {
    if (!available || !app) {
      console.warn('[SKIP] Supabase Auth no disponible — ver docs/ROADMAP.md, migración a Supabase.')
      return
    }
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: testEmail, password: testPassword },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().tokens.accessToken).toBeTruthy()
  })

  it('POST /auth/login con contraseña incorrecta devuelve 401', async () => {
    if (!available || !app) {
      console.warn('[SKIP] Supabase Auth no disponible — ver docs/ROADMAP.md, migración a Supabase.')
      return
    }
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: testEmail, password: 'wrong-password' },
    })
    expect(res.statusCode).toBe(401)
  })

  it('GET /auth/me sin token devuelve 401', async () => {
    if (!available || !app) {
      console.warn('[SKIP] Supabase Auth no disponible — ver docs/ROADMAP.md, migración a Supabase.')
      return
    }
    const res = await app.inject({ method: 'GET', url: '/api/v1/auth/me' })
    expect(res.statusCode).toBe(401)
  })

  it('GET /auth/me con un access token válido devuelve el usuario', async () => {
    if (!available || !app) {
      console.warn('[SKIP] Supabase Auth no disponible — ver docs/ROADMAP.md, migración a Supabase.')
      return
    }
    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: testEmail, password: testPassword },
    })
    const { accessToken } = login.json().tokens

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { authorization: `Bearer ${accessToken}` },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().email).toBe(testEmail)
  })

  it('POST /auth/refresh devuelve un access token nuevo y válido', async () => {
    if (!available || !app) {
      console.warn('[SKIP] Supabase Auth no disponible — ver docs/ROADMAP.md, migración a Supabase.')
      return
    }
    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: testEmail, password: testPassword },
    })
    const { refreshToken } = login.json().tokens

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().accessToken).toBeTruthy()
  })

  it('POST /auth/refresh con un refresh token inválido devuelve 401', async () => {
    if (!available || !app) {
      console.warn('[SKIP] Supabase Auth no disponible — ver docs/ROADMAP.md, migración a Supabase.')
      return
    }
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken: 'not-a-real-refresh-token' },
    })
    expect(res.statusCode).toBe(401)
  })

  it('POST /auth/logout revoca la sesión del access token', async () => {
    if (!available || !app) {
      console.warn('[SKIP] Supabase Auth no disponible — ver docs/ROADMAP.md, migración a Supabase.')
      return
    }
    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: testEmail, password: testPassword },
    })
    const { accessToken } = login.json().tokens

    const logout = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      payload: { accessToken },
    })
    expect(logout.statusCode).toBe(204)

    const meAfterLogout = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { authorization: `Bearer ${accessToken}` },
    })
    expect(meAfterLogout.statusCode).toBe(401)
  })
})
