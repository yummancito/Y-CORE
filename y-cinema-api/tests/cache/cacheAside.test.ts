import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { Redis } from 'ioredis'
import { cacheAside, invalidateByPattern } from '../../src/cache/cacheAside.js'
import { areInfraServicesAvailable } from '../setup/servicesAvailable.js'

describe('cacheAside / invalidateByPattern', () => {
  let redis: Redis | undefined
  let infraAvailable = false
  const usedKeys: string[] = []

  beforeAll(async () => {
    infraAvailable = await areInfraServicesAvailable()
    if (!infraAvailable) return
    redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379')
  })

  afterEach(async () => {
    if (!redis) return
    if (usedKeys.length > 0) {
      await redis.del(...usedKeys.splice(0))
    }
  })

  afterAll(async () => {
    await redis?.quit()
  })

  it('cachea el resultado y no vuelve a llamar al fetcher en el segundo hit', async () => {
    if (!infraAvailable || !redis) {
      console.warn('[SKIP] Redis no disponible — ver docs/ROADMAP.md Fase 7.')
      return
    }
    const key = 'test:cacheAside:hit'
    usedKeys.push(key)
    const fetcher = vi.fn().mockResolvedValue({ value: 42 })

    const first = await cacheAside(redis, key, fetcher)
    const second = await cacheAside(redis, key, fetcher)

    expect(first).toEqual({ value: 42 })
    expect(second).toEqual({ value: 42 })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('respeta el TTL configurado', async () => {
    if (!infraAvailable || !redis) {
      console.warn('[SKIP] Redis no disponible — ver docs/ROADMAP.md Fase 7.')
      return
    }
    const key = 'test:cacheAside:ttl'
    usedKeys.push(key)

    await cacheAside(redis, key, async () => 'value', { ttlSeconds: 60 })

    const ttl = await redis.ttl(key)
    expect(ttl).toBeGreaterThan(0)
    expect(ttl).toBeLessThanOrEqual(60)
  })

  it('invalidateByPattern borra todas las keys que matchean el patrón', async () => {
    if (!infraAvailable || !redis) {
      console.warn('[SKIP] Redis no disponible — ver docs/ROADMAP.md Fase 7.')
      return
    }
    const keys = ['test:pattern:a', 'test:pattern:b', 'test:other:c']
    usedKeys.push(...keys)
    for (const k of keys) await redis.set(k, '1')

    const deleted = await invalidateByPattern(redis, 'test:pattern:*')

    expect(deleted).toBe(2)
    expect(await redis.get('test:pattern:a')).toBeNull()
    expect(await redis.get('test:pattern:b')).toBeNull()
    expect(await redis.get('test:other:c')).toBe('1')
  })

  it('degrada sin error cuando Redis falla en la lectura', async () => {
    // Cliente apuntando a un puerto que no existe — simula Redis caído.
    const brokenRedis = new Redis({ port: 1, lazyConnect: true, retryStrategy: () => null })
    const fetcher = vi.fn().mockResolvedValue('fallback-value')

    const result = await cacheAside(brokenRedis, 'unreachable-key', fetcher)

    expect(result).toBe('fallback-value')
    expect(fetcher).toHaveBeenCalledTimes(1)
    brokenRedis.disconnect()
  })
})
