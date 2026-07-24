// Forma NATIVA de TVMaze — ver nota en providers/tmdb/tmdb.types.ts.

export interface TvMazeImage {
  medium: string | null
  original: string | null
}

export interface TvMazeShow {
  id: number
  name: string
  summary: string | null
  image: TvMazeImage | null
  rating: { average: number | null }
  premiered: string | null
  genres: string[]
  language: string | null
  url: string
  externals: { imdb: string | null; thetvdb: number | null }
}

export interface TvMazeSearchResult {
  score: number
  show: TvMazeShow
}

export interface TvMazeEpisode {
  id: number
  name: string
  season: number
  number: number
  airdate: string | null
  runtime: number | null
  summary: string | null
  image: TvMazeImage | null
}

export interface TvMazeImageResource {
  type: string
  resolutions: { original?: { url: string } }
}
