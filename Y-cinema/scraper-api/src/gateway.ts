import { ScraperInterface } from './scrapers/base'
import { ScraperCache } from './cache'
import { SearchResult, SearchResponse, StreamResult, StreamResponse, SourceStatus } from './types'
import { CometaScraper } from './scrapers/cometa'
import { GNULA_URL } from './scrapers/gnula'
import { CUEVANA_URL } from './scrapers/cuevana'
import { assertKnownOrigin } from './url-guard'

// Whitelist estricta: el detailUrl que el cliente manda a /api/stream debe
// pertenecer al origen propio del source declarado — cierra el SSRF de
// navegar (Playwright) o fetchear (axios) una URL arbitraria controlada por
// quien llame al endpoint.
const ALLOWED_STREAM_ORIGINS: Record<string, string> = {
  gnula: GNULA_URL,
  cuevana: CUEVANA_URL,
}

// Interfaz extendida para scrapers que soportan resolución de stream
export interface StreamResolver {
  readonly config: { id: string; name: string }
  resolveStream(detailUrl: string): Promise<{ url: string; type: string; quality: string } | null>
}

/**
 * Peso de cada idioma en el ranking.
 * Los idiomas con mayor peso aparecen primero en los resultados.
 */
const LANG_WEIGHTS: Record<string, number> = {
  latino: 500,
  castellano: 400,
  portugues: 300,
  'portugues-br': 300,
  french: 250,
  german: 250,
  italian: 200,
  japanese: 200,
  korean: 150,
  chinese: 150,
  russian: 100,
  hindi: 100,
  arabic: 80,
  turkish: 80,
  dutch: 60,
  polish: 60,
  swedish: 60,
  english: 50,
}

