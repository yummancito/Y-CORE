import { BrowserWindow } from 'electron'

export interface AuthSession {
  access_token: string
  refresh_token: string
}

export interface AppContext {
  getMainWindow: () => BrowserWindow | null
  getAuthSession: () => AuthSession | null
  setAuthSession: (session: AuthSession | null) => void
  getApiUrl: () => string
  isQuitting: () => boolean
  setQuitting: (v: boolean) => void
}
