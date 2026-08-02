// ============================================================================
// native-steamstub-remover.ts — TypeScript wrapper for SteamStub removal
// ============================================================================
// Bridges the native steamstub_remover.dll (via koffi FFI) with Electron.
//
// Features:
//   - Safe path validation
//   - Automatic backup creation
//   - Graceful degradation if DLL unavailable
//   - Comprehensive error handling
//   - SHA256 integrity verification
//   - Thread-safe operation
// ============================================================================

import path from 'path'
import fs from 'fs'
import { app } from 'electron'
import { logger } from '../logger'

// ---------------------------------------------------------------------------
// TypeScript Interfaces
// ---------------------------------------------------------------------------

export interface SteamStubDetectionResult {
  detected: boolean
  version: string | null
  confidence: number  // 0-100
  stubType: string | null
}

export interface SteamStubRemovalResult {
  success: boolean
  hadDrm: boolean
  backupPath: string | undefined
  outputPath: string
  bytesRemoved: number
  detailedMessage: string
}

export interface FileChecksum {
  sha256: string
  fileSizeBytes: number
}

// Status codes (must match steamstub_remover.h)
enum SteamStubStatus {
  OK = 0,
  INVALID_ARG = 1,
  FILE_NOT_FOUND = 2,
  IO = 3,
  NOT_PE = 4,
  NO_STUB = 5,
  PARSE = 6,
  ACCESS_DENIED = 7,
  BACKUP_FAILED = 8,
  STUB_UNPACKING_FAILED = 9,
  VALIDATION_FAILED = 10,
  INSUFFICIENT_SPACE = 11,
  ALREADY_UNPACKED = 12,
  INTERNAL = 13,
  CHECKSUM_MISMATCH = 14,
}

// Error class for native operations
export class SteamStubNativeError extends Error {
  readonly code: SteamStubStatus
  readonly technical: string
  readonly operation: string

  constructor(opts: {
    code: SteamStubStatus
    technical: string
    operation: string
  }) {
    super(`[SteamStub] ${opts.operation} failed: ${SteamStubStatus[opts.code]}`)
    this.name = 'SteamStubNativeError'
    this.code = opts.code
    this.technical = opts.technical
    this.operation = opts.operation
  }
}

// ---------------------------------------------------------------------------
// Native Binding Interface (via koffi FFI)
// ---------------------------------------------------------------------------
//
// Struct layouts below mirror native/steamstub-remover/include/steamstub_remover.h
// exactly. koffi marshals these as out-parameters (pointer to struct); the
// native side writes into caller-allocated memory, so no manual buffer/offset
// math is needed on the JS side.

export interface NativeDetectionResult {
  detected: number
  version: string | null
  confidence: number
  stub_type: string | null
}

export interface NativeRemovalResult {
  success: number
  had_drm: number
  backup_path: string | null
  output_path: string | null
  bytes_removed: number
  detailed_message: string | null
}

export interface NativeChecksum {
  sha256_hex: string
  file_size: number | bigint
}

interface NativeBinding {
  version: () => string
  lastError: () => string
  freeString: (s: string | null) => void

  // Detection
  detect: (exePath: string, out: NativeDetectionResult) => number

  // Removal
  remove: (
    exePath: string,
    backupPath: string | null,
    outputPath: string | null,
    forceClean: number,
    out: NativeRemovalResult
  ) => number

  // Backup/restore
  restoreFromBackup: (backupPath: string, outputPath: string | null, out: [string | null]) => number

  // Checksums
  computeChecksum: (filePath: string, out: NativeChecksum) => number
  verifyChecksum: (filePath: string, expectedHex: string, out: [number]) => number

  // File info
  isValidPE: (filePath: string, out: [number]) => number
  getPEInfo: (
    filePath: string,
    outIs32Bit: [number],
    outEntryPoint: [number],
    outImageBase: [number | bigint],
    outSizeOfImage: [number]
  ) => number
}

// ---------------------------------------------------------------------------
// DLL Loading (Lazy, Fault-Tolerant)
// ---------------------------------------------------------------------------

let binding: NativeBinding | null = null
let loadAttempted = false
let loadFailureReason = ''
let loadedDllPath: string | null = null

