import { useState } from 'react'
import { FlaskConical, X, RefreshCw, CheckCircle2, AlertTriangle } from 'lucide-react'
import { t } from '../../lib/i18n'
import { useSignaturePendingStore } from '../../stores/useSignaturePendingStore'

export function SignaturePendingModal() {
  const { isOpen, close } = useSignaturePendingStore()
  const [retrying, setRetrying] = useState(false)
  const [result, setResult] = useState<'pending' | 'approved' | 'error' | null>(null)

  if (!isOpen) return null

  const handleRetry = async () => {
    setRetrying(true)
    setResult(null)
    try {
      const res = await window.steamtools?.retrySignatureCheck?.()
      if (res?.success) {
        setResult('approved')
      } else if (res?.status === 'pending') {
        setResult('pending')
      } else {
        setResult('error')
      }
    } catch {
      setResult('error')
    } finally {
      setRetrying(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={close} />
      <div className="relative w-full max-w-md rounded-2xl border border-white/[0.08] bg-bg-primary/95 shadow-2xl p-6 animate-in fade-in zoom-in-95 duration-200">
        <button
          onClick={close}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-text-dim hover:text-text-bright hover:bg-white/[0.06] transition-colors"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-4 mb-4">
          <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
            {result === 'approved' ? (
              <CheckCircle2 className="w-6 h-6 text-green-400" />
            ) : (
              <FlaskConical className="w-6 h-6 text-amber-400" />
            )}
          </div>
          <div>
            <h3 className="text-lg font-bold text-text-bright">{t('signaturePending.title')}</h3>
            {result !== 'approved' && (
              <p className="text-xs text-text-dim">Firma de seguridad</p>
            )}
          </div>
        </div>

        <p className="text-sm text-text-secondary leading-relaxed mb-6">
          {result === 'approved'
            ? 'La firma ya está disponible. Reinicia Steam para aplicar los cambios.'
            : result === 'pending'
              ? 'La firma sigue en proceso de validación. Vuelve a intentar más tarde.'
              : t('signaturePending.message')}
        </p>

        {result === 'error' && (
          <div className="flex items-center gap-2 text-xs text-red-400 mb-4 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            Error al verificar la firma. Intenta de nuevo más tarde.
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={() => { close(); setResult(null) }}
            className="flex-1 px-4 py-2.5 rounded-xl bg-white/[0.05] text-text-secondary border border-white/[0.08] hover:bg-white/[0.08] hover:text-text-bright transition-colors text-sm font-medium"
          >
            {result === 'approved' ? t('signaturePending.accept') : 'Cerrar'}
          </button>
          {result !== 'approved' && (
            <button
              onClick={handleRetry}
              disabled={retrying}
              className="flex-1 px-4 py-2.5 rounded-xl bg-accent text-white hover:bg-accent-bright disabled:opacity-50 transition-colors text-sm font-medium shadow-lg shadow-accent/20 flex items-center justify-center gap-2"
            >
              <RefreshCw className={`w-4 h-4 ${retrying ? 'animate-spin' : ''}`} />
              {retrying ? 'Verificando...' : 'Reintentar'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
