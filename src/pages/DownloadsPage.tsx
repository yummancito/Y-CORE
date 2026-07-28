// ============================================================================
// src/pages/DownloadsPage.tsx — Download Engine V3
// ----------------------------------------------------------------------------
// Página /downloads completamente reescrita con la UI del motor de descargas.
// Reemplaza la antigua vista simple con:
//   - Download Stats panel (activo, cola, hoy, fallos, velocidad, total)
//   - Download Toolbar (filtros, búsqueda, ordenamiento, pausa global)
//   - Download Task list (tarjetas expandibles con progreso/speed/ETA)
//   - Download History panel (historial de completados/fallidos)
//   - Process Monitor (juegos corriendo)
//   - Empty State
// ============================================================================

import { useEffect, useMemo, useState } from 'react'
import { Loader2, ShieldCheck } from 'lucide-react'
import { usePageHeader } from '../components/layout/AppShell'
import { useDownloadEngineStore } from '../stores/useDownloadEngineV3Store'
import { DownloadStatsPanel } from '../components/downloads/DownloadStatsPanel'
import { DownloadToolbar } from '../components/downloads/DownloadToolbar'
import { DownloadTaskCard } from '../components/downloads/DownloadTaskCard'
import { DownloadHistoryPanel } from '../components/downloads/DownloadHistoryPanel'
import { DownloadEmptyState } from '../components/downloads/DownloadEmptyState'
import { IntegrityCheckDialog } from '../components/downloads/IntegrityCheckDialog'
import { ProcessMonitor } from '../components/gre/ProcessMonitor'
import { t } from '../lib/i18n'

export default function DownloadsPage() {
  const { tasks, status, filters, init, getFilteredTasks, initialized } = useDownloadEngineStore()
  const [integrityDialog, setIntegrityDialog] = useState<{ appId: string; installDir: string } | null>(null)

  // Init the store on mount (connects to engine + subscribes to IPC events)
  useEffect(() => {
    init()
    return () => { useDownloadEngineStore.getState().destroy() }
  }, [init])

  // Memoizados para estabilizar referencias y evitar cómputos en cada render
  // cuando el store de descargas se actualiza frecuentemente (download:progress)
  const filteredTasks = useMemo(() => getFilteredTasks(), [tasks, status, filters])
  const hasActive = useMemo(
    () => tasks.some(
      (t) => t.state === 'downloading' || t.state === 'preparing' || t.state === 'connecting',
    ),
    [tasks],
  )
  const totalPending = useMemo(
    () => tasks.filter(
      (t) => t.state === 'queued' || t.state === 'paused',
    ).length,
    [tasks],
  )

  usePageHeader(
    <div className="flex items-center justify-between h-11">
      <div className="flex items-center gap-4">
        <h1 className="text-xl font-bold text-text-bright leading-none">
          {t('downloads.title') || 'Downloads'}
        </h1>
        <p className="text-[11px] text-text-dim">
          {t('downloads.subtitle') || 'Manage game downloads'}
        </p>
      </div>
      {(hasActive || totalPending > 0) && (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-accent/15 text-accent text-xs font-semibold border border-accent/30">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          {hasActive ? `${status?.active || 0} active` : ''}
          {hasActive && totalPending > 0 ? ' · ' : ''}
          {totalPending > 0 ? `${totalPending} queued` : ''}
        </span>
      )}
    </div>,
    [hasActive, totalPending, status?.active],
  )

  return (
    <div className="max-w-4xl mx-auto p-8 space-y-5">
      {/* Integrity check button */}
      {tasks.length > 0 && tasks.some((t) => t.state === 'completed') && (
        <div className="flex justify-end">
          <button
            onClick={() => {
              const completed = tasks.find((t) => t.state === 'completed')
              if (completed) setIntegrityDialog({ appId: completed.appId, installDir: completed.installDir })
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-text-secondary hover:text-text-bright hover:bg-white/[0.08] transition-all"
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            Verify Integrity
          </button>
        </div>
      )}

      {/* Stats Panel */}
      <DownloadStatsPanel />

      {/* Toolbar with filters */}
      {tasks.length > 0 && <DownloadToolbar />}

      {/* Task List */}
      {filteredTasks.length > 0 && (
        <div className="space-y-3">
          {filteredTasks.map((task) => (
            <DownloadTaskCard key={task.id} task={task} />
          ))}
        </div>
      )}

      {/* Empty State (only when nothing exists) */}
      <DownloadEmptyState />

      {/* Integrity Check Dialog */}
      {integrityDialog && (
        <IntegrityCheckDialog
          appId={integrityDialog.appId}
          installDir={integrityDialog.installDir}
          open={!!integrityDialog}
          onClose={() => setIntegrityDialog(null)}
        />
      )}

      {/* Process Monitor (running games) */}
      <ProcessMonitor />

      {/* History Panel */}
      <DownloadHistoryPanel />
    </div>
  )
}
