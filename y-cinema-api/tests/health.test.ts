import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { loadEnv, __resetEnvCacheForTests } from '../src/config/env.js'
import { buildApp } from '../src/app/build.js'
import { areInfraServicesAvailable } from './setup/servicesAvailable.js'

describe('GET /health', () => {
  let app: FastifyInstance | undefined
  let infraAvailable = false

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
  })

  afterAll(async () => {
    await app?.close()
  })

  it('responde 200 con status ok (liveness)', async () => {
    if (!infraAvailable || !app) {
      console.warn(
        '[SKIP] Postgres/Redis no disponibles en este entorno (docker compose up requerido) — ver docs/ROADMAP.md Fase 1.',
      )
      return
    }
    const res = await app.inject({ method: 'GET', url: '/health' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ status: 'ok' })
  })

  it('responde 200 en /health/ready cuando DB y Redis están arriba', async () => {
    if (!infraAvailable || !app) {
      console.warn(
        '[SKIP] Postgres/Redis no disponibles en este entorno (docker compose up requerido) — ver docs/ROADMAP.md Fase 1.',
      )
      return
    }
    const res = await app.inject({ method: 'GET', url: '/health/ready' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({
      status: 'ok',
      checks: { database: 'ok', redis: 'ok' },
    })
  })
})
