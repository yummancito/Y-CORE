import axios from 'axios'
import { BaseScraper } from './base'
import { SearchResult, ScraperConfig } from '../types'
import { ScraperCache } from '../cache'

const YTS_DOMAINS = ['yts.mx', 'yts.torrentbay.to']

export class YtsScraper extends BaseScraper {
  readonly config: ScraperConfig = {
    id: 'yts',
    name: 'YTS (YIFY)',
    enabled: true,
    timeout: 8000,
    priority: 10,
  }

  constructor(cache: ScraperCache) {
    super(cache)
  }

  protected async doSearch(query: string, year?: number): Promise<SearchResult[]> {
    // Intentar cada dominio YTS hasta que uno responda
    for (const domain of YTS_DOMAINS) {
      try {
        const { data } = await axios.get(`https://${domain}/api/v2/list_movies.json`, {
          params: {
            query_term: query,
            limit: 20,
            sort_by: 'seeds',
          },
          timeout: this.config.timeout,
          headers: { 'User-Agent': 'Y-CINEMA-Scraper/1.0' },
        })

        if (data?.data?.movies) {
          console.log(`[YTS] ✓ ${domain} respondió`)
          return this.parseMovies(data.data.movies, year)
        }
      } catch {
        console.log(`[YTS] ✗ ${domain} no disponible`)
        continue
      }
    }

    return []
  }

  private parseMovies(movies: any[], year?: number): SearchResult[] {
    const results: SearchResult[] = []

    for (const movie of movies) {
      // Desajustes de año (remaster, estreno regional distinto al de TMDB)
      // ya no se descartan aquí — el gateway los penaliza por diferencia de
      // año en su ranking (rankResults) en vez de excluirlos por completo.
      for (const t of movie.torrents || []) {
        const quality = t.quality === '2160p' ? '4K' : t.quality
        const title = `${movie.title} ${movie.year} ${quality} [YTS]`

        results.push({
          id: `yts:${movie.id}:${t.hash}`,
          title,
          year: movie.year || null,
          source: 'yts',
          sourceName: 'YTS',
          quality,
          size: t.size || 'Unknown',
          seeders: t.seeds || 0,
          leechers: t.peers || 0,
          magnet: this.buildMagnet(t.hash, `${movie.title} ${movie.year} ${quality}`),
          audioLang: ['english'],
          webFriendly: true, // YTS: H.264 + AAC, sin transcode
          infoHash: t.hash,
          score: 0,
        })
      }
    }

    // Filtrar sin seeders y ordenar
    return results
      .filter((r) => r.seeders > 0)
      .sort((a, b) => b.seeders - a.seeders)
      .slice(0, 10)
  }

  private buildMagnet(hash: string, name: string): string {
    const encoded = encodeURIComponent(name)
    const trackers = [
      'udp://tracker.opentrackr.org:1337/announce',
      'udp://open.demonii.com:1337/announce',
      'udp://open.stealth.si:80/announce',
      'udp://tracker.torrent.eu.org:451/announce',
      'udp://exodus.desync.com:6969/announce',
    ]
    const tr = trackers.map((t) => `&tr=${encodeURIComponent(t)}`).join('')
    return `magnet:?xt=urn:btih:${hash}&dn=${encoded}${tr}`
  }
}
