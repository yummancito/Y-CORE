// ============================================================================
// electron/modules/steampipe/proto.ts
// ----------------------------------------------------------------------------
// SteamWorks-style protobuf wiring primitives for the SteamPipe client.
//
// Steam's binary protocol differs from "vanilla" Google protobuf in two ways at
// the framing layer:
//   1. Every packet on the wire is prefixed with a u32 little-endian length
//      covering everything AFTER the length prefix itself.
//   2. The protobuf body of that packet starts with a varint "message id" —
//      a discreet convention Valve uses instead of giving each message its
//      own protobuf top-level message name.
//
// Everything inside the message body uses regular protobuf wire format
// (varint / fixed64 / length-delimited). Field numbers + wire types are
// extracted from SteamDB/Protobufs definitions or SteamKit2 reference impl.
//
// This module is the foundation for the full SteamPipe stack:
//   proto.ts → cm-protocol.ts → cdn-client.ts → orchestrator.ts
//
// CRITICAL: round-trip equality in encode/decode of varints is non-negotiable.
// Tests in tests/steampipe/proto.test.ts exercise boundary cases (0,
// Number.MAX_SAFE_INTEGER, multi-byte splits).
// ============================================================================

/**
 * Encode an unsigned integer as a base-128 varint (protobuf).
 * Steam and protobuf varints are 7-bit chunks with continuation bit.
 */
export function encodeVarint(value: number): Buffer {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`encodeVarint: non-negative integer required, got ${value}`)
  }
  if (value > Number.MAX_SAFE_INTEGER) {
    // For values above 2^53 we lose precision. SteamPipe doesn't typically need
    // them (max u64 Steam identifiers are 32-bit), so we explicitly error.
    throw new RangeError(`encodeVarint: value > MAX_SAFE_INTEGER (would lose precision)`)
  }
  const out: number[] = []
  let v = value
  while (v >= 0x80) {
    out.push((v & 0x7f) | 0x80)
    v = Math.floor(v / 0x80)
  }
  out.push(v & 0x7f)
  return Buffer.from(out)
}

/**
 * Decode a base-128 varint at offset 0. Returns [value, bytesConsumed].
 * Throws if value would exceed MAX_SAFE_INTEGER or if EOF reached mid-varint.
 */
// bigint varint for > 2^53 values (rare; ChunkID may exceed 2^32).
export function decodeVarintBig(
  buf: Buffer,
  offset = 0,
): { value: bigint; consumed: number } {
  let result = 0n
  let shift = 0n
  let consumed = 0
  while (true) {
    if (offset + consumed >= buf.length) {
      throw new RangeError(`decodeVarintBig: unexpected EOF at offset ${offset + consumed}`)
    }
    const b = buf[offset + consumed]
    consumed++
    result |= BigInt(b & 0x7f) << shift
    if ((b & 0x80) === 0) {
      break
    }
    shift += 7n
    if (shift > 63n) {
      throw new RangeError(`decodeVarintBig: varint too long (>10 bytes)`)
    }
  }
  return { value: result, consumed }
}

export function decodeVarint(buf: Buffer, offset = 0): { value: number; consumed: number } {
  let result = 0n
  let shift = 0n
  let consumed = 0
  while (true) {
    if (offset + consumed >= buf.length) {
      throw new RangeError(`decodeVarint: unexpected EOF at offset ${offset + consumed}`)
    }
    const b = buf[offset + consumed]
    consumed++
    result |= BigInt(b & 0x7f) << shift
    if ((b & 0x80) === 0) {
      break
    }
    shift += 7n
    if (shift > 63n) {
      throw new RangeError(`decodeVarint: varint too long (>10 bytes)`)
    }
  }
  if (result > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError(`decodeVarint: value exceeds MAX_SAFE_INTEGER`)
  }
  return { value: Number(result), consumed }
}

/**
 * Wrap a protobuf body in Steam's framing: 4-byte LE length prefix + body
 * where the body starts with the message id as a varint.
 *
 * Layout on wire: [u32le lengthTotal][varint msgId][protobuf fields]
 * lengthTotal covers [varint msgId + protobuf fields] but NOT itself.
 */
export function wrapSteamMessage(msgId: number, fields: Buffer): Buffer {
  if (msgId < 0 || !Number.isInteger(msgId)) {
    throw new RangeError(`wrapSteamMessage: msgId must be non-negative integer, got ${msgId}`)
  }
  const idBytes = encodeVarint(msgId)
  const body = Buffer.concat([idBytes, fields])
  if (body.length > 0xffffffff) {
    throw new RangeError(`wrapSteamMessage: body too large (>4 GiB)`)
  }
  const lenBuf = Buffer.alloc(4)
  lenBuf.writeUInt32LE(body.length, 0)
  return Buffer.concat([lenBuf, body])
}

/**
 * Inverse of wrapSteamMessage. Reads u32le length prefix, then varint msgId,
 * returns the rest as the protobuf fields buffer. Throws on short packets.
 */
