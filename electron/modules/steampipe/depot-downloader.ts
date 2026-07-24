// ============================================================================
// electron/modules/steampipe/depot-downloader.ts
// ----------------------------------------------------------------------------
// Phase 3 — Full anonymous F2P download orchestrator.
//
// Pipeline:
//   1. Build extended anonymous session (keep CM connection alive).
//   2. Discover CDN servers via CM IPC.
//   3. Request depot decryption key via CM IPC.
//   4. Download manifest ZIP from CDN → parse protobuf sections.
//   5. Download each chunk from CDN → decompress with zlib.
//   6. Assemble chunks into files at correct offsets.
//   7. Verify file SHA1 hashes against manifest.
//
// Features:
//   - Periodic heartbeats to keep CM connection alive during long downloads
//   - Parallel chunk downloads with configurable concurrency
//   - Retry logic for failed chunk downloads
//   - Adler32 checksum verification for chunk integrity
//   - SHA1 verification for assembled files
//
// TRUTHFULNESS: this pipeline only works for F2P content accessible to
// anonymous Steam sessions. Paid content requires authenticated tickets
// that this module does NOT generate.
// ============================================================================

import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { logger } from '../../logger'
import { connectAndHandshake } from './handshake'
import { loginAnonymously, ANONYMOUS_STEAMID } from './anonymous-auth'
import { fetchCdnServers, pickBestCdnServer, requestManifestRequestCode } from './content-servers'
import { requestDepotKey } from './depot-key'
import { downloadManifest, downloadChunk } from './cdn-client'
import { EMSG, PROTO_FLAG } from './cm-protocol'
import { encodeVarint, encodeVarintBig } from './proto'
import type {
  AuthSession,
  SteamPipeStatus,
  InstallResult,
} from './types'
import type { CmConnection } from './cm-connection'

// ============================================================================
// Constants
// ============================================================================

const CLIENT_HEARTBEAT_JOB_ID = 0xffffffffffffffffn
const HEARTBEAT_INTERVAL_MS = 30_000 // 30 seconds
const DEFAULT_CONCURRENCY = 4
const MAX_RETRIES = 3
const RETRY_DELAY_MS = 1000

// ============================================================================
// Extended session builder
// ============================================================================

/**
 * Build an anonymous session that keeps the CM connection alive.
 * Unlike Phase 2's buildAnonymousSession (which closes the connection),
 * this returns both the session metadata AND the live connection for
 * subsequent IPC calls (CDN servers, depot keys, etc.).
 */
export async function buildDownloadSession(opts: {
  cellId?: number
  maxServersToTry?: number
  perCmTimeoutMs?: number
}): Promise<{ session: AuthSession; conn: CmConnection }> {
  const cellId = opts.cellId ?? 0
  const maxServersToTry = Math.max(1, Math.min(opts.maxServersToTry ?? 3, 5))
  const perCmTimeoutMs = opts.perCmTimeoutMs ?? 30000

  const { getCmServerList } = await import('./cm-directory')
  const cmList = await getCmServerList({
    cellId,
    maxServers: maxServersToTry,
    timeoutMs: perCmTimeoutMs,
  })
  if (cmList.servers.length === 0) {
    throw new Error('No CM servers available')
  }

  let lastError: Error | null = null
  for (let i = 0; i < Math.min(maxServersToTry, cmList.servers.length); ++i) {
    const server = cmList.servers[i]
    try {
      const conn = await connectAndHandshake({ server, timeoutMs: perCmTimeoutMs })
      try {
        const loginResult = await loginAnonymously({
          conn,
          timeoutMs: perCmTimeoutMs,
          machineName: 'Y-core-download',
        })
        if (loginResult.eresult === 1) {
          const session: AuthSession = {
            accountId: ANONYMOUS_STEAMID,
            sessionTokenHex: loginResult.sessionId?.toString(16) ?? '',
            cellId,
            cmServer: server,
            issuedAt: Date.now(),
          }
          logger.info(
            `[steampipe] download session on ${server.host}:${server.port}`,
            'steampipe',
          )
          return { session, conn }
        }
        lastError = new Error(`Login rejected (eresult=${loginResult.eresult})`)
        await conn.close().catch(() => undefined)
      } catch (loginErr) {
        lastError = loginErr as Error
        await conn.close().catch(() => undefined)
      }
    } catch (handshakeErr) {
      lastError = handshakeErr as Error
    }
  }
  throw new Error(`All CM servers failed: ${lastError?.message ?? 'unknown'}`)
}

// ============================================================================
// Heartbeat mechanism
// ============================================================================

/**
 * Start periodic heartbeats on the CM connection to prevent timeout.
 * Returns a stop function to clear the interval.
 *
 * NOTE: We do NOT drain heartbeat responses here because reading from
 * the shared CM connection would race with the download loop (which also
 * reads responses). TCP keepalive from ongoing data transfer keeps the
 * connection alive; heartbeats are best-effort insurance.
 */
