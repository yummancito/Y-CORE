import { Worker, type ConnectionOptions } from 'bullmq'
import type { PrismaClient } from '@prisma/client'
import type { Redis } from 'ioredis'
import type { MeiliSearch } from 'meilisearch'
import { QUEUE_NAMES } from '../queue/queues.js'
import { createSyncProvidersProcessor } from './syncProviders.processor.js'
import { createUpdateTranslationsProcessor } from './updateTranslations.processor.js'
import { createUpdateImagesProcessor } from './updateImages.processor.js'
import { createUpdateRatingsProcessor } from './updateRatings.processor.js'
import { createRebuildSearchIndexProcessor } from './rebuildSearchIndex.processor.js'
import { createMergeDuplicatesProcessor } from './mergeDuplicates.processor.js'
import { createClearCacheProcessor } from './clearCache.processor.js'
import { withJobAudit } from './withJobAudit.js'

export interface RegisterWorkersDeps {
  connection: ConnectionOptions
  prisma: PrismaClient
  redis: Redis
  meili: MeiliSearch
  tmdbApiKey: string | undefined
  fanartApiKey: string | undefined
  omdbApiKey: string | undefined
}

/** Instancia los 7 workers de BullMQ, uno por cola. Se llama una vez al
 * arrancar el proceso de jobs (separado del proceso HTTP — ver
 * docs/ROADMAP.md Fase 9: los workers corren aparte de `npm run dev`, no
 * dentro del mismo proceso que atiende requests, para que un job pesado no
 * bloquee el event loop de la API). Devuelve los workers para poder
 * cerrarlos ordenadamente en tests/shutdown. */
export function registerWorkers(deps: RegisterWorkersDeps): Worker[] {
  const audited = <T>(queueName: string, processor: Parameters<typeof withJobAudit<T>>[2]) =>
    withJobAudit(deps.prisma, queueName, processor)

  const workers = [
    new Worker(
      QUEUE_NAMES.SYNC_PROVIDERS,
      audited(
        QUEUE_NAMES.SYNC_PROVIDERS,
        createSyncProvidersProcessor({ prisma: deps.prisma, tmdbApiKey: deps.tmdbApiKey }),
      ),
      { connection: deps.connection },
    ),
    new Worker(
      QUEUE_NAMES.UPDATE_TRANSLATIONS,
      audited(QUEUE_NAMES.UPDATE_TRANSLATIONS, createUpdateTranslationsProcessor(deps.prisma)),
      { connection: deps.connection },
    ),
    new Worker(
      QUEUE_NAMES.UPDATE_IMAGES,
      audited(
        QUEUE_NAMES.UPDATE_IMAGES,
        createUpdateImagesProcessor({ prisma: deps.prisma, fanartApiKey: deps.fanartApiKey }),
      ),
      { connection: deps.connection },
    ),
    new Worker(
      QUEUE_NAMES.UPDATE_RATINGS,
      audited(
        QUEUE_NAMES.UPDATE_RATINGS,
        createUpdateRatingsProcessor({ prisma: deps.prisma, omdbApiKey: deps.omdbApiKey }),
      ),
      { connection: deps.connection },
    ),
    new Worker(
      QUEUE_NAMES.REBUILD_SEARCH_INDEX,
      audited(
        QUEUE_NAMES.REBUILD_SEARCH_INDEX,
        createRebuildSearchIndexProcessor(deps.meili, deps.prisma),
      ),
      { connection: deps.connection },
    ),
    new Worker(
      QUEUE_NAMES.MERGE_DUPLICATES,
      audited(QUEUE_NAMES.MERGE_DUPLICATES, createMergeDuplicatesProcessor(deps.prisma)),
      { connection: deps.connection },
    ),
    new Worker(
      QUEUE_NAMES.CLEAR_CACHE,
      audited(QUEUE_NAMES.CLEAR_CACHE, createClearCacheProcessor(deps.redis)),
      { connection: deps.connection },
    ),
  ]

  return workers
}
