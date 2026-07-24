import * as http from 'http'
import { URL } from 'url'
import { spawn, execFile, ChildProcess } from 'child_process'
import axios from 'axios'
import { assertPublicHttpUrl } from './url-guard'

// Binarios de ffmpeg/ffprobe (el replace hace que funcionen empaquetados con asar)
const ffmpegPath: string = require('ffmpeg-static').replace('app.asar', 'app.asar.unpacked')
const ffprobePath: string = require('ffprobe-static').path.replace('app.asar', 'app.asar.unpacked')

// Códecs de audio que Chromium decodifica nativamente; el resto (AC3, EAC3,
// DTS, TrueHD — lo habitual en MKV) se ve pero no se escucha → hay que transcodificar
const PLAYABLE_AUDIO = new Set(['aac', 'mp3', 'opus', 'vorbis', 'flac', 'pcm_s16le', 'pcm_f32le'])

/**
 * Decodifica un buffer de subtítulo a texto UTF-8 real. Muchos .srt en
 * español (OpenSubtitles, YIFY, releases viejos) vienen en Latin-1/
 * Windows-1252, no UTF-8 — decodificarlos siempre como UTF-8 corrompe
 * tildes/ñ (aparecen como "Ã±", "Ã©", etc.) aunque el header de respuesta
 * diga charset=utf-8. Heurística sin dependencias nuevas: si el resultado
 * de decodificar como UTF-8 contiene el patrón típico de mojibake
 * (secuencia "Ã" seguida de un byte de continuación), es Latin-1 mal leído
 * — se vuelve a decodificar como latin1, que sí produce el texto correcto.
 */
function decodeSubtitleBuffer(buf: Buffer): string {
  const asUtf8 = buf.toString('utf-8')
  const looksMojibake = /Ã[\x80-\xBF-¿]|â€™|â€œ|â€/.test(asUtf8)
  return looksMojibake ? buf.toString('latin1') : asUtf8
}

// Trackers extra que se suman a los del magnet para mejorar el
// descubrimiento de peers (los magnets de algunas fuentes traen trackers muertos)
const EXTRA_TRACKERS = [
  'udp://tracker.opentrackr.org:1337/announce',
  'udp://open.demonii.com:1337/announce',
  'udp://open.stealth.si:80/announce',
  'udp://tracker.torrent.eu.org:451/announce',
  'udp://exodus.desync.com:6969/announce',
  'udp://tracker.theoks.net:6969/announce',
  'udp://explodie.org:6969/announce',
  'udp://tracker.tiny-vps.com:6969/announce',
]

export interface AudioTrackInfo {
  index: number // índice relativo entre pistas de audio (para -map 0:a:<index>)
  codec: string
  language: string // código ISO de idioma o 'und'
  title?: string
}

export interface StreamInfo {
  streamUrl: string
  infoHash: string
  fileName: string
  fileSize: number
  fileType: string
  /** Duración en segundos detectada por ffprobe (0 si no se pudo) */
  duration: number
  /** true si el audio se transcodifica al vuelo (el seek reinicia el stream) */
  needsTranscode: boolean
  /** pistas de audio disponibles (para el selector de idioma de audio) */
  audioTracks: AudioTrackInfo[]
}

export class TorrentEngine {
  // webtorrent v3 es ESM-only: no se puede require() desde el build CommonJS,
  // así que el cliente se crea con import() dinámico la primera vez que se usa
  private clientPromise: Promise<any> | null = null
  private server: http.Server | null = null
  private activeTorrents: Map<string, { torrent: any; info: StreamInfo }> = new Map()
  private transcoders: Map<string, ChildProcess> = new Map()
  private port: number = 3456

  constructor() {
    this.startServer()
  }

  private getClient(): Promise<any> {
    if (!this.clientPromise) {
      // new Function evita que tsc (module: commonjs) transpile import() a require()
      const dynamicImport = new Function('s', 'return import(s)') as (s: string) => Promise<any>
      this.clientPromise = dynamicImport('webtorrent').then(
        (m) =>
          new m.default({
            // Más conexiones = descubre y descarga de peers más rápido
            maxConns: 100,
            // Subir agresivo ayuda al ratio con algunos trackers/peers
            uploadLimit: -1,
            downloadLimit: -1,
          })
      )
    }
    return this.clientPromise
  }

