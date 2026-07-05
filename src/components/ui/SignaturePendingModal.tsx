import { useNavigate } from 'react-router-dom'
import { FlaskConical, X } from 'lucide-react'
import { t } from '../../lib/i18n'
import { useSignaturePendingStore } from '../../stores/useSignaturePendingStore'

export function SignaturePendingModal() {
  const { isOpen, close } = useSignaturePendingStore()
  const navigate = useNavigate()

  if (!isOpen) return null

  const handleJoinBeta = () => {
    close()
    navigate('/settings')
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
            <FlaskConical className="w-6 h-6 text-amber-400" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-text-bright">{t('signaturePending.title')}</h3>
            <p className="text-xs text-text-dim">{t('signaturePending.betaLabel')}</p>
          </div>
        </div>

        <p className="text-sm text-text-secondary leading-relaxed mb-6">
          {t('signaturePending.message')}
        </p>

        <div className="flex gap-3">
          <button
            onClick={close}
            className="flex-1 px-4 py-2.5 rounded-xl bg-white/[0.05] text-text-secondary border border-white/[0.08] hover:bg-white/[0.08] hover:text-text-bright transition-colors text-sm font-medium"
          >
            {t('signaturePending.accept')}
          </button>
          <button
            onClick={handleJoinBeta}
            className="flex-1 px-4 py-2.5 rounded-xl bg-accent text-white hover:bg-accent-bright transition-colors text-sm font-medium shadow-lg shadow-accent/20"
          >
            {t('signaturePending.joinBeta')}
          </button>
        </div>
      </div>
    </div>
  )
}
