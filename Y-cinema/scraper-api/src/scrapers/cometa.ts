// cometa.ts — Scraper vía Cometa (instancia pública de Comet para Stremio)
// Comet es un agregador que ya orquesta Jackett/Prowlarr/Torrentio/Zilean por
// dentro; esta instancia (cometa.stremx.net) está preconfigurada para
// priorizar contenido en español e idioma original. A diferencia de
// dontorrent.ts/gnula.ts, no dependemos de un dominio de sitio de streaming
// que cambia cada semana — Comet es un protocolo (addon Stremio) con varias
// instancias públicas intercambiables si esta cae.
//
// Requiere el tmdbId->imdbId resuelto por el llamador (Comet solo acepta
// IMDB ids, formato tt1234567 para películas, tt1234567:S:E para series).

import axios from 'axios'
import { BaseScraper } from './base'
import { SearchResult, ScraperConfig } from '../types'
import { ScraperCache } from '../cache'

interface CometStream {
  name?: string
  description?: string
  infoHash?: string
  behaviorHints?: {
    filename?: string
    videoSize?: number
  }
}

export class CometaScraper extends BaseScraper {
  readonly config: ScraperConfig = {
    id: 'cometa',
    name: 'Cometa',
    enabled: true,
    timeout: 20000, // Comet scrapea Jackett/Torrentio/etc. en vivo, puede tardar
    priority: 12,
  }

  private readonly baseUrl = (process.env.COMETA_URL || 'https://cometa.stremx.net').replace(/\/$/, '')

  constructor(cache: ScraperCache) {
    super(cache)
  }

  /**
   * Cometa (protocolo Stremio) solo busca por IMDB id, no por texto libre.
   * doSearch recibe query/year para cumplir la interfaz de BaseScraper, pero
   * la búsqueda real ocurre en searchByImdb — content-resolver.ts debe llamar
   * a ese método directamente cuando ya tiene el imdbId (evita una segunda
   * resolución de título→id que Comet no soporta).
   */
  protected async doSearch(): Promise<SearchResult[]> {
    return []
  }

  async searchByImdb(
    imdbId: string,
    title: string,
    type: 'movie' | 'series' = 'movie',
    season?: number,
    episode?: number
  ): Promise<SearchResult[]> {
    const cacheKey = `cometa:${imdbId}:${season ?? ''}:${episode ?? ''}`
    return this.cache.wrap(cacheKey, async () => {
      const id =
        type === 'series' && season != null && episode != null
          ? `${imdbId}:${season}:${episode}`
          : imdbId
      const url = `${this.baseUrl}/stream/${type === 'series' ? 'series' : 'movie'}/${id}.json`

      try {
        const { data } = await axios.get<{ streams?: CometStream[] }>(url, {
          timeout: this.config.timeout,
        })

        const streams = data?.streams || []
        const results: SearchResult[] = []

        for (const s of streams) {
          if (!s.infoHash) continue // solo torrents (magnet), sin debrid no hay URL directa
          const name = s.behaviorHints?.filename || s.name || title
          const magnet = this.buildMagnet(s.infoHash, name)

          results.push({
            id: `cometa:${s.infoHash}`,
            title: name,
            year: null,
            source: 'cometa',
            sourceName: 'Cometa',
            quality: this.detectQuality(name),
            size: this.formatSize(s.behaviorHints?.videoSize),
            seeders: 1, // Comet no expone seeders reales; se resuelve al conectar
            leechers: 0,
            magnet,
            audioLang: this.detectAudioLang(`${name} ${s.description || ''}`),
            webFriendly: false,
            score: 0,
          })
        }

        return results.slice(0, 20)
      } catch (err) {
        console.warn(`[Cometa] búsqueda falló para ${imdbId}:`, (err as Error).message)
        return []
      }
    })
  }

  private buildMagnet(infoHash: string, name: string): string {
    const trackers = [
      'udp://tracker.opentrackr.org:1337/announce',
      'udp://open.demonii.com:1337/announce',
      'udp://open.stealth.si:80/announce',
      'udp://tracker.torrent.eu.org:451/announce',
      'udp://exodus.desync.com:6969/announce',
    ]
    const tr = trackers.map((t) => `&tr=${encodeURIComponent(t)}`).join('')
    return `magnet:?xt=urn:btih:${infoHash}&dn=${encodeURIComponent(name)}${tr}`
  }

  private formatSize(bytes?: number): string {
    if (!bytes) return 'Unknown'
    const units = ['B', 'KB', 'MB', 'GB', 'TB']
    let size = bytes
    let i = 0
    while (size >= 1024 && i < units.length - 1) {
      size /= 1024
      i++
    }
    return `${size.toFixed(1)} ${units[i]}`
  }
}
