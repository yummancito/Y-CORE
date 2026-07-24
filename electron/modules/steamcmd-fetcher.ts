// electron/modules/steamcmd-fetcher.ts
//
// Auto-fetch SteamCMD al cache del usuario (getUserDataDir()/steamcmd) cuando
// `steamcmd-manager.getSteamCmdPath()` devuelve null. Sin nuevas deps.
//
// 7zip-min ya está en devDependencies; electron-builder include `node_modules/**`
// completo, así que 7zip-min está disponible en runtime empaquetado.
//
// Triggers:
//   1. CLI explícito: `ycore fetch-steamcmd` (scripts/fetch-steamcmd.ts).
//   2. Auto en app boot: se wirea desde electron/main.ts en un hito posterior.
//      En H1.5 dejamos la función lista y testeada.
//
// Safety:
//   - Idempotente: si el binario existe en cache y pesa > MIN_BIN_BYTES,
//     `source: 'cache'` y no se re-baja.
//   - HTTPS + cert verification ON (default de Node) → confianza en Valve CDN.
//   - Sin SHA-256 hardcodeado (Valve no lo publica). Loggeamos el SHA real
//     para auditoría humana; un valor sospechoso se puede comparar contra
//     reportes de la comunidad sin tener que tocar el código.
//   - Sin reintentos automáticos. El caller decide si reintentear con `force: true`.

import https from 'https'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import SevenZip from '7zip-min'
import { logger } from '../logger'
import { getUserDataDir } from './electron-context'

const OFFICIAL_URL = 'https://steamcdn-a.akamaihd.net/client/installer/steamcmd.zip'

// SteamCMD zip pesa ~750 KB - 3.2 MB según el build de Valve (verificado
// 2026-07-23: 774,825 bytes, zip válido con steamcmd.exe real adentro — el
// piso anterior de 1.5 MB rechazaba el zip oficial vigente). 400 KB es un
// piso seguro para cortar truncados obvios sin asumir un tamaño exacto que
// Valve puede volver a cambiar en cualquier release silencioso.
export const MIN_ZIP_BYTES = 400_000

// Binario extraído: Windows ~1.5 MB (con DLLs), Linux/macOS ~500 KB.
export const MIN_BIN_BYTES = 500_000

const MAX_REDIRECTS = 5

// In-session gate para el trust warn post-OK. Una vez emitido no se repite,
// pero se loggea el SHA en cada fetch OK para auditoría manual cuando se
// necesite (línea arriba del warn). Re-inicializa con cada arranque de Y-core
// (no necesita resetter porque tests actuales solo exercise el path negativo
// con TEST-NET-1 — si en el futuro algún test exercise el path success, se
// puede agregar el resetter on-demand).
let _steamcmdTrustWarned = false

/**
 * Trust model: por ahora confiamos en HTTPS + cert de Valve CDN.
 * Valve NO publica un SHA-256 canónico de steamcmd.zip — el binario cambia
 * con cada release silencioso de Valve — así que hardcodear un expected
 * sería contraproducente (forzaría updates innecesarios).
 *
 * Si el CDN de Valve fuera comprometido, este binario correría con nuestros
 * privilegios. Mitigaciones posibles a futuro:
 *   1. Pin de cert del CDN (más frágil que SHA)
 *   2. SHA distribuido via canal out-of-band (e.g. GitHub releases firmado)
 *   3. Extracción en sandbox sin red antes de ejecutar
 *
 * Por ahora, loggeamos el SHA-256 real y dejamos que el operador audite
 * manualmente contra reportes de la comunidad Steam.
 */

export interface FetchOptions {
  /** URL alternativa; default Valve CDN. Tests pueden mockear. */
  url?: string
  /** Si true, ignora caché y re-descarga (source: 'forced'). */
  force?: boolean
  /** Callback de progreso: { bytesDownloaded, bytesTotal? }. */
  onProgress?: (info: { bytesDownloaded: number; bytesTotal?: number }) => void
}

export type FetchErrorKey =
  | 'errors.steamcmd.fetch.networkFailed'
  | 'errors.steamcmd.fetch.zipInvalid'
  | 'errors.steamcmd.fetch.extractFailed'
  | 'errors.steamcmd.fetch.binMissing'

