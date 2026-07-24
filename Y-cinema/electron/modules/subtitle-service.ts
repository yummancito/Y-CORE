// subtitle-service.ts — Búsqueda y selección automática de subtítulos (Fase 5)
// Orquesta el SubtitleEngine existente + preferencias de idioma. Elige el
// idioma preferido, hace matching por temporada/episodio para series y cachea
// resultados para no re-consultar OpenSubtitles en cada reproducción.
//
// Los subtítulos de OpenSubtitles SE PROXYAN a través del backend local
// (http://localhost:3456/proxy-subs/) para evitar problemas de CORS y
// autenticación. El frontend solo ve URLs locales.

import type { SubtitleEngine, SubtitleInfo } from './subtitles'
import type { LanguagePreferencesStore } from './language-preferences'

export interface ResolvedSubtitle {
  name: string
  url: string
  lang: string
  format: string
  /** true si coincide con el idioma preferido del usuario */
  preferred: boolean
  /** de dónde salió: pista embebida del torrent vs. OpenSubtitles */
  origin: 'local' | 'opensubtitles'
}

export interface SubtitleResult {
  tracks: ResolvedSubtitle[]
  /** índice de la pista a activar por defecto, o null si no auto-seleccionar */
  autoIndex: number | null
  /** preferencias vigentes al momento de la búsqueda (para la UI) */
  preferredLang: string
  autoEnabled: boolean
}

interface CacheEntry {
  time: number
  result: SubtitleResult
}

const CACHE_TTL_MS = 60 * 60 * 1000 // 1 hora

// Detección de idioma legible desde el nombre/lang de una pista, para la UI
const LANG_PATTERNS: Array<{ label: string; patterns: string[] }> = [
  { label: 'Español', patterns: ['spanish', 'español', 'espanol', 'castellano', 'latino', 'spa', '.es', 'es-'] },
  { label: 'Inglés', patterns: ['english', 'ingles', 'inglés', 'eng', '.en', 'en-'] },
  { label: 'Francés', patterns: ['french', 'français', 'francais', 'fra', 'fre', '.fr'] },
  { label: 'Alemán', patterns: ['german', 'deutsch', 'alemán', 'aleman', 'ger', 'deu', '.de'] },
  { label: 'Portugués', patterns: ['portuguese', 'português', 'portugues', 'por', 'brasil', '.pt', '.br'] },
  { label: 'Italiano', patterns: ['italian', 'italiano', 'ita', '.it'] },
  { label: 'Japonés', patterns: ['japanese', 'japonés', 'japones', 'jpn', '日本語', '.jp'] },
]

export function detectLanguageLabel(name: string, lang: string): string {
  const hay = `${name} ${lang}`.toLowerCase()
  for (const { label, patterns } of LANG_PATTERNS) {
    if (patterns.some((p) => hay.includes(p))) return label
  }
  return lang || 'Otro'
}

export class SubtitleService {
  private cache = new Map<string, CacheEntry>()
  private proxyPort: number = 3456

  constructor(
    private engine: SubtitleEngine,
    private langPrefs: LanguagePreferencesStore
  ) {}

  private cacheKey(title: string, year?: number, season?: number, episode?: number): string {
    return `${title.toLowerCase()}|${year || ''}|${season ?? ''}|${episode ?? ''}`
  }

