/** Resultado de búsqueda unificado (cualquier fuente) */
export interface SearchResult {
  id: string           // ID único: "yts:1234" o "dontorrent:5678"
  title: string
  year: number | null
  source: string       // "yts", "dontorrent", "gnula", etc.
  sourceName: string   // "YTS", "DonTorrent", "Gnula", etc.
  quality: string      // "1080p", "4K", "HD", etc.
  size: string         // "2.1 GB" o "Unknown"
  seeders: number
  leechers: number
  magnet?: string      // URL magnet (torrents)
  url?: string         // URL directa de streaming
  audioLang: string[]  // ["latino", "castellano", "english"]
  webFriendly: boolean // true si es streaming directo o MP4 sin transcode
  infoHash?: string    // hash del torrent
  score: number        // puntaje interno para ordenar
}

/** Respuesta del endpoint /api/search */
export interface SearchResponse {
  query: string
  year?: number
  results: SearchResult[]
  total: number
  cached: boolean
  sourcesTried: number
  sourcesSucceeded: number
  timing: number       // ms totales
}

/** Resultado del endpoint /api/stream */
export interface StreamResult {
  url: string
  type: 'hls' | 'mp4'
  quality: string
  source: string       // "gnula", "cuevana", etc.
  sourceName: string
  headers?: Record<string, string>
  subtitles?: Array<{ url: string; lang: string }>
}

/** Respuesta del endpoint /api/stream */
export interface StreamResponse {
  success: boolean
  stream?: StreamResult
  error?: string
  timing: number
}

/** Estado de una fuente */
export interface SourceStatus {
  id: string
  name: string
  enabled: boolean
  lastSuccess: number | null  // timestamp
  lastError: string | null
  totalRequests: number
  successRate: number         // 0-1
}

/** Configuración de cada scraper */
export interface ScraperConfig {
  id: string
  name: string
  enabled: boolean
  timeout: number        // ms
  priority: number       // menor = más prioritario
}
