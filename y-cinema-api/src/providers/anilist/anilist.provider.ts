import type { AxiosInstance } from 'axios'
import { createHttpClient } from '../../utils/httpClient.js'
import { ProviderError, type MediaProvider, type ProviderDiscoverParams, type ProviderPage, type ProviderSearchParams } from '../types.js'
import type { AniListMedia, AniListMediaResponse, AniListPageResponse } from './anilist.types.js'

const ANILIST_URL = 'https://graphql.anilist.co'

const MEDIA_FIELDS = `
  id
  title { romaji english native }
  description(asHtml: false)
  coverImage { extraLarge large }
  bannerImage
  averageScore
  startDate { year month day }
  genres
  episodes
  format
  siteUrl
`

/** Adaptador AniList — GraphQL, sin API key, fuente dedicada de anime
 * (weight=90, segunda tras TMDB). No expone paginación total real en la
 * respuesta de Page sin un segundo campo `pageInfo` — se omite acá y
 * `totalPages`/`totalResults` quedan `null` en vez de inventar un valor. */
export class AniListProvider implements MediaProvider<AniListMedia, AniListMedia, never, never> {
  readonly slug = 'anilist'
  readonly name = 'AniList'

  private readonly http: AxiosInstance

  constructor() {
    this.http = createHttpClient(ANILIST_URL)
  }

  isEnabled(): boolean {
    return true
  }

  private async query<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
    try {
      const { data } = await this.http.post<{ data: T; errors?: unknown[] }>('', {
        query,
        variables,
      })
      if (data.errors && data.errors.length > 0) {
        throw new ProviderError(this.slug, `GraphQL errors: ${JSON.stringify(data.errors)}`)
      }
      return data.data
    } catch (err) {
      if (err instanceof ProviderError) throw err
      throw new ProviderError(this.slug, `Fallo en query GraphQL: ${describeError(err)}`, err)
    }
  }

  async search(params: ProviderSearchParams): Promise<ProviderPage<AniListMedia>> {
    const gql = `
      query ($search: String, $page: Int) {
        Page(page: $page, perPage: 20) {
          media(search: $search, type: ANIME, sort: SEARCH_MATCH) { ${MEDIA_FIELDS} }
        }
      }`
    const res = await this.query<AniListPageResponse>(gql, {
      search: params.query,
      page: params.page ?? 1,
    })
    return { items: res.Page.media, page: params.page ?? 1, totalPages: null, totalResults: null }
  }

  async details(externalId: string): Promise<AniListMedia | null> {
    const gql = `
      query ($id: Int) {
        Media(id: $id, type: ANIME) { ${MEDIA_FIELDS} }
      }`
    const res = await this.query<AniListMediaResponse>(gql, { id: Number(externalId) })
    return res.Media
  }

  images(): Promise<never> {
    return Promise.reject(
      new ProviderError(this.slug, 'AniList no expone una galería de imágenes separada del listado.'),
    )
  }

  episodes(): Promise<never[]> {
    return Promise.resolve([])
  }

  async trending(page = 1): Promise<ProviderPage<AniListMedia>> {
    const gql = `
      query ($page: Int) {
        Page(page: $page, perPage: 20) {
          media(type: ANIME, sort: TRENDING_DESC) { ${MEDIA_FIELDS} }
        }
      }`
    const res = await this.query<AniListPageResponse>(gql, { page })
    return { items: res.Page.media, page, totalPages: null, totalResults: null }
  }

  async discover(params: ProviderDiscoverParams): Promise<ProviderPage<AniListMedia>> {
    const gql = `
      query ($page: Int, $genre: String, $year: Int) {
        Page(page: $page, perPage: 20) {
          media(type: ANIME, genre: $genre, seasonYear: $year, sort: POPULARITY_DESC) { ${MEDIA_FIELDS} }
        }
      }`
    const res = await this.query<AniListPageResponse>(gql, {
      page: params.page ?? 1,
      genre: params.genreId ? String(params.genreId) : undefined,
      year: params.year,
    })
    return { items: res.Page.media, page: params.page ?? 1, totalPages: null, totalResults: null }
  }

  async popular(page = 1): Promise<ProviderPage<AniListMedia>> {
    const gql = `
      query ($page: Int) {
        Page(page: $page, perPage: 20) {
          media(type: ANIME, sort: POPULARITY_DESC) { ${MEDIA_FIELDS} }
        }
      }`
    const res = await this.query<AniListPageResponse>(gql, { page })
    return { items: res.Page.media, page, totalPages: null, totalResults: null }
  }

  recommendations(): Promise<ProviderPage<AniListMedia>> {
    // Requeriría una query aparte (Media.recommendations) — se deja fuera
    // del alcance de Fase 4; el NormalizerService puede usar `discover`
    // por género como aproximación si hace falta antes de la Fase 5.
    return Promise.reject(
      new ProviderError(this.slug, 'Recomendaciones de AniList no implementadas en Fase 4.'),
    )
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
