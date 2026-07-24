import type { Settings } from 'meilisearch'
import type { MediaType } from '../../types/media.js'

/** Documento indexado en Meilisearch — versión aplanada de Media, pensada
 * para búsqueda/autocomplete, no para servir como respuesta de detalle
 * (para eso está GET /api/v1/media/:id sobre Postgres, la fuente de
 * verdad). Nunca se persiste solo en Meilisearch: siempre se deriva de un
 * Media ya guardado en Postgres. */
export interface MediaSearchDocument {
  id: string
  type: MediaType
  title: string
  originalTitle: string | null
  overview: string | null
  releaseYear: number | null
  popularity: number
  genres: string[]
  actors: string[]
  studios: string[]
  collections: string[]
  posterUrl: string | null
}

export const MEDIA_INDEX_NAME = 'media'

export const MEDIA_INDEX_SETTINGS: Settings = {
  searchableAttributes: [
    'title',
    'originalTitle',
    'actors',
    'studios',
    'genres',
    'collections',
    'overview',
  ],
  filterableAttributes: ['type', 'genres', 'releaseYear'],
  sortableAttributes: ['popularity', 'releaseYear'],
  // Sinónimos frecuentes en español/inglés para el dominio de cine/series
  // — sin esto, buscar "ciencia ficcion" (sin tilde) o "sci-fi" no
  // encontraría contenido indexado como "Ciencia Ficción".
  synonyms: {
    'sci-fi': ['ciencia ficcion', 'ciencia ficción'],
    'ciencia ficcion': ['sci-fi', 'ciencia ficción'],
    animacion: ['animación', 'anime', 'cartoon'],
    pelicula: ['película', 'film', 'movie'],
    serie: ['series', 'tv show'],
  },
  typoTolerance: {
    enabled: true,
    minWordSizeForTypos: { oneTypo: 4, twoTypos: 8 },
  },
}
