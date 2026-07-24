import type { Queues } from '../queue/queues.js'

const ONE_HOUR_MS = 60 * 60 * 1000
const SIX_HOURS_MS = 6 * ONE_HOUR_MS

/** Registra los repeatable jobs (BullMQ job schedulers) que mantienen el
 * catálogo fresco sin intervención manual. Llamarlo una vez al arrancar
 * el proceso de workers — BullMQ deduplica por jobId, así que llamarlo de
 * nuevo en un restart no crea duplicados. */
export async function scheduleRecurringJobs(queues: Queues): Promise<void> {
  await queues['sync-providers'].upsertJobScheduler(
    'sync-tmdb-movies-popular',
    { every: SIX_HOURS_MS },
    { name: 'sync-tmdb-movies-popular', data: { providerSlug: 'tmdb', mediaType: 'movie', page: 1 } },
  )

  await queues['sync-providers'].upsertJobScheduler(
    'sync-tmdb-tv-popular',
    { every: SIX_HOURS_MS },
    { name: 'sync-tmdb-tv-popular', data: { providerSlug: 'tmdb', mediaType: 'tv', page: 1 } },
  )

  // mediaType se ignora en la rama AniList del processor (todo lo que
  // trae este proveedor es ANIME) — se pasa 'tv' solo para cumplir el
  // tipo de SyncProvidersJobData, no tiene efecto.
  await queues['sync-providers'].upsertJobScheduler(
    'sync-anilist-popular',
    { every: SIX_HOURS_MS },
    { name: 'sync-anilist-popular', data: { providerSlug: 'anilist', mediaType: 'tv', page: 1 } },
  )

  await queues['rebuild-search-index'].upsertJobScheduler(
    'nightly-reindex',
    { every: ONE_HOUR_MS * 24 },
    { name: 'nightly-reindex', data: { reason: 'scheduled-nightly' } },
  )
}
