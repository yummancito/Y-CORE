import type { Redis } from 'ioredis'

const DEFAULT_TTL_SECONDS = 300

export interface CacheAsideOptions {
  ttlSeconds?: number
}

/** Patrón cache-aside genérico: intenta leer de Redis, y si no está
 * (o Redis falla), ejecuta `fetcher()` y guarda el resultado. Un fallo de
 * Redis nunca debe tumbar la respuesta — se degrada a "sin cache" en vez
 * de propagar el error, ya que Redis es una optimización, no una fuente
 * de verdad (la fuente de verdad es Postgres / el proveedor externo). */
export async function cacheAside<T>(
  redis: Redis,
  key: string,
  fetcher: () => Promise<T>,
  options: CacheAsideOptions = {},
): Promise<T> {
  const ttl = options.ttlSeconds ?? DEFAULT_TTL_SECONDS

  try {
    const cached = await redis.get(key)
    if (cached !== null) {
      return JSON.parse(cached) as T
    }
  } catch {
    // Redis no disponible / error de red — seguimos sin cache.
  }

  const fresh = await fetcher()

  try {
    await redis.set(key, JSON.stringify(fresh), 'EX', ttl)
  } catch {
    // Igual que arriba: no fallar la respuesta por un error de escritura.
  }

  return fresh
}

/** Invalida todas las keys que matcheen un patrón glob de Redis (p.ej.
 * "media:*") usando SCAN en vez de KEYS — KEYS bloquea el servidor entero
 * en datasets grandes, SCAN es incremental y seguro en producción. */
export async function invalidateByPattern(redis: Redis, pattern: string): Promise<number> {
  let cursor = '0'
  let deleted = 0

  do {
    const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100)
    cursor = nextCursor
    if (keys.length > 0) {
      deleted += await redis.del(...keys)
    }
  } while (cursor !== '0')

  return deleted
}
