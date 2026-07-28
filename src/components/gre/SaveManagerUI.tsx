import { useState, useEffect } from 'react'
import {
  Save,
  Upload,
  Download,
  Trash2,
  RefreshCw,
  Loader2,
  FolderOpen,
  HardDrive,
  Clock,
  FileWarning,
  CheckCircle2,
  AlertCircle,
  RotateCcw,
  Archive,
} from 'lucide-react'
import type { SaveBackup } from '../../domain/types'
import { useSaveManagerStore } from '../../stores/useSaveManagerStore'

interface SaveManagerUIProps {
  appId: string
  gameName: string
  installDir?: string
}

export function SaveManagerUI({ appId, gameName, installDir }: SaveManagerUIProps) {
  const {
    saves, backups, totalSize, detecting, backingUp, restoring,
    error, successMessage,
    detectSaves, listBackups, createBackup, restoreBackup, deleteBackup, clearMessages,
  } = useSaveManagerStore()
  const [loaded, setLoaded] = useState(false)
  const [selectedBackup, setSelectedBackup] = useState<SaveBackup | null>(null)
  const [confirmRestore, setConfirmRestore] = useState<SaveBackup | null>(null)

  useEffect(() => {
    if (!loaded) {
      Promise.all([
        detectSaves(appId, gameName, installDir),
        listBackups(appId),
      ]).then(() => setLoaded(true))
    }
  }, [detectSaves, listBackups, appId, gameName, installDir, loaded])

  // Auto-clear messages after 5s
  useEffect(() => {
    if (error || successMessage) {
      const timer = setTimeout(clearMessages, 5000)
      return () => clearTimeout(timer)
    }
  }, [error, successMessage, clearMessages])

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
  }

  const formatDate = (ts: number) => {
    return new Date(ts).toLocaleDateString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
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
      <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
        <div className="flex items-center gap-2.5">
          <Save className="w-5 h-5" style={{ color: 'var(--accent)' }} />
          <span className="text-sm font-bold text-text-bright">Save Manager</span>
          {saves.length > 0 && (
            <span className="text-xs text-text-dim">
              ({saves.length} files · {formatSize(totalSize)})
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { detectSaves(appId, gameName, installDir); listBackups(appId) }}
            className="p-1.5 rounded-lg transition-colors hover:bg-white/[0.08]"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 text-text-dim ${detecting ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => createBackup(appId)}
            disabled={saves.length === 0 || backingUp}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all hover:brightness-110 disabled:opacity-50"
            style={{ background: 'var(--accent)', color: '#fff' }}
          >
            {backingUp ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Archive className="w-3.5 h-3.5" />
            )}
            Backup Now
          </button>
        </div>
      </div>

      {/* Messages */}
      {(error || successMessage) && (
        <div
          className="mx-5 mt-3 px-3 py-2 rounded-xl text-xs font-medium flex items-center gap-2"
          style={{
            background: error ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)',
            color: error ? 'var(--red)' : 'var(--green)',
          }}
        >
          {error ? <AlertCircle className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
          <span>{error || successMessage}</span>
          <button onClick={clearMessages} className="ml-auto opacity-60 hover:opacity-100">×</button>
        </div>
      )}

      <div className="px-5 py-4 space-y-4">
        {/* Detected Saves */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-text-dim">Detected Save Files</span>
            <span className="text-xs text-text-dim">{saves.length} files</span>
          </div>
          {detecting ? (
            <div className="flex items-center justify-center py-4 text-text-dim">
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
              <span className="text-xs">Scanning...</span>
            </div>
          ) : saves.length === 0 ? (
            <div className="flex items-center justify-center py-4 text-text-dim">
              <FileWarning className="w-5 h-5 mr-2 opacity-50" />
              <span className="text-xs">No save files detected for this game</span>
            </div>
          ) : (
            <div className="space-y-1 max-h-[200px] overflow-y-auto">
              {saves.slice(0, 20).map((save, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between py-1.5 px-2.5 rounded-lg hover:bg-white/[0.03] transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Save className="w-3.5 h-3.5 text-text-dim flex-shrink-0" />
                    <span className="text-xs text-text-primary truncate">
                      {save.path.split('\\').pop() || save.path.split('/').pop()}
                    </span>
                  </div>
                  <span className="text-[10px] font-mono text-text-dim flex-shrink-0">
                    {formatSize(save.size)}
                  </span>
                </div>
              ))}
              {saves.length > 20 && (
                <p className="text-[10px] text-text-dim text-center pt-1">
                  +{saves.length - 20} more files
                </p>
              )}
            </div>
          )}
        </div>

        {/* Backups */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-text-dim">Backups</span>
            <span className="text-xs text-text-dim">{backups.length} backup(s)</span>
          </div>
          {backups.length === 0 ? (
            <div className="flex items-center justify-center py-4 text-text-dim">
              <Archive className="w-5 h-5 mr-2 opacity-50" />
              <span className="text-xs">No backups yet. Click "Backup Now" to create one.</span>
            </div>
          ) : (
            <div className="space-y-1.5 max-h-[240px] overflow-y-auto">
              {backups.map((backup) => (
                <div
                  key={backup.id}
                  className={`flex items-center justify-between py-2 px-3 rounded-xl transition-all cursor-pointer ${
                    selectedBackup?.id === backup.id
                      ? 'bg-accent/10 border border-accent/25'
                      : 'bg-white/[0.03] hover:bg-white/[0.06]'
                  }`}
                  onClick={() => setSelectedBackup(backup)}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-text-primary truncate">{backup.name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] font-mono text-text-dim">{formatDate(backup.createdAt)}</span>
                      <span className="text-[10px] text-text-dim">·</span>
                      <span className="text-[10px] text-text-dim">{backup.fileCount} files</span>
                      <span className="text-[10px] text-text-dim">·</span>
                      <span className="text-[10px] font-mono text-text-dim">{formatSize(backup.totalSize)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                    <button
                      onClick={(e) => { e.stopPropagation(); setConfirmRestore(backup) }}
                      className="p-1.5 rounded-lg text-accent hover:bg-accent/10 transition-colors"
                      title="Restore"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteBackup(backup) }}
                      className="p-1.5 rounded-lg text-red/60 hover:text-red hover:bg-red/10 transition-colors"
                      title="Delete backup"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Restore Confirmation */}
        {confirmRestore && (
          <div
            className="p-4 rounded-xl"
            style={{
              background: 'rgba(239,68,68,0.08)',
              border: '1px solid rgba(239,68,68,0.2)',
            }}
          >
            <div className="flex items-center gap-2 mb-2">
              <AlertCircle className="w-4 h-4 text-red" />
              <span className="text-xs font-bold text-red">Restore Backup?</span>
            </div>
            <p className="text-xs text-text-dim mb-3">
              This will overwrite your current save files with the backup "{confirmRestore.name}" ({confirmRestore.fileCount} files).
              This action cannot be undone.
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={async () => {
                  await restoreBackup(confirmRestore)
                  setConfirmRestore(null)
                  await detectSaves(appId, gameName, installDir)
                }}
                disabled={restoring}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold text-white transition-all hover:brightness-110 disabled:opacity-50"
                style={{ background: 'var(--red)' }}
              >
                {restoring ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <RotateCcw className="w-3.5 h-3.5" />
                )}
                Restore
              </button>
              <button
                onClick={() => setConfirmRestore(null)}
                className="px-4 py-2 rounded-lg text-xs font-semibold text-text-dim hover:text-text-bright transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
