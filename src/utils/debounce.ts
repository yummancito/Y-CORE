/**
 * Debounce & Throttle Utilities
 * Fixes for UI interaction edge cases (#16, #17, #22)
 */

import { useState, useRef, useEffect } from 'react'

export type DebounceFunction<T extends any[], R> = (...args: T) => Promise<R> | R

/**
 * Issue #16: Double-Click Install Button
 * Issue #17: Rapid Enable/Disable Toggle Spam
 * Generic debounce function that prevents rapid repeated calls
 */
export function createDebounce<T extends any[], R>(
  fn: DebounceFunction<T, R>,
  delay: number = 300,
  options: { leading?: boolean; trailing?: boolean } = { trailing: true }
): (...args: T) => Promise<R | undefined> {
  let timeoutId: NodeJS.Timeout | null = null
  let lastArgs: T | null = null
  let lastResult: R | undefined
  let isExecuting = false

  return async (...args: T): Promise<R | undefined> => {
    lastArgs = args

    if (timeoutId) {
      clearTimeout(timeoutId)
    }

    if (options.leading && !isExecuting) {
      isExecuting = true
      try {
        lastResult = await fn(...args)
        return lastResult
      } finally {
        isExecuting = false
      }
    }

    return new Promise((resolve) => {
      timeoutId = setTimeout(async () => {
        if (options.trailing && lastArgs) {
          isExecuting = true
          try {
            lastResult = await fn(...lastArgs)
          } finally {
            isExecuting = false
          }
        }
        timeoutId = null
        resolve(lastResult)
      }, delay)
    })
  }
}

/**
 * Issue #16 & #17: Prevent concurrent operations on the same resource
 * Create a lock mechanism for specific modIds
 */
export class OperationLock {
  private locks = new Map<string, Promise<void>>()

  async acquire(key: string): Promise<void> {
    const existing = this.locks.get(key)
    if (existing) {
      await existing
    }
  }

  async execute<T>(key: string, fn: () => Promise<T>): Promise<T> {
    await this.acquire(key)

    const lockPromise = (async () => {
      try {
        return await fn()
      } finally {
        this.locks.delete(key)
      }
    })()

    this.locks.set(key, lockPromise.then(() => void 0))
    return lockPromise
  }

  isLocked(key: string): boolean {
    return this.locks.has(key)
  }

  clear(): void {
    this.locks.clear()
  }
}

/**
 * React Hook for debounced state management
 * Prevents excessive state updates during rapid user input
 */
export function useDebouncedState<T>(
  initialValue: T,
  delay: number = 300
): [T, (value: T) => void, T] {
  const [state, setState] = useState<T>(initialValue)
  const [debouncedState, setDebouncedState] = useState<T>(initialValue)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)

  const updateState = (value: T): void => {
    setState(value)

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }

    timeoutRef.current = setTimeout((): void => {
      setDebouncedState(value)
    }, delay)
  }

  useEffect((): (() => void) => {
    return (): void => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  return [state, updateState, debouncedState]
}

/**
 * Throttle function - allows function to execute at most once per interval
 */
export function createThrottle<T extends any[], R>(
  fn: DebounceFunction<T, R>,
  interval: number = 300
): (...args: T) => Promise<R | undefined> {
  let lastCallTime = 0
  let pendingTimeoutId: NodeJS.Timeout | null = null
  let pendingArgs: T | null = null
  let isExecuting = false

  return async (...args: T): Promise<R | undefined> => {
    pendingArgs = args
    const now = Date.now()

    if (now - lastCallTime >= interval && !isExecuting) {
      lastCallTime = now
      isExecuting = true
      try {
        return await fn(...args)
      } finally {
        isExecuting = false
      }
    }

    // Schedule pending execution
    if (!pendingTimeoutId) {
      pendingTimeoutId = setTimeout(async () => {
        if (pendingArgs) {
          lastCallTime = Date.now()
          isExecuting = true
          try {
            await fn(...pendingArgs)
          } finally {
            isExecuting = false
          }
        }
        pendingTimeoutId = null
      }, interval - (now - lastCallTime))
    }

    return undefined
  }
}

/**
 * Issue #22: Batch operation handler
 * Prevents conflicting operations by queuing them
 */
export class BatchOperationQueue {
  private queue: Array<() => Promise<any>> = []
  private isExecuting = false

  async enqueue<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await fn()
          resolve(result)
        } catch (err) {
          reject(err)
        }
      })

      this.processQueue()
    })
  }

  private async processQueue(): Promise<void> {
    if (this.isExecuting || this.queue.length === 0) {
      return
    }

    this.isExecuting = true

    while (this.queue.length > 0) {
      const fn = this.queue.shift()
      if (fn) {
        try {
          await fn()
        } catch (err) {
          console.error('Error in batch operation:', err)
        }
      }
    }

    this.isExecuting = false
  }

  clear(): void {
    this.queue = []
  }
}
