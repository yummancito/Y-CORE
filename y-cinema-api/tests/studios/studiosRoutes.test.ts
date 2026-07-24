import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { PrismaClient } from '@prisma/client'
import { loadEnv, __resetEnvCacheForTests } from '../../src/config/env.js'
import { buildApp } from '../../src/app/build.js'
import { areInfraServicesAvailable } from '../setup/servicesAvailable.js'

describe('GET /api/v1/studios', () => {
  let app: FastifyInstance | undefined
  let prisma: PrismaClient | undefined
  let infraAvailable = false
  let studioId = ''

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

    const studio = await prisma.studio.create({ data: { name: `Test Studio ${Date.now()}` } })
    studioId = studio.id
  })

  afterAll(async () => {
    if (prisma && studioId) {
      await prisma.studio.delete({ where: { id: studioId } }).catch(() => {})
    }
    await prisma?.$disconnect()
    await app?.close()
  })

  it('lista los estudios e incluye el sembrado', async () => {
    if (!infraAvailable || !app) {
      console.warn('[SKIP] Postgres/Redis no disponibles — ver docs/ROADMAP.md Fase 14.')
      return
    }
    const res = await app.inject({ method: 'GET', url: '/api/v1/studios' })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.some((s: { id: string }) => s.id === studioId)).toBe(true)
  })
})
