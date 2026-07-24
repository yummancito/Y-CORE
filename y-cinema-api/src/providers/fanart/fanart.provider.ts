import type { AxiosInstance } from 'axios'
import { createHttpClient } from '../../utils/httpClient.js'
import { ProviderError, type MediaProvider, type ProviderDiscoverParams, type ProviderPage, type ProviderSearchParams } from '../types.js'
import type { FanArtResponse } from './fanart.types.js'

const FANART_BASE_URL = 'https://webservice.fanart.tv/v3'

/** Adaptador FanArt.tv — proveedor de ENRIQUECIMIENTO, no de catálogo: solo
 * da imágenes extra para un id de TMDB ya conocido. `search`/`trending`/
 * `discover`/`popular`/`recommendations` no tienen equivalente en esta API
 * y fallan explícito — el NormalizerService (Fase 5) solo debe llamar a
 * `images()` para este proveedor. `mediaType` decide si consulta
 * /movies/:id o /tv/:id, ya que FanArt separa esos namespaces. */
export class FanArtProvider implements MediaProvider<never, never, never, FanArtResponse> {
  readonly slug = 'fanart'
  readonly name = 'FanArt.tv'

  private readonly http: AxiosInstance
  private readonly apiKey: string | undefined
  private readonly mediaType: 'movie' | 'tv'

  constructor(opts: { apiKey: string | undefined; mediaType?: 'movie' | 'tv' }) {
    this.apiKey = opts.apiKey
    this.mediaType = opts.mediaType ?? 'movie'
    this.http = createHttpClient(FANART_BASE_URL)
  }

  isEnabled(): boolean {
    return !!this.apiKey
  }

  async images(externalId: string): Promise<FanArtResponse> {
    if (!this.apiKey) {
      throw new ProviderError(this.slug, 'No hay API key configurada (FANART_API_KEY).')
    }
    const path = this.mediaType === 'tv' ? `/tv/${externalId}` : `/movies/${externalId}`
    try {
      const { data } = await this.http.get<FanArtResponse>(path, {
        params: { api_key: this.apiKey },
      })
      return data
    } catch (err) {
      throw new ProviderError(this.slug, `Fallo en ${path}: ${describeError(err)}`, err)
    }
  }

  search(_params: ProviderSearchParams): Promise<ProviderPage<never>> {
    return Promise.reject(
      new ProviderError(this.slug, 'FanArt.tv no es un catálogo buscable — solo enriquece por id de TMDB.'),
    )
  }

  details(): Promise<never> {
    return Promise.reject(
      new ProviderError(this.slug, 'FanArt.tv no expone detalles de media, solo imágenes.'),
    )
  }

  episodes(): Promise<never[]> {
    return Promise.resolve([])
  }

  trending(): Promise<ProviderPage<never>> {
    return Promise.reject(new ProviderError(this.slug, 'FanArt.tv no expone un endpoint de trending.'))
  }

  discover(_params: ProviderDiscoverParams): Promise<ProviderPage<never>> {
    return Promise.reject(new ProviderError(this.slug, 'FanArt.tv no expone un endpoint de discover.'))
  }

  popular(): Promise<ProviderPage<never>> {
    return Promise.reject(new ProviderError(this.slug, 'FanArt.tv no expone un endpoint de popular.'))
  }

  recommendations(): Promise<ProviderPage<never>> {
    return Promise.reject(new ProviderError(this.slug, 'FanArt.tv no expone recomendaciones.'))
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
