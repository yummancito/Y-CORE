// ============================================================================
// src/components/downloads/DownloadsContent.tsx
// ----------------------------------------------------------------------------
// Steam-style downloads page. Sections:
//   1. Hero — currently downloading game (cover image background, big title,
//              live speed / size / ETA / percent, animated speed graph, pause).
//   2. A continuación  — next-up queued items (waiting to start).
//   3. Programadas     — scheduled/manual items that won't auto-start.
//   4. Historial       — recently completed (collapsed).
// Uses the same DownloadEngineStore V3 — no API changes.
// ============================================================================

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowDownToLine, Clock, Hourglass,
  Pause, Play, ShieldCheck, Trash2, X,
} from 'lucide-react'
import { useDownloadEngineStore, formatBytes, formatEta } from '../../stores/useDownloadEngineV3Store'
import { SteamGameDownloader } from './SteamGameDownloader'

// Where to fetch the game cover from Steam CDN. Falls back to depotbox.
function getCoverUrl(appId: string): string {
  return `https://cdn.akamai.steamstatic.com/steam/apps/${appId}/library_hero.jpg`
}

interface SpeedSample {
  bytesPerSec: number
  at: number // ms timestamp
}

const SPEED_SAMPLE_LIMIT = 90 // ~ 90 seconds of history (1 sample / 1s)
const SPEED_SAMPLE_INTERVAL_MS = 1000

export function DownloadsContent() {
  const {
    tasks, status, getActiveCount,
    setPaused, pauseTask, startTask, cancelTask, clearCompleted,
  } = useDownloadEngineStore()

  const activeCount = getActiveCount()

  const downloading = useMemo(
    () => tasks.find((t) => t.state === 'downloading' || t.state === 'preparing' || t.state === 'connecting'),
    [tasks],
  )
  void activeCount
  const preparing = useMemo(
    () => tasks.filter((t) => t.state === 'preparing' || t.state === 'connecting'),
    [tasks],
  )
  const queued = useMemo(
    () => tasks.filter((t) => t.state === 'queued').sort((a, b) => b.priority - a.priority),
    [tasks],
  )
  const scheduled = useMemo(
    () => tasks.filter((t) => t.state === 'stalled' || (t.priority === 0 && t.state === 'queued')),
    [tasks],
  )

  // ── Speed history (ring buffer of recent samples) ─────────────────────
  const samplesRef = useRef<SpeedSample[]>([])
  useEffect(() => {
    const tick = setInterval(() => {
      const current = status?.combinedSpeed ?? 0
      const arr = samplesRef.current
      arr.push({ bytesPerSec: current, at: Date.now() })
      if (arr.length > SPEED_SAMPLE_LIMIT) arr.shift()
    }, SPEED_SAMPLE_INTERVAL_MS)
    return () => clearInterval(tick)
  }, [status?.combinedSpeed])

  // Force re-render every 1.5s so the speed graph animates even when speed is stable
  const [, forceTick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => forceTick((n) => (n + 1) % 1_000_000), 1500)
    return () => clearInterval(t)
  }, [])

  const samples = samplesRef.current

  const empty = tasks.length === 0

  return (
    <section className="space-y-6">
      {/* ── Steam Game Downloader ──────────────────────────────────────────── */}
      <SteamGameDownloader />

      {/* ── Empty state (when nothing is downloading AND queue is empty) ── */}
      {empty && (
        <div className="flex flex-col items-center justify-center py-24 rounded-2xl"
             style={{ background: 'var(--bg-card)', border: '1px dashed var(--border-color)' }}>
          <ArrowDownToLine className="w-14 h-14 mb-3 opacity-20" style={{ color: 'var(--accent)' }} />
          <p className="text-base font-bold text-text-bright">No hay descargas activas</p>
          <p className="text-xs text-text-dim mt-1">Cuando instales un juego aparecerá aquí.</p>
        </div>
      )}

      {/* ── HERO: currently downloading game ────────────────────────────── */}
      {downloading && (
        <HeroCard
          task={downloading}
          preparingCount={preparing.length}
          samples={samples}
          globalPaused={!!status?.isPaused}
          onToggleGlobalPause={() => setPaused(!status?.isPaused)}
          onPauseTask={() => pauseTask(downloading.id)}
          onStartTask={() => startTask(downloading.id)}
          onCancelTask={() => cancelTask(downloading.id)}
        />
      )}

      {/* ── Next-up queue ("A continuación") ────────────────────────────── */}
      {queued.length > 0 && (
        <SectionCard title="A continuación" count={queued.length} icon={Hourglass}>
          <ul className="divide-y divide-white/[0.06]">
            {queued.map((t) => (
              <QueueRow
                key={t.id}
                task={t}
                onStart={() => startTask(t.id)}
                onCancel={() => cancelTask(t.id)}
              />
            ))}
          </ul>
        </SectionCard>
      )}

      {/* ── Scheduled items ("Programadas") ─────────────────────────────── */}
      {scheduled.length > 0 && (
        <SectionCard title="Programadas" count={scheduled.length} icon={Clock}>
          <ul className="divide-y divide-white/[0.06]">
            {scheduled.map((t) => (
              <QueueRow
                key={t.id}
                task={t}
                onStart={() => startTask(t.id)}
                onCancel={() => cancelTask(t.id)}
                scheduled
              />
            ))}
          </ul>
        </SectionCard>
      )}

      {/* ── Completed today (small footer card with clear action) ───────── */}
      {tasks.some((t) => t.state === 'completed' || t.state === 'failed') && (
        <div className="flex items-center justify-between px-5 py-3 rounded-2xl"
             style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
          <div className="flex items-center gap-2.5 text-xs text-text-secondary">
            <ShieldCheck className="w-4 h-4" style={{ color: 'var(--green)' }} />
            <span>
              {tasks.filter((t) => t.state === 'completed').length} completadas
              {' · '}
              {tasks.filter((t) => t.state === 'failed').length} con error
            </span>
          </div>
          <button
            onClick={() => clearCompleted()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-text-dim hover:text-text-bright hover:bg-white/[0.06] transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Limpiar finalizadas
          </button>
        </div>
      )}

      {/* Tiny info banner — placeholder for now */}
      {empty && (
        <p className="text-[11px] text-text-dim text-center pt-2">
          Las descargas se procesan en segundo plano aunque cierres la ventana.
        </p>
      )}

    </section>
  )
}

