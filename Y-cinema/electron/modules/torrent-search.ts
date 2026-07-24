import axios from 'axios'
import { XMLParser } from 'fast-xml-parser'
import * as cheerio from 'cheerio'

export interface TorrentResult {
  title: string
  magnet: string
  seeders: number
  leechers: number
  size: string
  quality: string
  source: string
  /** Puntaje interno para ordenar candidatos (mayor = mejor para arrancar rápido) */
  score?: number
  /** true si sabemos que el audio es AAC (web/YTS) → no necesita transcode */
  webFriendly?: boolean
  /** URL de detalle en la fuente (streaming directo: Gnula, Cuevana, etc.) — si está presente, se usa stream:resolve en vez de torrent:play */
  detailUrl?: string
  /** |año del release - año buscado|, si se pudo comparar. Penaliza en vez de excluir un desajuste de año (remasters, fecha de estreno regional distinta a la de TMDB, etc.) */
  yearDiff?: number
}

export class TorrentSearch {
  private xmlParser: XMLParser

  constructor() {
    this.xmlParser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
    })
  }

  async search(query: string, year?: number): Promise<TorrentResult[]> {
    const searchQuery = year ? `${query} ${year}` : query

    // YTS primero: MP4 H.264+AAC pequeños y bien seedeados → arranque instantáneo
    // sin transcodificar. TPB/Nyaa quedan de fallback (BluRay pesados, DTS, etc.)
    const [ytsResults, tpbResults, nyaaResults] = await Promise.allSettled([
      this.searchYTS(query, year),
      this.searchThePirateBay(searchQuery),
      this.searchNyaa(query),
    ])

    const results: TorrentResult[] = []
    if (ytsResults.status === 'fulfilled') results.push(...ytsResults.value)
    if (tpbResults.status === 'fulfilled') results.push(...tpbResults.value)
    if (nyaaResults.status === 'fulfilled') results.push(...nyaaResults.value)

    // Puntuar por "qué tan rápido va a arrancar", no solo por seeders:
    // premia web/AAC (sin transcode) y buen seeding, penaliza archivos gigantes
    for (const r of results) r.score = this.scoreResult(r)
    results.sort((a, b) => (b.score || 0) - (a.score || 0))

    return results.slice(0, 20)
  }

  private scoreResult(r: TorrentResult): number {
    let score = 0

    // Seeders: peso fuerte pero con rendimientos decrecientes
    score += Math.min(r.seeders, 500) * 2
    if (r.seeders > 50) score += 200
    if (r.seeders < 5) score -= 300

    // Web/AAC: evita transcode → arranque mucho más rápido
    if (r.webFriendly) score += 400
    const name = r.title.toUpperCase()
    if (/\b(WEB-?DL|WEBRIP|WEB)\b/.test(name)) score += 150
    if (/\b(BLURAY|BDREMUX|REMUX)\b/.test(name)) score -= 100 // pesados + DTS
    if (name.includes('AAC')) score += 120
    if (/\b(DTS|TRUEHD|ATMOS)\b/.test(name)) score -= 80

    // Calidad: 1080p es el punto dulce (peso/velocidad); 4K es pesado
    if (r.quality === '1080p') score += 100
    if (r.quality === '720p') score += 60
    if (r.quality === '4K') score -= 120

    // Tamaño: archivos chicos buferean antes
    const gb = this.sizeToGB(r.size)
    if (gb > 0) {
      if (gb < 2) score += 100
      else if (gb < 4) score += 40
      else if (gb > 8) score -= 150
      else if (gb > 15) score -= 400
    }

    // Desajuste de año vs TMDB: penaliza en vez de excluir — un desfase de
    // 1 año es común (estreno regional, remaster) y no debería descartar
    // el resultado, solo bajarlo en el ranking frente a coincidencias exactas.
    // Tope en 5 años: sin cap, un desajuste grande acumula tanta penalización
    // que termina excluyendo el resultado igual que el filtro viejo.
    if (r.yearDiff != null) {
      const diff = Math.min(r.yearDiff, 5)
      if (diff === 0) score += 50
      else score -= diff * 150
    }

    return score
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

  // ─── YTS (YIFY) — MP4 H.264 + AAC ─────────────────────────────

  /** Dominios YTS conocidos (el principal suele caer, los mirrors funcionan) */
  private readonly YTS_DOMAINS = [
    'yts.mx',
    'yts.torrentbay.to',
  ]

  private async searchYTS(query: string, year?: number): Promise<TorrentResult[]> {
    // Intentar cada dominio hasta que uno responda
    for (const domain of this.YTS_DOMAINS) {
      try {
        const { data } = await axios.get(`https://${domain}/api/v2/list_movies.json`, {
          params: { query_term: query, limit: 20, sort_by: 'seeds' },
          timeout: 6000,
          headers: { 'User-Agent': 'Y-CINEMA/1.0' },
        })
        if (data?.data?.movies) {
          console.log(`[TorrentSearch] YTS respondió via ${domain}`)
          return this.parseYtsResponse(data.data.movies, year, domain)
        }
      } catch {
        console.warn(`[TorrentSearch] YTS domain "${domain}" falló, probando siguiente...`)
        continue
      }
    }
    console.warn('[TorrentSearch] YTS: todos los dominios fallaron')
    return []
  }

  private parseYtsResponse(movies: any[], year?: number, domain?: string): TorrentResult[] {
    const results: TorrentResult[] = []
    for (const movie of movies) {
      // Desajustes de año (remasters, estreno regional distinto al que usa
      // TMDB, etc.) ya no descartan el resultado — solo se penaliza en el
      // score (ver scoreResult) para que no desaparezca contenido válido.
      const yearDiff = year && movie.year ? Math.abs(movie.year - year) : undefined
      for (const t of movie.torrents || []) {
        results.push({
          title: `${movie.title} ${movie.year} ${t.quality} ${t.type || 'web'} [YTS]`,
          magnet: this.buildMagnetLink(t.hash, `${movie.title} ${movie.year} ${t.quality}`),
          seeders: t.seeds || 0,
          leechers: t.peers || 0,
          size: t.size || 'Unknown',
          quality: this.normalizeYtsQuality(t.quality),
          source: `YTS (${domain || 'yts.mx'})`,
          webFriendly: true,
          yearDiff,
        })
      }
    }
    return results.filter((r) => r.seeders > 0)
  }

  private normalizeYtsQuality(q: string): string {
    if (q === '2160p') return '4K'
    return q
  }

  // ─── ThePirateBay ─────────────────────────────────────────────

  private async searchThePirateBay(query: string): Promise<TorrentResult[]> {
    try {
      const encoded = encodeURIComponent(query)
      const { data } = await axios.get(`https://apibay.org/q.php?q=${encoded}`, {
        timeout: 8000,
        headers: {
          'User-Agent': 'Y-CINEMA/1.0',
        },
      })

      // La API de TPB devuelve JSON con los resultados
      if (!Array.isArray(data)) return []

      return data
        .filter((item: any) => item.name && item.id !== '0')
        .map((item: any) => ({
          title: item.name,
          magnet: this.buildMagnetLink(item.info_hash, item.name),
          seeders: parseInt(item.seeders) || 0,
          leechers: parseInt(item.leechers) || 0,
          size: this.formatSize(parseInt(item.size)),
          quality: this.detectQuality(item.name),
          source: 'ThePirateBay',
        }))
        .filter((t: TorrentResult) => t.seeders > 0)
        .slice(0, 10)
    } catch (err) {
      console.warn('[TorrentSearch] ThePirateBay failed:', (err as Error).message)
      return []
    }
  }

  // ─── Nyaa.si (Anime) ──────────────────────────────────────────

  private async searchNyaa(query: string): Promise<TorrentResult[]> {
    try {
      const encoded = encodeURIComponent(query)
      const { data } = await axios.get(
        `https://nyaa.si/?page=rss&q=${encoded}&c=1_2&f=0`,
        {
          timeout: 8000,
          headers: {
            'User-Agent': 'Y-CINEMA/1.0',
          },
        }
      )

      const parsed = this.xmlParser.parse(data)
      const items = parsed?.rss?.channel?.item

      if (!items) return []
      const itemsArray = Array.isArray(items) ? items : [items]

      return itemsArray
        .map((item: any) => ({
          title: item.title,
          magnet: item.link || '',
          seeders: parseInt(item['nyaa:seeders']) || 0,
          leechers: parseInt(item['nyaa:leechers']) || 0,
          size: item['nyaa:size'] || 'Unknown',
          quality: this.detectQuality(item.title),
          source: 'Nyaa.si',
        }))
        .filter((t: TorrentResult) => t.seeders > 0 && t.magnet)
        .slice(0, 10)
    } catch (err) {
      console.warn('[TorrentSearch] Nyaa.si failed:', (err as Error).message)
      return []
    }
  }

  // ─── 1337x ────────────────────────────────────────────────────

  private async search1337x(query: string): Promise<TorrentResult[]> {
    try {
      const encoded = encodeURIComponent(query)
      const { data } = await axios.get(`https://1337x.to/search/${encoded}/1/`, {
        timeout: 8000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      })

      const $ = cheerio.load(data)
      const results: TorrentResult[] = []

      $('table.table-list tbody tr').each((_, row) => {
        const $row = $(row)
        const title = $row.find('td.name a:nth-child(2)').text().trim()
        const seeders = parseInt($row.find('td.seeds').text()) || 0
        const leechers = parseInt($row.find('td.leeches').text()) || 0
        const size = $row.find('td.size').text().trim()

        // Extraer magnet link (requiere navegar a la página del torrent)
        // Esto es más complejo, así que por ahora solo devolvemos metadata
        if (title && seeders > 0) {
          results.push({
            title,
            magnet: '', // Necesitaríamos otra request para el magnet
            seeders,
            leechers,
            size,
            quality: this.detectQuality(title),
            source: '1337x',
          })
        }
      })

      return results.slice(0, 10)
    } catch (err) {
      console.warn('[TorrentSearch] 1337x failed:', (err as Error).message)
      return []
    }
  }

  // ─── Utilidades ───────────────────────────────────────────────

  private buildMagnetLink(infoHash: string, name: string): string {
    const encoded = encodeURIComponent(name)
    const trackers = [
      'udp://tracker.opentrackr.org:1337/announce',
      'udp://open.demonii.com:1337/announce',
      'udp://open.stealth.si:80/announce',
      'udp://tracker.torrent.eu.org:451/announce',
      'udp://exodus.desync.com:6969/announce',
      'udp://tracker.theoks.net:6969/announce',
      'udp://explodie.org:6969/announce',
      'udp://tracker.tiny-vps.com:6969/announce',
    ]
    const tr = trackers.map((t) => `&tr=${encodeURIComponent(t)}`).join('')
    return `magnet:?xt=urn:btih:${infoHash}&dn=${encoded}${tr}`
  }

  private detectQuality(name: string): string {
    const upper = name.toUpperCase()
    if (upper.includes('2160P') || upper.includes('4K') || upper.includes('UHD')) return '4K'
    if (upper.includes('1080P') || upper.includes('1080')) return '1080p'
    if (upper.includes('720P')) return '720p'
    if (upper.includes('480P')) return '480p'
    return 'Unknown'
  }

  private formatSize(bytes: number): string {
    if (!bytes || isNaN(bytes)) return 'Unknown'
    const units = ['B', 'KB', 'MB', 'GB', 'TB']
    let i = 0
    let size = bytes
    while (size >= 1024 && i < units.length - 1) {
      size /= 1024
      i++
    }
    return `${size.toFixed(1)} ${units[i]}`
  }
}