export interface FetchResult {
  success: boolean
  binPath?: string
  shortSha?: string
  byteSize?: number
  elapsedMs?: number
  source: 'cache' | 'fresh' | 'forced' | 'error'
  error?: string
  errorKey?: FetchErrorKey
}

/** Path al directorio de cache (donde se descarga y extrae). */
export function getSteamCmdCacheDir(): string {
  return path.join(getUserDataDir(), 'steamcmd')
}

function getZipPath(): string {
  return path.join(getSteamCmdCacheDir(), 'steamcmd.zip')
}

function getExpectedBinName(): string {
  return process.platform === 'win32' ? 'steamcmd.exe' : 'steamcmd'
}

/**
 * Search depth limit for the recursive fallback. Valve steamcmd.zip historically
 * wraps everything in a `steamcmd/` subdir (one level of nesting). If the
 * binary is at `userDataDir/steamcmd/steamcmd/steamcmd.exe`, depth-2 finds it
 * in <ms. We keep depth=3 as safety margin in case Valve adds another wrapper.
 */
const BIN_SEARCH_DEPTH = 3

/**
 * Self-healing: walks the cache dir recursively up to BIN_SEARCH_DEPTH looking
 * for `steamcmd.exe` (Win) or `steamcmd` (*nix). Returns the absolute path of
 * the first match, or null.
 *
 * Why this exists: Valve's zip layout has changed multiple times. We don't
 * want to pin to "exactly one dir" because that breaks the day Valve ships a
 * flat zip or a double-nested one. Recursive search + small depth bound is
 * the cheapest robust answer.
 */
function findBinRecursively(
  dir: string,
  target: string,
  depth: number = 0,
): string | null {
  if (depth > BIN_SEARCH_DEPTH) return null
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return null
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      // Don't descend into the cache dir itself or weird subdirs like `logs`.
      if (entry.name === 'logs' || entry.name === 'Cache') continue
      const found = findBinRecursively(full, target, depth + 1)
      if (found) return found
    } else if (entry.name === target) {
      return full
    }
  }
  return null
}

/**
 * Resolves the actual on-disk path of the SteamCMD binary by probing common
 * layouts (Valve zip wraps everything in a `steamcmd/` subdir, but earlier
 * releases were flat). Returns null if not found.
 *
 * Lookup order (cheap → expensive):
 *   1. Flat: `<cache>/steamcmd.exe`
 *   2. Single-nested: `<cache>/steamcmd/steamcmd.exe` (current Valve zip)
 *   3. Recursive fallback up to BIN_SEARCH_DEPTH levels
 *
 * Used by both the fetcher (post-unpack check) and the manager
 * (getSteamCmdPath candidate). Single source of truth.
 */
export function findSteamCmdBinary(): string | null {
  const cache = getSteamCmdCacheDir()
  const target = getExpectedBinName()

  // 1. Flat layout.
  const flat = path.join(cache, target)
  try {
    if (fs.existsSync(flat)) return flat
  } catch {
    // permissions error → try next candidate
  }

  // 2. Single-nested layout (Valve's current zip wraps in `steamcmd/`).
  const nested = path.join(cache, 'steamcmd', target)
  try {
    if (fs.existsSync(nested)) return nested
  } catch {
    // same
  }

  // 3. Recursive fallback — handles any depth Valve picks next.
  return findBinRecursively(cache, target)
}

/**
 * Returns the expected path post-unpack. The actual bin MAY land here OR
 * under a nested dir; callers should use `findSteamCmdBinary()` to verify.
 * Kept exported for backward compat + tests.
 */
export function getExpectedBinPath(): string {
  return path.join(getSteamCmdCacheDir(), getExpectedBinName())
}

function ensureCacheDir(): { ok: true } | { ok: false; err: string } {
  try {
    const dir = getSteamCmdCacheDir()
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    return { ok: true }
  } catch (err: unknown) {
    return { ok: false, err: err instanceof Error ? err.message : String(err) }
  }
}

/** SHA-256 hex completo del binario. Para auditoría humana. */
export async function sha256File(filePath: string): Promise<string | null> {
  try {
    const hash = crypto.createHash('sha256')
    const stream = fs.createReadStream(filePath)
    return await new Promise((resolve, reject) => {
      stream.on('data', (chunk: Buffer | string) => hash.update(chunk as Buffer))
      stream.on('end', () => resolve(hash.digest('hex')))
      stream.on('error', (err) => reject(err))
    })
  } catch {
    return null
  }
}

