// Contrato común de todo adaptador de proveedor externo.
// Ver docs/ADR.md sección 2.2: providers/ es un adaptador aislado, nunca
// contiene lógica de negocio ni conoce el modelo central — devuelve datos
// en la forma NATIVA de cada proveedor. La normalización a `Media` ocurre
// en la Fase 5 (services/normalizer), nunca acá.

export interface ProviderSearchParams {
  query: string
  page?: number
}

export interface ProviderDiscoverParams {
  page?: number
  genreId?: string | number
  year?: number
}

/** Resultado crudo de un proveedor — deliberadamente `unknown`/genérico
 * por ítem: cada proveedor tiene su propio shape, y NormalizerService
 * (Fase 5) es quien sabe interpretar cada uno. */
export interface ProviderPage<T> {
  items: T[]
  page: number
  totalPages: number | null
  totalResults: number | null
}

/**
 * Interfaz que implementa cada adaptador en `providers/<nombre>/`.
 * `TItem` es la forma nativa que ese proveedor específico devuelve para un
 * resultado de listado (search/discover/trending/popular/recommendations),
 * y `TDetails` la forma nativa de un detalle completo.
 */
export interface MediaProvider<TItem, TDetails, TEpisode = never, TImages = unknown> {
  readonly slug: string
  readonly name: string

  /** true si el proveedor tiene todo lo necesario para operar (p.ej. API
   * key presente) — los proveedores sin key configurada deben devolver
   * false acá en vez de fallar en cada llamada. */
  isEnabled(): boolean

  search(params: ProviderSearchParams): Promise<ProviderPage<TItem>>
  details(externalId: string): Promise<TDetails | null>
  images(externalId: string): Promise<TImages>
  episodes(externalId: string, seasonNumber: number): Promise<TEpisode[]>
  trending(page?: number): Promise<ProviderPage<TItem>>
  discover(params: ProviderDiscoverParams): Promise<ProviderPage<TItem>>
  popular(page?: number): Promise<ProviderPage<TItem>>
  recommendations(externalId: string): Promise<ProviderPage<TItem>>
}

/** Error tipado para fallos de proveedor — permite al caller (Fase 5)
 * distinguir "el proveedor no tiene esto" de "el proveedor está caído". */
export class ProviderError extends Error {
  constructor(
    public readonly providerSlug: string,
    message: string,
    public override readonly cause?: unknown,
  ) {
    super(`[${providerSlug}] ${message}`)
    this.name = 'ProviderError'
  }
}
