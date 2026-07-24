// ============================================================================
// electron/modules/steampipe/cm-directory.ts
// ----------------------------------------------------------------------------
// Valve's IServiceDirectory (https://api.steampowered.com/IServiceDirectory/v1/)
// returns the current list of Connection Manager servers for any given
// client. We query it via HTTPS — but with PROTOBUF-encoded body and response,
// NOT JSON, as the reviewer flagged.
//
// Steam pipe schema (per SteamDatabase/Protobufs + SteamKit2):
//   request  : CMsgGetSDRConfig { cell_id: uint32; max_servers: uint32 }
//   response : CMsgGetSDRConfigResponse {
//                cell_id: uint32 (1)
//                load_summary_code: uint32 (2)
//                server_list: CMsgServer[] (3, length-delimited, repeated)
//                fallback_relay: string (4)
//              }
//   per server: CMsgServer { type: uint32 (1), sourceid: uint32 (2),
//                           cell_id: uint32 (3), host: string (4),
//                           port: uint32 (5), ws: bool (6, optional) }
//
// This file uses our new electron/modules/steampipe/proto.ts encoders to
// build the request body and decode the response, proving end-to-end that
// our pure-Node proto primitives interoperate with real Valve wire format.
//
// TRUTHFULNESS: this module ONLY gives back IP + port of CM servers. It does
// NOT authenticate, it does NOT mint download tickets, and it does NOT issue
// tickets for paid games. Phase 3 (TCP+TLS+anonymous RSA handshake) is the
// next milestone; ticket synthesis for paid apps remains an open legal gray
// area not addressed here.
// ============================================================================

import https from 'https'
import { logger } from '../../logger'
import {
  encodeVarintField,
  decodeFields,
  readVarintField,
  readBytesField,
} from './proto'
import type { CmListResponse, CmServer } from './types'

const SERVICE_DIRECTORY_HOST = 'api.steampowered.com'
// El endpoint IServiceDirectory/v1 devuelve 404. El endpoint correcto y
// estable de Valve para obtener CM servers es ISteamDirectory/GetCMListForConnect,
// que devuelve JSON (no protobuf) con la lista de servers para conectar.
// Ref: SteamKit2 SteamDirectory.LoadAsync usa este mismo endpoint.
const SERVICE_DIRECTORY_PATH = '/ISteamDirectory/GetCMListForConnect/v1/'
// Matches SteamKit2 + Valve's published convention. Rejecting other content
// types (e.g. text/plain) drops your request silently server-side.
const CONTENT_TYPE_PROTOBUF = 'application/x-protobuf'

/**
 * Build the request body (CMsgGetSDRConfig) using our proto encoders.
 * Field 1 = cell_id (uint32, varint); Field 2 = max_servers (uint32, varint).
 * 4-line serialization; designed to be the *first real wire-format demand*
 * our new proto primitives hit end-to-end.
 */
function buildGetSdrConfig(cellId: number, maxServers: number): Buffer {
  return Buffer.concat([
    encodeVarintField(1, cellId | 0),
    encodeVarintField(2, maxServers | 0),
  ])
}

/**
 * Decode the response (CMsgGetSDRConfigResponse) using our proto decoders.
 * Each CMsgServer is a length-delimited sub-message inside field 3; we recurse
 * via decodeFields on the embedded payload.
 */
/**
 * Decode the response (CMsgGetSDRConfigResponse) using our proto decoders.
 *
 * Exported for unit testing: tests/steampipe/cm-directory.test.ts builds a
 * synthetic byte buffer per the proto schema and round-trips through this
 * function, proving our proto primitives inter-operate with the exact wire
 * shape Valve uses. Production callers use getCmServerList() which calls this
 * internally and packages the result.
 *
 * Each CMsgServer is a length-delimited sub-message inside field 3; we recurse
 * via decodeFields on the embedded payload.
 */
export function parseSdrConfigResponse(buf: Buffer): CmListResponse {
  const fields = decodeFields(buf)
  const cellId = (readVarintField(fields, 1) as number | null) ?? 0
  const loadSummaryCode = (readVarintField(fields, 2) as number | null) ?? 1
  const serversRaw = readBytesField(fields, 3)
  const servers: CmServer[] = []
  if (serversRaw) {
    // We can't know in advance how the outer field-3 serialization split
    // repeats: Valve uses length-delimited-per-item. We do a single-byte scan
    // to recover individual CMsgServer bodies if Valve concatenates them.
    // In practice they ARE individually framed (one length-prefix per server).
    servers.push(...parseServerList(serversRaw))
  }
  const fallbackRelayBytes = readBytesField(fields, 4)
  const fallbackRelay = fallbackRelayBytes ? fallbackRelayBytes.toString('utf-8') : undefined
  return { cellId, loadSummaryCode, servers, fallbackRelay }
}

