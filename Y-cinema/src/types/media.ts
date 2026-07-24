export type MediaType = 'movie' | 'tv'
export type CatalogType = MediaType | 'anime'

export interface Movie {
  /** UUID de y-cinema-api (antes era el id numérico de TMDB). */
  id: string
  title?: string
  name?: string
  original_title?: string
  original_name?: string
  overview: string
  poster_path: string | null
  backdrop_path: string | null
  vote_average: number
  vote_count?: number
  release_date?: string
  first_air_date?: string
  media_type?: string
  genre_ids?: number[]
  /** Nombres de género ya resueltos (y-cinema-api los trae embebidos) —
   * reemplaza el patrón genre_ids+genreMap heredado de TMDB. */
  genre_names?: string[]
  /** true si Media.type === 'ANIME' en y-cinema-api. */
  is_anime?: boolean
  popularity?: number
}

export interface Genre {
  id: number
  name: string
}

export interface CastMember {
  id: number
  name: string
  character: string
  profile_path: string | null
}

export interface CrewMember {
  id: number
  name: string
  job: string
  profile_path: string | null
}

export interface Video {
  id: string
  key: string
  name: string
  site: string
  type: string
}

export interface Episode {
  id: string
  episode_number: number
  season_number: number
  name: string
  overview: string
  still_path: string | null
  runtime?: number | null
  air_date?: string
}

export interface Season {
  id: string
  season_number: number
  name: string
  episode_count: number
  poster_path: string | null
  /** y-cinema-api trae los episodios embebidos en GET /media/:id — antes
   * requería una llamada aparte por temporada (tmdb.getSeasonDetails). */
  episodes?: Episode[]
}

export interface MediaDetails extends Movie {
  tagline?: string
  genres: Genre[]
  runtime?: number
  episode_run_time?: number[]
  number_of_seasons?: number
  number_of_episodes?: number
  seasons?: Season[]
  status?: string
  credits?: { cast: CastMember[]; crew: CrewMember[] }
  videos?: { results: Video[] }
  recommendations?: { results: Movie[] }
}

export interface TorrentResult {
  title: string
  magnet: string
  seeders: number
  leechers: number
  size: string
  quality: string
  source: string
  /** URL de detalle en la fuente (streaming directo: Gnula, Cuevana) */
  detailUrl?: string
}

export interface HistoryEntry {
  /** UUID de y-cinema-api en contenido nuevo; number en entries viejas
   * guardadas antes de esta migración (electron-store no se migra). */
  id: number | string
  mediaType: MediaType
  /** temporada/episodio — identifica el progreso por episodio en series */
  season?: number
  episode?: number
  title: string
  posterPath: string | null
  backdropPath: string | null
  progress: number
  currentTime: number
  duration: number
  watchedAt: number
}

export interface FavoriteItem {
  /** UUID de y-cinema-api en contenido nuevo; number en favoritos viejos
   * guardados antes de esta migración (electron-store no se migra). */
  id: number | string
  mediaType: MediaType
  title: string
  posterPath: string | null
  backdropPath: string | null
  voteAverage: number
  addedAt: number
}

export interface ApiListResponse {
  page?: number
  results: Movie[]
  total_pages?: number
  total_results?: number
}
