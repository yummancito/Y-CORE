import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { loadEnv, __resetEnvCacheForTests } from '../../src/config/env.js'
import { buildApp } from '../../src/app/build.js'
import { areInfraServicesAvailable } from '../setup/servicesAvailable.js'

describe('hardening de seguridad (Fase pública)', () => {
  let infraAvailable = false

  beforeAll(async () => {
    infraAvailable = await areInfraServicesAvailable()
  })

  describe('EXPOSE_DOCS=false (default)', () => {
    let app: FastifyInstance | undefined

    beforeAll(async () => {
      if (!infraAvailable) return
      __resetEnvCacheForTests()
      const env = loadEnv({
        DATABASE_URL: 'postgresql://ycinema:ycinema@localhost:5432/ycinema',
        REDIS_URL: 'redis://localhost:6379',
        SUPABASE_URL: 'https://xxxxx.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
        SUPABASE_JWT_SECRET: 'test-secret-at-least-16-chars',
        EXPOSE_DOCS: 'false',
      })
      app = await buildApp({ env })
      await app.ready()
    })

    afterAll(async () => {
      await app?.close()
    })

    it('GET /docs no existe (404) cuando EXPOSE_DOCS=false', async () => {
      if (!infraAvailable || !app) {
        console.warn('[SKIP] Postgres/Redis no disponibles — hardening de seguridad.')
        return
      }
      const res = await app.inject({ method: 'GET', url: '/docs' })
      expect(res.statusCode).toBe(404)
    })
  })

  describe('EXPOSE_DOCS=true', () => {
    let app: FastifyInstance | undefined

    beforeAll(async () => {
      if (!infraAvailable) return
      __resetEnvCacheForTests()
      const env = loadEnv({
        DATABASE_URL: 'postgresql://ycinema:ycinema@localhost:5432/ycinema',
        REDIS_URL: 'redis://localhost:6379',
        SUPABASE_URL: 'https://xxxxx.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
        SUPABASE_JWT_SECRET: 'test-secret-at-least-16-chars',
        EXPOSE_DOCS: 'true',
      })
      app = await buildApp({ env })
      await app.ready()
    })

    afterAll(async () => {
      await app?.close()
    })

    it('GET /docs responde 200 cuando EXPOSE_DOCS=true', async () => {
      if (!infraAvailable || !app) {
        console.warn('[SKIP] Postgres/Redis no disponibles — hardening de seguridad.')
        return
      }
      const res = await app.inject({ method: 'GET', url: '/docs' })
      expect(res.statusCode).toBe(200)
    })
  })

  describe('cabeceras de seguridad y CORS', () => {
    let app: FastifyInstance | undefined

    beforeAll(async () => {
      if (!infraAvailable) return
      __resetEnvCacheForTests()
      const env = loadEnv({
        DATABASE_URL: 'postgresql://ycinema:ycinema@localhost:5432/ycinema',
        REDIS_URL: 'redis://localhost:6379',
        SUPABASE_URL: 'https://xxxxx.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
        SUPABASE_JWT_SECRET: 'test-secret-at-least-16-chars',
        CORS_ORIGIN: 'https://tuapp.com',
      })
      app = await buildApp({ env })
      await app.ready()
    })

    afterAll(async () => {
      await app?.close()
    })

    it('Helmet agrega cabeceras de seguridad básicas', async () => {
      if (!infraAvailable || !app) {
        console.warn('[SKIP] Postgres/Redis no disponibles — hardening de seguridad.')
        return
      }
      const res = await app.inject({ method: 'GET', url: '/health' })
      expect(res.headers['x-content-type-options']).toBe('nosniff')
    })

    it('CORS solo permite el origen configurado, no cualquiera', async () => {
      if (!infraAvailable || !app) {
        console.warn('[SKIP] Postgres/Redis no disponibles — hardening de seguridad.')
        return
      }
      const allowed = await app.inject({
        method: 'GET',
        url: '/health',
        headers: { origin: 'https://tuapp.com' },
      })
      expect(allowed.headers['access-control-allow-origin']).toBe('https://tuapp.com')

      const blocked = await app.inject({
        method: 'GET',
        url: '/health',
        headers: { origin: 'https://sitio-malicioso.com' },
      })
      expect(blocked.headers['access-control-allow-origin']).toBeUndefined()
    })
  })

  describe('rate limiting diferenciado por rol', () => {
    let app: FastifyInstance | undefined

    beforeAll(async () => {
      if (!infraAvailable) return
      __resetEnvCacheForTests()
      const env = loadEnv({
        DATABASE_URL: 'postgresql://ycinema:ycinema@localhost:5432/ycinema',
        REDIS_URL: 'redis://localhost:6379',
        SUPABASE_URL: 'https://xxxxx.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
        SUPABASE_JWT_SECRET: 'test-secret-at-least-16-chars',
        RATE_LIMIT_MAX: '3',
        RATE_LIMIT_WINDOW_MS: '60000',
      })
      app = await buildApp({ env })
      await app.ready()
    })

    afterAll(async () => {
      await app?.close()
    })

    it('un anónimo recibe 429 tras superar RATE_LIMIT_MAX', async () => {
      if (!infraAvailable || !app) {
        console.warn('[SKIP] Postgres/Redis no disponibles — hardening de seguridad.')
        return
      }
      const results: number[] = []
      for (let i = 0; i < 5; i += 1) {
        const res = await app.inject({ method: 'GET', url: '/health' })
        results.push(res.statusCode)
      }
      expect(results).toContain(429)
    })
  })
})
