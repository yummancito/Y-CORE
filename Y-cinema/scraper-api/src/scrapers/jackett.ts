// jackett.ts — Scraper vía Jackett (proxy local a indexers de torrents)
// Jackett corre como servicio aparte en el sistema (puerto 9117 por defecto)
// y expone una API Torznab unificada sobre indexers configurados por el
// usuario (EliteTorrent, DonTorrent, MejorTorrent, etc.). A diferencia de
// dontorrent.ts/gnula.ts/cuevana.ts, no dependemos de una URL de sitio
// hardcodeada que cambia cada pocas semanas — Jackett y su comunidad
// mantienen esos adaptadores actualizados.
//
// Requiere JACKETT_URL y JACKETT_API_KEY en scraper-api/.env. Si no están
// configuradas, el scraper se auto-deshabilita (no rompe el resto).

import axios from 'axios'
import { XMLParser } from 'fast-xml-parser'
import { BaseScraper } from './base'
import { SearchResult, ScraperConfig } from '../types'
import { ScraperCache } from '../cache'

interface TorznabItem {
  title: string
  size?: string | number
  link?: string // magnet o URL .torrent, según indexer
  'torznab:attr'?: Array<{ '@_name': string; '@_value': string }> | { '@_name': string; '@_value': string }
}

export class JackettScraper extends BaseScraper {
  readonly config: ScraperConfig = {
    id: 'jackett',
    name: 'Jackett',
    enabled: !!(process.env.JACKETT_URL && process.env.JACKETT_API_KEY),
    timeout: 15000,
    priority: 10, // indexers en español reales — prioridad alta
  }

  private readonly baseUrl = (process.env.JACKETT_URL || 'http://127.0.0.1:9117').replace(/\/$/, '')
  private readonly apiKey = process.env.JACKETT_API_KEY || ''
  private xmlParser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' })

  constructor(cache: ScraperCache) {
    super(cache)
    if (!this.config.enabled) {
      console.warn('[Jackett] JACKETT_URL/JACKETT_API_KEY no configuradas — scraper deshabilitado')
    }
  }

  protected async doSearch(query: string, year?: number): Promise<SearchResult[]> {
    if (!this.config.enabled) return []

    const q = year ? `${query} ${year}` : query
    const url = `${this.baseUrl}/api/v2.0/indexers/all/results/torznab/api`

    const { data } = await axios.get(url, {
      params: { apikey: this.apiKey, t: 'search', q },
      timeout: this.config.timeout,
      responseType: 'text',
    })

    const parsed = this.xmlParser.parse(data)
    const items = parsed?.rss?.channel?.item
    if (!items) return []
    const itemsArray: TorznabItem[] = Array.isArray(items) ? items : [items]

    const results: SearchResult[] = []
    for (const item of itemsArray) {
      const title = item.title
      if (!title) continue

      const attrs = this.attrsMap(item['torznab:attr'])
      const seeders = parseInt(attrs.seeders || '0') || 0
      const leechers = parseInt(attrs.peers || '0') || 0
      const magnet = attrs.magneturl || (item.link?.startsWith('magnet:') ? item.link : '') || ''
      // Sin magnet directo, el link suele ser un .torrent — WebTorrent también
      // puede reproducir desde una URL .torrent, así que lo usamos igual.
      const linkOrMagnet = magnet || item.link || ''
      if (!linkOrMagnet) continue

      const yearMatch = title.match(/\b(19|20)\d{2}\b/)
      const itemYear = yearMatch ? parseInt(yearMatch[0]) : null

      results.push({
        id: `jackett:${Buffer.from(title).toString('base64').slice(0, 24)}`,
        title,
        year: itemYear,
        source: 'jackett',
        sourceName: attrs.indexer || 'Jackett',
        quality: this.detectQuality(title),
        size: this.formatSize(item.size ?? attrs.size),
        seeders,
        leechers,
        magnet: linkOrMagnet,
        audioLang: this.detectAudioLang(title),
        webFriendly: false,
        score: 0,
      })
    }

    return results.filter((r) => r.seeders > 0).slice(0, 20)
  }

  private attrsMap(
    attrs: TorznabItem['torznab:attr']
  ): Record<string, string> {
    if (!attrs) return {}
    const arr = Array.isArray(attrs) ? attrs : [attrs]
    const map: Record<string, string> = {}
    for (const a of arr) {
      if (a?.['@_name']) map[a['@_name']] = a['@_value']
    }
    return map
  }

  private formatSize(bytes?: string | number): string {
    const n = typeof bytes === 'string' ? parseInt(bytes) : bytes
    if (!n || isNaN(n)) return 'Unknown'
    const units = ['B', 'KB', 'MB', 'GB', 'TB']
    let size = n
    let i = 0
    while (size >= 1024 && i < units.length - 1) {
      size /= 1024
      i++
    }
    return `${size.toFixed(1)} ${units[i]}`
  }
}
