import type { Job } from 'bullmq'
import type { Redis } from 'ioredis'
import { invalidateByPattern } from '../cache/cacheAside.js'
import type { ClearCacheJobData } from '../queue/queues.js'

/** Invalida cache por patrón bajo demanda — usado por el panel admin
 * (Fase 11) cuando un operador quiere forzar un refresh sin esperar el TTL. */
export function createClearCacheProcessor(redis: Redis) {
  return async function clearCacheProcessor(job: Job<ClearCacheJobData>): Promise<{ deleted: number }> {
    const deleted = await invalidateByPattern(redis, job.data.pattern)
    job.log(`Invalidadas ${deleted} keys que matchean "${job.data.pattern}".`)
    return { deleted }
  }
}
