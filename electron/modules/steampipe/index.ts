// ============================================================================
// electron/modules/steampipe/index.ts
// ----------------------------------------------------------------------------
// High-level orchestrator + IPC handler wiring for Phase 2+3 anonymous F2P.
//
// Public API:
//   - registerSteampipeHandlers(): registers IPC handlers in main process:
//       steampipe:probeAnonymous  — Phase 2: verify anonymous auth works
//       steampipe:downloadDepot   — Phase 3: full end-to-end F2P download
//
//   - buildAnonymousSession(opts): Phase 2 — auth + close connection.
//   - downloadDepot(opts): Phase 3 — full download pipeline.
//
// TRUTHFULNESS: this module does NOT reach Steam's payment servers, does NOT
// synthesize tickets, does NOT pretend paid-game anonymous access works.
// It only delivers what Valve returns for an anonymous Steam login — and
// that's "F2P-content access; nothing else."
// ============================================================================

import { ipcMain } from 'electron'
import { logger } from '../../logger'
import { getCmServerList } from './cm-directory'
import { connectAndHandshake } from './handshake'
import { loginAnonymously, ANONYMOUS_STEAMID } from './anonymous-auth'
import { downloadDepot } from './depot-downloader'
import type { AuthSession, CmServer } from './types'

export class AuthSessionError extends Error {
  constructor(
    public reason:
      | 'no_cm_servers'
      | 'all_handshakes_failed'
      | 'all_logins_rejected'
      | 'directory_unreachable'
      | 'internal_error',
    message: string,
  ) {
    super(message)
    this.name = 'AuthSessionError'
  }
}

/**
 * Build an anonymous Steam session. Pipeline:
 *   1. Fetch CM list from Valve's IServiceDirectory (HTTP, plaintext).
 *   2. Pick first 3 servers (round-robin retry on TCP failure).
 *   3. For each: TLS connect → ChannelEncrypt handshake → ClientLogOn anonymous.
 *   4. Return the first CM whose ClientLogOnResponse.eresult == 1.
 */
export async function buildAnonymousSession(opts: {
  cellId?: number
  maxServersToTry?: number
  perCmTimeoutMs?: number
}): Promise<AuthSession> {
  const cellId = opts.cellId ?? 0
  const maxServersToTry = Math.max(1, Math.min(opts.maxServersToTry ?? 3, 5))
  const perCmTimeoutMs = opts.perCmTimeoutMs ?? 30000

  let cmList
  try {
    cmList = await getCmServerList({ cellId, maxServers: maxServersToTry, timeoutMs: perCmTimeoutMs })
  } catch (err) {
    throw new AuthSessionError(
      'directory_unreachable',
      `Steam CM directory unreachable: ${(err as Error).message}`,
    )
  }
  if (cmList.servers.length === 0) {
    throw new AuthSessionError(
      'no_cm_servers',
      `Steam returned no CM servers for cellId=${cellId} (loadSummaryCode=${cmList.loadSummaryCode})`,
    )
  }

  let lastHandshakeError: Error | null = null
  let lastLoginError: Error | null = null

  for (let i = 0; i < Math.min(maxServersToTry, cmList.servers.length); ++i) {
    const server = cmList.servers[i]
    try {
      const conn = await connectAndHandshake({ server, timeoutMs: perCmTimeoutMs })
      try {
        const loginResult = await loginAnonymously({
          conn,
          timeoutMs: perCmTimeoutMs,
          machineName: 'Y-core-anon',
        })
        if (loginResult.eresult === 1) {
          await conn.close().catch(() => undefined)
          const issuedAt = Date.now()
          return {
            accountId: ANONYMOUS_STEAMID,
            sessionTokenHex: loginResult.sessionId?.toString(16) ?? '',
            cellId,
            cmServer: server,
            issuedAt,
          }
        }
        lastLoginError = new Error(`ClientLogOn rejected (eresult=${loginResult.eresult})`)
        logger.warn(
          `[steampipe] ClientLogOn rejected on ${server.host}:${server.port} (eresult=${loginResult.eresult})`,
          'steampipe',
        )
        await conn.close().catch(() => undefined)
      } catch (loginErr) {
        lastLoginError = loginErr as Error
        logger.warn(
          `[steampipe] ClientLogOn threw on ${server.host}:${server.port}: ${(loginErr as Error).message}`,
          'steampipe',
        )
        await conn.close().catch(() => undefined)
      }
    } catch (handshakeErr) {
      lastHandshakeError = handshakeErr as Error
      logger.warn(
        `[steampipe] Handshake failed on ${server.host}:${server.port}: ${(handshakeErr as Error).message}`,
        'steampipe',
      )
    }
  }

  if (lastLoginError) {
    throw new AuthSessionError(
      'all_logins_rejected',
      `All ${Math.min(maxServersToTry, cmList.servers.length)} CM servers rejected anonymous login: ${lastLoginError.message}`,
    )
  }
  if (lastHandshakeError) {
    throw new AuthSessionError(
      'all_handshakes_failed',
      `All ${Math.min(maxServersToTry, cmList.servers.length)} CM servers failed handshake: ${lastHandshakeError.message}`,
    )
  }
  throw new AuthSessionError('internal_error', 'buildAnonymousSession reached unreachable code path')
}

