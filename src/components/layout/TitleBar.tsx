import { type ReactNode } from 'react'
import { Minus, Maximize2, X } from 'lucide-react'

export function TitleBar({ header }: { header?: ReactNode }) {
  return (
    <div
      className="titlebar-drag relative z-50 min-h-16 flex items-center justify-between px-6 py-2.5 flex-shrink-0 bg-white/[0.06] backdrop-blur-xl"
      style={{ ['WebkitAppRegion' as any]: 'drag' }}
    >
      <div className="flex items-center gap-3 flex-1 min-w-0 pr-6">
        {header}
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0" style={{ ['WebkitAppRegion' as any]: 'no-drag' }}>
        <button
          onClick={() => window.steamtools.windowMinimize()}
          className="w-11 h-11 flex items-center justify-center rounded-xl text-text-dim hover:bg-white/10 hover:text-white transition-all"
          title="Minimize"
        >
          <Minus className="w-5 h-5" />
        </button>
        <button
          onClick={() => window.steamtools.windowMaximize()}
          className="w-11 h-11 flex items-center justify-center rounded-xl text-text-dim hover:bg-white/10 hover:text-white transition-all"
          title="Maximize"
        >
          <Maximize2 className="w-5 h-5" />
        </button>
        <button
          onClick={() => window.steamtools.windowClose()}
          className="w-12 h-12 flex items-center justify-center rounded-xl text-text-dim hover:bg-status-error hover:text-white transition-all"
          title="Close"
        >
          <X className="w-6 h-6" />
        </button>
      </div>
    </div>
  )
}
