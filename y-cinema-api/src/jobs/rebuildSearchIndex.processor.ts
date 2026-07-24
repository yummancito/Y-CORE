import type { Job } from 'bullmq'
import type { MeiliSearch } from 'meilisearch'
import type { PrismaClient } from '@prisma/client'
import { SearchService } from '../modules/search/search.service.js'
import type { RebuildSearchIndexJobData } from '../queue/queues.js'

/** Reconstruye el índice de Meilisearch completo desde Postgres. Se
 * dispara manualmente (endpoint admin, Fase 11) o de forma programada
 * tras una tanda grande de sync-providers. Reindexar TODO en vez de
 * incrementalmente es deliberado: es más simple y robusto que rastrear
 * qué cambió, y a la escala esperada (ver ADR) el costo es aceptable. */
export function createRebuildSearchIndexProcessor(meili: MeiliSearch, prisma: PrismaClient) {
  return async function rebuildSearchIndexProcessor(
    job: Job<RebuildSearchIndexJobData>,
  ): Promise<{ indexed: number }> {
    const service = new SearchService(meili, prisma)
    const indexed = await service.reindexAll()
    job.log(`Reindexados ${indexed} documentos (razón: ${job.data.reason}).`)
    return { indexed }
  }
}
