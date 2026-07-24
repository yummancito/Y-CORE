import { describe, expect, it } from 'vitest'
import { loadEnv, __resetEnvCacheForTests } from '../src/config/env.js'

const validEnv = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
  REDIS_URL: 'redis://localhost:6379',
  SUPABASE_URL: 'https://xxxxx.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
  SUPABASE_JWT_SECRET: 'a-secret-that-is-long-enough',
}

describe('loadEnv', () => {
  it('acepta un entorno válido y aplica defaults', () => {
    __resetEnvCacheForTests()
    const env = loadEnv(validEnv)
    expect(env.PORT).toBe(4000)
    expect(env.NODE_ENV).toBe('development')
  })

  it('rechaza cuando falta DATABASE_URL', () => {
    __resetEnvCacheForTests()
    expect(() =>
      loadEnv({
        REDIS_URL: validEnv.REDIS_URL,
        SUPABASE_URL: validEnv.SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY: validEnv.SUPABASE_SERVICE_ROLE_KEY,
        SUPABASE_JWT_SECRET: validEnv.SUPABASE_JWT_SECRET,
      }),
    ).toThrow(/DATABASE_URL/)
  })

  it('rechaza un SUPABASE_JWT_SECRET demasiado corto', () => {
    __resetEnvCacheForTests()
    expect(() => loadEnv({ ...validEnv, SUPABASE_JWT_SECRET: 'short' })).toThrow(
      /SUPABASE_JWT_SECRET/,
    )
  })

  it('cachea el resultado entre llamadas hasta resetear', () => {
    __resetEnvCacheForTests()
    const first = loadEnv(validEnv)
    const second = loadEnv({ ...validEnv, PORT: '9999' })
    expect(second).toBe(first)
    expect(second.PORT).toBe(4000)
  })

  it("rechaza CORS_ORIGIN='*' en producción", () => {
    __resetEnvCacheForTests()
    expect(() =>
      loadEnv({ ...validEnv, NODE_ENV: 'production', CORS_ORIGIN: '*' }),
    ).toThrow(/CORS_ORIGIN/)
  })

  it("acepta CORS_ORIGIN='*' fuera de producción", () => {
    __resetEnvCacheForTests()
    const env = loadEnv({ ...validEnv, NODE_ENV: 'development', CORS_ORIGIN: '*' })
    expect(env.CORS_ORIGIN).toBe('*')
  })

  it('acepta un CORS_ORIGIN explícito en producción', () => {
    __resetEnvCacheForTests()
    const env = loadEnv({
      ...validEnv,
      NODE_ENV: 'production',
      CORS_ORIGIN: 'https://tuapp.com',
    })
    expect(env.CORS_ORIGIN).toBe('https://tuapp.com')
  })

  it('EXPOSE_DOCS por defecto es false, y solo "true" literal lo activa', () => {
    __resetEnvCacheForTests()
    expect(loadEnv(validEnv).EXPOSE_DOCS).toBe(false)

    __resetEnvCacheForTests()
    expect(loadEnv({ ...validEnv, EXPOSE_DOCS: 'true' }).EXPOSE_DOCS).toBe(true)

    __resetEnvCacheForTests()
    expect(loadEnv({ ...validEnv, EXPOSE_DOCS: 'yes' }).EXPOSE_DOCS).toBe(false)
  })

  it('aplica los defaults de rate limit diferenciado por rol', () => {
    __resetEnvCacheForTests()
    const env = loadEnv(validEnv)
    expect(env.RATE_LIMIT_MAX).toBe(100)
    expect(env.RATE_LIMIT_AUTHENTICATED_MAX).toBe(300)
    expect(env.RATE_LIMIT_ADMIN_MAX).toBe(30)
  })
})
