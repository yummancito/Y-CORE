import { createClient, type SupabaseClient, type User as SupabaseUser } from '@supabase/supabase-js'
import type { Env } from '../../config/env.js'

export interface AuthTokens {
  accessToken: string
  refreshToken: string
}

export interface AuthUser {
  id: string
  email: string
  role: 'USER' | 'ADMIN' | 'BETA_TESTER'
}

export class EmailAlreadyRegisteredError extends Error {
  constructor() {
    super('Ya existe una cuenta con ese email.')
    this.name = 'EmailAlreadyRegisteredError'
  }
}

export class InvalidCredentialsError extends Error {
  constructor() {
    super('Email o contraseña incorrectos.')
    this.name = 'InvalidCredentialsError'
  }
}

export class InvalidRefreshTokenError extends Error {
  constructor() {
    super('El refresh token es inválido o expiró.')
    this.name = 'InvalidRefreshTokenError'
  }
}

/** Proxy delgado sobre Supabase Auth: la identidad, el hash de contraseña
 * y el ciclo de vida de los tokens los gestiona Supabase; esta clase solo
 * traduce su respuesta al contrato HTTP que ya exponía la API
 * (`{user, tokens}`) para no romper a los consumidores existentes. El rol
 * de aplicación (`role`) viaja como custom claim del JWT — ver
 * prisma/supabase/auth-hook.sql — así que se lee de `app_metadata`/claims
 * del propio usuario devuelto por Supabase, nunca de una tabla separada. */
export class AuthService {
  private readonly admin: SupabaseClient

  constructor(env: Env) {
    // Service role key: solo server-side, nunca se expone a un cliente.
    this.admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  }

  async register(email: string, password: string): Promise<{ user: AuthUser; tokens: AuthTokens }> {
    const { data, error } = await this.admin.auth.signUp({ email, password })
    if (error?.code === 'user_already_exists') {
      throw new EmailAlreadyRegisteredError()
    }
    if (error || !data.session || !data.user) {
      throw error ?? new Error('Registro falló sin devolver una sesión.')
    }
    return { user: this.mapUser(data.user), tokens: this.fromSession(data.session) }
  }

  async login(email: string, password: string): Promise<{ user: AuthUser; tokens: AuthTokens }> {
    const { data, error } = await this.admin.auth.signInWithPassword({ email, password })
    if (error || !data.session || !data.user) {
      throw new InvalidCredentialsError()
    }
    return { user: this.mapUser(data.user), tokens: this.fromSession(data.session) }
  }

  async refresh(refreshToken: string): Promise<AuthTokens> {
    const { data, error } = await this.admin.auth.refreshSession({ refresh_token: refreshToken })
    if (error || !data.session) {
      throw new InvalidRefreshTokenError()
    }
    return this.fromSession(data.session)
  }

  /** Supabase revoca sesiones por access token, no por el refresh token
   * opaco que usaba el sistema propio — de ahí que logout ahora reciba el
   * accessToken de la sesión a cerrar (único quiebre de contrato vs. la
   * API anterior, documentado en el roadmap). */
  async logout(accessToken: string): Promise<void> {
    await this.admin.auth.admin.signOut(accessToken)
  }

  private fromSession(session: { access_token: string; refresh_token: string }): AuthTokens {
    return { accessToken: session.access_token, refreshToken: session.refresh_token }
  }

  private mapUser(user: SupabaseUser): AuthUser {
    const role = (user.app_metadata?.role as AuthUser['role'] | undefined) ?? 'USER'
    return { id: user.id, email: user.email ?? '', role }
  }
}
