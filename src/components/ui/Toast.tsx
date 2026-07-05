import { CheckCircle, AlertCircle, Info, AlertTriangle, X } from 'lucide-react'
import { useToastStore } from '../../stores/useToastStore'
import { t } from '../../lib/i18n'

const icons = {
  success: CheckCircle,
  error: AlertCircle,
  info: Info,
  warning: AlertTriangle,
}

const colors = {
  success: 'text-green-400 border-green-500/50 bg-green-500/10',
  error: 'text-red-400 border-red-500/50 bg-red-500/10',
  info: 'text-blue-400 border-blue-500/50 bg-blue-500/10',
  warning: 'text-amber-400 border-amber-500/50 bg-amber-500/10',
}

export function ToastContainer() {
  const { toasts, dismissToast } = useToastStore()

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-[60] flex flex-col-reverse gap-2 max-w-sm">
      {toasts.map((toast) => {
        const Icon = icons[toast.type]
        return (
          <div
            key={toast.id}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg border shadow-2xl animate-slide-right ${colors[toast.type]}`}
            role="alert"
          >
            <Icon className="w-5 h-5 flex-shrink-0" />
            <span className="text-sm flex-1">{toast.message}</span>
            <button onClick={() => dismissToast(toast.id)} className="flex-shrink-0 opacity-70 hover:opacity-100 transition-opacity" aria-label={t('common.dismiss')}>
              <X className="w-4 h-4" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