  private startServer() {
    this.server = http.createServer((req, res) => {
      // El <video crossOrigin="anonymous"> hace que sus <track> hijos pidan
      // los subtítulos en modo CORS real — el navegador manda un preflight
      // OPTIONS antes del GET. Sin responderlo, cancela la carga del <track>
      // en silencio (el subtítulo nunca llega a activarse, aunque un curl
      // directo al mismo GET funcione perfecto).
      if (req.method === 'OPTIONS') {
        res.writeHead(204, {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Range, Content-Type',
        })
        res.end()
        return
      }

      const parsed = new URL(req.url || '/', `http://localhost:${this.port}`)
      const pathParts = parsed.pathname.split('/').filter(Boolean)

      if (pathParts[0] === 'stream' && pathParts[1]) {
        this.handleStreamRequest(pathParts[1], req, res)
      } else if (pathParts[0] === 'transcode' && pathParts[1]) {
        this.handleTranscodeRequest(pathParts[1], parsed, res)
      } else if (pathParts[0] === 'subs' && pathParts[1] && pathParts[2]) {
        this.handleSubtitleRequest(pathParts[1], pathParts[2], req, res)
      } else if (pathParts[0] === 'proxy-subs') {
        // Proxy para subtítulos remotos (OpenSubtitles) — evita CORS
        const remoteUrl = decodeURIComponent(parsed.pathname.replace('/proxy-subs/', ''))
        this.handleProxySubtitleRequest(remoteUrl, res)
      } else {
        res.writeHead(404)
        res.end('Not found')
      }
    })

    this.server.listen(this.port, () => {
      console.log(`[TorrentEngine] Stream server on http://localhost:${this.port}`)
    })
  }

  // ─── Play ─────────────────────────────────────────────────────

  async play(magnetLink: string): Promise<StreamInfo> {
    // Si ya tenemos este torrent, devolver el stream existente
    const existing = this.findByMagnet(magnetLink)
    if (existing) return existing.info

    const client = await this.getClient()

    return new Promise((resolve, reject) => {
      let settled = false

      // Timeout de 60 segundos: si no llega la metadata, sacar el torrent
      // del cliente para que un reintento no falle por duplicado
      const timeout = setTimeout(() => {
        if (settled) return
        settled = true
        try {
          client.remove(magnetLink)
        } catch {
          /* puede no estar agregado aún */
        }
        reject(new Error('Timeout: torrent took too long to connect'))
      }, 60000)

      client.add(magnetLink, { strategy: 'sequential', announce: EXTRA_TRACKERS }, (torrent: any) => {
        if (settled) return
        const videoFile = torrent.files.find((f: any) =>
          f.name.endsWith('.mp4') ||
          f.name.endsWith('.mkv') ||
          f.name.endsWith('.avi') ||
          f.name.endsWith('.webm') ||
          f.name.endsWith('.m4v')
        )

        if (!videoFile) {
          settled = true
          clearTimeout(timeout)
          client.remove(torrent.infoHash)
          reject(new Error('No video file found in torrent'))
          return
        }

        // Priorizar el principio y el final del archivo (moov atom / headers)
        // para que el player pueda arrancar cuanto antes
        try {
          videoFile.select()
          torrent.critical?.(0, Math.min(8, torrent.pieces.length - 1))
        } catch {
          /* algunas versiones no exponen critical */
        }

        const directUrl = `http://localhost:${this.port}/stream/${torrent.infoHash}`
        const ext = (videoFile.name.split('.').pop() || 'mp4').toLowerCase()
        const info: StreamInfo = {
          streamUrl: directUrl,
          infoHash: torrent.infoHash,
          fileName: videoFile.name,
          fileSize: videoFile.length,
          fileType: ext,
          duration: 0,
          needsTranscode: false,
          audioTracks: [],
        }

        this.activeTorrents.set(torrent.infoHash, { torrent, info })

        settled = true
        clearTimeout(timeout)

        // MP4/M4V/WebM (típico de YTS y web releases): H.264+AAC casi siempre.
        // Arrancar directo SIN esperar a ffprobe — el probe corre en segundo
        // plano solo para conseguir la duración; si detecta audio no soportado
        // el player recibirá la corrección al reintentar. Esto es lo que baja
        // el arranque de minutos a segundos.
        const likelyPlayable = ext === 'mp4' || ext === 'm4v' || ext === 'webm'

        if (likelyPlayable) {
          resolve(info)
          // Duración en segundo plano (no bloquea la reproducción)
          this.probeStream(directUrl)
            .then(({ audioCodec, duration, audioTracks }) => {
              info.duration = duration
              info.audioTracks = audioTracks
              if (audioCodec && !PLAYABLE_AUDIO.has(audioCodec)) {
                // Caso raro para mp4: marcar para que un reintento transcodifique
                info.needsTranscode = true
                info.streamUrl = `http://localhost:${this.port}/transcode/${torrent.infoHash}`
              }
              console.log(`[TorrentEngine] ${audioTracks.length} pista(s) de audio:`, audioTracks.map((t) => t.language).join(', '))
            })
            .catch(() => {})
          return
        }

        // MKV/AVI: sí esperamos el probe, porque suelen traer audio DTS/AC3
        this.probeStream(directUrl)
          .then(({ audioCodec, duration, audioTracks }) => {
            info.duration = duration
            info.audioTracks = audioTracks
            if (!audioCodec || !PLAYABLE_AUDIO.has(audioCodec)) {
              info.needsTranscode = true
              info.streamUrl = `http://localhost:${this.port}/transcode/${torrent.infoHash}`
              console.log(`[TorrentEngine] audio "${audioCodec}" → transcodificando`)
            }
            console.log(`[TorrentEngine] ${audioTracks.length} pista(s) de audio:`, audioTracks.map((t) => t.language).join(', '))
            resolve(info)
          })
          .catch(() => {
            // Probe falló: asumir transcode para contenedores problemáticos
            info.needsTranscode = true
            info.streamUrl = `http://localhost:${this.port}/transcode/${torrent.infoHash}`
            resolve(info)
          })
      })
    })
  }

