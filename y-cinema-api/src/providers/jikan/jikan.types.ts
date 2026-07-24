// Forma NATIVA de Jikan v4 — ver nota en providers/tmdb/tmdb.types.ts.

export interface JikanImages {
  jpg: { image_url: string | null; large_image_url: string | null }
}

export interface JikanAnimeEntry {
  mal_id: number
  title: string
  title_english: string | null
  title_japanese: string | null
  synopsis: string | null
  images: JikanImages
  score: number | null
  scored_by: number | null
  rank: number | null
  popularity: number | null
  genres: Array<{ name: string }>
  studios: Array<{ name: string }>
  type: string | null
  episodes: number | null
  status: string | null
  aired: { from: string | null; to: string | null }
  duration: string | null
  rating: string | null
  source: string | null
  season: string | null
  year: number | null
  url: string
  trailer: { embed_url: string | null } | null
}

export interface JikanListResponse {
  data: JikanAnimeEntry[]
  pagination: {
    current_page: number
    has_next_page: boolean
    items: { count: number; total: number; per_page: number }
  }
}

export interface JikanDetailsResponse {
  data: JikanAnimeEntry
}

export interface JikanRecommendationsResponse {
  data: Array<{ entry: JikanAnimeEntry }>
}