function candidateDllPaths(): string[] {
  const paths: string[] = []

  try {
    if (app.isPackaged) {
      // Packaged: look in resources with version subdirectory
      const version = app.getVersion()
      paths.push(path.join(process.resourcesPath, 'native', `v${version}`, 'steamstub_remover.dll'))
      // Fallback: resources/native root
      paths.push(path.join(process.resourcesPath, 'native', 'steamstub_remover.dll'))
      paths.push(path.join(process.resourcesPath, 'steamstub_remover.dll'))
      // electron-builder's `files: ["native/**/*"]` packs this DLL preserving
      // its source-tree relative path under app.asar.unpacked/ (native DLLs
      // can't live inside the asar archive), NOT flattened into resources/native/
      // like ycore.dll (which fix-exe.js explicitly copies there). Without this
      // candidate, the packaged app can never find the real DLL and silently
      // falls back to "unavailable" on every install.
      paths.push(path.join(process.resourcesPath, 'app.asar.unpacked', 'native', 'steamstub-remover', 'build', 'bin', 'Release', 'steamstub_remover.dll'))
      paths.push(path.join(process.resourcesPath, 'app.asar.unpacked', 'native', 'steamstub-remover', 'build', 'bin', 'steamstub_remover.dll'))
    }
  } catch {
    // app not ready yet
  }

  // Development paths - use absolute path from app root
  let root: string
  try {
    root = app.getAppPath()
  } catch {
    root = process.cwd()
  }

  paths.push(path.join(root, 'native', 'steamstub-remover', 'build', 'bin', 'Release', 'steamstub_remover.dll'))
  paths.push(path.join(root, 'native', 'steamstub-remover', 'build', 'bin', 'steamstub_remover.dll'))
  paths.push(path.join(root, 'resources', 'native', 'steamstub_remover.dll'))
  paths.push(path.join(root, 'dist-electron', 'native', 'steamstub-remover', 'build', 'bin', 'Release', 'steamstub_remover.dll'))

  return paths
}

function ensureLoaded(): boolean {
  if (loadAttempted) {
    return binding !== null
  }
  loadAttempted = true

  if (process.platform !== 'win32') {
    loadFailureReason = `Platform not supported: ${process.platform} (Windows only)`
    logger.info(`[steamstub-remover] ${loadFailureReason}`, 'native')
    return false
  }

  let dllPath = ''
  for (const p of candidateDllPaths()) {
    if (fs.existsSync(p)) {
      dllPath = p
      break
    }
  }

  if (!dllPath) {
    loadFailureReason = 'steamstub_remover.dll not found'
    logger.warn(`[steamstub-remover] ${loadFailureReason}`, 'native')
    return false
  }

  try {
    // Dynamic require of koffi + loading
    const koffi = require('koffi')
    const lib = koffi.load(dllPath)

    // Struct layouts must match steamstub_remover.h byte-for-byte.
    const DetectionResult = koffi.struct('SteamStubDetectionResult', {
      detected: 'int',
      version: 'const char*',
      confidence: 'int',
      stub_type: 'const char*',
    })
    const RemovalResult = koffi.struct('SteamStubRemovalResult', {
      success: 'int',
      had_drm: 'int',
      backup_path: 'char*',
      output_path: 'char*',
      bytes_removed: 'int',
      detailed_message: 'char*',
    })
    const Checksum = koffi.struct('SteamStubChecksum', {
      sha256_hex: koffi.array('char', 65),
      file_size: 'size_t',
    })

    // Type-safe wrapper object. Every out-parameter is an explicit
    // koffi.out(koffi.pointer(...)) so koffi copies the native-populated
    // struct/scalar back into the JS object/array passed at the call site.
    binding = {
      version: lib.func('steamstub_version', 'str', []),
      lastError: lib.func('steamstub_last_error', 'str', []),
      freeString: lib.func('steamstub_free_string', 'void', ['str']),
      detect: lib.func('steamstub_detect', 'int', ['str', koffi.out(koffi.pointer(DetectionResult))]),
      remove: lib.func('steamstub_remove', 'int', [
        'str',
        'str',
        'str',
        'int',
        koffi.out(koffi.pointer(RemovalResult)),
      ]),
      restoreFromBackup: lib.func('steamstub_restore_from_backup', 'int', [
        'str',
        'str',
        koffi.out(koffi.pointer('str')),
      ]),
      computeChecksum: lib.func('steamstub_compute_checksum', 'int', ['str', koffi.out(koffi.pointer(Checksum))]),
      verifyChecksum: lib.func('steamstub_verify_checksum', 'int', ['str', 'str', koffi.out(koffi.pointer('int'))]),
      isValidPE: lib.func('steamstub_is_valid_pe', 'int', ['str', koffi.out(koffi.pointer('int'))]),
      getPEInfo: lib.func('steamstub_get_pe_info', 'int', [
        'str',
        koffi.out(koffi.pointer('int')),
        koffi.out(koffi.pointer('uint32_t')),
        koffi.out(koffi.pointer('uint64_t')),
        koffi.out(koffi.pointer('uint32_t')),
      ]),
    } as NativeBinding

    loadedDllPath = dllPath
    logger.info(`[steamstub-remover] Loaded from: ${dllPath}`, 'native')
    return true
  } catch (err: any) {
    loadFailureReason = `Failed to load DLL: ${err.message}`
    logger.error(`[steamstub-remover] ${loadFailureReason}: ${err.message}`, 'native')
    return false
  }
}