interface DownloadOk {
  success: true
  buffer: Buffer
  bytes: number
}
interface DownloadFail {
  success: false
  error: string
}

async function downloadZip(
  url: string,
  onProgress?: (info: { bytesDownloaded: number; bytesTotal?: number }) => void,
  ctx: { count: number; visited: string[] } = { count: 0, visited: [] },
): Promise<DownloadOk | DownloadFail> {
  if (ctx.count > MAX_REDIRECTS) {
    const chain = ctx.visited.concat(url).join(' → ')
    return { success: false, error: `demasiados redirects (>${MAX_REDIRECTS}): ${chain}` }
  }
  ctx.visited.push(url)
  return await new Promise((resolve) => {
    let resolved = false
    const safeResolve = (val: DownloadOk | DownloadFail) => {
      if (resolved) return
      resolved = true
      resolve(val)
    }
    try {
      const req = https.get(url, (res) => {
        const status = res.statusCode ?? 0

        // Follow redirects (CDN de Valve puede redirigir a mirrors).
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume()
          const next = res.headers.location.startsWith('http')
            ? res.headers.location
            : new URL(res.headers.location, url).toString()
          ctx.count += 1
          downloadZip(next, onProgress, ctx).then(safeResolve)
          return
        }

        if (status < 200 || status >= 300) {
          res.resume()
          safeResolve({ success: false, error: `HTTP ${status}` })
          return
        }

        const chunks: Buffer[] = []
        let downloaded = 0
        const totalRaw = res.headers['content-length']
        const total = totalRaw ? parseInt(totalRaw, 10) : undefined
        res.on('data', (chunk: Buffer) => {
          chunks.push(chunk)
          downloaded += chunk.length
          onProgress?.({ bytesDownloaded: downloaded, bytesTotal: total })
        })
        res.on('end', () => {
          safeResolve({ success: true, buffer: Buffer.concat(chunks), bytes: downloaded })
        })
        res.on('error', (err: Error) => {
          safeResolve({ success: false, error: err.message })
        })
      })
      req.on('error', (err: Error) => {
        safeResolve({ success: false, error: err.message })
      })
    } catch (err: unknown) {
      safeResolve({
        success: false,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  })
}

/**
 * Descarga SteamCMD al cache del usuario y extrae.
 *
 * Idempotente:
 *   - Si el binario existe en cache Y pesa > MIN_BIN_BYTES → `source: 'cache'`.
 *   - Si `force=true` → ignora caché y re-descarga (`source: 'forced'`).
 *   - Si no hay caché → descarga + extrae (`source: 'fresh'`).
 */
export async function fetchSteamCmd(opts: FetchOptions = {}): Promise<FetchResult> {
  const url = opts.url ?? OFFICIAL_URL
  // Use the self-healing resolver so cache-hit works even if the bin is in
  // the nested-or-flat layout from a previous install.
  const binPath = findSteamCmdBinary() ?? getExpectedBinPath()

  // Fast path: cache hit.
  if (!opts.force) {
    try {
      if (fs.existsSync(binPath)) {
        const stat = fs.statSync(binPath)
        if (stat.size >= MIN_BIN_BYTES) {
          const sha = await sha256File(binPath)
          logger.info(
            `[fetch-steamcmd] cache hit: ${binPath} (${stat.size} bytes, sha=${sha?.slice(0, 12) ?? 'n/a'}…)`,
            'steamcmd',
          )
          return {
            success: true,
            binPath,
            shortSha: sha?.slice(0, 8),
            byteSize: stat.size,
            source: 'cache',
          }
        }
      }
    } catch (err: unknown) {
      logger.warn(
        `[fetch-steamcmd] cache check falló: ${err instanceof Error ? err.message : String(err)}`,
        'steamcmd',
      )
    }
  }

  const dirResult = ensureCacheDir()
  if (!dirResult.ok) {
    return {
      success: false,
      source: 'error',
      error: dirResult.err,
      errorKey: 'errors.steamcmd.fetch.extractFailed',
    }
  }

  const startedAt = Date.now()
  try {
    const dl = await downloadZip(url, opts.onProgress)
    if (!dl.success) {
      return {
        success: false,
        source: 'error',
        error: dl.error,
        errorKey: 'errors.steamcmd.fetch.networkFailed',
      }
    }
    if (dl.bytes < MIN_ZIP_BYTES) {
      return {
        success: false,
        source: 'error',
        error: `zip más chico que el piso (${dl.bytes} < ${MIN_ZIP_BYTES} bytes)`,
        errorKey: 'errors.steamcmd.fetch.zipInvalid',
      }
    }

    fs.writeFileSync(getZipPath(), dl.buffer)

    // Extract via 7zip-min (devDep, bundled). 7zip-min unpacks the zip into
    // the destination, preserving internal dir structure. Valve's current
    // steamcmd.zip wraps everything in a top-level `steamcmd/` subdirectory,
    // so post-extract the binary is typically at
    // `<cache>/steamcmd/steamcmd.exe`, not `<cache>/steamcmd.exe`.
    //
    // We `await` extraction but then PROBE the actual bin location via
    // `findSteamCmdBinary()` instead of trusting the unwrapped layout.
    await new Promise<void>((resolve, reject) => {
      SevenZip.unpack(getZipPath(), getSteamCmdCacheDir(), (err) => {
        if (err) reject(err instanceof Error ? err : new Error(String(err)))
        else resolve()
      })
    })

    // Self-heal: resolve the REAL bin path post-extract. If the zip layout
    // changed (nested vs flat vs deeper), this finds it without us having to
    // hardcode Valve's structure.
    const actualBinPath = findSteamCmdBinary()
    if (!actualBinPath) {
      return {
        success: false,
        source: 'error',
        error: `binario extraído no encontrado en ${getSteamCmdCacheDir()} (layout desconocido, ni flat ni nested)`,
        errorKey: 'errors.steamcmd.fetch.binMissing',
      }
    }
    const stat = fs.statSync(actualBinPath)
    if (stat.size < MIN_BIN_BYTES) {
      return {
        success: false,
        source: 'error',
        error: `binario extraído muy chico (${stat.size} bytes) en ${actualBinPath}`,
        errorKey: 'errors.steamcmd.fetch.binMissing',
      }
    }

    // chmod +x en *nix. Windows ignora el flag (NTFS usa ACLs del installer).
    if (process.platform !== 'win32') {
      try { fs.chmodSync(actualBinPath, 0o755) } catch { /* ignore — funciona sin chmod en la mayoría */ }
    }

    const sha = await sha256File(actualBinPath)
    const elapsedMs = Date.now() - startedAt

    // Trust model: NO verificamos contra expected SHA. Confiamos en HTTPS cert
    // de Valve CDN. Loggeamos ID claramente para que el operador pueda auditar
    // contra reportes comunitarios. Ver bloque de JSDoc en OFFICIAL_URL para
    // mitigaciones posibles.
    logger.info(
      `[fetch-steamcmd] OK: ${actualBinPath} (${stat.size} bytes, sha=${sha?.slice(0, 12) ?? 'n/a'}…, ${elapsedMs}ms)`,
      'steamcmd',
    )
    // One-shot trust warn por session: la advertencia es accionable solo la
    // primera vez. Después de que el operador lo vio una vez, repetirlo en
    // cada fetch agrega ruido sin valor — el SHA real está en cada línea OK
    // loggeada justo arriba para auditoría manual cuando se necesite.
    if (!_steamcmdTrustWarned) {
      logger.warn(
        `[fetch-steamcmd] trust: SHA-256 no verificado contra expected. Manual audit: compare ${sha ?? '<unavailable>'} con Steam community reports si sospechás tampering.`,
        'steamcmd',
      )
      _steamcmdTrustWarned = true
    }

    return {
      success: true,
      binPath: actualBinPath,
      shortSha: sha?.slice(0, 8),
      byteSize: stat.size,
      elapsedMs,
      source: opts.force ? 'forced' : 'fresh',
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    logger.error(`[fetch-steamcmd] falló: ${msg}`, 'steamcmd')
    return {
      success: false,
      source: 'error',
      error: msg,
      errorKey: 'errors.steamcmd.fetch.extractFailed',
    }
  }
}
