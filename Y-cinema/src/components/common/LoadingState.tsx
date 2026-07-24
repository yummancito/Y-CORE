interface LoadingStateProps {
  variant?: 'row' | 'grid' | 'hero' | 'spinner'
  count?: number
  message?: string
}

function SkeletonCard() {
  return (
    <div className="w-[160px] flex-shrink-0">
      <div className="h-[240px] rounded-xl skeleton" />
    </div>
  )
}

export default function LoadingState({ variant = 'spinner', count = 8, message }: LoadingStateProps) {
  if (variant === 'hero') {
    return <div className="w-full h-[76vh] min-h-[560px] skeleton" />
  }

  if (variant === 'row') {
    return (
      <div className="flex gap-4 overflow-hidden px-1 py-1.5">
        {Array.from({ length: count }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    )
  }

  if (variant === 'grid') {
    return (
      <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-5">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="aspect-[2/3] rounded-xl skeleton" />
        ))}
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center gap-4 py-20">
      <div className="w-10 h-10 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      {message && <p className="text-sm text-text-dim">{message}</p>}
    </div>
  )
}