  /** Lee códecs, duración y TODAS las pistas de audio (con idioma) vía ffprobe */
  private probeStream(
    url: string
  ): Promise<{ audioCodec: string | null; duration: number; audioTracks: AudioTrackInfo[] }> {
    return new Promise((resolve, reject) => {
      execFile(
        ffprobePath,
        [
          '-v', 'error',
          // codec + índice + tags de idioma/título de cada stream
          '-show_entries', 'stream=index,codec_type,codec_name:stream_tags=language,title',
          '-show_entries', 'format=duration',
          '-of', 'json',
          url,
        ],
        { timeout: 30000 },
        (err, stdout) => {
          if (err) return reject(err)
          try {
            const data = JSON.parse(stdout)
            const audioStreams = (data.streams || []).filter((s: any) => s.codec_type === 'audio')
            const audioTracks: AudioTrackInfo[] = audioStreams.map((s: any, i: number) => ({
              index: i, // índice relativo entre las pistas de audio (0,1,2…)
              codec: s.codec_name || 'unknown',
              language: s.tags?.language || 'und',
              title: s.tags?.title || undefined,
            }))
            const audio = audioStreams[0]
            resolve({
              audioCodec: audio?.codec_name || null,
              duration: parseFloat(data.format?.duration) || 0,
              audioTracks,
            })
          } catch (parseErr) {
            reject(parseErr)
          }
        }
      )
    })
  }

