// y-cinema-api-client.ts — Cliente HTTP al backend compartido de catálogo
// (y-cinema-api). Reemplaza las llamadas directas a TMDB/TVMaze/AniList/
// Jikan: Y-cinema ahora consume un único servidor central con el catálogo
// ya normalizado y deduplicado (modelo tipo Stremio/Trakt).
//
// Mismo patrón que tmdb-api.ts: request() privado con retry en 429,
// CacheStore opcional inyectado. Las rutas de catálogo (/media, /search,
// /genres) siguen siendo públicas — el Bearer solo se adjunta si hay una
// sesión activa (AuthStore opcional), dejando el cliente listo para
// cuando favorites/watchlist/history se sincronicen server-side; ninguna
// ruta protegida se consume todavía desde acá.
//
// Logs: [YCinemaAPI]

import axios, { type AxiosInstance } from 'axios'
import type { CacheStore } from './cache-store'
import type { AuthStore } from './auth-store'
import type {
  Genre,
  ListMediaParams,
  Media,
  PagedMediaResponse,
  SearchParams,
  SearchResponse,
} from './y-cinema-api-types'

const DEFAULT_BASE_URL = 'http://localhost:4000/api/v1'
const RATE_LIMIT_RETRY_DELAY_MS = 2000

export class YCinemaApiClient {
  private baseUrl: string
  private http: AxiosInstance

  constructor(
    private cache?: CacheStore,
    private auth?: AuthStore
  ) {
    this.baseUrl = process.env.Y_CINEMA_API_URL || DEFAULT_BASE_URL
    this.http = axios.create({ baseURL: this.baseUrl })
    this.http.interceptors.request.use(async (config) => {
      const session = await this.auth?.getSession().catch(() => null)
      if (session?.access_token) {
        config.headers.Authorization = `Bearer ${session.access_token}`
      }
      return config
    })
  }

  private async request<T>(path: string, params: object = {}): Promise<T> {
    try {
      const { data } = await this.http.get(path, { params })
      return data as T
    } catch (err: any) {
      if (err.response?.status === 429) {
        console.warn(`[YCinemaAPI] rate limit en ${path}, reintentando en 2s...`)
        await new Promise((r) => setTimeout(r, RATE_LIMIT_RETRY_DELAY_MS))
        const { data } = await this.http.get(path, { params })
        return data as T
      }
      throw new Error(
        `y-cinema-api falló en ${path}: ${err.response?.status || 'sin conexión'} ${err.message}`
      )
    }
  }

  /** Envuelve request() con CacheStore si está disponible — mismo criterio
   * que tmdb-api.ts: sin esto, cada carga de home repetiría 4+ llamadas
   * paralelas al backend sin ningún control de frecuencia. */
  private cached<T>(
    category: 'search' | 'details' | 'trending',
    key: string,
    fetcher: () => Promise<T>
  ): Promise<T> {
    if (!this.cache) return fetcher()
    return this.cache.wrap(category, key, fetcher)
  }

  async list(params: ListMediaParams): Promise<PagedMediaResponse> {
    const key = JSON.stringify(params)
    return this.cached('trending', `list:${key}`, () =>
      this.request<PagedMediaResponse>('/media', params)
    )
  }

  /** 404 se traduce a null, no a excepción — preserva el contrato que
   * DetailPage.tsx ya espera (if (error || !detail)) sin try/catch extra. */
  async getById(id: string): Promise<Media | null> {
    return this.cached('details', id, async () => {
      try {
        const { data } = await this.http.get<Media>(`/media/${id}`)
        return data
      } catch (err: any) {
        if (err.response?.status === 404) return null
        throw new Error(
          `y-cinema-api falló en /media/${id}: ${err.response?.status || 'sin conexión'} ${err.message}`
        )
      }
    })
  }

  async search(q: string, opts: SearchParams = {}): Promise<SearchResponse> {
    return this.request<SearchResponse>('/search', { q, ...opts })
  }

  async getGenres(): Promise<Genre[]> {
    return this.cached('trending', 'genres', () => this.request<Genre[]>('/genres'))
  }
}
