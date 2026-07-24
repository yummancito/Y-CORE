// ============================================================================
// electron/modules/steampipe/types.ts
// ----------------------------------------------------------------------------
// Shared types for the SteamPipe client stack. Kept in a separate file so
// protobuf wire-format details (proto.ts) and CM server discovery logic
// (cm-directory.ts, etc.) can share a stable contract.
// ============================================================================

/** A single Connection Manager server entry returned by IServiceDirectory. */
export interface CmServer {
  /** Hostname or IP literal (Valve uses both; IPv4 weighted first historically). */
  host: string
  /** Steam CM port (typically 27017/27018, sometimes 27019 for WebSocket). */
  port: number
  /**
   * `type` from Valve's directory:
   *   0 = None, 1 = GoldSrc, 2 = Blue (CSGO/CS2), 3 = SDR (Steam Datagram Relay).
   * SteamPipe content download paths use Blue/SDR primarily.
   */
  type: number
  /** `sourceid` is the load-balancing partition; Valve returns ~25+ IDs cycling. */
  sourceId: number
  /** Wss/WS flag for WebSocket transports; CM list occasionally returns these too. */
  isWebSocket?: boolean
}

/** Raw payload returned by IServiceDirectory v1 HTTP endpoint. */
export interface CmListResponse {
  /** Steam cell id (geographic region bucket, 1-256). Use 0 for "any". */
  cellId: number
  /** Load summary code: 1=OK, 400=TryOtherCM, 401=SessionExpired, etc. */
  loadSummaryCode: number
  /** Server list from Valve. */
  servers: CmServer[]
  /** Optional fallback relay host. */
  fallbackRelay?: string
}

/** Anonymous session ticket issued by CM after handshake. Issued globally per CM session. */
export interface AuthSession {
  /** Account ID assigned by Steam for anonymous sessions (always 0x0100000000000001 historically). */
  accountId: bigint
  /** Hex session token used as Authorization header / protobuf field. */
  sessionTokenHex: string
  /** Steam cell ID the session was negotiated for (for cache locality). */
  cellId: number
  /** Server we connected to. */
  cmServer: CmServer
  /** Issued at unix ms. */
  issuedAt: number
}

/** Per-depot CDN content server entry. Issued by ContentServerDirectory request. */
export interface CdnServer {
  host: string
  port: number
  type: number
  sourceId: number
}

/** Decrypted chunk assembly output. This is one logical "file" of a depot. */
export interface AssembledFile {
  /** Path relative to depot root (e.g. "game/bin/game.exe"). */
  path: string
  /** Decrypted CRC32b of the data. */
  crc32: number
  /** Bytes (optionally deferred if materialization is streaming). */
  data: Buffer
}

/** Status update shape — mirrors SteamCmdProgress for renderer compat. */
export interface SteamPipeStatus {
  phase:
    | 'preparing'
    | 'authenticating'
    | 'fetching-manifest'
    | 'requesting-cdn'
    | 'downloading'
    | 'decrypting'
    | 'assembling'
    | 'done'
    | 'failed'
  appId: string
  bytesDownloaded: number
  bytesTotal: number
  speedBytesPerSec: number
  errorMessage?: string
  errorKey?: string
}

/** Result of a high-level download call. */
export interface InstallResult {
  success: boolean
  appId: string
  installDir: string
  bytesDownloaded: number
  bytesTotal: number
  durationMs: number
  errorMessage?: string
  errorKey?: string
}

// ============================================================================
// Phase 3 — Manifest / Chunk / Download types
// ============================================================================

/** A single chunk within a depot file. Corresponds to SteamKit2's ChunkData. */
export interface DepotChunkData {
  /** 20-byte SHA1 hash — this IS the chunk ID used in CDN URLs. */
  sha: Buffer
  /** Adler32 checksum of the uncompressed chunk data. */
  crc: number
  /** Byte offset within the parent file. */
  offset: number
  /** Uncompressed size in bytes. */
  cbOriginal: number
  /** Compressed (on-the-wire) size in bytes. */
  cbCompressed: number
}

/** A single file entry in the depot manifest. */
export interface DepotFileData {
  /** Relative file path (e.g. "game/bin/game.exe"). */
  filename: string
  /** SHA1 of the filename (used for encrypted-name lookups). */
  shaFilename: Buffer
  /** File flags (directory, executable, etc.). */
  flags: number
  /** Total uncompressed size of this file. */
  size: number
  /** SHA1 hash of the entire file content. */
  shaContent: Buffer
  /** Symlink target (empty string if not a symlink). */
  linkTarget: string
  /** Chunks that compose this file. */
  chunks: DepotChunkData[]
}

/** Parsed depot manifest — the decoded content of a ZIP→protobuf manifest. */
export interface DepotManifest {
  /** Depot ID this manifest belongs to. */
  depotId: number
  /** Manifest GID (unique version identifier). */
  manifestGid: number
  /** Creation time (unix seconds). */
  creationTime: number
  /** Whether filenames are AES-encrypted. */
  filenamesEncrypted: boolean
  /** Total uncompressed size across all files. */
  totalUncompressedSize: number
  /** Total compressed size across all chunks. */
  totalCompressedSize: number
  /** CRC32 of the encrypted payload (for integrity). */
  encryptedCrc: number
  /** CRC32 of the clear-text payload (field 8 in metadata). 0 when filenamesEncrypted=true. */
  crcClear: number
  /** All files in the manifest. */
  files: DepotFileData[]
  /** Unique chunks across all files (deduplicated by sha). */
  uniqueChunks: Map<string, DepotChunkData>
}

/** CDN server returned by GetServersForSteamPipe. */
export interface CdnServerEntry {
  /** Server type: 1=CSS (Steam CDN), 2=SDR. */
  type: number
  /** CDN hostname (vhost) — e.g. "cdn-123-1.akamai.steamstatic.com". */
  host: string
  /** HTTP port (typically 80). */
  port: number
  /** Relay/vhost for proxy routing. */
  relayHost: string
  /** Edge server IP (optional, for direct connection). */
  edgeServer: string
}

/** Depot decryption key returned by GetDepotDecryptionKey. */
export interface DepotKeyResult {
  eresult: number
  /** 32-byte AES key, or null if eresult != 1. */
  depotKey: Buffer | null
  depotId: number
}

/** Extended session for Phase 3 — keeps the CM connection alive. */
export interface DownloadSession {
  /** The authenticated session metadata. */
  auth: AuthSession
  /** The live CM connection — caller must NOT close until download completes. */
  conn: import('./cm-connection').CmConnection
  /** Available CDN servers (populated by fetchCdnServers). */
  cdnServers: CdnServerEntry[]
  /** Depot decryption keys keyed by depotId. */
  depotKeys: Map<number, Buffer>
}
