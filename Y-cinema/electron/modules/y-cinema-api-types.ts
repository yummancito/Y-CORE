// y-cinema-api-types.ts — Espejo manual del shape público de
// y-cinema-api/src/types/media.ts. No hay workspace compartido entre los
// dos repos (proyectos npm separados), así que no se puede importar
// directo — mantener sincronizado a mano si la API cambia su shape.

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

export interface MediaImage {
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

export interface Episode {
  id: string
  episodeNumber: number
  title: string | null
  overview: string | null
  airDate: string | null
  runtimeMinutes: number | null
  images: MediaImage[]
}

export interface Season {
  id: string
  seasonNumber: number
  title: string | null
  overview: string | null
  airDate: string | null
  episodes: Episode[]
}

export interface Media {
  id: string
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
  imdbId: string | null
  genres: Genre[]
  people: Person[]
  images: MediaImage[]
  ratings: Rating[]
  seasons: Season[]
}

export interface PagedMediaResponse {
  items: Media[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export interface MediaSearchDocument {
  id: string
  type: MediaType
  title: string
  originalTitle: string | null
  overview: string | null
  releaseYear: number | null
  popularity: number
  genres: string[]
  posterUrl: string | null
}

export interface SearchResponse {
  items: MediaSearchDocument[]
  estimatedTotalHits: number
  processingTimeMs: number
}

export type MediaListSort = 'popularity' | 'recent'

export interface ListMediaParams {
  type?: MediaType
  genre?: string
  year?: number
  sort?: MediaListSort
  page?: number
  pageSize?: number
}

export interface SearchParams {
  type?: MediaType
  genre?: string
  limit?: number
}
