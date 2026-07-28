// ============================================================================
// tests/steampipe/cm-protocol.test.ts
// ----------------------------------------------------------------------------
// Unit tests for Steam CM-TCP packet framing. We verify:
//   1. ChannelEncryptResponse bytes-layout:
//      [u32 EMsg=1304][u64 target=0xFFFFFFFFFFFFFFFF][u64 source=0xFFFFFFFFFFFFFFFF]
//      [u32 protocol=1][u32 keySize=128][128 bytes encrypted key][u32 CRC32]
//      Total = 160 (sin padding final)
//   2. ExtendedProtobuf body layout: [varint(EMsg | 0x80000000)][varint JobId][fields]
//   3. CMsgClientLogOn protobuf fields for anonymous (4 fields: proto_version,
//      client_language, os_type, machine_name).
//   4. CMsgClientLogOnResponse decoder pulls eresult correctly.
//   5. CRC32 + high-bit flag invariants.
//   6. ChannelEncryptRequest/Result decoders (EMsg=1303/1305).
// ============================================================================

import { describe, it, expect } from 'vitest'
import crypto from 'crypto'
import {
  encodeChannelEncryptResponse,
  encodeExtendedProtobufBody,
  encodeAnonymousLogOnFields,
  decodeLogOnResponseFields,
  decodeChannelEncryptRequest,
  decodeChannelEncryptResult,
  EMSG,
  ERESULT_OK,
} from '../../electron/modules/steampipe/cm-protocol'

describe('cm-protocol — ChannelEncryptResponse wire layout', () => {
  it('byte layout matches SteamKit2 reference (160 bytes, no padding)', () => {
    const encrypted = Buffer.alloc(128, 0xab) // dummy encrypted key, all 0xab
    const packet = encodeChannelEncryptResponse(encrypted)
    // Layout: 4 (EMsg) + 8 (targetJob) + 8 (sourceJob) + 4 (protocol) +
    //         4 (keySize) + 128 (encrypted key) + 4 (CRC32) = 160
    // SteamKit2 reference: no padding tail en el struct real.
    expect(packet.length).toBe(160)

    // EMsg (offset 0..3): 1304 (0x0518)
    expect(packet.readUInt32LE(0)).toBe(EMSG.CHANNEL_ENCRYPT_RESPONSE)

    // targetJob (offset 4..11): 0xFFFFFFFFFFFFFFFF (-1) — se ecoa del request
    expect(packet.readBigUInt64LE(4)).toBe(0xffffffffffffffffn)
    // sourceJob (offset 12..19): 0xFFFFFFFFFFFFFFFF (-1) — se ecoa del request
    expect(packet.readBigUInt64LE(12)).toBe(0xffffffffffffffffn)

    // protocol (offset 20..23): 1
    expect(packet.readUInt32LE(20)).toBe(1)

    // keySize (offset 24..27): 128
    expect(packet.readUInt32LE(24)).toBe(128)

    // encrypted key (offset 28..155): all 0xab
    expect(packet.subarray(28, 156).equals(encrypted)).toBe(true)

    // CRC32 (offset 156..159): CRC32 of `encrypted`
    // CRC32(0xab repeated 128×) = 0x46D8C29A (1188610714)
    expect(packet.readUInt32LE(156)).toBe(0x46d8c29a)
  })

  it('echos targetJobId and sourceJobId from request when provided', () => {
    const encrypted = Buffer.alloc(128, 0xcd)
    const packet = encodeChannelEncryptResponse(
      encrypted,
      42n,   // targetJobId echoes request.SourceJobID
      123n,  // sourceJobId echoes request.TargetJobID
    )
    expect(packet.readBigUInt64LE(4)).toBe(42n)
    expect(packet.readBigUInt64LE(12)).toBe(123n)
  })

  it('rejects non-128-byte encrypted key', () => {
    expect(() => encodeChannelEncryptResponse(Buffer.alloc(64))).toThrow(/128 bytes/)
    expect(() => encodeChannelEncryptResponse(Buffer.alloc(200))).toThrow(/128 bytes/)
  })
})

describe('cm-protocol — ExtendedProtobuf body', () => {
  it('encodes EMsg with high-bit flag set', () => {
    const fields = Buffer.from([0x08, 0x01]) // some proto fields
    const body = encodeExtendedProtobufBody(EMSG.CLIENT_LOGON, 0xffffffffffffffffn, fields)
    // First varint should be 701 | 0x80000000 = 2147484349
    const firstByte = body[0]
    expect(firstByte).toBeGreaterThan(0x80) // varint takes multiple bytes
    // Decode varint
    let result = 0n
    let shift = 0n
    let off = 0
    while (true) {
      const b = body[off++]
      result |= BigInt(b & 0x7f) << shift
      if ((b & 0x80) === 0) break
      shift += 7n
    }
    expect(result).toBe(2147484349n) // 0x800002BD
  })

  it('round-trips a small body and preserves tail', () => {
    const fields = Buffer.from([0x08, 0x05, 0x10, 0xff])
    const body = encodeExtendedProtobufBody(EMSG.CLIENT_HEARTBEAT, 1n, fields)
    // Decode until we find the field bytes
    let off = 0
    // Skip first varint (EMsg)
    while ((body[off] & 0x80) !== 0) off++
    off++
    // Skip second varint (JobId)
    while ((body[off] & 0x80) !== 0) off++
    off++
    // Remaining should be the original fields
    expect(body.subarray(off).equals(fields)).toBe(true)
  })

  it('rejects out-of-range EMsg (>u31)', () => {
    expect(() =>
      encodeExtendedProtobufBody(0x80000000, 0n, Buffer.alloc(0)),
    ).toThrow(/u31/)
  })

  it('rejects negative JobId', () => {
    expect(() =>
      encodeExtendedProtobufBody(701, -1n, Buffer.alloc(0)),
    ).toThrow(/non-negative/)
  })
})

