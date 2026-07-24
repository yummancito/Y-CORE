// ============================================================================
// electron/modules/steampipe/cdn-client.ts
// ----------------------------------------------------------------------------
// Phase 3 — HTTP CDN client for downloading depot manifests and chunks.
//
// Steam's content delivery uses plain HTTP to serve:
//   1. Manifests: depot/{depotId}/manifest/{manifestId}/5/{requestCode}
//   2. Chunks:    depot/{depotId}/chunk/{chunkIdHex}
//
// Manifests arrive as ZIP archives (single deflated entry → protobuf sections).
// Chunks arrive as raw deflate-compressed data (no encryption at CDN level).
//
// Filenames in manifests may be AES-256-CBC encrypted. When
// `filenames_encrypted=true`, we decrypt using the depot key.
//
// TRUTHFULNESS: this module makes unauthenticated HTTP requests to Valve's CDN.
// No tickets, no auth tokens, no payment-server interaction.
// ============================================================================

import crypto from 'crypto'
import http from 'http'
import https from 'https'
import { logger } from '../../logger'
import { extractZipEntry } from './zip-reader'
import {
  decodeFields,
  readVarintField,
  readBytesField,
} from './proto'
import type { CdnServerEntry, DepotManifest, DepotFileData, DepotChunkData } from './types'

const MANIFEST_VERSION = 5
const DEFAULT_TIMEOUT_MS = 30000

// ============================================================================
// HTTP GET helper
// ============================================================================

function httpGet(url: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http
    const req = lib.get(url, { timeout: timeoutMs }, (res) => {
      if (res.statusCode !== 200) {
        res.resume()
        reject(new Error(`HTTP ${res.statusCode} for ${url}`))
        return
      }
      const chunks: Buffer[] = []
      res.on('data', (chunk: Buffer) => chunks.push(chunk))
      res.on('end', () => resolve(Buffer.concat(chunks)))
      res.on('error', reject)
    })
    req.on('timeout', () => {
      req.destroy(new Error(`Timeout downloading ${url}`))
    })
    req.on('error', reject)
  })
}

// ============================================================================
// Manifest download + parse
// ============================================================================

/**
 * Download and parse a depot manifest from a CDN server.
 * If depotKey is provided and filenames are encrypted, decrypts filenames.
 */
export async function downloadManifest(
  cdn: CdnServerEntry,
  depotId: number,
  manifestId: number | bigint,
  requestCode: number | bigint = 0,
  depotKey?: Buffer | null,
): Promise<DepotManifest> {
  const manifestIdStr = typeof manifestId === 'bigint' ? manifestId.toString() : String(manifestId)
  const requestCodeStr = requestCode ? `/${requestCode}` : ''
  const url = `http://${cdn.host}:${cdn.port}/depot/${depotId}/manifest/${manifestIdStr}/${MANIFEST_VERSION}${requestCodeStr}`

  logger.info(`[cdn] downloading manifest: ${url}`, 'steampipe')

  const zipData = await httpGet(url)
  logger.info(`[cdn] manifest ZIP received: ${zipData.length} bytes`, 'steampipe')

  const manifestBin = extractZipEntry(zipData)
  logger.info(`[cdn] manifest protobuf extracted: ${manifestBin.length} bytes`, 'steampipe')

  // parseManifestBinary retorna el manifest parseado + los buffers crudos
  // de cada sección, para que la validación CRC no tenga que re-parsear el
  // binario (evita el doble walk del ZIP→protobuf).
  const { manifest, payloadBuf } = parseManifestBinary(manifestBin)

  // Validate payload integrity via CRC32 (crc_clear when filenames
  // are NOT encrypted; crc_encrypted when they are).
  const computedCrc = crc32(payloadBuf)
  const expectedCrc = manifest.filenamesEncrypted
    ? manifest.encryptedCrc
    : manifest.crcClear
  if (expectedCrc !== 0 && computedCrc !== expectedCrc) {
    logger.warn(
      `[cdn] manifest CRC mismatch: computed=0x${computedCrc.toString(16)} expected=0x${expectedCrc.toString(16)} (filenamesEncrypted=${manifest.filenamesEncrypted})`,
      'steampipe',
    )
  }

  // Decrypt filenames if encrypted and depot key is available.
  if (manifest.filenamesEncrypted && depotKey && depotKey.length === 32) {
    decryptManifestFilenames(manifest, depotKey)
  }

  return manifest
}

// ============================================================================
// AES-256-CBC filename decryption (SteamKit2's DecryptFilenames)
// ============================================================================