function startHeartbeat(conn: CmConnection): () => void {
  const interval = setInterval(() => {
    try {
      // EMsg=703 (ClientHeartBeat) with empty protobuf fields.
      const body = Buffer.concat([
        encodeVarint((EMSG.CLIENT_HEARTBEAT | PROTO_FLAG) >>> 0),
        encodeVarintBig(CLIENT_HEARTBEAT_JOB_ID),
        Buffer.alloc(0), // empty fields
      ])
      conn.writePostHandshakeBuffer(body)
    } catch (err) {
      // Connection might be closed — just clear the interval.
      logger.warn(`[steampipe] heartbeat failed: ${(err as Error).message}`, 'steampipe')
    }
  }, HEARTBEAT_INTERVAL_MS)

  return () => clearInterval(interval)
}

// ============================================================================
// Parallel chunk downloader with retry
// ============================================================================

interface ChunkJob {
  chunkSha: Buffer
  chunkKey: string
  cbOriginal: number
  cbCompressed: number
  offset: number
  fileId: string
}

/**
 * Download chunks in parallel with retry logic.
 * Returns a Map<chunkKey, Buffer> of successfully downloaded chunks.
 */
async function downloadChunksParallel(
  jobs: ChunkJob[],
  cdn: import('./types').CdnServerEntry,
  depotId: number,
  concurrency: number,
  onProgress: (downloaded: number) => void,
): Promise<Map<string, Buffer>> {
  const results = new Map<string, Buffer>()
  const failed = new Set<string>()

  // Deduplicate by chunkKey.
  const uniqueJobs = new Map<string, ChunkJob>()
  for (const job of jobs) {
    if (!uniqueJobs.has(job.chunkKey)) {
      uniqueJobs.set(job.chunkKey, job)
    }
  }

  const queue = Array.from(uniqueJobs.values())
  let idx = 0
  let totalDownloaded = 0

  async function worker(): Promise<void> {
    while (idx < queue.length) {
      const job = queue[idx++]
      if (results.has(job.chunkKey) || failed.has(job.chunkKey)) continue

      let lastErr: Error | null = null
      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
          const data = await downloadChunk(cdn, depotId, job.chunkSha, job.cbOriginal)
          results.set(job.chunkKey, data)
          totalDownloaded += data.length
          onProgress(totalDownloaded)
          lastErr = null
          break
        } catch (err) {
          lastErr = err as Error
          if (attempt < MAX_RETRIES - 1) {
            await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * (attempt + 1)))
          }
        }
      }
      if (lastErr) {
        failed.add(job.chunkKey)
        logger.warn(
          `[steampipe] chunk ${job.chunkKey.slice(0, 12)}… failed after ${MAX_RETRIES} retries: ${lastErr.message}`,
          'steampipe',
        )
      }
    }
  }

  // Spawn workers.
  const workers = Array.from({ length: Math.min(concurrency, queue.length) }, () => worker())
  await Promise.all(workers)

  if (failed.size > 0) {
    logger.warn(`[steampipe] ${failed.size} chunks failed to download`, 'steampipe')
  }

  return results
}

// ============================================================================
// Full download orchestrator
// ============================================================================

export interface DownloadAppOpts {
  appId: number
  depotId: number
  manifestId: number | bigint
  installDir: string
  cellId?: number
  concurrency?: number
  onProgress?: (status: SteamPipeStatus) => void
}

/**
 * Download a complete depot from Steam CDN using anonymous F2P access.
 */
