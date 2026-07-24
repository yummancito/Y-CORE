import { Redis } from 'ioredis'
import { PrismaClient } from '@prisma/client'
import { MeiliSearch } from 'meilisearch'

/** Comprueba si Postgres+Redis (vía docker-compose) están arriba.
 * Los tests que dependen de servicios reales se saltan explícitamente
 * (con mensaje) en vez de fallar de forma confusa cuando no corren
 * localmente — ver docs/ROADMAP.md Fase 1, nota sobre entornos sin Docker. */
export async function areInfraServicesAvailable(): Promise<boolean> {
  const prisma = new PrismaClient()
  const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
    lazyConnect: true,
    retryStrategy: () => null,
    maxRetriesPerRequest: 1,
  })

  let ok = true
  try {
    await prisma.$queryRaw`SELECT 1`
  } catch {
    ok = false
  } finally {
    await prisma.$disconnect()
  }

  try {
    await redis.connect()
    await redis.ping()
  } catch {
    ok = false
  } finally {
    redis.disconnect()
  }

  return ok
}

/** Mismo patrón que areInfraServicesAvailable(), pero además exige que
 * Meilisearch responda — usado por los tests de search (Fase 8). */
export async function isMeiliAvailable(): Promise<boolean> {
  try {
    const client = new MeiliSearch({
      host: process.env.MEILISEARCH_HOST ?? 'http://localhost:7700',
      apiKey: process.env.MEILISEARCH_API_KEY,
    })
    await client.health()
    return true
  } catch {
    return false
  }
}

/** Mismo patrón que areInfraServicesAvailable(), pero para Supabase Auth
 * (migración a Supabase — ver docs/ROADMAP.md). Sin SUPABASE_URL/
 * SUPABASE_SERVICE_ROLE_KEY reales (no hay proyecto de test conectado en
 * este entorno), los tests de auth/favorites/watchlist/history/admin se
 * saltan con warning en vez de fallar de forma confusa. */
export async function isSupabaseAuthAvailable(): Promise<boolean> {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key || url.includes('ci-placeholder') || url.includes('xxxxx')) return false
  try {
    const res = await fetch(`${url}/auth/v1/health`, { headers: { apikey: key } })
    return res.ok
  } catch {
    return false
  }
}
