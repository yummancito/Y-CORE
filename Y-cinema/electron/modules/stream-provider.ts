// stream-provider.ts — Motor de streaming directo HTTP con @movie-web/providers
// Reemplaza a TorrentEngine para arranque instantáneo (2-4 segundos)

import type {
  ProviderControls,
  RunOutput,
  ScrapeMedia,
  Stream,
} from '@movie-web/providers'

export interface StreamResult {
  streamUrl: string // URL del .m3u8 (hls) o .mp4 (file)
  type: 'hls' | 'file' // tipo de stream, para que el player elija cómo cargarlo
  subtitles: Array<{
    // Subtítulos disponibles
    url: string
    lang: string
  }>
  source: string // Nombre del proveedor (ej: "flixhq", "vidsrc")
  quality: string // 720p, 1080p, etc
  headers?: Record<string, string> // headers requeridos por algunos proveedores
}

export interface StreamLog {
  time: number // timestamp
  level: 'info' | 'warn' | 'error'
  message: string
  meta?: Record<string, unknown>
}

export interface ProviderTestResult {
  providerId: string
  name: string
  success: boolean
  error?: string
  timing: number // ms
  streamUrl?: string
}

const MAX_LOGS = 300
const FAILURE_THRESHOLD = 3 // fallos seguidos antes de "enfriar" un provider
const COOLDOWN_MS = 5 * 60 * 1000 // 5 minutos

// El fetch global de Node (undici) valida el AbortSignal de forma estricta y
// rechaza el que inyecta @movie-web/providers → "Expected signal to be an
// instance of AbortSignal", lo que hacía fallar casi todos los providers.
// Este wrapper descarta el signal problemático (perdemos el timeout interno del
// provider, pero el runner ya corre en paralelo con su propia orquestación).
const nodeFetch = (url: string, opts?: Record<string, unknown>): Promise<Response> => {
  if (opts && 'signal' in opts) {
    const { signal, ...rest } = opts
    void signal
    return fetch(url, rest as RequestInit)
  }
  return fetch(url, opts as RequestInit | undefined)
}

export class StreamProvider {
  private providersPromise: Promise<ProviderControls> | null = null
  private logs: StreamLog[] = []

  // Rate limiting: providers que fallan repetido se saltan por un rato
  private failures: Map<string, number> = new Map()
  private cooldownUntil: Map<string, number> = new Map()

  // ─── Logging ──────────────────────────────────────────────────

  private log(level: StreamLog['level'], message: string, meta?: Record<string, unknown>) {
    const entry: StreamLog = { time: Date.now(), level, message, meta }
    this.logs.push(entry)
    if (this.logs.length > MAX_LOGS) this.logs.shift()
    // Espejo a la consola de Electron para debug en vivo
    const tag = '[StreamProvider]'
    const line = meta ? `${tag} ${message} ${JSON.stringify(meta)}` : `${tag} ${message}`
    if (level === 'error') console.error(line)
    else if (level === 'warn') console.warn(line)
    else console.log(line)
  }

  getLogs(limit = 100): StreamLog[] {
    return this.logs.slice(-limit)
  }

  clearLogs(): void {
    this.logs = []
  }

  // ─── Init ─────────────────────────────────────────────────────

  private getProviders(): Promise<ProviderControls> {
    if (!this.providersPromise) {
      // @movie-web/providers es ESM-only para `import`; desde el build CommonJS
      // hay que cargarlo con import() dinámico (new Function evita que tsc lo
      // transpile a require())
      const dynamicImport = new Function('s', 'return import(s)') as (
        s: string
      ) => Promise<typeof import('@movie-web/providers')>

      this.providersPromise = dynamicImport('@movie-web/providers').then((mod) =>
        mod.makeProviders({
          fetcher: mod.makeStandardFetcher(nodeFetch as unknown as Parameters<typeof mod.makeStandardFetcher>[0]),
          target: mod.targets.NATIVE,
        })
      )
    }
    return this.providersPromise
  }

