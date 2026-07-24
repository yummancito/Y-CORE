import { create } from 'zustand'

interface SignaturePendingState {
  isOpen: boolean
  component: string | null
  sha256: string | null
  /**
   * `true` cuando el modal se abrió por:
   *  - boot forzado (App.tsx lee `forceSignaturePending` del config), o
   *  - toggle manual en Settings (force-pending).
   * `false` cuando se abrió naturalmente desde signature-cache.
   * El modal usa esta distinción para saber si debe limpiar la flag
   * `forceSignaturePending` al cerrarse.
   */
  isForced: boolean
  /** Abre el modal. `isForced` indica si fue forzado (manual/boot) o natural. */
  open: (component: string, sha256: string, opts?: { isForced?: boolean }) => void
  close: () => void
}

export const useSignaturePendingStore = create<SignaturePendingState>((set) => ({
  isOpen: false,
  component: null,
  sha256: null,
  isForced: false,
  open: (component, sha256, opts) =>
    set({
      isOpen: true,
      component,
      sha256,
      isForced: opts?.isForced === true,
    }),
  close: () =>
    set({ isOpen: false, component: null, sha256: null, isForced: false }),
}))
