import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { AlertCircle, CheckCircle2, Loader2, Star, XCircle } from 'lucide-react'
import VideoPlayer from '../components/player/VideoPlayer'
import { usePlayerStore } from '../stores/usePlayerStore'
import { displayTitle, displayYear, formatRuntime, rating1 } from '../lib/tmdb'
import type { MediaDetails, TorrentResult } from '../types/media'
import type { SubtitleTrack } from '../components/player/SubtitlesMenu'

type DiagnosticLog = { time: number; level: 'info' | 'warn' | 'error'; message: string; meta?: Record<string, unknown> }
type ProviderTest = { providerId: string; name: string; success: boolean; error?: string; timing: number; streamUrl?: string }

export default function WatchPage() {
  const { mediaType = 'movie', id } = useParams<{ mediaType: string; id: string }>()
  const [searchParams] = useSearchParams()
  const season = searchParams.get('s')
  const episode = searchParams.get('e')
  const navigate = useNavigate()
  const location = useLocation()
  // DetailPage ya cargó este Media — evita repetir el fetch. Si no está
  // presente (navegación directa por URL, deep link, refresh), cae al
  // fetch normal más abajo.
  const preloadedDetail = (location.state as { media?: MediaDetails } | null)?.media

  const {
    status,
    statusMessage,
    streamUrl,
    infoHash,
    quality,
    error,
    theaterMode,
    setStatus,
    setStream,
    setError,
    reset,
  } = usePlayerStore()

  const [detail, setDetail] = useState<MediaDetails | null>(null)
  const [startAt, setStartAt] = useState(0)
  const [transcode, setTranscode] = useState(false)
  const [mediaDuration, setMediaDuration] = useState(0)
  const [peers, setPeers] = useState(0)
  const [dlSpeed, setDlSpeed] = useState(0)
  const [subtitleTracks, setSubtitleTracks] = useState<SubtitleTrack[]>([])
  const [subtitleAuto, setSubtitleAuto] = useState<number | null>(null)
  const [audioTracks, setAudioTracks] = useState<Array<{ index: number; codec: string; language: string; title?: string }>>([])
  const [activeAudioIndex, setActiveAudioIndex] = useState(0)
  const [subtitleApiKey, setSubtitleApiKey] = useState<boolean | undefined>(undefined)
  const [diagLogs, setDiagLogs] = useState<DiagnosticLog[]>([])
  const [providerTests, setProviderTests] = useState<ProviderTest[] | null>(null)
  const [diagRunning, setDiagRunning] = useState(false)
  const detailRef = useRef<MediaDetails | null>(null)
  detailRef.current = detail

  // Cuando algo no está disponible, traer del backend el detalle de por qué:
  // logs de cada intento + prueba provider-por-provider del stream directo
  const runDiagnostics = useCallback(
    async (mediaId: string, title: string, year?: number) => {
      setDiagRunning(true)
      try {
        const logs = await window.api.stream.getLogs(60).catch(() => [])
        setDiagLogs(logs as DiagnosticLog[])
        console.log('[WatchPage] logs del backend:', logs)

        const mwType = mediaType === 'tv' ? 'show' : 'movie'
        const show =
          mediaType === 'tv' && season && episode
            ? { season: parseInt(season), episode: parseInt(episode) }
            : undefined
        // imdbId ayuda a providers como primewire ("No imdbId provided")
        const imdbId = (detailRef.current as MediaDetails & { external_ids?: { imdb_id?: string | null } })
          ?.external_ids?.imdb_id || undefined
        const tests = await window.api.stream
          .testProvider(mediaId, title, year, mwType, show, imdbId)
          .catch(() => [])
        setProviderTests(tests as ProviderTest[])
        console.log('[WatchPage] test de providers:', tests)

        // Refrescar logs (el test agrega más)
        const logs2 = await window.api.stream.getLogs(80).catch(() => logs)
        setDiagLogs(logs2 as DiagnosticLog[])
      } catch (err) {
        console.error('[WatchPage] diagnóstico falló', err)
      } finally {
        setDiagRunning(false)
      }
    },
    [mediaType, season, episode]
  )

  useEffect(() => {
    let cancelled = false

    async function start() {
      if (!id) return
      reset()
      const playbackStart = performance.now()
      setStatus('searching', 'Cargando información…')
      console.log(`[Playback] iniciando reproducción id=${id} type=${mediaType}`)
      try {
        const d: MediaDetails | null = preloadedDetail ?? (await window.api.catalogApi.getDetails(id))
        if (cancelled) return
        if (!d) {
          setError('Contenido no encontrado')
          return
        }
        setDetail(d)
        console.log(`[Playback] título: "${displayTitle(d)}" (${displayYear(d) || '?'})`)

        // Retomar desde el historial — para series, el progreso es POR
        // EPISODIO. Sin comparar season/episode, el progreso del último
        // episodio visto se aplicaba a cualquier episodio que se abriera.
        try {
          const history = await window.api.history.get()
          const seasonNum = season ? parseInt(season) : undefined
          const episodeNum = episode ? parseInt(episode) : undefined
          const entry = history.find(
            (h) =>
              h.id === id &&
              h.mediaType === mediaType &&
              h.season === seasonNum &&
              h.episode === episodeNum
          )
          if (entry && entry.progress > 0.05 && entry.progress < 0.9) {
            setStartAt(entry.currentTime)
          }
        } catch {
          /* sin historial no pasa nada */
        }

        const title = displayTitle(d)
        const year = displayYear(d)
        const query =
          mediaType === 'tv' && season && episode
            ? `${title} S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}`
            : title
        // Cometa (Stremio/Comet) solo busca por IMDB id, no por texto libre
        const imdbId = (d as MediaDetails & { external_ids?: { imdb_id?: string | null } })
          ?.external_ids?.imdb_id || undefined

        setStatus('searching', 'Buscando fuentes…')
        console.log(`[Torrent] buscando "${query}" year=${year || '?'}`)
        const tSearch = performance.now()
        const results: TorrentResult[] = await window.api.torrent.search(
          query,
          mediaType === 'movie' && year ? parseInt(year) : undefined,
          imdbId,
          mediaType === 'tv' && season && episode
            ? { season: parseInt(season), episode: parseInt(episode) }
            : undefined
        )
        if (cancelled) return
        console.log(
          `[Torrent] search devolvió ${results?.length || 0} resultados en ${Math.round(performance.now() - tSearch)}ms`
        )
        if (!results || results.length === 0) {
          // El scraper-api (Cometa, Jackett, DonTorrent, Gnula, Cuevana) aporta
          // la mayoría de la cobertura real — si está caído, decirlo explícito
          // en vez del mensaje genérico, que oculta la causa real del problema.
          const scraperUp = await window.api.scraper.status().then((s) => s.available).catch(() => false)
          setError(
            scraperUp
              ? `No encontramos ninguna fuente para "${title}".`
              : `No encontramos ninguna fuente para "${title}". El servicio de búsqueda ampliada (scraper-api) no está respondiendo — solo se buscó en YTS/ThePirateBay/Nyaa.`
          )
          runDiagnostics(id, title, year ? parseInt(year) : undefined)
          return
        }

        // Probar los mejores candidatos en orden: si uno no conecta, seguir con el próximo
        // Incluir tanto torrents (magnet) como streaming directo (detailUrl: Gnula, Cuevana)
        // Priorizar releases que coincidan con el idioma de audio preferido
        let pool = results.filter((r) => r.seeders > 0 && (r.magnet || r.detailUrl))
        let audioPref: { preferred: string[]; fallback: string[] } = { preferred: [], fallback: [] }
        try {
          audioPref = await window.api.language.getAudioMatchers()
          const prefs2 = await window.api.language.get()
          console.log(`[Language] audio preferido=${prefs2.audio} patrones=[${audioPref.preferred.join(', ')}]`)
          if (audioPref.preferred.length > 0) {
            const matches = pool.filter((r) =>
              audioPref.preferred.some((m) => r.title.toLowerCase().includes(m))
            )
            if (matches.length > 0) {
              console.log(`[Language] ${matches.length} release(s) coinciden con el audio preferido → priorizados`)
              const rest = pool.filter((r) => !matches.includes(r))
              pool = [...matches, ...rest]
            } else {
              console.log(`[Language] ningún release coincide con "${prefs2.audio}" → usando orden por seeders`)
            }
          }
        } catch {
          /* sin preferencias, seguir con el orden normal */
        }
        const candidates = pool.slice(0, 3)
        console.log(
          `[Torrent] ${results.length} resultados, ${candidates.length} con seeders:`,
          candidates.map((r) => `${r.title} (${r.seeders}s, ${r.source})`)
        )
        if (candidates.length === 0) {
          setError(
            `Encontramos ${results.length} fuente(s) para "${title}", pero ninguna tiene seeders activos ahora mismo.`
          )
          runDiagnostics(id, title, year ? parseInt(year) : undefined)
          return
        }

        let stream: Awaited<ReturnType<typeof window.api.torrent.play>> | null = null
        let picked = candidates[0]
        let lastError: unknown = null
        for (let i = 0; i < candidates.length; i++) {
          if (cancelled) return
          setStatus(
            'connecting',
            candidates.length > 1
              ? `Conectando al stream… (fuente ${i + 1}/${candidates.length})`
              : 'Conectando al stream…'
          )
          try {
            const tConnect = performance.now()
            const c = candidates[i]
            console.log(`[Provider] conectando fuente ${i + 1}: ${c.title} (${c.source})`)
            
            if (c.detailUrl) {
              // Streaming directo (Gnula, Cuevana) — resolver .m3u8 vía scraper-api
              const sourceName = c.source.toLowerCase().includes('gnula') ? 'gnula' : 'cuevana'
              console.log(`[Stream] resolviendo stream directo: ${sourceName} → ${c.detailUrl.slice(0, 80)}...`)
              const resolved = await window.api.stream.resolve(sourceName, c.detailUrl)
              stream = {
                streamUrl: resolved.streamUrl,
                infoHash: '',
                fileName: '',
                fileSize: 0,
                duration: 0,
                needsTranscode: false,
                audioTracks: [],
              }
              console.log(`[Stream] stream directo resuelto: ${resolved.streamUrl.slice(0, 80)}...`)
            } else {
              // Torrent — play via WebTorrent
              stream = await window.api.torrent.play(c.magnet)
              console.log(`[Provider] conectado en ${Math.round(performance.now() - tConnect)}ms — archivo: ${stream.fileName}`)
            }
            picked = c
            break
          } catch (err) {
            console.warn(`[Provider] fuente ${i + 1} falló: ${(err as Error).message}`)
            lastError = err
          }
        }

        if (!stream) {
          throw lastError instanceof Error
            ? lastError
            : new Error('Ninguna fuente pudo conectar')
        }
        if (cancelled) {
          if (stream.infoHash) window.api.torrent.stop(stream.infoHash).catch(() => {})
          return
        }
        setTranscode(!!stream.needsTranscode)
        setMediaDuration(stream.duration || 0)
        setAudioTracks(stream.audioTracks || [])
        setActiveAudioIndex(0)
        setStream({
          streamUrl: stream.streamUrl,
          infoHash: stream.infoHash,
          fileName: stream.fileName,
          quality: picked.quality,
        })
        if (stream.audioTracks?.length && audioPref.preferred.length > 0) {
          const prefIdx = stream.audioTracks.findIndex((t) =>
            audioPref.preferred.some(
              (m) => (t.title || '').toLowerCase().includes(m) || t.language.toLowerCase().includes(m)
            )
          )
          if (prefIdx > 0) setActiveAudioIndex(prefIdx)
          console.log(`[Playback] ${stream.audioTracks.length} pista(s) de audio | preferido #${prefIdx > 0 ? prefIdx : 0}`)
        }
        console.log(
          `[Playback] listo en ${Math.round(performance.now() - playbackStart)}ms | fuente=${picked.source} calidad=${picked.quality} transcode=${!!stream.needsTranscode}`
        )

        // Subtítulos para streaming directo (sin infoHash) — solo OpenSubtitles
        // Subtítulos: local (torrent) > OpenSubtitles > nada, con auto-selección
        const d2 = detailRef.current
        const subTitle = d2 ? displayTitle(d2) : title
        const subYear = d2 ? parseInt(displayYear(d2)) || undefined : undefined
        
        // Saber si OpenSubtitles está configurado para el mensaje informativo
        window.api.subtitles.status().then((st) => {
          if (!cancelled) setSubtitleApiKey(st.apiKeyDetected)
        }).catch(() => {})
        
        window.api.subtitles
          .find(subTitle, {
            year: subYear,
            season: season ? parseInt(season) : undefined,
            episode: episode ? parseInt(episode) : undefined,
            infoHash: stream.infoHash,
            // Sin tmdbId numérico real disponible (el id ahora es un UUID
            // de y-cinema-api) — OpenSubtitles cae al fallback de texto
            // libre, que ya existe para este caso.
            mediaType: mediaType === 'tv' ? 'episode' : 'movie',
          })
          .then((res) => {
            if (cancelled || !res) return
            const sel = res.autoIndex != null ? res.tracks[res.autoIndex] : null
            console.log(
              `[Subtitles] ${res.tracks.length} pistas | pref=${res.preferredLang} auto=${res.autoEnabled} | seleccionado=${
                sel ? `"${sel.name}" (${sel.lang}, ${sel.origin})` : 'ninguno'
              }`
            )
            setSubtitleTracks(res.tracks || [])
            setSubtitleAuto(res.autoIndex)
          })
          .catch((err) => console.warn('[Subtitles] find falló:', err))
      } catch (err) {
        console.error(`[Playback] ERROR: ${err instanceof Error ? err.message : String(err)}`)
        if (!cancelled && id) {
          setError(err instanceof Error ? err.message : 'Error al cargar el stream')
          runDiagnostics(
            id,
            displayTitle(detailRef.current || ({} as MediaDetails)),
            undefined
          )
        }
      }
    }

    if (id) start()
    return () => {
      cancelled = true
    }
  }, [mediaType, id, season, episode, reset, setStatus, setStream, setError, runDiagnostics])

  // Detener el torrent al salir
  useEffect(() => {
    return () => {
      const { infoHash: hash } = usePlayerStore.getState()
      if (hash) window.api.torrent.stop(hash).catch(() => {})
      reset()
    }
  }, [reset])

  // Poll de peers/velocidad para el overlay mientras conecta/bufferea
  useEffect(() => {
    if (!infoHash) return
    let active = true
    const poll = setInterval(async () => {
      try {
        const s = await window.api.torrent.getStatus(infoHash)
        if (!active) return
        setPeers(s.peers)
        setDlSpeed(s.downloadSpeed)
      } catch {
        /* ignore */
      }
    }, 1000)
    return () => {
      active = false
      clearInterval(poll)
    }
  }, [infoHash])

  const saveProgress = useCallback(
    (currentTime: number, duration: number) => {
      const d = detailRef.current
      if (!d || duration <= 0) return
      window.api.history
        .save({
          id: d.id,
          mediaType,
          // Sin esto, el progreso de cada episodio pisaba el del anterior —
          // el historial identificaba solo por (id, mediaType), no por episodio.
          season: season ? parseInt(season) : undefined,
          episode: episode ? parseInt(episode) : undefined,
          title: displayTitle(d),
          posterPath: d.poster_path,
          backdropPath: d.backdrop_path,
          progress: currentTime / duration,
          currentTime,
          duration,
        })
        .catch(() => {})
    },
    [mediaType, season, episode]
  )

  const title = detail ? displayTitle(detail) : ''
  const epLabel = season && episode ? `T${season} · E${episode}` : ''

  // Loading / conectando
  if (status === 'searching' || status === 'connecting' || status === 'idle') {
    return (
      <div className="h-full w-full flex items-center justify-center bg-black">
        <div className="flex flex-col items-center gap-5">
          <div className="w-12 h-12 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          <div className="text-center">
            {title && <p className="text-white font-semibold text-lg mb-1">{title}</p>}
            <p className="text-text-dim text-sm">{statusMessage || 'Preparando…'}</p>
            {infoHash && (
              <p className="text-text-dim/70 text-xs mt-2 tabular-nums">
                {peers} {peers === 1 ? 'fuente' : 'fuentes'}
                {dlSpeed > 0 && ` · ${(dlSpeed / 1024 / 1024).toFixed(1)} MB/s`}
              </p>
            )}
          </div>
        </div>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="h-full w-full flex items-start justify-center bg-black overflow-y-auto py-16">
        <div className="w-full max-w-2xl px-6">
          <div className="flex flex-col items-center text-center">
            <AlertCircle className="w-12 h-12 text-red-400/90 mb-4" />
            <p className="text-red-400 text-lg font-semibold">No se pudo reproducir</p>
            <p className="text-text-secondary text-sm mt-2 max-w-md">{error}</p>
            <div className="flex items-center gap-3 mt-5">
              <button onClick={() => navigate(-1)} className="btn-primary">
                Volver atrás
              </button>
              <button
                onClick={() =>
                  id &&
                  runDiagnostics(
                    id,
                    title,
                    displayYear(detailRef.current || ({} as MediaDetails))
                      ? parseInt(displayYear(detailRef.current as MediaDetails))
                      : undefined
                  )
                }
                disabled={diagRunning}
                className="btn-outline flex items-center gap-2 disabled:opacity-60"
              >
                {diagRunning && <Loader2 className="w-4 h-4 animate-spin" />}
                {diagRunning ? 'Diagnosticando…' : 'Reintentar diagnóstico'}
              </button>
            </div>
          </div>

          {/* Diagnóstico: prueba provider por provider */}
          {(providerTests || diagRunning) && (
            <div className="mt-8">
              <h3 className="text-xs font-bold tracking-[1.5px] text-text-dim uppercase mb-3">
                Proveedores de stream directo
              </h3>
              {diagRunning && !providerTests ? (
                <div className="flex items-center gap-2 text-text-dim text-sm">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Probando cada proveedor…
                </div>
              ) : (
                <div className="space-y-1.5">
                  {providerTests?.map((t) => (
                    <div
                      key={t.providerId}
                      className="flex items-start gap-3 rounded-lg bg-surface-1 border border-white/[0.05] px-3 py-2"
                    >
                      {t.success ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-none mt-0.5" />
                      ) : (
                        <XCircle className="w-4 h-4 text-red-400/70 flex-none mt-0.5" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium text-white">{t.name}</span>
                          <span className="text-[11px] text-text-dim tabular-nums flex-none">
                            {t.timing}ms
                          </span>
                        </div>
                        {t.error && (
                          <p className="text-[11.5px] text-text-dim mt-0.5 break-words">{t.error}</p>
                        )}
                        {t.success && (
                          <p className="text-[11.5px] text-emerald-400/80 mt-0.5">
                            Stream encontrado ✓
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                  {providerTests?.length === 0 && (
                    <p className="text-sm text-text-dim">No hay proveedores configurados.</p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Logs crudos del backend */}
          {diagLogs.length > 0 && (
            <div className="mt-8">
              <h3 className="text-xs font-bold tracking-[1.5px] text-text-dim uppercase mb-3">
                Registro de intentos
              </h3>
              <div className="rounded-lg bg-surface-1 border border-white/[0.05] p-3 max-h-72 overflow-y-auto font-mono text-[11.5px] leading-relaxed">
                {diagLogs.map((l, i) => (
                  <div
                    key={i}
                    className={
                      l.level === 'error'
                        ? 'text-red-400/90'
                        : l.level === 'warn'
                          ? 'text-amber-400/80'
                          : 'text-text-secondary'
                    }
                  >
                    <span className="text-text-dim">
                      {new Date(l.time).toLocaleTimeString()}{' '}
                    </span>
                    {l.message}
                    {l.meta && Object.keys(l.meta).length > 0 && (
                      <span className="text-text-dim"> {JSON.stringify(l.meta)}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="h-full w-full bg-black overflow-y-auto">
      <motion.div
        className="mx-auto"
        animate={{ maxWidth: theaterMode ? '100%' : '1200px' }}
        transition={{ duration: 0.35, ease: [0.2, 0.7, 0.3, 1] }}
      >
        <div className={theaterMode ? 'h-screen' : 'aspect-video max-h-screen'}>
          {streamUrl && (
            <VideoPlayer
              streamUrl={streamUrl}
              title={epLabel ? `${title} · ${epLabel}` : title}
              startAt={startAt}
              transcode={transcode}
              mediaDuration={mediaDuration || (detail?.runtime ? detail.runtime * 60 : 0)}
              subtitleTracks={subtitleTracks}
              autoSelectSubtitle={subtitleAuto}
              audioTracks={audioTracks}
              activeAudioIndex={activeAudioIndex}
              subtitleApiKey={subtitleApiKey}
              onBack={() => navigate(-1)}
              onProgressSave={saveProgress}
              onSelectAudio={(idx) => {
                setActiveAudioIndex(idx)
                console.log(`[Audio] cambiando a pista #${idx}`)
              }}
            />
          )}
        </div>
      </motion.div>

      {/* Info debajo del player (oculta en modo teatro) */}
      {!theaterMode && detail && (
        <div className="max-w-[920px] mx-auto px-8 lg:px-11 pt-8 pb-14">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[10px] font-bold tracking-[2px] text-sky-400 uppercase">
              {mediaType === 'tv' ? 'Serie' : 'Película'}
            </span>
            {quality && (
              <span className="text-[10px] font-bold tracking-wider text-emerald-500 border border-emerald-500/30 bg-emerald-500/[0.07] rounded px-2 py-0.5">
                {quality}
              </span>
            )}
          </div>
          <h1
            className="text-3xl font-extrabold tracking-[-0.02em] text-white"
            style={{ fontFamily: "'Bricolage Grotesque', sans-serif" }}
          >
            {title}
          </h1>
          {epLabel && (
            <p className="text-sm font-semibold text-accent-light mt-1.5">{epLabel}</p>
          )}
          <div className="flex items-center gap-2 mt-2.5 text-[13px] text-text-secondary">
            <Star className="w-3 h-3 text-amber-500 fill-amber-500" />
            <span className="text-white font-semibold">{rating1(detail.vote_average)}</span>
            {displayYear(detail) && (
              <>
                <span>·</span>
                <span>{displayYear(detail)}</span>
              </>
            )}
            {detail.runtime ? (
              <>
                <span>·</span>
                <span>{formatRuntime(detail.runtime)}</span>
              </>
            ) : null}
            {detail.genres?.length > 0 && (
              <>
                <span>·</span>
                <span>{detail.genres.map((g) => g.name).join(', ')}</span>
              </>
            )}
          </div>
          <p className="mt-3.5 text-[13.5px] leading-[1.65] text-text-secondary max-w-[720px]">
            {detail.overview}
          </p>
          <button
            onClick={() => navigate(`/detail/${mediaType}/${detail.id}`)}
            className="mt-4 text-[13px] font-semibold text-sky-400 hover:text-accent transition-colors"
          >
            Ver detalles completos →
          </button>
        </div>
      )}
    </div>
  )
}
