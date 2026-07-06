import { useEffect, useRef } from 'react'
import { useAuthStore } from '../stores/useAuthStore'

const MIN_SPLASH_MS = 2000

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { initialized, init } = useAuthStore()
  const appReadySent = useRef(false)
  const startTime = useRef(Date.now()).current

  useEffect(() => {
    if (!initialized) init()
  }, [initialized, init])

  useEffect(() => {
    if (initialized && !appReadySent.current) {
      appReadySent.current = true
      const elapsed = Date.now() - startTime
      const remaining = Math.max(0, MIN_SPLASH_MS - elapsed)

      setTimeout(() => {
        window.steamtools?.addLog?.({ level: 'INFO', message: '[App] Signaling ready to main process' })?.catch?.(() => {})
        window.steamtools?.appReady?.().catch?.(() => {})
      }, remaining)
    }
  }, [initialized])

  if (!initialized) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#1b1b1b]" />
    )
  }

  return <>{children}</>
}
