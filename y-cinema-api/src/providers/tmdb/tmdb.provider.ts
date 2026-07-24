import type { AxiosInstance } from 'axios'
import { createHttpClient } from '../../utils/httpClient.js'
import { ProviderError, type MediaProvider, type ProviderDiscoverParams, type ProviderPage, type ProviderSearchParams } from '../types.js'
import type { TmdbDetails, TmdbEpisode, TmdbImagesResponse, TmdbListItem, TmdbListResponse } from './tmdb.types.js'

const TMDB_BASE_URL = 'https://api.themoviedb.org/3'
const RATE_LIMIT_RETRY_DELAY_MS = 2000

export interface TmdbProviderOptions {
  apiKey: string | undefined
  mediaType?: 'movie' | 'tv'
}

/** Adaptador TMDB — fuente principal (weight=100, ver prisma/seed.ts).
 * Mismo comportamiento de retry-en-429 y error normalizado en 401 que el
 * adaptador probado de Y-cinema/electron/modules/tmdb-api.ts, reescrito
 * sin dependencia de un CacheStore (el cache es responsabilidad de la
 * Fase 7, no de la capa de proveedor — ver ADR 2.2). */
export class TmdbProvider implements MediaProvider<TmdbListItem, TmdbDetails, TmdbEpisode, TmdbImagesResponse> {
  readonly slug = 'tmdb'
  readonly name = 'The Movie Database'

  private readonly http: AxiosInstance
  private readonly apiKey: string | undefined
  private readonly mediaType: 'movie' | 'tv'

  constructor(opts: TmdbProviderOptions) {
    this.apiKey = opts.apiKey
    this.mediaType = opts.mediaType ?? 'movie'
    this.http = createHttpClient(TMDB_BASE_URL)
  }

  isEnabled(): boolean {
    return !!this.apiKey
  }

  private async request<T>(endpoint: string, params: Record<string, unknown> = {}): Promise<T> {
    if (!this.apiKey) {
      throw new ProviderError(this.slug, 'No hay API key configurada (TMDB_API_KEY).')
    }

    const fullParams = { api_key: this.apiKey, language: 'es-ES', ...params }

    try {
      const { data } = await this.http.get<T>(endpoint, { params: fullParams })
      return data
    } catch (err) {
      const status = isAxiosErrorWithStatus(err) ? err.response?.status : undefined

      if (status === 429) {
        await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_RETRY_DELAY_MS))
        const { data } = await this.http.get<T>(endpoint, { params: fullParams })
        return data
      }

      if (status === 401) {
        throw new ProviderError(this.slug, 'API key rechazada (401).', err)
      }

      throw new ProviderError(this.slug, `Fallo en ${endpoint}: ${describeError(err)}`, err)
    }
  }

  private toPage(res: TmdbListResponse): ProviderPage<TmdbListItem> {
    return {
      items: res.results,
      page: res.page,
      totalPages: res.total_pages,
      totalResults: res.total_results,
    }
  }

  async search(params: ProviderSearchParams): Promise<ProviderPage<TmdbListItem>> {
    const res = await this.request<TmdbListResponse>(`/search/${this.mediaType}`, {
      query: params.query,
      page: params.page ?? 1,
      include_adult: false,
    })
    return this.toPage(res)
  }

  async details(externalId: string): Promise<TmdbDetails | null> {
    try {
      return await this.request<TmdbDetails>(`/${this.mediaType}/${externalId}`, {
        append_to_response: 'videos,credits,external_ids',
      })
    } catch (err) {
      if (err instanceof ProviderError && err.cause && isAxiosErrorWithStatus(err.cause)) {
        if (err.cause.response?.status === 404) return null
      }
      throw err
    }
  }

  async images(externalId: string): Promise<TmdbImagesResponse> {
    return this.request<TmdbImagesResponse>(`/${this.mediaType}/${externalId}/images`)
  }

  async episodes(externalId: string, seasonNumber: number): Promise<TmdbEpisode[]> {
    const res = await this.request<{ episodes: TmdbEpisode[] }>(
      `/tv/${externalId}/season/${seasonNumber}`,
    )
    return res.episodes
  }

  async trending(page = 1): Promise<ProviderPage<TmdbListItem>> {
    const res = await this.request<TmdbListResponse>(`/trending/${this.mediaType}/week`, { page })
    return this.toPage(res)
  }

  async discover(params: ProviderDiscoverParams): Promise<ProviderPage<TmdbListItem>> {
    const res = await this.request<TmdbListResponse>(`/discover/${this.mediaType}`, {
      page: params.page ?? 1,
      sort_by: 'popularity.desc',
      ...(params.genreId ? { with_genres: params.genreId } : {}),
      ...(params.year
        ? { [this.mediaType === 'tv' ? 'first_air_date_year' : 'primary_release_year']: params.year }
        : {}),
    })
    return this.toPage(res)
  }

  async popular(page = 1): Promise<ProviderPage<TmdbListItem>> {
    const res = await this.request<TmdbListResponse>(`/${this.mediaType}/popular`, { page })
    return this.toPage(res)
  }

  async recommendations(externalId: string): Promise<ProviderPage<TmdbListItem>> {
    const res = await this.request<TmdbListResponse>(
      `/${this.mediaType}/${externalId}/recommendations`,
    )
    return this.toPage(res)
  }
}

function isAxiosErrorWithStatus(err: unknown): err is { response?: { status?: number } } {
  return typeof err === 'object' && err !== null && 'response' in err
}

function describeError(err: unknown): string {
  if (isAxiosErrorWithStatus(err) && err.response?.status) {
    return `HTTP ${err.response.status}`
  }
  if (err instanceof Error) return err.message
  return 'error desconocido'
}
