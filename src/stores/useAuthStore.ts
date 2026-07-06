import { create } from 'zustand'
import type { AuthUser } from '@y-core/shared'
import * as api from '../lib/y-core-api'

interface AuthStore {
  user: AuthUser | null
  loading: boolean
  error: string | null
  initialized: boolean
  isBetaTester: boolean

  init: () => void
  setIsBetaTester: (v: boolean) => void
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string, username: string) => Promise<void>
  logout: () => Promise<void>
  clearError: () => void
}

let tokenRefreshUnsub: (() => void) | null = null

export const useAuthStore = create<AuthStore>((set, get) => ({
  user: null,
  loading: false,
  error: null,
  initialized: false,
  isBetaTester: false,

  init: () => {
    // Prevent duplicate init calls — avoids multiple onTokenRefreshed listeners
    if (get().initialized) return

    // Check auth status asynchronously via IPC to main process
    api.isAuthenticated().then(async (authenticated) => {
      if (authenticated) {
        // Fetch user profile from API to get beta status and email
        const profile = await api.getCurrentUser()
        if (profile) {
          set({ user: profile, isBetaTester: profile.is_beta_tester ?? false, initialized: true })
          return
        }
        // Fallback if profile fetch fails
        set({ user: null, initialized: true })
      } else {
        set({ user: null, initialized: true })
      }
    })

    // Listen for token refresh from Electron main process
    if (tokenRefreshUnsub) tokenRefreshUnsub()
    try {
      tokenRefreshUnsub = window.steamtools.onTokenRefreshed((accessToken) => {
        // Main process refreshed the token — keep the renderer's cached token in sync
        // so subsequent requests don't send the stale (expired) token.
        api.updateCachedToken(accessToken)
      })
    } catch {
      // Non-Electron environment
    }
  },

  setIsBetaTester: (v) => {
    set({ isBetaTester: v })
    if (get().user) {
      set({ user: { ...get().user!, is_beta_tester: v } })
    }
  },

  login: async (email, password) => {
    set({ loading: true, error: null })
    try {
      const session = await api.login(email, password)
      set({ user: session.user, isBetaTester: session.user.is_beta_tester ?? false, loading: false })
      try { await window.steamtools?.loginSuccess?.() } catch {}
    } catch (err: any) {
      set({ error: err.message, loading: false })
    }
  },

  register: async (email, password, username) => {
    set({ loading: true, error: null })
    try {
      const session = await api.register(email, password, username)
      set({ user: session.user, isBetaTester: session.user.is_beta_tester ?? false, loading: false })
      try { await window.steamtools?.loginSuccess?.() } catch {}
    } catch (err: any) {
      set({ error: err.message, loading: false })
    }
  },

  logout: async () => {
    await api.logout()
    set({ user: null, isBetaTester: false })
  },

  clearError: () => set({ error: null }),
}))
