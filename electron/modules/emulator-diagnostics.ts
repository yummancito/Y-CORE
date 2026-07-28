// ============================================================================
// electron/modules/emulator-diagnostics.ts
// ----------------------------------------------------------------------------
// Static diagnostics for ycore_steam.dll.
//
// What this gives the renderer:
//   1. Whether ycore_steam.dll exists on disk (path + size)
//   2. Its version string (via koffi, if available)
//   3. The full named-export list
//   4. A heuristic for "Goldberg layout" support — whether this build of
//      ycore_steam.dll actually reads steam_settings/*. Goldberg-style
//      emulators expose `*subscribed*`, `*user_data*`, `*settings*`, etc.
//      If we see those symbols, the Layer 3 scaffold (force_account_name.txt,
//      offline.txt, appid.txt, disable_overlay.txt) dropped by patchGameFolder
//      will be consumed. If not, it's dead bytes.
//
// Why fetch export names from PE bytes (not LoadLibrary)?
//   • Static analysis — never locks the DLL or runs its DllMain.
//   • Bulletproof when the DLL has missing imports or wrong machine type.
//   • Zero side effects during a diagnostics query.
// ============================================================================

import { promises as fsp, existsSync } from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import { logger } from '../logger'
import { getLocalSteamEmulatorDiagnostics } from './local-steam-emulator'

// ============================================================================
// Public types
// ============================================================================

export interface PeExportEntry {
  /** Absolute virtual address (ImageBase + FunctionRVA), zero-padded hex.
   *  Forwarder exports get a leading "→" prefix and the forwarded DLL.Func
   *  string instead of an address. */
  address: string
  /** Function name as exported (e.g. "ycore_steam_init") */
  name: string
  /** Ordinal assigned to this export = AddressOfNameOrdinals[i] + Base */
  ordinal: number
}

export interface EmulatorDiagnosticsPayload {
  dllPath: string | null
  /** ycore_steam.dll version string from ycore_steam_version() if koffi
   *  could bind the DLL; null if load failed or version export missing. */
  version: string | null
  /** Bytes on disk, or null when DLL not found. */
  dllSizeBytes: number | null
  /** PE parse failure reason (separate from koffi so the renderer can tell
   *  them apart — koffi bind trouble is benign when PE parse succeeded). */
  parseError: string | null
  /** koffi bind failure reason (different dimension from parseError). */
  koffiError: string | null
  exportCount: number
  /** Just the names (matches the user's `exports: string[]` contract) */
  exports: string[]
  /** Rich entries (address, name, ordinal). Capped to 200 to keep IPC
   *  payload small if a future build exports thousands of symbols. */
  exportsDetailed: PeExportEntry[]
  /** Static reference list — always returned so the renderer can show
   *  "missing-but-expected" files in the UI. */
  expectedSettingsFiles: typeof GOLDBERG_EXPECTED_FILES
  /** Subset the heuristic believes the DLL recognizes. Empty array means
   *  the Layer 3 scaffold dropped by patchGameFolder is dead bytes. */
  goldbergLayoutSupported: string[]
}

interface ExportParseResult {
  exports: PeExportEntry[]
  parseError: string | null
}

// ============================================================================
// Constants
// ============================================================================

const GOLDBERG_EXPECTED_FILES = [
  'force_account_name.txt',
  'offline.txt',
  'appid.txt',
  'disable_overlay.txt',
] as const

/** Pattern matching export names that imply the DLL parses Goldberg-style
 *  steam_settings/. Conservative — false positives just enable the UI to
 *  claim support for a DLL that may partial-implement, so we list EVERY
 *  exported name so the user can verify in the expanded view. */
const SETTINGS_RELATED_PATTERNS: readonly RegExp[] = [
  /user[_.]?data/i,
  /subscribed/i,
  /settings/i,
  /app[_.]?id/i,
  /force[_.]?account/i,
  /\boffline\b/i,
  /disable[_.]?overlay/i,
  /entitlement/i,
]

