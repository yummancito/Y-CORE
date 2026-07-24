import { useRef, useState } from 'react'
import {
  Disc3,
  Maximize,
  Pause,
  Play,
  RectangleHorizontal,
  RotateCcw,
  RotateCw,
  Settings2,
  Volume2,
  VolumeX,
} from 'lucide-react'
import { formatTime } from '../../lib/tmdb'
import SubtitlesMenu, { type SubtitleTrack } from './SubtitlesMenu'
import AudioMenu, { type AudioTrack } from './AudioMenu'

const SPEEDS = [0.5, 1, 1.5, 2]

interface ControlsBarProps {
  playing: boolean
  currentTime: number
  duration: number
  volume: number
  muted: boolean
  playbackRate: number
  theaterMode: boolean
  title: string
  subtitleTracks: SubtitleTrack[]
  activeSubtitle: number | null
  subtitleApiKey?: boolean
  audioTracks: AudioTrack[]
  activeAudioIndex: number
  /** Rangos ya bufereados (video.buffered), en % del total — sin esto el
   * usuario no tenía ninguna pista visual de si adelantar el seek iba a
   * requerir esperar una descarga larga */
  bufferedRanges?: Array<{ start: number; end: number }>
  onTogglePlay: () => void
  onSeek: (time: number) => void
  onSeekBy: (delta: number) => void
  onVolume: (volume: number) => void
  onToggleMute: () => void
  onRate: (rate: number) => void
  onToggleTheater: () => void
  onFullscreen: () => void
  isFullscreen?: boolean
  onSelectSubtitle: (index: number | null) => void
  onSelectAudio: (index: number) => void
}

function IconButton({
  onClick,
  title,
  active,
  children,
}: {
  onClick: () => void
  title?: string
  active?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`w-9 h-9 flex items-center justify-center rounded-lg transition-colors hover:bg-white/10 ${
        active ? 'text-accent' : 'text-zinc-300'
      }`}
    >
      {children}
    </button>
  )
}

