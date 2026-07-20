import { create } from 'zustand'

interface SupportChatStore {
  open: boolean
  toggle: () => void
  close: () => void
}

export const useSupportChatStore = create<SupportChatStore>((set) => ({
  open: false,
  toggle: () => set((s) => ({ open: !s.open })),
  close: () => set({ open: false }),
}))
