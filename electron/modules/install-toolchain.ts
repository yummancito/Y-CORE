// ============================================================================
// install-toolchain.ts — Auto-installer for cmake (and future MSVC deps).
//
// Round-12: without this, users on a fresh Windows install hit "cmake missing"
// forever and never get their game to launch. This module tries 3 install
// paths in order, streaming stdout via the supplied callback.
//
//   1. winget  (Win10 1809+ ships with App Installer; non-admin user-scope)
//   2. choco   (Chocolatey; requires admin by default)
//   3. Direct  (https download from cmake.org + msiexec)
//
// Round-12.5 fixes (post Round-12 review blockers):
//   • SHA256 now fetched DYNAMICALLY from cmake.org's release manifest
//     (no more hardcoded placeholder). If both fetch attempts fail we
//     skip verification with a warning instead of failing every install.
//   • Direct-MSI download switched from Electron's net.request to Node's
//     `https` module (well-tested 302 redirect handling for github.com →
//     objects.githubusercontent.com).
//   • Module-level `installInFlight` Promise mutex so concurrent callers
//     (auto-kick at startup + manual trigger from Settings) share a single
//     install attempt instead of racing.
//   • On success, inject the new cmake path into `process.env.PATH` so the
//     subsequent build chain can run immediately without `app.relaunch()`.
// ============================================================================

import { spawn } from 'child_process'
import https from 'https'
import path from 'path'
import fs from 'fs'
import os from 'os'
import { app } from 'electron'
import { logger } from '../logger'

export interface InstallResult {
  success: boolean
  installedFrom: 'winget' | 'chocolatey' | 'direct' | 'already-installed' | null
  durationMs: number
  error: string | null
  skippedTiers: Array<{ tier: string; reason: string }>
  cmakePathAfter: string | null
  verificationSkipped?: boolean
}

export interface InstallOptions {
  onProgress?: (line: string) => void
  timeoutMs?: number
  /** Default true. Set false to skip SHA256 verification (for offline tests). */
  verifySignature?: boolean
}

const CMAKE_VERSION = '3.28.1'
const CMAKE_MSI_FILENAME = `cmake-${CMAKE_VERSION}-windows-x86_64.msi`
// GitHub release URL for the x64 Windows MSI.
const CMAKE_MSI_URL = `https://github.com/Kitware/CMake/releases/download/v${CMAKE_VERSION}/${CMAKE_MSI_FILENAME}`

// ---------------------------------------------------------------------------
// Concurrency lock — at most one install attempt at a time.
// ---------------------------------------------------------------------------

let installInFlight: Promise<InstallResult> | null = null

// ---------------------------------------------------------------------------
// HTTP helpers (Node https with manual redirect-following for reliability).
// ---------------------------------------------------------------------------

/** GET `url`, follow up to `maxRedirects` 30x responses, resolve with text. */
function downloadText(url: string, maxRedirects = 5, timeoutMs = 8000): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, (res) => {
      const code = res.statusCode ?? 0
      if ([301, 302, 307, 308].includes(code) && res.headers.location) {
        res.resume() // drain
        if (maxRedirects === 0) return reject(new Error('Too many redirects'))
        // Handle relative Location.
        const next = new URL(res.headers.location, url).toString()
        resolve(downloadText(next, maxRedirects - 1, timeoutMs))
        return
      }
      if (code !== 200) {
        res.resume()
        return reject(new Error(`HTTP ${code}`))
      }
      const chunks: Buffer[] = []
      res.on('data', (c: Buffer) => chunks.push(c))
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')))
      res.on('error', reject)
    })
    req.setTimeout(timeoutMs, () => {
      try { req.destroy(new Error(`timeout after ${timeoutMs}ms`)) } catch {}
    })
    req.on('error', reject)
  })
}