export async function downloadDepot(opts: DownloadAppOpts): Promise<InstallResult> {
  const startTime = Date.now()
  const { appId, depotId, manifestId, installDir, onProgress } = opts
  const cellId = opts.cellId ?? 0
  const concurrency = opts.concurrency ?? DEFAULT_CONCURRENCY

  let conn: CmConnection | null = null
  let stopHeartbeat: (() => void) | null = null
  let bytesDownloaded = 0
  let bytesTotal = 0

  const report = (phase: SteamPipeStatus['phase'], extra?: Partial<SteamPipeStatus>) => {
    onProgress?.({
      phase,
      appId: String(appId),
      bytesDownloaded,
      bytesTotal,
      speedBytesPerSec: 0,
      ...extra,
    })
  }

  try {
    // Step 1: Build download session.
    report('authenticating')
    const { conn: liveConn } = await buildDownloadSession({ cellId })
    conn = liveConn

    // Step 2: Start heartbeat to keep connection alive.
    stopHeartbeat = startHeartbeat(conn)

    // Step 3: Discover CDN servers.
    report('requesting-cdn')
    const cdnServers = await fetchCdnServers(conn, cellId)
    const cdn = pickBestCdnServer(cdnServers)
    if (!cdn) {
      throw new Error('No CDN servers available')
    }
    logger.info(`[steampipe] using CDN: ${cdn.host}:${cdn.port}`, 'steampipe')

    // Step 4: Request depot key.
    const keyResult = await requestDepotKey(conn, depotId, appId)
    if (keyResult.eresult === 1 && keyResult.depotKey) {
      logger.info(`[steampipe] depot key: ${keyResult.depotKey.length} bytes`, 'steampipe')
    }

    // Step 5: Get manifest request code (some CDN servers require this).
    report('fetching-manifest')
    let manifestRequestCode = 0
    try {
      manifestRequestCode = await requestManifestRequestCode(
        conn, depotId, appId, manifestId, 'public',
      )
    } catch (err) {
      logger.warn(
        `[steampipe] manifest request code failed (continuing without): ${(err as Error).message}`,
        'steampipe',
      )
    }

    // Step 6: Download manifest (with retry).
    let manifest: import('./types').DepotManifest | null = null
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        manifest = await downloadManifest(cdn, depotId, manifestId, manifestRequestCode)
        break
      } catch (err) {
        if (attempt < MAX_RETRIES - 1) {
          logger.warn(
            `[steampipe] manifest download attempt ${attempt + 1} failed: ${(err as Error).message}, retrying…`,
            'steampipe',
          )
          await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * (attempt + 1)))
        } else {
          throw err
        }
      }
    }
    if (!manifest) throw new Error('Failed to download manifest after retries')
    logger.info(
      `[steampipe] manifest: ${manifest.files.length} files, ${manifest.uniqueChunks.size} chunks, ${manifest.totalUncompressedSize} bytes`,
      'steampipe',
    )

    // Step 6: Prepare output directory.
    if (!fs.existsSync(installDir)) {
      fs.mkdirSync(installDir, { recursive: true })
    }

    // Step 7: Build chunk download jobs.
    report('downloading', { bytesTotal: manifest.totalUncompressedSize })
    bytesTotal = manifest.totalUncompressedSize

    const chunkJobs: ChunkJob[] = []
    for (const file of manifest.files) {
      if (file.flags & 0x01) continue // Skip directories
      for (const chunk of file.chunks) {
        chunkJobs.push({
          chunkSha: chunk.sha,
          chunkKey: chunk.sha.toString('hex'),
          cbOriginal: chunk.cbOriginal,
          cbCompressed: chunk.cbCompressed,
          offset: chunk.offset,
          fileId: file.filename,
        })
      }
    }

    // Step 8: Download all chunks in parallel.
    const chunkData = await downloadChunksParallel(
      chunkJobs,
      cdn,
      depotId,
      concurrency,
      (downloaded) => {
        bytesDownloaded = downloaded
        report('downloading', { bytesDownloaded })
      },
    )

    // Step 9: Assemble files from chunks.
    report('assembling')
    for (const file of manifest.files) {
      if (file.flags & 0x01) continue

      const filePath = path.join(installDir, file.filename.replace(/\\/g, '/'))
      const dir = path.dirname(filePath)
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }

      const fileBuf = Buffer.alloc(file.size)
      let hasError = false

      for (const chunk of file.chunks) {
        const chunkKey = chunk.sha.toString('hex')
        const data = chunkData.get(chunkKey)
        if (!data) {
          hasError = true
          continue
        }

        // Verify Adler32.
        if (chunk.crc !== 0) {
          const actualCrc = adler32(data)
          if (actualCrc !== chunk.crc) {
            logger.warn(
              `[steampipe] chunk ${chunkKey.slice(0, 12)}… adler32 mismatch: expected ${chunk.crc}, got ${actualCrc}`,
              'steampipe',
            )
          }
        }

        const copyLen = Math.min(data.length, fileBuf.length - chunk.offset)
        data.copy(fileBuf, chunk.offset, 0, copyLen)
      }

      if (!hasError) {
        fs.writeFileSync(filePath, fileBuf)

        // Verify file SHA1.
        if (file.shaContent.length === 20) {
          const actualSha = crypto.createHash('sha1').update(fileBuf).digest()
          if (!actualSha.equals(file.shaContent)) {
            logger.warn(`[steampipe] ${file.filename} SHA1 mismatch`, 'steampipe')
          } else {
            logger.info(`[steampipe] ${file.filename} SHA1 ✓`, 'steampipe')
          }
        }
      } else {
        logger.warn(`[steampipe] skipping ${file.filename} — missing chunks`, 'steampipe')
      }
    }

    // Step 10: Cleanup.
    stopHeartbeat()
    await conn.close().catch(() => undefined)
    report('done', { bytesDownloaded })

    const durationMs = Date.now() - startTime
    logger.info(`[steampipe] download complete: ${bytesDownloaded} bytes in ${durationMs}ms`, 'steampipe')

    return { success: true, appId: String(appId), installDir, bytesDownloaded, bytesTotal, durationMs }
  } catch (err) {
    stopHeartbeat?.()
    await conn?.close().catch(() => undefined)
    const durationMs = Date.now() - startTime
    const msg = (err as Error)?.message ?? String(err)
    logger.error(`[steampipe] download failed: ${msg}`, 'steampipe')
    report('failed', { errorMessage: msg })
    return { success: false, appId: String(appId), installDir, bytesDownloaded, bytesTotal, durationMs, errorMessage: msg }
  }
}

// ============================================================================
// Adler32 checksum (used by Steam for chunk integrity)
// ============================================================================

export function adler32(data: Buffer): number {
  let a = 1
  let b = 0
  const MOD = 65521
  for (let i = 0; i < data.length; i++) {
    a = (a + data[i]) % MOD
    b = (b + a) % MOD
  }
  return ((b << 16) | a) >>> 0
}
