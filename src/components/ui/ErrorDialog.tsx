import { useState } from 'react'
import { AlertTriangle, RefreshCw, Send, X, Check, ChevronDown } from 'lucide-react'
import { t } from '../../lib/i18n'
import { Modal } from './Modal'
import { sendDiscordReport } from '../../lib/discord-report'

/** Acciones que puede ofrecer un error (espejo de ErrorAction en el backend). */
export type ErrorAction = 'retry' | 'report' | 'close'

export interface AppErrorInfo {
  /** Mensaje corto y humano. Es LO ÚNICO que se muestra de entrada. */
  message: string
  /** Qué estaba haciendo la app, ej. "listar los juegos instalados". */
  operation?: string
  /** Código interno, sólo para el reporte. */
  code?: string | number
  /** Detalle técnico. NUNCA se muestra por defecto — va oculto y al reporte. */
  technical?: string
  /** Botones a ofrecer. Por defecto: reintentar + reportar + cerrar. */
  actions?: ErrorAction[]
}

/**
 * Diálogo de error pensado para no asustar al usuario:
 *  • Muestra una sola frase clara, sin stacks ni rutas.
 *  • El detalle técnico está plegado tras "Ver detalles" (opcional).
 *  • Botón "Reportar" que manda el detalle por webhook de Discord.
 *  • Botón "Reintentar" cuando la operación se puede repetir.
 */
export function ErrorDialog({
  error,
  open,
  onClose,
  onRetry,
}: {
  error: AppErrorInfo | null
  open: boolean
  onClose: () => void
  onRetry?: () => void
}) {
  const [reportState, setReportState] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle')
  const [showTechnical, setShowTechnical] = useState(false)

  if (!error) return null

  const actions = error.actions ?? ['retry', 'report', 'close']
  const canRetry = actions.includes('retry') && !!onRetry
  const canReport = actions.includes('report')

  const handleReport = async () => {
    setReportState('sending')
    try {
      const res = await sendDiscordReport(
        'Error en Y-core',
        error.message,
        [
          { name: 'Operación', value: error.operation || 'desconocida', inline: true },
          { name: 'Código', value: String(error.code ?? 'n/d'), inline: true },
          {
            name: 'Detalle técnico',
            value: '```' + (error.technical || 'sin detalle').slice(0, 1000) + '```',
          },
        ]
      )
      setReportState(res.success ? 'sent' : 'failed')
    } catch {
      setReportState('failed')
    }
  }

  const handleClose = () => {
    // Resetear para que el diálogo no reabra en estado "enviado".
    setReportState('idle')
    setShowTechnical(false)
    onClose()
  }

  return (
    <Modal open={open} onClose={handleClose}>
      <div className="w-[440px] max-w-full p-6">
        {/* Icono + mensaje humano */}
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-status-error/10 border border-status-error/20 flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="w-6 h-6 text-status-error" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-text-bright">
              {t('error.title')}
            </h2>
            <p className="text-sm text-text-secondary mt-1.5 leading-relaxed">
              {error.message}
            </p>
          </div>
        </div>

        {/* Detalle técnico, plegado — el usuario decide si quiere verlo */}
        {error.technical && (
          <div className="mt-4">
            <button
              onClick={() => setShowTechnical((v) => !v)}
              className="flex items-center gap-1.5 text-xs text-text-dim hover:text-text-secondary transition-colors"
            >
              <ChevronDown
                className={`w-4 h-4 transition-transform duration-200 ${showTechnical ? 'rotate-180' : ''}`}
              />
              {showTechnical ? t('error.hideDetails') : t('error.showDetails')}
            </button>
            {showTechnical && (
              <pre className="mt-2 p-3 rounded-lg bg-black/40 border border-white/[0.06] text-[11px] text-text-dim font-mono overflow-x-auto max-h-32 whitespace-pre-wrap break-words">
                {error.technical}
              </pre>
            )}
          </div>
        )}

        {/* Confirmación del reporte */}
        {reportState === 'sent' && (
          <div className="mt-4 flex items-center gap-2 px-3 py-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
            <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <p className="text-xs text-emerald-300">{t('error.reportSent')}</p>
          </div>
        )}
        {reportState === 'failed' && (
          <div className="mt-4 flex items-center gap-2 px-3 py-2.5 rounded-lg bg-status-error/10 border border-status-error/20">
            <X className="w-4 h-4 text-status-error flex-shrink-0" />
            <p className="text-xs text-status-error">{t('error.reportFailed')}</p>
          </div>
        )}

        {/* Acciones */}
        <div className="mt-6 flex items-center justify-end gap-2">
          {canReport && reportState !== 'sent' && (
            <button
              onClick={handleReport}
              disabled={reportState === 'sending'}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-text-secondary hover:text-text-bright hover:bg-white/[0.08] transition-all disabled:opacity-50"
            >
              {reportState === 'sending' ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              {reportState === 'sending' ? t('error.reporting') : t('error.report')}
            </button>
          )}

          <button
            onClick={handleClose}
            className="px-4 py-2.5 rounded-lg text-sm font-medium text-text-secondary hover:text-text-bright hover:bg-white/[0.08] transition-all"
          >
            {t('common.close')}
          </button>

          {canRetry && (
            <button
              onClick={() => { handleClose(); onRetry!() }}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-accent to-accent-dark shadow-lg shadow-accent/20 hover:brightness-110 transition-all"
            >
              <RefreshCw className="w-4 h-4" />
              {t('error.retry')}
            </button>
          )}
        </div>
      </div>
    </Modal>
  )
}