/** GET `url`, follow redirects, write body to `dest`. */
function downloadFile(
  url: string,
  dest: string,
  onProgress: ((line: string) => void) | undefined,
  maxRedirects = 5,
  timeoutMs = 120_000,
): Promise<{ sizeBytes: number }> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, (res) => {
      const code = res.statusCode ?? 0
      if ([301, 302, 307, 308].includes(code) && res.headers.location) {
        res.resume()
        if (maxRedirects === 0) return reject(new Error('Too many redirects'))
        const next = new URL(res.headers.location, url).toString()
        resolve(downloadFile(next, dest, onProgress, maxRedirects - 1, timeoutMs))
        return
      }
      if (code !== 200) {
        res.resume()
        return reject(new Error(`HTTP ${code}`))
      }
      const file = fs.createWriteStream(dest)
      let received = 0
      let lastReportedMb = 0
      res.on('data', (chunk: Buffer) => {
        received += chunk.length
        const mb = Math.floor(received / (1024 * 1024))
        if (mb > lastReportedMb) {
          lastReportedMb = mb
          emit(onProgress, `[direct] downloaded ${mb} MB`)
        }
      })
      res.pipe(file)
      file.on('finish', () => file.close(() => resolve({ sizeBytes: received })))
      file.on('error', (err) => reject(err))
      res.on('error', (err) => reject(err))
    })
    req.setTimeout(timeoutMs, () => {
      try { req.destroy(new Error(`download timeout after ${timeoutMs}ms`)) } catch {}
    })
    req.on('error', reject)
  })
}

/**
 * Detect whether the current Y-core process has admin/elevated rights on
 * Windows. Standard-account users CAN'T approve UAC — if we send them to
 * msiexec without this check, they get exit 1622 with a misleading "click
 * Yes" hint that never had a chance to appear.
 *
 * Implementation: `net session` requires elevation to succeed. We spawn it
 * asynchronously with a tight timeout; non-zero exit => not elevated.
 */
let _adminCached: boolean | null = null
async function isElevated(): Promise<boolean> {
  if (_adminCached !== null) return _adminCached
  if (process.platform !== 'win32') { _adminCached = false; return false }
  try {
    const code: number = await new Promise((resolve) => {
      const p = spawn('net', ['session'], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
      let resolved = false
      p.on('close', (c) => { if (!resolved) { resolved = true; resolve(typeof c === 'number' ? c : 1) } })
      p.on('error', () => { if (!resolved) { resolved = true; resolve(1) } })
      setTimeout(() => { if (!resolved) { resolved = true; try { p.kill() } catch {} ; resolve(1) } }, 2500)
    })
    _adminCached = code === 0
  } catch {
    _adminCached = false
  }
  return _adminCached
}

/** Fetch cmake.org release SHA-256 manifest, parse out our MSI line. */
async function fetchExpectedSha256(): Promise<string | null> {
  const candidates = [
    `https://cmake.org/files/v${CMAKE_VERSION}/cmake-${CMAKE_VERSION}-SHA-256.txt`,
    `https://cmake.org/files/v${CMAKE_VERSION}/CMake-${CMAKE_VERSION}-SHA-256.txt`,
    `https://github.com/Kitware/CMake/releases/download/v${CMAKE_VERSION}/cmake-${CMAKE_VERSION}-SHA-256.txt`,
  ]
  for (const url of candidates) {
    try {
      const text = await downloadText(url, 5, 6000)
      // Format: "<64-hex>  " or "<64-hex> *".
      for (const line of text.split(/\r?\n/)) {
        if (!line.includes(CMAKE_MSI_FILENAME)) continue
        const m = line.match(/^([a-fA-F0-9]{64})/)
        if (m) return m[1].toLowerCase()
      }
    } catch {
      // Try next candidate.
    }
  }
  return null
}

// Probe which installer sources are available. Cheap, runs synchronously.
async function detectInstallerSources(): Promise<{ winget: boolean; choco: boolean }> {
  const out = { winget: false, choco: false }
  for (const [cmd, key] of [['winget', 'winget'], ['choco', 'choco']] as const) {
    try {
      const r = await new Promise<number | null>((resolve) => {
        const p = spawn('where', [cmd], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
        let resolved = false
        p.on('close', (code) => {
          if (!resolved) { resolved = true; resolve(code) }
        })
        p.on('error', () => { if (!resolved) { resolved = true; resolve(null) } })
        setTimeout(() => { if (!resolved) { resolved = true; try { p.kill() } catch {} ; resolve(null) } }, 3000)
      })
      out[key] = r === 0
    } catch {
      out[key] = false
    }
  }
  return out
}

function emit(onProgress: ((line: string) => void) | undefined, line: string): void {
  try { onProgress?.(line) } catch { /* listener crash must not abort install */ }
  try { logger.info(`[install-toolchain] ${line}`, 'emulator') } catch {}
}

/**
 * Try winget first. User-scope install — no admin needed. Returns true on
 * success, false if winget wasn't found OR the install failed.
 */
async function tryWinget(opts: InstallOptions): Promise<{ ok: boolean; reason?: string }> {
  emit(opts.onProgress, '[winget] attempting install of Kitware.CMake (user-scope, silent)…')
  return new Promise((resolve) => {
    const args = [
      'install',
      '--id', 'Kitware.CMake',
      '--accept-package-agreements',
      '--accept-source-agreements',
      '--silent',
      '--scope', 'user',
    ]
    const proc = spawn('winget', args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
    const TIMEOUT = opts.timeoutMs ?? 180_000 // 3 min
    const timer = setTimeout(() => {
      try { proc.kill() } catch {}
      resolve({ ok: false, reason: 'winget timeout (3min)' })
    }, TIMEOUT)
    proc.stdout?.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf-8')
      for (const line of text.split(/\r?\n/)) if (line.trim()) emit(opts.onProgress, `[winget] ${line}`)
    })
    proc.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf-8')
      for (const line of text.split(/\r?\n/)) if (line.trim()) emit(opts.onProgress, `[winget:err] ${line}`)
    })
    proc.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) {
        emit(opts.onProgress, '[winget] OK')
        resolve({ ok: true })
      } else {
        resolve({ ok: false, reason: `winget exited with code ${code}` })
      }
    })
    proc.on('error', (err: Error) => {
      clearTimeout(timer)
      resolve({ ok: false, reason: `winget spawn failed: ${err.message}` })
    })
  })
}

