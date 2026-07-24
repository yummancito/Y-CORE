// src/pages/DownloadsPage.tsx
//
// Página /downloads — única superficie de progreso de descargas de la app.
// No hay modal/dock flotante: cualquier acción de "ver descarga" navega
// acá. Lee de useDownloadQueueStore (queue, current, importProgress) + de
// useSteamCmdJobsStore (active SteamCMD job) para mostrar el state más rico
// posible cuando hay una descarga activa.
//
//  • Activo (SteamCMD):  nombre + bytes totales + speed + ETA + pico + botón Cancelar.
//  • Activo (Lua):       nombre + importProgress.status (string del backend).
//  • Cola:               lista de appIds/nombres pendientes + botón Quitar.
//  • Empty state:        "Sin descargas activas — agregá desde la Tienda".

import {
  CloudDownload,
  XCircle,
  Trash2,
  Loader2,
  CheckCircle2,
  PackageOpen,
  Gauge,
  Timer,
} from 'lucide-react'
import { Card } from '../components/ui/Card'
import { usePageHeader } from '../components/layout/AppShell'
import { useToastStore } from '../stores/useToastStore'
import {
  useDownloadQueueStore,
  type QueueItem,
} from '../stores/useDownloadQueueStore'
import { useSteamCmdJobsStore } from '../stores/useSteamCmdJobsStore'
import { t, tf } from '../lib/i18n'

