import { app, BrowserWindow, ipcMain, session } from 'electron'
import path from 'path'
import axios from 'axios'
import { config } from 'dotenv'
import { spawn, execFile, type ChildProcess } from 'child_process'
import { TorrentSearch } from './modules/torrent-search'
import { TorrentEngine } from './modules/torrent-engine'
import { HistoryStore } from './modules/history'
import { SubtitleEngine } from './modules/subtitles'
import { StreamProvider } from './modules/stream-provider'
import { LanguagePreferencesStore, type LanguagePreferences } from './modules/language-preferences'
import { SubtitleService } from './modules/subtitle-service'
import { CacheStore } from './modules/cache-store'
import { ScraperClient } from './modules/scraper-client'
import { YCinemaApiClient } from './modules/y-cinema-api-client'
import { mediaToMediaDetails, mediaToMovie, searchDocToMovie } from './modules/y-cinema-api-mappers'
import { AuthStore } from './modules/auth-store'

// Cargar variables de entorno desde .env para el main process
config()

let mainWindow: BrowserWindow | null = null
let torrentEngine: TorrentEngine | null = null
let historyStore: HistoryStore | null = null
let scraperApiProcess: ChildProcess | null = null

const isDev = !app.isPackaged || process.argv.includes('--dev')

// ─── scraper-api como proceso hijo ──────────────────────
// Cometa, Jackett, DonTorrent, Gnula, Cuevana viven en este servicio Express
// separado (puerto 3001). Antes solo arrancaba si el usuario corría
// `npm run dev:electron` o los scripts .bat/.ps1 — si abrías la app de
// cualquier otra forma (doble-click al .exe empaquetado), quedaba caído
// en silencio y la app degradaba a solo YTS/TPB/Nyaa (mucho más limitado,
// sin cobertura en español). Ahora se lanza siempre junto con Electron.
async function startScraperApi() {
  if (isDev) {
    // Ya lo levanta `npm run dev:electron` vía concurrently; evitar duplicar
    // el proceso si Electron se relanza (ej. hot-restart del propio Electron)
    return
  }

  // Si ya hay un scraper-api sano corriendo en el puerto (proceso huérfano de
  // una sesión anterior que no se cerró bien), reutilizarlo en vez de
  // spawnear uno nuevo — spawnear encima causaría EADDRINUSE y un crash
  // silencioso del proceso hijo nuevo.
  try {
    await axios.get('http://localhost:3001/api/health', { timeout: 2000 })
    console.log('[scraper-api] ya hay una instancia sana en el puerto 3001, no se relanza')
    return
  } catch {
    // no responde — puerto libre o proceso muerto, seguir con el spawn normal
  }

  const scraperEntry = path.join(process.resourcesPath, 'scraper-api', 'dist', 'index.js')
  scraperApiProcess = spawn(process.execPath, [scraperEntry], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', PORT: '3001' },
    stdio: 'pipe',
  })

  scraperApiProcess.stdout?.on('data', (d) => console.log(`[scraper-api] ${d.toString().trim()}`))
  scraperApiProcess.stderr?.on('data', (d) => console.error(`[scraper-api] ${d.toString().trim()}`))
  scraperApiProcess.on('exit', (code) => {
    // code !== 0 mientras la app sigue corriendo probablemente sea el puerto
    // ya ocupado por otro proceso (no necesariamente huérfano nuestro) — no
    // hay forma segura de reintentar automáticamente sin arriesgar un loop,
    // así que solo se deja constancia clara en logs para diagnosticar.
    console.warn(`[scraper-api] proceso terminado (code=${code})`)
    scraperApiProcess = null
  })
  scraperApiProcess.on('error', (err) => {
    console.error('[scraper-api] no se pudo iniciar:', err.message)
  })
}

