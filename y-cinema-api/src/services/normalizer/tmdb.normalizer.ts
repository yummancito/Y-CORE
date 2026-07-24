import type { NormalizedMediaInput } from '../../types/media.js'
import type { TmdbDetails, TmdbImagesResponse } from '../../providers/tmdb/tmdb.types.js'
import { slugify } from '../../utils/slugify.js'

/** Convierte el detalle NATIVO de TMDB al contrato NormalizedMediaInput del
 * modelo central. Es el único lugar que sabe interpretar el shape de TMDB
 * — ver docs/ADR.md 2.3: nunca se expone la forma de un proveedor tal cual. */
export function normalizeTmdbMedia(
  details: TmdbDetails,
  images: TmdbImagesResponse | null,
  mediaType: 'movie' | 'tv',
): NormalizedMediaInput {
  const title = details.title ?? details.name ?? 'Sin título'
  const originalTitle = null // TMDB no separa "original_title" en append_to_response tal cual pedido acá
  const releaseDate = details.release_date ?? details.first_air_date ?? null
  const runtimeMinutes =
    details.runtime ?? (details.episode_run_time && details.episode_run_time[0]) ?? null

  return {
    type: mediaType === 'tv' ? 'SERIES' : 'MOVIE',
    title,
    originalTitle,
    overview: details.overview || null,
    tagline: details.tagline || null,
    status: mapStatus(details.status),
    releaseDate,
    runtimeMinutes,
    originalLangCode: details.original_language || null,
    popularity: details.popularity ?? 0,
    genres: details.genres.map((g) => ({ slug: slugify(g.name), name: g.name })),
    people: mapPeople(details),
    images: mapImages(details, images),
    ratings: [
      {
        source: 'tmdb',
        value: details.vote_average,
        scale: 10,
        voteCount: details.vote_count,
      },
    ],
    seasons: [], // temporadas/episodios se resuelven aparte (requieren llamadas por season)
    externalRef: {
      providerSlug: 'tmdb',
      externalId: String(details.id),
      raw: details,
    },
  }
}

function mapStatus(tmdbStatus: string): NormalizedMediaInput['status'] {
  switch (tmdbStatus) {
    case 'Released':
    case 'Ended':
      return 'RELEASED'
    case 'In Production':
      return 'IN_PRODUCTION'
    case 'Planned':
    case 'Post Production':
      return 'UPCOMING'
    case 'Canceled':
      return 'CANCELED'
    case 'Returning Series':
      return 'RELEASED'
    default:
      return 'RELEASED'
  }
}

function mapPeople(details: TmdbDetails): NormalizedMediaInput['people'] {
  if (!details.credits) return []

  const cast = details.credits.cast.slice(0, 20).map((c) => ({
    name: c.name,
    profileUrl: c.profile_path ? `https://image.tmdb.org/t/p/w185${c.profile_path}` : null,
    role: 'ACTOR' as const,
    characterName: c.character || null,
    billingOrder: c.order,
  }))

  const directors = details.credits.crew
    .filter((c) => c.job === 'Director')
    .map((c) => ({
      name: c.name,
      profileUrl: c.profile_path ? `https://image.tmdb.org/t/p/w185${c.profile_path}` : null,
      role: 'DIRECTOR' as const,
      characterName: null,
      billingOrder: null,
    }))

  return [...cast, ...directors]
}

function mapImages(
  details: TmdbDetails,
  images: TmdbImagesResponse | null,
): NormalizedMediaInput['images'] {
  const result: NormalizedMediaInput['images'] = []

  if (details.poster_path) {
    result.push({
      type: 'POSTER',
      url: `https://image.tmdb.org/t/p/w500${details.poster_path}`,
      width: null,
      height: null,
      languageCode: null,
    })
  }
  if (details.backdrop_path) {
    result.push({
      type: 'BACKDROP',
      url: `https://image.tmdb.org/t/p/original${details.backdrop_path}`,
      width: null,
      height: null,
      languageCode: null,
    })
  }

  if (images) {
    for (const logo of images.logos.slice(0, 3)) {
      result.push({
        type: 'LOGO',
        url: `https://image.tmdb.org/t/p/original${logo.file_path}`,
        width: logo.width,
        height: logo.height,
        languageCode: logo.iso_639_1,
      })
    }
  }

  return result
}
