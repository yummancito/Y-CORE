// ============================================================================
// electron/modules/steampipe/content-servers.ts
// ----------------------------------------------------------------------------
// Phase 3 — CDN server discovery via CM TCP IPC.
//
// Sends CMsgClientGetServersForSteamPipe (EMsg=5501) over the authenticated
// CM connection and parses the response to obtain a list of CDN content
// servers suitable for HTTP manifest/chunk downloads.
//
// TRUTHFULNESS: this module only queries Valve's CM for CDN server addresses.
// It does NOT synthesize CDN auth tokens or bypass access controls.
// ============================================================================

import { logger } from '../../logger'
import type { CmConnection } from './cm-connection'
import { EMSG, encodeGetServersForSteamPipeFields, encodeGetManifestRequestCodeFields, PROTO_FLAG } from './cm-protocol'
import {
  encodeVarint,
  encodeVarintBig,
  decodeVarintBig,
  decodeFields,
  readVarintField,
  readBytesField,
} from './proto'
import type { CdnServerEntry } from './types'

const CLIENT_INIT_JOB_ID = 0xffffffffffffffffn
const IPC_TIMEOUT_MS = 15000

/**
 * Request CDN servers from the CM for a given cell ID.
 * Uses the authenticated CM connection from the download session.
 */
export async function fetchCdnServers(
  conn: CmConnection,
  cellId: number,
  timeoutMs = IPC_TIMEOUT_MS,
): Promise<CdnServerEntry[]> {
  if (!conn.sessionKey) {
    throw new Error('fetchCdnServers: connection not authenticated (sessionKey missing)')
  }

  const fields = encodeGetServersForSteamPipeFields(cellId)

  const body = Buffer.concat([
    encodeVarint((EMSG.CLIENT_GET_SERVERS_FOR_STEAM_PIPE | PROTO_FLAG) >>> 0),
    encodeVarintBig(CLIENT_INIT_JOB_ID),
    fields,
  ])

  conn.writePostHandshakeBuffer(body)
  logger.info(`[steampipe] GetServersForSteamPipe sent (cellId=${cellId})`, 'steampipe')

  const responseBody = await conn.readPostHandshakeBuffer(timeoutMs)

  let offset = 0
  const { value: msgId, consumed: msgIdConsumed } = decodeVarintBig(responseBody, offset)
  offset += msgIdConsumed
  const expectedMsgId = (EMSG.CLIENT_GET_SERVERS_FOR_STEAM_PIPE_RESPONSE | PROTO_FLAG) >>> 0
  if (Number(msgId) !== expectedMsgId) {
    logger.warn(
      `[steampipe] GetServersForSteamPipe response EMsg mismatch: got ${msgId}, expected ${expectedMsgId}`,
      'steampipe',
    )
  }
  const { consumed: jobIdConsumed } = decodeVarintBig(responseBody, offset)
  offset += jobIdConsumed
  const responseFields = responseBody.subarray(offset)

  // CMsgClientGetServersForSteamPipeResponse:
  //   field 2: repeated Server servers
  // Server: type(1), relay_server(2), edge_server(3), vhost_port(4),
  //         edge_server_port(5), vhost(10), edge_server_name(11)
  const outerFields = decodeFields(responseFields)
  const serversRaw = readBytesField(outerFields, 2)

  const servers: CdnServerEntry[] = []
  if (!serversRaw) {
    logger.warn('[steampipe] GetServersForSteamPipe: no servers field', 'steampipe')
    return servers
  }

  let innerOffset = 0
  while (innerOffset < serversRaw.length) {
    let len = 0
    let shift = 0
    let lenConsumed = 0
    let done = false
    while (innerOffset + lenConsumed < serversRaw.length) {
      const b = serversRaw[innerOffset + lenConsumed]
      lenConsumed++
      len |= (b & 0x7f) << shift
      if ((b & 0x80) === 0) { done = true; break }
      shift += 7
      if (shift > 31) break
    }
    if (!done) break
    const bodyStart = innerOffset + lenConsumed
    if (bodyStart + len > serversRaw.length) break
    const serverBody = serversRaw.subarray(bodyStart, bodyStart + len)
    const sf = decodeFields(serverBody)
    const type = (readVarintField(sf, 1) as number) ?? 0
    const vhostPort = (readVarintField(sf, 4) as number) ?? 80
    const vhost = readBytesField(sf, 10)
    const edgeServerName = readBytesField(sf, 11)
    const host = vhost
      ? vhost.toString('utf-8')
      : edgeServerName
        ? edgeServerName.toString('utf-8')
        : ''
    if (host && type > 0) {
      servers.push({ type, host, port: vhostPort || 80, relayHost: '', edgeServer: '' })
    }
    innerOffset = bodyStart + len
  }

  logger.info(`[steampipe] GetServersForSteamPipe: ${servers.length} CDN servers`, 'steampipe')
  return servers
}

