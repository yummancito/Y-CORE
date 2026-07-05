import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { Resend } from 'resend'
import { getSupabase, getSupabaseAuth, getSupabaseAdmin } from '../lib/supabase.js'
import { createRefreshToken, validateRefreshToken, revokeRefreshToken, revokeAllUserTokens } from '../lib/auth.js'
import { trackEvent } from '../lib/telemetry.js'
import type { AuthSession, AuthUser } from '@y-core/shared'

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null
const RESEND_FROM = process.env.RESEND_FROM_EMAIL || 'noreply@y-core.app'

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(72).regex(/[a-zA-Z]/, 'Password must contain at least one letter').regex(/[0-9]/, 'Password must contain at least one number'),
  username: z.string().min(3).max(32).regex(/^[a-zA-Z0-9_-]+$/, 'Username must be 3-32 chars, alphanumeric with _ or -'),
})

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

const refreshSchema = z.object({
  refresh_token: z.string().uuid(),
})

const forgotPasswordSchema = z.object({
  email: z.string().email(),
})

const resetPasswordSchema = z.object({
  code: z.string().min(6).max(8),
  password: z.string().min(8).max(72).regex(/[a-zA-Z]/, 'Password must contain at least one letter').regex(/[0-9]/, 'Password must contain at least one number'),
})

const MAX_RESET_ATTEMPTS = 5

async function incrementResetAttempts(code: string, current: number | null): Promise<void> {
  try {
    await getSupabase()
      .from('password_resets')
      .update({ attempts: (current || 0) + 1 })
      .eq('code', code)
  } catch (err: any) {
    // Non-fatal — do not leak database errors to the client
  }
}