/** Hace que una promesa rechace tras `ms` si no resolvió antes. Reutilizado
 * por search() (por scraper) y resolveStream() (que antes no tenía ningún
 * corte propio y dependía enteramente de timeouts internos de Playwright/
 * axios, pudiendo acercarse a ~70s en el peor caso encadenado). */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const result = Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Timeout ${ms}ms`)), ms)
    }),
  ])
  result.finally(() => clearTimeout(timer))
  return result
}

const RESOLVE_STREAM_TIMEOUT = 35000 // 35s — nav (30s) + margen de red del embed

export class SearchGateway {
  private scrapers: ScraperInterface[] = []
  private streamResolvers: Map<string, StreamResolver> = new Map()
  private cometa: CometaScraper | null = null

  constructor(
    private cache: ScraperCache
  ) {}

  register(scraper: ScraperInterface): void {
    this.scrapers.push(scraper)
    console.log(`[Gateway] Scraper registrado: ${scraper.config.name} (${scraper.config.enabled ? 'on' : 'off'})`)

    if (typeof (scraper as any).resolveStream === 'function') {
      this.streamResolvers.set(scraper.config.id, scraper as unknown as StreamResolver)
      console.log(`[Gateway]   → también resuelve streams`)
    }
    if (scraper instanceof CometaScraper) {
      this.cometa = scraper
    }
  }

  /**
   * Busca en todos los scrapers habilitados en paralelo.
   * @param query Término de búsqueda
   * @param year Año opcional
   * @param lang Filtrar/priorizar por idioma: "latino", "castellano", "english", "french", etc.
   * @param imdbId Si está disponible, se usa para consultar Cometa (protocolo
   *   Stremio) en paralelo — busca por id, no por texto, y complementa a los
   *   scrapers normales sin depender de que su búsqueda por título encuentre algo.
   */
  async search(
    query: string,
    year?: number,
    lang?: string,
    imdbId?: string,
    show?: { season: number; episode: number }
  ): Promise<SearchResponse> {
    const start = Date.now()
    const cacheKey = `search:${query.toLowerCase()}:${year || ''}:${lang || ''}:${imdbId || ''}:${show ? `${show.season}x${show.episode}` : ''}`

    const cached = this.cache.get<SearchResponse>(cacheKey)
    if (cached) {
      console.log(`[Gateway] Cache hit para "${query}"`)
      return { ...cached, cached: true }
    }

    // Cometa no busca por texto (solo por imdbId) — se corre aparte con
    // searchByImdb, pero DENTRO del mismo Promise.allSettled que el resto de
    // scrapers para que corran en paralelo. Antes se esperaba a que TODO el
    // resto de scrapers terminara (hasta SCRAPER_TIMEOUT) y solo DESPUÉS
    // arrancaba Cometa (otros hasta SCRAPER_TIMEOUT más) — en el peor caso el
    // total llegaba a ~50s, superando el timeout de 30s del cliente Electron,
    // que se rendía antes de que el gateway terminara de trabajar.
    const active = this.scrapers.filter((s) => s.config.enabled && !(s instanceof CometaScraper))
    let sourcesTried = 0
    let sourcesSucceeded = 0

    // Timeout individual por scraper: Playwright (Gnula/Cuevana) puede tardar
    // 15-30s en la primera ejecución. No queremos que bloqueen al resto.
    const SCRAPER_TIMEOUT = 25000 // 25s por scraper

    const tasks: Array<Promise<SearchResult[]>> = active.map(async (scraper) => {
      sourcesTried++
      try {
        const results = await withTimeout(scraper.search(query, year), SCRAPER_TIMEOUT)
        if (results.length > 0) sourcesSucceeded++
        return results
      } catch (err) {
        console.warn(`[Gateway] "${scraper.config.name}" falló: ${(err as Error).message}`)
        return [] as SearchResult[]
      }
    })

    if (this.cometa && imdbId) {
      sourcesTried++
      // searchByImdb ya atrapa sus propios errores internamente y siempre
      // resuelve con un array (nunca rechaza) — no hace falta try/catch aquí.
      tasks.push(
        withTimeout(
          this.cometa.searchByImdb(imdbId, query, show ? 'series' : 'movie', show?.season, show?.episode),
          SCRAPER_TIMEOUT
        )
          .then((results) => {
            if (results.length > 0) sourcesSucceeded++
            return results
          })
          .catch((err) => {
            console.warn(`[Gateway] "Cometa" falló: ${(err as Error).message}`)
            return [] as SearchResult[]
          })
      )
    }

    const settled = await Promise.allSettled(tasks)

    const allResults: SearchResult[] = []
    for (const result of settled) {
      if (result.status === 'fulfilled') {
        allResults.push(...result.value)
      }
    }

    const ranked = this.rankResults(allResults, lang, year)
    const timing = Date.now() - start

    const response: SearchResponse = {
      query,
      year,
      results: ranked,
      total: ranked.length,
      cached: false,
      sourcesTried,
      sourcesSucceeded,
      timing,
    }

    console.log(`[Gateway] "${query}" → ${ranked.length} resultados en ${timing}ms (${sourcesSucceeded}/${sourcesTried} fuentes)${lang ? ` | filtro: ${lang}` : ''}`)
    // Igualado al TTL de cada scraper individual (10 min) — si el compuesto
    // vivía más (30 min como antes), "expiraba" primero pero igual pegaba
    // contra el caché interno de cada fuente con seeders ya desactualizados.
    this.cache.set(cacheKey, response, 10 * 60 * 1000)

    return response
  }

  async resolveStream(source: string, detailUrl: string): Promise<StreamResponse> {
    const start = Date.now()

    const resolver = this.streamResolvers.get(source)
    if (!resolver) {
      return {
        success: false,
        error: `Fuente "${source}" no soporta resolución de stream`,
        timing: Date.now() - start,
      }
    }

    // Bloquear SSRF: detailUrl debe pertenecer al dominio propio del source,
    // no a un host arbitrario elegido por quien llama a /api/stream.
    const allowedOrigin = ALLOWED_STREAM_ORIGINS[source]
    if (allowedOrigin) {
      try {
        assertKnownOrigin(detailUrl, allowedOrigin)
      } catch (err) {
        return {
          success: false,
          error: `URL no permitida para "${source}": ${(err as Error).message}`,
          timing: Date.now() - start,
        }
      }
    }

    try {
      const result = await withTimeout(resolver.resolveStream(detailUrl), RESOLVE_STREAM_TIMEOUT)
      if (!result) {
        return {
          success: false,
          error: `No se pudo resolver el stream desde ${source}`,
          timing: Date.now() - start,
        }
      }

      const stream: StreamResult = {
        url: result.url,
        type: result.type as 'hls' | 'mp4',
        quality: result.quality,
        source,
        sourceName: resolver.config.name,
      }

      console.log(`[Gateway] Stream resuelto: ${source} → ${stream.url.slice(0, 80)}... (${stream.type}, ${stream.quality})`)
      return {
        success: true,
        stream,
        timing: Date.now() - start,
      }
    } catch (err) {
      return {
        success: false,
        error: `Error resolviendo stream: ${(err as Error).message}`,
        timing: Date.now() - start,
      }
    }
  }

  getSourcesStatus(): (Pick<SourceStatus, 'id' | 'name' | 'enabled'> & { hasStream: boolean })[] {
    return this.scrapers.map((s) => ({
      id: s.config.id,
      name: s.config.name,
      enabled: s.config.enabled,
      hasStream: this.streamResolvers.has(s.config.id),
    }))
  }

  /**
   * Ranking con soporte multi-idioma.
   * Si se especifica lang, los resultados en ese idioma tienen prioridad absoluta.
   */
  private rankResults(results: SearchResult[], preferredLang?: string, searchYear?: number): SearchResult[] {
    for (const r of results) {
      let score = 0

      // Seeders
      score += Math.min(r.seeders, 500) * 2
      if (r.seeders > 50) score += 200
      if (r.seeders < 5) score -= 300

      // Streaming directo
      if (r.webFriendly) score += 500
      if (r.magnet && r.webFriendly) score += 300

      // Ranking por idioma: si hay preferencia, el idioma exacto gana mucho peso
      if (preferredLang) {
        // Si el resultado contiene el idioma preferido, peso extra grande
        if (r.audioLang.includes(preferredLang)) {
          score += 1000
        } else {
          // Penalizar resultados que NO están en el idioma preferido
          score -= 200
        }
      }

      // Pesos de idioma generales (sin preferencia o además de preferencia)
      for (const audio of r.audioLang) {
        const w = LANG_WEIGHTS[audio]
        if (w) score += w
      }

      // Calidad
      if (r.quality === '1080p') score += 150
      if (r.quality === '720p') score += 80
      if (r.quality === '4K') score += 50

      // Tamaño
      const gb = this.sizeToGB(r.size)
      if (gb > 0) {
        if (gb < 2) score += 100
        else if (gb < 4) score += 40
        else if (gb > 8) score -= 100
        else if (gb > 15) score -= 300
      }

      // Desajuste de año vs el buscado: penaliza en vez de excluir (remaster,
      // estreno regional distinto al que usa TMDB, etc. son casos legítimos).
      // Tope en 5 años de diferencia — sin cap, un desajuste grande (10+ años,
      // frecuente en remasters/reediciones antiguas) acumula tanta penalización
      // que termina excluyendo el resultado del top igual, contradiciendo la
      // intención de "penalizar, no excluir".
      if (searchYear && r.year) {
        const diff = Math.min(Math.abs(r.year - searchYear), 5)
        if (diff === 0) score += 50
        else score -= diff * 150
      }

      r.score = score
    }

    return results.sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 30)
  }

  private sizeToGB(size: string): number {
    const m = size.match(/([\d.]+)\s*(GB|MB|TB)/i)
    if (!m) return 0
    const n = parseFloat(m[1])
    const unit = m[2].toUpperCase()
    if (unit === 'TB') return n * 1024
    if (unit === 'MB') return n / 1024
    return n
  }
}