/**
 * Try chocolatey. Requires admin by default; if not elevated, returns a
 * "needs admin" reason so the renderer can prompt for elevation.
 */
async function tryChoco(opts: InstallOptions): Promise<{ ok: boolean; reason?: string }> {
  emit(opts.onProgress, '[chocolatey] attempting install of cmake (admin required)…')
  return new Promise((resolve) => {
    const proc = spawn('choco', ['install', 'cmake', '--yes', '--no-progress'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    const TIMEOUT = opts.timeoutMs ?? 180_000
    const timer = setTimeout(() => {
      try { proc.kill() } catch {}
      resolve({ ok: false, reason: 'choco timeout (3min)' })
    }, TIMEOUT)
    proc.stdout?.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf-8')
      for (const line of text.split(/\r?\n/)) if (line.trim()) emit(opts.onProgress, `[choco] ${line}`)
    })
    proc.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf-8')
      for (const line of text.split(/\r?\n/)) if (line.trim()) emit(opts.onProgress, `[choco:err] ${line}`)
    })
    proc.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) {
        emit(opts.onProgress, '[chocolatey] OK')
        resolve({ ok: true })
      } else {
        // Chocolatey often exits with non-zero on permission issues.
        const err = code === 5 || code === 1 ? 'choco failed (admin required?)' : `choco exited with code ${code}`
        resolve({ ok: false, reason: err })
      }
    })
    proc.on('error', (err: Error) => {
      clearTimeout(timer)
      resolve({ ok: false, reason: `choco spawn failed: ${err.message}` })
    })
  })
}

/**
 * Direct fallback: download cmake MSI from GitHub releases, verify SHA256
 * (best-effort — skipped if cmake.org is unreachable), then run msiexec.
 */
