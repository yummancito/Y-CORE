import type { ConnectionOptions } from 'bullmq'
import { loadEnv } from './config/env.js'
import { getPrismaClient } from './database/prisma.js'
import { getRedisClient } from './cache/redisClient.js'
import { getMeiliClient } from './modules/search/meilisearch.client.js'
import { createQueues } from './queue/queues.js'
import { registerWorkers } from './jobs/registerWorkers.js'
import { scheduleRecurringJobs } from './jobs/scheduler.js'

/** Entry point del proceso de workers — separado del proceso HTTP
 * (src/index.ts) a propósito: un job pesado (sincronizar cientos de items
 * de TMDB) no debe competir por el event loop con requests de usuarios.
 * Se arranca con `npm run worker`, como un proceso independiente. */
async function main(): Promise<void> {
  const env = loadEnv()
  const prisma = getPrismaClient()
  const redis = getRedisClient(env.REDIS_URL)
  const meili = getMeiliClient(env.MEILISEARCH_HOST, env.MEILISEARCH_API_KEY)

  await prisma.$connect()

  const connection: ConnectionOptions = { url: env.REDIS_URL }
  const queues = createQueues(connection)

  const workers = registerWorkers({
    connection,
    prisma,
    redis,
    meili,
    tmdbApiKey: env.TMDB_API_KEY,
    fanartApiKey: env.FANART_API_KEY,
    omdbApiKey: env.OMDB_API_KEY,
  })

  await scheduleRecurringJobs(queues)

  console.log(`Worker arrancado — ${workers.length} colas activas.`)

  const shutdown = async (signal: string): Promise<void> => {
    console.log(`Recibida señal ${signal}, cerrando workers...`)
    await Promise.all(workers.map((w) => w.close()))
    await Promise.all(Object.values(queues).map((q) => q.close()))
    await prisma.$disconnect()
    await redis.quit()
    process.exit(0)
  }

  process.on('SIGINT', () => void shutdown('SIGINT'))
  process.on('SIGTERM', () => void shutdown('SIGTERM'))
}

main().catch((err) => {
  console.error('Fallo fatal al iniciar el worker:', err)
  process.exit(1)
})
