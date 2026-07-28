// ============================================================================
// src/hooks/useIpcEvent.ts
// ----------------------------------------------------------------------------
// React hook for subscribing to IPC events with automatic cleanup.
// Wraps subscribeToEvent with useEffect lifecycle management.
// ============================================================================

import { useEffect, useRef } from 'react'
import { subscribeToEvent } from '../services/gateway'
import type { ServiceEvents } from '../../electron/common/ipc-contract'

/**
 * Subscribe to an IPC event. The subscription is automatically cleaned up
 * when the component unmounts or when dependencies change.
 *
 * @example
 * ```tsx
 * useIpcEvent('download:progress', (data) => {
 *   setProgress(data.percent)
 * })
 * ```
 */
export function useIpcEvent<E extends keyof ServiceEvents>(
  event: E,
  callback: (data: ServiceEvents[E]) => void,
  deps: React.DependencyList = [],
): void {
  useEffect(() => {
    const unsubscribe = subscribeToEvent(event, callback)
    return () => {
      unsubscribe()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event, ...deps])
}

/**
 * Subscribe to an IPC event once (runs only on mount, not on re-renders).
 */
export function useIpcEventOnce<E extends keyof ServiceEvents>(
  event: E,
  callback: (data: ServiceEvents[E]) => void,
): void {
  // Subscribing only on mount (empty deps below) means the `callback`
  // closure captured at that first render would otherwise be frozen for
  // the component's whole lifetime, acting on stale props/state forever.
  // Keep a ref updated every render so the one-time subscription always
  // calls the latest callback.
  const callbackRef = useRef(callback)
  callbackRef.current = callback

  useEffect(() => {
    const unsubscribe = subscribeToEvent(event, (data) => callbackRef.current(data))
    return () => {
      unsubscribe()
    }
    // Empty deps = subscribe only on mount; callbackRef keeps it fresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
