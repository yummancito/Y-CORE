import { useState, useEffect, useRef } from 'react'

interface CoverImageProps {
  src?: string | null
  fallbackSrc?: string | null
  alt: string
  className?: string
  onLoad?: () => void
  onError?: () => void
}

export function CoverImage({ src, fallbackSrc, alt, className, onLoad, onError }: CoverImageProps) {
  const [srcIndex, setSrcIndex] = useState(0)
  const [hasFailed, setHasFailed] = useState(false)
  const onLoadRef = useRef(onLoad)
  const onErrorRef = useRef(onError)
  onLoadRef.current = onLoad
  onErrorRef.current = onError

  const sources = [src, fallbackSrc].filter((s): s is string => !!s)

  useEffect(() => {
    setSrcIndex(0)
    setHasFailed(false)
  }, [src, fallbackSrc])

  useEffect(() => {
    if (hasFailed) {
      onErrorRef.current?.()
    }
  }, [hasFailed])

  if (sources.length === 0 || hasFailed) {
    return null
  }

  const currentSrc = sources[srcIndex] || sources[0]

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
