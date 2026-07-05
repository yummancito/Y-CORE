import { create } from 'zustand'

interface SignaturePendingState {
  isOpen: boolean
  component: string | null
  sha256: string | null
  open: (component: string, sha256: string) => void
  close: () => void
}

export const useSignaturePendingStore = create<SignaturePendingState>((set) => ({
  isOpen: false,
  component: null,
  sha256: null,
  open: (component, sha256) => set({ isOpen: true, component, sha256 }),
  close: () => set({ isOpen: false, component: null, sha256: null }),
}))
