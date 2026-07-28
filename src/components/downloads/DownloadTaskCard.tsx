import { useState } from 'react'
import {
  Play, Pause, X, ChevronDown, ChevronUp,
  Gauge, Timer, HardDrive, RefreshCw,
  ShieldCheck, ShieldAlert, Loader2,
} from 'lucide-react'
import { useDownloadEngineStore, formatBytes, formatSpeed, formatEta, formatTime, getStateColor } from '../../stores/useDownloadEngineV3Store'
import type { DownloadTask } from '../../stores/useDownloadEngineV3Store'

interface DownloadTaskCardProps {
  task: DownloadTask
  compact?: boolean
}

export function DownloadTaskCard({ task, compact = false }: DownloadTaskCardProps) {
  const { pauseTask, cancelTask, startTask } = useDownloadEngineStore()
  const [expanded, setExpanded] = useState(false)

  const isActive =
    task.state === 'downloading' ||
    task.state === 'preparing' ||
    task.state === 'connecting' ||
    task.state === 'verifying'
  const isPaused = task.state === 'paused'
  const isQueued = task.state === 'queued'
  const isDone = task.state === 'completed' || task.state === 'failed' || task.state === 'cancelled'
  const isError = task.state === 'failed'

  const mainColor = getStateColor(task.state)

  if (compact) {
    return (
      <div
        className="flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all"
        style={{
          background: isActive ? 'rgba(59,178,247,0.06)' : 'rgba(255,255,255,0.03)',
          border: `1px solid ${isActive ? 'rgba(59,178,247,0.15)' : 'var(--border-color)'}`,
        }}
      >
        {isActive ? (
          <Loader2 className="w-4 h-4 animate-spin" style={{ color: mainColor }} />
        ) : isDone ? (
          <ShieldCheck className="w-4 h-4" style={{ color: mainColor }} />
        ) : (
          <div className="w-4 h-4 rounded-full" style={{ background: mainColor, opacity: 0.5 }} />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-text-bright truncate">{task.name}</p>
          <div className="flex items-center gap-2 text-[11px] text-text-dim mt-0.5">
            <span className="capitalize">{task.state}</span>
            {task.speedBytesPerSec > 0 && (
              <>
                <span>·</span>
                <span>{formatSpeed(task.speedBytesPerSec)}</span>
              </>
            )}
            <span>·</span>
            <span>{formatBytes(task.bytesDownloaded)} / {formatBytes(task.bytesTotal)}</span>
          </div>
        </div>
        {!isDone && (
          <div className="flex items-center gap-1">
            {isActive && (
              <button
                onClick={() => pauseTask(task.id)}
                className="p-1.5 rounded-lg hover:bg-white/[0.08] transition-colors"
                title="Pause"
              >
                <Pause className="w-3.5 h-3.5 text-text-dim" />
              </button>
            )}
            {(isPaused || isQueued) && (
              <button
                onClick={() => startTask(task.id)}
                className="p-1.5 rounded-lg hover:bg-white/[0.08] transition-colors"
                title="Resume"
              >
                <Play className="w-3.5 h-3.5 text-text-dim" />
              </button>
            )}
            <button
              onClick={() => cancelTask(task.id)}
              className="p-1.5 rounded-lg hover:bg-red/10 transition-colors"
              title="Cancel"
            >
              <X className="w-3.5 h-3.5 text-red/60" />
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div
      className="rounded-2xl overflow-hidden transition-all"
      style={{
        background: 'var(--bg-card)',
        border: `1px solid ${isActive ? 'rgba(59,178,247,0.2)' : 'var(--border-color)'}`,
        boxShadow: isActive ? '0 0 24px rgba(59,178,247,0.08)' : 'var(--card-shadow)',
      }}
    >
      {/* Header */}
      <div className="px-5 py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2.5">
              <div
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{
                  background: mainColor,
                  animation: isActive ? 'pulse 1.5s infinite' : 'none',
                }}
              />
              <h3 className="text-base font-bold text-text-bright truncate">{task.name}</h3>
              {isError && task.errorMessage && (
                <span
                  className="text-[10px] font-medium px-2 py-0.5 rounded-full flex-shrink-0"
                  style={{
                    background: 'rgba(239,68,68,0.12)',
                    color: 'var(--red)',
                    border: '1px solid rgba(239,68,68,0.25)',
                  }}
                >
                  Error
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-1.5 text-[11px] text-text-dim">
              <span className="font-mono">App {task.appId}</span>
              <span>·</span>
              <span className="capitalize">{task.source}</span>
              <span>·</span>
              <span className="capitalize">{task.state}</span>
              {task.retryCount > 0 && (
                <>
                  <span>·</span>
                  <span style={{ color: 'var(--amber)' }}>
                    Retry {task.retryCount}/{task.maxRetries}
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1 flex-shrink-0">
            {isActive && (
              <button
                onClick={() => pauseTask(task.id)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all hover:bg-white/[0.08]"
                style={{ color: 'var(--accent)' }}
              >
                <Pause className="w-3.5 h-3.5" />
                Pause
              </button>
            )}
            {(isPaused || isQueued) && (
              <button
                onClick={() => startTask(task.id)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all hover:bg-white/[0.08]"
                style={{ color: 'var(--green)' }}
              >
                <Play className="w-3.5 h-3.5" />
                Resume
              </button>
            )}
            <button
              onClick={() => cancelTask(task.id)}
              className="p-1.5 rounded-lg transition-colors hover:bg-red/10"
              title="Cancel"
            >
              <X className="w-4 h-4 text-red/60 hover:text-red" />
            </button>
            <button
              onClick={() => setExpanded(!expanded)}
              className="p-1.5 rounded-lg transition-colors hover:bg-white/[0.08]"
            >
              {expanded ? (
                <ChevronUp className="w-4 h-4 text-text-dim" />
              ) : (
                <ChevronDown className="w-4 h-4 text-text-dim" />
              )}
            </button>
          </div>
        </div>

        {/* Progress bar */}
        {!isDone && task.bytesTotal > 0 && (
          <div className="mt-3 space-y-1.5">
            <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{
                  width: `${Math.min(100, task.percent)}%`,
                  background: isError
                    ? 'var(--red)'
                    : isPaused
                      ? 'var(--text-dim)'
                      : 'linear-gradient(90deg, var(--accent), var(--accent-hover))',
                }}
              />
            </div>
            <div className="flex items-center justify-between text-[11px] font-mono text-text-dim">
              <span>{formatBytes(task.bytesDownloaded)} / {formatBytes(task.bytesTotal)}</span>
              <span>{task.percent.toFixed(1)}%</span>
            </div>
          </div>
        )}
      </div>

      {/* Stats grid (visible when expanded or always if not compact) */}
      {expanded && (
        <div className="px-5 pb-5">
          <div className="grid grid-cols-4 gap-2 mb-3">
            <StatBox
              icon={<Gauge className="w-3.5 h-3.5" />}
              label="Speed"
              value={formatSpeed(task.speedBytesPerSec)}
              accent="var(--accent)"
            />
            <StatBox
              icon={<Timer className="w-3.5 h-3.5" />}
              label="ETA"
              value={formatEta(task.etaSeconds)}
              accent="var(--amber)"
            />
            <StatBox
              icon={<HardDrive className="w-3.5 h-3.5" />}
              label="Elapsed"
              value={formatTime(task.elapsedSec)}
              accent="var(--text-dim)"
            />
            <StatBox
              icon={<RefreshCw className="w-3.5 h-3.5" />}
              label="Peak"
              value={formatSpeed(task.peakSpeed)}
              accent="var(--green)"
            />
          </div>

          {/* Verification progress */}
          {task.filesTotal > 0 && (
            <div className="flex items-center gap-2 py-2 px-3 rounded-xl bg-white/[0.04]">
              <ShieldCheck className="w-4 h-4" style={{ color: 'var(--green)' }} />
              <span className="text-xs text-text-dim">
                Verified {task.filesVerified} / {task.filesTotal} files ({formatBytes(task.bytesVerified)})
              </span>
            </div>
          )}

          {/* Error message */}
          {isError && task.errorMessage && (
            <div
              className="flex items-start gap-2 py-2 px-3 rounded-xl mt-2 text-xs"
              style={{
                background: 'rgba(239,68,68,0.08)',
                border: '1px solid rgba(239,68,68,0.2)',
                color: 'var(--red)',
              }}
            >
              <ShieldAlert className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{task.errorMessage}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function StatBox({
  icon, label, value, accent,
}: {
  icon: React.ReactNode
  label: string
  value: string
  accent: string
}) {
  return (
    <div
      className="rounded-xl p-3 text-center"
      style={{ background: 'rgba(255,255,255,0.03)' }}
    >
      <div className="flex justify-center mb-1" style={{ color: accent }}>
        {icon}
      </div>
      <p className="text-xs font-bold text-text-bright truncate">{value}</p>
      <p className="text-[9px] text-text-dim uppercase tracking-wider mt-0.5">{label}</p>
    </div>
  )
}
