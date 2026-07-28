import { useState, useEffect } from 'react'
import {
  Clock,
  BarChart3,
  Calendar,
  Play,
  Loader2,
  TrendingUp,
} from 'lucide-react'
import { useGameProcessStore } from '../../stores/useGameProcessStore'
import type { PlayTimeSummary, PlaySession } from '../../domain/types'

interface GameStatisticsProps {
  appId: string
  compact?: boolean
}

export function GameStatistics({ appId, compact = false }: GameStatisticsProps) {
  const { playTime, loading, getPlayTime } = useGameProcessStore()
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!loaded) {
      getPlayTime(appId).then(() => setLoaded(true))
    }
  }, [getPlayTime, appId, loaded])

  if (loading && !playTime) {
    return (
      <div className="flex items-center gap-2 text-text-dim py-2">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="text-xs">Loading stats...</span>
      </div>
    )
  }

  if (!playTime) return null

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    if (hours > 0) return `${hours}h ${minutes}m`
    if (minutes > 0) return `${minutes}m`
    return `${seconds}s`
  }

  const formatDate = (ts: number | null) => {
    if (!ts) return 'Never'
    return new Date(ts).toLocaleDateString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric',
    })
  }

  if (compact) {
    return (
      <div className="flex items-center gap-3 text-xs text-text-dim">
        <span className="flex items-center gap-1">
          <Clock className="w-3.5 h-3.5" />
          {formatTime(playTime.totalSeconds)}
        </span>
        <span className="flex items-center gap-1">
          <Play className="w-3.5 h-3.5" />
          {playTime.sessions.length} sessions
        </span>
        <span className="flex items-center gap-1">
          <Calendar className="w-3.5 h-3.5" />
          {formatDate(playTime.lastPlayed)}
        </span>
      </div>
    )
  }

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border-color)',
        boxShadow: 'var(--card-shadow)',
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-2.5 px-5 py-4 border-b border-white/[0.06]">
        <BarChart3 className="w-5 h-5" style={{ color: 'var(--accent)' }} />
        <span className="text-sm font-bold text-text-bright">Game Statistics</span>
      </div>

      {/* Stats Grid */}
      <div className="px-5 py-4">
        <div className="grid grid-cols-3 gap-3 mb-4">
          <StatCard
            icon={<Clock className="w-4 h-4" />}
            label="Total Play Time"
            value={formatTime(playTime.totalSeconds)}
            accent="var(--accent)"
          />
          <StatCard
            icon={<Play className="w-4 h-4" />}
            label="Sessions"
            value={playTime.sessions.length.toString()}
            accent="var(--green)"
          />
          <StatCard
            icon={<TrendingUp className="w-4 h-4" />}
            label="Last Session"
            value={formatDate(playTime.lastPlayed)}
            accent="var(--amber)"
          />
        </div>

        {/* Recent Sessions */}
        {playTime.sessions.length > 0 && (
          <div>
            <span className="text-xs font-semibold text-text-dim mb-2 block">Recent Sessions</span>
            <div className="space-y-1 max-h-[180px] overflow-y-auto">
              {[...playTime.sessions].reverse().slice(0, 10).map((session) => (
                <SessionRow key={session.id} session={session} />
              ))}
            </div>
          </div>
        )}

        {/* Summary bar */}
        <div
          className="mt-3 pt-3 border-t border-white/[0.06] flex items-center justify-between"
        >
          <span className="text-[10px] text-text-dim">Total sessions tracked</span>
          <span className="text-xs font-bold text-text-bright">{formatTime(playTime.totalSeconds)}</span>
        </div>
      </div>
    </div>
  )
}

function StatCard({ icon, label, value, accent }: {
  icon: React.ReactNode
  label: string
  value: string
  accent: string
}) {
  return (
    <div className="rounded-xl p-3 text-center" style={{ background: 'rgba(255,255,255,0.04)' }}>
      <div className="flex justify-center mb-1" style={{ color: accent }}>{icon}</div>
      <p className="text-lg font-bold text-text-bright">{value}</p>
      <p className="text-[10px] text-text-dim mt-0.5">{label}</p>
    </div>
  )
}

function SessionRow({ session }: { session: PlaySession }) {
  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    if (h > 0) return `${h}h ${m}m`
    if (m > 0) return `${m}m`
    return `${seconds}s`
  }

  const formatDate = (ts: number) => {
    return new Date(ts).toLocaleDateString(undefined, {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    })
  }

  return (
    <div className="flex items-center justify-between py-1.5 px-2.5 rounded-lg hover:bg-white/[0.03] transition-colors">
      <div className="flex items-center gap-2">
        <Play className="w-3 h-3 text-green" />
        <span className="text-xs text-text-primary">{formatDate(session.startTime)}</span>
      </div>
      <span className="text-[10px] font-mono text-text-dim">{formatTime(session.durationSeconds)}</span>
    </div>
  )
}
