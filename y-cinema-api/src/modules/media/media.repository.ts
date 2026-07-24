import { Prisma, type PrismaClient, type Media as PrismaMedia } from '@prisma/client'
import type { Media, MediaType } from '../../types/media.js'

// El include común para traer un Media completo con todas sus relaciones
// resueltas de una sola query — evita el patrón N+1 al mapear a la forma
// pública (ver docs/ROADMAP.md Fase 13 para revisión de performance).
const MEDIA_FULL_INCLUDE = {
  genres: { include: { genre: true } },
  people: { include: { person: true } },
  images: true,
  ratings: true,
  collections: { include: { collection: true } },
  translations: true,
  providerRefs: { include: { provider: true } },
  seasons: {
    orderBy: { seasonNumber: 'asc' },
    include: {
      episodes: {
        orderBy: { episodeNumber: 'asc' },
        include: { images: true },
      },
    },
  },
} satisfies Prisma.MediaInclude

// Include reducido para listados (GET /media) — omite seasons/episodes,
// que para una serie con varias temporadas multiplican por decenas la
// cantidad de filas resueltas por item, sin que un listado tipo grilla
// las use nunca (ver docs/ROADMAP.md Fase 13: auditoría de N+1/over-
// fetching). El detalle completo (findById) sigue usando MEDIA_FULL_INCLUDE.
const MEDIA_LIST_INCLUDE = {
  genres: { include: { genre: true } },
  people: { include: { person: true } },
  images: true,
  ratings: true,
  collections: { include: { collection: true } },
  translations: true,
  providerRefs: { include: { provider: true } },
} satisfies Prisma.MediaInclude

type MediaWithRelations = PrismaMedia & {
  genres: Array<{ genre: { id: string; slug: string; name: string } }>
  people: Array<{
    person: { id: string; name: string; profileUrl: string | null }
    role: string
    characterName: string | null
    billingOrder: number | null
  }>
  images: Array<{
    id: string
    type: string
    url: string
    width: number | null
    height: number | null
    languageCode: string | null
  }>
  ratings: Array<{
    source: string
    value: number
    scale: number
    voteCount: number | null
  }>
  collections: Array<{ collection: { id: string; name: string; overview: string | null } }>
  translations: Array<{
    languageId: string
    field: string
    value: string
    quality: number
  }>
  providerRefs: Array<{
    externalId: string
    raw: unknown
    provider: { slug: string }
  }>
  // Opcional: MEDIA_LIST_INCLUDE (usado por list()) no trae seasons —
  // ver comentario junto a esa constante. toPublicMedia() trata su
  // ausencia como "sin temporadas resueltas" (array vacío), nunca como
  // "esta serie no tiene temporadas".
  seasons?: Array<{
    id: string
    seasonNumber: number
    title: string | null
    overview: string | null
    airDate: Date | null
    episodes: Array<{
      id: string
      episodeNumber: number
      title: string | null
      overview: string | null
      airDate: Date | null
      runtimeMinutes: number | null
      images: Array<{
        id: string
        type: string
        url: string
        width: number | null
        height: number | null
        languageCode: string | null
      }>
    }>
  }>
}

/** Resuelve el imdbId de un Media a partir de sus media_provider_refs.
 * Prioridad: (1) ref de tmdb, leyendo raw.external_ids.imdb_id (el imdbId
 * vive dentro del payload crudo de TMDB, no como externalId — ese es el
 * id numérico de TMDB); (2) ref de omdb, cuyo externalId ES el imdbId
 * directamente (OMDb se consulta por imdbID). Si ninguna aplica, null.
 * Exportada para poder testear el parseo defensivo de `raw` sin Prisma. */
export function resolveImdbId(providerRefs: MediaWithRelations['providerRefs']): string | null {
  const tmdbRef = providerRefs.find((ref) => ref.provider.slug === 'tmdb')
  if (tmdbRef) {
    const imdbId = extractTmdbImdbId(tmdbRef.raw)
    if (imdbId) return imdbId
  }

  const omdbRef = providerRefs.find((ref) => ref.provider.slug === 'omdb')
  if (omdbRef?.externalId) return omdbRef.externalId

  return null
}

function extractTmdbImdbId(raw: unknown): string | null {
  if (typeof raw !== 'object' || raw === null) return null
  if (!('external_ids' in raw)) return null

  const externalIds = (raw as { external_ids: unknown }).external_ids
  if (typeof externalIds !== 'object' || externalIds === null) return null
  if (!('imdb_id' in externalIds)) return null

  const imdbId = (externalIds as { imdb_id: unknown }).imdb_id
  return typeof imdbId === 'string' && imdbId.length > 0 ? imdbId : null
}

