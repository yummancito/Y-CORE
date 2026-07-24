import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { Queue, QueueEvents, Worker, type ConnectionOptions } from 'bullmq'
import { Redis } from 'ioredis'
import { createClearCacheProcessor } from '../../src/jobs/clearCache.processor.js'
import type { ClearCacheJobData } from '../../src/queue/queues.js'
import { areInfraServicesAvailable } from '../setup/servicesAvailable.js'

const QUEUE_NAME = 'test-clear-cache'

// Test de integración end-to-end de un processor real de BullMQ contra
// Redis: encola un job, un Worker real lo procesa, y se verifica el
// resultado — no un mock de BullMQ, sino el comportamiento real de la cola.
describe('clear-cache job (BullMQ real)', () => {
  let infraAvailable = false
  let redis: Redis | undefined
  let queue: Queue<ClearCacheJobData> | undefined
  let worker: Worker<ClearCacheJobData> | undefined
  let queueEvents: QueueEvents | undefined
  const seedKeys: string[] = []

  beforeAll(async () => {
    infraAvailable = await areInfraServicesAvailable()
    if (!infraAvailable) return

    const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379'
    const connection: ConnectionOptions = { url: redisUrl }
    redis = new Redis(redisUrl)
    queue = new Queue<ClearCacheJobData>(QUEUE_NAME, { connection })
    worker = new Worker<ClearCacheJobData>(QUEUE_NAME, createClearCacheProcessor(redis), {
      connection,
    })
    queueEvents = new QueueEvents(QUEUE_NAME, { connection })
    await queueEvents.waitUntilReady()
  })

  afterEach(async () => {
    if (!redis) return
    if (seedKeys.length > 0) await redis.del(...seedKeys.splice(0))
  })

  afterAll(async () => {
    await worker?.close()
    await queue?.close()
    await queueEvents?.close()
    await redis?.quit()
  })

  it('procesa un job encolado y borra las keys que matchean el patrón', async () => {
    if (!infraAvailable || !redis || !queue || !queueEvents) {
      console.warn('[SKIP] Redis no disponible — ver docs/ROADMAP.md Fase 9.')
      return
    }

    const keys = [`test:job:${Date.now()}:a`, `test:job:${Date.now()}:b`]
    seedKeys.push(...keys)
    for (const k of keys) await redis.set(k, '1')

    const job = await queue.add('clear', { pattern: 'test:job:*' })
    const result = await job.waitUntilFinished(queueEvents, 10_000)

    expect(result.deleted).toBeGreaterThanOrEqual(2)
    expect(await redis.get(keys[0]!)).toBeNull()
  }, 15_000)
})
