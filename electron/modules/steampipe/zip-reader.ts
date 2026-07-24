// ============================================================================
// electron/modules/steampipe/zip-reader.ts
// ----------------------------------------------------------------------------
// Minimal in-memory ZIP reader for Steam depot manifests.
//
// Steam CDN returns depot manifests as ZIP archives containing a single
// deflated entry. We implement a minimal reader instead of adding a
// dependency — ZIP format is straightforward for single-entry archives.
//
// ZIP local file header format (30 bytes + filename + extra):
//   [4] signature 0x04034b50
//   [2] version needed
//   [2] general purpose bit flag
//   [2] compression method (8 = deflate)
//   [2] last mod time
//   [2] last mod date
//   [4] crc32
//   [4] compressed size
//   [4] uncompressed size
//   [2] filename length
//   [2] extra field length
//   [N] filename
//   [M] extra field
//   [...] compressed data
// ============================================================================

import zlib from 'zlib'

const LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50
const COMPRESSION_DEFLATE = 8

/**
 * Extract the first (and only) entry from a ZIP buffer.
 * Returns the uncompressed data as a Buffer.
 *
 * Throws on invalid ZIP signature, unsupported compression, or corrupt data.
 */
export function extractZipEntry(zipData: Buffer): Buffer {
  if (zipData.length < 30) {
    throw new Error('zip-reader: buffer too small for ZIP header')
  }

  // Read local file header.
  const signature = zipData.readUInt32LE(0)
  if (signature !== LOCAL_FILE_HEADER_SIGNATURE) {
    throw new Error(
      `zip-reader: invalid signature 0x${signature.toString(16)} (expected 0x${LOCAL_FILE_HEADER_SIGNATURE.toString(16)})`,
    )
  }

  const compressionMethod = zipData.readUInt16LE(8)
  const compressedSize = zipData.readUInt32LE(18)
  const uncompressedSize = zipData.readUInt32LE(22)
  const filenameLength = zipData.readUInt16LE(26)
  const extraFieldLength = zipData.readUInt16LE(28)

  const dataStart = 30 + filenameLength + extraFieldLength

  if (compressionMethod === 0) {
    // Stored (no compression) — return slice directly.
    return zipData.subarray(dataStart, dataStart + compressedSize)
  }

  if (compressionMethod !== COMPRESSION_DEFLATE) {
    throw new Error(
      `zip-reader: unsupported compression method ${compressionMethod} (only deflate=8 supported)`,
    )
  }

  const compressedData = zipData.subarray(dataStart, dataStart + compressedSize)

  // Decompress with raw deflate (no zlib header).
  try {
    return zlib.inflateRawSync(compressedData)
  } catch (err) {
    throw new Error(
      `zip-reader: inflate failed (${(err as Error).message}); compressedSize=${compressedSize}, uncompressedSize=${uncompressedSize}`,
    )
  }
}