  private buildMedia(
    tmdbId: string | number,
    title: string,
    year: number | undefined,
    type: 'movie' | 'show',
    show?: { season: number; episode: number },
    imdbId?: string
  ): ScrapeMedia {
    // Varios providers (primewire y otros) requieren imdbId además del tmdbId;
    // sin él fallan con "No imdbId provided"
    const imdb = imdbId ? { imdbId } : {}
    if (type === 'show' && show) {
      return {
        type: 'show',
        title,
        releaseYear: year || 0,
        tmdbId: String(tmdbId),
        ...imdb,
        season: { number: show.season, tmdbId: String(tmdbId) },
        episode: { number: show.episode, tmdbId: String(tmdbId) },
      }
    }
    return { type: 'movie', title, releaseYear: year || 0, tmdbId: String(tmdbId), ...imdb }
  }

  // ─── Rate limiting ────────────────────────────────────────────

  private isCoolingDown(id: string): boolean {
    const until = this.cooldownUntil.get(id)
    return until !== undefined && Date.now() < until
  }

  private recordFailure(id: string) {
    const count = (this.failures.get(id) || 0) + 1
    this.failures.set(id, count)
    if (count >= FAILURE_THRESHOLD) {
      this.cooldownUntil.set(id, Date.now() + COOLDOWN_MS)
      this.log('warn', `provider "${id}" en cooldown ${COOLDOWN_MS / 60000}min tras ${count} fallos`)
    }
  }

  private recordSuccess(id: string) {
    this.failures.delete(id)
    this.cooldownUntil.delete(id)
  }

  // ─── Búsqueda principal ───────────────────────────────────────

  /**
   * Busca un stream directo para una película/serie.
   * Requiere el tmdbId (los proveedores lo usan para localizar el contenido);
   * title + year se pasan para el matching.
   */
  async search(
    tmdbId: string | number,
    title: string,
    year?: number,
    type: 'movie' | 'show' = 'movie',
    show?: { season: number; episode: number },
    imdbId?: string
  ): Promise<StreamResult | null> {
    const started = Date.now()
    this.log('info', `buscando "${title}" (${year ?? '?'})`, { tmdbId, imdbId, type })

    const result = await this.runWithMedia(
      this.buildMedia(tmdbId, title, year, type, show, imdbId),
      title
    )

    if (result) {
      this.log('info', `✓ stream encontrado para "${title}" vía ${result.source}`, {
        quality: result.quality,
        ms: Date.now() - started,
      })
      return result
    }

    this.log('warn', `✗ runAll no encontró stream para "${title}", probando fallback`, {
      ms: Date.now() - started,
    })
    return this.searchFallback(title, year, tmdbId, type, show, imdbId)
  }

  /** Corre runAll para un ScrapeMedia dado, con eventos que alimentan los logs */
  private async runWithMedia(media: ScrapeMedia, label: string): Promise<StreamResult | null> {
    try {
      const providers = await this.getProviders()

      // Ordenar dejando fuera los que están en cooldown (van al final)
      const allSources = providers.listSources().map((s) => s.id)
      const active = allSources.filter((id) => !this.isCoolingDown(id))
      const cooling = allSources.filter((id) => this.isCoolingDown(id))
      if (cooling.length) {
        this.log('info', `${cooling.length} provider(s) en cooldown, se saltan`, { cooling })
      }

      const output: RunOutput | null = await providers.runAll({
        media,
        sourceOrder: [...active, ...cooling],
        events: {
          start: (id) => this.log('info', `→ intentando provider "${id}" para "${label}"`),
          update: (evt) => {
            if (evt.status === 'failure' || evt.status === 'notfound') {
              this.recordFailure(evt.id)
              this.log('warn', `provider "${evt.id}" ${evt.status} para "${label}"`, {
                reason: evt.reason,
                error: evt.error ? String(evt.error) : undefined,
              })
            } else if (evt.status === 'success') {
              this.recordSuccess(evt.id)
            }
          },
        },
      })

      if (!output?.stream) return null
      const resolved = this.resolveStream(output.stream)
      if (!resolved) {
        this.log('warn', `provider "${output.sourceId}" devolvió stream sin URL usable`, {
          streamType: output.stream.type,
        })
        return null
      }

      return {
        streamUrl: resolved.url,
        type: resolved.type,
        subtitles: (output.stream.captions || []).map((cap) => ({
          url: cap.url,
          lang: cap.language || 'Unknown',
        })),
        source: output.sourceId || 'unknown',
        quality: resolved.quality,
        headers: output.stream.headers || output.stream.preferredHeaders,
      }
    } catch (err) {
      this.log('error', `runAll lanzó excepción para "${label}"`, { error: String(err) })
      return null
    }
  }

