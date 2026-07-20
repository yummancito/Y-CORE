import { Trash2, TriangleAlert } from 'lucide-react'
import { Modal } from './Modal'

interface ConfirmModalProps {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'danger' | 'warning'
}

export function ConfirmModal({ open, onClose, onConfirm, title, message, confirmLabel = 'Confirmar', cancelLabel = 'Cancelar', variant = 'danger' }: ConfirmModalProps) {
  const Icon = variant === 'danger' ? Trash2 : TriangleAlert
  const iconColor = variant === 'danger' ? '#ef4444' : '#eab308'
  const bgColor = variant === 'danger' ? 'rgba(239,68,68,0.12)' : 'rgba(234,179,8,0.12)'
  const borderColor = variant === 'danger' ? 'rgba(239,68,68,0.25)' : 'rgba(234,179,8,0.25)'
  const btnGradient = variant === 'danger' ? 'linear-gradient(135deg,#ef4444,#dc2626)' : 'linear-gradient(135deg,#eab308,#ca8a04)'
  const btnShadow = variant === 'danger' ? '0 6px 20px rgba(239,68,68,0.3)' : '0 6px 20px rgba(234,179,8,0.3)'

  return (
    <Modal open={open} onClose={onClose} width="420px">
      <div className="p-6">
        <div className="flex items-start gap-3.5 mb-4">
          <span
            className="w-11 h-11 flex-shrink-0 rounded-xl flex items-center justify-center"
            style={{ background: bgColor, border: `1px solid ${borderColor}` }}
          >
            <Icon className="w-5.5 h-5.5" style={{ color: iconColor }} />
          </span>
          <div className="min-w-0">
            <h3 className="text-base font-bold text-text-bright mb-1">{title}</h3>
            <p className="text-sm leading-relaxed text-text-secondary" style={{ textWrap: 'pretty' }}>{message}</p>
          </div>
        </div>
        <div className="flex gap-2.5 justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl text-sm font-semibold text-text-secondary bg-white/[0.06] border border-white/[0.1] hover:bg-white/[0.1] hover:text-text-bright transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            onClick={() => { onConfirm(); onClose() }}
            className="px-5 py-2.5 rounded-xl text-sm font-bold text-white border-none cursor-pointer transition-all"
            style={{ background: btnGradient, boxShadow: btnShadow }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  )
}
