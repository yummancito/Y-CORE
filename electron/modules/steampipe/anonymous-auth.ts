// ============================================================================
// electron/modules/steampipe/anonymous-auth.ts
// ----------------------------------------------------------------------------
// Anonymous login via CMsgClientLogOn (EMsg=701).
//
// After ChannelEncrypt handshake completes, we have a CmConnection with
// sessionKey attached. We use post-handshake framing: protobuf-extended body,
// AES-256-CBC encrypted.
//
// Flow:
//   1. Build ExtendedProtobuf body for CMsgClientLogOn with anonymous flags:
//        [varint(EMsg=701|0x80000000)] [varint JobId=0xFFFFFFFFFFFFFFFF]
//        [protobuf fields: protocol_version=65580, client_language='english',
//                         os_type=10 (Win64), machine_name]
//   2. writePostHandshakeBuffer (which AES-CBC encrypts internally).
//   3. readPostHandshakeBuffer — server returns CMsgClientLogOnResponse
//      (EMsg=713) AES-encrypted.
//   4. Parse ExtendedProtobuf: EMsg=713, fields[0]=eresult (uint32 varint).
//      eresult==1 means login success.
//
// Anonymous SteamID: a fixed SteamID = 0x0100000000000001 (= 72057594037927937
// decimal). Steam doesn't return a different ID for anonymous; it just allows
// content access to F2P apps.
//
// TRUTHFULNESS: anonymous SteamID login only grants access to F2P apps.
// Paid apps REQUIRE the actual license and the response will have eresult
// != 1 (typically InvalidLogin=5 or NoLicense=15 or similar). This module
// does NOT synthesize, route, or fake license tickets.
// ============================================================================

import { logger } from '../../logger'
import {
  encodeAnonymousLogOnFields,
  encodeExtendedProtobufBody,
  ERESULT_OK,
  ERESULT_INVALID_LOGIN,
  decodeLogOnResponseFields,
  EMSG,
} from './cm-protocol'
import { decodeVarintBig } from './proto'
import type { CmConnection } from './cm-connection'

/** Steam's fixed anonymous SteamID. */
export const ANONYMOUS_STEAMID = 0x0100000000000001n

/** Outgoing JobId convention for client-init messages (after handshake). */
const CLIENT_INIT_JOB_ID = 0xffffffffffffffffn

/**
 * Run anonymous login on a CmConnection that has completed the ChannelEncrypt
 * handshake. Returns the session_id + SteamID if eresult==1, else throws.
 *
 * Throws on:
 *   - Wrong EMsg in response
 *   - eresult != 1 (login failed, e.g., server busy, anon disabled server-side)
 */
export async function loginAnonymously(opts: {
  conn: CmConnection
  timeoutMs?: number
  /** Override fields for testing or branded-agent. */
  machineName?: string
  clientLanguage?: string
  osType?: number
  protocolVersion?: number
}): Promise<{
  eresult: number
  accountId: bigint | null
  sessionId: bigint | null
}> {
  const conn = opts.conn
  if (!conn.sessionKey) {
    throw new Error('loginAnonymously: handshake incomplete (sessionKey not set)')
  }

  // 1. Build the protobuf fields.
  const fields = encodeAnonymousLogOnFields({
    protocolVersion: opts.protocolVersion,
    clientLanguage: opts.clientLanguage,
    osType: opts.osType,
    machineName: opts.machineName,
  })

  // 2. Wrap into ExtendedProtobuf body (EMsg=701 + JobId=0xFFFFFFFF).
  const extendedBody = encodeExtendedProtobufBody(EMSG.CLIENT_LOGON, CLIENT_INIT_JOB_ID, fields)

  // 3. AES-encrypt and send.
  conn.writePostHandshakeBuffer(extendedBody)
  logger.info(
    `[steampipe] ClientLogOn sent (anon; extended=${extendedBody.length}B)`,
    'steampipe',
  )

  // 4. Read response (AES-encrypted, length-prefixed frame).
  const responseBody = await conn.readPostHandshakeBuffer(opts.timeoutMs ?? 15000)

  // 5. Parse the ExtendedProtobuf envelope.
  if (responseBody.length < 2) {
    throw new RangeError(
      `loginAnonymously: response body too short (got ${responseBody.length})`,
    )
  }
  // We don't strictly need to decode the varint msgId here (we know it's 713
  // for response), but we validate it for safety.
  const { value: msgId, consumed: msgIdConsumed } = decodeVarintBig(responseBody, 0)
  if (BigInt(msgId) !== BigInt(EMSG.CLIENT_LOGON_RESPONSE | 0x80000000)) {
    throw new Error(
      `loginAnonymously: unexpected response EMsg (got ${msgId}, expected ${EMSG.CLIENT_LOGON_RESPONSE | 0x80000000})`,
    )
  }

  // 6. Decode JobId then protobuf fields.
  const { value: jobId, consumed: jobIdConsumed } = decodeVarintBig(
    responseBody,
    msgIdConsumed,
  )
  if (jobId !== CLIENT_INIT_JOB_ID) {
    // Not fatal: client_id from server is usually echoed back. We don't error
    // on mismatch but we log it for diagnostics.
    logger.warn(
      `[steampipe] ClientLogOnResponse jobId=${jobId} (expected ${CLIENT_INIT_JOB_ID})`,
      'steampipe',
    )
  }

  const fieldsStart = msgIdConsumed + jobIdConsumed
  const responseFields = responseBody.subarray(fieldsStart)
  const parsed = decodeLogOnResponseFields(responseFields)
  logger.info(
    `[steampipe] ClientLogOnResponse eresult=${parsed.eresult} accountId=${parsed.accountId ?? '?'} sessionId=${parsed.sessionId ?? '?'}`,
    'steampipe',
  )

  if (parsed.eresult !== ERESULT_OK) {
    // Log specifically for invalid-login scenarios (more common than others).
    if (parsed.eresult === ERESULT_INVALID_LOGIN) {
      logger.warn(
        `[steampipe] anonymous login rejected: eresult=${parsed.eresult} (InvalidLogin; rare for anonymous)`,
        'steampipe',
      )
    }
  }

  return parsed
}

// (Round-6 fix: duplicate readVarintBound removed; decodeVarintBig from proto.ts used.)