  // ─── Fallback multi-enfoque ───────────────────────────────────

  /**
   * Fallback: si la búsqueda directa no encuentra nada, prueba variaciones —
   * año ±1 y sin año — que suelen desbloquear coincidencias cuando el año de
   * TMDB no coincide exactamente con el de las fuentes.
   */
  async searchFallback(
    title: string,
    year?: number,
    tmdbId: string | number = 0,
    type: 'movie' | 'show' = 'movie',
    show?: { season: number; episode: number },
    imdbId?: string
  ): Promise<StreamResult | null> {
    this.log('info', `fallback: probando variaciones de año para "${title}"`)

    // Variaciones de año a probar (en orden). Sin año primero suele ser el
    // más permisivo; luego ±1 por desfases de fecha de estreno.
    const yearVariants: Array<number | undefined> = [undefined]
    if (year) {
      yearVariants.push(year - 1, year + 1)
    }

    for (const y of yearVariants) {
      const started = Date.now()
      const result = await this.runWithMedia(
        this.buildMedia(tmdbId, title, y, type, show, imdbId),
        `${title} [año=${y ?? 'sin año'}]`
      )
      if (result) {
        this.log('info', `✓ fallback funcionó con año=${y ?? 'sin año'} para "${title}"`, {
          source: result.source,
          ms: Date.now() - started,
        })
        return result
      }
    }

    this.log('error', `✗ ningún enfoque encontró stream para "${title}"`, { tmdbId, year })
    return null
  }

  // ─── Diagnóstico: probar provider por provider ────────────────

  /**
   * Recorre cada source individualmente y reporta cuáles encontraron stream y
   * cuáles fallaron (con error y tiempo). Sirve para debuggear por qué una
   * película específica no aparece disponible.
   */
  async testSingleProvider(
    tmdbId: number | string,
    title: string,
    year?: number,
    type: 'movie' | 'show' = 'movie',
    show?: { season: number; episode: number },
    imdbId?: string
  ): Promise<ProviderTestResult[]> {
    this.log('info', `test provider-por-provider para "${title}"`, { tmdbId, imdbId })
    const providers = await this.getProviders()
    const media = this.buildMedia(tmdbId, title, year, type, show, imdbId)
    const sources = providers.listSources()
    const results: ProviderTestResult[] = []

    for (const source of sources) {
      const started = Date.now()
      try {
        const output = await providers.runSourceScraper({ id: source.id, media })
        const stream = output.stream?.[0]
        const resolved = stream ? this.resolveStream(stream) : null
        const success = !!resolved
        results.push({
          providerId: source.id,
          name: source.name,
          success,
          timing: Date.now() - started,
          streamUrl: resolved?.url,
          error: success ? undefined : output.embeds?.length ? 'solo embeds (sin stream directo)' : 'sin stream',
        })
        this.log(success ? 'info' : 'warn', `test "${source.id}": ${success ? 'OK' : 'sin stream'}`, {
          ms: Date.now() - started,
        })
      } catch (err) {
        results.push({
          providerId: source.id,
          name: source.name,
          success: false,
          timing: Date.now() - started,
          error: String(err),
        })
        this.log('warn', `test "${source.id}": error`, {
          error: String(err),
          ms: Date.now() - started,
        })
      }
    }

    return results
  }

  // ─── Helpers ──────────────────────────────────────────────────

  /** Extrae URL, tipo y calidad de un Stream (file → mejor calidad; hls → playlist) */
  private resolveStream(
    stream: Stream
  ): { url: string; type: 'hls' | 'file'; quality: string } | null {
    if (stream.type === 'hls') {
      return { url: stream.playlist, type: 'hls', quality: 'HD' }
    }

    // FileBasedStream: elegir la mejor calidad disponible
    const order: Array<'4k' | '1080' | '720' | '480' | '360' | 'unknown'> = [
      '4k',
      '1080',
      '720',
      '480',
      '360',
      'unknown',
    ]
    for (const q of order) {
      const file = stream.qualities[q]
      if (file?.url) {
        return { url: file.url, type: 'file', quality: this.qualityLabel(q) }
      }
    }
    return null
  }

  private qualityLabel(q: string): string {
    if (q === '4k') return '4K'
    if (q === 'unknown') return 'HD'
    return `${q}p`
  }
}
