import type { AxiosInstance } from 'axios'
import { createHttpClient } from '../../utils/httpClient.js'
import { ProviderError, type MediaProvider, type ProviderDiscoverParams, type ProviderPage, type ProviderSearchParams } from '../types.js'
import type { OmdbResponse, OmdbSuccessResponse } from './omdb.types.js'

const OMDB_BASE_URL = 'https://www.omdbapi.com'

/** Adaptador OMDb — proveedor de ENRIQUECIMIENTO (ratings IMDb/Rotten
 * Tomatoes/Metacritic consolidados), no de catálogo. `externalId` en
 * `details()` es el imdbId (formato "tt1234567"), ya que OMDb identifica
 * por ahí, no por su propio id interno. Mismo patrón que FanArt: los
 * métodos de catálogo fallan explícito. */
export class OmdbProvider implements MediaProvider<never, OmdbSuccessResponse, never, never> {
  readonly slug = 'omdb'
  readonly name = 'OMDb'

  private readonly http: AxiosInstance
  private readonly apiKey: string | undefined

  constructor(opts: { apiKey: string | undefined }) {
    this.apiKey = opts.apiKey
    this.http = createHttpClient(OMDB_BASE_URL)
  }

  isEnabled(): boolean {
    return !!this.apiKey
  }

  async details(imdbId: string): Promise<OmdbSuccessResponse | null> {
    if (!this.apiKey) {
      throw new ProviderError(this.slug, 'No hay API key configurada (OMDB_API_KEY).')
    }
    try {
      const { data } = await this.http.get<OmdbResponse>('', {
        params: { i: imdbId, apikey: this.apiKey, plot: 'short' },
      })
      if (data.Response === 'False') return null
      return data
    } catch (err) {
      throw new ProviderError(this.slug, `Fallo consultando imdbId=${imdbId}: ${describeError(err)}`, err)
    }
  }

  async searchByTitle(title: string, year?: number): Promise<OmdbSuccessResponse | null> {
    if (!this.apiKey) {
      throw new ProviderError(this.slug, 'No hay API key configurada (OMDB_API_KEY).')
    }
    try {
      const { data } = await this.http.get<OmdbResponse>('', {
        params: { t: title, y: year, apikey: this.apiKey, plot: 'short' },
      })
      if (data.Response === 'False') return null
      return data
    } catch (err) {
      throw new ProviderError(this.slug, `Fallo buscando title="${title}": ${describeError(err)}`, err)
    }
  }

  images(): Promise<never> {
    return Promise.reject(
      new ProviderError(this.slug, 'OMDb no expone una galería de imágenes, solo un poster.'),
    )
  }

  episodes(): Promise<never[]> {
    return Promise.resolve([])
  }

  search(_params: ProviderSearchParams): Promise<ProviderPage<never>> {
    return Promise.reject(
      new ProviderError(
        this.slug,
        'Usar searchByTitle() — OMDb no pagina resultados de búsqueda por título+año exacto.',
      ),
    )
  }

  trending(): Promise<ProviderPage<never>> {
    return Promise.reject(new ProviderError(this.slug, 'OMDb no expone un endpoint de trending.'))
  }

  discover(_params: ProviderDiscoverParams): Promise<ProviderPage<never>> {
    return Promise.reject(new ProviderError(this.slug, 'OMDb no expone un endpoint de discover.'))
  }

  popular(): Promise<ProviderPage<never>> {
    return Promise.reject(new ProviderError(this.slug, 'OMDb no expone un endpoint de popular.'))
  }

  recommendations(): Promise<ProviderPage<never>> {
    return Promise.reject(new ProviderError(this.slug, 'OMDb no expone recomendaciones.'))
  }
}

function describeError(err: unknown): string {
  if (typeof err === 'object' && err !== null && 'response' in err) {
    const status = (err as { response?: { status?: number } }).response?.status
    if (status) return `HTTP ${status}`
  }
  if (err instanceof Error) return err.message
  return 'error desconocido'
}
