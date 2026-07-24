// thepiratebay.ts — Scraper de ThePirateBay vía apibay.org (API JSON)
// No necesita Playwright — es API REST directa. Rápida y confiable.

import axios from 'axios'
import { BaseScraper } from './base'
import { SearchResult, ScraperConfig } from '../types'
import { ScraperCache } from '../cache'

export class PirateBayScraper extends BaseScraper {
  readonly config: ScraperConfig = {
    id: 'tpb',
    name: 'ThePirateBay',
    enabled: true,
    timeout: 8000,
    priority: 30,
  }

  constructor(cache: ScraperCache) {
    super(cache)
  }

  protected async doSearch(query: string, year?: number): Promise<SearchResult[]> {
    try {
      const searchQ = year ? `${query} ${year}` : query
      const encoded = encodeURIComponent(searchQ)
      const { data } = await axios.get(`https://apibay.org/q.php?q=${encoded}`, {
        timeout: this.config.timeout,
        headers: { 'User-Agent': 'Y-CINEMA-Scraper/1.0' },
      })

      if (!Array.isArray(data)) return []

      return data
        .filter((item: any) => item.name && item.id !== '0')
        .map((item: any) => {
          const title = item.name
          const quality = this.detectQuality(title)
          const audioLang = this.detectAudioLang(title)
          const yearMatch = title.match(/\(?(\d{4})\)?/)
          const itemYear = yearMatch ? parseInt(yearMatch[1]) : null

          return {
            id: `tpb:${item.info_hash || item.id}`,
            title,
            year: itemYear,
            source: 'tpb',
            sourceName: 'ThePirateBay',
            quality,
            size: this.formatSize(parseInt(item.size)),
            seeders: parseInt(item.seeders) || 0,
            leechers: parseInt(item.leechers) || 0,
            magnet: this.buildMagnet(item.info_hash || '', title),
            audioLang,
            webFriendly: false,
            score: 0,
          }
        })
        .filter((r: SearchResult) => r.seeders > 0)
        .slice(0, 15)
    } catch (err) {
      console.warn('[TPB] Error:', (err as Error).message)
      return []
    }
  }

  private buildMagnet(hash: string, name: string): string {
    if (!hash) return ''
    const encoded = encodeURIComponent(name)
    const trackers = [
      'udp://tracker.opentrackr.org:1337/announce',
      'udp://open.demonii.com:1337/announce',
      'udp://tracker.torrent.eu.org:451/announce',
    ]
    const tr = trackers.map((t) => `&tr=${encodeURIComponent(t)}`).join('')
    return `magnet:?xt=urn:btih:${hash}&dn=${encoded}${tr}`
  }

  private formatSize(bytes: number): string {
    if (!bytes || isNaN(bytes)) return 'Unknown'
    const units = ['B', 'KB', 'MB', 'GB']
    let i = 0
    let size = bytes
    while (size >= 1024 && i < units.length - 1) {
      size /= 1024
      i++
    }
    return `${size.toFixed(1)} ${units[i]}`
  }
}
