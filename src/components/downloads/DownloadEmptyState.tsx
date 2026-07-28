import { PackageOpen, CloudDownload, Inbox } from 'lucide-react'
import { useDownloadEngineStore } from '../../stores/useDownloadEngineV3Store'

export function DownloadEmptyState() {
  const { tasks, history, status } = useDownloadEngineStore()
  const hasAnyContent = tasks.length > 0 || history.length > 0 || (status && (status.active > 0 || status.queued > 0))

  if (hasAnyContent) return null

  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div
        className="w-20 h-20 rounded-full flex items-center justify-center mb-5"
        style={{
          background: 'rgba(59,178,247,0.08)',
          border: '1px solid rgba(59,178,247,0.15)',
        }}
      >
        <CloudDownload className="w-10 h-10" style={{ color: 'var(--accent)', opacity: 0.6 }} />
      </div>
      <h3 className="text-lg font-bold text-text-bright mb-2">No Downloads Yet</h3>
      <p className="text-sm text-text-dim max-w-md leading-relaxed" style={{ color: 'var(--text-dim)' }}>
        Browse the Store to find games and click Install to start downloading.
        Your active downloads, queue, and history will appear here.
      </p>
      <div className="flex items-center gap-2 mt-6 text-xs text-text-dim">
        <Inbox className="w-4 h-4" />
        <span>Queued</span>
        <span className="mx-1">·</span>
        <PackageOpen className="w-4 h-4" />
        <span>Completed</span>
      </div>
    </div>
  )
}
