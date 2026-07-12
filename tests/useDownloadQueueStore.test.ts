import { describe, it, expect, beforeEach } from 'vitest'
import { useDownloadQueueStore } from '../src/stores/useDownloadQueueStore'

describe('useDownloadQueueStore', () => {
  beforeEach(() => {
    useDownloadQueueStore.setState({ queue: [], processing: false, current: null })
  })

  it('starts empty', () => {
    const state = useDownloadQueueStore.getState()
    expect(state.queue).toHaveLength(0)
    expect(state.processing).toBe(false)
    expect(state.current).toBeNull()
  })

  it('enqueues items', () => {
    useDownloadQueueStore.getState().enqueue({ appId: '100', name: 'Test Game' })
    expect(useDownloadQueueStore.getState().queue).toHaveLength(1)
    expect(useDownloadQueueStore.getState().queue[0].appId).toBe('100')
  })

  it('does not enqueue duplicates', () => {
    const store = useDownloadQueueStore.getState()
    store.enqueue({ appId: '100', name: 'Test' })
    store.enqueue({ appId: '100', name: 'Test' })
    expect(useDownloadQueueStore.getState().queue).toHaveLength(1)
  })

  it('does not enqueue the same appId as current', () => {
    useDownloadQueueStore.setState({ current: { appId: '100', name: 'Test' } })
    useDownloadQueueStore.getState().enqueue({ appId: '100', name: 'Test' })
    expect(useDownloadQueueStore.getState().queue).toHaveLength(0)
  })

  it('enqueues multiple different items', () => {
    const store = useDownloadQueueStore.getState()
    store.enqueue({ appId: '100', name: 'Game 1' })
    store.enqueue({ appId: '200', name: 'Game 2' })
    store.enqueue({ appId: '300', name: 'Game 3' })
    expect(useDownloadQueueStore.getState().queue).toHaveLength(3)
  })

  it('dequeues items in FIFO order', () => {
    const store = useDownloadQueueStore.getState()
    store.enqueue({ appId: '100', name: 'First' })
    store.enqueue({ appId: '200', name: 'Second' })

    const first = useDownloadQueueStore.getState().dequeue()
    expect(first?.appId).toBe('100')
    expect(useDownloadQueueStore.getState().queue).toHaveLength(1)

    const second = useDownloadQueueStore.getState().dequeue()
    expect(second?.appId).toBe('200')
    expect(useDownloadQueueStore.getState().queue).toHaveLength(0)
  })

  it('returns undefined when dequeuing empty queue', () => {
    const result = useDownloadQueueStore.getState().dequeue()
    expect(result).toBeUndefined()
  })

  it('sets and clears processing state', () => {
    useDownloadQueueStore.getState().setProcessing(true)
    expect(useDownloadQueueStore.getState().processing).toBe(true)

    useDownloadQueueStore.getState().setProcessing(false)
    expect(useDownloadQueueStore.getState().processing).toBe(false)
  })

  it('sets and clears current item', () => {
    const item = { appId: '100', name: 'Test' }
    useDownloadQueueStore.getState().setCurrent(item)
    expect(useDownloadQueueStore.getState().current).toEqual(item)

    useDownloadQueueStore.getState().setCurrent(null)
    expect(useDownloadQueueStore.getState().current).toBeNull()
  })

  it('removes specific items from queue', () => {
    const store = useDownloadQueueStore.getState()
    store.enqueue({ appId: '100', name: 'Game 1' })
    store.enqueue({ appId: '200', name: 'Game 2' })
    store.enqueue({ appId: '300', name: 'Game 3' })

    useDownloadQueueStore.getState().remove('200')
    const queue = useDownloadQueueStore.getState().queue
    expect(queue).toHaveLength(2)
    expect(queue.find((q) => q.appId === '200')).toBeUndefined()
  })

  it('clears entire queue', () => {
    const store = useDownloadQueueStore.getState()
    store.enqueue({ appId: '100', name: 'Game 1' })
    store.enqueue({ appId: '200', name: 'Game 2' })

    useDownloadQueueStore.getState().clear()
    expect(useDownloadQueueStore.getState().queue).toHaveLength(0)
  })

  it('handles enqueue when queue is empty', () => {
    useDownloadQueueStore.getState().enqueue({ appId: '500', name: 'Solo' })
    const queue = useDownloadQueueStore.getState().queue
    expect(queue).toHaveLength(1)
    expect(queue[0].appId).toBe('500')
  })
})
