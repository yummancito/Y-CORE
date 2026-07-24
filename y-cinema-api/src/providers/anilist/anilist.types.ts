// Forma NATIVA de AniList — ver nota en providers/tmdb/tmdb.types.ts.

export interface AniListTitle {
  romaji: string | null
  english: string | null
  native: string | null
}

export interface AniListCoverImage {
  extraLarge: string | null
  large: string | null
}

export interface AniListMedia {
  id: number
  title: AniListTitle
  description: string | null
  coverImage: AniListCoverImage
  bannerImage: string | null
  averageScore: number | null
  startDate: { year: number | null; month: number | null; day: number | null }
  genres: string[]
  episodes: number | null
  format: string | null
  siteUrl: string
}

export interface AniListPageResponse {
  Page: { media: AniListMedia[] }
}

export interface AniListMediaResponse {
  Media: AniListMedia | null
}
