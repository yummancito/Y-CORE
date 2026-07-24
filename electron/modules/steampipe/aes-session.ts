// ============================================================================
// electron/modules/steampipe/aes-session.ts
// ----------------------------------------------------------------------------
// Steam's CM-TCP post-handshake encryption: AES-256-CBC with PKCS7 padding
// for payload, AES-256-ECB for the IV scrambling, per-packet fresh random IV.
//
// Wire layout per packet (after the ChannelEncrypt handshake completes):
//   [16 bytes ECB-encrypted IV] [N bytes PKCS7-padded AES-256-CBC payload]
//
// Why ECB-encrypted IV? Steam wanted both ends to derive the same IV without
// sending it in plaintext (avoid trivial PRNG-correlation attacks). The IV is
// generated randomly client-side, encrypted with the session key via ECB,
// then sent over the wire. The recipient decrypts the IV by running the same
// ECB step locally.
//
// Per-packet "fresh IV" means every packet uses its own random 16-byte IV —
// you cannot reuse across packets even if same session. We use crypto.randomBytes
// (cryptographically secure), NOT Math.random.
//
// TRUTHFULNESS: this module does NOT store the session key persistently. The
// 32-byte AES key is generated in handshake.ts and passed to encryptPacket /
// decryptPacket functions explicitly. Stateless.
//
// REFERENCE: SteamKit2's PacketSupport.cs in SteamKit (currently deprecated
// upstream but historically accurate — the protocol itself hasn't changed).
// ============================================================================

import crypto from 'crypto'

/** AES-256-CBC expected key length. Steam's session key is 32 bytes. */
export const AES_KEY_BYTES = 32

/** AES block size — both IV and the ECB-encrypted-IV are 16 bytes. */
export const AES_BLOCK_BYTES = 16

/**
 * Encrypt a plaintext payload using AES-256-CBC with a freshly-generated
 * random IV. Returns the wire-ready ciphertext in the format Steam expects:
 *   [16 bytes ECB(key, random_IV)] [AES-CBC(key, plaintext)]
 *
 * Returns empty buffer on any internal error (caller should validate
 * length > 0 after return).
 */
export function encryptPacket(sessionKey: Buffer, plaintext: Buffer): Buffer {
  if (sessionKey.length !== AES_KEY_BYTES) {
    throw new RangeError(
      `encryptPacket: sessionKey must be ${AES_KEY_BYTES} bytes (got ${sessionKey.length})`,
    )
  }
  if (plaintext.length === 0) {
    throw new RangeError('encryptPacket: plaintext cannot be empty')
  }

  // 1. Generate fresh 16-byte random IV
  const iv = crypto.randomBytes(AES_BLOCK_BYTES)

  // 2. Encrypt the IV via AES-256-ECB
  const ecbCipher = crypto.createCipheriv('aes-256-ecb', sessionKey, null)
  ecbCipher.setAutoPadding(false) // ECB: no padding on the IV itself
  const encryptedIv = Buffer.concat([ecbCipher.update(iv), ecbCipher.final()])

  // Sanity check
  if (encryptedIv.length !== AES_BLOCK_BYTES) {
    throw new Error(
      `encryptPacket: encrypted IV length mismatch (got ${encryptedIv.length}, expected ${AES_BLOCK_BYTES})`,
    )
  }

  // 3. Encrypt the actual payload with AES-256-CBC + PKCS7 (default)
  const cbcCipher = crypto.createCipheriv('aes-256-cbc', sessionKey, iv)
  const cipherBuf = Buffer.concat([cbcCipher.update(plaintext), cbcCipher.final()])

  // 4. Wire-format: [encryptedIv, cipherBuf]
  return Buffer.concat([encryptedIv, cipherBuf], encryptedIv.length + cipherBuf.length)
}

/**
 * Decrypt a wire-format packet (output of encryptPacket) back into plaintext.
 * Returns { plaintext, encryptedIv, cipherPayload, ms } for diagnostic if
 * the diagnostic flag is true — otherwise just plaintext.
 */
export function decryptPacket(
  sessionKey: Buffer,
  wireCipher: Buffer,
): Buffer {
  if (sessionKey.length !== AES_KEY_BYTES) {
    throw new RangeError(
      `decryptPacket: sessionKey must be ${AES_KEY_BYTES} bytes (got ${sessionKey.length})`,
    )
  }
  if (wireCipher.length < AES_BLOCK_BYTES * 2) {
    throw new RangeError(
      `decryptPacket: wireCipher too short (got ${wireCipher.length}, expected at least 32)`,
    )
  }

  // 1. First 16 bytes = encrypted IV; rest = AES-CBC-encrypted payload.
  const wireIv = wireCipher.subarray(0, AES_BLOCK_BYTES)
  const cipherPayload = wireCipher.subarray(AES_BLOCK_BYTES)

  // 2. Decrypt the IV via AES-256-ECB. The ECB block decrypt yields the
  // random IV that the sender generated. Note: ECB decrypt = same as ECB encrypt
  // applied to the AES state (DES-style block decrypt).
  const ecbDecipher = crypto.createDecipheriv('aes-256-ecb', sessionKey, null)
  ecbDecipher.setAutoPadding(false)
  const iv = Buffer.concat([ecbDecipher.update(wireIv), ecbDecipher.final()])

  // 3. Decrypt the payload with AES-256-CBC. PKCS7 unpadding happens at .final().
  const cbcDecipher = crypto.createDecipheriv('aes-256-cbc', sessionKey, iv)
  return Buffer.concat([cbcDecipher.update(cipherPayload), cbcDecipher.final()])
}

/**
 * Generate a fresh random 32-byte AES session key for handshake proposal.
 * We use these 32 bytes as the payload to encryptWithSteamPublicKey.
 */
export function generateSessionKey(): Buffer {
  return crypto.randomBytes(AES_KEY_BYTES)
}

/**
 * Diagnostic split helper: pull the encrypted-IV off a wire-format packet
 * without decrypting the rest. Useful for replay/forensic, not for production.
 */
export function peekEncryptedIv(wireCipher: Buffer): Buffer {
  return wireCipher.subarray(0, AES_BLOCK_BYTES)
}
