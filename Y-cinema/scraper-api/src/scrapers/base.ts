import { ScraperCache } from '../cache'
import { SearchResult, ScraperConfig } from '../types'

/** Interfaz que todo scraper debe implementar */
export interface ScraperInterface {
  readonly config: ScraperConfig
  search(query: string, year?: number): Promise<SearchResult[]>
}

/** Clase base con utilidades comunes para todos los scrapers */
export abstract class BaseScraper implements ScraperInterface {
  abstract readonly config: ScraperConfig
  protected cache: ScraperCache

  constructor(cache: ScraperCache) {
    this.cache = cache
  }

  // Los resultados incluyen `seeders`, un dato volátil que cambia constante-
  // mente — con el TTL genérico de 1h (pensado para Playwright/Cloudflare,
  // que sí vale la pena cachear más tiempo por lo caro que es), un torrent
  // podía mostrarse "sin seeders" (y quedar filtrado/penalizado) durante toda
  // la hora aunque hubiera ganado seeders reales minutos después.
  private static readonly SEARCH_TTL_MS = 10 * 60 * 1000 // 10 min

  /** Búsqueda pública con caché (llama a doSearch internamente) */
  async search(query: string, year?: number): Promise<SearchResult[]> {
    return this.searchWithCache(query, year, BaseScraper.SEARCH_TTL_MS)
  }

  /** Ejecuta búsqueda con caché y registro */
  protected async searchWithCache(query: string, year?: number, ttlMs?: number): Promise<SearchResult[]> {
    const cacheKey = `${this.config.id}:${query.toLowerCase()}:${year || ''}`
    return this.cache.wrap(cacheKey, async () => {
      const start = Date.now()
      try {
        const results = await this.doSearch(query, year)
        console.log(`[${this.config.id}] "${query}" → ${results.length} resultados en ${Date.now() - start}ms`)
        return results
      } catch (err) {
        console.warn(`[${this.config.id}] "${query}" falló:`, (err as Error).message)
        return []
      }
    }, ttlMs)
  }

  /** Implementación específica de cada scraper */
  protected abstract doSearch(query: string, year?: number): Promise<SearchResult[]>

  /** Detecta calidad desde el título */
  protected detectQuality(title: string): string {
    const upper = title.toUpperCase()
    if (upper.includes('2160P') || upper.includes('4K') || upper.includes('UHD')) return '4K'
    if (upper.includes('1080P') || upper.includes('1080')) return '1080p'
    if (upper.includes('720P')) return '720p'
    if (upper.includes('480P')) return '480p'
    return 'HD'
  }

