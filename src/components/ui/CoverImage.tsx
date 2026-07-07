import { useState, useEffect, useRef } from 'react'
import { Gamepad2 } from 'lucide-react'

interface CoverImageProps {
  src?: string | null
  fallbackSrc?: string | null
  alt: string
  className?: string
  onLoad?: () => void
  onError?: () => void
  showSkeleton?: boolean
}

export function CoverImage({ src, fallbackSrc, alt, className, onLoad, onError, showSkeleton = true }: CoverImageProps) {
  const [srcIndex, setSrcIndex] = useState(0)
  const [hasFailed, setHasFailed] = useState(false)
  const [imgLoaded, setImgLoaded] = useState(false)
  const onLoadRef = useRef(onLoad)
  const onErrorRef = useRef(onError)
  onLoadRef.current = onLoad
  onErrorRef.current = onError

  const sources = [src, fallbackSrc].filter((s): s is string => !!s)

  useEffect(() => {
    setSrcIndex(0)
    setHasFailed(false)
    setImgLoaded(false)
  }, [src, fallbackSrc])

  useEffect(() => {
    if (hasFailed) {
      onErrorRef.current?.()
    }
  }, [hasFailed])

  if (sources.length === 0 || hasFailed) {
    if (!showSkeleton) return null
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-3 bg-surface-2">
        <Gamepad2 className="w-14 h-14 text-text-muted" />
        <p className="text-xs text-text-muted text-center px-4 line-clamp-2">{alt}</p>
      </div>
    )
  }

  const currentSrc = sources[srcIndex] || sources[0]

  if (!showSkeleton) {
    return (
      <img
        src={currentSrc}
        alt={alt}
        className={className}
        decoding="async"
        loading="lazy"
        onLoad={() => {
          onLoadRef.current?.()
        }}
        onError={() => {
          if (srcIndex < sources.length - 1) {
            setSrcIndex(srcIndex + 1)
          } else {
            setHasFailed(true)
          }
        }}
      />
    )
  }

  return (
    <div className="absolute inset-0">
      {!imgLoaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-surface-2">
          <div className="card-loader">
            <span></span>
            <span></span>
            <span></span>
            <span></span>
            <span></span>
            <span></span>
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
        onError={() => {
          if (srcIndex < sources.length - 1) {
            setSrcIndex(srcIndex + 1)
          } else {
            setHasFailed(true)
          }
        }}
      />
    </div>
  )
}
