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
  /** Push a new error (replaces any previous one) and opens the modal. */
  open: (error: SteamError) => void
  /** Close + clear. */
  close: () => void
  /**
   * Manual toggle for the modal's visibility without touching the error
   * payload. Useful for surfaces (e.g. the bell in the nav) that want to
   * re-open the modal after the user has dismissed it but the error itself
   * is still relevant.
   */
  setOpen: (isOpen: boolean) => void
}

export const useSteamErrorStore = create<SteamErrorState>((set) => ({
  isOpen: false,
  error: null,
  open: (error) => set({ isOpen: true, error }),
  close: () => set({ isOpen: false, error: null }),
  setOpen: (isOpen) => set({ isOpen }),
}))
