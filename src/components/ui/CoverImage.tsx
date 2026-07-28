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
  /** IntersectionObserver rootMargin (default: '200px') */
  rootMargin?: string
}

// ── In-memory image cache (con evicción LRU para evitar memory leak) ──
// Evita que imágenes ya cargadas (p.ej. al volver a un juego en la
// biblioteca) tengan que descargarse de CDN otra vez.
const IMAGE_CACHE_MAX = 200
const imageCache = new Map<string, { status: 'loading' | 'loaded' | 'failed' }>()

function cacheKey(src: string): string {
  return src.replace(/^https:\/\//, '').split('?')[0]
}

function getCached(src: string): 'loading' | 'loaded' | 'failed' | null {
  return imageCache.get(cacheKey(src))?.status ?? null
}

function setCached(src: string, status: 'loading' | 'loaded' | 'failed'): void {
  const key = cacheKey(src)
  // LRU eviction: si la caché está llena, eliminar la entrada más antigua
  if (imageCache.size >= IMAGE_CACHE_MAX && !imageCache.has(key)) {
    const first = imageCache.keys().next().value
    if (first) imageCache.delete(first)
  }
  imageCache.set(key, { status })
}

// ── Component ────────────────────────────────────────────────────────

export function CoverImage({
  src, fallbackSrc, fallbackSrcs, alt, className,
  onLoad, onError, showSkeleton = true, rootMargin = '200px',
}: CoverImageProps) {
  const [srcIndex, setSrcIndex] = useState(0)
  const [hasFailed, setHasFailed] = useState(false)
  const [imgLoaded, setImgLoaded] = useState(false)
  const [isVisible, setIsVisible] = useState(false)
  const imgRef = useRef<HTMLDivElement>(null)
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const retryCountRef = useRef(0)
  const onLoadRef = useRef(onLoad)
  const onErrorRef = useRef(onError)
  const observerRef = useRef<IntersectionObserver | null>(null)
  onLoadRef.current = onLoad
  onErrorRef.current = onError

  // Build full fallback chain: src → fallbackSrc → fallbackSrcs[] → steamstatic variants
  const allSources = [
    src,
    fallbackSrc,
    ...(fallbackSrcs || []),
  ].filter((s): s is string => !!s)

  // Reset state when sources change
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

  // IntersectionObserver — only loads image when element enters viewport + 200px margin
  useEffect(() => {
    const el = imgRef.current
    if (!el) return
    observerRef.current = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true)
          observerRef.current?.disconnect()
        }
      },
      { rootMargin },
    )
    observerRef.current.observe(el)
    return () => observerRef.current?.disconnect()
  }, [rootMargin])

  // Auto-retry on failure
  useEffect(() => {
    if (!hasFailed) return
    onErrorRef.current?.()
    if (retryCountRef.current < 1) {
      retryCountRef.current++
      retryTimerRef.current = setTimeout(() => {
        setSrcIndex(0)
        setHasFailed(false)
        setImgLoaded(false)
      }, 4000)
    }
    return () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current)
    }
  }, [hasFailed])

  // ── Empty state ────────────────────────────────────────────────────
  if (allSources.length === 0) {
    if (!showSkeleton) return null
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-3 bg-surface-2">
        <Gamepad2 className="w-14 h-14 text-text-muted" />
        <p className="text-xs text-text-muted text-center px-4 line-clamp-2">{alt}</p>
      </div>
    )
  }

  const currentSrc = allSources[srcIndex] || allSources[0]

  // ── Check cache before deciding to show skeleton ───────────────────
  const cached = currentSrc ? getCached(currentSrc) : null
  const showLoader = showSkeleton && !imgLoaded && cached !== 'loaded'

  const handleError = () => {
    if (currentSrc) setCached(currentSrc, 'failed')
    if (srcIndex < allSources.length - 1) {
      setSrcIndex(srcIndex + 1)
    } else {
      setHasFailed(true)
    }
  }

  const handleLoad = () => {
    if (currentSrc) setCached(currentSrc, 'loaded')
    setImgLoaded(true)
    onLoadRef.current?.()
  }

  if (!showSkeleton) {
    return (
      <div ref={imgRef} className="relative w-full h-full">
        {!isVisible ? null : (
          <img
            src={currentSrc}
            alt={alt}
            className={className}
            decoding="async"
            loading="lazy"
            onLoad={handleLoad}
            onError={handleError}
          />
        )}
      </div>
    )
  }

  return (
    <div ref={imgRef} className="relative w-full h-full">
      {/* Skeleton loader while image is not visible or loading */}
      {!isVisible || showLoader ? (
        <div className="absolute inset-0 flex items-center justify-center bg-surface-2">
          <div className="card-loader">
            <span></span><span></span><span></span><span></span><span></span><span></span>
          </div>
        </div>
      ) : null}

      {/* Actual image — only rendered when element is near viewport */}
      {isVisible && (
        <img
          src={currentSrc}
          alt={alt}
          className={className}
          decoding="async"
          loading="lazy"
          onLoad={handleLoad}
          onError={handleError}
          // Fade in once loaded (CSS transition)
          style={{
            opacity: imgLoaded ? 1 : 0,
            transition: 'opacity 0.25s ease-out',
          }}
        />
      )}
    </div>
  )
}
