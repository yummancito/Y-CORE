import { Queue, type ConnectionOptions } from 'bullmq'

// Nombres de cola centralizados — evita typos entre quien encola (services/
// admin routes) y quien procesa (jobs/*.processor.ts).
export const QUEUE_NAMES = {
  SYNC_PROVIDERS: 'sync-providers',
  UPDATE_TRANSLATIONS: 'update-translations',
  UPDATE_IMAGES: 'update-images',
  UPDATE_RATINGS: 'update-ratings',
  REBUILD_SEARCH_INDEX: 'rebuild-search-index',
  MERGE_DUPLICATES: 'merge-duplicates',
  CLEAR_CACHE: 'clear-cache',
} as const

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES]

export interface SyncProvidersJobData {
  providerSlug: string
  mediaType: 'movie' | 'tv'
  /** Página de discover/popular a sincronizar — permite encolar la
   * sincronización de un catálogo completo como N jobs paginados en vez
   * de un job monolítico que puede fallar a mitad de camino sin progreso
   * parcial. */
  page: number
}

export interface UpdateTranslationsJobData {
  mediaId: string
}

export interface UpdateImagesJobData {
  mediaId: string
  tmdbId: string
  mediaType: 'movie' | 'tv'
}

export interface UpdateRatingsJobData {
  mediaId: string
  imdbId: string
}

export interface RebuildSearchIndexJobData {
  /** vacío — reindexa todo; el trigger es el propio job, no un filtro */
  reason: string
}

export interface MergeDuplicatesJobData {
  mediaIdA: string
  mediaIdB: string
}

export interface ClearCacheJobData {
  pattern: string
}

/** Fábrica de colas — una función en vez de instanciar 7 colas a nivel de
 * módulo, para poder inyectar la misma `ConnectionOptions` (derivada de
 * REDIS_URL) sin duplicar parsing y para que los tests puedan crear colas
 * contra una conexión de prueba sin tocar el resto de la app. */
export function createQueues(connection: ConnectionOptions) {
  return {
    [QUEUE_NAMES.SYNC_PROVIDERS]: new Queue<SyncProvidersJobData>(QUEUE_NAMES.SYNC_PROVIDERS, {
      connection,
    }),
    [QUEUE_NAMES.UPDATE_TRANSLATIONS]: new Queue<UpdateTranslationsJobData>(
      QUEUE_NAMES.UPDATE_TRANSLATIONS,
      { connection },
    ),
    [QUEUE_NAMES.UPDATE_IMAGES]: new Queue<UpdateImagesJobData>(QUEUE_NAMES.UPDATE_IMAGES, {
      connection,
    }),
    [QUEUE_NAMES.UPDATE_RATINGS]: new Queue<UpdateRatingsJobData>(QUEUE_NAMES.UPDATE_RATINGS, {
      connection,
    }),
    [QUEUE_NAMES.REBUILD_SEARCH_INDEX]: new Queue<RebuildSearchIndexJobData>(
      QUEUE_NAMES.REBUILD_SEARCH_INDEX,
      { connection },
    ),
    [QUEUE_NAMES.MERGE_DUPLICATES]: new Queue<MergeDuplicatesJobData>(
      QUEUE_NAMES.MERGE_DUPLICATES,
      { connection },
    ),
    [QUEUE_NAMES.CLEAR_CACHE]: new Queue<ClearCacheJobData>(QUEUE_NAMES.CLEAR_CACHE, {
      connection,
    }),
  }
}

export type Queues = ReturnType<typeof createQueues>
