import { useState } from 'react'
import {
  History, CheckCircle2, XCircle, Clock,
  Loader2, ChevronDown, ChevronUp, Trash2,
} from 'lucide-react'
import { useDownloadEngineStore, formatBytes, formatTime } from '../../stores/useDownloadEngineV3Store'
import type { DownloadTask } from '../../stores/useDownloadEngineV3Store'

export function DownloadHistoryPanel() {
  const { history, clearHistory } = useDownloadEngineStore()
  const [expanded, setExpanded] = useState(false)
  const displayHistory = history.slice(0, expanded ? history.length : 5)

  if (history.length === 0) return null

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
      <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
        <div className="flex items-center gap-2.5">
          <History className="w-5 h-5" style={{ color: 'var(--accent)' }} />
          <span className="text-sm font-bold text-text-bright">History</span>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/[0.06] text-text-dim">
            {history.length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => clearHistory()}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-text-dim hover:text-red transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Clear
          </button>
          {history.length > 5 && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="p-1.5 rounded-lg hover:bg-white/[0.06] transition-colors"
            >
              {expanded ? (
                <ChevronUp className="w-4 h-4 text-text-dim" />
              ) : (
                <ChevronDown className="w-4 h-4 text-text-dim" />
              )}
            </button>
          )}
        </div>
      </div>

      {/* List */}
      <div className="divide-y divide-white/[0.05]">
        {displayHistory.map((entry) => (
          <HistoryRow key={`${entry.id}-${entry.completedAt}`} entry={entry} />
        ))}
      </div>

      {!expanded && history.length > 5 && (
        <button
          onClick={() => setExpanded(true)}
          className="w-full py-3 text-xs font-semibold text-text-dim hover:text-text-bright hover:bg-white/[0.03] transition-colors"
        >
          Show {history.length - 5} more
        </button>
      )}
    </div>
  )
}

function HistoryRow({ entry }: { entry: DownloadTask }) {
  const isSuccess = entry.state === 'completed'
  const isFailed = entry.state === 'failed'
  const date = entry.completedAt
    ? new Date(entry.completedAt).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—'

  return (
    <div className="flex items-center gap-3 px-5 py-3 hover:bg-white/[0.03] transition-colors">
      {isSuccess ? (
        <CheckCircle2 className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--green)' }} />
      ) : isFailed ? (
        <XCircle className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--red)' }} />
      ) : (
        <Clock className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--text-dim)' }} />
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-text-bright truncate">{entry.name}</p>
        <div className="flex items-center gap-2 text-[10px] text-text-dim mt-0.5">
          <span className="font-mono">App {entry.appId}</span>
          <span>·</span>
          <span className="capitalize">{entry.source}</span>
          <span>·</span>
          <span>{formatBytes(entry.bytesDownloaded)}</span>
          {entry.elapsedSec > 0 && (
            <>
              <span>·</span>
              <span>{formatTime(entry.elapsedSec)}</span>
            </>
          )}
        </div>
      </div>
      <span className="text-[10px] text-text-dim font-mono flex-shrink-0">{date}</span>
    </div>
  )
}
