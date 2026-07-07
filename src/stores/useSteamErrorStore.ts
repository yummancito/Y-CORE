import { create } from 'zustand'

interface SteamError {
  type: string
  message: string
  solution: string
  rawLine: string
}

interface SteamErrorState {
  isOpen: boolean
  error: SteamError | null
  open: (error: SteamError) => void
  close: () => void
}

export const useSteamErrorStore = create<SteamErrorState>((set) => ({
  isOpen: false,
  error: null,
  open: (error) => set({ isOpen: true, error }),
  close: () => set({ isOpen: false, error: null }),
}))