  /**
   * Sirve el video remuxeado a fMP4 con el audio transcodificado a AAC
   * (video copiado tal cual). Soporta ?ss=<segundos> para el seek: el
   * frontend reinicia el stream desde esa posición.
   */
  private handleTranscodeRequest(infoHash: string, parsed: URL, res: http.ServerResponse) {
    const entry = this.activeTorrents.get(infoHash)
    if (!entry) {
      res.writeHead(404)
      res.end('Torrent not found')
      return
    }

    // Un solo ffmpeg por torrent: matar el anterior si el seek pide otro punto
    const previous = this.transcoders.get(infoHash)
    if (previous) {
      previous.kill('SIGKILL')
      this.transcoders.delete(infoHash)
    }

    const ss = Math.max(0, parseFloat(parsed.searchParams.get('ss') || '0') || 0)
    // Pista de audio elegida (índice relativo entre las de audio); default 0
    const audioIdx = Math.max(0, parseInt(parsed.searchParams.get('audio') || '0') || 0)
    const inputUrl = `http://localhost:${this.port}/stream/${infoHash}`

    const args = ['-hide_banner', '-loglevel', 'error']
    if (ss > 0) args.push('-ss', String(ss))
    args.push(
      '-i', inputUrl,
      '-map', '0:v:0',
      '-map', `0:a:${audioIdx}?`, // pista de audio seleccionada
      '-c:v', 'copy',
      '-c:a', 'aac',
      '-ac', '2',
      '-b:a', '192k',
      '-f', 'mp4',
      '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
      'pipe:1'
    )
    console.log(`[TorrentEngine] transcode audio pista #${audioIdx} ss=${ss}`)

    const proc = spawn(ffmpegPath, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    this.transcoders.set(infoHash, proc)

    res.writeHead(200, {
      'Content-Type': 'video/mp4',
      'Access-Control-Allow-Origin': '*',
    })
    proc.stdout!.pipe(res)
    proc.stderr!.on('data', (chunk: Buffer) => {
      console.warn('[ffmpeg]', chunk.toString().trim())
    })
    proc.on('error', (err) => {
      console.error('[TorrentEngine] ffmpeg spawn failed:', err)
      if (!res.headersSent) res.writeHead(500)
      res.end()
    })

    res.on('close', () => {
      proc.kill('SIGKILL')
      if (this.transcoders.get(infoHash) === proc) this.transcoders.delete(infoHash)
    })
  }

  // ─── Stream Request ──────────────────────────────────────────

  private handleStreamRequest(infoHash: string, req: http.IncomingMessage, res: http.ServerResponse) {
    const entry = this.activeTorrents.get(infoHash)
    if (!entry) {
      res.writeHead(404)
      res.end('Torrent not found')
      return
    }

    const videoFile = entry.torrent.files.find((f: any) =>
      f.name.endsWith('.mp4') ||
      f.name.endsWith('.mkv') ||
      f.name.endsWith('.avi') ||
      f.name.endsWith('.webm') ||
      f.name.endsWith('.m4v')
    )

    if (!videoFile) {
      res.writeHead(500)
      res.end('No video file')
      return
    }

    // Soporte para Range requests (seeking)
    const range = req.headers.range
    const fileSize = videoFile.length

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-')
      const start = parseInt(parts[0], 10)
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1
      const chunksize = (end - start) + 1

      const stream = videoFile.createReadStream({ start, end })

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': 'video/mp4',
        'Access-Control-Allow-Origin': '*',
      })

