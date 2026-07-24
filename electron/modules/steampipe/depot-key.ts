// ============================================================================
// electron/modules/steampipe/depot-key.ts
// ----------------------------------------------------------------------------
// Phase 3 — Depot decryption key retrieval via CM TCP IPC.
//
// Sends CMsgClientGetDepotDecryptionKey (EMsg=1043) over the authenticated
// CM connection and parses the response to obtain the 32-byte depot key.
//
// The depot key is used for:
//   1. Decrypting filenames in manifests (if filenames_encrypted is set)
//   2. CDN auth token generation (if required by the CDN server)
//   3. NOT for chunk decryption — chunks are only zlib-compressed at CDN level
//
// TRUTHFULNESS: anonymous sessions CAN request depot keys for F2P apps.
// For paid apps, the CM will reject the request with eresult != 1.
// ============================================================================

import { logger } from '../../logger'
import type { CmConnection } from './cm-connection'
import {
  EMSG,
  encodeGetDepotKeyFields,
  PROTO_FLAG,
} from './cm-protocol'
import { decodeFields, readVarintField, readBytesField, decodeVarintBig } from './proto'
import type { DepotKeyResult } from './types'

const CLIENT_INIT_JOB_ID = 0xffffffffffffffffn
const IPC_TIMEOUT_MS = 15000

/**
 * Request the depot decryption key from the CM server.
 *
 * @param conn - Authenticated CM connection (sessionKey must be set)
 * @param depotId - The depot ID to request the key for
 * @param appId - The app ID that owns the depot
 * @returns DepotKeyResult with eresult and depotKey (32 bytes) or null
 */
export async function requestDepotKey(
  conn: CmConnection,
  depotId: number,
  appId: number,
  timeoutMs = IPC_TIMEOUT_MS,
): Promise<DepotKeyResult> {
  if (!conn.sessionKey) {
    throw new Error('requestDepotKey: connection not authenticated (sessionKey missing)')
  }

  // 1. Build request fields.
  const fields = encodeGetDepotKeyFields(depotId, appId)

  // 2. Wrap as ExtendedProtobuf.
  const { encodeVarint, encodeVarintBig } = await import('./proto')
  const body = Buffer.concat([
    encodeVarint((EMSG.CLIENT_GET_DEPOT_KEY | PROTO_FLAG) >>> 0),
    encodeVarintBig(CLIENT_INIT_JOB_ID),
    fields,
  ])

  // 3. Send.
  conn.writePostHandshakeBuffer(body)
  logger.info(
    `[steampipe] GetDepotKey sent (depotId=${depotId}, appId=${appId})`,
    'steampipe',
  )

  // 4. Read response.
  const responseBody = await conn.readPostHandshakeBuffer(timeoutMs)

  // 5. Parse ExtendedProtobuf envelope.
  let offset = 0
  const { value: msgId, consumed: msgIdConsumed } = decodeVarintBig(responseBody, offset)
  offset += msgIdConsumed
  const expectedResponseMsgId = (EMSG.CLIENT_GET_DEPOT_KEY_RESPONSE | PROTO_FLAG) >>> 0
  if (Number(msgId) !== expectedResponseMsgId) {
    logger.warn(
      `[steampipe] GetDepotKey response EMsg mismatch: got ${msgId}, expected ${expectedResponseMsgId}`,
      'steampipe',
    )
  }
  const { consumed: jobIdConsumed } = decodeVarintBig(responseBody, offset)
  offset += jobIdConsumed
  const responseFields = responseBody.subarray(offset)

  // 6. Parse CMsgClientGetDepotDecryptionKeyResponse:
  //   field 1: uint32 eresult
  //   field 2: uint32 depot_id
  //   field 3: bytes depot_key (32 bytes)
  const pf = decodeFields(responseFields)
  const eresult = (readVarintField(pf, 1) as number) ?? 0
  const returnedDepotId = (readVarintField(pf, 2) as number) ?? depotId
  const depotKeyBytes = readBytesField(pf, 3)

  const result: DepotKeyResult = {
    eresult,
    depotKey: depotKeyBytes && depotKeyBytes.length === 32 ? depotKeyBytes : null,
    depotId: returnedDepotId,
  }

  if (eresult === 1 && result.depotKey) {
    logger.info(
      `[steampipe] GetDepotKey OK: depotId=${depotId}, key first 4 bytes hex=${depotKeyBytes!.subarray(0, 4).toString('hex')}…`,
      'steampipe',
    )
  } else {
    logger.warn(
      `[steampipe] GetDepotKey failed: eresult=${eresult} depotId=${depotId}`,
      'steampipe',
    )
  }

  return result
}