function stopScraperApi() {
  if (!scraperApiProcess || scraperApiProcess.killed || !scraperApiProcess.pid) return
  const pid = scraperApiProcess.pid
  scraperApiProcess = null

  if (process.platform === 'win32') {
    // scraper-api puede haber lanzado Chromium/Playwright como subprocesos
    // (Gnula/Cuevana) — un kill() normal solo mata el proceso node.js y deja
    // esos nietos huérfanos, consumiendo RAM y ocupando el puerto 3001 en el
    // siguiente arranque. taskkill /t mata el árbol completo.
    execFile('taskkill', ['/pid', String(pid), '/t', '/f'], () => {})
  } else {
    process.kill(-pid, 'SIGKILL')
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'Y-CINEMA',
    backgroundColor: '#09090B',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  // CSP — en dev hay que permitir el preamble inline de @vitejs/plugin-react
  // y el websocket de HMR; en producción queda estricta
  const csp = [
    "default-src 'self'",
    isDev ? "script-src 'self' 'unsafe-inline'" : "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' https://image.tmdb.org https://img.youtube.com https://static.tvmaze.com https://s4.anilist.co https://*.media-amazon.com data: blob:",
    "media-src 'self' blob: http://localhost:*",
    "font-src 'self' https://fonts.gstatic.com",
    "frame-src https://www.youtube.com https://www.youtube-nocookie.com",
    // Estas llamadas se originan en el proceso principal (Node), no en el
    // renderer, así que el CSP del webContents no las bloquea hoy — pero la
    // whitelist quedaba incompleta/engañosa frente a los dominios reales que
    // la app contacta, lo cual confunde a futuro si algún día se llaman
    // directo desde el frontend. Catálogo (TMDB/TVMaze/AniList/etc.) ya no
    // se llama directo — pasa por y-cinema-api (http://localhost:*).
    `connect-src 'self' https://apibay.org https://nyaa.si https://yts.mx https://api.opensubtitles.com http://localhost:*${isDev ? ' ws://localhost:*' : ''}`,
  ].join('; ')

  // Solo inyectar la CSP en las respuestas del propio origen de la app — sin
  // este filtro, onHeadersReceived pisaba TAMBIÉN la CSP legítima de páginas
  // externas cargadas dentro de un <iframe> (ej. el embed de trailers en
  // youtube-nocookie.com), bloqueando su propio contenido con una política
  // pensada para el HTML de Y-CINEMA, no para la página externa.
  const appOrigin = isDev ? 'http://localhost:5173' : 'file://'
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    if (!details.url.startsWith(appOrigin)) {
      callback({ responseHeaders: details.responseHeaders })
      return
    }
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp],
      },
    })
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// ─── IPC Handlers ────────────────────────────────────────

