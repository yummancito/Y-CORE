import { create } from 'zustand'
import type { AppErrorInfo } from '../components/ui/ErrorDialog'

interface ErrorStore {
  error: AppErrorInfo | null
  open: boolean
  setError: (error: AppErrorInfo) => void
  clearError: () => void
  retry: (() => void) | null
  setRetry: (fn: (() => void) | null) => void
}

export const useErrorStore = create<ErrorStore>((set) => ({
  error: null,
  open: false,
  setError: (error) => set({ error, open: true }),
  clearError: () => set({ error: null, open: false }),
  retry: null,
  setRetry: (fn) => set({ retry: fn }),
}))
