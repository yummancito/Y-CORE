// ============================================================================
// electron/modules/steampipe/cm-protocol.ts
// ----------------------------------------------------------------------------
// Steam CM-TCP packet framing.
//
// Steam's connection manager protocol has TWO wire forms:
//
//   1. PRE-HANDSHAKE (plaintext struct packets):
//      [u32 EMsg | struct body]
//      struct schema depends on EMsg. ChannelEncrypt variants use:
//        ChannelEncryptRequest (server→client, EMsg=109):
//          [u64 targetJob=0][u64 sourceJob=0][u32 protocol=1][u32 universe=1]
//        ChannelEncryptResponse (client→server, EMsg=110):
//          [u64 targetJob=0][u64 sourceJob=0][u32 protocol=1]
//          [u32 keySize=128][u8*128 RSA-encrypted AES key]
//          [u32 CRC32-of-encrypted-key][u32 padding=0]
//        ChannelEncryptResult (server→client, EMsg=111):
//          [u64 targetJob=0][u64 sourceJob=0][u32 result=1]
//
//   2. POST-HANDSHAKE (AES-encrypted body):
//      [u32le total_encrypted_segment_length]
//      [u8*16 ECB-encrypted IV]
//      [u8*N AES-CBC-encrypted ExtendedProtobuf body]
//      where ExtendedProtobuf body = [varint(EMsg | 0x80000000)] [varint JobId]
//        [protobuf fields]
//
// TRUTHFULNESS: this module is the wire-format layer. Key derivation
// (k_EMsg=701 vs 701+0x80000000) is exact per SteamKit2 / SteamDB reference.
// The high-bit flag discriminates protobuf messages from raw-struct messages.
// ============================================================================

import {
  encodeVarint,
  encodeVarintBig,
  decodeVarintBig,
  encodeVarintField,
  encodeBytesField,
  encodeFixed64Field,
} from './proto'

/** Steam EMsg constants — mirror SteamKit2's EMsgs class. */
export const EMSG = {
  CHANNEL_ENCRYPT_REQUEST: 109,
  CHANNEL_ENCRYPT_RESPONSE: 110,
  CHANNEL_ENCRYPT_RESULT: 111,
  CLIENT_LOGON: 701,
  CLIENT_LOGON_RESPONSE: 713,
  CLIENT_LOG_OFF: 702,
  CLIENT_HEARTBEAT: 703,
  // Phase 3 — content download EMsgs (from SteamKit2 EMsgs.cs)
  CLIENT_GET_DEPOT_KEY: 1043,
  CLIENT_GET_DEPOT_KEY_RESPONSE: 1044,
  CLIENT_GET_SERVERS_FOR_STEAM_PIPE: 5501,
  CLIENT_GET_SERVERS_FOR_STEAM_PIPE_RESPONSE: 5502,
  CLIENT_GET_DEPOT_MANIFEST_REQUEST_CODE: 1067,
  CLIENT_GET_DEPOT_MANIFEST_REQUEST_CODE_RESPONSE: 1068,
  // App info (for depot/branch discovery)
  CLIENT_PACKAGE_INFO: 1047,
  CLIENT_APP_INFO: 1045,
  CLIENT_APP_INFO_RESPONSE: 1046,
} as const

/** Steam-protocol protobuf-marker high bit. */
export const PROTO_FLAG = 0x80000000

function emsgProto(emsg: number): number {
  return (emsg | PROTO_FLAG) >>> 0
}

// CRC32 lookup table, lazy-initialized on first CRC32 computation. Built
// outside the function so we don't trip TypeScript's "property doesn't exist
// on function type" check that the previous closure-based version hit.
let _crc32Table: Uint32Array | null = null
function getCrc32Table(): Uint32Array {
  if (_crc32Table !== null) return _crc32Table
  const POLY = 0xedb88320
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; ++n) {
    let c = n
    for (let k = 0; k < 8; ++k) {
      c = c & 1 ? POLY ^ (c >>> 1) : c >>> 1
    }
    t[n] = c >>> 0
  }
  _crc32Table = t
  return t
}

