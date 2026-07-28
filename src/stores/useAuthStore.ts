import { create } from 'zustand'
import { authService } from '../services/auth.service'

interface AuthStore {
  username: string | null
  loading: boolean
  error: string | null
  initialized: boolean

  init: () => void
  login: (username: string) => Promise<void>
  logout: () => Promise<void>
  clearError: () => void
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  username: null,
  loading: false,
  error: null,
  initialized: false,

  init: () => {
    if (get().initialized) return

    // CRITICAL: mark initialized SYNCHRONOUSLY before any await so concurrent
    // re-entrant calls (React StrictMode double-mount, double-effect, etc.)
    // bail on the guard above. We don't ship `set({initialized: true})` in
    // the .then()/.catch() because that leaves a window where `initialized`
    // is still false and N parallel init() calls all pass the guard.
    set({ initialized: true })

    authService
      .isAuthenticated()
      .then(async () => {
        const username = await authService.getUsername()
        set({ username: username || 'user' })
      })
      .catch((err) => {
        // Silent in prod (offline / non-Electron env is expected fallback),
        // but surface the failure in dev so auth bugs don't masquerade as
        // "user logged in as 'user'".
        if (import.meta.env.DEV) console.warn('[Auth] init failed, falling back to default user', err)
        set({ username: 'user' })
      })
  },

  login: async (username) => {
    set({ loading: true, error: null })
    try {
      await authService.setUsername(username)
      await authService.loginSuccess()
      set({ username, loading: false })
    } catch (err: any) {
      set({ error: err.message, loading: false })
    }
  },

  logout: async () => {
    try { await authService.logout() } catch {}
    set({ username: null })
  },

  clearError: () => set({ error: null }),
}))
