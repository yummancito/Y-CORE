import { useState, useEffect, useRef } from 'react'
import { Gamepad2 } from 'lucide-react'

interface CoverImageProps {
  src?: string | null
  fallbackSrc?: string | null
  fallbackSrcs?: string[]
  alt: string
  className?: string
  onLoad?: () => void
  onError?: () => void
  showSkeleton?: boolean
}

export function CoverImage({ src, fallbackSrc, fallbackSrcs, alt, className, onLoad, onError, showSkeleton = true }: CoverImageProps) {
  const [srcIndex, setSrcIndex] = useState(0)
  const [hasFailed, setHasFailed] = useState(false)
  const [imgLoaded, setImgLoaded] = useState(false)
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const retryCountRef = useRef(0)
  const onLoadRef = useRef(onLoad)
  const onErrorRef = useRef(onError)
  onLoadRef.current = onLoad
  onErrorRef.current = onError

  // Build full fallback chain: src → fallbackSrc → fallbackSrcs[] → steamstatic variants
  const allSources = [
    src,
    fallbackSrc,
    ...(fallbackSrcs || []),
  ].filter((s): s is string => !!s)

  useEffect(() => {
    setSrcIndex(0)
    setHasFailed(false)
    setImgLoaded(false)
    retryCountRef.current = 0
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current)
      retryTimerRef.current = null
    }
  }, [src, fallbackSrc, fallbackSrcs])

  useEffect(() => {
    if (hasFailed) {
      onErrorRef.current?.()
      // Auto-retry once after 4s (handles transient network errors)
      if (retryCountRef.current < 1) {
        retryCountRef.current++
        retryTimerRef.current = setTimeout(() => {
          setSrcIndex(0)
          setHasFailed(false)
          setImgLoaded(false)
        }, 4000)
      }
    }
    return () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current)
    }
  }, [hasFailed])

  if (allSources.length === 0) {
    if (!showSkeleton) return null
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-3 bg-surface-2">
        <Gamepad2 className="w-14 h-14 text-text-muted" />
        <p className="text-xs text-text-muted text-center px-4 line-clamp-2">{alt}</p>
      </div>
    )
  }

  const handleError = () => {
    if (srcIndex < allSources.length - 1) {
      setSrcIndex(srcIndex + 1)
    } else {
      setHasFailed(true)
    }
  }

  const currentSrc = allSources[srcIndex] || allSources[0]

  if (!showSkeleton) {
    return (
      <img
        src={currentSrc}
        alt={alt}
        className={className}
        decoding="async"
        loading="lazy"
        onLoad={() => onLoadRef.current?.()}
        onError={handleError}
      />
    )
  }

  return (
    <div className="absolute inset-0">
      {!imgLoaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-surface-2">
          <div className="card-loader">
            <span></span><span></span><span></span><span></span><span></span><span></span>
          </div>
        </div>
      )}
      <img
        src={currentSrc}
        alt={alt}
        className={className}
        decoding="async"
        loading="lazy"
        onLoad={() => {
          setImgLoaded(true)
          onLoadRef.current?.()
        }}
        onError={handleError}
      />
    </div>
  )
}
