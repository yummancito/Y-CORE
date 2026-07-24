// Forma NATIVA de Kitsu (JSON:API) — ver nota en providers/tmdb/tmdb.types.ts.

export interface KitsuAttributes {
  canonicalTitle: string
  titles: { en: string | null; en_jp: string | null; ja_jp: string | null }
  synopsis: string | null
  posterImage: { original: string | null; large: string | null } | null
  coverImage: { original: string | null } | null
  averageRating: string | null // Kitsu devuelve rating como string, escala 0-100
  startDate: string | null
  episodeCount: number | null
  subtype: string | null
  status: string | null
}

export interface KitsuResource {
  id: string
  type: 'anime'
  attributes: KitsuAttributes
}

export interface KitsuListResponse {
  data: KitsuResource[]
  meta?: { count: number }
  links?: { next?: string }
}

export interface KitsuDetailsResponse {
  data: KitsuResource
}
