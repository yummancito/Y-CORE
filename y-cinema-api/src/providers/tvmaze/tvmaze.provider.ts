import type { AxiosInstance } from 'axios'
import { createHttpClient } from '../../utils/httpClient.js'
import { ProviderError, type MediaProvider, type ProviderDiscoverParams, type ProviderPage, type ProviderSearchParams } from '../types.js'
import type { TvMazeEpisode, TvMazeImageResource, TvMazeSearchResult, TvMazeShow } from './tvmaze.types.js'

const TVMAZE_BASE_URL = 'https://api.tvmaze.com'

/** Adaptador TVMaze — sin API key, cubre series/web series que TMDB no
 * indexa. TVMaze no ofrece discover/trending/popular/recommendations como
 * endpoints reales (es una API pequeña centrada en shows + episodios), así
 * que esos métodos de la interfaz fallan explícito con ProviderError en
 * vez de simular datos — mejor un error claro que un catálogo falso. */
export class TvMazeProvider implements MediaProvider<TvMazeShow, TvMazeShow, TvMazeEpisode, TvMazeImageResource[]> {
  readonly slug = 'tvmaze'
  readonly name = 'TVMaze'

  private readonly http: AxiosInstance

  constructor() {
    this.http = createHttpClient(TVMAZE_BASE_URL)
  }

  isEnabled(): boolean {
    return true
  }

  private async request<T>(endpoint: string, params: Record<string, unknown> = {}): Promise<T> {
    try {
      const { data } = await this.http.get<T>(endpoint, { params })
      return data
    } catch (err) {
      throw new ProviderError(this.slug, `Fallo en ${endpoint}: ${describeError(err)}`, err)
    }
  }

  async search(params: ProviderSearchParams): Promise<ProviderPage<TvMazeShow>> {
    const results = await this.request<TvMazeSearchResult[]>('/search/shows', { q: params.query })
    return { items: results.map((r) => r.show), page: 1, totalPages: 1, totalResults: results.length }
  }

  async details(externalId: string): Promise<TvMazeShow | null> {
    try {
      return await this.request<TvMazeShow>(`/shows/${externalId}`)
    } catch (err) {
      if (err instanceof ProviderError && isNotFound(err.cause)) return null
      throw err
    }
  }

  async images(externalId: string): Promise<TvMazeImageResource[]> {
    return this.request<TvMazeImageResource[]>(`/shows/${externalId}/images`)
  }

  async episodes(externalId: string, seasonNumber: number): Promise<TvMazeEpisode[]> {
    const all = await this.request<TvMazeEpisode[]>(`/shows/${externalId}/episodes`)
    return all.filter((e) => e.season === seasonNumber)
  }

  trending(): Promise<ProviderPage<TvMazeShow>> {
    return Promise.reject(new ProviderError(this.slug, 'TVMaze no expone un endpoint de trending.'))
  }

  discover(_params: ProviderDiscoverParams): Promise<ProviderPage<TvMazeShow>> {
    return Promise.reject(new ProviderError(this.slug, 'TVMaze no expone un endpoint de discover.'))
  }

  popular(): Promise<ProviderPage<TvMazeShow>> {
    return Promise.reject(new ProviderError(this.slug, 'TVMaze no expone un endpoint de popular.'))
  }

  recommendations(): Promise<ProviderPage<TvMazeShow>> {
    return Promise.reject(
      new ProviderError(this.slug, 'TVMaze no expone un endpoint de recomendaciones.'),
    )
  }
}

function isNotFound(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'response' in err &&
    (err as { response?: { status?: number } }).response?.status === 404
}

function describeError(err: unknown): string {
  if (typeof err === 'object' && err !== null && 'response' in err) {
    const status = (err as { response?: { status?: number } }).response?.status
    if (status) return `HTTP ${status}`
  }
  if (err instanceof Error) return err.message
  return 'error desconocido'
}
