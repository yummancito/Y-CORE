import axios from 'axios'
import * as cheerio from 'cheerio'
import { BaseScraper } from './base'
import { SearchResult, ScraperConfig } from '../types'
import { ScraperCache } from '../cache'

// DonTorrent cambia de dominio con frecuencia (varias veces al mes) para
// evadir bloqueos de operadoras — si este dominio deja de resolver, revisar
// su canal de Telegram oficial (@DonTorrent) para la URL vigente y actualizar.
const DON_TORRENT_URL = 'https://dontorrent.tv'
const MAX_MAGNET_RESOLVE = 5 // top N resultados a resolverles magnet

const SCRAPER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml',
  'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
}

export class DonTorrentScraper extends BaseScraper {
  readonly config: ScraperConfig = {
    id: 'dontorrent',
    name: 'DonTorrent',
    enabled: true,
    timeout: 10000,
    priority: 20,
  }

  constructor(cache: ScraperCache) {
    super(cache)
  }

  protected async doSearch(query: string, year?: number): Promise<SearchResult[]> {
    const encoded = encodeURIComponent(query)
    const url = `${DON_TORRENT_URL}/buscar/${encoded}`
    const { data } = await axios.get(url, {
      timeout: this.config.timeout,
      headers: SCRAPER_HEADERS,
    })

    const $ = cheerio.load(data)

    // DonTorrent suele usar: filas de tabla, tarjetas, o divs con clase "item"
    // Intentamos varios selectores comunes hasta encontrar resultados
    const rows = this.findResultRows($)
    const rawResults: Array<{ title: string; detailUrl: string; size: string; seeders: number; leechers: number }> = []

    for (const $el of rows) {
      const title = this.extractTitle($el)
      if (!title || title.length < 3) continue

      const detailPath = this.extractDetailPath($el)
      const detailUrl = detailPath ? `${DON_TORRENT_URL}${detailPath.startsWith('/') ? '' : '/'}${detailPath}` : ''
      const size = $el.find('.size, .peso, [class*=size], [class*=peso]').first().text().trim() || 'Unknown'
      const seeders = parseInt($el.find('.seeds, .seeders, .up, [class*=seed]').first().text()) || 0
      const leechers = parseInt($el.find('.leech, .leechers, .down, [class*=leech]').first().text()) || 0

      rawResults.push({ title, detailUrl, size, seeders, leechers })
    }

    // Ordenar por seeders y tomar top N
    const top = rawResults
      .filter((r) => r.seeders > 0)
      .sort((a, b) => b.seeders - a.seeders)
      .slice(0, MAX_MAGNET_RESOLVE)

    if (top.length === 0) return []

    // Resolver magnets: visitar páginas de detalle en paralelo
    const magnetResults = await Promise.allSettled(
      top.map((r) => this.resolveMagnet(r.detailUrl).then((magnet) => ({ ...r, magnet })))
    )

    const finalResults: SearchResult[] = []
    for (const result of magnetResults) {
      if (result.status !== 'fulfilled') continue
      const { title, detailUrl, size, seeders, leechers, magnet } = result.value
      if (!magnet) continue // sin magnet no podemos reproducir

      // Extraer año
      const yearMatch = title.match(/\(?(\d{4})\)?/)
      const itemYear = yearMatch ? parseInt(yearMatch[1]) : null

      const quality = this.detectQuality(title)
      const audioLang = this.detectAudioLang(title)

      finalResults.push({
        id: `dontorrent:${Buffer.from(title).toString('base64').slice(0, 20)}`,
        title,
        year: itemYear,
        source: 'dontorrent',
        sourceName: 'DonTorrent',
        quality,
        size,
        seeders,
        leechers,
        magnet,
        url: detailUrl,
        audioLang,
        webFriendly: false,
        score: 0,
      })
    }

    return finalResults.slice(0, 10)
  }