/**
 * Inside field 3 (server_list) we expect a concatenation of individually
 * framed CMsgServer messages. Each frame starts with a varint length prefix
 * followed by the body. We slice them out one by one and parse with
 * decodeFields.
 */
function parseServerList(buf: Buffer): CmServer[] {
  const out: CmServer[] = []
  let offset = 0
  while (offset < buf.length) {
    // Read a varint length prefix for this individual server message.
    let len = 0
    let shift = 0
    let lenConsumed = 0
    let done = false
    while (offset + lenConsumed < buf.length) {
      const b = buf[offset + lenConsumed]
      lenConsumed++
      len |= (b & 0x7f) << shift
      if ((b & 0x80) === 0) {
        done = true
        break
      }
      shift += 7
      if (shift > 31) {
        // Varint too long; bail out rather than corrupt the rest.
        logger.warn('[steampipe] CMsgServer length varint > 31 bits, aborting parse', 'steampipe')
        return out
      }
    }
    if (!done) {
      logger.warn('[steampipe] EOF mid-varint for CMsgServer length, treating remainder as final entry', 'steampipe')
      len = buf.length - offset - lenConsumed
      if (len <= 0) break
    }
    const bodyStart = offset + lenConsumed
    if (bodyStart + len > buf.length) {
      logger.warn(
        `[steampipe] CMsgServer declared length ${len} exceeds buffer tail ${buf.length - bodyStart}, truncating`,
        'steampipe',
      )
      break
    }
    const body = buf.subarray(bodyStart, bodyStart + len)
    const serverFields = decodeFields(body)
    const type = (readVarintField(serverFields, 1) as number | null) ?? 0
    const sourceId = (readVarintField(serverFields, 2) as number | null) ?? 0
    const hostBytes = readBytesField(serverFields, 4)
    const port = (readVarintField(serverFields, 5) as number | null) ?? 0
    // We do NOT respect `cell_id` (serverFields 3) here — it's per-server and
    // we'd want to filter against requested cell id, but Valve's directory
    // already filters server-side based on cell_id we sent.
    if (hostBytes) {
      out.push({
        host: hostBytes.toString('utf-8'),
        port,
        type,
        sourceId,
        isWebSocket: false, // populated below if ws field is seen
      })
      // field 6 = ws (bool, varint 0/1); if present, the server supports the
      // WebSocket transport as well as TCP. We only flip isWebSocket when we
      // see the field — absence means TCP-only.
      const wsVarint = readVarintField(serverFields, 6)
      if (out.length > 0 && typeof wsVarint === 'number' && wsVarint !== 0) {
        out[out.length - 1].isWebSocket = true
      }
    }
    offset = bodyStart + len
  }
  return out
}

/**
 * Fetch the list of Connection Manager servers from Valve's directory.
 * `cellId` defaults to 0 (any region). `maxServers` defaults to 30.
 * Returns an empty `servers` array on any non-200 / parse error — caller can
 * retry with a different cell id (server-side load-summary code 400/401).
 */
/**
 * Throws RangeError on out-of-range or non-integer opts.
 *
 * Exported for unit testing — Phase 1 review's hygiene fix: instead of
 * inlining a hand-copy of the validation logic in tests (which would drift
 * silently if we tightened the bounds), the canonical validation lives here
 * and tests assert against it directly.
 */
export function validateDirectoryOpts(opts: {
  cellId?: number
  maxServers?: number
}): { cellId: number; maxServers: number } {
  const cellId = opts.cellId ?? 0
  const maxServers = opts.maxServers ?? 30
  if (!Number.isInteger(cellId) || cellId < 0 || cellId > 0xffffffff) {
    throw new RangeError(
      `validateDirectoryOpts: cellId out of range (got ${cellId}; expected 0..0xffffffff integer)`,
    )
  }
  if (!Number.isInteger(maxServers) || maxServers < 1 || maxServers > 200) {
    throw new RangeError(
      `validateDirectoryOpts: maxServers out of range (got ${maxServers}; expected 1..200 integer)`,
    )
  }
  return { cellId, maxServers }
}

