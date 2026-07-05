import crypto from 'crypto'
import { getSupabase } from './supabase.js'

const REFRESH_EXPIRY_DAYS = 30

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

export async function createRefreshToken(userId: string): Promise<string> {
  const token = crypto.randomUUID()
  const tokenHash = hashToken(token)
  const expiresAt = new Date(Date.now() + REFRESH_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString()

  const { error } = await getSupabase()
    .from('refresh_tokens')
    .insert({ user_id: userId, token_hash: tokenHash, expires_at: expiresAt })

  if (error) throw new Error(`Failed to create refresh token: ${error.message}`)
  return token
}

export async function validateRefreshToken(token: string): Promise<string | null> {
  const tokenHash = hashToken(token)
  const { data, error } = await getSupabase()
    .from('refresh_tokens')
    .select('user_id, expires_at, revoked_at')
    .eq('token_hash', tokenHash)
    .single()

  if (error || !data) return null
  if (data.revoked_at) return null
  if (new Date(data.expires_at) < new Date()) return null

  return data.user_id
}

export async function revokeRefreshToken(token: string): Promise<void> {
  const tokenHash = hashToken(token)
  await getSupabase()
    .from('refresh_tokens')
    .update({ revoked_at: new Date().toISOString() })
    .eq('token_hash', tokenHash)
}

export async function revokeAllUserTokens(userId: string): Promise<void> {
  await getSupabase()
    .from('refresh_tokens')
    .update({ revoked_at: new Date().toISOString() })
    .eq('user_id', userId)
    .is('revoked_at', null)
}