/** Pick the best CDN server — prefer CSS (type=1). */
export function pickBestCdnServer(servers: CdnServerEntry[]): CdnServerEntry | null {
  if (servers.length === 0) return null
  return servers.find((s) => s.type === 1) ?? servers[0]
}

// ============================================================================
// Manifest request code (required by some CDN servers)
// ============================================================================

/**
 * Request a manifest request code from the CM.
 * This code is valid for ~5 minutes and required by some CDN servers.
 * For F2P apps, the code is typically 0 or a simple value.
 */
export async function requestManifestRequestCode(
  conn: CmConnection,
  depotId: number,
  appId: number,
  manifestId: number | bigint,
  branch: string,
  timeoutMs = IPC_TIMEOUT_MS,
): Promise<number> {
  if (!conn.sessionKey) {
    throw new Error('requestManifestRequestCode: connection not authenticated')
  }

  const fields = encodeGetManifestRequestCodeFields(depotId, appId, manifestId, branch)

  const body = Buffer.concat([
    encodeVarint((EMSG.CLIENT_GET_DEPOT_MANIFEST_REQUEST_CODE | PROTO_FLAG) >>> 0),
    encodeVarintBig(CLIENT_INIT_JOB_ID),
    fields,
  ])

  conn.writePostHandshakeBuffer(body)
  logger.info(
    `[steampipe] GetManifestRequestCode sent (depotId=${depotId}, manifestId=${manifestId})`,
    'steampipe',
  )

  const responseBody = await conn.readPostHandshakeBuffer(timeoutMs)

  let offset = 0
  const { value: msgId, consumed: msgIdConsumed } = decodeVarintBig(responseBody, offset)
  offset += msgIdConsumed
  const expectedMsgId = (EMSG.CLIENT_GET_DEPOT_MANIFEST_REQUEST_CODE_RESPONSE | PROTO_FLAG) >>> 0
  if (Number(msgId) !== expectedMsgId) {
    logger.warn(
      `[steampipe] GetManifestRequestCode response EMsg mismatch: got ${msgId}, expected ${expectedMsgId}`,
      'steampipe',
    )
  }
  const { consumed: jobIdConsumed } = decodeVarintBig(responseBody, offset)
  offset += jobIdConsumed
  const responseFields = responseBody.subarray(offset)

  // CMsgClientGetDepotManifestRequestCodeResponse:
  //   field 1: uint32 eresult
  //   field 2: uint64 manifest_request_code
  //   field 3: uint32 expiration_time
  const pf = decodeFields(responseFields)
  const eresult = (readVarintField(pf, 1) as number) ?? 0
  const requestCodeRaw = readVarintField(pf, 2)
  const requestCode = typeof requestCodeRaw === 'bigint' ? Number(requestCodeRaw) : (requestCodeRaw ?? 0) as number

  if (eresult === 1) {
    logger.info(
      `[steampipe] GetManifestRequestCode OK: requestCode=${requestCode}`,
      'steampipe',
    )
  } else {
    logger.warn(
      `[steampipe] GetManifestRequestCode failed: eresult=${eresult}`,
      'steampipe',
    )
  }

  return requestCode
}
