// Modelo central — ver docs/ADR.md sección 2.3.
// Todo proveedor externo se normaliza a estas formas antes de tocar la
// base de datos o salir por la API pública. Nunca se expone la forma
// nativa de un proveedor (ver providers/*.ts).

export type MediaType = 'MOVIE' | 'SERIES' | 'ANIME'
export type MediaStatus = 'RELEASED' | 'IN_PRODUCTION' | 'UPCOMING' | 'CANCELED'
export type ImageType =
  | 'POSTER'
  | 'BACKDROP'
  | 'LOGO'
  | 'BANNER'
  | 'THUMBNAIL'
  | 'CHARACTER_ART'
  | 'STILL'
export type PersonRole = 'ACTOR' | 'DIRECTOR' | 'WRITER' | 'PRODUCER' | 'VOICE_ACTOR'
export type TranslatableField = 'TITLE' | 'OVERVIEW' | 'TAGLINE'

export interface Genre {
  id: string
  slug: string
  name: string
}

export interface Person {
  id: string
  name: string
  profileUrl: string | null
  role: PersonRole
  characterName: string | null
  billingOrder: number | null
}

export interface Image {
  id: string
  type: ImageType
  url: string
  width: number | null
  height: number | null
  languageCode: string | null
}

export interface Rating {
  source: string
  value: number
  scale: number
  voteCount: number | null
}

export interface Translation {
  languageCode: string
  field: TranslatableField
  value: string
  quality: number
}

export interface Collection {
  id: string
  name: string
  overview: string | null
}

export interface Episode {
  id: string
  episodeNumber: number
  title: string | null
  overview: string | null
  airDate: string | null // ISO 8601
  runtimeMinutes: number | null
  images: Image[]
}

export interface Season {
  id: string
  seasonNumber: number
  title: string | null
  overview: string | null
  airDate: string | null // ISO 8601
  episodes: Episode[]
}

/** La forma pública/canónica de un Media — lo que sale por la API. */
export interface Media {
  id: string
  type: MediaType
  title: string
  originalTitle: string | null
  overview: string | null
  tagline: string | null
  status: MediaStatus
  releaseDate: string | null // ISO 8601
  runtimeMinutes: number | null
  originalLangCode: string | null
  popularity: number
  /** Resuelto desde media_provider_refs (tmdb.raw.external_ids.imdb_id, o
   * el externalId de la ref omdb como fallback) — null si ninguna
   * referencia conocida lo tiene. Ver MediaRepository.resolveImdbId(). */
  imdbId: string | null
  genres: Genre[]
  people: Person[]
  images: Image[]
  ratings: Rating[]
  collections: Collection[]
  seasons: Season[]
  translations: Translation[]
}

/** Payload mínimo para crear/actualizar un Media normalizado — usado por
 * el NormalizerService (Fase 5) antes de persistir. No incluye `id`
 * (lo asigna la base de datos) ni relaciones ya resueltas como
 * `translations` (esas se resuelven aparte vía TranslationService). */
export interface NormalizedMediaInput {
  type: MediaType
  title: string
  originalTitle: string | null
  overview: string | null
  tagline: string | null
  status: MediaStatus
  releaseDate: string | null
  runtimeMinutes: number | null
  originalLangCode: string | null
  popularity: number
  genres: Array<{ slug: string; name: string }>
  people: Array<{
    name: string
    profileUrl: string | null
    role: PersonRole
    characterName: string | null
    billingOrder: number | null
  }>
  images: Array<{
    type: ImageType
    url: string
    width: number | null
    height: number | null
    languageCode: string | null
  }>
  ratings: Array<{ source: string; value: number; scale: number; voteCount: number | null }>
  seasons: Array<{
    seasonNumber: number
    title: string | null
    overview: string | null
    airDate: string | null
    episodes: Array<{
      episodeNumber: number
      title: string | null
      overview: string | null
      airDate: string | null
      runtimeMinutes: number | null
    }>
  }>
  /** Referencia externa para deduplicación — ver media_provider_refs. */
  externalRef: {
    providerSlug: string
    externalId: string
    raw?: unknown
  }
}
