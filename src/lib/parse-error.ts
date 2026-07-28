import { t, tf } from './i18n'
import { translateError } from './error-translator'

/**
 * Helper único para TODA la UI que muestra mensajes de error al usuario.
 *
 * Resuelve cuatro casos que devuelve el backend hoy:
 *
 *  1. **i18n key** (`'errors.steam.stillRunning'`) → `t(key)`, o `tf()` con
 *     params si la key tiene `{status}` para sustituir.
 *  2. **JSON envelope** (`'{"k":"errors.api.httpRequest","p":{"status":500},"t":"HTTP 500"}'`)
 *     → desempaqueta `k` y `p`, llama `tf(k, p)`. Es lo que usa
 *     `src/lib/y-core-api.ts` para preservar el status code del response.
 *  3. **raw English/Spanish literal legacy** (`'Steam is still running...'`)
 *     → intenta `translateError()` regex → i18n key → `t()`. Si no
 *     matchea, usa el fallback localizado (NUNCA muestra el raw al usuario).
 *  4. **`undefined` / string vacío** → `tf(fallbackKey)` con los params
 *     que el caller pasó.
 *
 * Forma antigua de usar:
 *     showToast('error', result.error || 'library.launchFailed')
 * Forma nueva:
 *     showToast('error', parseError(result.error, 'library.launchFailed'))
 */
export function parseError(
  err: string | Error | null | undefined,
  fallbackKey = 'errors.generic',
  params?: Record<string, string | number>,
): string {
  const fmt = (key: string) => (params ? tf(key, params) : t(key))
  if (err instanceof Error) return fromString(err.message, fmt, fallbackKey)
  return fromString(typeof err === 'string' ? err : '', fmt, fallbackKey)
}

// ---- internals ----

function fromString(
  raw: string,
  fmt: (key: string) => string,
  fallbackKey: string,
): string {
  const trimmed = raw.trim()
  if (!trimmed) return fmt(fallbackKey)
  if (isI18nKey(trimmed)) return fmt(trimmed)
  if (trimmed.startsWith('{')) {
    const env = tryParseEnvelope(trimmed)
    if (env) return tf(env.k, env.p)
  }
  const mapped = translateError(trimmed)
  if (mapped) return fmt(mapped)
  return fmt(fallbackKey)
}

function tryParseEnvelope(s: string): { k: string; p: Record<string, string | number>; t?: string } | null {
  try {
    const env = JSON.parse(s)
    if (env && typeof env.k === 'string' && isI18nKey(env.k)) {
      return {
        k: env.k,
        p: (env.p && typeof env.p === 'object') ? env.p : {},
        t: typeof env.t === 'string' ? env.t : undefined,
      }
    }
  } catch {
    // No era JSON → no es envelope
  }
  return null
}

function isI18nKey(s: string): boolean {
  return /^[a-z]+\.[a-z]+(\.[a-zA-Z0-9_]+)+$/.test(s)
}

// ---------------------------------------------------------------------------
// Missing-depot-ids extraction (H1.7 fix)
// ---------------------------------------------------------------------------
// El backend devuelve mensajes como
//   "Missing depot keys for: 946430, 971924, 971925, ..."
// cuando el catalog de la API sólo cubre parte de los depots del juego (caso
// Among Us con sus DLC/OST). Steam nos prohíbe scrapear esos depots nosotros
// (nos banean), así que NUNCA pretendemos tener claves que no tenemos —
// pero sí le decimos al usuario exactamente qué IDs faltan y dónde
// conseguirlos (depotbox.org). Única fuente de verdad para la UI.
export function extractMissingDepotIds(errString: string | null | undefined): number[] {
  if (!errString) return []
  // Capturamos hasta `.`/final para no comernos frases posteriores
  // ("Steam cannot decrypt…"); el lookahead `(?=…)` evita trim artesanal
  // y los filtros enteros rechazan decimales accidentales como "1579150. X".
  const re = /Missing depo[ts] keys for:\s*([0-9][0-9,\s]*?)(?=\.\s|\n|$)/i
  const m = errString.match(re)
  if (!m) return []
  return m[1]
    .split(',')
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => Number.isInteger(n) && Number.isSafeInteger(n) && n > 0)
}

export function buildDepotboxLinks(depotIds: number[]): string {
  return depotIds.map((id) => `https://depotbox.org/depot/${id}`).join(', ')
}
