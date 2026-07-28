import { Pause, Play, X } from 'lucide-react'
import { useDownloadEngineStore, formatBytes, formatSpeed, formatEta } from '../../stores/useDownloadEngineV3Store'
import type { DownloadTask } from '../../stores/useDownloadEngineV3Store'

interface DownloadTaskCardModernProps {
  task: DownloadTask
}

export function DownloadTaskCardModern({ task }: DownloadTaskCardModernProps) {
  const { pauseTask, cancelTask, startTask } = useDownloadEngineStore()

  const isActive = task.state === 'downloading' || task.state === 'preparing' || task.state === 'connecting'
  const isPaused = task.state === 'paused'
  const isQueued = task.state === 'queued'
  const isDone = task.state === 'completed' || task.state === 'failed' || task.state === 'cancelled'
  const isError = task.state === 'failed'

  const progressPercent = Math.min(100, task.percent)
  const statusColor = isError ? '#ef4444' : isActive ? '#3bb2f7' : '#71717a'

  return (
    <div className="w-full rounded-xl p-4 transition-all" style={{
      background: isActive ? 'rgba(59,178,247,0.08)' : 'rgba(255,255,255,0.04)',
      border: `1px solid ${isActive ? 'rgba(59,178,247,0.2)' : 'rgba(255,255,255,0.08)'}`,
    }}>
      {/* Header con nombre y estado */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-bold text-white truncate">{task.name}</h3>
          <div className="flex items-center gap-2 mt-1 text-xs" style={{ color: statusColor }}>
            <div className="w-1.5 h-1.5 rounded-full" style={{ background: statusColor }} />
            <span className="capitalize font-medium">
              {isActive ? 'Descargando' : isQueued ? 'En cola' : isPaused ? 'Pausado' : task.state}
            </span>
          </div>
        </div>

        {/* Botones de control */}
        <div className="flex items-center gap-2 ml-4">
          {isActive && (
            <button
              onClick={() => pauseTask(task.id)}
              className="p-2 rounded-lg hover:bg-white/[0.1] transition-colors"
              title="Pausar"
            >
              <Pause className="w-4 h-4 text-text-bright" />
            </button>
          )}
          {(isPaused || isQueued) && (
            <button
              onClick={() => startTask(task.id)}
              className="p-2 rounded-lg hover:bg-white/[0.1] transition-colors"
              title="Reanudar"
            >
              <Play className="w-4 h-4 text-green-400" />
            </button>
          )}
          {!isDone && (
            <button
              onClick={() => cancelTask(task.id)}
              className="p-2 rounded-lg hover:bg-red/10 transition-colors"
              title="Cancelar"
            >
              <X className="w-4 h-4 text-red-400" />
            </button>
          )}
        </div>
      </div>

      {/* Barra de progreso - ESTILO STEAM */}
      {!isDone && task.bytesTotal > 0 && (
        <div className="mb-3">
          <div className="relative h-8 rounded-lg overflow-hidden" style={{
            background: 'rgba(0,0,0,0.3)',
            border: '1px solid rgba(255,255,255,0.08)',
          }}>
            {/* Barra de progreso */}
            <div
              className="h-full transition-all duration-300 flex items-center justify-center"
              style={{
                width: `${progressPercent}%`,
                background: isError
                  ? 'linear-gradient(90deg, #ef4444, #dc2626)'
                  : 'linear-gradient(90deg, #3bb2f7, #0ea5e9)',
                boxShadow: isActive ? '0 0 12px rgba(59,178,247,0.4)' : 'none',
              }}
            >
              {/* Porcentaje en la barra */}
              {progressPercent > 15 && (
                <span className="text-xs font-bold text-white">
                  {progressPercent.toFixed(0)}%
                </span>
              )}
            </div>

            {/* Porcentaje fuera de la barra (si es muy pequeño) */}
            {progressPercent <= 15 && (
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-bold text-white">
                {progressPercent.toFixed(0)}%
              </span>
            )}
          </div>
        </div>
      )}

      {/* Stats - Información de descarga */}
      <div className="grid grid-cols-4 gap-2 text-xs">
        {/* Descargado / Total */}
        <div className="px-2 py-1.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.05)' }}>
          <div style={{ color: '#71717a' }} className="font-medium mb-0.5">Descargado</div>
          <div className="text-white font-bold">
            {formatBytes(task.bytesDownloaded)}
          </div>
          <div style={{ color: '#71717a' }} className="text-[10px]">
            / {formatBytes(task.bytesTotal)}
          </div>
        </div>

        {/* Velocidad */}
        <div className="px-2 py-1.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.05)' }}>
          <div style={{ color: '#71717a' }} className="font-medium mb-0.5">Velocidad</div>
          <div className="text-white font-bold">
            {formatSpeed(task.speedBytesPerSec)}
          </div>
          <div style={{ color: '#71717a' }} className="text-[10px]">
            {isActive ? 'En tiempo real' : '—'}
          </div>
        </div>

        {/* Tiempo restante */}
        <div className="px-2 py-1.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.05)' }}>
          <div style={{ color: '#71717a' }} className="font-medium mb-0.5">Falta</div>
          <div className="text-white font-bold">
            {formatEta(task.etaSeconds)}
          </div>
          <div style={{ color: '#71717a' }} className="text-[10px]">
            aproximado
          </div>
        </div>

        {/* Velocidad máxima */}
        <div className="px-2 py-1.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.05)' }}>
          <div style={{ color: '#71717a' }} className="font-medium mb-0.5">Máximo</div>
          <div className="text-white font-bold">
            {formatSpeed(task.peakSpeed)}
          </div>
          <div style={{ color: '#71717a' }} className="text-[10px]">
            alcanzado
          </div>
        </div>
      </div>

      {/* Error message */}
      {isError && task.errorMessage && (
        <div className="mt-3 p-2 rounded-lg bg-red/10 border border-red/20">
          <p className="text-xs text-red-300">{task.errorMessage}</p>
        </div>
      )}
    </div>
  )
}
