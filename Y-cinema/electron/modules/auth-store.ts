// auth-store.ts — Login/registro básico contra Supabase Auth, con la
// sesión persistida localmente. Favoritos/historial siguen siendo
// anónimos y locales (electron-store) — esto solo agrega una sesión de
// usuario opcional, sin gatear ninguna funcionalidad existente.
//
// Logs: [Auth]

import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js'
import { safeStorage } from 'electron'
import Store from 'electron-store'

interface StoreData {
  encryptedSession: string | null
}

export interface AuthResult {
  user: { id: string; email: string | null } | null
  session: Session | null
}

export class AuthStore {
  private store: Store<StoreData>
  private client: SupabaseClient

  constructor() {
    this.store = new Store<StoreData>({ name: 'y-cinema-auth', defaults: { encryptedSession: null } })
    this.client = createClient(process.env.SUPABASE_URL || '', process.env.SUPABASE_ANON_KEY || '', {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const saved = this.loadSession()
    if (saved) {
      this.client.auth.setSession(saved).catch((err) => {
        console.warn('[Auth] no se pudo restaurar la sesión guardada:', err.message)
      })
    }
  }

  async signIn(email: string, password: string): Promise<AuthResult> {
    const { data, error } = await this.client.auth.signInWithPassword({ email, password })
    if (error) throw new Error(error.message)
    this.persistSession(data.session)
    return { user: data.user ? { id: data.user.id, email: data.user.email ?? null } : null, session: data.session }
  }

  async signUp(email: string, password: string): Promise<AuthResult> {
    const { data, error } = await this.client.auth.signUp({ email, password })
    if (error) throw new Error(error.message)
    if (data.session) this.persistSession(data.session)
    return { user: data.user ? { id: data.user.id, email: data.user.email ?? null } : null, session: data.session }
  }

  async signOut(): Promise<void> {
    await this.client.auth.signOut()
    this.store.set('encryptedSession', null)
  }

  async getSession(): Promise<Session | null> {
    const { data } = await this.client.auth.getSession()
    return data.session
  }

  /** Cifra el blob de sesión con safeStorage (DPAPI en Windows, Keychain
   * en macOS) antes de persistirlo — más apropiado que la encryptionKey
   * estática de electron-store, que vive en el propio bundle y es
   * extraíble. Si el SO no soporta cifrado (algunos Linux sin keyring),
   * degrada a texto plano en vez de perder la sesión. */
  private persistSession(session: Session | null): void {
    if (!session) return
    const json = JSON.stringify(session)
    const encrypted = safeStorage.isEncryptionAvailable()
      ? safeStorage.encryptString(json).toString('base64')
      : json
    this.store.set('encryptedSession', encrypted)
  }

  private loadSession(): Session | null {
    const raw = this.store.get('encryptedSession')
    if (!raw) return null
    try {
      const json = safeStorage.isEncryptionAvailable()
        ? safeStorage.decryptString(Buffer.from(raw, 'base64'))
        : raw
      return JSON.parse(json) as Session
    } catch (err) {
      console.warn('[Auth] no se pudo decodificar la sesión guardada, se descarta:', err)
      return null
    }
  }
}
