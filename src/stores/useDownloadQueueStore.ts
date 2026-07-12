import { create } from 'zustand'

export interface QueueItem {
  appId: string
  name: string
}

interface DownloadQueueStore {
  queue: QueueItem[]
  processing: boolean
  current: QueueItem | null
  enqueue: (item: QueueItem) => void
  dequeue: () => QueueItem | undefined
  setProcessing: (v: boolean) => void
  setCurrent: (item: QueueItem | null) => void
  remove: (appId: string) => void
  clear: () => void
}

export const useDownloadQueueStore = create<DownloadQueueStore>((set, get) => ({
  queue: [],
  processing: false,
  current: null,
  enqueue: (item) => {
    const exists = get().queue.some((q) => q.appId === item.appId) || get().current?.appId === item.appId
    if (exists) return
    set((s) => ({ queue: [...s.queue, item] }))
  },
  dequeue: () => {
    const state = get()
    if (state.queue.length === 0) return undefined
    const [first, ...rest] = state.queue
    set({ queue: rest })
    return first
  },
  setProcessing: (v) => set({ processing: v }),
  setCurrent: (item) => set({ current: item }),
  remove: (appId) => set((s) => ({ queue: s.queue.filter((q) => q.appId !== appId) })),
  clear: () => set({ queue: [] }),
}))
