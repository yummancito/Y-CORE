// ============================================================================
// electron/modules/steampipe/cm-connection.ts
// ----------------------------------------------------------------------------
// Round-6 — pre/post handshake framing, per reviewer BLOCKER #1.
//
// Steam's CM-TCP socket has TWO distinct wire forms:
//
//   PRE-HANDSHAKE (sessionKey === null):
//     Plaintext RAW struct packets. Each packet is a fixed-size struct
//     identified by its EMsg type at offset 0..3:
//       ChannelEncryptRequest (EMsg=109): [u32 EMsg][u64 target][u64 source][u32 protocol][u32 universe]
//         → 24 bytes
//       ChannelEncryptResult  (EMsg=111): [u32 EMsg][u64 target][u64 source][u32 result]
//         → 24 bytes
//     There is NO u32 length prefix in this mode — bytes stream raw and the
//     caller knows the size from the EMsg type.
//
//   POST-HANDSHAKE (sessionKey !== null):
//     Framed + AES-256-CBC encrypted. Each packet on the wire is:
//       [u32le total_encrypted_segment_length][16-byte ECB-encrypted IV]
//       [N bytes AES-CBC ciphertext]
//
// We dispatch based on whether sessionKey is set. Pre-handshake bytes are
// passed through as raw chunks and the caller (handshake.ts) decides size
// from EMsg. Post-handshake bytes go through the existing u32le+AES decoder.
//
// The handler-attached helpers (`_decodeChannelEncryptRequest`, etc.) that
// were on `(conn as any)` are now exposed as proper public methods on the
// CmConnection interface (issue #5 cleanup).
// ============================================================================

import net from 'net'
import type { CmServer } from './types'
import { decryptPacket, encryptPacket } from './aes-session'

/**
 * Pre-handshake server→client packets we know how to read.
 * Used by the connection to slice received raw bytes into a per-EMsg
 * payload without re-framing by length.
 */
const PRE_HANDSHAKE_EMSG_BY_SIZE: Record<number, number> = {
  109: 24, // ChannelEncryptRequest — 4 (EMsg) + 8 (target) + 8 (source) + 4 (proto) + 4 (universe)
  111: 24, // ChannelEncryptResult  — 4 (EMsg) + 8 (target) + 8 (source) + 4 (result)
}

/** Pre-handshake packet parse result. */
export interface PreHandshakePacket {
  emsg: number
  payload: Buffer
}

export interface CmConnection {
  /** Session key (32 bytes) becomes available after handshake completes. */
  sessionKey: Buffer | null

  /** Read next pre-handshake packet. Caller knows it by EMsg. Returns raw structure. */
  readPreHandshakePacket(timeoutMs?: number): Promise<PreHandshakePacket>
  /** Read next post-handshake packet (AES-decrypted body). */
  readPostHandshakeBuffer(timeoutMs?: number): Promise<Buffer>

  /** Write pre-handshake plaintext bytes (only valid before handshake). */
  writePreHandshakeBuffer(buf: Buffer): void
  /** Write post-handshake (will be AES-CBC + length-prefixed). */
  writePostHandshakeBuffer(buf: Buffer): void

  /** Clean shutdown — emits 'close' event and waits for it. */
  close(): Promise<void>

  /** Diagnostic event hooks. */
  on(event: 'error' | 'close', listener: (err?: Error) => void): void
}

const DEFAULT_CONNECT_TIMEOUT_MS = 15000

/**
 * Connect to a CM server via TCP+TLS.
 */
export function connectToCm(opts: {
  server: CmServer
  hostOverride?: string
  portOverride?: number
  timeoutMs?: number
}): Promise<CmConnection> {
  const host = opts.hostOverride ?? opts.server.host
  const port = opts.portOverride ?? opts.server.port
  const timeoutMs = opts.timeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS

  return new Promise((resolve, reject) => {
    // Steam CM servers on ports 27017/27018 speak RAW TCP, not TLS. The
    // encryption is Steam's own ChannelEncrypt handshake (AES-256-CBC over
    // plain TCP), negotiated after connect — there is NO TLS layer. Using
    // tls.connect() here would hang forever because the server never speaks
    // the TLS handshake. Only the WebSocket CM endpoints (port 443) use TLS.
    const sock = net.connect(
      {
        host,
        port,
      },
      () => {
        const conn: CmConnection = makeConnection(sock)
        resolve(conn)
      },
    )
    sock.setTimeout(timeoutMs)
    sock.on('timeout', () => {
      sock.destroy(new Error(`CM connect timeout (${timeoutMs}ms)`))
    })
    sock.on('error', (err) => reject(err))
  })
}

