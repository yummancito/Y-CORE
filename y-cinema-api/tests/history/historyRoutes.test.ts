import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { PrismaClient } from '@prisma/client'
import { loadEnv, __resetEnvCacheForTests } from '../../src/config/env.js'
import { buildApp } from '../../src/app/build.js'
import { areInfraServicesAvailable, isSupabaseAuthAvailable } from '../setup/servicesAvailable.js'

describe('history (requiere autenticación)', () => {
  let app: FastifyInstance | undefined
  let prisma: PrismaClient | undefined
  let infraAvailable = false
  let accessToken = ''
  let mediaId = ''
  const testEmail = `history-test-${Date.now()}@example.com`

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

    const register = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: testEmail, password: 'correcthorsebatterystaple' },
    })
    accessToken = register.json().tokens.accessToken

    const media = await prisma.media.create({ data: { type: 'MOVIE', title: 'History Test Movie' } })
    mediaId = media.id
  })

  afterAll(async () => {
    if (prisma) {
      await prisma.history.deleteMany({ where: { mediaId } }).catch(() => {})
      await prisma.media.delete({ where: { id: mediaId } }).catch(() => {})
      await prisma.user.deleteMany({ where: { email: testEmail } }).catch(() => {})
    }
    await prisma?.$disconnect()
    await app?.close()
  })

  it('GET /history sin token devuelve 401', async () => {
    if (!infraAvailable || !app) {
      console.warn('[SKIP] Postgres/Redis no disponibles — ver docs/ROADMAP.md Fase 14.')
      return
    }
    const res = await app.inject({ method: 'GET', url: '/api/v1/history' })
    expect(res.statusCode).toBe(401)
  })

  it('POST /history rechaza progressPct fuera de [0,1]', async () => {
    if (!infraAvailable || !app) {
      console.warn('[SKIP] Postgres/Redis no disponibles — ver docs/ROADMAP.md Fase 14.')
      return
    }
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/history',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { mediaId, progressPct: 1.5 },
    })
    expect(res.statusCode).toBe(400)
  })

  it('POST /history registra progreso, y GET /history lo lista más reciente primero', async () => {
    if (!infraAvailable || !app) {
      console.warn('[SKIP] Postgres/Redis no disponibles — ver docs/ROADMAP.md Fase 14.')
      return
    }
    const record = await app.inject({
      method: 'POST',
      url: '/api/v1/history',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { mediaId, progressPct: 0.42 },
    })
    expect(record.statusCode).toBe(201)

    const list = await app.inject({
      method: 'GET',
      url: '/api/v1/history',
      headers: { authorization: `Bearer ${accessToken}` },
    })
    expect(list.statusCode).toBe(200)
    const body = list.json()
    expect(body[0]).toMatchObject({ mediaId, progressPct: 0.42 })
  })
})
