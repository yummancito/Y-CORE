import { create } from 'zustand'

interface AuthState {
  session: AuthSession | null
  loading: boolean
  error: string | null
  init: () => Promise<void>
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  loading: true,
  error: null,
  init: async () => {
    try {
      const session = await window.api.auth.getSession()
      set({ session, loading: false })
    } catch {
      set({ loading: false })
    }
  },
  signIn: async (email, password) => {
    set({ error: null })
    try {
      const { session } = await window.api.auth.signIn(email, password)
      set({ session })
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'No se pudo iniciar sesión.' })
      throw err
    }
  },
  signUp: async (email, password) => {
    set({ error: null })
    try {
      const { session } = await window.api.auth.signUp(email, password)
      set({ session })
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'No se pudo crear la cuenta.' })
      throw err
    }
  },
  signOut: async () => {
    await window.api.auth.signOut()
    set({ session: null })
  },
}))
