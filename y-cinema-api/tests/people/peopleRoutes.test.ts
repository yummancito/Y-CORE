import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { PrismaClient } from '@prisma/client'
import { loadEnv, __resetEnvCacheForTests } from '../../src/config/env.js'
import { buildApp } from '../../src/app/build.js'
import { areInfraServicesAvailable } from '../setup/servicesAvailable.js'

describe('GET /api/v1/people/:id', () => {
  let app: FastifyInstance | undefined
  let prisma: PrismaClient | undefined
  let infraAvailable = false
  let personId = ''
  let mediaId = ''

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

    const person = await prisma.person.create({ data: { name: `Test Actor ${Date.now()}` } })
    personId = person.id
    const media = await prisma.media.create({ data: { type: 'MOVIE', title: 'People Test Movie' } })
    mediaId = media.id
    await prisma.mediaPerson.create({
      data: { mediaId, personId, role: 'ACTOR', characterName: 'Test Character' },
    })
  })

  afterAll(async () => {
    if (prisma) {
      await prisma.mediaPerson.deleteMany({ where: { mediaId, personId } }).catch(() => {})
      await prisma.media.delete({ where: { id: mediaId } }).catch(() => {})
      await prisma.person.delete({ where: { id: personId } }).catch(() => {})
    }
    await prisma?.$disconnect()
    await app?.close()
  })

  it('devuelve 404 para un id inexistente pero válido', async () => {
    if (!infraAvailable || !app) {
      console.warn('[SKIP] Postgres/Redis no disponibles — ver docs/ROADMAP.md Fase 14.')
      return
    }
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/people/00000000-0000-0000-0000-000000000000',
    })
    expect(res.statusCode).toBe(404)
  })

  it('devuelve la persona con su filmografía', async () => {
    if (!infraAvailable || !app) {
      console.warn('[SKIP] Postgres/Redis no disponibles — ver docs/ROADMAP.md Fase 14.')
      return
    }
    const res = await app.inject({ method: 'GET', url: `/api/v1/people/${personId}` })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.filmography).toHaveLength(1)
    expect(body.filmography[0]).toMatchObject({
      mediaId,
      title: 'People Test Movie',
      role: 'ACTOR',
      characterName: 'Test Character',
    })
  })
})