export default function ControlsBar(props: ControlsBarProps) {
  const {
    playing,
    currentTime,
    duration,
    volume,
    muted,
    playbackRate,
    theaterMode,
    title,
    subtitleTracks,
    activeSubtitle,
    subtitleApiKey,
    audioTracks,
    activeAudioIndex,
    bufferedRanges = [],
  } = props

  const [menuOpen, setMenuOpen] = useState(false)
  const [audioMenuOpen, setAudioMenuOpen] = useState(false)
  const barRef = useRef<HTMLDivElement>(null)
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0

  function handleSeekClick(e: React.MouseEvent<HTMLDivElement>) {
    const rect = barRef.current?.getBoundingClientRect()
    if (!rect || duration <= 0) return
    const ratio = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1)
    props.onSeek(ratio * duration)
  }

  return (
    <div
      className="absolute left-4 right-4 bottom-3.5 z-20 rounded-2xl px-4 pt-2.5 pb-3"
      style={{
        background: 'rgba(12,12,15,0.68)',
        backdropFilter: 'blur(18px)',
        WebkitBackdropFilter: 'blur(18px)',
        border: '1px solid rgba(255,255,255,0.1)',
        boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Barra de progreso */}
      <div
        className="h-3.5 flex items-center cursor-pointer mb-1.5 group/seek"
        onClick={handleSeekClick}
      >
        <div ref={barRef} className="relative h-1 w-full bg-white/[0.16] rounded-sm overflow-hidden">
          {duration > 0 &&
            bufferedRanges.map((r, i) => (
              <div
                key={i}
                className="absolute top-0 h-full bg-white/[0.28] rounded-sm"
                style={{
                  left: `${(r.start / duration) * 100}%`,
                  width: `${((r.end - r.start) / duration) * 100}%`,
                }}
              />
            ))}
          <div
            className="absolute top-0 left-0 h-full rounded-sm"
            style={{
              width: `${progress}%`,
              background: 'linear-gradient(90deg, #6C63FF, #3BB2F7)',
            }}
          >
            <div className="absolute -right-1.5 -top-1 w-3 h-3 rounded-full bg-white shadow-md opacity-0 group-hover/seek:opacity-100 transition-opacity" />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1">
        <IconButton onClick={props.onTogglePlay} title={playing ? 'Pausa (Espacio)' : 'Reproducir (Espacio)'}>
          {playing ? (
            <Pause className="w-[17px] h-[17px] fill-current" />
          ) : (
            <Play className="w-[17px] h-[17px] fill-current" />
          )}
        </IconButton>
        <IconButton onClick={() => props.onSeekBy(-10)} title="Atrás 10s">
          <RotateCcw className="w-4 h-4" />
        </IconButton>
        <IconButton onClick={() => props.onSeekBy(10)} title="Adelante 10s">
          <RotateCw className="w-4 h-4" />
        </IconButton>

        {/* Volumen */}
        <div className="flex items-center gap-2 ml-1">
          <IconButton onClick={props.onToggleMute} title="Silenciar (M)">
            {muted || volume === 0 ? (
              <VolumeX className="w-[15px] h-[15px]" />
            ) : (
              <Volume2 className="w-[15px] h-[15px]" />
            )}
          </IconButton>
          <input
            type="range"
            min={0}
            max={100}
            value={muted ? 0 : Math.round(volume * 100)}
            onChange={(e) => props.onVolume(Number(e.target.value) / 100)}
            className="w-[76px] h-[3px] cursor-pointer"
            style={{ accentColor: '#6C63FF' }}
          />
        </div>

        <span className="text-xs text-text-secondary ml-2.5 tabular-nums">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>

        <div className="flex-1" />

        <span className="text-[12.5px] font-semibold text-zinc-300 mr-1.5 max-w-[300px] truncate">
          {title}
        </span>

        {/* Selector de pista de audio */}
        <div className="relative">
          <IconButton
            onClick={() => setAudioMenuOpen((o) => !o)}
            title="Pista de audio"
            active={audioMenuOpen}
          >
            <Disc3 className="w-4 h-4" />
          </IconButton>
          {audioMenuOpen && (
            <div
              className="absolute bottom-11 right-0 w-[230px] rounded-[14px] p-2 animate-slide-up"
              style={{
                background: 'rgba(18,18,22,0.94)',
                backdropFilter: 'blur(18px)',
                WebkitBackdropFilter: 'blur(18px)',
                border: '1px solid rgba(255,255,255,0.1)',
                boxShadow: '0 20px 50px rgba(0,0,0,0.6)',
              }}
            >
              <AudioMenu
                tracks={audioTracks}
                activeIndex={activeAudioIndex}
                onSelect={(idx) => {
                  props.onSelectAudio(idx)
                  setAudioMenuOpen(false)
                }}
              />
            </div>
          )}
        </div>

        {/* Settings: velocidad + subtítulos */}
        <div className="relative">
          <IconButton onClick={() => setMenuOpen((o) => !o)} title="Ajustes" active={menuOpen}>
            <Settings2 className="w-4 h-4" />
          </IconButton>
          {menuOpen && (
            <div
              className="absolute bottom-11 -right-0 w-[230px] rounded-[14px] p-2 animate-slide-up"
              style={{
                background: 'rgba(18,18,22,0.94)',
                backdropFilter: 'blur(18px)',
                WebkitBackdropFilter: 'blur(18px)',
                border: '1px solid rgba(255,255,255,0.1)',
                boxShadow: '0 20px 50px rgba(0,0,0,0.6)',
              }}
            >
              <div className="px-2.5 pt-1.5 pb-1 text-[10px] font-bold tracking-[1.5px] text-text-dim">
                VELOCIDAD
              </div>
              {SPEEDS.map((s) => (
                <button
                  key={s}
                  onClick={() => {
                    props.onRate(s)
                    setMenuOpen(false)
                  }}
                  className={`w-full flex items-center justify-between px-2.5 py-[7px] rounded-lg text-[13px] transition-colors hover:bg-white/[0.07] ${
                    playbackRate === s ? 'text-accent font-semibold' : 'text-zinc-300'
                  }`}
                >
                  {s}x
                  {playbackRate === s && <span className="text-accent">✓</span>}
                </button>
              ))}
              <div className="my-1.5 border-t border-white/[0.07]" />
              <SubtitlesMenu
                tracks={subtitleTracks}
                activeIndex={activeSubtitle}
                apiKeyDetected={subtitleApiKey}
                onSelect={(i) => {
                  props.onSelectSubtitle(i)
                  setMenuOpen(false)
                }}
              />
            </div>
          )}
        </div>

        <IconButton onClick={props.onToggleTheater} title="Modo teatro (T)" active={theaterMode}>
          <RectangleHorizontal className="w-4 h-4" />
        </IconButton>
        <IconButton onClick={props.onFullscreen} title="Pantalla completa (F)" active={props.isFullscreen}>
          <Maximize className="w-4 h-4" />
        </IconButton>
      </div>
    </div>
  )
}