  /**
   * Detecta idiomas de audio desde el título del release.
   * Soporta 12+ idiomas con detección por palabras clave.
   */
  protected detectAudioLang(title: string): string[] {
    const lower = title.toLowerCase()
    const langs: Set<string> = new Set(['english'])

    // Español (evitar 'esp' por falso positivo con 'espionage', 'especially')
    if (
      lower.includes('latino') ||
      lower.includes('latin') ||
      lower.includes('castellano') ||
      lower.includes('castell') ||
      lower.includes('españa') ||
      lower.includes('espanol') ||
      lower.includes('español') ||
      lower.includes('spa') ||
      lower.includes('dual')
    ) {
      if (lower.includes('latino') || lower.includes('latin')) langs.add('latino')
      if (lower.includes('castellano') || lower.includes('castell') || lower.includes('españa')) langs.add('castellano')
      if (lower.includes('spa') || lower.includes('espanol') || lower.includes('español')) {
        langs.add('latino')
        langs.add('castellano')
      }
      if (lower.includes('dual')) {
        langs.add('latino')
        langs.add('castellano')
      }
    }

    // Portugués (usar patrones largos para evitar falsos positivos)
    if (
      lower.includes('portugu') ||
      lower.includes('portuguese') ||
      lower.includes('pt-br') ||
      lower.includes('brazilian') ||
      lower.includes('nacional') ||
      lower.includes('legendado')
    ) {
      if (lower.includes('br') || lower.includes('brazil')) langs.add('portugues-br')
      else langs.add('portugues')
    }

    // Francés
    if (
      lower.includes('french') ||
      lower.includes('franc') ||
      lower.includes('français') ||
      lower.includes('vf') ||
      lower.includes('vff') ||
      lower.includes('vostfr') ||
      lower.includes('truefrench') ||
      lower.includes('multi-vf')
    ) {
      langs.add('french')
    }

    // Alemán
    if (
      lower.includes('german') ||
      lower.includes('deutsch') ||
      lower.includes('ger') ||
      lower.includes('aleman')
    ) {
      langs.add('german')
    }

    // Italiano
    if (
      lower.includes('italian') ||
      lower.includes('italiano') ||
      lower.includes('ita')
    ) {
      langs.add('italian')
    }

    // Japonés
    if (
      lower.includes('japanese') ||
      lower.includes('japon') ||
      lower.includes('日本語') ||
      lower.includes('jpn')
    ) {
      langs.add('japanese')
    }

    // Coreano
    if (
      lower.includes('korean') ||
      lower.includes('coreano') ||
      lower.includes('한국어') ||
      lower.includes('kor')
    ) {
      langs.add('korean')
    }

    // Chino (sin 'chi' por falsos positivos con chips/chicago/children)
    if (
      lower.includes('chinese') ||
      lower.includes('chino') ||
      lower.includes('中文') ||
      lower.includes('mandarin') ||
      lower.includes('cantonese')
    ) {
      langs.add('chinese')
    }

    // Ruso (sin 'rus' suelto — falso positivo con 'trust', 'crust')
    if (
      lower.includes('russian') ||
      lower.includes('ruso') ||
      lower.includes('русский')
    ) {
      langs.add('russian')
    }

    // Hindi
    if (
      lower.includes('hindi') ||
      lower.includes('हिन्दी') ||
      lower.includes('bollywood') ||
      lower.includes('tamil') ||
      lower.includes('telugu')
    ) {
      langs.add('hindi')
    }

    // Árabe (sin 'ara' suelto — falso positivo con 'parachute', 'character')
    if (
      lower.includes('arabic') ||
      lower.includes('árabe') ||
      lower.includes('العربية')
    ) {
      langs.add('arabic')
    }

    // Turco (sin 'tur' suelto — falso positivo con 'turtle', 'turn', 'turbo')
    if (
      lower.includes('turkish') ||
      lower.includes('turco') ||
      lower.includes('türkçe')
    ) {
      langs.add('turkish')
    }

    // Holandés
    if (
      lower.includes('dutch') ||
      lower.includes('holandes') ||
      lower.includes('nederlands') ||
      lower.includes('nld')
    ) {
      langs.add('dutch')
    }

    // Polaco (sin 'pl' suelto — falso positivo con 'play', 'planet', 'plus')
    if (
      lower.includes('polish') ||
      lower.includes('polaco') ||
      lower.includes('polski')
    ) {
      langs.add('polish')
    }

    // Sueco (sin 'swe' suelto — falso positivo con 'sweet', 'swept')
    if (
      lower.includes('swedish') ||
      lower.includes('sueco') ||
      lower.includes('svensk')
    ) {
      langs.add('swedish')
    }

    // Multi (múltiples pistas de audio)
    if (
      lower.includes('multi') ||
      lower.includes('multi-audio') ||
      lower.includes('2audio') ||
      lower.includes('dublado')
    ) {
      langs.add('latino')
      langs.add('english')
    }

    return [...langs]
  }

  /** Normaliza código de idioma para el filtro lang */
  protected normalizeLang(lang: string): string {
    const map: Record<string, string> = {
      es: 'latino',
      'es-la': 'latino',
      'es-es': 'castellano',
      latino: 'latino',
      castellano: 'castellano',
      en: 'english',
      pt: 'portugues',
      'pt-br': 'portugues-br',
      fr: 'french',
      de: 'german',
      it: 'italian',
      ja: 'japanese',
      ko: 'korean',
      zh: 'chinese',
      ru: 'russian',
      hi: 'hindi',
      ar: 'arabic',
      tr: 'turkish',
      nl: 'dutch',
      pl: 'polish',
      sv: 'swedish',
    }
    return map[lang.toLowerCase()] || lang
  }
}