export function unwrapSteamMessage(buf: Buffer): { msgId: number; fields: Buffer } {
  if (buf.length < 4) {
    throw new RangeError(`unwrapSteamMessage: packet shorter than 4 bytes (got ${buf.length})`)
  }
  const length = buf.readUInt32LE(0)
  if (length > buf.length - 4) {
    throw new RangeError(`unwrapSteamMessage: declared length ${length} exceeds packet body (${buf.length - 4})`)
  }
  const body = buf.subarray(4, 4 + length)
  const { value: msgId, consumed } = decodeVarint(body, 0)
  const fields = body.subarray(consumed)
  return { msgId, fields }
}

// ============================================================================
// Field encoders (protobuf wire format)
// ============================================================================

const WIRE_VARINT = 0
const WIRE_FIXED64 = 1
const WIRE_LENGTH_DELIMITED = 2
const WIRE_FIXED32 = 5

function makeFieldTag(fieldNumber: number, wireType: number): Buffer {
  if (fieldNumber < 0 || !Number.isInteger(fieldNumber)) {
    throw new RangeError(`fieldNumber must be non-negative integer`)
  }
  return encodeVarint((fieldNumber << 3) | wireType)
}

/** Field with varint value (uint32, int32, bool, enum). */
export function encodeVarintField(fieldNumber: number, value: number | bigint): Buffer {
  const tag = makeFieldTag(fieldNumber, WIRE_VARINT)
  const val = typeof value === 'bigint' ? encodeVarintBig(value) : encodeVarint(Number(value))
  return Buffer.concat([tag, val])
}

/** Field with raw bytes (bytes, embedded message, string). */
export function encodeBytesField(fieldNumber: number, data: Buffer | string): Buffer {
  const tag = makeFieldTag(fieldNumber, WIRE_LENGTH_DELIMITED)
  const buf = typeof data === 'string' ? Buffer.from(data, 'utf-8') : data
  const len = encodeVarint(buf.length)
  return Buffer.concat([tag, len, buf])
}

/** Field with fixed 64-bit value (uint64, int64, double). For interop we accept bigint. */
export function encodeFixed64Field(fieldNumber: number, value: bigint | number): Buffer {
  const tag = makeFieldTag(fieldNumber, WIRE_FIXED64)
  const buf = Buffer.alloc(8)
  const v = typeof value === 'bigint' ? value : BigInt(value)
  buf.writeBigUInt64LE(v, 0)
  return Buffer.concat([tag, buf])
}

/** Field with fixed 32-bit value (float, fixed32, sfixed32). */
export function encodeFixed32Field(fieldNumber: number, value: number): Buffer {
  const tag = makeFieldTag(fieldNumber, WIRE_FIXED32)
  const buf = Buffer.alloc(4)
  buf.writeUInt32LE(value >>> 0, 0)
  return Buffer.concat([tag, buf])
}

// bigint varint for > 2^53 values (rare; ChunkID may exceed 2^32).
export function encodeVarintBig(value: bigint): Buffer {
  if (value < 0n) {
    throw new RangeError(`encodeVarintBig: non-negative required, got ${value}`)
  }
  const out: number[] = []
  let v = value
  while (v >= 0x80n) {
    out.push(Number((v & 0x7fn) | 0x80n))
    v >>= 7n
  }
  out.push(Number(v))
  return Buffer.from(out)
}

// ============================================================================
// Field decoders (walking an encoded fields buffer)
// ============================================================================

export interface DecodedField {
  fieldNumber: number
  wireType: number
  value: number | bigint | Buffer
}

/**
 * Walk all fields in a protobuf-encoded buffer. Returns an array of fields
 * with tag metadata. Embedded messages stay as their raw bytes — caller
 * recurses if deeper decode is needed.
 */
export function decodeFields(buf: Buffer): DecodedField[] {
  const out: DecodedField[] = []
  let offset = 0
  while (offset < buf.length) {
    const { value: tag, consumed: tagConsumed } = decodeVarint(buf, offset)
    offset += tagConsumed
    const fieldNumber = tag >>> 3
    const wireType = tag & 0x07

    if (wireType === WIRE_VARINT) {
      const { value, consumed } = decodeVarint(buf, offset)
      offset += consumed
      out.push({ fieldNumber, wireType, value })
    } else if (wireType === WIRE_LENGTH_DELIMITED) {
      const { value: len, consumed: lenConsumed } = decodeVarint(buf, offset)
      offset += lenConsumed
      if (offset + len > buf.length) {
        throw new RangeError(`decodeFields: declared length-delimited field ${fieldNumber} exceeds buffer`)
      }
      const data = buf.subarray(offset, offset + len)
      offset += len
      out.push({ fieldNumber, wireType, value: data })
    } else if (wireType === WIRE_FIXED64) {
      if (offset + 8 > buf.length) {
        throw new RangeError(`decodeFields: fixed64 field ${fieldNumber} exceeds buffer`)
      }
      const v = buf.readBigUInt64LE(offset)
      offset += 8
      out.push({ fieldNumber, wireType, value: v })
    } else if (wireType === WIRE_FIXED32) {
      if (offset + 4 > buf.length) {
        throw new RangeError(`decodeFields: fixed32 field ${fieldNumber} exceeds buffer`)
      }
      const v = buf.readUInt32LE(offset)
      offset += 4
      out.push({ fieldNumber, wireType, value: v })
    } else {
      throw new RangeError(`decodeFields: unsupported wire type ${wireType} for field ${fieldNumber}`)
    }
  }
  return out
}