/**
 * Decrypt encrypted filenames in a depot manifest.
 *
 * SteamKit2's DecryptFilenames uses AES-256-CBC with a special IV derivation:
 *   - First 16 bytes: ECB-decrypted to get the IV
 *   - Remaining bytes: CBC-decrypted with PKCS7 padding
 *
 * The depot key is used as both the AES key and the ECB key for IV derivation.
 */
function decryptManifestFilenames(manifest: DepotManifest, depotKey: Buffer): void {
  for (const file of manifest.files) {
    if (file.filename && isBase64(file.filename)) {
      const decrypted = decryptEncryptedName(file.filename, depotKey)
      if (decrypted) {
        file.filename = decrypted
      }
    }
  }

  manifest.filenamesEncrypted = false
}

/**
 * Decrypt a single encrypted filename.
 * Format: base64(AES-ECB(first 16 bytes) + AES-CBC(rest))
 */
function decryptEncryptedName(encryptedName: string, depotKey: Buffer): string | null {
  try {
    const decoded = Buffer.from(encryptedName, 'base64')
    if (decoded.length < 16) return null

    // First 16 bytes: ECB-decrypt to get IV.
    const ivEncrypted = decoded.subarray(0, 16)
    const ecb = crypto.createDecipheriv('aes-256-ecb', depotKey, null)
    ecb.setAutoPadding(false)
    const iv = Buffer.concat([ecb.update(ivEncrypted), ecb.final()])

    // Remaining bytes: CBC-decrypt with PKCS7 padding.
    const cbc = crypto.createDecipheriv('aes-256-cbc', depotKey, iv)
    const decrypted = Buffer.concat([cbc.update(decoded.subarray(16)), cbc.final()])

    // Remove trailing null byte and convert to string.
    let end = decrypted.length
    while (end > 0 && decrypted[end - 1] === 0) end--
    return decrypted.subarray(0, end).toString('utf-8')
  } catch {
    return null
  }
}

/** Check if a string looks like base64 (encrypted filenames are base64-encoded). */
function isBase64(str: string): boolean {
  return /^[A-Za-z0-9+/]+=*$/.test(str) && str.length > 20
}

// ============================================================================
// Manifest binary format parser
// ============================================================================

/**
 * Parse the manifest binary, returning the parsed DepotManifest AND the
 * raw section buffers so downstream code (CRC validation) doesn't need to
 * re-walk the binary.
 */
function parseManifestBinary(data: Buffer): {
  manifest: DepotManifest
  payloadBuf: Buffer
  metadataBuf: Buffer
} {
  const PAYLOAD_MAGIC = 0x71f617d0
  const METADATA_MAGIC = 0x1f4812be
  const SIGNATURE_MAGIC = 0x1b81b817
  const END_MAGIC = 0x32c415ab

  let payload: Buffer | null = null
  let metadata: Buffer | null = null
  let offset = 0

  while (offset + 8 <= data.length) {
    const magic = data.readUInt32LE(offset)
    offset += 4

    if (magic === END_MAGIC) break

    if (magic === PAYLOAD_MAGIC || magic === METADATA_MAGIC || magic === SIGNATURE_MAGIC) {
      const length = data.readUInt32LE(offset)
      offset += 4
      if (offset + length > data.length) {
        throw new Error(`Manifest section length ${length} exceeds buffer at offset ${offset}`)
      }
      const sectionData = data.subarray(offset, offset + length)
      offset += length

      if (magic === PAYLOAD_MAGIC) payload = sectionData
      else if (magic === METADATA_MAGIC) metadata = sectionData
    } else {
      throw new Error(`Unknown manifest magic 0x${magic.toString(16)} at offset ${offset - 4}`)
    }
  }

  if (!payload || !metadata) {
    throw new Error('Manifest missing required sections (payload or metadata)')
  }

  return { manifest: parseManifestSections(payload, metadata), payloadBuf: payload, metadataBuf: metadata }
}

// ============================================================================
// Protobuf section parsers — handles REPEATED fields correctly
// ============================================================================