  /**
   * Busca subtítulos para un título, aplicando el idioma preferido. Para series,
   * incluye temporada/episodio en la query para el matching correcto.
   */
  async findSubtitles(
    title: string,
    opts: {
      year?: number
      season?: number
      episode?: number
      infoHash?: string
      tmdbId?: number
      mediaType?: 'movie' | 'episode'
    } = {}
  ): Promise<SubtitleResult> {
    const key = this.cacheKey(title, opts.year, opts.season, opts.episode)
    const cached = this.cache.get(key)
    if (cached && Date.now() - cached.time < CACHE_TTL_MS) {
      console.log(`[Subtitles] cache hit para "${title}"`)
      return cached.result
    }

    const prefs = this.langPrefs.get()
    const subLang = prefs.subtitles
    console.log(
      `[Subtitles] buscando para "${title}" | pref=${subLang} auto=${prefs.autoSubtitles}`
    )

    // Query con S/E para series (mejora el matching en OpenSubtitles)
    const query =
      opts.season != null && opts.episode != null
        ? `${title} S${String(opts.season).padStart(2, '0')}E${String(opts.episode).padStart(2, '0')}`
        : title

    // ── Prioridad: locales (torrent) > OpenSubtitles ──────────────
    const local: SubtitleInfo[] = []
    const external: SubtitleInfo[] = []

    // 1) Subtítulos embebidos en el torrent
    if (opts.infoHash) {
      try {
        const fromTorrent = await this.engine.getFromTorrent(opts.infoHash)
        if (Array.isArray(fromTorrent)) local.push(...fromTorrent)
        console.log(`[Subtitles] locales del torrent: ${local.length}`)
      } catch {
        console.warn('[Subtitles] no se pudieron leer subtítulos del torrent')
      }
    }

    // 2) OpenSubtitles (solo si el usuario no eligió "ninguno")
    if (subLang !== 'none') {
      try {
        const lang = subLang // 'es' | 'en'
        const osOpts = {
          tmdbId: opts.tmdbId,
          mediaType: opts.mediaType,
          season: opts.season,
          episode: opts.episode,
        }
        const primary = await this.engine.searchOpenSubtitles(query, opts.year, lang, osOpts)
        console.log(`[OpenSubtitles] "${query}" lang=${lang} → ${primary.length} resultados`)
        // Proxy: convertir URLs (os:file_id:N) a locales para evitar CORS
        const proxied = primary.map((s) => ({
          ...s,
          url: s.url ? `http://localhost:${this.proxyPort}/proxy-subs/${encodeURIComponent(s.url)}` : '',
        })).filter((s) => s.url)
        external.push(...proxied)
        if (proxied.length === 0 && lang !== 'en') {
          const fallback = await this.engine.searchOpenSubtitles(query, opts.year, 'en', osOpts)
          console.log(`[OpenSubtitles] fallback lang=en → ${fallback.length} resultados`)
          const fallbackProxied = fallback.map((s) => ({
            ...s,
            url: s.url ? `http://localhost:${this.proxyPort}/proxy-subs/${encodeURIComponent(s.url)}` : '',
          })).filter((s) => s.url)
          external.push(...fallbackProxied)
        }
      } catch {
        console.warn('[OpenSubtitles] la búsqueda falló (¿API key configurada?)')
      }
    } else {
      console.log('[Subtitles] preferencia = ninguno → no se consulta OpenSubtitles')
    }

    const matchers = this.langPrefs.getSubtitleMatchers()
    const ranked = this.rankAndDedupe(local, external, matchers)

    // ── Filtrar basura de OpenSubtitles ────────────────────────────
    // OpenSubtitles a veces devuelve resultados que no tienen NADA que ver
    // con la búsqueda (coincidencia solo de idioma). Los locales (del torrent)
    // siempre se conservan; los externos solo si al menos una palabra del
    // título buscado aparece en el nombre del subtítulo. Esto evita mandar
    // decenas de pistas irrelevantes al frontend (que las descarga todas de
    // golpe vía proxy y dispara rate-limit 429 en OpenSubtitles).
    const queryWords = query.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2)
    const tracks = ranked.filter((t) => {
      if (t.origin === 'local') return true
      if (queryWords.length === 0) return true
      const name = t.name.toLowerCase()
      return queryWords.some((w) => name.includes(w))
    })
    if (ranked.length !== tracks.length) {
      console.log(
        `[Subtitles] ⚠ descartados ${ranked.length - tracks.length}/${ranked.length} resultados irrelevantes de OpenSubtitles para "${query}"`
      )
    }

    // ── Auto-selección (Tarea 4) ──────────────────────────────────
    let autoIndex: number | null = null
    if (prefs.autoSubtitles && subLang !== 'none' && tracks.length > 0) {
      // Ya filtramos por relevancia de título; entre lo que queda, preferir
      // idioma preferido y mayor coincidencia de palabras del título
      const scored = tracks.map((t, i) => {
        const name = t.name.toLowerCase()
        const matches = queryWords.filter((w) => name.includes(w)).length
        const matchRatio = queryWords.length > 0 ? matches / queryWords.length : 0
        return { index: i, score: (t.preferred ? 10 : 0) + matchRatio * 5 }
      })
      scored.sort((a, b) => b.score - a.score)
      autoIndex = scored[0]?.index ?? null

      if (autoIndex !== null) {
        const chosen = tracks[autoIndex]
        console.log(
          `[Subtitles] auto-selección → "${chosen.name}" (${chosen.lang}, ${chosen.origin}) [score=${scored[0].score.toFixed(1)}]`
        )
      }
    } else {
      console.log(
        `[Subtitles] sin auto-selección (auto=${prefs.autoSubtitles}, pref=${subLang}, pistas=${tracks.length})`
      )
    }

    const result: SubtitleResult = {
      tracks,
      autoIndex,
      preferredLang: subLang,
      autoEnabled: prefs.autoSubtitles,
    }
    this.cache.set(key, { time: Date.now(), result })
    console.log(`[Subtitles] "${query}" → ${tracks.length} pistas totales`)
    return result
  }

  /** Deduplica por URL, marca origen/preferido, ordena (locales+preferidos primero) */
  private rankAndDedupe(
    local: SubtitleInfo[],
    external: SubtitleInfo[],
    matchers: string[]
  ): ResolvedSubtitle[] {
    const seen = new Set<string>()
    const out: ResolvedSubtitle[] = []

    const add = (subs: SubtitleInfo[], origin: 'local' | 'opensubtitles') => {
      for (const s of subs) {
        if (!s.url || seen.has(s.url)) continue
        seen.add(s.url)
        const hay = `${s.name} ${s.lang}`.toLowerCase()
        const preferred = matchers.length > 0 && matchers.some((m) => hay.includes(m))
        out.push({
          name: s.name,
          url: s.url,
          lang: s.lang,
          format: s.format || 'srt',
          preferred,
          origin,
        })
      }
    }

    add(local, 'local')
    add(external, 'opensubtitles')

    // Orden: preferido primero; a igualdad, local antes que OpenSubtitles
    out.sort((a, b) => {
      if (a.preferred !== b.preferred) return Number(b.preferred) - Number(a.preferred)
      if (a.origin !== b.origin) return a.origin === 'local' ? -1 : 1
      return 0
    })
    return out
  }

  clearCache(): void {
    this.cache.clear()
  }
}
