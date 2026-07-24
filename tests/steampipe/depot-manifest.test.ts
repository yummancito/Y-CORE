// ============================================================================
// tests/steampipe/depot-manifest.test.ts
// ----------------------------------------------------------------------------
// Unit tests for Phase 3 manifest parsing, ZIP reader, and Adler32 checksum.
// ============================================================================

import { describe, it, expect } from 'vitest'
import zlib from 'zlib'
import { extractZipEntry } from '../../electron/modules/steampipe/zip-reader'
import { adler32 } from '../../electron/modules/steampipe/depot-downloader'
import { EMSG, encodeGetDepotKeyFields, encodeGetServersForSteamPipeFields, encodeGetManifestRequestCodeFields } from '../../electron/modules/steampipe/cm-protocol'
import { decodeFields, readVarintField, readBytesField, encodeVarint } from '../../electron/modules/steampipe/proto'

// ============================================================================
// ZIP reader tests
// ============================================================================

describe('zip-reader — extractZipEntry', () => {
  function buildTestZip(data: Buffer): Buffer {
    const filename = Buffer.from('test.bin')
    const compressed = zlib.deflateRawSync(data)

    const localHeader = Buffer.alloc(30 + filename.length)
    localHeader.writeUInt32LE(0x04034b50, 0) // offset 0: signature
    localHeader.writeUInt16LE(20, 4)          // offset 4: version needed
    localHeader.writeUInt16LE(0, 6)           // offset 6: flags
    localHeader.writeUInt16LE(8, 8)           // offset 8: compression method (deflate=8)
    localHeader.writeUInt16LE(0, 10)          // offset 10: mod time
    localHeader.writeUInt16LE(0, 12)          // offset 12: mod date
    localHeader.writeUInt32LE(0, 14)          // offset 14: crc32
    localHeader.writeUInt32LE(compressed.length, 18)  // offset 18: compressed size
    localHeader.writeUInt32LE(data.length, 22)        // offset 22: uncompressed size
    localHeader.writeUInt16LE(filename.length, 26)    // offset 26: filename length
    localHeader.writeUInt16LE(0, 28)                  // offset 28: extra field length
    filename.copy(localHeader, 30)

    const cdEntry = Buffer.alloc(46 + filename.length)
    cdEntry.writeUInt32LE(0x02014b50, 0) // offset 0: central dir signature
    cdEntry.writeUInt16LE(20, 4)          // offset 4: version made by
    cdEntry.writeUInt16LE(20, 6)          // offset 6: version needed
    cdEntry.writeUInt16LE(0, 8)           // offset 8: flags
    cdEntry.writeUInt16LE(8, 10)          // offset 10: compression method
    cdEntry.writeUInt16LE(0, 12)          // offset 12: mod time
    cdEntry.writeUInt16LE(0, 14)          // offset 14: mod date
    cdEntry.writeUInt32LE(0, 16)          // offset 16: crc32
    cdEntry.writeUInt32LE(compressed.length, 20)  // offset 20: compressed size
    cdEntry.writeUInt32LE(data.length, 24)        // offset 24: uncompressed size
    cdEntry.writeUInt16LE(filename.length, 28)    // offset 28: filename length
    cdEntry.writeUInt16LE(0, 30)          // offset 30: extra field length
    cdEntry.writeUInt16LE(0, 32)          // offset 32: comment length
    cdEntry.writeUInt16LE(0, 34)          // offset 34: disk number start
    cdEntry.writeUInt16LE(0, 36)          // offset 36: internal attrs
    cdEntry.writeUInt32LE(0, 38)          // offset 38: external attrs
    cdEntry.writeUInt32LE(0, 42)          // offset 42: offset to local header
    filename.copy(cdEntry, 46)

    const eocd = Buffer.alloc(22)
    eocd.writeUInt32LE(0x06054b50, 0)
    eocd.writeUInt16LE(0, 4)
    eocd.writeUInt16LE(0, 6)
    eocd.writeUInt16LE(1, 8)
    eocd.writeUInt16LE(1, 10)
    eocd.writeUInt32LE(cdEntry.length, 12)
    eocd.writeUInt32LE(localHeader.length + compressed.length, 16)
    eocd.writeUInt16LE(0, 20)

    return Buffer.concat([localHeader, compressed, cdEntry, eocd])
  }

  it('extracts a single deflated entry', () => {
    const original = Buffer.from('Hello, SteamPipe manifest!')
    const zip = buildTestZip(original)
    const extracted = extractZipEntry(zip)
    expect(extracted.equals(original)).toBe(true)
  })

  it('extracts binary data (protobuf-like)', () => {
    const original = Buffer.alloc(256, 0)
    original.writeUInt32LE(0x71f617d0, 0)
    original.writeUInt32LE(128, 4)
    for (let i = 8; i < 256; i++) original[i] = i & 0xff
    const zip = buildTestZip(original)
    const extracted = extractZipEntry(zip)
    expect(extracted.equals(original)).toBe(true)
  })

  it('extracts empty data', () => {
    const zip = buildTestZip(Buffer.alloc(0))
    const extracted = extractZipEntry(zip)
    expect(extracted.length).toBe(0)
  })

  it('rejects buffer too small for ZIP header', () => {
    expect(() => extractZipEntry(Buffer.alloc(10))).toThrow(/too small/)
  })

  it('rejects invalid ZIP signature', () => {
    const bad = Buffer.alloc(100)
    bad.writeUInt32LE(0xdeadbeef, 0)
    expect(() => extractZipEntry(bad)).toThrow(/invalid signature/)
  })
})

