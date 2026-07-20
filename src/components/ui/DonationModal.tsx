import { Heart, X } from 'lucide-react'

interface DonationModalProps {
  open: boolean
  onClose: () => void
  onDismissForever: () => void
}

export function DonationModal({ open, onClose, onDismissForever }: DonationModalProps) {
  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-6"
      style={{ background: 'rgba(5,5,7,0.7)', backdropFilter: 'blur(6px)' }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-[420px] rounded-2xl overflow-hidden animate-bounce-in"
        style={{ background: '#18181b', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 24px 80px rgba(0,0,0,0.6)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-3.5 right-3.5 w-9 h-9 rounded-xl flex items-center justify-center bg-transparent border-none text-text-dim hover:bg-white/[0.08] hover:text-white cursor-pointer transition-colors"
        >
          <X className="w-[18px] h-[18px]" />
        </button>
        <div className="p-8 text-center">
          <div
            className="w-[68px] h-[68px] rounded-full mx-auto mb-[18px] flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg,rgba(59,178,247,0.25),rgba(59,178,247,0.08))', border: '1px solid rgba(59,178,247,0.3)' }}
          >
            <Heart className="w-[30px] h-[30px]" style={{ color: '#3BB2F7' }} strokeWidth={1.8} />
          </div>
          <h3 className="text-xl font-bold text-white mb-2.5">¿Te gusta Y-core?</h3>
          <p className="text-sm leading-relaxed text-text-secondary mb-6" style={{ textWrap: 'pretty' }}>
            Y-core es gratuito y lo mantiene una sola persona. Si te resulta útil, una pequeña donación ayuda a que siga vivo. Sin presión — puedes cerrar esto y no volverá a molestarte.
          </p>
          <a
            href="https://paypal.me/miguelbird"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2.5 w-full py-3.5 rounded-xl text-[15px] font-bold text-white no-underline mb-2.5 transition-all hover:brightness-110"
            style={{ background: 'linear-gradient(135deg,#3BB2F7,#2A8FD1)', boxShadow: '0 8px 24px rgba(59,178,247,0.35)' }}
          >
            <Heart className="w-[18px] h-[18px]" strokeWidth={1.8} />
            Donar por PayPal
          </a>
          <div className="flex gap-2.5">
            <button
              onClick={onClose}
              className="flex-1 py-3 rounded-xl text-sm font-semibold text-text-secondary bg-white/[0.06] border border-white/[0.1] hover:bg-white/[0.1] hover:text-text-bright transition-colors cursor-pointer"
            >
              Ahora no
            </button>
            <button
              onClick={onDismissForever}
              className="flex-1 py-3 rounded-xl text-sm font-semibold text-text-dim bg-transparent border border-white/[0.08] hover:text-text-secondary hover:border-white/[0.15] transition-colors cursor-pointer"
            >
              No volver a mostrar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
