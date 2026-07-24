import type { MeiliSearch } from 'meilisearch'
import type { PrismaClient } from '@prisma/client'
import type { Media } from '../../types/media.js'
import { MEDIA_INDEX_NAME, MEDIA_INDEX_SETTINGS, type MediaSearchDocument } from './search.types.js'

export interface SearchParams {
  query: string
  type?: Media['type']
  genreSlug?: string
  limit?: number
}

export interface SearchResult {
  items: MediaSearchDocument[]
  estimatedTotalHits: number
  processingTimeMs: number
}

const DEFAULT_LIMIT = 20
const MAX_LIMIT = 50
const BATCH_SIZE = 500

/** Traduce un Media completo (con relaciones ya resueltas, tal como lo
 * devuelve MediaRepository) a la forma aplanada que indexa Meilisearch. */
export function toSearchDocument(media: Media): MediaSearchDocument {
  const poster = media.images.find((img) => img.type === 'POSTER')

  return {
    id: media.id,
    type: media.type,
    title: media.title,
    originalTitle: media.originalTitle,
    overview: media.overview,
    releaseYear: media.releaseDate ? new Date(media.releaseDate).getFullYear() : null,
    popularity: media.popularity,
    genres: media.genres.map((g) => g.name),
    actors: media.people.filter((p) => p.role === 'ACTOR').map((p) => p.name),
    studios: [], // Media no trae studios resueltos hoy — MediaRepository no los incluye (fuera de alcance de Fase 8)
    collections: media.collections.map((c) => c.name),
    posterUrl: poster?.url ?? null,
  }
}

export class SearchService {
  constructor(
    private readonly meili: MeiliSearch,
    private readonly prisma: PrismaClient,
  ) {}

  /** Crea el índice si no existe y aplica la configuración de atributos
   * buscables/filtrables/sinónimos/typo-tolerance. Idempotente — seguro
   * de llamar en cada arranque de la app o al inicio de un job de reindex. */
  async ensureIndex(): Promise<void> {
    const indexes = await this.meili.getIndexes()
    const exists = indexes.results.some((idx) => idx.uid === MEDIA_INDEX_NAME)

    if (!exists) {
      await this.meili.createIndex(MEDIA_INDEX_NAME, { primaryKey: 'id' })
    }

    const index = this.meili.index<MediaSearchDocument>(MEDIA_INDEX_NAME)
    await index.updateSettings(MEDIA_INDEX_SETTINGS)
  }

  async indexDocument(doc: MediaSearchDocument): Promise<void> {
    const index = this.meili.index<MediaSearchDocument>(MEDIA_INDEX_NAME)
    await index.addDocuments([doc])
  }

  async deleteDocument(mediaId: string): Promise<void> {
    const index = this.meili.index<MediaSearchDocument>(MEDIA_INDEX_NAME)
    await index.deleteDocument(mediaId)
  }

  /** Reconstruye el índice completo desde Postgres — usado por el job de
   * la Fase 9 (`rebuild-search-index`) y disponible acá para poder
   * probarlo end-to-end sin depender todavía de BullMQ. */
  async reindexAll(): Promise<number> {
    await this.ensureIndex()
    const index = this.meili.index<MediaSearchDocument>(MEDIA_INDEX_NAME)

    let indexed = 0
    let cursor: string | undefined

    for (;;) {
      const rows = await this.prisma.media.findMany({
        take: BATCH_SIZE,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        orderBy: { id: 'asc' },
        include: {
          genres: { include: { genre: true } },
          people: { include: { person: true } },
          images: true,
          collections: { include: { collection: true } },
        },
      })

      if (rows.length === 0) break

      const docs = rows.map((row) =>
        toSearchDocument({
          id: row.id,
          type: row.type,
          title: row.title,
          originalTitle: row.originalTitle,
          overview: row.overview,
          tagline: row.tagline,
          status: row.status,
          releaseDate: row.releaseDate ? row.releaseDate.toISOString() : null,
          runtimeMinutes: row.runtimeMinutes,
          originalLangCode: row.originalLangCode,
          popularity: row.popularity,
          imdbId: null, // toSearchDocument() no usa este campo — irrelevante para el índice
          genres: row.genres.map((g) => g.genre),
          people: row.people.map((p) => ({
            id: p.person.id,
            name: p.person.name,
            profileUrl: p.person.profileUrl,
            role: p.role,
            characterName: p.characterName,
            billingOrder: p.billingOrder,
          })),
          images: row.images.map((img) => ({
            id: img.id,
            type: img.type,
            url: img.url,
            width: img.width,
            height: img.height,
            languageCode: img.languageCode,
          })),
          ratings: [],
          collections: row.collections.map((c) => c.collection),
          seasons: [],
          translations: [],
        }),
      )

      await index.addDocuments(docs)
      indexed += docs.length
      cursor = rows[rows.length - 1]?.id
    }

    return indexed
  }

  async search(params: SearchParams): Promise<SearchResult> {
    const index = this.meili.index<MediaSearchDocument>(MEDIA_INDEX_NAME)
    const limit = params.limit && params.limit > 0 ? Math.min(params.limit, MAX_LIMIT) : DEFAULT_LIMIT

    const filters: string[] = []
    if (params.type) filters.push(`type = ${params.type}`)
    if (params.genreSlug) filters.push(`genres = "${escapeFilterValue(params.genreSlug)}"`)

    const result = await index.search(params.query, {
      limit,
      ...(filters.length > 0 ? { filter: filters.join(' AND ') } : {}),
    })

    return {
      items: result.hits,
      estimatedTotalHits: result.estimatedTotalHits ?? result.hits.length,
      processingTimeMs: result.processingTimeMs,
    }
  }
}

function escapeFilterValue(value: string): string {
  return value.replace(/"/g, '\\"')
}
