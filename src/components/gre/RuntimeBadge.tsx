import { useEffect, useRef } from 'react'
import { ShieldCheck, ShieldAlert, Loader2 } from 'lucide-react'
import { useRuntimeStore } from '../../stores/useRuntimeStore'

interface RuntimeBadgeProps {
  appId: string
  size?: 'sm' | 'md'
  showLabel?: boolean
}

export function RuntimeBadge({ appId, size = 'sm', showLabel = false }: RuntimeBadgeProps) {
  const { runtimes, checking, detectAll } = useRuntimeStore()
  // useRef (not useState) survives React StrictMode unmount-remount so
  // detectAll() fires exactly once per component instance, not twice.
  const startedRef = useRef(false)

  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true
    if (runtimes.length === 0) detectAll()
  }, [detectAll, runtimes.length])

  // "Loaded" = we already have data in the store. No separate flag needed.
  const loaded = runtimes.length > 0

  const missing = runtimes.filter((r) => !r.installed)
  const allMet = missing.length === 0
  const iconSize = size === 'sm' ? 14 : 18

  if (checking && !loaded) {
    return (
      <div className="flex items-center gap-1.5 text-text-dim">
        <Loader2 className="animate-spin" style={{ width: iconSize, height: iconSize }} />
        {showLabel && <span className="text-xs">Checking...</span>}
      </div>
    )
  }

  return (
    <div
      className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 transition-colors"
      style={{
        background: allMet ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
        border: `1px solid ${allMet ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)'}`,
      }}
    >
      {allMet ? (
        <ShieldCheck style={{ width: iconSize, height: iconSize, color: 'var(--green)' }} />
      ) : (
        <ShieldAlert style={{ width: iconSize, height: iconSize, color: 'var(--red)' }} />
      )}
      {showLabel && (
        <span
          className="text-xs font-medium"
          style={{ color: allMet ? 'var(--green)' : 'var(--red)' }}
        >
          {allMet ? 'Ready' : `${missing.length} missing`}
        </span>
      )}
    </div>
  )
}