function makeConnection(sock: net.Socket): CmConnection {
  // Two-state machine: pre-handshake accumulates a single known-size packet and
  // emits when complete; post-handshake reads u32le length prefix then more.
  const state: {
    sessionKey: Buffer | null
    /** Pre-handshake buffer queue (parsed PreHandshakePacket objects). */
    preQueue: PreHandshakePacket[]
    // null = destroy sentinel (reject via the wrapper at line ~265); typed
    // payload = successful read. The destroy path now eagerly fires `(null)`
    // instead of waiting on the 15s setTimeout.
    preWaiters: Array<(p: PreHandshakePacket | null) => void>
    /** Buffer for the in-progress pre-handshake packet (raw bytes). */
    preBuf: Buffer

    /** Post-handshake buffer queue (AES-decrypted bodies). */
    postQueue: Buffer[]
    // null = destroy sentinel (reject via the wrapper at line ~286); Buffer
    // = successful AES-CBC decoded payload.
    postWaiters: Array<(b: Buffer | null) => void>
    pendingLength: number | null
    pendingBuffer: Buffer
    pendingOffset: number
  } = {
    sessionKey: null,
    preQueue: [],
    preWaiters: [],
    preBuf: Buffer.alloc(0),
    postQueue: [],
    postWaiters: [],
    pendingLength: null,
    pendingBuffer: Buffer.alloc(0),
    pendingOffset: 0,
  }

  // Pre-handshake packet assembler. Caller (handshake.ts) provides the EMsg
  // size via lookup; this consumes raw bytes and emits completed packets.
  function ingestPre(chunk: Buffer): void {
    state.preBuf = state.preBuf.length === 0
      ? chunk
      : Buffer.concat([state.preBuf, chunk])
    // Try to extract exactly one packet at a time. EMsg at offset 0..3.
    while (state.preBuf.length >= 4) {
      const emsg = state.preBuf.readUInt32LE(0)
      const size = PRE_HANDSHAKE_EMSG_BY_SIZE[emsg]
      if (size === undefined) {
        // Unknown pre-handshake EMsg: throw instead of advancing; safer to
        // surface to caller than silently consume.
        const err = new Error(
          `ingestPre: unknown pre-handshake EMsg ${emsg} (no fixed-size mapping); buffer head hex=${state.preBuf.subarray(0, 8).toString('hex')}`,
        )
      // Notify every waiter with `null` (Promises reject via the wrapped
      // branch in readPreHandshakePacket), then destroy the socket so the
      // 'data' handler doesn't bubble an unhandled exception. Eager-fire:
      // setting `length = 0` would drop callbacks without invoking them,
      // forcing the 15s setTimeout to reject instead of failing fast.
      while (state.preWaiters.length > 0) state.preWaiters.shift()!(null)
      try {
        sock.destroy(err)
      } catch {
        // best-effort: socket might already be closed by remote for unused-EMsg
      }
      return
      }
      if (state.preBuf.length < size) return
      const packet = state.preBuf.subarray(0, size)
      state.preBuf = state.preBuf.subarray(size)
      const pre: PreHandshakePacket = { emsg, payload: packet }
      if (state.preWaiters.length > 0) {
        state.preWaiters.shift()!(pre)
      } else {
        state.preQueue.push(pre)
      }
    }
  }

  // Post-handshake = length-prefix + AES-CBC decode.
  function ingestPost(chunk: Buffer): void {
    if (state.pendingLength === null) {
      state.pendingBuffer = Buffer.concat([
        state.pendingBuffer.subarray(state.pendingOffset),
        chunk,
      ])
      state.pendingOffset = 0
      if (state.pendingBuffer.length < 4) return
      state.pendingLength = state.pendingBuffer.readUInt32LE(0) + 4
    } else {
      state.pendingBuffer = Buffer.concat([
        state.pendingBuffer.subarray(state.pendingOffset),
        chunk,
      ])
      state.pendingOffset = 0
    }
    while (state.pendingLength !== null && state.pendingBuffer.length >= state.pendingLength) {
      const packet = state.pendingBuffer.subarray(0, state.pendingLength)
      state.pendingBuffer = state.pendingBuffer.subarray(state.pendingLength)
      state.pendingOffset = 0
      let decoded: Buffer
      try {
        decoded = decryptPacket(state.sessionKey!, packet.subarray(4))
      } catch (err) {
        // AES decrypt failure usually means protocol mismatch / rotation / wrong
        // session key. Surface as explicit error to any active waiter, then
        // destroy socket cleanly instead of letting an exception bubble to
        // Node's TCP data handler (round-7 harden). Eager-fire the waiters
        // (same reason as ingestPre) so the Promise rejects instantly instead
        // of waiting for the 15s fallback timeout.
        while (state.postWaiters.length > 0) state.postWaiters.shift()!(null)
        state.pendingLength = null
        try {
          sock.destroy(err as Error)
        } catch {
          // best-effort
        }
        return
      }
      if (state.postWaiters.length > 0) {
        state.postWaiters.shift()!(decoded)
      } else {
        state.postQueue.push(decoded)
      }
      state.pendingLength = state.pendingBuffer.length >= 4
        ? state.pendingBuffer.readUInt32LE(0) + 4
        : null
    }
  }

  sock.on('data', (chunk: Buffer) => {
    if (state.sessionKey === null) {
      // Round-6 fix: pre-handshake bytes are RAW. Pass-through. No length prefix.
      ingestPre(chunk)
    } else {
      // Post-handshake: u32le length + AES-CBC.
      ingestPost(chunk)
    }
  })

  const conn: CmConnection = {
    get sessionKey() {
      return state.sessionKey
    },
    set sessionKey(v) {
      const wentFromNull = state.sessionKey === null && v !== null
      state.sessionKey = v
      // If we just transitioned into post-handshake mode, drain any
      // already-buffered waiters by moving preQueue entries to them; or just
      // leave waiters to use the correct reader. Their getter below chooses
      // mode based on sessionKey.
      if (wentFromNull && state.preBuf.length > 0) {
        // Discard any leftover partial pre-handshake bytes; they would be
        // garbage from the server's perspective once handshake succeeds.
        state.preBuf = Buffer.alloc(0)
      }
    },
    readPreHandshakePacket(timeoutMs = 15000) {
      return new Promise<PreHandshakePacket>((resolve, reject) => {
        if (state.preQueue.length > 0) {
          resolve(state.preQueue.shift()!)
          return
        }
        const t = setTimeout(() => {
          conn.close().catch(() => undefined)
          reject(new Error(`CM pre-handshake read timeout (${timeoutMs}ms)`))
        }, timeoutMs)
        state.preWaiters.push((p) => {
          clearTimeout(t)
          if (p === null) {
            // Surface underlying AES / unknown-EMsg error as writer-side reject.
            reject(new Error('CM pre-handshake read failed (unmapped EMsg)'))
          } else {
            resolve(p)
          }
        })
      })
    },
    readPostHandshakeBuffer(timeoutMs = 15000) {
      return new Promise<Buffer>((resolve, reject) => {
        if (state.postQueue.length > 0) {
          resolve(state.postQueue.shift()!)
          return
        }
        const t = setTimeout(() => {
          conn.close().catch(() => undefined)
          reject(new Error(`CM post-handshake read timeout (${timeoutMs}ms)`))
        }, timeoutMs)
        state.postWaiters.push((b) => {
          clearTimeout(t)
          if (b === null) {
            reject(new Error('CM post-handshake AES decrypt failed'))
          } else {
            resolve(b)
          }
        })
      })
    },
    writePreHandshakeBuffer(buf: Buffer) {
      if (state.sessionKey !== null) {
        throw new Error(
          'writePreHandshakeBuffer called after handshake completed; use writePostHandshakeBuffer',
        )
      }
      sock.write(buf)
    },
    writePostHandshakeBuffer(buf: Buffer) {
      if (state.sessionKey === null) {
        throw new Error('writePostHandshakeBuffer called before handshake completed')
      }
      const encrypted = encryptPacket(state.sessionKey, buf)
      const lenBuf = Buffer.alloc(4)
      lenBuf.writeUInt32LE(encrypted.length, 0)
      sock.write(Buffer.concat([lenBuf, encrypted]))
    },
    close: () =>
      new Promise<void>((resolve) => {
        sock.end(() => resolve())
      }),
    on(event, listener) {
      sock.on(event === 'error' ? 'error' : 'close', listener as (...args: unknown[]) => void)
    },
  }
  return conn
}