const MAX_DETAILED_EXPORTS = 200

// ============================================================================
// Koffi fails to bind when the DLL has missing imports (Win error 126).
// That doesn't mean we can't enumerate exports from the PE bytes. This
// function mirrors local-steam-emulator's candidate-path discovery so we
// don't introduce a separate "DLL not found" branch.
// ============================================================================

function findDllCandidate(): string | null {
  const candidates: string[] = []
  try {
    if (app.isPackaged) {
      const verDir = path.join(process.resourcesPath, 'native', `v${app.getVersion()}`)
      candidates.push(path.join(verDir, 'ycore_steam.dll'))
      candidates.push(path.join(process.resourcesPath, 'native', 'ycore_steam.dll'))
    }
  } catch {
    // `app` may not be ready
  }
  const root = path.join(__dirname, '..', '..')
  candidates.push(path.join(root, 'resources', 'native', 'ycore_steam.dll'))
  candidates.push(path.join(root, 'native', 'ycore_steam', 'build', 'Release', 'ycore_steam.dll'))
  for (const c of candidates) {
    if (existsSync(c)) return c
  }
  return null
}

// ============================================================================
// Manual PE parser (PE32 + PE32+)
//
// PE structure (relevant bytes highlighted):
//   offset 0x00..          IMAGE_DOS_HEADER (64 bytes)
//     0x3C = e_lfanew      uint32 RVA to PE sig
//   offset e_lfanew..      "PE\0\0" (4 bytes)
//     +4                   IMAGE_FILE_HEADER (20 bytes)
//       +2  NumberOfSections
//       +16 SizeOfOptionalHeader
//     +24                  IMAGE_OPTIONAL_HEADER
//       +0   Magic (0x10B PE32 / 0x20B PE32+)
//       +24  ImageBase
//       +96 (PE32) / +112 (PE32+)  DataDirectory[16]
//         +0  DataDirectory[0] = export (RVA, Size)
//     +SizeOfOptionalHeader  IMAGE_SECTION_HEADER[NumberOfSections] (40B each, raw)
// ============================================================================