// ============================================================================
// IPC handler registration
// ============================================================================

export function registerSteampipeHandlers(): void {
  // --- Phase 2: probeAnonymous ---
  ipcMain.removeHandler('steampipe:probeAnonymous')
  ipcMain.handle('steampipe:probeAnonymous', async (_event, opts: { cellId?: number } = {}) => {
    logger.info('[steampipe] IPC: probeAnonymous invoked', 'steampipe')
    try {
      const session = await buildAnonymousSession({ cellId: opts.cellId ?? 0 })
      return {
        success: true,
        anonymousSteamId: session.accountId.toString(16).padStart(16, '0'),
        cellId: session.cellId,
        sessionTokenHex: session.sessionTokenHex,
        cmServer: { host: session.cmServer.host, port: session.cmServer.port },
        issuedAt: session.issuedAt,
      }
    } catch (err) {
      if (err instanceof AuthSessionError) {
        logger.warn(`[steampipe] probeAnonymous failed: ${err.reason} — ${err.message}`, 'steampipe')
        return { success: false, reason: err.reason, message: err.message }
      }
      const msg = (err as Error)?.message ?? String(err)
      logger.error(`[steampipe] probeAnonymous unexpected: ${msg}`, 'steampipe')
      return { success: false, reason: 'internal_error', message: msg }
    }
  })

  // --- Phase 3: downloadDepot (full end-to-end F2P download) ---
  ipcMain.removeHandler('steampipe:downloadDepot')
  ipcMain.handle(
    'steampipe:downloadDepot',
    async (
      _event,
      opts: {
        appId: number
        depotId: number
        manifestId: number | string
        installDir: string
        cellId?: number
      },
    ) => {
      logger.info(
        `[steampipe] IPC: downloadDepot invoked (appId=${opts.appId} depot=${opts.depotId})`,
        'steampipe',
      )
      try {
        const manifestId =
          typeof opts.manifestId === 'string' ? BigInt(opts.manifestId) : opts.manifestId
        const result = await downloadDepot({
          appId: opts.appId,
          depotId: opts.depotId,
          manifestId,
          installDir: opts.installDir,
          cellId: opts.cellId ?? 0,
        })
        return result
      } catch (err) {
        const msg = (err as Error)?.message ?? String(err)
        logger.error(`[steampipe] downloadDepot IPC error: ${msg}`, 'steampipe')
        return {
          success: false,
          appId: String(opts.appId),
          installDir: opts.installDir,
          bytesDownloaded: 0,
          bytesTotal: 0,
          durationMs: 0,
          errorMessage: msg,
        }
      }
    },
  )
}

// Re-export core types for callers that want to use this module directly.
export type { AuthSession, CmServer }
