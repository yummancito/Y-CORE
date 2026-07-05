import { Loader2 } from 'lucide-react'

interface LoadingStateProps {
  message?: string
  fullscreen?: boolean
}

export function LoadingState({ message = 'Loading...', fullscreen }: LoadingStateProps) {
  const content = (
    <div className="flex flex-col items-center justify-center gap-3 py-12">
      <Loader2 className="w-6 h-6 animate-spin text-accent" />
      <span className="text-sm text-text-dim">{message}</span>
    </div>
  )

  if (fullscreen) {
    return <div className="flex items-center justify-center h-full">{content}</div>
  }
  return content
}

export function SkeletonCard() {
  return (
    <div className="rounded-xl p-4 bg-surface/40 border border-border animate-pulse">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-lg bg-surface-light/50" />
        <div className="flex-1 space-y-2">
          <div className="h-3 w-24 bg-surface-light/50 rounded" />
          <div className="h-2 w-32 bg-surface-light/30 rounded" />
        </div>
      </div>
    </div>
  )
}
