import express from 'express'
import cors from 'cors'
import { config } from 'dotenv'
import { ScraperCache } from './cache'
import { SearchGateway } from './gateway'
import { YtsScraper } from './scrapers/yts'
import { DonTorrentScraper } from './scrapers/dontorrent'
import { GnulaScraper } from './scrapers/gnula'
import { CuevanaScraper } from './scrapers/cuevana'
import { PirateBayScraper } from './scrapers/thepiratebay'
import { X1337Scraper } from './scrapers/x1337'
import { JackettScraper } from './scrapers/jackett'
import { CometaScraper } from './scrapers/cometa'
import { browserPool } from './browser-pool'

// Cargar variables de entorno
config()

const PORT = parseInt(process.env.PORT || '3001')
// Secreto compartido entre este proceso y el cliente Electron (scraper-client.ts)
// — sin esto, cualquier proceso/página que le hable a localhost:3001 podía
// disparar scraping y usar /api/stream como proxy SSRF gratuito.
const INTERNAL_KEY = process.env.SCRAPER_INTERNAL_KEY || ''
if (!INTERNAL_KEY) {
  console.warn(
    '[API] ⚠️  SCRAPER_INTERNAL_KEY no configurada — el servidor acepta requests sin autenticar. Configurala en .env para producción.'
  )
}

const app = express()
const cache = new ScraperCache()
const gateway = new SearchGateway(cache)

// ─── Registrar scrapers ──────────────────────────────────────────
gateway.register(new YtsScraper(cache))
gateway.register(new CometaScraper(cache)) // agregador Stremio (Comet) — busca por imdbId, incluye audio ES real
gateway.register(new JackettScraper(cache)) // indexers ES reales (EliteTorrent, DonTorrent, MejorTorrent...) vía Jackett
gateway.register(new DonTorrentScraper(cache))
gateway.register(new GnulaScraper(cache))
gateway.register(new CuevanaScraper(cache))
gateway.register(new PirateBayScraper(cache))
gateway.register(new X1337Scraper(cache))

// ─── Middleware ──────────────────────────────────────────────────
// El único consumidor legítimo es el proceso Electron local (carga desde
// file:// o localhost:5173 en dev) — no un navegador de terceros.
app.use(
  cors({
    origin: ['http://localhost:5173', 'file://'],
  })
)
app.use(express.json())

// Autenticación simple por secreto compartido (ver INTERNAL_KEY arriba).
// /api/health queda afuera para poder diagnosticar sin la key.
app.use((req, res, next) => {
  if (req.path === '/api/health' || !INTERNAL_KEY) return next()
  if (req.get('X-Internal-Key') !== INTERNAL_KEY) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }
  next()
})

// Rate-limit mínimo sin dependencias nuevas: cota simple de requests por IP
// en una ventana deslizante, para no dejar que N requests concurrentes
// agoten el browser-pool (cada búsqueda en Gnula/Cuevana abre un contexto
// Chromium nuevo sin límite superior propio).
const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX = 30
const requestLog = new Map<string, number[]>()

function rateLimit(req: express.Request, res: express.Response, next: express.NextFunction) {
  const key = req.ip || 'unknown'
  const now = Date.now()
  const timestamps = (requestLog.get(key) || []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS)
  if (timestamps.length >= RATE_LIMIT_MAX) {
    res.status(429).json({ error: 'Too many requests' })
    return
  }
  timestamps.push(now)
  requestLog.set(key, timestamps)
  next()
}

// ─── Endpoints ───────────────────────────────────────────────────

/** Búsqueda en todas las fuentes */
app.get('/api/search', rateLimit, async (req, res) => {
  try {
    const query = req.query.q as string
    const year = req.query.year ? parseInt(req.query.year as string) : undefined
    const lang = req.query.lang as string | undefined
    const imdbId = req.query.imdbId as string | undefined
    const season = req.query.season ? parseInt(req.query.season as string) : undefined
    const episode = req.query.episode ? parseInt(req.query.episode as string) : undefined
    const show = season != null && episode != null ? { season, episode } : undefined

    if (!query || query.length < 2) {
      res.status(400).json({ error: 'Query too short. Use ?q=title' })
      return
    }

    const result = await gateway.search(query, year, lang, imdbId, show)
    res.json(result)
  } catch (err) {
    console.error('[API] /api/search error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

/** Resuelve URL de stream directo desde una fuente */
app.get('/api/stream', rateLimit, async (req, res) => {
  try {
    const source = req.query.source as string
    const url = req.query.url as string

    if (!source || !url) {
      res.status(400).json({ error: 'Required: ?source=gnula&url=https://...' })
      return
    }

    const result = await gateway.resolveStream(source, url)
    if (!result.success) {
      res.status(404).json(result)
      return
    }

    res.json(result)
  } catch (err) {
    console.error('[API] /api/stream error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

/** Lista fuentes disponibles con estado */
app.get('/api/sources', (_req, res) => {
  const sources = gateway.getSourcesStatus()
  res.json({ sources })
})

/** Health check + stats */
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    cache: cache.getStats(),
    scrapers: gateway.getSourcesStatus(),
  })
})

// ─── Shutdown graceful ───────────────────────────────────────────
process.on('SIGINT', async () => {
  console.log('\n[API] Cerrando servidor...')
  await browserPool.shutdown()
  process.exit(0)
})

process.on('SIGTERM', async () => {
  console.log('\n[API] Cerrando servidor...')
  await browserPool.shutdown()
  process.exit(0)
})

// ─── Iniciar servidor ────────────────────────────────────────────

// Bind explícito a loopback: este servicio es de uso exclusivamente local
// (el cliente Electron en la misma máquina), no debe ser alcanzable desde
// la LAN aunque el resto de las defensas fallaran.
app.listen(PORT, '127.0.0.1', () => {
  console.log(`
╔══════════════════════════════════╗
║    Y-CINEMA Scraper API v2.0    ║
║    http://localhost:${PORT}         ║
╚══════════════════════════════════╝
  `)
  console.log(`[API] Endpoints:`)
  console.log(`[API]   GET /api/search?q=title&year=2024`)
  console.log(`[API]   GET /api/stream?source=gnula&url=...`)
  console.log(`[API]   GET /api/sources`)
  console.log(`[API]   GET /api/health`)
  console.log(`[API] Scrapers registrados: ${gateway.getSourcesStatus().length}`)
  console.log(`[API]   - YTS (YIFY) — torrents`)
  console.log(
    `[API]   - Jackett — indexers ES (EliteTorrent/DonTorrent/MejorTorrent...) ${
      process.env.JACKETT_URL && process.env.JACKETT_API_KEY ? '(configurado)' : '(sin configurar, ver .env.example)'
    }`
  )
  console.log(`[API]   - DonTorrent — torrents`)
  console.log(`[API]   - Gnula — streaming directo (Playwright)`)
  console.log(`[API]   - Cuevana — streaming directo (Playwright)`)
  console.log(`[API]   - ThePirateBay — torrents`)
  console.log(`[API]   - 1337x — torrents`)
  console.log(`[API] Idiomas detectados: español, portugués, francés, alemán, italiano, japonés, coreano, chino, ruso, hindi, árabe, turco, neerlandés, polaco, sueco`)
})
