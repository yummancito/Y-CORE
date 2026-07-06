import { create } from 'zustand'

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

    window.steamtools.isAuthenticated().then(async (authenticated) => {
      if (authenticated) {
        const username = await window.steamtools.getUsername()
        set({ username, initialized: true })
      } else {
        set({ username: null, initialized: true })
      }
    })
  },

  login: async (username) => {
    set({ loading: true, error: null })
    try {
      await window.steamtools.setUsername(username)
      await window.steamtools?.loginSuccess?.()
      set({ username, loading: false })
    } catch (err: any) {
      set({ error: err.message, loading: false })
    }
  },

  logout: async () => {
    try { await window.steamtools?.logout?.() } catch {}
    set({ username: null })
  },

  clearError: () => set({ error: null }),
}))