function crc32C(buf: Buffer): number {
  const table = getCrc32Table()
  let crc = 0xffffffff
  for (let i = 0; i < buf.length; ++i) {
    crc = (table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8)) >>> 0
  }
  return (crc ^ 0xffffffff) >>> 0
}

// ============================================================================
// Pre-handshake plain struct packet ENCODE
// ============================================================================

/**
 * Encode the bytes that we will send to the server for ChannelEncryptResponse.
 * Layout per the thinker's SteamKit2 reference:
 *   [u32 EMsg=110][u64 targetJob=0][u64 sourceJob=0]
 *   [u32 protocol=1]
 *   [u32 keySize=128][u8*128 RSA-encrypted-key]
 *   [u32 CRC32 of encrypted-key][u32 padding=0]
 *
 * Args:
 *   encryptedAesKey: 128-byte RSA-OAEP-SHA1 ciphertext of the 32-byte AES key.
 */
export function encodeChannelEncryptResponse(encryptedAesKey: Buffer): Buffer {
  if (encryptedAesKey.length !== 128) {
    throw new RangeError(
      `encodeChannelEncryptResponse: encryptedAesKey must be 128 bytes (got ${encryptedAesKey.length})`,
    )
  }
  const parts: Buffer[] = []

  // EMsg=110 as u32 LE
  parts.push(u32(EMSG.CHANNEL_ENCRYPT_RESPONSE))
  // targetJob u64 LE
  parts.push(u64(0))
  // sourceJob u64 LE
  parts.push(u64(0))
  // protocol u32 LE (=1)
  parts.push(u32(0x01))
  // keySize u32 LE = 128
  parts.push(u32(encryptedAesKey.length))
  // encrypted key bytes
  parts.push(encryptedAesKey)
  // CRC32 of encrypted-key payload
  parts.push(u32(crc32C(encryptedAesKey)))
  // trailing u32 padding (zeros)
  parts.push(u32(0))

  return Buffer.concat(parts)
}

/**
 * Decode an EMsg from a wire-format pre-handshake packet (just receives [u32
 * EMsg][rest]). For server→client ChannelEncryptRequest: the [rest] is the
 * struct body that we'll let handshake.ts parse further.
 */
export function decodePlainHeader(packet: Buffer): { emsg: number; bodyOffset: number } {
  if (packet.length < 4) {
    throw new RangeError(`decodePlainHeader: packet shorter than 4 bytes (got ${packet.length})`)
  }
  return { emsg: packet.readUInt32LE(0), bodyOffset: 4 }
}

/**
 * Decode ChannelEncryptRequest body (server→client, EMsg=109):
 *   [u64 targetJob][u64 sourceJob][u32 protocol][u32 universe]
 */
export function decodeChannelEncryptRequest(packet: Buffer): {
  emsg: number
  protocol: number
  universe: number
} {
  if (packet.length < 24) {
    throw new RangeError(
      `decodeChannelEncryptRequest: insufficient bytes (got ${packet.length}, expected >= 24)`,
    )
  }
  const emsg = packet.readUInt32LE(0)
  // Skip 8-byte targetJob (offset 4) and 8-byte sourceJob (offset 12)
  const protocol = packet.readUInt32LE(20)
  const universe = packet.readUInt32LE(24)
  return { emsg, protocol, universe }
}

/**
 * Decode ChannelEncryptResult body (server→client, EMsg=111):
 *   [u64 targetJob][u64 sourceJob][u32 result]
 * result=1 means handshake accepted; 0 = reject (rare, usually connection dropped).
 */
export function decodeChannelEncryptResult(packet: Buffer): {
  emsg: number
  result: number
} {
  if (packet.length < 20) {
    throw new RangeError(
      `decodeChannelEncryptResult: insufficient bytes (got ${packet.length}, expected >= 20)`,
    )
  }
  const emsg = packet.readUInt32LE(0)
  const result = packet.readUInt32LE(20)
  return { emsg, result }
}

