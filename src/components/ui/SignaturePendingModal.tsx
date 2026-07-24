import { useState } from 'react'
import { X, AlertTriangle, Loader2, RotateCw } from 'lucide-react'
import { useSignaturePendingStore } from '../../stores/useSignaturePendingStore'
import { t } from '../../lib/i18n'

interface RetryResult { success?: boolean; status?: string; error?: string }

/**
 * Modal que se muestra cuando la firma de un build de Steam está en validación.
 *
 * Se abre automáticamente cuando:
 *  - El signature-cache.ts detecta un build sin firma aprobada (`status: 'pending'`)
 *  - El equipo fuerza el estado desde Settings (toggle 'Simular validación pendiente')
 *    o una session anterior dejó `forceSignaturePending: true` en config
 *
 * En el botón "Reintentar" NO se cierra el modal si el sistema sigue reportando
 * pendiente: se mantiene abierto y muestra el error en línea. Solo "Aceptar"
 * cierra siempre.
 */
export function SignaturePendingModal() {
  const { isOpen, isForced, close } = useSignaturePendingStore()
  const [retrying, setRetrying] = useState(false)
  const [retryError, setRetryError] = useState<string | null>(null)

  if (!isOpen) return null

  const handleAccept = () => {
    // El flag de forzado vive solo en runtime (no se persiste entre sesiones).
    // Al cerrar el store, isForced vuelve a false automáticamente.
    close()
  }

  const handleRetry = async () => {
    if (retrying) return
    setRetrying(true)
    setRetryError(null)
    try {
      const result = (await window.steamtools?.retrySignatureCheck?.()) as RetryResult | undefined
      if (result?.success) {
        // Build ya validado: cerramos el modal.
        close()
      } else {
        // Sigue pending (o fallo): dejamos el modal abierto y mostramos el motivo.
        setRetryError(result?.error || t('signaturePending.stillPending'))
      }
    } catch (err: any) {
      setRetryError(err?.message || t('signaturePending.retryFailed'))
    } finally {
      setRetrying(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[9500] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-md rounded-2xl border border-amber-500/20 bg-[#1a1814] p-6 shadow-2xl">
        <button
          onClick={handleAccept}
          disabled={retrying}
          className="absolute top-4 right-4 text-text-dim hover:text-text-bright transition-colors disabled:opacity-40"
          title="Cerrar"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-amber-500/15 flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <p className="text-sm font-bold text-text-bright">
              {t('signaturePending.title')}
            </p>
            {isForced && (
              <p className="text-[11px] text-amber-400 mt-0.5">
                {t('signaturePending.forcedBadge')}
              </p>
            )}
          </div>
        </div>

        <p className="text-sm text-text-secondary leading-relaxed mb-4">
          {t('signaturePending.message')}
        </p>

        {retryError && (
          <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 mb-4">
            {retryError}
          </p>
        )}

        <div className="flex items-center gap-3 pt-2 border-t border-white/[0.06]">
          <button
            onClick={handleRetry}
            disabled={retrying}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.08] disabled:opacity-50 text-text-bright text-sm font-medium transition-colors border border-white/[0.08]"
          >
            {retrying ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCw className="w-4 h-4" />}
            {t('signaturePending.joinBeta')}
          </button>
          <button
            onClick={handleAccept}
            disabled={retrying}
            className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black text-sm font-semibold transition-colors"
          >
            {t('signaturePending.accept')}
          </button>
        </div>
      </div>
    </div>
  )
}
