import type { Job } from 'bullmq'
import type { PrismaClient } from '@prisma/client'
import { TmdbProvider } from '../providers/tmdb/tmdb.provider.js'
import { AniListProvider } from '../providers/anilist/anilist.provider.js'
import { normalizeTmdbMedia } from '../services/normalizer/tmdb.normalizer.js'
import { normalizeAniListMedia } from '../services/normalizer/anilist.normalizer.js'
import { NormalizerService } from '../services/normalizer/normalizer.service.js'
import type { NormalizedMediaInput } from '../types/media.js'
import type { SyncProvidersJobData } from '../queue/queues.js'

export interface SyncProvidersDeps {
  prisma: PrismaClient
  tmdbApiKey: string | undefined
}

interface SyncResult {
  synced: number
  failed: number
}

/** Recorre una página de resultados de un proveedor, normaliza cada item
 * con `normalize()` y lo persiste vía NormalizerService — patrón común
 * reutilizado por las ramas de TMDB y AniList para no duplicar el bucle
 * de conteo/logging. */
async function syncPage<TItem extends { id: number | string }, TDetails>(
  job: Job<SyncProvidersJobData>,
  items: TItem[],
  fetchDetails: (id: string) => Promise<TDetails | null>,
  normalize: (details: TDetails) => NormalizedMediaInput,
  normalizer: NormalizerService,
): Promise<SyncResult> {
  let synced = 0
  let failed = 0

  for (const item of items) {
    try {
      const details = await fetchDetails(String(item.id))
      if (!details) {
        failed += 1
        continue
      }

      await normalizer.upsert(normalize(details))
      synced += 1
    } catch (err) {
      failed += 1
      job.log(`Fallo sincronizando item ${item.id}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return { synced, failed }
}

/** Sincroniza una página de "popular" de un proveedor hacia Postgres. Solo
 * implementa TMDB (películas/series) y AniList (anime) por ahora — el
 * resto de proveedores (TVMaze, Jikan, Kitsu) quedan para extender este
 * mismo patrón cuando haga falta cobertura adicional. */
export function createSyncProvidersProcessor(deps: SyncProvidersDeps) {
  return async function syncProvidersProcessor(
    job: Job<SyncProvidersJobData>,
  ): Promise<SyncResult> {
    const { providerSlug, mediaType, page } = job.data
    const normalizer = new NormalizerService(deps.prisma)

    let result: SyncResult

    if (providerSlug === 'tmdb') {
      const provider = new TmdbProvider({ apiKey: deps.tmdbApiKey, mediaType })
      if (!provider.isEnabled()) {
        throw new Error('TMDB_API_KEY no configurada — no se puede sincronizar.')
      }

      const listPage = await provider.popular(page)
      result = await syncPage(
        job,
        listPage.items,
        async (id) => {
          const [details, images] = await Promise.all([
            provider.details(id),
            provider.images(id).catch(() => null),
          ])
          return details ? { details, images } : null
        },
        ({ details, images }) => normalizeTmdbMedia(details, images, mediaType),
        normalizer,
      )
    } else if (providerSlug === 'anilist') {
      // AniList no distingue movie/tv — mediaType del job se ignora acá,
      // todo lo que trae este proveedor es ANIME.
      const provider = new AniListProvider()
      const listPage = await provider.popular(page)
      result = await syncPage(
        job,
        listPage.items,
        (id) => provider.details(id),
        normalizeAniListMedia,
        normalizer,
      )
    } else {
      throw new Error(
        `sync-providers solo soporta 'tmdb' y 'anilist' por ahora — recibido '${providerSlug}'.`,
      )
    }

    job.log(`Página ${page} (${providerSlug}): ${result.synced} sincronizados, ${result.failed} fallidos.`)
    return result
  }
}