// ───────────────────────────── HERO CARD ───────────────────────────────────

interface HeroCardProps {
  task: import('../../stores/useDownloadEngineV3Store').DownloadTask
  preparingCount: number
  samples: SpeedSample[]
  globalPaused: boolean
  onToggleGlobalPause: () => void
  onPauseTask: () => void
  onStartTask: () => void
  onCancelTask: () => void
}

function HeroCard({
  task, preparingCount, samples,
  globalPaused, onToggleGlobalPause,
  onPauseTask, onStartTask, onCancelTask,
}: HeroCardProps) {
  const isPaused = globalPaused || task.state === 'paused'
  const cover = getCoverUrl(task.appId)
  const percent = Math.min(100, task.percent)

  return (
    <div className="relative w-full rounded-2xl overflow-hidden animate-fade-in"
         style={{ border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 16px 48px rgba(0,0,0,0.45)' }}>

      {/* Cover image (background) */}
      <div className="absolute inset-0 overflow-hidden">
        <img
          src={cover}
          alt=""
          className="w-full h-full object-cover scale-110"
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
        />
        {/* dark gradient over the cover for legibility */}
        <div className="absolute inset-0"
             style={{ background: 'linear-gradient(90deg, rgba(10,12,18,0.92) 0%, rgba(10,12,18,0.82) 50%, rgba(10,12,18,0.50) 100%)' }} />
        <div className="absolute inset-0"
             style={{ background: 'linear-gradient(180deg, rgba(10,12,18,0.10) 0%, rgba(10,12,18,0.45) 70%, rgba(10,12,18,0.85) 100%)' }} />
      </div>

      {/* Content */}
      <div className="relative px-7 pt-6 pb-5">
        {/* Top row: status + actions */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-[11px] font-bold tracking-[0.12em] uppercase">
            <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: isPaused ? 'var(--text-dim)' : 'var(--accent)' }} />
            <span style={{ color: isPaused ? 'var(--text-dim)' : 'var(--accent)' }}>
              {isPaused ? 'En pausa' : task.state === 'preparing' ? 'Preparando' : task.state === 'connecting' ? 'Conectando' : 'Descargando datos'}
            </span>
            {task.state === 'verifying' && (
              <span style={{ color: 'var(--amber)' }}>Verificando integridad</span>
            )}
          </div>

          <div className="flex items-center gap-1">
            {/* Big pause / resume */}
            <button
              onClick={isPaused ? onStartTask : onPauseTask}
              title={isPaused ? 'Reanudar' : 'Pausar'}
              className="flex items-center justify-center w-10 h-10 rounded-xl transition-all hover:brightness-110"
              style={{ background: isPaused ? 'var(--accent)' : 'rgba(255,255,255,0.10)', border: '1px solid var(--border-color)' }}
            >
              {isPaused
                ? <Play className="w-4 h-4 text-white fill-current" />
                : <Pause className="w-4 h-4 text-white fill-current" />}
            </button>
            {/* Cancel */}
            <button
              onClick={onCancelTask}
              title="Cancelar descarga"
              className="flex items-center justify-center w-10 h-10 rounded-xl transition-all hover:bg-red-500/20"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border-color)' }}
            >
              <X className="w-4 h-4 text-red-300" />
            </button>
          </div>
        </div>

        {/* Title + metrics */}
        <div className="flex items-end justify-between gap-6 mb-4">
          <div className="min-w-0">
            <h1 className="text-[42px] font-extrabold text-white tracking-[-0.02em] truncate drop-shadow-[0_4px_18px_rgba(0,0,0,0.55)]">
              {task.name}
            </h1>
            {preparingCount > 0 && (
              <p className="text-xs text-text-dim mt-1">
                + {preparingCount} más preparándose
              </p>
            )}
          </div>

          {/* Metrics grid (Steam-style: top right) */}
          <div className="grid grid-cols-3 gap-x-6 gap-y-1 text-right flex-shrink-0">
            <Metric label={isPaused ? 'Velocidad' : 'Velocidad'} value={formatBytes(task.speedBytesPerSec) + '/s'} accent />
            <Metric label="Tamaño" value={`${formatBytes(task.bytesDownloaded)} / ${formatBytes(task.bytesTotal)}`} />
            <Metric label="Tiempo restante" value={formatEta(task.etaSeconds)} />
          </div>
        </div>

        {/* Speed graph */}
        <SpeedGraph samples={samples} />

        {/* Progress bar - MEJORADO */}
        <div className="mt-4 space-y-2">
          <div className="h-3 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div
              className="h-full rounded-full transition-all duration-300 ease-out flex items-center justify-end pr-2"
              style={{
                width: `${percent}%`,
                background: isPaused
                  ? 'linear-gradient(90deg, #71717a, #52525b)'
                  : 'linear-gradient(90deg, #06b6d4 0%, #3bb2f7 50%, #1e63b5 100%)',
                boxShadow: isPaused ? 'none' : '0 0 20px rgba(59,178,247,0.6)',
              }}
            >
              {percent > 8 && (
                <span className="text-xs font-bold text-white">{percent.toFixed(0)}%</span>
              )}
            </div>
          </div>
          {percent <= 8 && (
            <div className="flex items-center justify-between text-xs font-mono text-text-dim">
              <span>{percent.toFixed(1)}%</span>
            </div>
          )}
          {task.state === 'downloading' && (
            <button
              onClick={onToggleGlobalPause}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-white/[0.08] transition-colors w-full text-center"
              style={{ color: 'var(--accent)' }}
            >
              {isPaused ? '▶ Reanudar todas' : '⏸ Pausar todas'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ──────────────────────────── METRIC ────────────────────────────────────────

function Metric({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <p className="text-[10px] font-bold tracking-wider uppercase text-text-dim">{label}</p>
      <p className="text-base font-bold font-mono"
         style={{ color: accent ? 'var(--accent)' : 'var(--text-bright)' }}>
        {value}
      </p>
    </div>
  )
}

// ──────────────────────────── SPEED GRAPH ────────────────────────────────────

interface SpeedGraphProps {
  samples: SpeedSample[]
}

function SpeedGraph({ samples }: SpeedGraphProps) {
  const width = 100 // viewBox width (percent)
  const height = 60 // viewBox height
  const BAR_WIDTH = 100 / SPEED_SAMPLE_LIMIT // 1.111 % each
  const padding = 0.4

  if (samples.length === 0) {
    return (
      <div className="h-[60px] rounded-xl flex items-center justify-center text-[11px] text-text-dim"
           style={{ background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.05)' }}>
        Esperando datos de velocidad…
      </div>
    )
  }

  const maxSpeed = Math.max(...samples.map((s) => s.bytesPerSec), 1024 * 64) // floor at 64 KB/s
  const stepX = BAR_WIDTH

  // Build an SVG path that connects the top of each bar (smooth-ish).
  let pathD = ''
  samples.forEach((s, i) => {
    const x = i * stepX + BAR_WIDTH / 2
    const y = height - (s.bytesPerSec / maxSpeed) * (height - padding)
    if (i === 0) pathD += `M ${x.toFixed(2)} ${y.toFixed(2)}`
    else pathD += ` L ${x.toFixed(2)} ${y.toFixed(2)}`
  })
  // If still empty, draw baseline
  if (!pathD) pathD = `M 0 ${height} L ${width} ${height}`

  return (
    <div className="relative h-[60px] rounded-xl overflow-hidden"
         style={{ background: 'rgba(0,0,0,0.30)', border: '1px solid rgba(255,255,255,0.06)' }}>
      {/* baseline grid */}
      <div className="absolute inset-0 opacity-50 pointer-events-none">
        {[0.25, 0.5, 0.75].map((y) => (
          <div key={y} className="absolute left-0 right-0 h-px"
               style={{ top: `${y * 100}%`, background: 'rgba(255,255,255,0.05)' }} />
        ))}
      </div>

      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none"
           className="absolute inset-0 w-full h-full">
        <defs>
          <linearGradient id="speed-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"  stopColor="#5BE2FF" stopOpacity="0.95" />
            <stop offset="60%" stopColor="#3BB2F7" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#1E63B5" stopOpacity="0.10" />
          </linearGradient>
          <linearGradient id="speed-line" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%"  stopColor="#3BB2F7" />
            <stop offset="100%" stopColor="#5BE2FF" />
          </linearGradient>
        </defs>

        {/* Filled area under the curve */}
        <path
          d={`${pathD} L ${width} ${height} L 0 ${height} Z`}
          fill="url(#speed-fill)"
        />
        {/* Solid line on top */}
        <path
          d={pathD}
          fill="none"
          stroke="url(#speed-line)"
          strokeWidth="0.45"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  )
}

// ──────────────────────── SECTION CARD WRAPPER ──────────────────────────────

interface SectionCardProps {
  title: string
  count: number
  icon: typeof Clock
  children: React.ReactNode
}

function SectionCard({ title, count, icon: Icon, children }: SectionCardProps) {
  return (
    <div className="rounded-2xl overflow-hidden"
         style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/[0.06]">
        <div className="flex items-center gap-2.5">
          <Icon className="w-4 h-4" style={{ color: 'var(--accent)' }} />
          <span className="text-sm font-bold text-text-bright">{title}</span>
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full"
                style={{ background: 'rgba(255,255,255,0.08)', color: 'var(--text-dim)' }}>
            {count}
          </span>
        </div>
      </div>
      <div>{children}</div>
    </div>
  )
}

// ───────────────────────────── QUEUE ROW ────────────────────────────────────

interface QueueRowProps {
  task: import('../../stores/useDownloadEngineV3Store').DownloadTask
  onStart: () => void
  onCancel: () => void
  scheduled?: boolean
}

function QueueRow({ task, onStart, onCancel, scheduled }: QueueRowProps) {
  return (
    <li className="flex items-center gap-3 px-5 py-3.5 hover:bg-white/[0.04] transition-colors">
      <div className="w-10 h-14 rounded-md overflow-hidden flex-shrink-0"
           style={{ background: 'rgba(255,255,255,0.06)' }}>
        <img
          src={getCoverUrl(task.appId)}
          alt=""
          className="w-full h-full object-cover"
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
        />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-text-bright truncate">{task.name}</p>
        <p className="text-[11px] text-text-dim mt-0.5 flex items-center gap-2">
          <span className="capitalize">
            {scheduled ? 'Programada' : task.state === 'queued' ? 'En cola' : task.state}
          </span>
          <span>·</span>
          <span className="font-mono">{formatBytes(task.bytesTotal)}</span>
        </p>
      </div>
      <div className="flex items-center gap-1">
        <button
          onClick={onStart}
          title="Iniciar"
          className="flex items-center justify-center w-9 h-9 rounded-lg transition-all hover:bg-white/[0.08]"
          style={{ background: 'rgba(255,255,255,0.06)' }}
        >
          <Play className="w-3.5 h-3.5 text-text-bright" />
        </button>
        <button
          onClick={onCancel}
          title="Quitar de la lista"
          className="flex items-center justify-center w-9 h-9 rounded-lg transition-all hover:bg-red-500/15"
          style={{ background: 'rgba(255,255,255,0.06)' }}
        >
          <X className="w-3.5 h-3.5 text-red-300" />
        </button>
      </div>
    </li>
  )
}


