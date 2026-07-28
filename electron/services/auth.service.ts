// ============================================================================
// electron/services/auth.service.ts — Backend AuthService
// ============================================================================

import { app } from 'electron'
import path from 'path'
import fs from 'fs'
import { logger } from '../logger'
import { state } from '../state'

function getUsernameFile(): string {
  return path.join(app.getPath('userData'), 'ycore-username.json')
}

export const authService = {
  async setUsername(username: string | null): Promise<void> {
    state.username = username
    const USERNAME_FILE = getUsernameFile()
    try {
      if (username) {
        fs.writeFileSync(USERNAME_FILE, JSON.stringify({ username }), { encoding: 'utf-8', mode: 0o600 })
        logger.info(`Username set: ${username}`, 'auth')
      } else {
        if (fs.existsSync(USERNAME_FILE)) fs.unlinkSync(USERNAME_FILE)
        logger.info('Username cleared', 'auth')
      }
    } catch { /* non-fatal */ }
  },

  async getUsername(): Promise<string | null> {
    console.log('[STARTUP] [AUTH] getUsername called, state.username=', state.username)
    const result = state.username || null
    console.log('[STARTUP] [AUTH] getUsername returning', result)
    return result
  },

  async isAuthenticated(): Promise<boolean> {
    console.log('[STARTUP] [AUTH] isAuthenticated called')
    const result = true
    console.log('[STARTUP] [AUTH] isAuthenticated returning', result)
    return result
  },

  async loginSuccess(): Promise<void> {
    logger.info('Login successful', 'auth')
  },

  async logout(): Promise<void> {
    logger.info('Logout requested', 'auth')
    state.username = 'user'
    const USERNAME_FILE = getUsernameFile()
    try {
      fs.writeFileSync(USERNAME_FILE, JSON.stringify({ username: 'user' }), { encoding: 'utf-8', mode: 0o600 })
    } catch { /* non-fatal */ }
  },
}
