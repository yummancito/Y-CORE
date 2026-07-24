// ============================================================================
// electron/modules/steampipe/handshake.ts
// ----------------------------------------------------------------------------
// ChannelEncrypt orchestrator: connect to a CM, send/receive the three-message
// handshake, attach the 32-byte AES session key to the connection.
//
// Flow:
//   1. tcp+TLS to CM server (cm-connection.connectToCm).
//   2. server→client → ChannelEncryptRequest (EMsg=109), plaintext struct.
//   3. Client generates 32 random bytes for AES-256-CBC session key.
//   4. Client encrypts the 32-byte key with Steam's RSA public key (OAEP-SHA1,
//      produces 128-byte ciphertext).
//   5. Client sends ChannelEncryptResponse (EMsg=110), plaintext struct.
//   6. Server→client → ChannelEncryptResult (EMsg=111), plaintext.
//      result=1 means handshake accepted; otherwise likely connection drops.
//
// After step 6, CM connection IS "encrypted" — all subsequent packets are
// AES-CBC framed. We attach sessionKey to the connection in this module.
//
// TRUTHFULNESS: this handshake is what Steam uses for ALL TCP CM clients.
// If it fails (wrong EMsg, RSA validation, etc.), the server simply closes
// the connection — no chatty error response.
// ============================================================================

import { connectToCm, type CmConnection } from './cm-connection'
import {
  encodeChannelEncryptResponse,
} from './cm-protocol'
import { generateSessionKey } from './aes-session'
import { encryptWithSteamPublicKey } from './steam-rsa'
import { logger } from '../../logger'
import type { CmServer } from './types'

/**
 * Connect to a CmServer and perform the ChannelEncrypt handshake.
 * Returns a CmConnection with `.sessionKey` populated, ready for
 * post-handshake protobuf message exchange.
 *
 * Throws on:
 *   - TCP/TLS connection failure
 *   - First EMsg received != 109 (ChannelEncryptRequest)
 *   - Server replies with EMsg=111 but result != 1
 *   - Wrong EMsg ordering
 */
export async function connectAndHandshake(opts: {
  server: CmServer
  hostOverride?: string
  portOverride?: number
  timeoutMs?: number
}): Promise<CmConnection> {
  // 1. TCP/TLS — abandon early if no connection.
  logger.info(
    `[steampipe] connecting to ${opts.hostOverride ?? opts.server.host}:${opts.portOverride ?? opts.server.port} (type=${opts.server.type}, sourceId=${opts.server.sourceId})`,
    'steampipe',
  )
  const conn = await connectToCm(opts)

  // 2. Read ChannelEncryptRequest — first 24 bytes (EMsg + targetJob + sourceJob
  //    + protocol + universe). Pre-handshake wire format is FIXED SIZE.
  // Round-6 fix: connection returns PreHandshakePacket { emsg, payload } not raw
  // Buffer; the EMsg at offset 0..3 is now parsed by the connection's framing.
  const encryptReqPkt = await conn.readPreHandshakePacket(opts.timeoutMs ?? 15000)
  if (encryptReqPkt.emsg !== 109) {
    await conn.close().catch(() => undefined)
    throw new Error(
      `connectAndHandshake: expected ChannelEncryptRequest EMsg=109, got EMsg=${encryptReqPkt.emsg}`,
    )
  }
  const encryptReqBuf = encryptReqPkt.payload
  if (encryptReqBuf.length < 24) {
    await conn.close().catch(() => undefined)
    throw new RangeError(
      `connectAndHandshake: ChannelEncryptRequest too short (got ${encryptReqBuf.length} bytes, expected 24)`,
    )
  }
  logger.info(
    `[steampipe] ChannelEncryptRequest received (${encryptReqBuf.length}B)`,
    'steampipe',
  )

  // 3. Generate random 32-byte AES session key.
  const sessionKey = generateSessionKey()
  logger.info(
    `[steampipe] generated session key (first 4 bytes hex): ${sessionKey.subarray(0, 4).toString('hex')}…`,
    'steampipe',
  )

  // 4. Encrypt the session key with Steam's RSA public key.
  const encrypted = encryptWithSteamPublicKey(sessionKey)
  if (encrypted.length !== 128) {
    await conn.close().catch(() => undefined)
    throw new Error(
      `connectAndHandshake: encrypted key length mismatch (got ${encrypted.length}, expected 128)`,
    )
  }

  // 5. Send ChannelEncryptResponse — plaintext struct packet.
  const responsePacket = encodeChannelEncryptResponse(encrypted)
  conn.writePreHandshakeBuffer(responsePacket)
  logger.info(
    `[steampipe] ChannelEncryptResponse sent (${responsePacket.length}B)`,
    'steampipe',
  )

  // 6. Read ChannelEncryptResult — server replies with success/fail.
  // Round-6 fix: read returns PreHandshakePacket; we revalidate the EMsg.
  const encryptResultPkt = await conn.readPreHandshakePacket(opts.timeoutMs ?? 15000)
  if (encryptResultPkt.emsg !== 111) {
    await conn.close().catch(() => undefined)
    throw new Error(
      `connectAndHandshake: expected ChannelEncryptResult EMsg=111, got EMsg=${encryptResultPkt.emsg}`,
    )
  }
  const encryptResultBuf = encryptResultPkt.payload
  if (encryptResultBuf.length < 24) {
    await conn.close().catch(() => undefined)
    throw new RangeError(
      `connectAndHandshake: ChannelEncryptResult too short (got ${encryptResultBuf.length} bytes, expected 24)`,
    )
  }
  // ChannelEncryptResult layout (server→client, pre-handshake struct):
  //   [u32 EMsg=111][u64 targetJob=0][u64 sourceJob=0][u32 result=1]
  const emsg = encryptResultBuf.readUInt32LE(0)
  if (emsg !== 111) {
    await conn.close().catch(() => undefined)
    throw new Error(
      `connectAndHandshake: expected ChannelEncryptResult (EMsg=111), got EMsg=${emsg}`,
    )
  }
  const result = encryptResultBuf.readUInt32LE(20)
  if (result !== 1) {
    await conn.close().catch(() => undefined)
    throw new Error(
      `connectAndHandshake: ChannelEncryptResult result=${result} (expected 1=success)`,
    )
  }
  logger.info(`[steampipe] ChannelEncryptResult result=1 (handshake OK)`, 'steampipe')

  // Attach the session key for post-handshake read/write.
  conn.sessionKey = sessionKey
  return conn
}