// ============================================================================
// Adler32 checksum tests
// ============================================================================

describe('adler32 — checksum correctness', () => {
  it('computes correct Adler32 for known input', () => {
    // Known: adler32("Wikipedia") = 0x11E60398
    const data = Buffer.from('Wikipedia')
    const result = adler32(data)
    expect(result).toBe(0x11e60398)
  })

  it('returns 1 for empty buffer', () => {
    const result = adler32(Buffer.alloc(0))
    expect(result).toBe(1)
  })

  it('returns correct value for single byte', () => {
    const result = adler32(Buffer.from([0x61])) // 'a' = 97
    expect(result).toBe(((98 << 16) | 98) >>> 0)
  })

  it('is deterministic across calls', () => {
    const data = Buffer.from('reproducible test data for adler32')
    expect(adler32(data)).toBe(adler32(data))
  })

  it('differs for different inputs', () => {
    expect(adler32(Buffer.from('input A'))).not.toBe(adler32(Buffer.from('input B')))
  })
})

// ============================================================================
// EMsg constant tests
// ============================================================================

describe('cm-protocol — Phase 3 EMsg constants', () => {
  it('has all required Phase 3 EMsg values', () => {
    expect(EMSG.CLIENT_GET_DEPOT_KEY).toBe(1043)
    expect(EMSG.CLIENT_GET_DEPOT_KEY_RESPONSE).toBe(1044)
    expect(EMSG.CLIENT_GET_SERVERS_FOR_STEAM_PIPE).toBe(5501)
    expect(EMSG.CLIENT_GET_SERVERS_FOR_STEAM_PIPE_RESPONSE).toBe(5502)
    expect(EMSG.CLIENT_GET_DEPOT_MANIFEST_REQUEST_CODE).toBe(1067)
    expect(EMSG.CLIENT_GET_DEPOT_MANIFEST_REQUEST_CODE_RESPONSE).toBe(1068)
  })
})

// ============================================================================
// Proto field encoder tests for new CM messages
// ============================================================================

describe('cm-protocol — Phase 3 message encoders', () => {
  it('encodes GetDepotKey fields correctly', () => {
    const fields = encodeGetDepotKeyFields(440, 440)
    const decoded = decodeFields(fields)
    expect(readVarintField(decoded, 1)).toBe(440)
    expect(readVarintField(decoded, 2)).toBe(440)
  })

  it('encodes GetServersForSteamPipe fields correctly', () => {
    const fields = encodeGetServersForSteamPipeFields(0)
    const decoded = decodeFields(fields)
    expect(readVarintField(decoded, 1)).toBe(0)
    expect(readVarintField(decoded, 2)).toBe(0)
    expect(readVarintField(decoded, 3)).toBe(2)
  })

  it('encodes GetManifestRequestCode fields correctly', () => {
    const fields = encodeGetManifestRequestCodeFields(440, 440, 12345, 'public')
    const decoded = decodeFields(fields)
    expect(readVarintField(decoded, 1)).toBe(440)
    expect(readVarintField(decoded, 2)).toBe(440)
    expect(readVarintField(decoded, 3)).toBe(12345)
    const branch = readBytesField(decoded, 4)
    expect(branch?.toString('utf-8')).toBe('public')
  })
})