function parseExports(buf: Buffer): ExportParseResult {
  try {
    if (buf.length < 64 || buf[0] !== 0x4d || buf[1] !== 0x5a) {
      return { exports: [], parseError: 'No es un PE: MZ header ausente' }
    }
    const e_lfanew = buf.readUInt32LE(0x3c)
    if (e_lfanew < 64 || e_lfanew + 28 > buf.length) {
      return { exports: [], parseError: 'PE e_lfanew fuera de rango' }
    }
    if (buf.toString('ascii', e_lfanew, e_lfanew + 4) !== 'PE\0\0') {
      return { exports: [], parseError: 'Firma PE inválida' }
    }

    const numSections = buf.readUInt16LE(e_lfanew + 4 + 2)
    const sizeOptHeader = buf.readUInt16LE(e_lfanew + 4 + 16)
    const optOffset = e_lfanew + 24
    const magic = buf.readUInt16LE(optOffset)
    const isPE32Plus = magic === 0x20b
    if (magic !== 0x10b && magic !== 0x20b) {
      return { exports: [], parseError: `Magic PE desconocido 0x${magic.toString(16)}` }
    }

    // ImageBase as a JS number — Win DLL ImageBase fits in u32 even on 64-bit.
    const imageBase = isPE32Plus
      ? Number(buf.readBigUInt64LE(optOffset + 24))
      : buf.readUInt32LE(optOffset + 24)

    const ddOffset = optOffset + (isPE32Plus ? 112 : 96)
    const exportRva = buf.readUInt32LE(ddOffset)
    const exportSize = buf.readUInt32LE(ddOffset + 4)
    if (exportRva === 0 || exportSize === 0) {
      return { exports: [], parseError: null } // DLL has no exports at all
    }

    const sectionsOffset = optOffset + sizeOptHeader

    /** Convert RVA → file offset via section table.
     *
     *  Round-7 reviewer fix: previously used `Math.max(virtSize, rawSize)` as
     *  the section bound. That's wrong — BSS / alignment padding sections
     *  have VirtualSize > SizeOfRawData. RVAs inside VirtSize but past
     *  rawSize exist in-memory but have no on-disk bytes; returning a file
     *  offset there made the caller read garbage bytes from the NEXT
     *  section's rawSize padding (worst case: a different export's name
     *  string). Fix: bound by both. */
    const rvaToOffset = (rva: number): number => {
      if (rva === 0) return -1
      for (let i = 0; i < numSections; i++) {
        const sOff = sectionsOffset + i * 40
        const virtSize = buf.readUInt32LE(sOff + 8)
        const rawSize = buf.readUInt32LE(sOff + 16)
        const sectStart = buf.readUInt32LE(sOff + 12)
        const rawPtr = buf.readUInt32LE(sOff + 20)
        if (rva >= sectStart && rva < sectStart + virtSize) {
          const offsetInSect = rva - sectStart
          if (offsetInSect < rawSize) return rawPtr + offsetInSect
        }
      }
      return -1
    }

    const expOff = rvaToOffset(exportRva)
    if (expOff < 0 || expOff + 40 > buf.length) {
      return { exports: [], parseError: 'Export directory RVA no resoluble' }
    }

    const base = buf.readUInt32LE(expOff + 16)
    const numNames = buf.readUInt32LE(expOff + 24)
    const functionsRva = buf.readUInt32LE(expOff + 20)
    const namesRva = buf.readUInt32LE(expOff + 28)
    const nameOrdinalsRva = buf.readUInt32LE(expOff + 32)

    const namesTableOff = rvaToOffset(namesRva)
    const ordTableOff = rvaToOffset(nameOrdinalsRva)
    const funcTableOff = rvaToOffset(functionsRva)
    if (namesTableOff < 0 || ordTableOff < 0) {
      return { exports: [], parseError: 'Tablas de export no resolubles' }
    }

    const limit = Math.min(numNames, MAX_DETAILED_EXPORTS)
    const exports: PeExportEntry[] = []
    for (let i = 0; i < limit; i++) {
      const nameRva = buf.readUInt32LE(namesTableOff + i * 4)
      const nameFileOff = rvaToOffset(nameRva)
      if (nameFileOff < 0 || nameFileOff >= buf.length) continue
      const nameEnd = buf.indexOf(0, nameFileOff)
      if (nameEnd < 0 || nameEnd - nameFileOff > 256) continue
      const name = buf.toString('utf8', nameFileOff, nameEnd)
      if (!name) continue

      const ordinal = buf.readUInt16LE(ordTableOff + i * 2) + base

      let address = '0x0000000000000000'
      if (funcTableOff >= 0) {
        const funcRva = buf.readUInt32LE(funcTableOff + (ordinal - base) * 4)
        const isForwarder =
          funcRva >= exportRva && funcRva < exportRva + exportSize
        if (!isForwarder) {
          const abs = imageBase + funcRva
          address = `0x${abs.toString(16).toUpperCase().padStart(16, '0')}`
        } else {
          // Forwarder string: read the forwarded DLL.Function at funcRva.
          const forwarderOff = rvaToOffset(funcRva)
          if (forwarderOff >= 0 && forwarderOff < buf.length) {
            const forwarderEnd = buf.indexOf(0, forwarderOff)
            if (forwarderEnd >= 0 && forwarderEnd - forwarderOff < 256) {
              address =
                '→' +
                buf
                  .toString('utf8', forwarderOff, forwarderEnd)
                  .replace(/[^\x20-\x7e]/g, '?')
            }
          }
        }
      }

      exports.push({ address, name, ordinal })
    }

    return { exports, parseError: null }
  } catch (err: any) {
    return { exports: [], parseError: `parseExports: ${err?.message ?? err}` }
  }
}

// ============================================================================
// Goldberg-layout heuristic
// ============================================================================