function formatBytes(bytes: number | undefined): string {
  if (!bytes || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

function formatSpeed(bps: number): string {
  return `${formatBytes(bps)}/s`
}

function formatEta(seconds: number | null | undefined): string {
  if (seconds == null || seconds < 0) return '—'
  if (seconds < 60) return `${Math.round(seconds)}s`
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return `${m}m ${s}s`
}

export default function DownloadsPage() {
  const queue = useDownloadQueueStore((s) => s.queue)
  const current = useDownloadQueueStore((s) => s.current)
  const importProgress = useDownloadQueueStore((s) => s.importProgress)
  const remove = useDownloadQueueStore((s) => s.remove)
  const clear = useDownloadQueueStore((s) => s.clear)
  const { showToast } = useToastStore()

  const activeSteamJob = useSteamCmdJobsStore((s) => s.active)
  const history = useSteamCmdJobsStore((s) => s.history)

  usePageHeader(
    <div className="flex items-center justify-between h-11">
      <div className="flex items-center gap-4">
        <h1 className="text-xl font-bold text-text-bright leading-none">
          {t('downloads.title')}
        </h1>
        <p className="text-[11px] text-text-dim">{t('downloads.subtitle')}</p>
      </div>
      {(queue.length > 0 || current) && (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-accent/15 text-accent text-xs font-semibold border border-accent/30">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          {current ? 1 : 0} activo · {queue.length} en cola
        </span>
      )}
    </div>,
    [queue.length, current?.appId],
  )

  const handleRemoveFromQueue = (item: QueueItem) => {
    remove(item.appId)
    showToast('info', tf('downloads.removed', { name: item.name }))
  }

  const handleCancelActive = async () => {
    if (activeSteamJob) {
      await window.steamtools?.cancelSteamCmdInstall?.(activeSteamJob.appId)
      showToast('info', t('downloads.cancelling'))
    } else if (current) {
      // Sin SteamCMD job activo: el dispatcher de Lua está en curso. El único
      // path razonable es quitar el item de la queue para que no re-arranque
      // después del finally. Esto NO cancela una subtarea en curso — eso lo
      // hace el processQueue loop.
      remove(current.appId)
      showToast('warning', t('downloads.removeWillStopSoon'))
    }
  }

  const totalActive = current ? 1 : 0
  const totalPending = queue.length

  return (
    <div className="max-w-4xl mx-auto p-8 space-y-6">
      {/* ── ACTIVO ─────────────────────────────────────────────────────── */}
      <Card>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-accent/15 flex items-center justify-center">
            <CloudDownload className="w-5 h-5 text-accent" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold text-text-bright">
              {t('downloads.activeSection')}
            </h3>
            <p className="text-xs text-text-dim mt-0.5">
              {totalActive > 0
                ? tf('downloads.activeHelp', {
                    name: activeSteamJob?.gameName ?? current?.name ?? '—',
                  })
                : t('downloads.idleHelp')}
            </p>
          </div>
        </div>

        {/* Sub-bloque 1: SteamCMD live job (preferente si existe) */}
        {activeSteamJob && (
          <ActiveSteamCmdCard onCancel={handleCancelActive} />
        )}

        {/* Sub-bloque 2: Lua/client dispatch (si no hay SteamCMD job) */}
        {!activeSteamJob && current && (
          <div className="flex items-start gap-3 p-3 rounded-xl bg-white/[0.04] border border-white/[0.06]">
            <Loader2 className="w-5 h-5 text-accent flex-shrink-0 mt-0.5 animate-spin" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-text-bright truncate">
                {current.name}
              </p>
              <p className="text-xs text-text-dim mt-0.5 font-mono">
                appId {current.appId} · {importProgress?.status ?? t('downloads.preparing')}
              </p>
            </div>
            <button
              onClick={handleCancelActive}
              className="px-2.5 py-1 rounded-lg text-xs font-semibold text-red-300 bg-red-500/15 border border-red-500/30 hover:bg-red-500/25 transition-colors"
              title={t('common.cancel')}
            >
              {t('common.cancel')}
            </button>
          </div>
        )}

        {/* Sub-bloque 3: idle */}
        {!activeSteamJob && !current && (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <PackageOpen className="w-10 h-10 text-text-dim mb-2 opacity-50" />
            <p className="text-sm text-text-secondary">{t('downloads.emptyActive')}</p>
            <p className="text-xs text-text-dim mt-1 max-w-sm">
              {t('downloads.emptyActiveHint')}
            </p>
          </div>
        )}
      </Card>

      {/* ── COLA ───────────────────────────────────────────────────────── */}
      <Card>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <h3 className="text-base font-semibold text-text-bright">
              {t('downloads.queueSection')}
            </h3>
            {totalPending > 0 && (
              <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-white/[0.06] text-text-secondary">
                {totalPending}
              </span>
            )}
          </div>
          {totalPending > 0 && (
            <button
              onClick={() => {
                if (window.confirm(t('downloads.clearConfirm'))) clear()
              }}
              className="text-xs font-semibold text-text-dim hover:text-red-400 transition-colors"
              title={t('downloads.clearAllHint')}
            >
              {t('downloads.clearAll')}
            </button>
          )}
        </div>

        {totalPending === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <p className="text-sm text-text-dim">{t('downloads.emptyQueue')}</p>
          </div>
        ) : (
          <div className="flex flex-col divide-y divide-white/[0.05]">
            {queue.map((item, idx) => (
              <div
                key={item.appId}
                className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
              >
                <span className="w-7 h-7 rounded-md bg-white/[0.06] flex items-center justify-center text-[10px] font-mono text-text-dim shrink-0">
                  {idx + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-text-bright truncate">
                    {item.name}
                  </p>
                  <p className="text-[11px] text-text-dim font-mono mt-0.5">
                    appId {item.appId}
                  </p>
                </div>
                <button
                  onClick={() => handleRemoveFromQueue(item)}
                  className="px-2.5 py-1 rounded-lg text-xs font-semibold text-text-dim hover:text-red-400 hover:bg-red-500/10 transition-colors flex items-center gap-1.5"
                  title={t('downloads.removeFromQueue')}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  {t('downloads.removeFromQueue')}
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* ── HISTORIAL (últimos 5) ──────────────────────────────────────── */}
      {history.length > 0 && (
        <Card>
          <div className="flex items-center gap-3 mb-3">
            <CheckCircle2 className="w-5 h-5 text-text-secondary" />
            <h3 className="text-base font-semibold text-text-bright">
              {t('downloads.historySection')}
            </h3>
          </div>
          <div className="flex flex-col divide-y divide-white/[0.05]">
            {history.slice(0, 5).map((h) => (
              <div
                key={`${h.appId}-${h.endedAt}`}
                className="flex items-center gap-3 py-2 first:pt-0 last:pb-0"
              >
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${
                    h.state === 'complete'
                      ? 'bg-emerald-400'
                      : h.state === 'failed'
                        ? 'bg-red-400'
                        : 'bg-amber-400'
                  }`}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-text-bright truncate">
                    {h.gameName}
                  </p>
                </div>
                <span className="text-[11px] text-text-dim font-mono shrink-0">
                  {h.state}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}

// ── Sub-componente: tarjeta SteamCMD live ─────────────────────────────────
function ActiveSteamCmdCard({
  onCancel,
}: {
  onCancel: () => void | Promise<void>
}) {
  const active = useSteamCmdJobsStore((s) => s.active)
  if (!active) return null
  const pct = Math.max(0, Math.min(100, active.percent ?? 0))
  const isStalled =
    active.state === 'stalled' ||
    active.state === 'failed' ||
    active.state === 'complete'

  return (
    <div className="rounded-xl bg-accent/[0.08] border border-accent/30 p-4 space-y-3">
      <div className="flex items-start gap-3">
        <Loader2
          className={`w-5 h-5 text-accent flex-shrink-0 mt-0.5 ${
            isStalled ? '' : 'animate-spin'
          }`}
        />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-text-bright truncate">
            {active.gameName}
          </p>
          <p className="text-[11px] text-text-dim font-mono mt-0.5">
            appId {active.appId} · {active.state}
          </p>
        </div>
        <button
          onClick={onCancel}
          className="px-2.5 py-1 rounded-lg text-xs font-semibold text-red-300 bg-red-500/15 border border-red-500/30 hover:bg-red-500/25 transition-colors flex items-center gap-1"
          title={t('common.cancel')}
        >
          <XCircle className="w-3.5 h-3.5" />
          {t('common.cancel')}
        </button>
      </div>

      {/* Progress bar */}
      <div className="space-y-1.5">
        <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden">
          <div
            className="h-full bg-accent transition-all duration-200"
            style={{ width: `${pct}%` }}
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${active.gameName} ${Math.round(pct)}%`}
          />
        </div>
        <div className="flex items-center justify-between text-[11px] font-mono text-text-dim">
          <span>
            {formatBytes(active.bytesDownloaded)} / {formatBytes(active.bytesTotal)}
          </span>
          <span>{pct.toFixed(1)}%</span>
        </div>
      </div>

      {/* Stats grid: velocidad actual, pico, ETA */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg border border-white/[0.07] bg-white/[0.03] px-3 py-2">
          <div className="flex items-center gap-1 text-[9px] uppercase tracking-wider text-text-dim">
            <Gauge className="w-3 h-3" />
            {t('downloads.netSpeed')}
          </div>
          <div className="font-mono text-[13px] font-semibold text-emerald-300 mt-1">
            {formatSpeed(active.speed || 0)}
          </div>
        </div>
        <div className="rounded-lg border border-white/[0.07] bg-white/[0.03] px-3 py-2">
          <div className="flex items-center gap-1 text-[9px] uppercase tracking-wider text-text-dim">
            <Gauge className="w-3 h-3" />
            {t('downloads.peak')}
          </div>
          <div className="font-mono text-[13px] font-semibold text-text-secondary mt-1">
            {formatSpeed(active.peakSpeed || 0)}
          </div>
        </div>
        <div className="rounded-lg border border-white/[0.07] bg-white/[0.03] px-3 py-2">
          <div className="flex items-center gap-1 text-[9px] uppercase tracking-wider text-text-dim">
            <Timer className="w-3 h-3" />
            ETA
          </div>
          <div className="font-mono text-[13px] font-semibold text-text-secondary mt-1">
            {formatEta(active.eta)}
          </div>
        </div>
      </div>
    </div>
  )
}
