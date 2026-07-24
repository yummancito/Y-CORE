// Forma NATIVA de OMDb — ver nota en providers/tmdb/tmdb.types.ts.

export interface OmdbRatingEntry {
  Source: string
  Value: string
}

export interface OmdbSuccessResponse {
  imdbID: string
  Title: string
  Year: string
  Rated: string
  Released: string
  Runtime: string
  Genre: string
  Director: string
  Writer: string
  Actors: string
  Plot: string
  Language: string
  Country: string
  Awards: string
  Poster: string
  Ratings: OmdbRatingEntry[]
  Metascore: string
  imdbRating: string
  imdbVotes: string
  Type: string
  BoxOffice?: string
  Production?: string
  Response: 'True'
}

export interface OmdbErrorResponse {
  Response: 'False'
  Error: string
}

export type OmdbResponse = OmdbSuccessResponse | OmdbErrorResponse
