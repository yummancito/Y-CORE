import type { Redis } from 'ioredis'
import type { Media, MediaType } from '../../types/media.js'
import type { ListMediaFilters, MediaListSort, MediaRepository } from './media.repository.js'
import { cacheAside } from '../../cache/cacheAside.js'

export interface ListMediaParams {
  type?: MediaType
  genreSlug?: string
  year?: number
  sort?: MediaListSort
  page?: number
  pageSize?: number
}

export interface PagedResult<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

const DEFAULT_PAGE_SIZE = 20
const MAX_PAGE_SIZE = 100

// TTLs elegidos como red de seguridad, no como mecanismo principal de
// frescura: NormalizerService.invalidateCache() (Fase 7) ya borra
// activamente `media:detail:<id>` y TODO `media:list:*` en cada upsert,
// así que un TTL vencido solo importa si esa invalidación falla o si el
// dato cambió por una vía que no pasa por el normalizador (no hay ninguna
// hoy). Con esa garantía, el TTL puede ser generoso sin riesgo real de
// servir datos obsoletos:
// - detail (30 min): un Media individual es la unidad de invalidación
//   exacta — nunca hay falsos positivos de "borré de más" en su cache.
// - list (5 min): más corto que detail porque una lista puede quedar
//   invalidada por un upsert de CUALQUIER media (no solo los que
//   aparecen en esa página), y aceptamos algo más de staleness ahí a
//   cambio de menos escrituras a Redis en sync masivos.
// Sin datos de hit-rate reales de producción para este entorno (ver
// docs/ROADMAP.md Fase 13 — no hay Postgres/Redis corriendo en este
// sandbox), este es el mejor ajuste posible por razonamiento en vez de
// medición; revisar con métricas reales de `INFO stats` de Redis
// (keyspace_hits/keyspace_misses) antes de tocarlo de nuevo.
const MEDIA_DETAIL_TTL_SECONDS = 1800
const MEDIA_LIST_TTL_SECONDS = 300

export class MediaService {
  constructor(
    private readonly repository: MediaRepository,
    private readonly redis?: Redis,
  ) {}

  async getById(id: string): Promise<Media | null> {
    if (!this.redis) return this.repository.findById(id)

    return cacheAside(this.redis, `media:detail:${id}`, () => this.repository.findById(id), {
      ttlSeconds: MEDIA_DETAIL_TTL_SECONDS,
    })
  }

  async list(params: ListMediaParams): Promise<PagedResult<Media>> {
    const page = params.page && params.page > 0 ? params.page : 1
    const pageSize =
      params.pageSize && params.pageSize > 0
        ? Math.min(params.pageSize, MAX_PAGE_SIZE)
        : DEFAULT_PAGE_SIZE

    const filters: ListMediaFilters = {
      page,
      pageSize,
      ...(params.type ? { type: params.type } : {}),
      ...(params.genreSlug ? { genreSlug: params.genreSlug } : {}),
      ...(params.year ? { year: params.year } : {}),
      ...(params.sort ? { sort: params.sort } : {}),
    }

    const runQuery = async (): Promise<PagedResult<Media>> => {
      const { items, total } = await this.repository.list(filters)
      return {
        items,
        total,
        page,
        pageSize,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      }
    }

    if (!this.redis) return runQuery()

    const cacheKey = `media:list:${JSON.stringify(filters)}`
    return cacheAside(this.redis, cacheKey, runQuery, { ttlSeconds: MEDIA_LIST_TTL_SECONDS })
  }
}
