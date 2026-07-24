import { useEffect, useRef } from 'react'

/**
 * Devuelve un ref para colocar en un elemento centinela al final de la lista.
 * Cuando entra al viewport, dispara onLoadMore.
 */
export function useInfiniteScroll(onLoadMore: () => void, enabled = true) {
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const callbackRef = useRef(onLoadMore)
  callbackRef.current = onLoadMore

  useEffect(() => {
    const el = sentinelRef.current
    if (!el || !enabled) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) callbackRef.current()
      },
      { rootMargin: '400px' }
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [enabled])

  return sentinelRef
}
