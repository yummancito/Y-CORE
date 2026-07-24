import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { PrismaClient } from '@prisma/client'
import { loadEnv, __resetEnvCacheForTests } from '../../src/config/env.js'
import { buildApp } from '../../src/app/build.js'
import { areInfraServicesAvailable, isSupabaseAuthAvailable } from '../setup/servicesAvailable.js'

describe('favorites (requiere autenticación)', () => {
  let app: FastifyInstance | undefined
  let prisma: PrismaClient | undefined
  let infraAvailable = false
  let accessToken = ''
  let mediaId = ''
  const testEmail = `favorites-test-${Date.now()}@example.com`

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

    const media = await prisma.media.create({ data: { type: 'MOVIE', title: 'Favorites Test Movie' } })
    mediaId = media.id
  })

  afterAll(async () => {
    if (prisma) {
      await prisma.media.delete({ where: { id: mediaId } }).catch(() => {})
      await prisma.user.deleteMany({ where: { email: testEmail } }).catch(() => {})
    }
    await prisma?.$disconnect()
    await app?.close()
  })

  it('GET /favorites sin token devuelve 401', async () => {
    if (!infraAvailable || !app) {
      console.warn('[SKIP] Postgres/Redis no disponibles — ver docs/ROADMAP.md Fase 10.')
      return
    }
    const res = await app.inject({ method: 'GET', url: '/api/v1/favorites' })
    expect(res.statusCode).toBe(401)
  })

  it('POST /favorites agrega un media, y GET /favorites lo lista', async () => {
    if (!infraAvailable || !app) {
      console.warn('[SKIP] Postgres/Redis no disponibles — ver docs/ROADMAP.md Fase 10.')
      return
    }
    const add = await app.inject({
      method: 'POST',
      url: '/api/v1/favorites',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { mediaId },
    })
    expect(add.statusCode).toBe(201)

    const list = await app.inject({
      method: 'GET',
      url: '/api/v1/favorites',
      headers: { authorization: `Bearer ${accessToken}` },
    })
    expect(list.statusCode).toBe(200)
    expect(list.json().some((f: { mediaId: string }) => f.mediaId === mediaId)).toBe(true)
  })

  it('POST /favorites es idempotente (agregar dos veces no falla)', async () => {
    if (!infraAvailable || !app) {
      console.warn('[SKIP] Postgres/Redis no disponibles — ver docs/ROADMAP.md Fase 10.')
      return
    }
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/favorites',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { mediaId },
    })
    expect(res.statusCode).toBe(201)
  })

  it('DELETE /favorites/:mediaId lo quita de la lista', async () => {
    if (!infraAvailable || !app) {
      console.warn('[SKIP] Postgres/Redis no disponibles — ver docs/ROADMAP.md Fase 10.')
      return
    }
    const del = await app.inject({
      method: 'DELETE',
      url: `/api/v1/favorites/${mediaId}`,
      headers: { authorization: `Bearer ${accessToken}` },
    })
    expect(del.statusCode).toBe(204)

    const list = await app.inject({
      method: 'GET',
      url: '/api/v1/favorites',
      headers: { authorization: `Bearer ${accessToken}` },
    })
    expect(list.json().some((f: { mediaId: string }) => f.mediaId === mediaId)).toBe(false)
  })
})