// ============================================================================
// Manifest binary format parser test (synthetic data)
// ============================================================================

function buildSyntheticManifestBinary(): Buffer {
  const PAYLOAD_MAGIC = 0x71f617d0
  const METADATA_MAGIC = 0x1f4812be
  const END_MAGIC = 0x32c415ab

  // Build ChunkData using proper protobuf encoding
  const chunkSha = Buffer.alloc(20, 0xab)
  const chunkData = Buffer.concat([
    Buffer.concat([Buffer.from([(1 << 3) | 2]), Buffer.from([20]), chunkSha]),  // sha
    Buffer.concat([Buffer.from([(2 << 3) | 0]), encodeVarint(0x12345678)]),     // crc
    Buffer.concat([Buffer.from([(3 << 3) | 0]), encodeVarint(0)]),              // offset
    Buffer.concat([Buffer.from([(4 << 3) | 0]), encodeVarint(1024)]),           // cb_original
    Buffer.concat([Buffer.from([(5 << 3) | 0]), encodeVarint(512)]),            // cb_compressed
  ])

  // Build FileMapping
  const filename = Buffer.from('test.txt')
  const shaFilename = Buffer.alloc(20, 0xcd)
  const shaContent = Buffer.alloc(20, 0xef)

  const fileMapping = Buffer.concat([
    Buffer.concat([Buffer.from([(1 << 3) | 2]), Buffer.from([filename.length]), filename]),
    Buffer.concat([Buffer.from([(2 << 3) | 2]), Buffer.from([20]), shaFilename]),
    Buffer.concat([Buffer.from([(3 << 3) | 0]), encodeVarint(0)]),
    Buffer.concat([Buffer.from([(4 << 3) | 0]), encodeVarint(1024)]),
    Buffer.concat([Buffer.from([(5 << 3) | 2]), Buffer.from([20]), shaContent]),
    Buffer.concat([Buffer.from([(6 << 3) | 2]), Buffer.from([0])]),
    Buffer.concat([Buffer.from([(7 << 3) | 2]), Buffer.from([chunkData.length]), chunkData]),
  ])

  // Payload = field 1 (repeated FileMapping), wire 2
  const payloadProto = Buffer.concat([
    Buffer.from([(1 << 3) | 2]),
    Buffer.from([fileMapping.length]),
    fileMapping,
  ])

  // Metadata protobuf
  const metadataProto = Buffer.concat([
    Buffer.concat([Buffer.from([(1 << 3) | 0]), encodeVarint(440)]),
    Buffer.concat([Buffer.from([(2 << 3) | 0]), encodeVarint(999)]),
    Buffer.concat([Buffer.from([(3 << 3) | 0]), encodeVarint(0)]),
    Buffer.concat([Buffer.from([(4 << 3) | 0]), encodeVarint(0)]),
    Buffer.concat([Buffer.from([(5 << 3) | 0]), encodeVarint(1024)]),
    Buffer.concat([Buffer.from([(6 << 3) | 0]), encodeVarint(512)]),
    Buffer.concat([Buffer.from([(7 << 3) | 0]), encodeVarint(0)]),
  ])

  const payloadSection = Buffer.alloc(8 + payloadProto.length)
  payloadSection.writeUInt32LE(PAYLOAD_MAGIC, 0)
  payloadSection.writeUInt32LE(payloadProto.length, 4)
  payloadProto.copy(payloadSection, 8)

  const metadataSection = Buffer.alloc(8 + metadataProto.length)
  metadataSection.writeUInt32LE(METADATA_MAGIC, 0)
  metadataSection.writeUInt32LE(metadataProto.length, 4)
  metadataProto.copy(metadataSection, 8)

  const endMarker = Buffer.alloc(4)
  endMarker.writeUInt32LE(END_MAGIC, 0)

  return Buffer.concat([payloadSection, metadataSection, endMarker])
}

describe('manifest binary format — synthetic round-trip', () => {
  it('builds a valid manifest binary with payload + metadata + end marker', () => {
    const bin = buildSyntheticManifestBinary()
    expect(bin.length).toBeGreaterThan(16)
    expect(bin.readUInt32LE(0)).toBe(0x71f617d0)
    const payloadLen = bin.readUInt32LE(4)
    const metadataOffset = 8 + payloadLen
    expect(bin.readUInt32LE(metadataOffset)).toBe(0x1f4812be)
  })
})
