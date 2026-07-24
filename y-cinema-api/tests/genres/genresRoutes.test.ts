import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { PrismaClient } from '@prisma/client'
import { loadEnv, __resetEnvCacheForTests } from '../../src/config/env.js'
import { buildApp } from '../../src/app/build.js'
import { areInfraServicesAvailable } from '../setup/servicesAvailable.js'

describe('GET /api/v1/genres', () => {
  let app: FastifyInstance | undefined
  let prisma: PrismaClient | undefined
  let infraAvailable = false
  let genreId = ''
  const genreSlug = `test-genre-${Date.now()}`

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

    const genre = await prisma.genre.create({ data: { slug: genreSlug, name: 'Test Genre ZZZ' } })
    genreId = genre.id
  })

  afterAll(async () => {
    if (prisma && genreId) {
      await prisma.genre.delete({ where: { id: genreId } }).catch(() => {})
    }
    await prisma?.$disconnect()
    await app?.close()
  })

  it('lista los géneros ordenados alfabéticamente e incluye el sembrado', async () => {
    if (!infraAvailable || !app) {
      console.warn('[SKIP] Postgres/Redis no disponibles — ver docs/ROADMAP.md Fase 14.')
      return
    }
    const res = await app.inject({ method: 'GET', url: '/api/v1/genres' })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(Array.isArray(body)).toBe(true)
    expect(body.some((g: { slug: string }) => g.slug === genreSlug)).toBe(true)

    const names = body.map((g: { name: string }) => g.name)
    const sorted = [...names].sort((a, b) => a.localeCompare(b))
    expect(names).toEqual(sorted)
  })
})
