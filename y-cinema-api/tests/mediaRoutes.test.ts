import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { PrismaClient } from '@prisma/client'
import { loadEnv, __resetEnvCacheForTests } from '../src/config/env.js'
import { buildApp } from '../src/app/build.js'
import { areInfraServicesAvailable } from './setup/servicesAvailable.js'

describe('GET /api/v1/media', () => {
  let app: FastifyInstance | undefined
  let prisma: PrismaClient | undefined
  let infraAvailable = false
  let seededMediaId = ''

  beforeAll(async () => {
    infraAvailable = await areInfraServicesAvailable()
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
    const media = await prisma.media.create({
      data: {
        type: 'MOVIE',
        title: `Test Movie ${Date.now()}`,
        popularity: 999,
      },
    })
    seededMediaId = media.id
  })

  afterAll(async () => {
    if (prisma && seededMediaId) {
      await prisma.media.delete({ where: { id: seededMediaId } }).catch(() => {})
    }
    await prisma?.$disconnect()
    await app?.close()
  })

  it('lista media paginada con shape correcto', async () => {
    if (!infraAvailable || !app) {
      console.warn('[SKIP] Postgres/Redis no disponibles — ver docs/ROADMAP.md Fase 3.')
      return
    }
    const res = await app.inject({ method: 'GET', url: '/api/v1/media?pageSize=5' })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body).toMatchObject({ page: 1, pageSize: 5 })
    expect(Array.isArray(body.items)).toBe(true)
  })

  it('devuelve 404 para un id inexistente pero válido', async () => {
    if (!infraAvailable || !app) {
      console.warn('[SKIP] Postgres/Redis no disponibles — ver docs/ROADMAP.md Fase 3.')
      return
    }
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/media/00000000-0000-0000-0000-000000000000',
    })
    expect(res.statusCode).toBe(404)
  })

  it('devuelve 400 para un id con formato inválido', async () => {
    if (!infraAvailable || !app) {
      console.warn('[SKIP] Postgres/Redis no disponibles — ver docs/ROADMAP.md Fase 3.')
      return
    }
    const res = await app.inject({ method: 'GET', url: '/api/v1/media/no-es-un-uuid' })
    expect(res.statusCode).toBe(400)
    expect(res.json().error.code).toBe('VALIDATION_ERROR')
  })

  it('devuelve el media sembrado por id', async () => {
    if (!infraAvailable || !app || !seededMediaId) {
      console.warn('[SKIP] Postgres/Redis no disponibles — ver docs/ROADMAP.md Fase 3.')
      return
    }
    const res = await app.inject({ method: 'GET', url: `/api/v1/media/${seededMediaId}` })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.id).toBe(seededMediaId)
    // El seed no crea ningún MediaProviderRef — sin ref tmdb/omdb,
    // imdbId debe resolver a null, no explotar ni quedar undefined.
    expect(body.imdbId).toBeNull()
  })
})