function looksLikeGoldbergSettings(names: string[]): boolean {
  return names.some((n) =>
    SETTINGS_RELATED_PATTERNS.some((re) => re.test(n)),
  )
}

function dedupe(arr: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const x of arr) {
    if (!seen.has(x)) {
      seen.add(x)
      out.push(x)
    }
  }
  return out
}

/** Sample path list used in the "DLL not found" payload, so the user knows
 *  what we looked at without having to dig in /logs. */
function buildNotFoundReason(): string {
  const candidates: string[] = []
  try {
    if (app.isPackaged) {
      candidates.push(
        path.join(process.resourcesPath, 'native', `v${app.getVersion()}`, 'ycore_steam.dll'),
      )
      candidates.push(path.join(process.resourcesPath, 'native', 'ycore_steam.dll'))
    }
  } catch {
    // ignore
  }
  const root = path.join(__dirname, '..', '..')
  candidates.push(path.join(root, 'resources', 'native', 'ycore_steam.dll'))
  candidates.push(path.join(root, 'native', 'ycore_steam', 'build', 'Release', 'ycore_steam.dll'))
  return (
    'ycore_steam.dll no encontrada. Rutas probadas:\n  ' +
    candidates.join('\n  ') +
    '\nCompilala con scripts/build-ycore-steam.bat.'
  )
}

// ============================================================================
// Public API (async — see Round-7 reviewer fix below)
// ============================================================================

/** Round-7 reviewer fix #2: this used to be sync + fs.readFileSync. Reading
 *  a 5–15 MB DLL synchronously blocks the Electron main event loop the
 *  entire read duration — every other service (download-engine, remote-play,
 *  store IPC, window events) gets stalled. Converted to async + fsp.readFile. */
export async function getEmulatorDiagnostics(): Promise<EmulatorDiagnosticsPayload> {
  // koffi probe: independent of PE parse, tells us the version string and
  // whether koffi could actually bind the DLL. A failed koffi bind is not
  // fatal — we may still extract exports from the file bytes — so we report
  // it separately from parseError (fix #5).
  let version: string | null = null
  let koffiError: string | null = null
  try {
    const koffiDiag = getLocalSteamEmulatorDiagnostics()
    version = koffiDiag.version
    if (!koffiDiag.isAvailable) koffiError = koffiDiag.failureReason
  } catch (err: any) {
    koffiError = err?.message ?? String(err)
  }

  const dllPath = findDllCandidate()
  if (!dllPath) {
    return {
      dllPath: null,
      version,
      dllSizeBytes: null,
      parseError: null,
      koffiError,
      exportCount: 0,
      exports: [],
      exportsDetailed: [],
      expectedSettingsFiles: [...GOLDBERG_EXPECTED_FILES],
      goldbergLayoutSupported: [],
    }
  }

  let dllSizeBytes: number | null = null
  let exports: PeExportEntry[] = []
  let parseError: string | null = null
  try {
    const stat = await fsp.stat(dllPath)
    dllSizeBytes = stat.size
    const buf = await fsp.readFile(dllPath)
    const result = parseExports(buf)
    exports = result.exports
    if (result.parseError) parseError = result.parseError
  } catch (err: any) {
    parseError = `readFile: ${err?.message ?? err}`
    logger.warn(`[emulator-diagnostics] ${parseError}`, 'emulator')
  }

  const names = dedupe(exports.map((e) => e.name))
  const supported = looksLikeGoldbergSettings(names)
    ? [...GOLDBERG_EXPECTED_FILES]
    : []

  if (!parseError && !dllPath) {
    // Defensive: koffiError for missing DLL surfaces the not-found reason.
    parseError = buildNotFoundReason()
  }

  return {
    dllPath,
    version,
    dllSizeBytes,
    parseError,
    koffiError,
    exportCount: names.length,
    exports: names,
    exportsDetailed: exports,
    expectedSettingsFiles: [...GOLDBERG_EXPECTED_FILES],
    goldbergLayoutSupported: supported,
  }
}
