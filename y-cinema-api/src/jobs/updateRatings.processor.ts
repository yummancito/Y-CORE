import type { Job } from 'bullmq'
import type { PrismaClient } from '@prisma/client'
import { OmdbProvider } from '../providers/omdb/omdb.provider.js'
import type { UpdateRatingsJobData } from '../queue/queues.js'

export interface UpdateRatingsDeps {
  prisma: PrismaClient
  omdbApiKey: string | undefined
}

/** Enriquece un media con ratings consolidados de OMDb (IMDb, Rotten
 * Tomatoes, Metacritic) — mismo criterio de upsert por (mediaId, source)
 * que NormalizerService.syncRatings en Fase 5. */
export function createUpdateRatingsProcessor(deps: UpdateRatingsDeps) {
  return async function updateRatingsProcessor(
    job: Job<UpdateRatingsJobData>,
  ): Promise<{ ratingsUpdated: number }> {
    const provider = new OmdbProvider({ apiKey: deps.omdbApiKey })

    if (!provider.isEnabled()) {
      job.log('OMDB_API_KEY no configurada — job omitido sin error.')
      return { ratingsUpdated: 0 }
    }

    const result = await provider.details(job.data.imdbId)
    if (!result) {
      job.log(`OMDb no encontró nada para imdbId=${job.data.imdbId}.`)
      return { ratingsUpdated: 0 }
    }

    let updated = 0
    for (const rating of result.Ratings) {
      const parsed = parseRatingValue(rating.Source, rating.Value)
      if (!parsed) continue

      await deps.prisma.rating.upsert({
        where: { mediaId_source: { mediaId: job.data.mediaId, source: parsed.source } },
        update: { value: parsed.value, scale: parsed.scale, fetchedAt: new Date() },
        create: {
          mediaId: job.data.mediaId,
          source: parsed.source,
          value: parsed.value,
          scale: parsed.scale,
        },
      })
      updated += 1
    }

    job.log(`media=${job.data.mediaId}: ${updated} ratings actualizados desde OMDb.`)
    return { ratingsUpdated: updated }
  }
}

/** OMDb devuelve cada rating con un formato de texto distinto por fuente
 * ("8.7/10", "87%", "88/100") — se normaliza a un (source, value, scale)
 * consistente con el resto de `ratings` en el schema. */
export function parseRatingValue(
  source: string,
  value: string,
): { source: string; value: number; scale: number } | null {
  if (source === 'Internet Movie Database') {
    const [num] = value.split('/')
    const parsed = Number(num)
    return Number.isFinite(parsed) ? { source: 'imdb', value: parsed, scale: 10 } : null
  }
  if (source === 'Rotten Tomatoes') {
    const parsed = Number(value.replace('%', ''))
    return Number.isFinite(parsed) ? { source: 'rotten_tomatoes', value: parsed, scale: 100 } : null
  }
  if (source === 'Metacritic') {
    const [num] = value.split('/')
    const parsed = Number(num)
    return Number.isFinite(parsed) ? { source: 'metacritic', value: parsed, scale: 100 } : null
  }
  return null
}
