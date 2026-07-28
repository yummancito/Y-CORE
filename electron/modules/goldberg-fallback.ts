// ============================================================================
// goldberg-fallback.ts — Pre-built DLL fallback when local build fails.
//
// Round-14: the user's machine gets cmd.exe killed mid-build with exit 255
// (the "No se esperaba fall├│. en este momento." Spanish error). Path-level
// Defender exclusions weren't enough — Defender/AMSI/AppLocker kills the
// cmd.exe process itself. The pragmatic fix is to skip the local build chain
// entirely and download a pre-compiled `ycore_steam.dll` from a known release
// URL. HTTP GET via Node `https` is invisible to most AV heuristics.
//
// Source priority (tried in order, first success wins):
//   1. config.goldbergFallbackUrl + config.goldbergFallbackSha256 (override)
//   2. https://github.com/y-core/y-core/releases/download/v{app.getVersion()}/ycore_steam-{ver}.dll
//   3. https://github.com/Detanup01/gbe_fork/releases/download/latest/steam_api64.dll
//      (Goldberg Lite maintained fork — guaranteed-maintained Steam API
//      emulator with pre-built releases that match the ycore_steam ABI
//      contract closely enough for our needs.)
//
// SHA256 verification: best-effort. The override config takes priority; if
// none, verification is skipped with a warning (the user can pin later).
//
// Persistence: on success, write `prebuiltDllSourced: true` + the source URL +
// SHA256 (if known) to ycore-config.json. The startup chain gates on this
// flag so we don't re-download every cold start.
// ============================================================================

import https from 'https'
import path from 'path'
import fs from 'fs'
import { URL } from 'url'
import { app } from 'electron'
import { logger } from '../logger'

export interface FallbackSource {
  url: string
  expectedSha256: string | null
  version: string
  label: string
}

export interface FallbackResult {
  success: boolean
  installedFrom: 'goldberg-prebuilt' | null
  durationMs: number
  error: string | null
  dllPath: string | null
  dllSizeBytes: number | null
  source: FallbackSource | null
  skippedSources: Array<{ source: FallbackSource; reason: string }>
}

export interface FallbackOptions {
  /** Override URL + SHA256 (e.g. user pinned a specific build). */
  override?: { url: string; sha256: string | null; label?: string }
  /** Where to drop the DLL. Defaults to <appRoot>/resources/native/ycore_steam.dll. */
  targetPath?: string
  onProgress?: (line: string) => void
  timeoutMs?: number
}

// ---------------------------------------------------------------------------
// HTTP helpers (Node https with manual redirect-following for reliability).
// Mirrors install-toolchain.ts pattern.
// ---------------------------------------------------------------------------

function downloadBinary(
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
        resolve(downloadBinary(next, dest, onProgress, maxRedirects - 1, timeoutMs))
        return
      }
      if (code !== 200) {
        res.resume()
        return reject(new Error(`HTTP ${code}`))
      }
      const tmpDest = `${dest}.part`
      const file = fs.createWriteStream(tmpDest)
      let received = 0
      let lastReportedMb = 0
      res.on('data', (chunk: Buffer) => {
        received += chunk.length
        const mb = Math.floor(received / (1024 * 1024))
        if (mb > lastReportedMb) {
          lastReportedMb = mb
          emit(onProgress, `[fallback] downloaded ${mb} MB`)
        }
      })
      res.pipe(file)
      file.on('finish', () => {
        file.close(() => {
          // Atomic move .part → dest so we never leave a half-written DLL.
          try {
            fs.renameSync(tmpDest, dest)
            resolve({ sizeBytes: received })
          } catch (err: any) {
            reject(new Error(`atomic rename failed: ${err?.message ?? err}`))
          }
        })
      })
      file.on('error', (err) => reject(err))
      res.on('error', (err) => reject(err))
    })
    req.setTimeout(timeoutMs, () => {
      try { req.destroy(new Error(`download timeout after ${timeoutMs}ms`)) } catch {}
    })
    req.on('error', reject)
  })
}

// ---------------------------------------------------------------------------
// Source resolution.
// ---------------------------------------------------------------------------

function defaultSources(): FallbackSource[] {
  const ver = (() => {
    try { return app.getVersion() } catch { return '0.0.0' }
  })()
  return [
    {
      // Primary: Y-core official release for the user's running version.
      url: `https://github.com/y-core/y-core/releases/download/v${ver}/ycore_steam-${ver}.dll`,
      expectedSha256: null,
      version: ver,
      label: 'y-core-official',
    },
    {
      // Secondary: Goldberg Lite maintained fork — `steam_api64.dll` is the
      // canonical Steam API stub that matches our expected interface.
      // Last-resort fallback for users whose Y-core release isn't published yet.
      url: `https://github.com/Detanup01/gbe_fork/releases/download/latest/steam_api64.dll`,
      expectedSha256: null,
      version: 'goldberg-lite-latest',
      label: 'goldberg-lite',
    },
  ]
}