describe('cm-protocol — anonymous log on fields', () => {
  it('encodes the 4 expected fields with anonymous-safe defaults', () => {
    const fields = encodeAnonymousLogOnFields({})
    // Field 2: varint(2<<3|0) + varint(65580) = (16, 0xfa, 0xff, 0x07)
    //   tag(2,0) = 0x10 = 16
    //   65580 in varint: 0xfa 0xff 0x07 (since 65580 = 0x1000C → 0xfa 0xff 0x07)
    expect(fields[0]).toBe(0x10) // field 2 varint tag
    // Field 14: varint(14<<3|2) + varint("english".length) + "english" bytes
    expect(fields[4]).toBe(0x72) // field 14 tag = (14<<3)|2 = 0x72
    expect(fields[5]).toBe(7) // 'english' length
    // Field 18: varint(18<<3|0) + varint(10)
    const tag18 = fields.indexOf(0x90) // (18<<3)|0 = 0x90
    expect(tag18).toBeGreaterThanOrEqual(0)
    // Field 23: varint(23<<3|2) = 186 varint [0xba,0x01] (2 bytes).
    const tag23 = fields.indexOf(0xba) // first 0xba byte = tag(23,2) start
    expect(tag23).toBeGreaterThanOrEqual(0)
    const machineName = 'Y-core'
    const machineStart = tag23 + 2
    expect(fields[machineStart]).toBe(machineName.length)
    expect(
      fields
        .subarray(machineStart + 1, machineStart + 1 + machineName.length)
        .toString('utf-8'),
    ).toBe(machineName)
  })

  it('truncates machine_name to 64 chars', () => {
    const longName = 'a'.repeat(200)
    const fields = encodeAnonymousLogOnFields({ machineName: longName })
    // Find tag 23 marker; the length byte should be ≤ 64.
    const tag23 = fields.indexOf(0xba)
    const lenByte = fields[tag23 + 2]
    expect(lenByte).toBeLessThanOrEqual(64)
  })
})

describe('cm-protocol — log on response decoder', () => {
  it('decodes eresult=1 with no account/session info', () => {
    // Build a minimal LogOnResponse with just field 1 (uint32 varint).
    const fields = Buffer.concat([Buffer.from([0x08, 0x01])]) // tag(1,0)=0x08, value=1
    const parsed = decodeLogOnResponseFields(fields)
    expect(parsed.eresult).toBe(ERESULT_OK)
    expect(parsed.accountId).toBeNull()
    expect(parsed.sessionId).toBeNull()
  })

  it('decodes eresult=5 (InvalidLogin)', () => {
    const fields = Buffer.from([0x08, 0x05])
    const parsed = decodeLogOnResponseFields(fields)
    expect(parsed.eresult).toBe(5)
  })
})

describe('cm-protocol — request/result decoders (EMsg actuales 1303/1305)', () => {
  it('decodes ChannelEncryptRequest (EMsg=1303, protocol=1, universe=1)', () => {
    // Layout: [u32 EMsg=1303][u64 targetJob][u64 sourceJob][u32 protocol=1][u32 universe=1]
    const fake = Buffer.concat([
      Buffer.from([0x17, 0x05, 0x00, 0x00]), // EMsg=1303 LE (0x0517)
      Buffer.alloc(8), // targetJob
      Buffer.alloc(8), // sourceJob
      Buffer.from([0x01, 0x00, 0x00, 0x00]), // protocol=1
      Buffer.from([0x01, 0x00, 0x00, 0x00]), // universe=1
    ])
    const r = decodeChannelEncryptRequest(fake)
    expect(r.emsg).toBe(1303)
    expect(r.protocol).toBe(1)
    expect(r.universe).toBe(1)
  })

  it('decodes ChannelEncryptResult result=1 (EMsg=1305)', () => {
    // Layout: [u32 EMsg=1305][u64 targetJob][u64 sourceJob][u32 result=1]
    const fake = Buffer.concat([
      Buffer.from([0x19, 0x05, 0x00, 0x00]), // EMsg=1305 LE (0x0519)
      Buffer.alloc(8),
      Buffer.alloc(8),
      Buffer.from([0x01, 0x00, 0x00, 0x00]), // result=1
    ])
    const r = decodeChannelEncryptResult(fake)
    expect(r.emsg).toBe(1305)
    expect(r.result).toBe(1)
  })

  it('rejects too-short ChannelEncryptRequest', () => {
    const tooShort = Buffer.alloc(20)
    expect(() => decodeChannelEncryptRequest(tooShort)).toThrow(/insufficient/)
  })
})
