import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertCircle, ArrowLeft, Loader2, Play, RotateCw } from 'lucide-react'
import { usePlayerStore } from '../../stores/usePlayerStore'
import ControlsBar from './ControlsBar'
import type { SubtitleTrack } from './SubtitlesMenu'

const HIDE_DELAY_MS = 2000
const SAVE_INTERVAL_MS = 15000
// Si el buffering dura más que esto sin recuperarse, ofrecer reintentar en
// vez de dejar el spinner girando indefinidamente (peers agotados, stream
// cortado a medias, etc.)
const BUFFERING_TIMEOUT_MS = 25000

function withSs(url: string, seconds: number) {
  return `${url}${url.includes('?') ? '&' : '?'}ss=${seconds}`
}

interface AudioTrackInfo {
  index: number
  codec: string
  language: string
  title?: string
}

interface VideoPlayerProps {
  streamUrl: string
  title: string
  startAt?: number
  /** El backend transcodifica el audio: el seek reinicia el stream con ?ss= */
  transcode?: boolean
  /** Duración real (ffprobe) — en modo transcode el <video> no la conoce */
  mediaDuration?: number
  subtitleTracks?: SubtitleTrack[]
  /** índice de subtítulo a activar automáticamente (auto-selección), o null */
  autoSelectSubtitle?: number | null
  /** Pistas de audio disponibles (del probe del torrent) */
  audioTracks?: AudioTrackInfo[]
  /** Índice de la pista de audio activa */
  activeAudioIndex?: number
  /** Si OpenSubtitles tiene API key (para el menú de subs) */
  subtitleApiKey?: boolean
  onBack: () => void
  onProgressSave: (currentTime: number, duration: number) => void
  /** Cuando el usuario elige una pista de audio distinta, reinicia el stream */
  onSelectAudio?: (index: number) => void
}

