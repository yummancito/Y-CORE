import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { PrismaClient } from '@prisma/client'
import { loadEnv, __resetEnvCacheForTests } from '../../src/config/env.js'
import { buildApp } from '../../src/app/build.js'
import { areInfraServicesAvailable, isSupabaseAuthAvailable } from '../setup/servicesAvailable.js'

describe('admin routes (protegidas por rol)', () => {
  let app: FastifyInstance | undefined
  let prisma: PrismaClient | undefined
  let infraAvailable = false
  let userToken = ''
  let adminToken = ''
  let mediaId = ''
  const userEmail = `admin-test-user-${Date.now()}@example.com`
  const adminEmail = `admin-test-admin-${Date.now()}@example.com`

  beforeAll(async () => {
    infraAvailable = (await areInfraServicesAvailable()) && (await isSupabaseAuthAvailable())
    if (!infraAvailable) return

    __resetEnvCacheForTests()
    process.env.SUPABASE_URL ??= 'https://xxxxx.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-role-key'
    process.env.SUPABASE_JWT_SECRET ??= 'test-secret-at-least-16-chars'
    process.env.DATABASE_URL ??= 'postgresql://ycinema:ycinema@localhost:5432/ycinema'
    process.env.REDIS_URL ??= 'redis://localhost:6379'
    const env = loadEnv()
    app = await buildApp({ env })
    await app.ready()
    prisma = new PrismaClient()

    const userReg = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: userEmail, password: 'correcthorsebatterystaple' },
    })
    userToken = userReg.json().tokens.accessToken

    const adminReg = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: adminEmail, password: 'correcthorsebatterystaple' },
    })
    const adminUserId = adminReg.json().user.id
    await prisma.user.update({ where: { id: adminUserId }, data: { role: 'ADMIN' } })
    const adminLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: adminEmail, password: 'correcthorsebatterystaple' },
    })
    adminToken = adminLogin.json().tokens.accessToken

    const media = await prisma.media.create({ data: { type: 'MOVIE', title: 'Admin Test Movie' } })
    mediaId = media.id
  })

  afterAll(async () => {
    if (prisma) {
      await prisma.media.delete({ where: { id: mediaId } }).catch(() => {})
      await prisma.user.deleteMany({ where: { email: { in: [userEmail, adminEmail] } } }).catch(() => {})
    }
    await prisma?.$disconnect()
    await app?.close()
  })

  it('GET /admin/stats sin token devuelve 401', async () => {
    if (!infraAvailable || !app) {
      console.warn('[SKIP] Postgres/Redis no disponibles — ver docs/ROADMAP.md Fase 11.')
      return
    }
    const res = await app.inject({ method: 'GET', url: '/api/v1/admin/stats' })
    expect(res.statusCode).toBe(401)
  })

  it('GET /admin/stats con un usuario normal (no admin) devuelve 403', async () => {
    if (!infraAvailable || !app) {
      console.warn('[SKIP] Postgres/Redis no disponibles — ver docs/ROADMAP.md Fase 11.')
      return
    }
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/stats',
      headers: { authorization: `Bearer ${userToken}` },
    })
    expect(res.statusCode).toBe(403)
  })

  it('GET /admin/stats con un admin devuelve estadísticas del catálogo', async () => {
    if (!infraAvailable || !app) {
      console.warn('[SKIP] Postgres/Redis no disponibles — ver docs/ROADMAP.md Fase 11.')
      return
    }
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/stats',
      headers: { authorization: `Bearer ${adminToken}` },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.totalMedia).toBeGreaterThanOrEqual(1)
    expect(typeof body.byType).toBe('object')
  })

  it('PATCH /admin/media/:id como admin edita el título', async () => {
    if (!infraAvailable || !app) {
      console.warn('[SKIP] Postgres/Redis no disponibles — ver docs/ROADMAP.md Fase 11.')
      return
    }
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/admin/media/${mediaId}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { title: 'Admin Test Movie (Edited)' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().title).toBe('Admin Test Movie (Edited)')
  })

  it('PATCH /admin/media/:id como usuario normal devuelve 403', async () => {
    if (!infraAvailable || !app) {
      console.warn('[SKIP] Postgres/Redis no disponibles — ver docs/ROADMAP.md Fase 11.')
      return
    }
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/admin/media/${mediaId}`,
      headers: { authorization: `Bearer ${userToken}` },
      payload: { title: 'Should not work' },
    })
    expect(res.statusCode).toBe(403)
  })

  it('POST /admin/media/:id/images agrega una imagen', async () => {
    if (!infraAvailable || !app) {
      console.warn('[SKIP] Postgres/Redis no disponibles — ver docs/ROADMAP.md Fase 11.')
      return
    }
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/media/${mediaId}/images`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { type: 'POSTER', url: 'https://example.com/poster.jpg' },
    })
    expect(res.statusCode).toBe(201)
  })

  it('GET /admin/jobs como admin devuelve una lista (posiblemente vacía)', async () => {
    if (!infraAvailable || !app) {
      console.warn('[SKIP] Postgres/Redis no disponibles — ver docs/ROADMAP.md Fase 11.')
      return
    }
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/jobs',
      headers: { authorization: `Bearer ${adminToken}` },
    })
    expect(res.statusCode).toBe(200)
    expect(Array.isArray(res.json())).toBe(true)
  })
})