export default async function authRoutes(fastify: FastifyInstance) {
  // GET /api/auth/config
  fastify.get('/api/auth/config', async (req, reply) => {
    return reply.send({
      emailConfigured: !!resend,
      fromEmail: RESEND_FROM,
    })
  })

  // POST /api/auth/register
  fastify.post('/api/auth/register', {
    config: {
      rateLimit: { max: 5, timeWindow: '1 hour', keyGenerator: (req) => req.ip },
    },
  }, async (req, reply) => {
    const parsed = registerSchema.safeParse(req.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0].message })
    }
    const { email, password, username } = parsed.data

    // Check email uniqueness
    const { data: existing } = await getSupabase()
      .from('profiles')
      .select('id')
      .eq('email', email)
      .single()

    if (existing) {
      return reply.code(409).send({ error: 'Email already registered' })
    }

    // Check username uniqueness
    const { data: existingUsername } = await getSupabase()
      .from('profiles')
      .select('id')
      .eq('username', username)
      .single()

    if (existingUsername) {
      return reply.code(409).send({ error: 'Username already taken' })
    }

    const { data: authData, error: authError } = await getSupabaseAuth().auth.signUp({
      email,
      password,
    })

    if (authError || !authData.user) {
      const errMsg = authError?.message || JSON.stringify(authError) || 'Registration failed'
      fastify.log.error({ authError: authError ? { name: authError.name, message: authError.message, status: authError.status } : null }, 'Supabase signUp error')
      return reply.code(400).send({ error: errMsg })
    }

    const userId = authData.user.id

    // Create profile manually (no trigger — see 001_initial_schema.sql note)
    // Note: profiles table currently has no username column; username is derived from email
    await getSupabase().from('profiles').upsert({ id: userId, email, is_beta_tester: false }, { onConflict: 'id' })

    const refreshToken = await createRefreshToken(userId)
    const accessToken = fastify.jwt.sign(
      { userId, email, username } as any,
      { expiresIn: process.env.JWT_ACCESS_EXPIRY || '15m' }
    )

    const user: AuthUser = { id: userId, email, username, is_beta_tester: false }
    const session: AuthSession = { access_token: accessToken, refresh_token: refreshToken, user }
    trackEvent({ userId, eventType: 'user_registered' })
    return reply.code(201).send(session)
  })

  // POST /api/auth/login
  fastify.post('/api/auth/login', {
    config: {
      rateLimit: { max: 10, timeWindow: '10 minutes', keyGenerator: (req) => req.ip },
    },
  }, async (req, reply) => {
    const parsed = loginSchema.safeParse(req.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid email or password' })
    }
    const { email, password } = parsed.data

    const { data: authData, error: authError } = await getSupabaseAuth().auth.signInWithPassword({
      email,
      password,
    })

    if (authError || !authData.user) {
      return reply.code(401).send({ error: 'Invalid credentials' })
    }

    const userId = authData.user.id

    // Ensure profile exists (no trigger — see 001_initial_schema.sql note)
    await getSupabase().from('profiles').upsert({ id: userId, email }, { onConflict: 'id' })

    // Fetch profile (username column doesn't exist in current schema)
    const { data: profile } = await getSupabase()
      .from('profiles')
      .select('email, is_beta_tester')
      .eq('id', userId)
      .single()

    const username = profile?.email?.split('@')[0] || email.split('@')[0]
    const isBetaTester = profile?.is_beta_tester ?? false

    const refreshToken = await createRefreshToken(userId)
    const accessToken = fastify.jwt.sign(
      { userId, email, username } as any,
      { expiresIn: process.env.JWT_ACCESS_EXPIRY || '15m' }
    )

    const user: AuthUser = { id: userId, email, username, is_beta_tester: isBetaTester }
    const session: AuthSession = { access_token: accessToken, refresh_token: refreshToken, user }
    trackEvent({ userId, eventType: 'user_login' })
    return reply.send(session)
  })

  // POST /api/auth/refresh
  fastify.post('/api/auth/refresh', async (req, reply) => {
    const parsed = refreshSchema.safeParse(req.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid refresh token' })
    }

    const userId = await validateRefreshToken(parsed.data.refresh_token)
    if (!userId) {
      return reply.code(401).send({ error: 'Invalid or expired refresh token' })
    }

    const { data: profile } = await getSupabase()
      .from('profiles')
      .select('email, is_beta_tester')
      .eq('id', userId)
      .single()

    if (!profile) {
      return reply.code(401).send({ error: 'User not found' })
    }

    await revokeRefreshToken(parsed.data.refresh_token)
    const newRefreshToken = await createRefreshToken(userId)
    const username = profile.email?.split('@')[0] || 'user'
    const isBetaTester = profile?.is_beta_tester ?? false
    const accessToken = fastify.jwt.sign(
      { userId, email: profile.email, username } as any,
      { expiresIn: process.env.JWT_ACCESS_EXPIRY || '15m' }
    )

    const user: AuthUser = { id: userId, email: profile.email, username, is_beta_tester: isBetaTester }
    return reply.send({ access_token: accessToken, refresh_token: newRefreshToken, user })
  })

  // POST /api/auth/forgot-password
  fastify.post('/api/auth/forgot-password', {
    config: {
      rateLimit: { max: 5, timeWindow: '1 hour', keyGenerator: (req) => req.ip },
    },
  }, async (req, reply) => {
    const parsed = forgotPasswordSchema.safeParse(req.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid email' })
    }
    const { email } = parsed.data

    // Find user by email via profile
    const { data: profile } = await getSupabase()
      .from('profiles')
      .select('id, email')
      .eq('email', email)
      .single()

    if (!profile) {
      fastify.log.warn({ email }, 'Password reset requested for unregistered email')
      // Don't reveal whether email exists to the client
      return reply.code(200).send({ message: 'If this email is registered, a reset code has been sent' })
    }

    // Cleanup old tokens
    await getSupabase().rpc('cleanup_password_resets')

    // Generate 6-digit code
    const code = Math.floor(100000 + Math.random() * 900000).toString()

    // Create reset token
    const { data: reset, error: resetError } = await getSupabase()
      .from('password_resets')
      .insert({ user_id: profile.id, code })
      .select('code')
      .single()

    if (resetError || !reset) {
      fastify.log.error({ resetError }, 'Failed to create password reset token')
      return reply.code(500).send({ error: 'Failed to create reset token' })
    }

    // Send email via Resend
    if (!resend) {
      fastify.log.error('RESEND_API_KEY is not configured — cannot send password reset email')
      return reply.code(500).send({ error: 'Email service not configured' })
    }

    try {
      await resend.emails.send({
        from: `Y-Core <${RESEND_FROM}>`,
        to: email,
        subject: 'Reset your Y-Core password',
        text: `Reset your Y-Core password. Use this code: ${reset.code}. It expires in 1 hour.`,
        html: `
          <div style="font-family: Inter, system-ui, sans-serif; max-width: 480px; margin: 0 auto; color: #1f2937; background: #ffffff; padding: 32px; border-radius: 12px; border: 1px solid #e5e7eb;">
            <h2 style="margin-top: 0; color: #111827;">Reset your Y-Core password</h2>
            <p>Use the code below to reset your password. This code expires in 1 hour.</p>
            <div style="font-size: 36px; letter-spacing: 8px; font-weight: 700; background: #f3f4f6; padding: 20px; text-align: center; border-radius: 10px; margin: 24px 0; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;">
              ${reset.code}
            </div>
            <p style="font-size: 14px; color: #6b7280;">If you didn't request this, you can safely ignore this email.</p>
          </div>
        `,
      })
      fastify.log.info({ email }, 'Password reset email sent successfully')
    } catch (err: any) {
      fastify.log.error({ err: err.message }, 'Failed to send password reset email')
      return reply.code(500).send({ error: 'Failed to send reset email' })
    }

    return reply.code(200).send({ message: 'If this email is registered, a reset code has been sent' })
  })

  // POST /api/auth/verify-reset-code
  fastify.post('/api/auth/verify-reset-code', {
    config: {
      rateLimit: { max: 10, timeWindow: '1 hour', keyGenerator: (req) => req.ip },
    },
  }, async (req, reply) => {
    const schema = z.object({ code: z.string().min(6).max(6) })
    const parsed = schema.safeParse(req.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid code' })
    }
    const { code } = parsed.data

    const { data: reset, error: findError } = await getSupabase()
      .from('password_resets')
      .select('expires_at, used_at, attempts')
      .eq('code', code)
      .single()

    if (findError) {
      fastify.log.warn({ code, error: findError.message }, 'verify-reset-code: database lookup failed')
    }

    if (!reset) {
      fastify.log.warn({ code }, 'verify-reset-code: code not found')
      return reply.code(400).send({ error: 'Invalid or expired reset code' })
    }

    if (reset.used_at) {
      fastify.log.warn({ code, used_at: reset.used_at }, 'verify-reset-code: code already used')
      await incrementResetAttempts(code, reset.attempts)
      return reply.code(400).send({ error: 'Invalid or expired reset code' })
    }

    const expiresAt = new Date(reset.expires_at)
    const now = new Date()
    if (expiresAt < now) {
      fastify.log.warn({ code, expiresAt: expiresAt.toISOString(), now: now.toISOString() }, 'verify-reset-code: code expired')
      await incrementResetAttempts(code, reset.attempts)
      return reply.code(400).send({ error: 'Invalid or expired reset code' })
    }

    if ((reset.attempts || 0) >= MAX_RESET_ATTEMPTS) {
      fastify.log.warn({ code, attempts: reset.attempts }, 'verify-reset-code: too many attempts')
      await incrementResetAttempts(code, reset.attempts)
      return reply.code(400).send({ error: 'Too many attempts, code is locked' })
    }

    fastify.log.info({ code }, 'verify-reset-code: code verified successfully')
    return reply.code(200).send({ message: 'Code verified' })
  })

  // POST /api/auth/reset-password
  fastify.post('/api/auth/reset-password', {
    config: {
      rateLimit: { max: 10, timeWindow: '1 hour', keyGenerator: (req) => req.ip },
    },
  }, async (req, reply) => {
    const parsed = resetPasswordSchema.safeParse(req.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0].message })
    }
    const { code, password } = parsed.data

    const { data: reset } = await getSupabase()
      .from('password_resets')
      .select('user_id, expires_at, used_at, attempts')
      .eq('code', code)
      .single()

    if (!reset) {
      return reply.code(400).send({ error: 'Invalid or expired reset code' })
    }

    if ((reset.attempts || 0) >= MAX_RESET_ATTEMPTS) {
      fastify.log.warn({ code, attempts: reset.attempts }, 'reset-password: too many attempts')
      await incrementResetAttempts(code, reset.attempts)
      return reply.code(400).send({ error: 'Too many attempts, code is locked' })
    }

    if (reset.used_at || new Date(reset.expires_at) < new Date()) {
      fastify.log.warn({ code, used_at: reset.used_at }, 'reset-password: code already used or expired')
      await incrementResetAttempts(code, reset.attempts)
      return reply.code(400).send({ error: 'Invalid or expired reset code' })
    }

    // Update password via Supabase admin
    const { error: updateError } = await getSupabaseAdmin().auth.admin.updateUserById(reset.user_id, {
      password,
    })

    if (updateError) {
      fastify.log.error({ updateError }, 'Failed to reset password')
      await incrementResetAttempts(code, reset.attempts)
      return reply.code(500).send({ error: 'Failed to reset password' })
    }

    // Mark token as used and clear attempts
    await getSupabase()
      .from('password_resets')
      .update({ used_at: new Date().toISOString(), attempts: 0 })
      .eq('code', code)

    // Revoke all existing refresh tokens so sessions on other devices are invalidated
    await revokeAllUserTokens(reset.user_id)

    return reply.code(200).send({ message: 'Password reset successfully' })
  })

  // POST /api/auth/logout
  fastify.post('/api/auth/logout', {
    preHandler: fastify.authenticate,
  }, async (req, reply) => {
    const body = req.body as { refresh_token?: string }
    if (body?.refresh_token) {
      await revokeRefreshToken(body.refresh_token)
    }
    return reply.code(204).send()
  })

  // GET /api/users/me
  fastify.get('/api/users/me', {
    preHandler: fastify.authenticate,
  }, async (req, reply) => {
    const userId = req.user.userId

    const { data: profile, error } = await getSupabase()
      .from('profiles')
      .select('email, is_beta_tester')
      .eq('id', userId)
      .single()

    if (error || !profile) {
      return reply.code(404).send({ error: 'User not found' })
    }

    const username = profile.email?.split('@')[0] || 'user'

    return reply.send({
      id: userId,
      email: profile.email,
      username,
      is_beta_tester: profile.is_beta_tester ?? false,
    })
  })

  // PATCH /api/users/beta
  fastify.patch('/api/users/beta', {
    preHandler: fastify.authenticate,
  }, async (req, reply) => {
    const userId = req.user.userId
    const body = req.body as { is_beta_tester?: boolean }

    if (typeof body.is_beta_tester !== 'boolean') {
      return reply.code(400).send({ error: 'is_beta_tester must be a boolean' })
    }

    const { data: profile, error } = await getSupabase()
      .from('profiles')
      .update({ is_beta_tester: body.is_beta_tester })
      .eq('id', userId)
      .select('email, is_beta_tester')
      .single()

    if (error || !profile) {
      fastify.log.error({ err: error }, 'Failed to update beta tester status')
      return reply.code(500).send({ error: 'Failed to update beta status' })
    }

    const username = profile.email?.split('@')[0] || 'user'

    return reply.send({
      id: userId,
      email: profile.email,
      username,
      is_beta_tester: profile.is_beta_tester ?? false,
    })
  })
}