export default function VideoPlayer({
  streamUrl,
  title,
  startAt,
  transcode = false,
  mediaDuration = 0,
  subtitleTracks = [],
  autoSelectSubtitle = null,
  audioTracks = [],
  activeAudioIndex = 0,
  subtitleApiKey,
  onBack,
  onProgressSave,
  onSelectAudio,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const {
    playing,
    currentTime,
    duration,
    volume,
    muted,
    playbackRate,
    theaterMode,
    setPlaying,
    setProgress,
    setVolume,
    setMuted,
    setPlaybackRate,
    toggleTheater,
  } = usePlayerStore()

  const [controlsVisible, setControlsVisible] = useState(true)
  const [buffering, setBuffering] = useState(true)
  const [playbackError, setPlaybackError] = useState<string | null>(null)
  const [activeSubtitle, setActiveSubtitle] = useState<number | null>(null)
  const [bufferedRanges, setBufferedRanges] = useState<Array<{ start: number; end: number }>>([])
  const userChoseSubtitleRef = useRef(false)

  const updateBuffered = useCallback(() => {
    const v = videoRef.current
    if (!v) return
    const ranges: Array<{ start: number; end: number }> = []
    for (let i = 0; i < v.buffered.length; i++) {
      ranges.push({ start: v.buffered.start(i) + seekOffsetRef.current, end: v.buffered.end(i) + seekOffsetRef.current })
    }
    setBufferedRanges(ranges)
  }, [])

  // Auto-selección: aplicar el índice sugerido por las preferencias una sola vez
  // (mientras el usuario no haya elegido manualmente)
  useEffect(() => {
    if (userChoseSubtitleRef.current) return
    if (autoSelectSubtitle != null && subtitleTracks.length > autoSelectSubtitle) {
      setActiveSubtitle(autoSelectSubtitle)
      console.log(`[VideoPlayer] auto-activando subtítulo #${autoSelectSubtitle}`)
    }
  }, [autoSelectSubtitle, subtitleTracks.length])

  const chooseSubtitle = useCallback((index: number | null) => {
    userChoseSubtitleRef.current = true
    setActiveSubtitle(index)
  }, [])

  // En modo transcode el <video> siempre arranca en 0: el offset real del
  // stream se lleva aparte y se suma para mostrar tiempos/guardar progreso
  const initialOffset = transcode && startAt ? Math.floor(startAt) : 0
  const [seekOffset, setSeekOffset] = useState(initialOffset)
  const [src, setSrc] = useState(() =>
    transcode && initialOffset > 0 ? withSs(streamUrl, initialOffset) : streamUrl
  )

  const showControls = useCallback(() => {
    setControlsVisible(true)
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    hideTimerRef.current = setTimeout(() => setControlsVisible(false), HIDE_DELAY_MS)
  }, [])

  useEffect(() => {
    showControls()
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    }
  }, [showControls])

  // Sincronizar volumen / velocidad con el elemento video
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    v.volume = volume
    v.muted = muted
    v.playbackRate = playbackRate
  }, [volume, muted, playbackRate])

  // Subtítulos activos
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    Array.from(v.textTracks).forEach((track, i) => {
      track.mode = i === activeSubtitle ? 'showing' : 'hidden'
    })
  }, [activeSubtitle, subtitleTracks])

  // Guardar progreso cada 15 segundos (con el offset del transcode sumado)
  const seekOffsetRef = useRef(seekOffset)
  seekOffsetRef.current = seekOffset
  const lastProgressUpdateRef = useRef(0)

  // Referencias estables para poder guardar el progreso final sin depender
  // de que el intervalo de 15s haya alcanzado a correr — antes, pausar y
  // salir dentro de esa ventana perdía hasta 15s de avance sin persistir.
  const transcodeRef = useRef(transcode)
  transcodeRef.current = transcode
  const mediaDurationRef = useRef(mediaDuration)
  mediaDurationRef.current = mediaDuration
  const onProgressSaveRef = useRef(onProgressSave)
  onProgressSaveRef.current = onProgressSave

  const saveCurrentProgress = useCallback(() => {
    const v = videoRef.current
    if (!v) return
    const total = transcodeRef.current ? mediaDurationRef.current : v.duration
    if (total > 0 && isFinite(total)) {
      onProgressSaveRef.current(seekOffsetRef.current + v.currentTime, total)
    }
  }, [])

  useEffect(() => {
    const interval = setInterval(() => {
      const v = videoRef.current
      if (!v || v.paused) return
      saveCurrentProgress()
    }, SAVE_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [saveCurrentProgress])

  // Guardado final: al pausar y al desmontar (salir de la página/cambiar de
  // contenido), no solo cada 15s mientras se reproduce.
  useEffect(() => {
    return () => saveCurrentProgress()
  }, [saveCurrentProgress])

  // Watchdog: si el buffering se prolonga sin recuperarse, ofrecer reintentar
  // en vez de dejar el spinner girando para siempre (peers agotados, stream
  // cortado a medias — sin esto no había ningún límite de tiempo ni forma
  // de recuperarse más que navegar fuera de la página).
  useEffect(() => {
    if (!buffering || playbackError) return
    const timer = setTimeout(() => {
      setPlaybackError('La reproducción se detuvo — no llegan más datos del stream.')
    }, BUFFERING_TIMEOUT_MS)
    return () => clearTimeout(timer)
  }, [buffering, playbackError])

  const retryPlayback = useCallback(() => {
    setPlaybackError(null)
    setBuffering(true)
    const v = videoRef.current
    if (v) {
      v.load()
      v.play().catch(() => {})
    }
  }, [])

  const togglePlay = useCallback(() => {
    const v = videoRef.current
    if (!v) return
    if (v.paused) v.play().catch(() => {})
    else v.pause()
  }, [])

  const doSeek = useCallback(
    (t: number) => {
      const v = videoRef.current
      if (!v) return
      if (!transcode) {
        v.currentTime = Math.min(Math.max(t, 0), v.duration || Infinity)
        return
      }
      const target = Math.max(0, Math.floor(Math.min(t, mediaDuration > 0 ? mediaDuration - 5 : t)))
      setBuffering(true)
      setSeekOffset(target)
      setSrc(withSs(streamUrl, target))
    },
    [transcode, streamUrl, mediaDuration]
  )

  /** Cambiar pista de audio: reconstruye URL con ?audio=<idx> y recarga */
  const handleSelectAudio = useCallback(
    (idx: number) => {
      const v = videoRef.current
      // Preservar la posición actual — antes se reconstruía siempre desde
      // streamUrl (tiempo 0), reiniciando el stream al cambiar de audio y
      // dejando seekOffset desalineado del tiempo real reproducido.
      const currentPos = seekOffsetRef.current + (v?.currentTime || 0)
      console.log(`[VideoPlayer] cambiando a pista de audio #${idx} desde ${Math.floor(currentPos)}s`)
      setBuffering(true)
      const separator = streamUrl.includes('?') ? '&' : '?'
      const baseUrl = streamUrl.replace(/[?&](audio=\d+|ss=\d+)/g, '')
      const newSrc =
        currentPos > 0
          ? `${baseUrl}${separator}audio=${idx}&ss=${Math.floor(currentPos)}`
          : `${baseUrl}${separator}audio=${idx}`
      setSeekOffset(Math.floor(currentPos))
      setSrc(newSrc)
      onSelectAudio?.(idx)
    },
    [streamUrl, onSelectAudio]
  )

  // Al cambiar el src (seek en modo transcode), recargar y seguir reproduciendo
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    v.load()
    v.play().catch(() => {})
  }, [src])

  const seekBy = useCallback(
    (delta: number) => {
      const v = videoRef.current
      if (!v) return
      doSeek(seekOffset + v.currentTime + delta)
    },
    [doSeek, seekOffset]
  )

  const goFullscreen = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    if (document.fullscreenElement) document.exitFullscreen()
    else el.requestFullscreen().catch(() => {})
  }, [])

  // Sin este listener, el ícono/estado de fullscreen no reflejaba la
  // realidad si el usuario salía con Escape nativo del SO (en vez del botón
  // de la app) — el estado del DOM cambiaba pero nada en React se enteraba.
  const [isFullscreen, setIsFullscreen] = useState(false)
  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  // Atajos de teclado
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return
      switch (e.key) {
        case ' ':
          e.preventDefault()
          togglePlay()
          break
        case 'ArrowLeft':
          seekBy(-10)
          break
        case 'ArrowRight':
          seekBy(10)
          break
        case 'f':
        case 'F':
          goFullscreen()
          break
        case 't':
        case 'T':
          toggleTheater()
          break
        case 'm':
        case 'M':
          setMuted(!usePlayerStore.getState().muted)
          break
        case 'Escape':
          if (!document.fullscreenElement) onBack()
          break
      }
      showControls()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [togglePlay, seekBy, goFullscreen, toggleTheater, setMuted, onBack, showControls])

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full bg-black overflow-hidden"
      onMouseMove={showControls}
      style={{ cursor: controlsVisible ? 'default' : 'none' }}
    >
      <video
        ref={videoRef}
        src={src}
        autoPlay
        className="w-full h-full object-contain"
        crossOrigin="anonymous"
        onClick={togglePlay}
        onPlay={() => setPlaying(true)}
        onPause={() => {
          setPlaying(false)
          saveCurrentProgress()
        }}
        onWaiting={() => setBuffering(true)}
        onPlaying={() => {
          setBuffering(false)
          setPlaybackError(null)
        }}
        onCanPlay={() => setBuffering(false)}
        onError={(e) => {
          // Sin este handler, un stream cortado (peer perdido, servidor caído)
          // dejaba el spinner de buffering girando para siempre sin ningún
          // mensaje ni forma de recuperarse.
          const err = e.currentTarget.error
          const reason =
            err?.code === MediaError.MEDIA_ERR_NETWORK
              ? 'Se perdió la conexión con el stream.'
              : err?.code === MediaError.MEDIA_ERR_DECODE
                ? 'El archivo de video está dañado o el formato no es compatible.'
                : 'No se pudo reproducir el video.'
          console.error('[VideoPlayer] error de reproducción:', err?.code, err?.message)
          setPlaybackError(reason)
          setBuffering(false)
        }}
        onTimeUpdate={(e) => {
          const v = e.currentTarget
          const total = transcode ? mediaDuration : v.duration || 0
          // Throttle a ~4/s: timeupdate puede disparar mucho más seguido
          // según el navegador, y cada llamada re-renderiza todo lo suscrito
          // a currentTime/duration en Zustand (ControlsBar, menús) sin
          // necesidad — la barra igual se ve fluida a esta frecuencia.
          const now = performance.now()
          if (now - lastProgressUpdateRef.current < 250) return
          lastProgressUpdateRef.current = now
          setProgress(seekOffset + v.currentTime, total)
        }}
        onProgress={updateBuffered}
        onLoadedMetadata={(e) => {
          const v = e.currentTarget
          if (!transcode && startAt && startAt > 0 && startAt < (v.duration || Infinity) * 0.95) {
            v.currentTime = startAt
          }
        }}
      >
        {subtitleTracks.map((t, i) => (
          <track key={`${t.url}-${i}`} kind="subtitles" src={t.url} label={t.lang || t.name} />
        ))}
      </video>

      {/* Spinner de buffering */}
      {buffering && !playbackError && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <Loader2 className="w-12 h-12 text-white/80 animate-spin" />
        </div>
      )}

      {/* Error de reproducción — stream cortado, sin datos, formato inválido */}
      {playbackError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/70 px-6 text-center">
          <AlertCircle className="w-12 h-12 text-red-400/90" />
          <p className="text-white text-sm max-w-xs">{playbackError}</p>
          <button
            onClick={retryPlayback}
            className="flex items-center gap-2 h-10 px-5 rounded-full bg-white text-surface text-sm font-semibold hover:scale-[1.03] transition-transform"
          >
            <RotateCw className="w-4 h-4" />
            Reintentar
          </button>
        </div>
      )}

      {/* Botón central de play cuando está pausado */}
      {!playing && !buffering && !playbackError && (
        <button
          onClick={togglePlay}
          className="absolute inset-0 flex items-center justify-center"
        >
          <div className="w-20 h-20 rounded-full bg-white/[0.94] flex items-center justify-center shadow-2xl transition-transform hover:scale-[1.06]">
            <Play className="w-7 h-7 text-surface fill-surface ml-1" />
          </div>
        </button>
      )}

      {/* Overlay superior + controles */}
      <div
        className={`transition-opacity duration-300 ${
          controlsVisible || !playing ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        <div
          className="absolute top-0 left-0 right-0 h-24 pointer-events-none"
          style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.6), transparent)' }}
        />
        <button
          onClick={onBack}
          className="absolute top-5 left-5 z-20 flex items-center gap-2 h-9 px-4 rounded-full text-[13px] text-text-secondary hover:text-white transition-colors"
          style={{
            background: 'rgba(15,15,18,0.6)',
            backdropFilter: 'blur(14px)',
            WebkitBackdropFilter: 'blur(14px)',
            border: '1px solid rgba(255,255,255,0.12)',
          }}
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Volver
        </button>

        <ControlsBar
          playing={playing}
          currentTime={currentTime}
          duration={duration}
          volume={volume}
          muted={muted}
          playbackRate={playbackRate}
          theaterMode={theaterMode}
          title={title}
          subtitleTracks={subtitleTracks}
          activeSubtitle={activeSubtitle}
          subtitleApiKey={subtitleApiKey}
          audioTracks={audioTracks}
          activeAudioIndex={activeAudioIndex}
          bufferedRanges={bufferedRanges}
          onTogglePlay={togglePlay}
          onSeek={doSeek}
          onSeekBy={seekBy}
          onVolume={setVolume}
          onToggleMute={() => setMuted(!muted)}
          onRate={setPlaybackRate}
          onToggleTheater={toggleTheater}
          onFullscreen={goFullscreen}
          isFullscreen={isFullscreen}
          onSelectSubtitle={chooseSubtitle}
          onSelectAudio={handleSelectAudio}
        />
      </div>
    </div>
  )
}
