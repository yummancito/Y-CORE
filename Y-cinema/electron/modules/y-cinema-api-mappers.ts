// y-cinema-api-mappers.ts — Traduce el modelo Media de y-cinema-api al
// shape legacy Movie/MediaDetails que la UI ya sabe pintar. Único punto
// de traducción: el resto de la app (componentes, páginas) no cambia.
//
// Mismo patrón que adaptTvMaze/adaptAniList en UniversalDetailPage.tsx
// (ya validado en este código base) — pero centralizado acá en vez de
// repetido por página.
//
// Nota sobre poster_path/backdrop_path: Media.images[].url YA es una URL
// absoluta (a diferencia de TMDB, que da paths relativos) — MovieCard.tsx
// ya tolera ambos casos vía detección `.startsWith('http')`, así que no
// hace falta tocar ningún componente.

import type { Media, MediaSearchDocument, MediaType as ApiMediaType } from './y-cinema-api-types'

// Shapes locales, espejo de src/types/media.ts — mismo patrón que
// tmdb-api.ts (tipos propios en electron/, sin import cruzado a src/).
interface LegacyGenre {
  id: number
  name: string
}
interface LegacyEpisode {
  id: string
  episode_number: number
  season_number: number
  name: string
  overview: string
  still_path: string | null
  runtime?: number | null
  air_date?: string
}
interface LegacySeason {
  id: string
  season_number: number
  name: string
  episode_count: number
  poster_path: string | null
  episodes?: LegacyEpisode[]
}
interface LegacyMovie {
  id: string
  title?: string
  name?: string
  overview: string
  poster_path: string | null
  backdrop_path: string | null
  vote_average: number
  vote_count?: number
  release_date?: string
  first_air_date?: string
  media_type?: string
  /** true si Media.type === 'ANIME' en la API — más confiable que inferir
   * por nombre de género (SearchPage lo usa para el filtro "Anime"). */
  is_anime?: boolean
  genre_names?: string[]
  popularity?: number
}
interface LegacyMediaDetails extends LegacyMovie {
  tagline?: string
  genres: LegacyGenre[]
  runtime?: number
  number_of_seasons?: number
  seasons?: LegacySeason[]
  status?: string
  external_ids?: { imdb_id?: string | null }
}

function apiTypeToLegacy(type: ApiMediaType): 'movie' | 'tv' {
  return type === 'MOVIE' ? 'movie' : 'tv'
}

function findImageUrl(images: Media['images'], type: 'POSTER' | 'BACKDROP'): string | null {
  return images.find((img) => img.type === type)?.url ?? null
}

function bestRating(ratings: Media['ratings']): number {
  const tmdbRating = ratings.find((r) => r.source === 'tmdb')
  const rating = tmdbRating ?? ratings[0]
  if (!rating) return 0
  // Normaliza a escala 10 (algunas fuentes usan escala 100).
  return rating.scale === 10 ? rating.value : (rating.value / rating.scale) * 10
}

function releaseFields(m: Media): { release_date?: string; first_air_date?: string } {
  if (!m.releaseDate) return {}
  return m.type === 'MOVIE' ? { release_date: m.releaseDate } : { first_air_date: m.releaseDate }
}

/** Media → Movie (para listados: home, búsqueda). */
export function mediaToMovie(m: Media): LegacyMovie {
  return {
    id: m.id,
    title: m.type === 'MOVIE' ? m.title : undefined,
    name: m.type !== 'MOVIE' ? m.title : undefined,
    overview: m.overview ?? '',
    poster_path: findImageUrl(m.images, 'POSTER'),
    backdrop_path: findImageUrl(m.images, 'BACKDROP'),
    vote_average: bestRating(m.ratings),
    media_type: apiTypeToLegacy(m.type),
    is_anime: m.type === 'ANIME',
    genre_names: m.genres.map((g) => g.name),
    popularity: m.popularity,
    ...releaseFields(m),
  }
}

function mapEpisode(e: Media['seasons'][number]['episodes'][number], seasonNumber: number): LegacyEpisode {
  return {
    id: e.id,
    episode_number: e.episodeNumber,
    season_number: seasonNumber,
    name: e.title ?? `Episodio ${e.episodeNumber}`,
    overview: e.overview ?? '',
    still_path: e.images.find((img) => img.type === 'STILL')?.url ?? null,
    runtime: e.runtimeMinutes,
    air_date: e.airDate ?? undefined,
  }
}

function mapSeason(s: Media['seasons'][number]): LegacySeason {
  return {
    id: s.id,
    season_number: s.seasonNumber,
    name: s.title ?? `Temporada ${s.seasonNumber}`,
    episode_count: s.episodes.length,
    poster_path: null, // Season de la API no trae imágenes propias hoy
    episodes: s.episodes.map((e) => mapEpisode(e, s.seasonNumber)),
  }
}

/** Media → MediaDetails (para la página de detalle completa).
 * credits/videos/recommendations quedan undefined a propósito — Media no
 * los expone (fuera de alcance, ver docs/ROADMAP.md de y-cinema-api); los
 * componentes ya manejan su ausencia con `?.`. external_ids.imdb_id se
 * preserva en esta forma exacta porque WatchPage.tsx la lee vía ese mismo
 * cast — no tocar esa lógica al migrar. */
export function mediaToMediaDetails(m: Media): LegacyMediaDetails {
  return {
    ...mediaToMovie(m),
    tagline: m.tagline ?? undefined,
    genres: m.genres.map((g, i) => ({ id: i, name: g.name })),
    runtime: m.type === 'MOVIE' ? (m.runtimeMinutes ?? undefined) : undefined,
    number_of_seasons: m.seasons.length || undefined,
    seasons: m.seasons.length > 0 ? m.seasons.map(mapSeason) : undefined,
    status: m.status,
    external_ids: { imdb_id: m.imdbId },
  }
}

/** MediaSearchDocument → Movie (para resultados de búsqueda — shape más
 * chico que Media, sin ratings/seasons). */
export function searchDocToMovie(d: MediaSearchDocument): LegacyMovie {
  return {
    id: d.id,
    title: d.type === 'MOVIE' ? d.title : undefined,
    name: d.type !== 'MOVIE' ? d.title : undefined,
    overview: d.overview ?? '',
    poster_path: d.posterUrl,
    backdrop_path: null,
    vote_average: 0, // MediaSearchDocument no trae ratings
    media_type: apiTypeToLegacy(d.type),
    is_anime: d.type === 'ANIME',
    genre_names: d.genres,
    popularity: d.popularity,
    ...(d.releaseYear
      ? d.type === 'MOVIE'
        ? { release_date: `${d.releaseYear}-01-01` }
        : { first_air_date: `${d.releaseYear}-01-01` }
      : {}),
  }
}