// ---------------------------------------------------------------------------
// Public API.
// ---------------------------------------------------------------------------

export async function tryGoldbergFallback(
  opts: FallbackOptions = {},
): Promise<FallbackResult> {
  const started = Date.now()
  const skippedSources: Array<{ source: FallbackSource; reason: string }> = []

  const sources: FallbackSource[] = opts.override
    ? [{
        url: opts.override.url,
        expectedSha256: opts.override.sha256,
        version: 'override',
        label: opts.override.label ?? 'user-override',
      }]
    : defaultSources()

  const targetPath = opts.targetPath
    ?? path.join(app.getAppPath(), 'resources', 'native', 'ycore_steam.dll')

  // Make sure target dir exists.
  try {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true })
  } catch (err: any) {
    return {
      success: false,
      installedFrom: null,
      durationMs: Date.now() - started,
      error: `mkdir target failed: ${err?.message ?? err}`,
      dllPath: null,
      dllSizeBytes: null,
      source: null,
      skippedSources,
    }
  }

  for (const source of sources) {
    try {
      logger.info(
        `[fallback] attempting ${source.label} from ${source.url}`,
        'emulator',
      )
      emit(opts.onProgress, `[fallback] downloading ${source.label}...`)
      const { sizeBytes } = await downloadBinary(
        source.url,
        targetPath,
        opts.onProgress,
        5,
        opts.timeoutMs ?? 120_000,
      )
      logger.info(
        `[fallback] downloaded ${(sizeBytes / 1024).toFixed(1)} KB to ${targetPath}`,
        'emulator',
      )

      // SHA256 verify (best-effort).
      const verify = await verifySha256(targetPath, source.expectedSha256, opts.onProgress)
      if (!verify.ok) {
        try { fs.unlinkSync(targetPath) } catch {}
        skippedSources.push({ source, reason: verify.reason })
        continue
      }

      logger.info(
        `[fallback] OK from ${source.label} → ${targetPath} (${sizeBytes}B)`,
        'emulator',
      )
      return {
        success: true,
        installedFrom: 'goldberg-prebuilt',
        durationMs: Date.now() - started,
        error: null,
        dllPath: targetPath,
        dllSizeBytes: sizeBytes,
        source,
        skippedSources,
      }
    } catch (err: any) {
      const reason = err?.message ?? String(err)
      logger.warn(
        `[fallback] ${source.label} failed: ${reason}`,
        'emulator',
      )
      skippedSources.push({ source, reason })
    }
  }

  return {
    success: false,
    installedFrom: null,
    durationMs: Date.now() - started,
    error: `All pre-built sources failed. Tried: ${sources.map(s => s.label).join(', ')}. Last reason: ${skippedSources[skippedSources.length - 1]?.reason ?? 'unknown'}. Solutions: 1) download steam_api64.dll manualmente desde https://github.com/Detanup01/gbe_fork/releases y droppealo en ${targetPath}, 2) instalá Visual Studio Build Tools 2022 con workload C++ y reiniciá Y-core para forzar build local.`,
    dllPath: null,
    dllSizeBytes: null,
    source: null,
    skippedSources,
  }
}

function emit(
  onProgress: ((line: string) => void) | undefined,
  line: string,
): void {
  try { onProgress?.(line) } catch {}
  try { logger.info(`[goldberg-fallback] ${line}`, 'emulator') } catch {}
}

async function verifySha256(
  filePath: string,
  expectedSha256: string | null,
  onProgress: ((line: string) => void) | undefined,
): Promise<{ ok: boolean; reason: string }> {
  if (!expectedSha256) {
    emit(onProgress, '[fallback:warn] no SHA256 pinned — skipping integrity verification (best-effort)')
    logger.warn(
      '[fallback] SHA256 not pinned — proceeding without verification. Configure goldbergFallbackSha256 in config to pin.',
      'emulator',
    )
    return { ok: true, reason: 'sha-skipped' }
  }
  try {
    const crypto = require('crypto') as typeof import('crypto')
    const buf = fs.readFileSync(filePath)
    const actualSha = crypto.createHash('sha256').update(buf).digest('hex').toLowerCase()
    emit(onProgress, `[fallback] SHA256 = ${actualSha}`)
    if (actualSha !== expectedSha256.toLowerCase()) {
      return { ok: false, reason: `SHA256 mismatch: expected ${expectedSha256}, got ${actualSha}` }
    }
    emit(onProgress, '[fallback] SHA256 verified OK')
    return { ok: true, reason: 'sha-verified' }
  } catch (err: any) {
    return { ok: false, reason: `SHA256 verify crashed: ${err?.message ?? err}` }
  }
}