  /** Encuentra las filas de resultados usando selectores progresivos */
  private findResultRows($: cheerio.CheerioAPI): cheerio.Cheerio<any>[] {
    const selectors = [
      'table tbody tr',         // tabla clásica
      'tr.item',                 // filas con clase item
      '.lista-torrents tr',      // lista-torrents
      '.card',                   // tarjetas
      '.post',                   // posts
      'article',                 // artículos
      'li.torrent-item',         // items de lista
      '[class*=torrent]',        // cualquier clase que contenga "torrent"
      '.item',                   // items genéricos
    ]

    for (const selector of selectors) {
      const found = $(selector)
      if (found.length >= 2) {
        console.log(`[DonTorrent] selectores: "${selector}" → ${found.length} filas`)
        return found.toArray().map((el) => $(el))
      }
    }

    // Fallback: cualquier enlace a detalle que tenga título
    console.warn('[DonTorrent] no se encontraron filas con selectores conocidos, usando fallback genérico')
    return $('body').find('a[href*="torrent"], a[href*="descargar"]').map((_, el) => $(el).closest('div, tr, li')).get().filter((el) => el.length > 0)
  }

  /** Extrae el título del resultado */
  private extractTitle($el: cheerio.Cheerio<any>): string {
    // Buscar en títulos, luego en texto del enlace principal
    return (
      $el.find('h2 a, h3 a, h4 a, .title a, .titulo a').first().text().trim() ||
      $el.find('a').first().text().trim() ||
      $el.find('[class*=title], [class*=titulo]').first().text().trim()
    )
  }

  /** Extrae la ruta a la página de detalle */
  private extractDetailPath($el: cheerio.Cheerio<any>): string {
    return (
      $el.find('a[href*="torrent"], a[href*="descargar"]').first().attr('href') ||
      $el.find('a').first().attr('href') ||
      ''
    )
  }

  /** Visita la página de detalle y extrae el magnet link */
  private async resolveMagnet(detailUrl: string): Promise<string | null> {
    if (!detailUrl) return null

    try {
      const { data } = await axios.get(detailUrl, {
        timeout: 8000,
        headers: SCRAPER_HEADERS,
      })

      const $ = cheerio.load(data)

      // Buscar magnet link: varios formatos comunes
      const magnetHref = (
        $('a[href^="magnet:"]').first().attr('href') ||
        $('[href*="magnet?"]').first().attr('href') ||
        $('.download a, .descargar a, [class*=download] a').first().attr('href') ||
        ''
      )

      if (magnetHref && magnetHref.startsWith('magnet:')) {
        console.log(`[DonTorrent] magnet resuelto: ${magnetHref.slice(0, 80)}...`)
        return magnetHref
      }

      // Algunos sitios ponen el hash BTIH en un campo oculto
      const infoHash = (
        $('[name="info_hash"], [name="btih"]').attr('value') ||
        $('[data-info-hash], [data-btih]').first().attr('data-info-hash') ||
        ''
      )

      if (infoHash) {
        const trackers = [
          'udp://tracker.opentrackr.org:1337/announce',
          'udp://open.demonii.com:1337/announce',
          'udp://open.stealth.si:80/announce',
          'udp://tracker.torrent.eu.org:451/announce',
          'udp://exodus.desync.com:6969/announce',
        ]
        const tr = trackers.map((t) => `&tr=${encodeURIComponent(t)}`).join('')
        const magnet = `magnet:?xt=urn:btih:${infoHash}&dn=${encodeURIComponent(detailUrl.split('/').pop() || 'video')}${tr}`
        console.log(`[DonTorrent] hash resuelto: ${infoHash}`)
        return magnet
      }

      console.warn(`[DonTorrent] no se encontró magnet en: ${detailUrl.slice(0, 60)}...`)
      return null
    } catch (err) {
      console.warn(`[DonTorrent] error al resolver magnet:`, (err as Error).message)
      return null
    }
  }
}