      stream.pipe(res)
    } else {
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': 'video/mp4',
        'Accept-Ranges': 'bytes',
        'Access-Control-Allow-Origin': '*',
      })

      const stream = videoFile.createReadStream()
      stream.pipe(res)
    }
  }

  // ─── Subtitles Request ───────────────────────────────────────

  private handleSubtitleRequest(infoHash: string, fileName: string, _req: http.IncomingMessage, res: http.ServerResponse) {
    const entry = this.activeTorrents.get(infoHash)
    if (!entry) {
      res.writeHead(404)
      res.end('Torrent not found')
      return
    }

    const subFile = entry.torrent.files.find((f: any) => f.name === fileName)
    if (!subFile) {
      res.writeHead(404)
      res.end('Subtitle not found')
      return
    }

    // Servir subtítulos como VTT
    const isVtt = fileName.endsWith('.vtt')
    const isSrt = fileName.endsWith('.srt')

    if (isVtt || isSrt) {
      // Los .srt siempre se convierten a VTT en el body (abajo) — el header
      // decía "text/plain" para ellos, pero el contenido real enviado era
      // VTT. El navegador confía en el Content-Type declarado, no en el
      // contenido: al ver "text/plain" descartaba el <track> en silencio
      // (mode quedaba en 'showing' pero sin ningún cue real cargado).
      res.writeHead(200, {
        'Content-Type': 'text/vtt; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
      })

      const stream = subFile.createReadStream()

      if (isSrt) {
        // Convertir SRT a VTT on the fly. Acumular como Buffer (no string)
        // para poder aplicar decodeSubtitleBuffer al final — concatenar con
        // chunk.toString() fuerza UTF-8 antes de tiempo y corrompe tildes/ñ
        // si el .srt embebido viene en Latin-1 (frecuente en releases viejos).
        const chunks: Buffer[] = []
        stream.on('data', (chunk: Buffer) => chunks.push(chunk))
        stream.on('end', () => {
          const text = decodeSubtitleBuffer(Buffer.concat(chunks))
          const vtt = this.srtToVtt(text)
          res.end(vtt)
        })
      } else {
        stream.pipe(res)
      }
    } else {
      res.writeHead(415)
      res.end('Unsupported subtitle format')
    }
  }

  // ─── Proxy de subtítulos (OpenSubtitles) ──────────────────────

  /**
   * Cola de descargas de subtítulos con límite de concurrencia.
   * OpenSubtitles rate-limit a ~5 requests/minuto. Este semáforo evita
   * que 50 requests paralelos tiren 429.
   */
  private proxySubsConcurrency = 0
  private readonly PROXY_SUBS_MAX_CONCURRENT = 3
  private proxySubsQueue: Array<() => void> = []

  private async acquireProxySlot(): Promise<void> {
    if (this.proxySubsConcurrency < this.PROXY_SUBS_MAX_CONCURRENT) {
      this.proxySubsConcurrency++
      return
    }
    return new Promise((resolve) => {
      this.proxySubsQueue.push(resolve)
    })
  }

  private releaseProxySlot(): void {
    const next = this.proxySubsQueue.shift()
    if (next) {
      next()
    } else {
      this.proxySubsConcurrency--
    }
  }

  /** Cache de subtítulos ya descargados (por file_id) */
  private proxySubsCache = new Map<string, { content: string; time: number }>()
  private readonly PROXY_SUBS_CACHE_TTL = 10 * 60 * 1000 // 10 min

  /** Helper: respuesta CORS genérica para errores */
  private corsError(res: http.ServerResponse, status: number, msg: string): void {
    res.writeHead(status, {
      'Access-Control-Allow-Origin': '*',
      'Content-Type': 'text/plain',
    })
    res.end(msg)
  }

  /**
   * Proxy para subtítulos de OpenSubtitles.
   * Soporta dos formatos de URL:
   *   - "os:file_id:N" → hace POST a /api/v1/download con file_id
   *   - URL normal → GET directo (para otros proveedores)
   * Devuelve el contenido como VTT con CORS headers.
   *
   * ⚠️ Límite de concurrencia: max 3 descargas simultáneas para no
   * saturar la API de OpenSubtitles (rate-limit ~5 req/min).
   */
  private async handleProxySubtitleRequest(remoteUrl: string, res: http.ServerResponse) {
    const apiKey = process.env.VITE_OPENSUBTITLES_API_KEY || ''
    if (!apiKey) {
      this.corsError(res, 401, 'OpenSubtitles API key not configured')
      return
    }

    if (remoteUrl.startsWith('os:file_id:')) {
      const fileId = remoteUrl.replace('os:file_id:', '')

      // Cache hit?
      const cached = this.proxySubsCache.get(fileId)
      if (cached && Date.now() - cached.time < this.PROXY_SUBS_CACHE_TTL) {
        res.writeHead(200, {
          'Content-Type': 'text/vtt; charset=utf-8',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'max-age=3600',
        })
        res.end(cached.content)
        return
      }

      // Esperar slot libre (límite de concurrencia)
      await this.acquireProxySlot()

      try {
        console.log(`[ProxySubs] Descargando file_id=${fileId}...`)

        // Paso 1: POST a /api/v1/download para obtener el link temporal
        const postRes = await axios.post(
          'https://api.opensubtitles.com/api/v1/download',
          { file_id: parseInt(fileId) },
          {
            headers: {
              'Api-Key': apiKey,
              'User-Agent': 'Y-CINEMA v1.0',
              'Content-Type': 'application/json',
            },
            timeout: 10000,
          }
        )

        if (!postRes.data?.link) {
          console.warn('[ProxySubs] POST download no devolvió link:', JSON.stringify(postRes.data))
          this.corsError(res, 502, 'No download link returned')
          return
        }

        // Defensa en profundidad: el link temporal viene de una respuesta
        // JSON de un tercero (OpenSubtitles) — validar que sea http(s) y no
        // resuelva a red interna antes de fetchearlo, aunque en la práctica
        // siempre apunte a su propia CDN.
        try {
          await assertPublicHttpUrl(postRes.data.link)
        } catch (err) {
          console.warn('[ProxySubs] link de descarga rechazado:', (err as Error).message)
          this.corsError(res, 502, 'Invalid download link')
          return
        }

        // Paso 2: GET al link temporal para obtener el .srt
        const fileRes = await axios.get(postRes.data.link, {
          responseType: 'arraybuffer',
          timeout: 15000,
          headers: { 'User-Agent': 'Y-CINEMA v1.0' },
        })

        let subtitleContent = decodeSubtitleBuffer(Buffer.from(fileRes.data))

        // Convertir SRT a VTT
        if (!subtitleContent.startsWith('WEBVTT')) {
          subtitleContent = 'WEBVTT\n\n' + subtitleContent
            .replace(/\r\n/g, '\n')
            .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2')
        }

        // Cachear
        this.proxySubsCache.set(fileId, { content: subtitleContent, time: Date.now() })

        res.writeHead(200, {
          'Content-Type': 'text/vtt; charset=utf-8',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'max-age=3600',
        })
        res.end(subtitleContent)
      } catch (err) {
        console.warn('[ProxySubs] Error:', (err as Error).message)
        if (axios.isAxiosError(err) && err.response?.status === 429) {
          this.corsError(res, 429, 'Rate limited by OpenSubtitles')
        } else {
          this.corsError(res, 502, 'Proxy error')
        }
      } finally {
        this.releaseProxySlot()
      }
    } else {
      // Antes existía una rama que aceptaba cualquier URL cuyo string
      // contuviera "opensubtitles.com" o "yifysubtitles" (via .includes(),
      // bypasseable con algo como "http://evil.com/opensubtitles.com") y le
      // reenviaba la Api-Key de OpenSubtitles en los headers — un open proxy
      // que filtraba la key a cualquier host. Ningún caller real la usaba
      // (subtitle-service.ts solo genera "os:file_id:N"), así que se elimina
      // en vez de intentar arreglar la validación.
      this.corsError(res, 400, 'Unsupported subtitle source')
    }
  }

  // ─── Helpers ─────────────────────────────────────────────────

  getProgress(infoHash: string): number {
    const entry = this.activeTorrents.get(infoHash)
    return entry ? entry.torrent.progress : 0
  }

  /** Estado de descarga para el overlay de "conectando" (peers, velocidad, buffer) */
  getStatus(infoHash: string): { peers: number; downloadSpeed: number; progress: number; downloaded: number } {
    const entry = this.activeTorrents.get(infoHash)
    if (!entry) return { peers: 0, downloadSpeed: 0, progress: 0, downloaded: 0 }
    const t = entry.torrent
    return {
      peers: t.numPeers || 0,
      downloadSpeed: t.downloadSpeed || 0,
      progress: t.progress || 0,
      downloaded: t.downloaded || 0,
    }
  }

  getSubtitles(infoHash: string): Array<{ name: string; url: string; lang?: string }> {
    const entry = this.activeTorrents.get(infoHash)
    if (!entry) return []

    return entry.torrent.files
      .filter((f: any) => /\.(srt|vtt|ass)$/i.test(f.name))
      .map((f: any) => ({
        name: f.name,
        url: `http://localhost:${this.port}/subs/${infoHash}/${f.name}`,
        lang: this.detectLanguage(f.name),
      }))
  }

  stop(infoHash: string) {
    const transcoder = this.transcoders.get(infoHash)
    if (transcoder) {
      transcoder.kill('SIGKILL')
      this.transcoders.delete(infoHash)
    }
    const entry = this.activeTorrents.get(infoHash)
    if (entry) {
      this.clientPromise?.then((c) => c.remove(infoHash)).catch(() => {})
      this.activeTorrents.delete(infoHash)
    }
  }

  destroy() {
    this.activeTorrents.forEach((_, hash) => this.stop(hash))
    this.clientPromise?.then((c) => c.destroy()).catch(() => {})
    this.server?.close()
  }

  private findByMagnet(magnet: string): { info: StreamInfo } | undefined {
    for (const [, entry] of this.activeTorrents) {
      if (entry.torrent.magnetURI === magnet) return entry
    }
    return undefined
  }

  private detectLanguage(fileName: string): string {
    const name = fileName.toLowerCase()
    if (name.includes('spanish') || name.includes('español') || name.includes('esp') || name.includes('_es') || name.includes('.es.')) return 'Español'
    if (name.includes('english') || name.includes('_en') || name.includes('.en.')) return 'English'
    if (name.includes('multi') || name.includes('v2')) return 'Multi'
    return 'Unknown'
  }

  private srtToVtt(srt: string): string {
    let vtt = 'WEBVTT\n\n'
    vtt += srt
      .replace(/\r\n/g, '\n')
      .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2')
    return vtt
  }
}