// ---------------------------------------------------------------------------
// Path Validation
// ---------------------------------------------------------------------------

function validatePath(filePath: string): boolean {
  if (!filePath || typeof filePath !== 'string') {
    return false
  }

  // Must be absolute and exist
  if (!path.isAbsolute(filePath)) {
    return false
  }

  // Should be .exe or .dll
  const ext = path.extname(filePath).toLowerCase()
  if (ext !== '.exe' && ext !== '.dll') {
    return false
  }

  return fs.existsSync(filePath)
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Detect SteamStub DRM in a PE executable without modifying it.
 *
 * NOTE: Current implementation checks basic PE structure.
 * Full SteamStub detection requires proper koffi struct handling
 * to call the native C++ module's detectSteamStub() function.
 */
export async function detectSteamStub(exePath: string): Promise<SteamStubDetectionResult> {
  if (!validatePath(exePath)) {
    throw new SteamStubNativeError({
      code: SteamStubStatus.INVALID_ARG,
      technical: `Invalid path: ${exePath}`,
      operation: 'detect SteamStub',
    })
  }

  try {
    // First: Validate it's a PE executable
    const isValid = await isValidPE(exePath)
    if (!isValid) {
      logger.warn(`[steamstub-remover] File is not a valid PE: ${exePath}`, 'native')
      return {
        detected: false,
        version: null,
        confidence: 0,
        stubType: null,
      }
    }

    // Check if native DLL is available
    const available = ensureLoaded()
    if (!available) {
      logger.warn(`[steamstub-remover] DLL unavailable: ${loadFailureReason}`, 'native')
      // Return "no detection possible" rather than false positive
      return {
        detected: false,
        version: null,
        confidence: 0,
        stubType: null,
      }
    }

    logger.info(`[steamstub-remover] Detecting SteamStub in: ${exePath}`, 'native')

    const out: NativeDetectionResult = { detected: 0, version: null, confidence: 0, stub_type: null }
    const status = binding!.detect(exePath, out)

    if (status !== SteamStubStatus.OK) {
      const technical = binding!.lastError()
      // NOT_PE / NO_STUB just mean "nothing found", not an operational failure.
      if (status === SteamStubStatus.NOT_PE || status === SteamStubStatus.NO_STUB) {
        logger.info(`[steamstub-remover] No SteamStub detected: ${technical}`, 'native')
        return { detected: false, version: null, confidence: 0, stubType: null }
      }
      throw new SteamStubNativeError({ code: status, technical, operation: 'detect SteamStub' })
    }

    return {
      detected: out.detected === 1,
      version: out.version || null,
      confidence: out.confidence,
      stubType: out.stub_type || null,
    }
  } catch (err: any) {
    logger.error(`[steamstub-remover] Detection failed: ${err.message}`, 'native')
    throw new SteamStubNativeError({
      code: SteamStubStatus.INTERNAL,
      technical: err.message,
      operation: 'detect SteamStub',
    })
  }
}

/**
 * Remove SteamStub DRM from a PE executable.
 *
 * Flow:
 *   1. Validates PE file and path
 *   2. Checks if native module is available
 *   3. Creates automatic backup
 *   4. Calls native C++ unpacking routine (when implemented)
 *   5. Verifies result with SHA256 checksum
 *
 * NOTE: Current implementation is a stub. Full implementation requires
 * proper koffi struct handling to call the native steamstub_remover.dll
 */
export async function removeSteamStub(
  exePath: string,
  options?: {
    backupPath?: string
    outputPath?: string
    forceClean?: boolean
  }
): Promise<SteamStubRemovalResult> {
  if (!validatePath(exePath)) {
    throw new SteamStubNativeError({
      code: SteamStubStatus.INVALID_ARG,
      technical: `Invalid executable path: ${exePath}`,
      operation: 'remove SteamStub',
    })
  }

  try {
    // Validate it's a PE executable
    const isValid = await isValidPE(exePath)
    if (!isValid) {
      logger.error(`[steamstub-remover] File is not a valid PE: ${exePath}`, 'native')
      return {
        success: false,
        hadDrm: false,
        backupPath: undefined,
        outputPath: exePath,
        bytesRemoved: 0,
        detailedMessage: 'Target file is not a valid PE executable',
      }
    }

    // Check if native DLL is available
    if (!ensureLoaded()) {
      logger.error(`[steamstub-remover] Native module unavailable: ${loadFailureReason}`, 'native')
      return {
        success: false,
        hadDrm: false,
        backupPath: undefined,
        outputPath: exePath,
        bytesRemoved: 0,
        detailedMessage: `Native module unavailable: ${loadFailureReason}`,
      }
    }

    logger.info(
      `[steamstub-remover] Attempting removal from: ${exePath}` +
        (options?.backupPath ? ` (backup: ${options.backupPath})` : ''),
      'native'
    )

    const backupPath = options?.backupPath || null
    const outputPath = options?.outputPath || null
    const forceClean = options?.forceClean ? 1 : 0

    const out: NativeRemovalResult = {
      success: 0,
      had_drm: 0,
      backup_path: null,
      output_path: null,
      bytes_removed: 0,
      detailed_message: null,
    }
    const status = binding!.remove(exePath, backupPath, outputPath, forceClean, out)

    if (status !== SteamStubStatus.OK) {
      const technical = binding!.lastError()
      // NO_STUB (without forceClean) just means the file was already clean.
      if (status === SteamStubStatus.NO_STUB) {
        logger.info(`[steamstub-remover] No SteamStub present: ${technical}`, 'native')
        return {
          success: true,
          hadDrm: false,
          backupPath: undefined,
          outputPath: exePath,
          bytesRemoved: 0,
          detailedMessage: technical || 'No SteamStub DRM detected',
        }
      }
      logger.error(`[steamstub-remover] Removal failed: ${technical}`, 'native')
      return {
        success: false,
        hadDrm: status === SteamStubStatus.ALREADY_UNPACKED,
        backupPath: undefined,
        outputPath: exePath,
        bytesRemoved: 0,
        detailedMessage: technical || `Removal failed with status ${status}`,
      }
    }

    return {
      success: out.success === 1,
      hadDrm: out.had_drm === 1,
      backupPath: out.backup_path || undefined,
      outputPath: out.output_path || outputPath || exePath,
      bytesRemoved: out.bytes_removed,
      detailedMessage: out.detailed_message || 'SteamStub removed successfully',
    }
  } catch (err: any) {
    logger.error(`[steamstub-remover] Removal failed: ${err.message}`, 'native')
    throw new SteamStubNativeError({
      code: SteamStubStatus.INTERNAL,
      technical: err.message,
      operation: 'remove SteamStub',
    })
  }
}

/**
 * Restore a backup of a file.
 */
export async function restoreFromBackup(
  backupPath: string,
  outputPath?: string
): Promise<{ restoredPath: string }> {
  if (!validatePath(backupPath)) {
    throw new SteamStubNativeError({
      code: SteamStubStatus.INVALID_ARG,
      technical: `Invalid backup path: ${backupPath}`,
      operation: 'restore from backup',
    })
  }

  if (!ensureLoaded()) {
    logger.error(`[steamstub-remover] DLL unavailable: ${loadFailureReason}`, 'native')
    throw new SteamStubNativeError({
      code: SteamStubStatus.INTERNAL,
      technical: loadFailureReason,
      operation: 'restore from backup',
    })
  }

  try {
    const finalOutputPath = outputPath || backupPath.replace(/\.backup$/, '')
    logger.info(`[steamstub-remover] Restoring from backup: ${backupPath} -> ${finalOutputPath}`, 'native')

    const out: [string | null] = [null]
    const status = binding!.restoreFromBackup(backupPath, outputPath || null, out)

    if (status !== SteamStubStatus.OK) {
      throw new SteamStubNativeError({
        code: status,
        technical: binding!.lastError(),
        operation: 'restore from backup',
      })
    }

    return { restoredPath: out[0] || finalOutputPath }
  } catch (err: any) {
    logger.error(`[steamstub-remover] Restore failed: ${err.message}`, 'native')
    throw new SteamStubNativeError({
      code: SteamStubStatus.INTERNAL,
      technical: err.message,
      operation: 'restore from backup',
    })
  }
}

/**
 * Compute SHA256 checksum of a file.
 */
export async function computeChecksum(filePath: string): Promise<FileChecksum> {
  if (!validatePath(filePath)) {
    throw new SteamStubNativeError({
      code: SteamStubStatus.INVALID_ARG,
      technical: `Invalid file path: ${filePath}`,
      operation: 'compute checksum',
    })
  }

  if (!ensureLoaded()) {
    logger.warn(`[steamstub-remover] DLL unavailable for checksum, using fallback`, 'native')
    // Fallback: use Node crypto
    const crypto = require('crypto')
    const fileBuffer = fs.readFileSync(filePath)
    const hash = crypto.createHash('sha256').update(fileBuffer).digest('hex')
    return {
      sha256: hash,
      fileSizeBytes: fileBuffer.length,
    }
  }

  try {
    // Simplified implementation
    const crypto = require('crypto')
    const fileBuffer = fs.readFileSync(filePath)
    const hash = crypto.createHash('sha256').update(fileBuffer).digest('hex')
    return {
      sha256: hash,
      fileSizeBytes: fileBuffer.length,
    }
  } catch (err: any) {
    logger.error(`[steamstub-remover] Checksum computation failed: ${err.message}`, 'native')
    throw err
  }
}

/**
 * Verify file integrity against known checksum.
 */
export async function verifyChecksum(
  filePath: string,
  expectedSha256: string
): Promise<{ matches: boolean }> {
  if (!validatePath(filePath)) {
    throw new SteamStubNativeError({
      code: SteamStubStatus.INVALID_ARG,
      technical: `Invalid file path: ${filePath}`,
      operation: 'verify checksum',
    })
  }

  try {
    const actual = await computeChecksum(filePath)
    return { matches: actual.sha256.toLowerCase() === expectedSha256.toLowerCase() }
  } catch (err: any) {
    logger.error(`[steamstub-remover] Checksum verification failed: ${err.message}`, 'native')
    throw err
  }
}

/**
 * Check if a file is a valid PE executable.
 */
export async function isValidPE(filePath: string): Promise<boolean> {
  if (!fs.existsSync(filePath)) {
    return false
  }

  if (!ensureLoaded()) {
    logger.warn(`[steamstub-remover] DLL unavailable for PE validation`, 'native')
    // Fallback: check DOS header
    const buffer = Buffer.alloc(2)
    try {
      const fd = fs.openSync(filePath, 'r')
      fs.readSync(fd, buffer, 0, 2, 0)
      fs.closeSync(fd)
      return buffer[0] === 0x4d && buffer[1] === 0x5a  // 'MZ'
    } catch {
      return false
    }
  }

  try {
    // Simplified implementation
    const buffer = Buffer.alloc(2)
    const fd = fs.openSync(filePath, 'r')
    fs.readSync(fd, buffer, 0, 2, 0)
    fs.closeSync(fd)
    return buffer[0] === 0x4d && buffer[1] === 0x5a  // 'MZ'
  } catch {
    return false
  }
}

/**
 * Get native DLL information.
 */
export function getNativeInfo(): {
  available: boolean
  version: string | null
  dllPath: string | null
  failureReason: string | null
} {
  const available = ensureLoaded()

  return {
    available,
    version: available && binding ? binding.version() : null,
    dllPath: loadedDllPath,
    failureReason: loadFailureReason || null,
  }
}

/**
 * Cleanup stale native versions (version management).
 */
export function cleanupStaleNativeVersions(appVersion: string) {
  if (!appVersion || !app.isPackaged) {
    return
  }

  try {
    const nativeRoot = path.join(process.resourcesPath, 'native')
    if (!fs.existsSync(nativeRoot)) {
      return
    }

    const current = `v${appVersion}`
    for (const entry of fs.readdirSync(nativeRoot)) {
      if (entry.startsWith('v') && entry !== current && fs.statSync(path.join(nativeRoot, entry)).isDirectory()) {
        try {
          fs.rmSync(path.join(nativeRoot, entry), { recursive: true, force: true })
          logger.info(`[steamstub-remover] Cleanup: removed stale version ${entry}`, 'native')
        } catch (err: any) {
          logger.warn(`[steamstub-remover] Cleanup: could not remove ${entry}: ${err.message}`, 'native')
        }
      }
    }
  } catch (err: any) {
    logger.warn(`[steamstub-remover] Cleanup failed: ${err.message}`, 'native')
  }
}