// ============================================================================
// Post-handshake ExtendedProtobuf packet ENCODE
// ============================================================================

/**
 * Encode an ExtendedProtobuf body (used inside AES-CBC encryption post-handshake):
 *   [varint(EMsg | 0x80000000)] [varint JobId=0xFFFFFFFF] [protobuf fields]
 *
 * JobId=0xFFFFFFFF is the convention for client-initiated messages.
 *
 * Args:
 *   emsg: SteamKit2 EMsg number (701 = ClientLogOn, etc.)
 *   jobId: BigInt target_job_id (use 0xFFFFFFFFn for client-init)
 *   fields: pre-encoded protobuf fields bytes
 */
export function encodeExtendedProtobufBody(
  emsg: number,
  jobId: bigint,
  fields: Buffer,
): Buffer {
  if (emsg < 0 || emsg > 0x7fffffff || !Number.isInteger(emsg)) {
    throw new RangeError(`encodeExtendedProtobufBody: emsg must fit u31 (got ${emsg})`)
  }
  if (jobId < 0n) {
    throw new RangeError(`encodeExtendedProtobufBody: jobId must be non-negative`)
  }
  return Buffer.concat([
    encodeVarint(emsgProto(emsg)),
    encodeVarintBig(jobId),
    fields,
  ])
}

// ============================================================================
// CMsgClientLogOn ENCODE — anonymous Steam login via protobuf fields.
// ============================================================================

// ============================================================================
// Phase 3 — CM message field encoders/decoders for content download
// ============================================================================

/**
 * Encode CMsgClientGetServersForSteamPipe fields.
 * Schema: cell_id(1), launcher_type(2), steam_protocol(3)
 */
export function encodeGetServersForSteamPipeFields(cellId: number): Buffer {
  return Buffer.concat([
    encodeVarintField(1, cellId >>> 0),
    encodeVarintField(2, 0), // launcher_type = 0 (default)
    encodeVarintField(3, 2), // steam_protocol = 2 (SteamPipe)
  ])
}

/**
 * Encode CMsgClientGetDepotDecryptionKey fields.
 * Schema: depot_id(1), app_id(2)
 */
export function encodeGetDepotKeyFields(depotId: number, appId: number): Buffer {
  return Buffer.concat([
    encodeVarintField(1, depotId >>> 0),
    encodeVarintField(2, appId >>> 0),
  ])
}

/**
 * Encode CMsgClientGetDepotManifestRequestCode fields.
 * Schema: depot_id(1), app_id(2), manifest_id(3), branch(4)
 */
export function encodeGetManifestRequestCodeFields(
  depotId: number,
  appId: number,
  manifestId: number | bigint,
  branch: string,
): Buffer {
  return Buffer.concat([
    encodeVarintField(1, depotId >>> 0),
    encodeVarintField(2, appId >>> 0),
    encodeVarintField(3, manifestId),
    encodeBytesField(4, branch),
  ])
}

/**
 * Build protobuf fields for an anonymous CMsgClientLogOn message.
 * Field numbers per SteamKit2 CMsgClientLogOn schema:
 *   2: uint32 protocol_version
 *   14: string client_language ("english")
 *   18: uint32 os_type (10 = Win64)
 *   23: string machine_name (length-bounded to 64 chars on server side)
 */
export function encodeAnonymousLogOnFields(opts: {
  protocolVersion?: number
  clientLanguage?: string
  osType?: number
  machineName?: string
}): Buffer {
  const protoVersion = opts.protocolVersion ?? 65580
  const language = opts.clientLanguage ?? 'english'
  const osType = opts.osType ?? 10 // Win64
  const machineName = (opts.machineName ?? 'Y-core').slice(0, 64)

  return Buffer.concat([
    encodeVarintField(2, protoVersion),
    encodeBytesField(14, language),
    encodeVarintField(18, osType),
    encodeBytesField(23, machineName),
  ])
}

