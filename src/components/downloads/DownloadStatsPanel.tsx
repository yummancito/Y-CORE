import {
  CloudDownload, CheckCircle2,
  AlertCircle, Clock, Gauge,
  HardDrive, Activity,
} from 'lucide-react'
import { useDownloadEngineStore, formatBytes, formatSpeed } from '../../stores/useDownloadEngineV3Store'

export function DownloadStatsPanel() {
  const { status, tasks, getActiveCount, getCompletedToday, getTotalBytesDownloaded } = useDownloadEngineStore()

  const active = getActiveCount()
  const completedToday = getCompletedToday()
  const totalBytes = getTotalBytesDownloaded()
  const queueCount = tasks.filter((t) => t.state === 'queued').length
  const failedCount = tasks.filter((t) => t.state === 'failed').length

  const stats = [
    {
      icon: Activity,
      label: 'Active',
      value: active.toString(),
      accent: 'var(--accent)',
      pulse: active > 0,
    },
    {
      icon: Clock,
      label: 'Queued',
      value: queueCount.toString(),
      accent: 'var(--text-dim)',
    },
    {
      icon: CheckCircle2,
      label: 'Today',
      value: completedToday.toString(),
      accent: 'var(--green)',
    },
    {
      icon: AlertCircle,
      label: 'Failed',
      value: failedCount.toString(),
      accent: 'var(--red)',
      pulse: failedCount > 0,
    },
    {
      icon: Gauge,
      label: 'Speed',
      value: status ? formatSpeed(status.combinedSpeed) : '0 B/s',
      accent: 'var(--amber)',
    },
    {
      icon: HardDrive,
      label: 'Downloaded',
      value: formatBytes(totalBytes),
      accent: 'var(--accent)',
    },
  ]

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border-color)',
        boxShadow: 'var(--card-shadow)',
      }}
    >
      <div className="flex items-center gap-2.5 px-5 py-4 border-b border-white/[0.06]">
        <CloudDownload className="w-5 h-5" style={{ color: 'var(--accent)' }} />
        <span className="text-sm font-bold text-text-bright">Download Stats</span>
        {status && (
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full" style={{
            background: status.isPaused ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)',
            color: status.isPaused ? 'var(--red)' : 'var(--green)',
            border: `1px solid ${status.isPaused ? 'rgba(239,68,68,0.2)' : 'rgba(34,197,94,0.2)'}`,
          }}>
            {status.isPaused ? 'PAUSED' : 'ACTIVE'}
          </span>
        )}
      </div>

      <div className="grid grid-cols-3 sm:grid-cols-6 gap-px bg-white/[0.04]">
        {stats.map((stat) => {
          const Icon = stat.icon
          return (
            <div
              key={stat.label}
              className="py-4 px-3 text-center"
              style={{ background: 'var(--bg-card)' }}
            >
              <div
                className="flex justify-center mb-1.5"
                style={{
                  color: stat.accent,
                  animation: stat.pulse ? 'pulse 2s infinite' : 'none',
                }}
              >
                <Icon className="w-5 h-5" />
              </div>
              <p className="text-lg font-bold text-text-bright">{stat.value}</p>
              <p className="text-[10px] text-text-dim uppercase tracking-wider mt-0.5">
                {stat.label}
              </p>
            </div>
          )
        })}
      </div>
    </div>
  )
}
