import type { Movie, MediaType } from '../types/media'

const IMG_BASE = 'https://image.tmdb.org/t/p'

export const posterUrl = (path: string | null | undefined, size: 'w342' | 'w500' = 'w500') =>
  path ? `${IMG_BASE}/${size}${path}` : null

export const backdropUrl = (path: string | null | undefined, size: 'w780' | 'w1280' | 'original' = 'original') =>
  path ? `${IMG_BASE}/${size}${path}` : null

export const profileUrl = (path: string | null | undefined) =>
  path ? `${IMG_BASE}/w185${path}` : null

export const stillUrl = (path: string | null | undefined) =>
  path ? `${IMG_BASE}/w300${path}` : null

export const youtubeThumb = (key: string) => `https://img.youtube.com/vi/${key}/hqdefault.jpg`

export const displayTitle = (m: Movie) => m.title || m.name || 'Sin título'

export const displayYear = (m: Movie) =>
  (m.release_date || m.first_air_date || '').split('-')[0] || ''

export const rating1 = (vote: number | undefined | null) =>
  vote ? vote.toFixed(1) : '—'

/** Media type real de un item (los resultados multi traen media_type) */
export const itemMediaType = (m: Movie, fallback: MediaType = 'movie'): MediaType =>
  m.media_type === 'tv' || m.media_type === 'movie' ? m.media_type : fallback

export const ANIMATION_GENRE_ID = 16

export const isAnime = (m: Movie) => (m.genre_ids || []).includes(ANIMATION_GENRE_ID)

export function formatRuntime(minutes?: number | null): string {
  if (!minutes) return ''
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

/** Formatea una fecha ISO ("2023-05-04") en formato legible localizado —
 * antes se mostraba la fecha cruda como fallback cuando faltaba runtime. */
export function formatDate(isoDate?: string | null): string {
  if (!isoDate) return ''
  const d = new Date(isoDate)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) seconds = 0
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m)
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}