/** Mapea la forma Prisma (relacional, con tablas puente) a la forma
 * pública Media del modelo central. Este es el único lugar del código
 * donde esa traducción ocurre — todo lo demás consume `Media`. */
function toPublicMedia(row: MediaWithRelations): Media {
  return {
    id: row.id,
    type: row.type as MediaType,
    title: row.title,
    originalTitle: row.originalTitle,
    overview: row.overview,
    tagline: row.tagline,
    status: row.status,
    releaseDate: row.releaseDate ? row.releaseDate.toISOString() : null,
    runtimeMinutes: row.runtimeMinutes,
    originalLangCode: row.originalLangCode,
    popularity: row.popularity,
    imdbId: resolveImdbId(row.providerRefs),
    genres: row.genres.map((g) => g.genre),
    people: row.people.map((p) => ({
      id: p.person.id,
      name: p.person.name,
      profileUrl: p.person.profileUrl,
      role: p.role as Media['people'][number]['role'],
      characterName: p.characterName,
      billingOrder: p.billingOrder,
    })),
    images: row.images.map((img) => ({
      id: img.id,
      type: img.type as Media['images'][number]['type'],
      url: img.url,
      width: img.width,
      height: img.height,
      languageCode: img.languageCode,
    })),
    ratings: row.ratings.map((r) => ({
      source: r.source,
      value: r.value,
      scale: r.scale,
      voteCount: r.voteCount,
    })),
    collections: row.collections.map((c) => c.collection),
    translations: [], // resuelto por TranslationService (Fase 6), no acá
    seasons: (row.seasons ?? []).map((s) => ({
      id: s.id,
      seasonNumber: s.seasonNumber,
      title: s.title,
      overview: s.overview,
      airDate: s.airDate ? s.airDate.toISOString() : null,
      episodes: s.episodes.map((e) => ({
        id: e.id,
        episodeNumber: e.episodeNumber,
        title: e.title,
        overview: e.overview,
        airDate: e.airDate ? e.airDate.toISOString() : null,
        runtimeMinutes: e.runtimeMinutes,
        images: e.images.map((img) => ({
          id: img.id,
          type: img.type as Media['images'][number]['type'],
          url: img.url,
          width: img.width,
          height: img.height,
          languageCode: img.languageCode,
        })),
      })),
    })),
  }
}

export type MediaListSort = 'popularity' | 'recent'

export interface ListMediaFilters {
  type?: MediaType
  genreSlug?: string
  year?: number
  sort?: MediaListSort
  page: number
  pageSize: number
}

export class MediaRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: string): Promise<Media | null> {
    const row = await this.prisma.media.findUnique({
      where: { id },
      include: MEDIA_FULL_INCLUDE,
    })
    if (!row) return null
    return toPublicMedia(row as unknown as MediaWithRelations)
  }

  async findByProviderRef(providerSlug: string, externalId: string): Promise<Media | null> {
    const ref = await this.prisma.mediaProviderRef.findFirst({
      where: { provider: { slug: providerSlug }, externalId },
      include: { media: { include: MEDIA_FULL_INCLUDE } },
    })
    if (!ref) return null
    return toPublicMedia(ref.media as unknown as MediaWithRelations)
  }

  async list(filters: ListMediaFilters): Promise<{ items: Media[]; total: number }> {
    const where = {
      ...(filters.type ? { type: filters.type } : {}),
      ...(filters.genreSlug ? { genres: { some: { genre: { slug: filters.genreSlug } } } } : {}),
      ...(filters.year
        ? {
            releaseDate: {
              gte: new Date(`${filters.year}-01-01`),
              lt: new Date(`${filters.year + 1}-01-01`),
            },
          }
        : {}),
    }

    const orderBy: Prisma.MediaOrderByWithRelationInput =
      filters.sort === 'recent' ? { releaseDate: 'desc' } : { popularity: 'desc' }

    const [rows, total] = await Promise.all([
      this.prisma.media.findMany({
        where,
        include: MEDIA_LIST_INCLUDE,
        orderBy,
        skip: (filters.page - 1) * filters.pageSize,
        take: filters.pageSize,
      }),
      this.prisma.media.count({ where }),
    ])

    return {
      items: rows.map((r) => toPublicMedia(r as unknown as MediaWithRelations)),
      total,
    }
  }
}
