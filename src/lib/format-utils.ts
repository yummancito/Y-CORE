// ============================================================================
// src/lib/format-utils.ts
// ----------------------------------------------------------------------------
// Utilidades de formateo para la UI de descargas.
// ============================================================================

/**
 * Formatea bytes en representación legible: B, KB, MB, GB, TB.
 */
export function formatBytes(bytes: number | undefined | null): string {
  if (!bytes || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

/**
 * Formatea velocidad (bytes/seg) en representación legible.
 */
export function formatSpeed(bps: number | undefined | null): string {
  if (!bps || bps <= 0) return '—'
  return `${formatBytes(bps)}/s`
}

/**
 * Formatea ETA (segundos) en representación legible.
 */
export function formatEta(seconds: number | undefined | null): string {
  if (seconds == null || seconds < 0) return '—'
  if (seconds < 60) return `${Math.round(seconds)}s`
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return `${m}m ${s}s`
}

/**
 * Formatea duración en segundos a formato legible (ej: "1h 23m 45s").
 */
export function formatDuration(seconds: number | undefined | null): string {
  if (!seconds || seconds < 0) return '—'
  if (seconds < 60) return `${Math.round(seconds)}s`
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  if (m < 60) return `${m}m ${s}s`
  const h = Math.floor(m / 60)
  return `${h}h ${m % 60}m`
}