/**
 * Convenience: find a single varint field by number. Returns null if absent.
 * Returns bigint if value > MAX_SAFE_INTEGER (e.g. SteamID64).
 *
 * Type-narrow uses the runtime check (wireType from the matching field) which
 * we trust the encoder/discipline maintains — Buffer values only appear on
 * length-delimited wire types, so the cast is safe given the precondition.
 */
export function readVarintField(fields: DecodedField[], number: number): number | bigint | null {
  for (const f of fields) {
    if (f.fieldNumber === number && (f.wireType === WIRE_VARINT || f.wireType === WIRE_FIXED64)) {
      return f.value as number | bigint
    }
  }
  return null
}

export function readBytesField(fields: DecodedField[], number: number): Buffer | null {
  for (const f of fields) {
    if (f.fieldNumber === number && f.wireType === WIRE_LENGTH_DELIMITED) {
      return f.value as Buffer
    }
  }
  return null
}

export function readFixed32Field(fields: DecodedField[], number: number): number | null {
  for (const f of fields) {
    if (f.fieldNumber === number && f.wireType === WIRE_FIXED32) {
      return f.value as number
    }
  }
  return null
}

export const PROTO_WIRE = {
  VARINT: WIRE_VARINT,
  FIXED64: WIRE_FIXED64,
  LENGTH_DELIMITED: WIRE_LENGTH_DELIMITED,
  FIXED32: WIRE_FIXED32,
} as const

// ============================================================================
// Extended Steam message form (Phase-3 prep)
// ----------------------------------------------------------------------------
// Some Steam CM messages carry a "target job id" right after the msgId.
// Per SteamKit2 / SteamRE protobuf, this is the varint job id, NOT the body.
// Used by: ContentServerDirectory request, EncryptResponse target_job_id,
// most client→server request envelopes (vs. server→client which often omit).
// ============================================================================

const MAX_EMSG = 0x7fffffff
// Steam job ids are uint64; in practice <2^32 most of the time. We refuse
// msgIds > MAX_EMSG to catch caller bugs (passing string, NaN, etc.) early.
/**
 * Wrap with extended form: [u32le length][varint msgId][varint jobId][fields]. */
export function wrapSteamMessageExtended(
  msgId: number,
  targetJobId: bigint,
  fields: Buffer,
): Buffer {
  if (msgId < 0 || msgId > MAX_EMSG || !Number.isInteger(msgId)) {
    throw new RangeError(`wrapSteamMessageExtended: msgId must fit u31, got ${msgId}`)
  }
  if (targetJobId < 0n) {
    throw new RangeError(`wrapSteamMessageExtended: targetJobId must be non-negative bigint`)
  }
  if (fields.length > 0xffffffff - 16) {
    throw new RangeError(`wrapSteamMessageExtended: fields too large to wrap safely`)
  }
  const idBytes = encodeVarint(msgId)
  const jobBytes = encodeVarintBig(targetJobId)
  const body = Buffer.concat([idBytes, jobBytes, fields])
  const lenBuf = Buffer.alloc(4)
  lenBuf.writeUInt32LE(body.length, 0)
  return Buffer.concat([lenBuf, body])
}

/** Inverse of wrapSteamMessageExtended; throws on malformed input. */
export function unwrapSteamMessageExtended(buf: Buffer): {
  msgId: number
  targetJobId: bigint
  fields: Buffer
} {
  if (buf.length < 4) {
    throw new RangeError('unwrapSteamMessageExtended: packet shorter than 4 bytes')
  }
  const length = buf.readUInt32LE(0)
  if (length > buf.length - 4) {
    throw new RangeError('unwrapSteamMessageExtended: declared length exceeds packet body')
  }
  const body = buf.subarray(4, 4 + length)
  let offset = 0
  const { value: msgId, consumed: idConsumed } = decodeVarint(body, offset)
  offset += idConsumed
  if (offset >= body.length) {
    throw new RangeError('unwrapSteamMessageExtended: missing target_job_id after msgId')
  }
  // jobId is also a varint; we re-use decodeVarint but keep bigint resolution.
  // We can't use readVarintField here because field semantics differ (no tag).
  let jobShift = 0n
  let jobValue = 0n
  let jobConsumed = 0
  let jobDone = false
  while (offset < body.length) {
    const b = body[offset++]
    jobConsumed++
    jobValue |= BigInt(b & 0x7f) << jobShift
    if ((b & 0x80) === 0) {
      jobDone = true
      break
    }
    jobShift += 7n
    if (jobShift > 63n) {
      throw new RangeError('unwrapSteamMessageExtended: jobId varint too long')
    }
  }
  if (!jobDone) {
    throw new RangeError('unwrapSteamMessageExtended: EOF mid-varint for jobId')
  }
  const fields = body.subarray(offset)
  return { msgId, targetJobId: jobValue, fields }
}
