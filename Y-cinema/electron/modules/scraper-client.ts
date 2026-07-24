// scraper-client.ts — Bridge HTTP hacia Y-CINEMA Scraper API (puerto 3001)
// La scraper-api es un servidor Express separado que agrega búsqueda
// en YTS, DonTorrent y futuras fuentes. Si no está corriendo,
// el cliente devuelve vacío y WatchPage cae al fallback interno.
//
// Endpoint: GET /api/search?q=title&year=2024
// Response: SearchResponse { results: SearchResult[] }

import axios from 'axios'
import { TorrentResult } from './torrent-search'

const SCRAPER_API_URL = 'http://localhost:3001'
const TIMEOUT_MS = 30000 // 30s — Playwright (Gnula/Cuevana) tarda 15-30s en la primera ejecución fría

// Mismo secreto que scraper-api/.env (SCRAPER_INTERNAL_KEY) — autentica estas
// llamadas frente al middleware del scraper-api, que rechaza sin este header.
function authHeaders(): Record<string, string> {
  const key = process.env.SCRAPER_INTERNAL_KEY
  return key ? { 'X-Internal-Key': key } : {}
}

interface ScraperSearchResult {
  id: string
  title: string
  year: number | null
  source: string
  sourceName: string
  quality: string
  size: string
  seeders: number
  leechers: number
  magnet?: string
  url?: string
  audioLang: string[]
  webFriendly: boolean
  infoHash?: string
  score: number
}

interface ScraperSearchResponse {
  query: string
  year?: number
  results: ScraperSearchResult[]
  total: number
  cached: boolean
  sourcesTried: number
  sourcesSucceeded: number
  timing: number
}

interface ScraperStreamResponse {
  success: boolean
  stream?: { url: string; type: string; quality: string }
  error?: string
  timing: number
}

export interface ResolvedStream {
  streamUrl: string
  needsTranscode: boolean
  audioTracks: never[]
  duration: number
  infoHash: string
  fileName: string
  fileSize: number
}

export class ScraperClient {
  /**
   * Busca en la scraper-api. Timeout alto (30s) para dar tiempo a que
   * Playwright (Gnula/Cuevana) arranque en la primera ejecución fría.
   * Las búsquedas siguientes son instantáneas por la caché.
   * Si no responde, devuelve [] silenciosamente.
   */
  async search(
    query: string,
    year?: number,
    lang?: string,
    imdbId?: string,
    show?: { season: number; episode: number }
  ): Promise<TorrentResult[]> {
    try {
      const params = new URLSearchParams({ q: query })
      if (year) params.set('year', String(year))
      if (lang) params.set('lang', lang)
      if (imdbId) params.set('imdbId', imdbId)
      if (show) {
        params.set('season', String(show.season))
        params.set('episode', String(show.episode))
      }

      const res = await axios.get<ScraperSearchResponse>(
        `${SCRAPER_API_URL}/api/search?${params}`,
        { timeout: TIMEOUT_MS, headers: authHeaders() }
      )

      if (!res.data?.results?.length) {
        return []
      }

      console.log(
        `[ScraperClient] ${res.data.results.length} resultados (${res.data.sourcesSucceeded}/${res.data.sourcesTried} fuentes, ${res.data.timing}ms)`
      )

      return this.mapResults(res.data.results)
    } catch (err) {
      const e = err as { code?: string; message: string }
      const reason =
        e.code === 'ECONNREFUSED'
          ? 'scraper-api no está corriendo (ECONNREFUSED)'
          : e.code === 'ECONNABORTED'
            ? `timeout tras ${TIMEOUT_MS}ms`
            : e.message
      console.warn(`[ScraperClient] búsqueda falló: ${reason}`)
      return []
    }
  }

  /**
   * Resuelve el stream directo (.m3u8/.mp4) de una fuente de streaming
   * embebido (Gnula, Cuevana). Antes esto vivía duplicado en main.ts con
   * axios directo y la URL de scraper-api hardcodeada por segunda vez.
   */
  async resolveStream(sourceName: string, detailUrl: string): Promise<ResolvedStream> {
    try {
      const res = await axios.get<ScraperStreamResponse>(`${SCRAPER_API_URL}/api/stream`, {
        params: { source: sourceName, url: detailUrl },
        timeout: 35000, // igualado al RESOLVE_STREAM_TIMEOUT del gateway (35s)
        headers: authHeaders(),
      })
      if (res.data?.success && res.data?.stream) {
        console.log(
          `[ScraperClient] stream resuelto: ${sourceName} → ${res.data.stream.url.slice(0, 80)}... (${res.data.timing}ms)`
        )
        return {
          streamUrl: res.data.stream.url,
          needsTranscode: false,
          audioTracks: [],
          duration: 0,
          infoHash: '',
          fileName: '',
          fileSize: 0,
        }
      }
      throw new Error(res.data?.error || 'Stream no encontrado')
    } catch (err: unknown) {
      if (axios.isAxiosError(err) && err.code === 'ECONNREFUSED') {
        throw new Error('Servicio de streaming no disponible (scraper-api apagada)')
      }
      throw new Error(err instanceof Error ? err.message : 'Error al resolver stream')
    }
  }

  /**
   * Health check rápido (2s timeout) para saber si la scraper-api está corriendo.
   */
  async isAvailable(): Promise<boolean> {
    try {
      await axios.get(`${SCRAPER_API_URL}/api/health`, { timeout: 2000 })
      return true
    } catch {
      return false
    }
  }

  /**
   * Mapea SearchResult → TorrentResult (compatible con WatchPage)
   */
  private mapResults(results: ScraperSearchResult[]): TorrentResult[] {
    return results
      .filter((r) => r.seeders > 0 && (r.magnet || r.url)) // torrents o streaming
      .map((r) => ({
        title: r.title,
        magnet: r.magnet || '',
        seeders: r.seeders,
        leechers: r.leechers,
        size: r.size,
        quality: r.quality,
        source: `${r.sourceName} (scraper)`,
        webFriendly: r.webFriendly,
        score: r.score,
        detailUrl: r.url || undefined, // streaming directo
      }))
  }
}