function parseManifestSections(payloadBuf: Buffer, metadataBuf: Buffer): DepotManifest {
  const metaFields = decodeFields(metadataBuf)
  const depotId = (readVarintField(metaFields, 1) as number) ?? 0
  const manifestGidRaw = readVarintField(metaFields, 2)
  const manifestGid = typeof manifestGidRaw === 'bigint' ? Number(manifestGidRaw) : (manifestGidRaw ?? 0) as number
  const creationTime = (readVarintField(metaFields, 3) as number) ?? 0
  const filenamesEncrypted = (readVarintField(metaFields, 4) as number) === 1
  const totalUncompressedSize = readBigField(metaFields, 5)
  const totalCompressedSize = readBigField(metaFields, 6)
  const encryptedCrc = (readVarintField(metaFields, 7) as number) ?? 0
  const crcClear = (readVarintField(metaFields, 8) as number) ?? 0

  // Parse payload (files + chunks).
  const outerFields = decodeFields(payloadBuf)
  const files: DepotFileData[] = []
  const uniqueChunks = new Map<string, DepotChunkData>()

  // Iterate over ALL field-1 entries (protobuf repeated message fields).
  for (const field of outerFields) {
    if (field.fieldNumber === 1 && field.wireType === 2) {
      const mappingBody = field.value as Buffer
      try {
        const file = parseFileMapping(mappingBody)
        files.push(file)
        for (const chunk of file.chunks) {
          const key = chunk.sha.toString('hex')
          if (!uniqueChunks.has(key)) {
            uniqueChunks.set(key, chunk)
          }
        }
      } catch (err) {
        logger.warn(`[cdn] failed to parse file mapping: ${(err as Error).message}`, 'steampipe')
      }
    }
  }

  return {
    depotId,
    manifestGid,
    creationTime,
    filenamesEncrypted,
    totalUncompressedSize,
    totalCompressedSize,
    encryptedCrc,
    crcClear,
    files,
    uniqueChunks,
  }
}

function parseFileMapping(body: Buffer): DepotFileData {
  const fields = decodeFields(body)
  const filename = readBytesField(fields, 1)?.toString('utf-8') ?? ''
  const shaFilename = readBytesField(fields, 2) ?? Buffer.alloc(0)
  const flags = (readVarintField(fields, 3) as number) ?? 0
  const size = readBigField(fields, 4)
  const shaContent = readBytesField(fields, 5) ?? Buffer.alloc(20)
  const linkTarget = readBytesField(fields, 6)?.toString('utf-8') ?? ''

  const chunks: DepotChunkData[] = []
  for (const field of fields) {
    if (field.fieldNumber === 7 && field.wireType === 2) {
      const chunkBody = field.value as Buffer
      try {
        chunks.push(parseChunkData(chunkBody))
      } catch (err) {
        logger.warn(`[cdn] failed to parse chunk data: ${(err as Error).message}`, 'steampipe')
      }
    }
  }

  return { filename, shaFilename, flags, size, shaContent, linkTarget, chunks }
}

function parseChunkData(body: Buffer): DepotChunkData {
  const fields = decodeFields(body)
  return {
    sha: readBytesField(fields, 1) ?? Buffer.alloc(20),
    crc: (readVarintField(fields, 2) as number) ?? 0,
    offset: readBigField(fields, 3),
    cbOriginal: readBigField(fields, 4),
    cbCompressed: readBigField(fields, 5),
  }
}

// ============================================================================
// Chunk download + decompress
// ============================================================================

export async function downloadChunk(
  cdn: CdnServerEntry,
  depotId: number,
  chunkId: Buffer,
  expectedUncompressed: number,
): Promise<Buffer> {
  const chunkIdHex = chunkId.toString('hex')
  const url = `http://${cdn.host}:${cdn.port}/depot/${depotId}/chunk/${chunkIdHex}`
  const compressedData = await httpGet(url)

  const zlib = await import('zlib')
  try {
    return zlib.inflateRawSync(compressedData)
  } catch {
    try {
      return zlib.inflateSync(compressedData)
    } catch {
      if (compressedData.length === expectedUncompressed) {
        return compressedData
      }
      throw new Error(
        `Chunk decompression failed: expected ${expectedUncompressed} bytes, got ${compressedData.length} compressed`,
      )
    }
  }
}

// ============================================================================
// Helpers
// ============================================================================

function readBigField(fields: ReturnType<typeof decodeFields>, number: number): number {
  const v = readVarintField(fields, number)
  if (typeof v === 'bigint') return Number(v)
  return (v as number) ?? 0
}

// CRC32 (used for manifest payload integrity validation)
let _crc32Table: Uint32Array | null = null
function crc32(buf: Buffer): number {
  if (!_crc32Table) {
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
  }
  let crc = 0xffffffff
  for (let i = 0; i < buf.length; ++i) {
    crc = (_crc32Table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8)) >>> 0
  }
  return (crc ^ 0xffffffff) >>> 0
}
