import { useEffect, useRef } from 'react'
import { useAuthStore } from '../stores/useAuthStore'

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { username, initialized, init } = useAuthStore()
  const appReadySent = useRef(false)

  useEffect(() => {
    if (!initialized) init()
  }, [initialized, init])

  useEffect(() => {
    if (initialized && !appReadySent.current) {
      appReadySent.current = true
      window.steamtools?.addLog?.({ level: 'INFO', message: '[App] Signaling ready to main process' })?.catch?.(() => {})
      // Small delay to let the first page render its loading state before showing the window
      setTimeout(() => {
        window.steamtools?.appReady?.().catch?.(() => {})
      }, 100)
    }
  }, [initialized])

  if (!initialized) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#1b1b1b]">
        <div className="text-white/50">Loading...</div>
      </div>
    )
  }

  if (!username) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black">
        <div className="text-zinc-500">Waiting for login...</div>
      </div>
    )
  }

  return <>{children}</>
}