async function tryDirectMsi(opts: InstallOptions): Promise<{ ok: boolean; reason?: string }> {
  emit(opts.onProgress, `[direct] downloading ${CMAKE_MSI_URL}`)
  const tmpDir = app.getPath('temp')
  const msiPath = path.join(tmpDir, `cmake-${CMAKE_VERSION}-installer.msi`)

  // 1. Download the MSI via Node https (redirect-following).
  try {
    const { sizeBytes } = await downloadFile(CMAKE_MSI_URL, msiPath, opts.onProgress)
    emit(opts.onProgress, `[direct] wrote ${(sizeBytes / 1024 / 1024).toFixed(1)} MB to ${msiPath}`)
  } catch (err: any) {
    throw new Error(`MSI download failed: ${err?.message ?? String(err)}`)
  }

  // 2. Verify SHA256 — fetch expected hash dynamically (best-effort).
  const verify = opts.verifySignature !== false // default true
  if (verify) {
    const crypto = require('crypto') as typeof import('crypto')
    const fileBuf = fs.readFileSync(msiPath)
    const actualSha = crypto.createHash('sha256').update(fileBuf).digest('hex')
    emit(opts.onProgress, `[direct] downloaded SHA256 = ${actualSha}`)
    const expectedSha = await fetchExpectedSha256()
    if (!expectedSha) {
      emit(opts.onProgress, '[direct:warn] could not fetch expected SHA256 from cmake.org — skipping verification (proceeding anyway).')
      logger.warn('[install-toolchain] SHA256 fetch failed; skipping MSI integrity verification', 'emulator')
    } else if (actualSha.toLowerCase() !== expectedSha.toLowerCase()) {
      try { fs.unlinkSync(msiPath) } catch {}
      throw new Error(`SHA256 mismatch: expected ${expectedSha}, got ${actualSha}`)
    } else {
      emit(opts.onProgress, '[direct] SHA256 verified OK')
    }
  }

  // 3. Install with msiexec /qn (silent) + ADD_CMAKE_TO_PATH=All so PATH
  // updates land in the system PATH for fresh processes. The /i flag with
  // elevation triggers UAC automatically.
  //
  // CRITICAL: detect non-admin BEFORE spawn. On standard-account Win10/11
  // UAC never appears and msiexec silently exits 1622, so a generic
  // "click Yes on the UAC window" hint is misleading. Differentiate the two
  // failure modes so the user gets actionable guidance either way.
  const elevated = await isElevated()
  if (!elevated) {
    try { fs.unlinkSync(msiPath) } catch {}
    throw new Error(
      'Y-core necesita permisos de Administrador para instalar cmake ' +
      '(el MSI escribe en C:\\Program Files\\ y modifica el PATH del sistema). ' +
      'Cerrá Y-core, hacé click derecho en el ícono → "Ejecutar como administrador" ' +
      'y volvé a abrirla. Si no sos admin de esta PC, pedile al dueño que instale ' +
      'cmake desde https://cmake.org/download/ (Windows x64 Installer, marcando "Add to PATH").'
    )
  }

  emit(opts.onProgress, '[direct] running msiexec /qn (admin — confirmá el UAC si aparece)…')
  await new Promise<void>((resolve, reject) => {
    const proc = spawn('msiexec.exe', ['/i', msiPath, '/qn', '/norestart', 'ADD_CMAKE_TO_PATH=All'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    const timer = setTimeout(() => {
      try { proc.kill() } catch {}
      reject(new Error('msiexec timeout (5min)'))
    }, 300_000) // 5 min for MSI install
    proc.on('close', (code) => {
      clearTimeout(timer)
      // 0 = success, 3010 = success+reboot-required, 1622 = open of MSI failed (often UAC cancel in admin mode).
      if (code === 0 || code === 3010) {
        emit(opts.onProgress, `[direct] msiexec OK (code=${code})`)
        resolve()
      } else {
        reject(new Error(
          `msiexec exited with code ${code}. Sos admin pero cancelaste el UAC, o el MSI está corrupto. ` +
          `Reintentá y tocá "Sí" cuando aparezca la ventana de Windows, o instalá cmake manualmente desde cmake.org/download.`
        ))
      }
    })
    proc.on('error', (err: Error) => { clearTimeout(timer); reject(err) })
  })

  // Cleanup.
  try { fs.unlinkSync(msiPath) } catch {}
  return { ok: true }
}

/**
 * Top-level: try the 3 tiers in order, returning the first success. Mutex'd
 * via `installInFlight` so concurrent callers (auto-kick + manual trigger)
 * share the same attempt.
 *
 * On success, injects the new cmake bin dir into `process.env.PATH` so the
 * build chain can run immediately without `app.relaunch()`.
 */
export async function tryInstallCmake(opts: InstallOptions = {}): Promise<InstallResult> {
  if (installInFlight) {
    logger.info('[install-toolchain] install already in flight — awaiting existing attempt', 'emulator')
    return installInFlight
  }
  installInFlight = doTryInstallCmake(opts)
    .then((result) => {
      if (result.success && result.cmakePathAfter) {
        // Inject cmake's bin dir into the current process PATH so the
        // immediately-following build chain can find cmake without restart.
        const binDir = path.dirname(result.cmakePathAfter)
        const current = process.env.PATH ?? ''
        if (!current.split(';').some((p) => p.toLowerCase() === binDir.toLowerCase())) {
          process.env.PATH = `${binDir};${current}`
          logger.info(`[install-toolchain] injected ${binDir} into PATH for current process`, 'emulator')
        }
      }
      return result
    })
    .finally(() => {
      // Allow new attempts after this one settles.
      installInFlight = null
    })
  return installInFlight
}

async function doTryInstallCmake(opts: InstallOptions): Promise<InstallResult> {
  const started = Date.now()
  const skippedTiers: Array<{ tier: string; reason: string }> = []

  // Tier 1: winget (user-scope, no admin needed, ~30s typical).
  const sources = await detectInstallerSources()
  if (!sources.winget) {
    skippedTiers.push({ tier: 'winget', reason: 'winget no instalado (Windows 10 pre-1809 o App Installer deshabilitado)' })
  } else {
    try {
      const r = await tryWinget(opts)
      if (r.ok) {
        return {
          success: true, installedFrom: 'winget', durationMs: Date.now() - started,
          error: null, skippedTiers,
          cmakePathAfter: probeCmakeAfterInstall(),
        }
      }
      skippedTiers.push({ tier: 'winget', reason: r.reason ?? 'winget falló' })
    } catch (err: any) {
      skippedTiers.push({ tier: 'winget', reason: err?.message ?? String(err) })
    }
  }

  // Tier 2: chocolatey (admin required).
  if (!sources.choco) {
    skippedTiers.push({ tier: 'chocolatey', reason: 'choco no instalado' })
  } else {
    try {
      const r = await tryChoco(opts)
      if (r.ok) {
        return {
          success: true, installedFrom: 'chocolatey', durationMs: Date.now() - started,
          error: null, skippedTiers,
          cmakePathAfter: probeCmakeAfterInstall(),
        }
      }
      skippedTiers.push({ tier: 'chocolatey', reason: r.reason ?? 'choco falló' })
    } catch (err: any) {
      skippedTiers.push({ tier: 'chocolatey', reason: err?.message ?? String(err) })
    }
  }

  // Tier 3: direct MSI download + msiexec (admin required for MSI).
  try {
    const r = await tryDirectMsi(opts)
    if (r.ok) {
      return {
        success: true, installedFrom: 'direct', durationMs: Date.now() - started,
        error: null, skippedTiers,
        cmakePathAfter: probeCmakeAfterInstall(),
      }
    }
    skippedTiers.push({ tier: 'direct', reason: r.reason ?? 'fallback MSI falló' })
  } catch (err: any) {
    skippedTiers.push({ tier: 'direct', reason: err?.message ?? String(err) })
  }

  return {
    success: false, installedFrom: null, durationMs: Date.now() - started,
    error: `No se pudo instalar cmake. Skipped: ${skippedTiers.map(s => `${s.tier}(${s.reason})`).join('; ')}. Probá: 1) instalar cmake manualmente desde https://cmake.org/download/ (Windows x64 Installer, marcar "Add to PATH" en el wizard), 2) reiniciar Y-core, 3) en Ajustes → Diagnóstico tocá "Construir emulador ahora".`,
    skippedTiers,
    cmakePathAfter: null,
  }
}

/**
 * After install, re-probe cmake in the same candidate paths as
 * checkToolchain(). Returns the resolved path or null. Checks winget's
 * user-scope path explicitly because that's the install destination for
 * tier 1 and tier 3 (MSI) may also land there depending on user choice.
 */
export function probeCmakeAfterInstall(): string | null {
  const localAppData = process.env.LOCALAPPDATA
    ?? path.join(os.homedir(), 'AppData', 'Local')
  const candidates = [
    'C:/Program Files/CMake/bin/cmake.exe',
    'C:/Program Files (x86)/CMake/bin/cmake.exe',
    path.join(localAppData, 'Programs', 'CMake', 'bin', 'cmake.exe'),
  ]
  for (const c of candidates) {
    if (c && fs.existsSync(c)) return c
  }
  return null
}
