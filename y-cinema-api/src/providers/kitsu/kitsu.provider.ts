import type { AxiosInstance } from 'axios'
import { createHttpClient } from '../../utils/httpClient.js'
import { ProviderError, type MediaProvider, type ProviderDiscoverParams, type ProviderPage, type ProviderSearchParams } from '../types.js'
import type { KitsuDetailsResponse, KitsuListResponse, KitsuResource } from './kitsu.types.js'

const KITSU_BASE_URL = 'https://kitsu.io/api/edge'
const PAGE_SIZE = 20

/** Adaptador Kitsu — sin API key, catálogo alternativo de anime (JSON:API).
 * Complementa AniList/Jikan; útil para títulos que uno de los dos no tiene
 * bien indexados. Paginación por offset (no por número de página como los
 * demás), convertida acá para que el caller siga usando `page` uniforme. */
export class KitsuProvider implements MediaProvider<KitsuResource, KitsuResource, never, never> {
  readonly slug = 'kitsu'
  readonly name = 'Kitsu'

  private readonly http: AxiosInstance

  constructor() {
    this.http = createHttpClient(KITSU_BASE_URL)
  }

  isEnabled(): boolean {
    return true
  }

  private async request<T>(path: string, params: Record<string, unknown> = {}): Promise<T> {
    try {
      const { data } = await this.http.get<T>(path, {
        params,
        headers: { Accept: 'application/vnd.api+json' },
      })
      return data
    } catch (err) {
      throw new ProviderError(this.slug, `Fallo en ${path}: ${describeError(err)}`, err)
    }
  }

  private toPage(res: KitsuListResponse, page: number): ProviderPage<KitsuResource> {
    return {
      items: res.data,
      page,
      totalPages: res.meta ? Math.ceil(res.meta.count / PAGE_SIZE) : null,
      totalResults: res.meta?.count ?? null,
    }
  }

  async search(params: ProviderSearchParams): Promise<ProviderPage<KitsuResource>> {
    const page = params.page ?? 1
    const res = await this.request<KitsuListResponse>('/anime', {
      'filter[text]': params.query,
      'page[limit]': PAGE_SIZE,
      'page[offset]': (page - 1) * PAGE_SIZE,
    })
    return this.toPage(res, page)
  }

  async details(externalId: string): Promise<KitsuResource | null> {
    try {
      const res = await this.request<KitsuDetailsResponse>(`/anime/${externalId}`)
      return res.data
    } catch (err) {
      if (err instanceof ProviderError && isStatus(err.cause, 404)) return null
      throw err
    }
  }

  images(): Promise<never> {
    return Promise.reject(
      new ProviderError(this.slug, 'Kitsu no expone una galería de imágenes separada del recurso principal.'),
    )
  }

  episodes(): Promise<never[]> {
    // Kitsu SÍ tiene un endpoint /anime/:id/episodes, pero queda fuera del
    // alcance de Fase 4 (Jikan y AniList ya cubren esta necesidad como
    // fuentes primarias de anime) — se documenta acá en vez de fallar
    // silencioso con datos parciales.
    return Promise.resolve([])
  }

  async trending(page = 1): Promise<ProviderPage<KitsuResource>> {
    const res = await this.request<KitsuListResponse>('/trending/anime')
    return this.toPage(res, page)
  }

  async discover(params: ProviderDiscoverParams): Promise<ProviderPage<KitsuResource>> {
    const page = params.page ?? 1
    const res = await this.request<KitsuListResponse>('/anime', {
      'filter[year]': params.year,
      'page[limit]': PAGE_SIZE,
      'page[offset]': (page - 1) * PAGE_SIZE,
      sort: '-userCount',
    })
    return this.toPage(res, page)
  }

  async popular(page = 1): Promise<ProviderPage<KitsuResource>> {
    const res = await this.request<KitsuListResponse>('/anime', {
      sort: '-userCount',
      'page[limit]': PAGE_SIZE,
      'page[offset]': (page - 1) * PAGE_SIZE,
    })
    return this.toPage(res, page)
  }

  recommendations(): Promise<ProviderPage<KitsuResource>> {
    return Promise.reject(
      new ProviderError(this.slug, 'Kitsu no expone recomendaciones vía este cliente en Fase 4.'),
    )
  }
}

function isStatus(err: unknown, status: number): boolean {
  return typeof err === 'object' && err !== null && 'response' in err &&
    (err as { response?: { status?: number } }).response?.status === status
}

function describeError(err: unknown): string {
  if (typeof err === 'object' && err !== null && 'response' in err) {
    const status = (err as { response?: { status?: number } }).response?.status
    if (status) return `HTTP ${status}`
  }
  if (err instanceof Error) return err.message
  return 'error desconocido'
}
