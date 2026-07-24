// Forma NATIVA de TMDB — nunca se expone por la API pública tal cual (ver
// docs/ADR.md 2.2). El NormalizerService (Fase 5) es quien la traduce a Media.

export interface TmdbGenre {
  id: number
  name: string
}

export interface TmdbListItem {
  id: number
  title?: string
  name?: string
  original_title?: string
  original_name?: string
  overview: string
  poster_path: string | null
  backdrop_path: string | null
  release_date?: string
  first_air_date?: string
  vote_average: number
  vote_count: number
  genre_ids: number[]
  popularity: number
  media_type?: string
  original_language: string
}

export interface TmdbListResponse {
  page: number
  results: TmdbListItem[]
  total_pages: number
  total_results: number
}

export interface TmdbCastMember {
  id: number
  name: string
  character: string
  profile_path: string | null
  order: number
}

export interface TmdbCrewMember {
  id: number
  name: string
  job: string
  department: string
  profile_path: string | null
}

export interface TmdbVideo {
  id: string
  key: string
  name: string
  site: string
  type: string
  official: boolean
}

export interface TmdbSeasonSummary {
  id: number
  name: string
  season_number: number
  episode_count: number
  poster_path: string | null
  air_date: string | null
}

export interface TmdbEpisode {
  id: number
  episode_number: number
  season_number: number
  name: string
  overview: string
  air_date: string | null
  runtime: number | null
  still_path: string | null
}

export interface TmdbSeasonDetails extends TmdbSeasonSummary {
  episodes: TmdbEpisode[]
}

export interface TmdbDetails {
  id: number
  title?: string
  name?: string
  tagline: string
  overview: string
  poster_path: string | null
  backdrop_path: string | null
  release_date?: string
  first_air_date?: string
  last_air_date?: string
  vote_average: number
  vote_count: number
  runtime?: number
  episode_run_time?: number[]
  genres: TmdbGenre[]
  status: string
  original_language: string
  popularity: number
  number_of_seasons?: number
  number_of_episodes?: number
  seasons?: TmdbSeasonSummary[]
  credits?: {
    cast: TmdbCastMember[]
    crew: TmdbCrewMember[]
  }
  videos?: {
    results: TmdbVideo[]
  }
  external_ids?: {
    imdb_id: string | null
  }
}

export interface TmdbImagesResponse {
  posters: Array<{ file_path: string; width: number; height: number; iso_639_1: string | null }>
  backdrops: Array<{ file_path: string; width: number; height: number; iso_639_1: string | null }>
  logos: Array<{ file_path: string; width: number; height: number; iso_639_1: string | null }>
}
