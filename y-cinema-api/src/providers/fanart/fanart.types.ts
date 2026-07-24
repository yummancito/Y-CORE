// Forma NATIVA de FanArt.tv — ver nota en providers/tmdb/tmdb.types.ts.

export interface FanArtImageEntry {
  id: string
  url: string
  lang: string
  likes: string
  season?: string
}

export interface FanArtResponse {
  name?: string
  tmdb_id?: string
  imdb_id?: string
  status?: string
  hdmovielogo?: FanArtImageEntry[]
  hdtvlogo?: FanArtImageEntry[]
  moviebackground?: FanArtImageEntry[]
  showbackground?: FanArtImageEntry[]
  moviebanner?: FanArtImageEntry[]
  tvbanner?: FanArtImageEntry[]
  moviethumb?: FanArtImageEntry[]
  tvthumb?: FanArtImageEntry[]
  movieposter?: FanArtImageEntry[]
  tvposter?: FanArtImageEntry[]
  hdmovieclearart?: FanArtImageEntry[]
  clearart?: FanArtImageEntry[]
  charactermug?: FanArtImageEntry[]
  showcharacter?: FanArtImageEntry[]
  seasonposter?: FanArtImageEntry[]
  seasonthumb?: FanArtImageEntry[]
}
