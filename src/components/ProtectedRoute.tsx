import { useEffect, useRef } from 'react'
import { useAuthStore } from '../stores/useAuthStore'
import { configService } from '../services/config.service'

const MIN_SPLASH_MS = 2000

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { initialized, init } = useAuthStore()
  const appReadySent = useRef(false)
  const startTime = useRef(Date.now()).current

  useEffect(() => {
    if (!initialized) init()
  }, [initialized, init])

  useEffect(() => {
    if (!initialized || appReadySent.current) return
    appReadySent.current = true
    const elapsed = Date.now() - startTime
    const remaining = Math.max(0, MIN_SPLASH_MS - elapsed)

    setTimeout(() => {
      window.steamtools?.addLog?.({ level: 'INFO', message: '[App] Signaling ready to main process' })?.catch?.(() => {})
      // Use Gateway service layer instead of raw IPC for robustness
      configService
        .appReady()
        .catch((err) => {
          // Fallback to direct IPC if Gateway fails
          window.steamtools?.appReady?.().catch?.(() => {})
          if (import.meta.env.DEV) console.warn('[ProtectedRoute] appReady Gateway failed', err?.message)
        })
    }, remaining)
  }, [initialized])

  if (!initialized) {
    return <div className="flex min-h-screen items-center justify-center bg-[#1b1b1b]" />
  }

  return <>{children}</>
}