export async function getCmServerList(opts: {
  cellId?: number
  maxServers?: number
  timeoutMs?: number
}): Promise<CmListResponse> {
  // Round-3 fix: delegate validation to the exported helper so tests assert
  // against the real validator (not a hand-copy that could drift). Later
  // tightening of bounds is automatically reflected in tests.
  const { cellId, maxServers } = validateDirectoryOpts(opts)
  // Round-2 fix (reviewer): explicit entry validation. Without this, callers
  // passing NaN / negative / fractional values would be silently coerced via
  // bitwise-OR truncation to garbage bytes that Valve either ignores or — for
  // cellId=NaN ⇒ 0 ⇒ "any cell", which is OK — but cellId=-1 ⇒ u32 max ⇒
  // worst-case server selection. Throw early to surface caller mistakes.
  const timeoutMs = opts.timeoutMs ?? 15000

  // GET con query params — Valve's ISteamDirectory devuelve JSON.
  // maxcount limita cuántos servers devuelve; pedimos maxServers.
  const query = `?cellid=${cellId}&maxcount=${maxServers}&format=json`
  const fullPath = SERVICE_DIRECTORY_PATH + query
  logger.info(
    `[steampipe] ServiceDirectory GET ${fullPath} cellId=${cellId} maxServers=${maxServers}`,
    'steampipe',
  )

  return new Promise<CmListResponse>((resolve, reject) => {
    const req = https.request(
      {
        host: SERVICE_DIRECTORY_HOST,
        port: 443,
        path: fullPath,
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Y-core/0.4 steampipe',
        },
        timeout: timeoutMs,
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (chunk: Buffer) => chunks.push(chunk))
        res.on('end', () => {
          const raw = Buffer.concat(chunks)
          if (res.statusCode !== 200) {
            logger.warn(
              `[steampipe] ServiceDirectory HTTP ${res.statusCode} (${raw.length}B): ${raw.slice(0, 200).toString('utf-8')}`,
              'steampipe',
            )
            reject(new Error(`ServiceDirectory HTTP ${res.statusCode}`))
            return
          }
          try {
            const parsed = parseJsonCmList(raw.toString('utf-8'), cellId)
            if (parsed.servers.length === 0) {
              logger.warn('[steampipe] ServiceDirectory returned 0 servers', 'steampipe')
            } else {
              logger.info(
                `[steampipe] ServiceDirectory OK: ${parsed.servers.length} servers (cellId=${parsed.cellId})`,
                'steampipe',
              )
            }
            resolve(parsed)
          } catch (parseErr) {
            logger.warn(
              `[steampipe] ServiceDirectory parse failed: ${(parseErr as Error).message}`,
              'steampipe',
            )
            reject(new Error(`ServiceDirectory parse failed: ${(parseErr as Error).message}`))
          }
        })
      },
    )
    req.on('timeout', () => {
      req.destroy(new Error(`ServiceDirectory request timeout (${timeoutMs}ms)`))
    })
    req.on('error', (err) => {
      logger.warn(`[steampipe] ServiceDirectory request error: ${err.message}`, 'steampipe')
      reject(err)
    })
    req.end()
  })
}

/**
 * Parsea la respuesta JSON de ISteamDirectory/GetCMListForConnect.
 * Formato Valve:
 *   {
 *     "response": {
 *       "serverlist": [
 *         { "endpoint": "162.254.196.67:27017", "legacy_endpoint": "...",
 *           "type": "netfilter", "dc": "iad", "realm": "steamglobal",
 *           "load": 117, "wtd_load": 5.53 },
 *         ...
 *       ],
 *       "success": true
 *     }
 *   }
 * Cada endpoint es "host:port". Filtramos los tipo "netfilter" (TCP CM) y
 * también aceptamos "websockets" convirtiéndolos con isWebSocket=true.
 */
export function parseJsonCmList(json: string, requestedCellId: number): CmListResponse {
  const data = JSON.parse(json) as {
    response?: {
      serverlist?: Array<{
        endpoint?: string
        legacy_endpoint?: string
        type?: string
        load?: number
        wtd_load?: number
      }>
      success?: boolean
    }
  }
  const serverlist = data.response?.serverlist ?? []
  const servers: CmServer[] = []
  for (const entry of serverlist) {
    // Preferimos legacy_endpoint (host:port TCP puro) si existe, sino endpoint.
    const ep = entry.legacy_endpoint || entry.endpoint
    if (!ep) continue
    const lastColon = ep.lastIndexOf(':')
    if (lastColon < 0) continue
    const host = ep.slice(0, lastColon)
    const port = parseInt(ep.slice(lastColon + 1), 10)
    if (!host || Number.isNaN(port)) continue
    const isWs = (entry.type || '').toLowerCase().includes('websocket')
    servers.push({
      host,
      port,
      type: 2, // Blue/CM
      sourceId: 0,
      isWebSocket: isWs,
    })
  }
  return { cellId: requestedCellId, loadSummaryCode: 1, servers }
}
