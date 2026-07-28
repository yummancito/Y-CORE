import { useState, useEffect } from 'react'
import {
  Activity,
  X,
  Clock,
  Play,
  StopCircle,
  Loader2,
  Cpu,
} from 'lucide-react'
import { useGameProcessStore, startProcessPolling, stopProcessPolling } from '../../stores/useGameProcessStore'
import { gameProcessService } from '../../services/game-process.service'

export function ProcessMonitor() {
  const { runningGames, loading, listRunning } = useGameProcessStore()
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    if (!expanded) return
    startProcessPolling()
    listRunning()
    // This cleanup closes over the `expanded=true` render that started
    // polling, so it always fires exactly once per start — either when
    // `expanded` flips back to false or on unmount. The previous version
    // read `expanded`/`pollActive` from a stale closure in the cleanup,
    // so collapsing the panel never actually called stopProcessPolling().
    return () => {
      stopProcessPolling()
    }
  }, [expanded, listRunning])

  const formatElapsed = (seconds: number) => {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = seconds % 60
    if (h > 0) return `${h}h ${m}m ${s}s`
    if (m > 0) return `${m}m ${s}s`
    return `${s}s`
  }

  return (
    <div
      className="rounded-2xl overflow-hidden transition-all"
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border-color)',
        boxShadow: 'var(--card-shadow)',
      }}
    >
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-5 py-4 cursor-pointer transition-colors hover:bg-white/[0.03]"
      >
        <div className="flex items-center gap-3">
          <Activity className="w-5 h-5" style={{ color: 'var(--accent)' }} />
          <span className="text-sm font-bold text-text-bright">Running Games</span>
          {runningGames.length > 0 && (
            <span
              className="text-xs font-semibold px-2 py-0.5 rounded-full"
              style={{
                background: 'rgba(34,197,94,0.12)',
                color: 'var(--green)',
                border: '1px solid rgba(34,197,94,0.25)',
                animation: 'pulse 2s infinite',
              }}
            >
              {runningGames.length} running
            </span>
          )}
        </div>
        <span className="text-xs text-text-dim">
          {expanded ? '▼' : '▶'}
        </span>
      </button>

      {/* Content */}
      {expanded && (
        <div className="px-5 pb-5">
          {runningGames.length === 0 ? (
            <div className="flex items-center justify-center py-6 text-text-dim">
              <StopCircle className="w-5 h-5 mr-2 opacity-50" />
              <span className="text-sm">No games currently running</span>
            </div>
          ) : (
            <div className="space-y-2">
              {runningGames.map((game) => (
                <div
                  key={game.appId}
                  className="flex items-center justify-between py-2.5 px-3 rounded-xl transition-all"
                  style={{
                    background: 'rgba(34,197,94,0.05)',
                    border: '1px solid rgba(34,197,94,0.15)',
                  }}
                >
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <Play className="w-4 h-4" style={{ color: 'var(--green)' }} />
                      <span
                        className="absolute -top-1 -right-1 w-2 h-2 rounded-full"
                        style={{ background: 'var(--green)', animation: 'pulse 1.5s infinite' }}
                      />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-text-bright">App {game.appId}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] font-mono text-text-dim">PID {game.pid}</span>
                        <span className="text-[10px] text-text-dim">·</span>
                        <span className="text-[10px] flex items-center gap-1 text-text-dim">
                          <Clock className="w-3 h-3" />
                          {formatElapsed(game.elapsedSeconds)}
                        </span>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      useGameProcessStore.getState().killGame(game.appId)
                    }}
                    className="p-1.5 rounded-lg text-red/60 hover:text-red hover:bg-red/10 transition-colors"
                    title="Kill process"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Refresh button */}
          <button
            onClick={listRunning}
            disabled={loading}
            className="flex items-center gap-1.5 mx-auto mt-3 px-4 py-2 rounded-lg text-xs font-semibold text-text-dim hover:text-text-bright hover:bg-white/[0.06] transition-colors"
          >
            <Loader2 className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      )}
    </div>
  )
}