// ============================================================================
// CMsgClientLogOnResponse DECODE — parse eresult from response.
// ============================================================================

export type EResultCode = number

/** Canonical eResult values we'll surface to callers. */
export const ERESULT_OK = 1
export const ERESULT_INVALID_LOGIN = 5
export const ERESULT_ACCOUNT_NOT_FOUND = 8
export const ERESULT_EXPIRED = 18
export const ERESULT_GLOBAL_BAN = 19
export const ERESULT_LIMITED = 30

/**
 * Parse the result of a CMsgClientLogOnResponse. Field 1 eresult (uint32).
 * Field 4: uint64 account_id (SteamID assigned by anonymous=0x0100000000000001 fixed).
 * Field 5: uint64 session_id (BigInt for 64-bit uniqueness).
 *
 * Validation: this only checks the encoded `fields` buffer; the outer
 * `[u32 le length][16 bytes ECB IV][AES-CBC encrypted ExtendedProtobuf body]`
 * is handled by handshake.ts.
 */
export function decodeLogOnResponseFields(fields: Buffer): {
  eresult: EResultCode
  accountId: bigint | null
  sessionId: bigint | null
} {
  // We need to walk the protobuf fields. We don't have a generic decoder here,
  // so we lazily build a minimal field walker that pulls varints/bytes.
  const out = { eresult: 0, accountId: 0n, sessionId: 0n } as {
    eresult: number
    accountId: bigint
    sessionId: bigint
  }
  let offset = 0
  while (offset < fields.length) {
    const { value: tag, consumed: tagConsumed } = decodeVarintBig(fields, offset)
    offset += tagConsumed
    // Round-6 fix: tag is BigInt; Number() coerce for fieldNumber/wireType.
    const tagNum = Number(tag)
    const fieldNumber = tagNum >>> 3
    const wireType = tagNum & 0x07

    if (wireType === 0) {
      // varint
      const { value, consumed } = decodeVarintBig(fields, offset)
      offset += consumed
      if (fieldNumber === 1) out.eresult = Number(value)
      else if (fieldNumber === 4) out.accountId = BigInt(value)
    } else if (wireType === 1) {
      // fixed64
      if (offset + 8 > fields.length) break
      const v = fields.readBigUInt64LE(offset)
      offset += 8
      if (fieldNumber === 5) out.sessionId = v
    } else if (wireType === 2) {
      // length-delimited — for now we skip (rare in LogOnResponse; steamID is varint)
      const { value: len, consumed: lenConsumed } = decodeVarintBig(fields, offset)
      offset += lenConsumed + Number(len)
    } else if (wireType === 5) {
      offset += 4
    } else {
      throw new RangeError(`decodeLogOnResponseFields: unsupported wireType ${wireType}`)
    }
  }
  return {
    eresult: out.eresult,
    accountId: out.accountId === 0n ? null : out.accountId,
    sessionId: out.sessionId === 0n ? null : out.sessionId,
  }
}

// Local varint reader that returns BigInt (avoids importing the export).
function readVarintBound(buf: Buffer, offset: number): { value: bigint; consumed: number } {
  let result = 0n
  let shift = 0n
  let consumed = 0
  while (true) {
    if (offset + consumed >= buf.length) throw new RangeError('varint EOF')
    const b = buf[offset + consumed++]
    result |= BigInt(b & 0x7f) << shift
    if ((b & 0x80) === 0) break
    shift += 7n
    if (shift > 63n) throw new RangeError('varint too long')
  }
  return { value: result, consumed }
}

// ============================================================================
// Little-endian integer helpers
// ============================================================================

function u32(value: number): Buffer {
  const buf = Buffer.alloc(4)
  buf.writeUInt32LE(value >>> 0, 0)
  return buf
}

function u64(value: number | bigint): Buffer {
  const buf = Buffer.alloc(8)
  buf.writeBigUInt64LE(typeof value === 'bigint' ? value : BigInt(value), 0)
  return buf
}