function registerIpcHandlers() {
  const cache = new CacheStore()
  const authStore = new AuthStore()
  const catalogApi = new YCinemaApiClient(cache, authStore)
  const torrentSearch = new TorrentSearch()
  torrentEngine = new TorrentEngine()
  historyStore = new HistoryStore()
  const subtitles = new SubtitleEngine()
  const streamProvider = new StreamProvider()
  const langPrefs = new LanguagePreferencesStore()
  const subtitleService = new SubtitleService(subtitles, langPrefs)
  const scraper = new ScraperClient()

  // catalogApi — cliente al backend compartido de catálogo (y-cinema-api),
  // reemplaza tmdb/tvmaze/anilist/unified para home/detalle/búsqueda.
  ipcMain.handle('catalogApi:list', async (_event, params) => {
    const raw = await catalogApi.list(params)
    return { ...raw, items: raw.items.map(mediaToMovie) }
  })
  ipcMain.handle('catalogApi:getDetails', async (_event, id: string) => {
    const media = await catalogApi.getById(id)
    return media ? mediaToMediaDetails(media) : null
  })
  ipcMain.handle('catalogApi:search', async (_event, q: string, opts) => {
    const res = await catalogApi.search(q, opts)
    return { ...res, items: res.items.map(searchDocToMovie) }
  })
  ipcMain.handle('catalogApi:getGenres', async () => catalogApi.getGenres())

  // Auth — login/registro opcional contra Supabase Auth (favoritos/
  // historial siguen siendo anónimos y locales, sin cambios).
  ipcMain.handle('auth:signIn', async (_event, email: string, password: string) =>
    authStore.signIn(email, password)
  )
  ipcMain.handle('auth:signUp', async (_event, email: string, password: string) =>
    authStore.signUp(email, password)
  )
  ipcMain.handle('auth:signOut', async () => authStore.signOut())
  ipcMain.handle('auth:getSession', async () => authStore.getSession())

  // Torrent — prueba scraper-api e internos en paralelo, toma scraper si
  // llega primero, sino usa internos (sin penalización de timeout)
  ipcMain.handle(
    'torrent:search',
    async (
      _event,
      query: string,
      year?: number,
      imdbId?: string,
      show?: { season: number; episode: number }
    ) => {
    // El scraper-api ya rankea por idioma (LANG_WEIGHTS + peso extra para el
    // preferido); pasarle el idioma preferido del usuario para que Gnula/Cuevana
    // (español) no terminen compitiendo en igualdad con YTS/TPB (inglés).
    const audio = langPrefs.get().audio

    // Correr ambos en paralelo — scraper-api (25s timeout interno) e internos
    const [scraperResults, internalResults] = await Promise.all([
      scraper.search(query, year, audio, imdbId, show),
      torrentSearch.search(query, year),
    ])

    if (scraperResults.length === 0 && internalResults.length === 0) {
      return []
    }

    // El scraper ya viene ordenado por su propio ranking (idioma incluido) —
    // preservar ese orden. Los internos (TPB, Nyaa, YTS, todos en inglés) solo
    // rellenan lo que el scraper no cubrió, siempre después.
    const combined = [...scraperResults]
    for (const ir of internalResults) {
      const isDuplicate = combined.some(
        (cr) => cr.magnet === ir.magnet || cr.title.toLowerCase() === ir.title.toLowerCase()
      )
      if (!isDuplicate) combined.push(ir)
    }

      return combined.slice(0, 20)
    }
  )

  ipcMain.handle('torrent:play', async (_event, magnetLink: string) => {
    return torrentEngine!.play(magnetLink)
  })

  ipcMain.handle('torrent:stop', async (_event, hash: string) => {
    torrentEngine!.stop(hash)
  })

  ipcMain.handle('torrent:progress', async (_event, hash: string) => {
    return torrentEngine!.getProgress(hash)
  })

  ipcMain.handle('torrent:status', async (_event, hash: string) => {
    return torrentEngine!.getStatus(hash)
  })

  // Stream directo HTTP (reemplazo de torrent:search + torrent:play)
  ipcMain.handle(
    'stream:search',
    async (
      _event,
      tmdbId: string | number,
      title: string,
      year?: number,
      type?: string,
      show?: { season: number; episode: number },
      imdbId?: string
    ) => {
      return streamProvider.search(tmdbId, title, year, type as 'movie' | 'show', show, imdbId)
    }
  )

  ipcMain.handle(
    'stream:fallback',
    async (
      _event,
      title: string,
      year?: number,
      tmdbId?: string | number,
      type?: string,
      show?: { season: number; episode: number },
      imdbId?: string
    ) => {
      return streamProvider.searchFallback(title, year, tmdbId ?? 0, type as 'movie' | 'show', show, imdbId)
    }
  )

  ipcMain.handle('stream:logs', async (_event, limit?: number) => {
    return streamProvider.getLogs(limit)
  })

  ipcMain.handle('stream:clearLogs', async () => {
    streamProvider.clearLogs()
  })

  ipcMain.handle(
    'stream:testProvider',
    async (
      _event,
      tmdbId: number | string,
      title: string,
      year?: number,
      type?: string,
      show?: { season: number; episode: number },
      imdbId?: string
    ) => {
      return streamProvider.testSingleProvider(tmdbId, title, year, type as 'movie' | 'show', show, imdbId)
    }
  )

  // ─── Preferencias de idioma (Fase 4) ────────────────────────
  ipcMain.handle('lang:get', async () => langPrefs.get())
  ipcMain.handle('lang:set', async (_event, prefs: Partial<LanguagePreferences>) =>
    langPrefs.set(prefs)
  )
  ipcMain.handle('lang:reset', async () => langPrefs.reset())
  // Patrones del idioma de audio preferido (para priorizar releases al buscar)
  ipcMain.handle('lang:audioMatchers', async () => langPrefs.getAudioMatchers())

  // ─── Subtítulos automáticos (Fase 5) ────────────────────────
  ipcMain.handle(
    'subtitles:find',
    async (
      _event,
      title: string,
      opts?: {
        year?: number
        season?: number
        episode?: number
        infoHash?: string
        tmdbId?: number
        mediaType?: 'movie' | 'episode'
      }
    ) => subtitleService.findSubtitles(title, opts || {})
  )

  // Estado de OpenSubtitles para el diagnóstico (/debug/subtitles)
  ipcMain.handle('subtitles:status', async () => subtitles.getStatus())

  // Stream directo desde scraper-api (Gnula/Cuevana) — resuelve URL .m3u8
  ipcMain.handle(
    'stream:resolve',
    async (_event, sourceName: string, detailUrl: string) => scraper.resolveStream(sourceName, detailUrl)
  )

  // Scraper-client — health check
  ipcMain.handle('scraper:status', async () => ({
    available: await scraper.isAvailable(),
  }))

  // ─── Caché (Fase 9) ─────────────────────────────────────────
  ipcMain.handle('cache:clear', async () => cache.clear())

  // Subtitles
  ipcMain.handle('subtitles:getTorrent', async (_event, infoHash: string) => {
    return subtitles.getFromTorrent(infoHash)
  })

  // History
  ipcMain.handle('history:save', async (_event, entry: any) => {
    // Sin esta guarda, un duration<=0/NaN/Infinity persistía un progress
    // inválido que luego se renderizaba literalmente como "NaN% visto".
    if (!entry || !Number.isFinite(entry.duration) || entry.duration <= 0) return
    if (!Number.isFinite(entry.progress)) return
    return historyStore!.saveProgress(entry)
  })

  ipcMain.handle('history:get', async () => {
    return historyStore!.getHistory()
  })

  ipcMain.handle('history:continueWatching', async () => {
    return historyStore!.getContinueWatching()
  })

  ipcMain.handle('history:clear', async () => {
    return historyStore!.clearHistory()
  })

  // Favorites
  ipcMain.handle('favorites:add', async (_event, item: any) => {
    return historyStore!.addFavorite(item)
  })

  ipcMain.handle('favorites:remove', async (_event, id: number, mediaType: 'movie' | 'tv') => {
    return historyStore!.removeFavorite(id, mediaType)
  })

  ipcMain.handle('favorites:get', async () => {
    return historyStore!.getFavorites()
  })

  ipcMain.handle('favorites:isFavorite', async (_event, id: number, mediaType: 'movie' | 'tv') => {
    return historyStore!.isFavorite(id, mediaType)
  })
}

// ─── Error handling ─────────────────────────────────────

process.on('uncaughtException', (err) => {
  console.error('[Y-CINEMA] Uncaught exception:', err)
})

process.on('unhandledRejection', (reason) => {
  console.error('[Y-CINEMA] Unhandled rejection:', reason)
})

// ─── App lifecycle ──────────────────────────────────────

app.whenReady().then(() => {
  startScraperApi().catch((err) => console.error('[scraper-api] error al iniciar:', err.message))
  registerIpcHandlers()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  stopScraperApi()
  if (torrentEngine) {
    torrentEngine.destroy()
  }
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  stopScraperApi()
})
