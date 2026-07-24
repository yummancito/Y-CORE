import type { AxiosInstance } from 'axios'
import { createHttpClient } from '../../utils/httpClient.js'
import { ProviderError, type MediaProvider, type ProviderDiscoverParams, type ProviderPage, type ProviderSearchParams } from '../types.js'
import type { JikanAnimeEntry, JikanDetailsResponse, JikanListResponse, JikanRecommendationsResponse } from './jikan.types.js'

const JIKAN_BASE_URL = 'https://api.jikan.moe/v4'
const MIN_INTERVAL_MS = 1200 // ~50 req/min, respetando el rate limit sin key de Jikan
const RATE_LIMIT_RETRY_DELAY_MS = 2000

/** Adaptador Jikan (MyAnimeList no oficial) — sin API key, con throttle
 * propio porque el rate limit de Jikan es agresivo (~30-60 req/min) y no
 * usa headers estándar de retry-after. Jikan no tiene episodios (MAL no
 * los expone estructurados) ni imágenes separadas de las del listado —
 * ambos métodos de la interfaz lo reflejan explícitamente. */
export class JikanProvider implements MediaProvider<JikanAnimeEntry, JikanAnimeEntry, never, JikanAnimeEntry['images']> {
  readonly slug = 'jikan'
  readonly name = 'Jikan (MyAnimeList)'

  private readonly http: AxiosInstance
  private lastRequestAt = 0

  constructor() {
    this.http = createHttpClient(JIKAN_BASE_URL)
  }

  isEnabled(): boolean {
    return true
  }

  private async throttle(): Promise<void> {
    const elapsed = Date.now() - this.lastRequestAt
    if (elapsed < MIN_INTERVAL_MS) {
      await new Promise((resolve) => setTimeout(resolve, MIN_INTERVAL_MS - elapsed))
    }
    this.lastRequestAt = Date.now()
  }

  private async request<T>(endpoint: string, params: Record<string, unknown> = {}): Promise<T> {
    await this.throttle()
    try {
      const { data } = await this.http.get<T>(endpoint, { params })
      return data
    } catch (err) {
      if (isStatus(err, 429)) {
        await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_RETRY_DELAY_MS))
        const { data } = await this.http.get<T>(endpoint, { params })
        return data
      }
      throw new ProviderError(this.slug, `Fallo en ${endpoint}: ${describeError(err)}`, err)
    }
  }

  async search(params: ProviderSearchParams): Promise<ProviderPage<JikanAnimeEntry>> {
    const res = await this.request<JikanListResponse>('/anime', {
      q: params.query,
      page: params.page ?? 1,
      sfw: true,
    })
    return {
      items: res.data,
      page: res.pagination.current_page,
      totalPages: null,
      totalResults: res.pagination.items.total,
    }
  }

  async details(externalId: string): Promise<JikanAnimeEntry | null> {
    try {
      const res = await this.request<JikanDetailsResponse>(`/anime/${externalId}`)
      return res.data
    } catch (err) {
      if (err instanceof ProviderError && isStatus(err.cause, 404)) return null
      throw err
    }
  }

  async images(externalId: string): Promise<JikanAnimeEntry['images']> {
    const details = await this.details(externalId)
    if (!details) {
      throw new ProviderError(this.slug, `No existe anime con mal_id ${externalId}.`)
    }
    return details.images
  }

  episodes(): Promise<never[]> {
    // Jikan no expone episodios estructurados con overview/airdate por
    // temporada (a diferencia de TMDB/TVMaze) — se deja vacío en vez de
    // simular datos que no existen en la fuente.
    return Promise.resolve([])
  }

  async trending(page = 1): Promise<ProviderPage<JikanAnimeEntry>> {
    const res = await this.request<JikanListResponse>('/top/anime', { page, filter: 'airing' })
    return {
      items: res.data,
      page: res.pagination.current_page,
      totalPages: null,
      totalResults: res.pagination.items.total,
    }
  }

  discover(_params: ProviderDiscoverParams): Promise<ProviderPage<JikanAnimeEntry>> {
    return Promise.reject(
      new ProviderError(this.slug, 'Jikan no expone un endpoint de discover por género+año combinados.'),
    )
  }

  async popular(page = 1): Promise<ProviderPage<JikanAnimeEntry>> {
    const res = await this.request<JikanListResponse>('/top/anime', { page, filter: 'bypopularity' })
    return {
      items: res.data,
      page: res.pagination.current_page,
      totalPages: null,
      totalResults: res.pagination.items.total,
    }
  }

  async recommendations(externalId: string): Promise<ProviderPage<JikanAnimeEntry>> {
    const res = await this.request<JikanRecommendationsResponse>(
      `/anime/${externalId}/recommendations`,
    )
    const items = res.data.slice(0, 10).map((r) => r.entry)
    return { items, page: 1, totalPages: 1, totalResults: items.length }
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
