// x1337.ts — Scraper de 1337x.to con Cheerio + segunda request para magnets
// 1337x lista resultados en una tabla HTML. Para obtener el magnet real
// hay que navegar a la página de detalle de cada resultado.

import axios from 'axios'
import * as cheerio from 'cheerio'
import { BaseScraper } from './base'
import { SearchResult, ScraperConfig } from '../types'
import { ScraperCache } from '../cache'

const X1337_DOMAINS = ['1337x.to', '1337x.st', 'x1337x.ws']

export class X1337Scraper extends BaseScraper {
  readonly config: ScraperConfig = {
    id: '1337x',
    name: '1337x',
    enabled: true,
    timeout: 10000,
    priority: 40,
  }

  private readonly HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    Accept: 'text/html,application/xhtml+xml',
  }

  constructor(cache: ScraperCache) {
    super(cache)
  }

  protected async doSearch(query: string, year?: number): Promise<SearchResult[]> {
    const searchQ = year ? `${query} ${year}` : query
    const encoded = encodeURIComponent(searchQ)

    // Intentar cada dominio 1337x hasta que uno funcione
    for (const domain of X1337_DOMAINS) {
      try {
        const results = await this.searchDomain(domain, encoded)
        if (results.length > 0) return results
      } catch (err) {
        console.warn(`[1337x] dominio "${domain}" falló:`, (err as Error).message)
        continue
      }
    }

    return []
  }

  private async searchDomain(domain: string, encodedQuery: string): Promise<SearchResult[]> {
    const { data } = await axios.get(`https://${domain}/search/${encodedQuery}/1/`, {
      timeout: this.config.timeout,
      headers: this.HEADERS,
    })

    const $ = cheerio.load(data)
    const rows: Array<{ title: string; detailPath: string; seeders: number; leechers: number; size: string }> = []

    $('table.table-list tbody tr').each((_, row) => {
      const $row = $(row)
      const title = $row.find('td.name a:nth-child(2)').text().trim()
      const detailPath = $row.find('td.name a:nth-child(2)').attr('href') || ''
      const seeders = parseInt($row.find('td.seeds').text()) || 0
      const leechers = parseInt($row.find('td.leeches').text()) || 0
      const size = $row.find('td.size').text().trim()

      if (title && seeders > 0) {
        rows.push({ title, detailPath, seeders, leechers, size })
      }
    })

    if (rows.length === 0) return []

    // Resolver magnets para los top 3 resultados
    const top3 = rows.slice(0, 3)
    const magnetResults = await Promise.allSettled(
      top3.map((r) => this.resolveMagnet(domain, r.detailPath))
    )

    const magnetMap = new Map<string, string>()
    top3.forEach((r, i) => {
      if (magnetResults[i]?.status === 'fulfilled' && magnetResults[i].value) {
        magnetMap.set(r.detailPath, magnetResults[i].value)
      }
    })

    // Construir resultados
    const results: SearchResult[] = []
    for (const row of rows) {
      const quality = this.detectQuality(row.title)
      const audioLang = this.detectAudioLang(row.title)
      const yearMatch = row.title.match(/\(?(\d{4})\)?/)
      const itemYear = yearMatch ? parseInt(yearMatch[1]) : null
      const magnet = magnetMap.get(row.detailPath) || ''

      results.push({
        id: `1337x:${Buffer.from(row.title).toString('base64').slice(0, 20)}`,
        title: row.title,
        year: itemYear,
        source: '1337x',
        sourceName: '1337x',
        quality,
        size: row.size,
        seeders: row.seeders,
        leechers: row.leechers,
        magnet: magnet || undefined,
        audioLang,
        webFriendly: false,
        score: 0,
      })
    }

    return results.filter((r) => r.magnet).slice(0, 10)
  }

  private async resolveMagnet(domain: string, detailPath: string): Promise<string | null> {
    const url = detailPath.startsWith('http') ? detailPath : `https://${domain}${detailPath}`
    try {
      const { data } = await axios.get(url, {
        timeout: 8000,
        headers: this.HEADERS,
      })
      const $ = cheerio.load(data)

      const magnetHref =
        $('a[href^="magnet:"]').first().attr('href') ||
        $('.download-links a[href*="magnet"]').first().attr('href') ||
        ''

      if (magnetHref) return magnetHref

      // Fallback: info_hash en atributos o texto
      const hashEl = $('[data-info-hash], [data-hash], .info-hash').first()
      const hash = hashEl.attr('data-info-hash') || hashEl.attr('data-hash') || hashEl.text().trim()
      if (hash) {
        const trackers = [
          'udp://tracker.opentrackr.org:1337/announce',
          'udp://open.demonii.com:1337/announce',
        ]
        const tr = trackers.map((t) => `&tr=${encodeURIComponent(t)}`).join('')
        return `magnet:?xt=urn:btih:${hash}&dn=${encodeURIComponent(detailPath.split('/').pop() || 'video')}${tr}`
      }

      return null
    } catch {
      return null
    }
  }
}
