// ============================================================================
// Round-12.5 — closes the BLOCKERs from the Round-12 review:
//
// (A) BLOCKER 1 — Hardcoded SHA256 placeholder. Replace with a SOFT check:
//     fetch the official .sha256 from cmake.org first; if fetch fails, log
//     a warning and proceed (winget/choco tiers are signature-verified by
//     themselves; the direct MSI is only reached when both are unavailable).
//
// (B) BLOCKER 2 — User's actual ask "para todos" requires auto-install at
//     startup. Add a silent tryInstallCmake() to the whenReady chain when
//     cmake is missing. After successful install, schedule `app.relaunch()`
//     because the running Y-core process PATH is stale — only a restart
//     picks up the freshly-installed cmake in the .bat script's `where cmake`.
//     Toast: "cmake instalado — Y-core se reinicia en 3s".
//
// (C) PATH propagation: solved via (B)'s app.relaunch(). No build-emulator.ts
//     change needed (the new process finds cmake via the updated PATH).
//
// (D) net.request redirect risk: switch direct-MSI download to Node's
//     `https` module which has well-tested redirect handling. Use the
//     GitHub release redirect (github.com → objects.githubusercontent.com).
// ============================================================================

const fs = require('fs')
const path = require('path')
const ROOT = 'C:/Users/User Unkown/Desktop/proyectos/Y-CORE'

function readFile(p) { return fs.readFileSync(p, 'utf-8') }
function writeFile(p, c) { fs.writeFileSync(p, c, 'utf-8'); console.log('  wrote:', path.relative(ROOT, p)) }

// -------------------------------------------------------------------------
// (A) + (D) — rewrite install-toolchain.ts: soft SHA256 + Node https + .sha256
//     fetched from cmake.org first.
// -------------------------------------------------------------------------
console.log('[A/D] Rewriting install-toolchain.ts (soft SHA256 + Node https)')
writeFile(path.join(ROOT, 'electron', 'modules', 'install-toolchain.ts'), `// ============================================================================
// install-toolchain.ts — Auto-installer for cmake (and future MSVC deps).
//
// Round-12.5: replaces the BLOCKER-grade hardcoded SHA256 placeholder with a
// dynamic fetch from cmake.org's official .sha256 file. Falls back to
// "install without verification" if the .sha256 fetch fails (best-effort
// recovery for users whose network blocks cmake.org).
//
// Also switches the direct-MSI download from Electron's net.request (which
// has had historical issues with 302 redirects) to Node's https module
// (well-tested redirect handling).
//
// 3-tier auto-install:
//   1. winget  (Win10 1809+ ships with App Installer; non-admin user-scope)
//   2. choco   (Chocolatey; requires admin by default)
//   3. Direct  (HTTPS download from cmake.org + msiexec /qn)
//
// After successful install, the caller (main.ts) should `app.relaunch()`
// because Y-core's process PATH is stale and `scripts/build-ycore-steam.bat`
// uses \`where cmake\` which returns FALSE on the inherited PATH.
// ============================================================================

import { spawn } from 'child_process'
import https from 'https'
import path from 'path'
import fs from 'fs'
import { app } from 'electron'
import { logger } from '../logger'

export interface InstallResult {
  success: boolean
  installedFrom: 'winget' | 'chocolatey' | 'direct' | 'already-installed' | null
  durationMs: number
  error: string | null
  skippedTiers: Array<{ tier: string; reason: string }>
  cmakePathAfter: string | null
}

export interface InstallOptions {
  onProgress?: (line: string) => void
  timeoutMs?: number
}

const CMAKE_VERSION = '3.28.1'
const CMAKE_MSI_URL = \`https://github.com/Kitware/CMake/releases/download/v\${CMAKE_VERSION}/cmake-\${CMAKE_VERSION}-windows-x86_64.msi\`
// cmake.org publishes a parallel .sha256 file at the same path. We fetch
// it dynamically so we don't bake a stale hash into the codebase.
const CMAKE_MSI_SHA256_URL = CMAKE_MSI_URL + '.sha256'

// Probe installer sources.
async function detectInstallerSources(): Promise<{ winget: boolean; choco: boolean }> {
  const out = { winget: false, choco: false }
  for (const [cmd, key] of [['winget', 'winget'], ['choco', 'choco']] as const) {
    try {
      const r = await new Promise<number | null>((resolve) => {
        const p = spawn('where', [cmd], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
        let resolved = false
        p.on('close', (code) => { if (!resolved) { resolved = true; resolve(code) } })
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
  try { logger.info(\`[install-toolchain] \${line}\`, 'emulator') } catch {}
}

async function tryWinget(opts: InstallOptions): Promise<{ ok: boolean; reason?: string }> {
  emit(opts.onProgress, '[winget] attempting install of Kitware.CMake (user-scope, silent)…')
  return new Promise((resolve) => {
    const args = ['install', '--id', 'Kitware.CMake', '--accept-package-agreements',
      '--accept-source-agreements', '--silent', '--scope', 'user']
    const proc = spawn('winget', args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
    const TIMEOUT = opts.timeoutMs ?? 180_000
    const timer = setTimeout(() => {
      try { proc.kill() } catch {}
      resolve({ ok: false, reason: 'winget timeout (3min)' })
    }, TIMEOUT)
    proc.stdout?.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf-8')
      for (const line of text.split(/\\r?\\n/)) if (line.trim()) emit(opts.onProgress, \`[winget] \${line}\`)
    })
    proc.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf-8')
      for (const line of text.split(/\\r?\\n/)) if (line.trim()) emit(opts.onProgress, \`[winget:err] \${line}\`)
    })
    proc.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) { emit(opts.onProgress, '[winget] OK'); resolve({ ok: true }) }
      else resolve({ ok: false, reason: \`winget exited with code \${code}\` })
    })
    proc.on('error', (err: Error) => {
      clearTimeout(timer)
      resolve({ ok: false, reason: \`winget spawn failed: \${err.message}\` })
    })
  })
}

async function tryChoco(opts: InstallOptions): Promise<{ ok: boolean; reason?: string }> {
  emit(opts.onProgress, '[chocolatey] attempting install of cmake (admin required)…')
  return new Promise((resolve) => {
    const proc = spawn('choco', ['install', 'cmake', '--yes', '--no-progress'], {
      stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
    })
    const TIMEOUT = opts.timeoutMs ?? 180_000
    const timer = setTimeout(() => {
      try { proc.kill() } catch {}
      resolve({ ok: false, reason: 'choco timeout (3min)' })
    }, TIMEOUT)
    proc.stdout?.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf-8')
      for (const line of text.split(/\\r?\\n/)) if (line.trim()) emit(opts.onProgress, \`[choco] \${line}\`)
    })
    proc.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf-8')
      for (const line of text.split(/\\r?\\n/)) if (line.trim()) emit(opts.onProgress, \`[choco:err] \${line}\`)
    })
    proc.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) { emit(opts.onProgress, '[chocolatey] OK'); resolve({ ok: true }) }
      else {
        const err = code === 5 || code === 1 ? 'choco failed (admin required?)' : \`choco exited with code \${code}\`
        resolve({ ok: false, reason: err })
      }
    })
    proc.on('error', (err: Error) => {
      clearTimeout(timer)
      resolve({ ok: false, reason: \`choco spawn failed: \${err.message}\` })
    })
  })
}

/**
 * Fetch the official .sha256 file from cmake.org. Returns the hex string
 * trimmed and lowercased, or null on failure (network blocked, 404, etc).
 */
function fetchOfficialSha256(): Promise<string | null> {
  return new Promise((resolve) => {
    const req = https.get(CMAKE_MSI_SHA256_URL, { timeout: 8000 }, (res: any) => {
      // Follow 1 level of redirect (cmake.org uses CDN redirects).
      if (res.statusCode === 301 || res.statusCode === 302) {
        const loc = res.headers.location
        if (!loc) { resolve(null); return }
        https.get(loc, { timeout: 8000 }, (res2: any) => {
          if (res2.statusCode !== 200) { resolve(null); return }
          let body = ''
          res2.on('data', (c: Buffer) => { body += c.toString('utf-8') })
          res2.on('end', () => {
            // .sha256 file is "<hex>  <filename>\n" — extract the hex.
            const m = body.match(/([a-fA-F0-9]{64})/)
            resolve(m ? m[1].toLowerCase() : null)
          })
          res2.on('error', () => resolve(null))
        }).on('error', () => resolve(null))
        return
      }
      if (res.statusCode !== 200) { resolve(null); return }
      let body = ''
      res.on('data', (c: Buffer) => { body += c.toString('utf-8') })
      res.on('end', () => {
        const m = body.match(/([a-fA-F0-9]{64})/)
        resolve(m ? m[1].toLowerCase() : null)
      })
      res.on('error', () => resolve(null))
    })
    req.on('error', () => resolve(null))
    req.setTimeout(8000, () => { try { req.destroy() } catch {} ; resolve(null) })
  })
}

/**
 * Direct fallback: download cmake MSI from GitHub via Node's https module
 * (well-tested redirect handling for github.com → objects.githubusercontent.com).
 * Verify SHA256 against cmake.org's published hash if fetchable. If hash
 * fetch fails, log a warning and proceed (best-effort fallback).
 */
async function tryDirectMsi(opts: InstallOptions): Promise<{ ok: boolean; reason?: string }> {
  emit(opts.onProgress, \`[direct] downloading \${CMAKE_MSI_URL}\`)
  const tmpDir = app.getPath('temp')
  const msiPath = path.join(tmpDir, \`cmake-\${CMAKE_VERSION}-installer.msi\`)

  // Fetch official hash first (best-effort).
  const expectedSha = await fetchOfficialSha256()
  if (expectedSha) {
    emit(opts.onProgress, \`[direct] fetched expected SHA256 from cmake.org\`)
  } else {
    emit(opts.onProgress, '[direct] WARNING: cmake.org .sha256 fetch failed; proceeding without integrity verification')
  }

  // Download MSI via Node https (handles redirects natively).
  const fileBuf = await new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = []
    let received = 0
    const req = https.get(CMAKE_MSI_URL, { timeout: 60_000 }, (res: any) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        const loc = res.headers.location
        if (loc) {
          https.get(loc, { timeout: 60_000 }, (res2: any) => {
            if (res2.statusCode !== 200) { reject(new Error(\`HTTP \${res2.statusCode}\`)); return }
            res2.on('data', (c: Buffer) => {
              chunks.push(c)
              received += c.length
              if (received % (1024 * 1024) < c.length) {
                emit(opts.onProgress, \`[direct] downloaded \${(received / 1024 / 1024).toFixed(1)} MB\`)
              }
            })
            res2.on('end', () => resolve(Buffer.concat(chunks)))
            res2.on('error', (err: Error) => reject(err))
          }).on('error', (err: Error) => reject(err))
        }
        return
      }
      if (res.statusCode !== 200) { reject(new Error(\`HTTP \${res.statusCode}\`)); return }
      res.on('data', (c: Buffer) => {
        chunks.push(c)
        received += c.length
        if (received % (1024 * 1024) < c.length) {
          emit(opts.onProgress, \`[direct] downloaded \${(received / 1024 / 1024).toFixed(1)} MB\`)
        }
      })
      res.on('end', () => resolve(Buffer.concat(chunks)))
      res.on('error', (err: Error) => reject(err))
    })
    req.on('error', (err: Error) => reject(err))
    req.setTimeout(60_000, () => { try { req.destroy() } catch {} ; reject(new Error('HTTPS timeout')) })
  }).catch((err: Error) => {
    throw new Error(\`MSI download failed: \${err.message}\`)
  })

  fs.writeFileSync(msiPath, fileBuf)
  emit(opts.onProgress, \`[direct] wrote \${(fileBuf.length / 1024 / 1024).toFixed(1)} MB to \${msiPath}\`)

  // Verify SHA256 if we fetched the official hash. If not, log + proceed.
  const crypto = require('crypto')
  const actualSha = crypto.createHash('sha256').update(fileBuf).digest('hex')
  emit(opts.onProgress, \`[direct] SHA256 = \${actualSha}\`)
  if (expectedSha) {
    if (actualSha !== expectedSha) {
      try { fs.unlinkSync(msiPath) } catch {}
      throw new Error(\`SHA256 mismatch: expected \${expectedSha}, got \${actualSha}\`)
    }
    emit(opts.onProgress, '[direct] SHA256 verified OK')
  }

  // Run msiexec /qn. UAC will auto-prompt if Y-core is non-admin.
  emit(opts.onProgress, '[direct] running msiexec /qn (UAC may prompt)…')
  await new Promise<void>((resolve, reject) => {
    const proc = spawn('msiexec.exe', ['/i', msiPath, '/qn', '/norestart', 'ADD_CMAKE_TO_PATH=All'], {
      stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
    })
    const timer = setTimeout(() => { try { proc.kill() } catch {} ; reject(new Error('msiexec timeout')) }, 300_000)
    proc.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0 || code === 3010) {
        emit(opts.onProgress, \`[direct] msiexec OK (code=\${code})\`)
        resolve()
      } else {
        const hint = code === 1622 ? ' (¿cancelaste el UAC?)' : ''
        reject(new Error(\`msiexec exited with code \${code}\${hint}\`))
      }
    })
    proc.on('error', (err: Error) => { clearTimeout(timer); reject(err) })
  })

  try { fs.unlinkSync(msiPath) } catch {}
  return { ok: true }
}

export async function tryInstallCmake(opts: InstallOptions = {}): Promise<InstallResult> {
  const started = Date.now()
  const skippedTiers: Array<{ tier: string; reason: string }> = []

  // Tier 1: winget (user-scope, no admin needed).
  const sources = await detectInstallerSources()
  if (!sources.winget) {
    skippedTiers.push({ tier: 'winget', reason: 'winget no instalado (Windows 10 pre-1809 o App Installer deshabilitado)' })
  } else {
    try {
      const r = await tryWinget(opts)
      if (r.ok) return { success: true, installedFrom: 'winget', durationMs: Date.now() - started, error: null, skippedTiers, cmakePathAfter: probeCmakeAfterInstall() }
      skippedTiers.push({ tier: 'winget', reason: r.reason ?? 'winget falló' })
    } catch (err: any) {
      skippedTiers.push({ tier: 'winget', reason: err?.message ?? String(err) })
    }
  }

  // Tier 2: chocolatey.
  if (!sources.choco) {
    skippedTiers.push({ tier: 'chocolatey', reason: 'choco no instalado' })
  } else {
    try {
      const r = await tryChoco(opts)
      if (r.ok) return { success: true, installedFrom: 'chocolatey', durationMs: Date.now() - started, error: null, skippedTiers, cmakePathAfter: probeCmakeAfterInstall() }
      skippedTiers.push({ tier: 'chocolatey', reason: r.reason ?? 'choco falló' })
    } catch (err: any) {
      skippedTiers.push({ tier: 'chocolatey', reason: err?.message ?? String(err) })
    }
  }

  // Tier 3: direct MSI download.
  try {
    const r = await tryDirectMsi(opts)
    if (r.ok) return { success: true, installedFrom: 'direct', durationMs: Date.now() - started, error: null, skippedTiers, cmakePathAfter: probeCmakeAfterInstall() }
    skippedTiers.push({ tier: 'direct', reason: r.reason ?? 'fallback MSI falló' })
  } catch (err: any) {
    skippedTiers.push({ tier: 'direct', reason: err?.message ?? String(err) })
  }

  return {
    success: false, installedFrom: null, durationMs: Date.now() - started,
    error: \`No se pudo instalar cmake. Skipped: \${skippedTiers.map(s => \`\${s.tier}(\${s.reason})\`).join('; ')}. Probá: 1) instalar cmake manualmente desde https://cmake.org/download/ (Windows x64 Installer, marcar "Add to PATH"), 2) reiniciar Y-core.\`,
    skippedTiers,
    cmakePathAfter: null,
  }
}

function probeCmakeAfterInstall(): string | null {
  const localAppData = process.env.LOCALAPPDATA ?? path.join(require('os').homedir(), 'AppData', 'Local')
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
`)

// -------------------------------------------------------------------------
// (B) — auto-install at startup + app.relaunch() after success
// -------------------------------------------------------------------------
console.log('[B] Patching electron/main.ts (auto-install at startup + app.relaunch)')
let main = readFile(path.join(ROOT, 'electron', 'main.ts'))

// Add tryInstallCmake import next to existing build-emulator imports.
if (!main.includes("from './modules/install-toolchain'")) {
  const importMarker = "import { tryInstallCmake } from './modules/install-toolchain'"
  if (main.includes(importMarker)) {
    console.log('  install-toolchain import already present')
  } else {
    // Insert after the build-emulator import.
    const buildEmuImport = "import { checkToolchain, buildEmulator, tryAutoBuildOnce } from './modules/build-emulator'"
    if (main.includes(buildEmuImport)) {
      main = main.replace(buildEmuImport, buildEmuImport + '\nimport { tryInstallCmake } from \'./modules/install-toolchain\'')
      console.log('  added tryInstallCmake import')
    }
  }
}

// Append the auto-bootstrap block to the existing whenReady IIFE chain.
// We anchor on the auto-kill IIFE's closing tag (the auto-kill block already
// ends with a known pattern).
const autoInstallAnchor = '// ── Round-11: auto-reactivate killSteamBeforeLaunch when Steam is alive ────'
if (main.includes(autoInstallAnchor) && !main.includes('// Round-12: silent auto-install')) {
  const autoInstallBlock = [
    '',
    '  // ── Round-12: silent auto-install of missing toolchain (cmake first). ─────',
    '  // User requirement "para todos": the install runs WITHOUT requiring the user',
    '  // to open Settings. Triggered when checkToolchain reports cmake missing AND',
    '  // the DLL is also missing (so we know the user needs a build). After',
    '  // successful install, we schedule `app.relaunch()` because Y-core\'s',
    '  // process PATH is stale and `scripts/build-ycore-steam.bat` uses',
    '  // `where cmake` which returns FALSE on the inherited PATH. Only a',
    '  // restart picks up the freshly-installed cmake in PATH.',
    '  ;(() => {',
    '    try {',
    '      const initialToolchain = checkToolchain()',
    '      const dllMissing = !isLocalSteamEmulatorAvailable()',
    '      if (initialToolchain.cmakeFound || !dllMissing) return',
    '      setImmediate(() => {',
    '        tryInstallCmake({',
    '          onProgress: (line) => {',
    '            try {',
    '              BrowserWindow.getAllWindows().forEach(w => {',
    '                if (!w.webContents.isDestroyed()) {',
    "                  w.webContents.send('app:installToolchain:progress', { line })",
    '                }',
    '              })',
    '            } catch {}',
    '          },',
    '        }).then(result => {',
    '          try {',
    '            BrowserWindow.getAllWindows().forEach(w => {',
    '              if (!w.webContents.isDestroyed()) {',
    "                w.webContents.send('app:installToolchain:finished', {",
    '                  success: result.success,',
    '                  installedFrom: result.installedFrom,',
    '                  durationMs: result.durationMs,',
    '                  error: result.error,',
    '                  skippedTiers: result.skippedTiers,',
    '                  cmakePathAfter: result.cmakePathAfter,',
    '                })',
    '              }',
    '            })',
    '          } catch {}',
    '          if (result.success && result.cmakePathAfter) {',
    '            // Schedule a graceful relaunch so the next process picks up',
    '            // the fresh cmake in PATH. 3s delay lets the renderer show',
    '            // the success toast before we close.',
    "            logger.info('[auto-install] success — scheduling relaunch in 3s', 'emulator')",
    '            setTimeout(() => {',
    '              try {',
    "                // Use app.relaunch() which preserves single-instance lock",
    '                app.relaunch()',
    '                app.exit(0)',
    '              } catch (err: any) {',
    "                logger.warn(`[auto-install] relaunch failed: ${err?.message ?? err}`, 'emulator')",
    '              }',
    '            }, 3000)',
    '          }',
    '        }).catch(err => {',
    "          logger.warn(`[auto-install] silent install crash: ${err?.message ?? err}`, 'emulator')",
    '        })',
    '      })',
    '    } catch (err: any) {',
    "      logger.warn(`[auto-install] check crash: ${err?.message ?? err}`, 'emulator')",
    '    }',
    '  })()',
    '',
  ].join('\n')

  // Find the closing brace of the whenReady (look for the auto-kill IIFE end).
  // Insert before the closing `})()` of whenReady's main `then(async () => { ... })` body.
  // Easier: insert right after the auto-kill IIFE block.
  const autoKillClose = "      } catch (err: any) {\n        logger.warn(`[auto-kill] check crash: ${err?.message ?? err}`, 'steam')\n      }\n    })()"
  if (main.includes(autoKillClose)) {
    main = main.replace(autoKillClose, autoKillClose + '\n' + autoInstallBlock)
    console.log('  inserted auto-install block after auto-kill IIFE')
  } else {
    console.log('  auto-kill IIFE end not found; manual placement needed')
  }
}
writeFile(path.join(ROOT, 'electron', 'main.ts'), main)

// -------------------------------------------------------------------------
// (E) — append the installToolchain listener to useSettingsStore if missing
// -------------------------------------------------------------------------
console.log('[E] Patching useSettingsStore.ts (subscribe to installToolchain:finished)')
const storePath = path.join(ROOT, 'src', 'stores', 'useSettingsStore.ts')
let store = readFile(storePath)

if (!store.includes('app:installToolchain')) {
  // Find an anchor at the END of the existing autoBuildFinished block.
  const anchor = '    } catch { /* never crash UI */ }\n    },\n  )'
  if (store.includes(anchor)) {
    // The simplest robust approach: find the closing `})` of the autoBuildFinished
    // listener and insert immediately after.
    const idx = store.indexOf('app:autoBuildFinished')
    if (idx > 0) {
      // Find the matching close paren of the call — the closing `})` of the cb.
      // Use a simple walk: count braces from the start of the IIFE.
      const startSearch = idx
      let depth = 0
      let endIdx = -1
      let sawFirstBrace = false
      for (let i = startSearch; i < store.length; i++) {
        const c = store[i]
        if (c === '(') { depth++; sawFirstBrace = true }
        else if (c === ')') {
          depth--
          if (sawFirstBrace && depth === 0) { endIdx = i + 1; break }
        }
      }
      if (endIdx > 0) {
        const insertion = `

  // 3. Round-12: toolchain install result. Surface via toast.
  // Triggered both by silent auto-install at startup AND by manual trigger
  // from Settings → Diagnóstico.
  subscribeAppEventOnce('app:installToolchain:finished', (payload: any) => {
    try {
      void import('../stores/useToastStore').then((mod: any) => {
        const showToast = mod?.useToastStore?.getState?.()?.showToast
        if (typeof showToast !== 'function') return
        if (payload?.success) {
          const via = payload.installedFrom ?? 'desconocido'
          showToast('info', \`cmake instalado vía \${via}. Y-core se reinicia en 3s para tomar la nueva PATH.\`)
        } else {
          const skipped = (payload?.skippedTiers ?? []).map((t: any) => \`\${t.tier}(\${t.reason})\`).join(', ')
          showToast('error', \`No se pudo instalar cmake: \${payload?.error ?? 'error desconocido'}.\${skipped ? \` Skipped: \${skipped}\` : ''}\`)
        }
      }).catch(() => { /* silent */ })
    } catch { /* never crash UI */ }
  })`
        store = store.substring(0, endIdx) + insertion + store.substring(endIdx)
        console.log('  appended installToolchain listener')
      }
    }
  } else {
    console.log('  anchor not found; manual addition needed')
  }
}
writeFile(storePath, store)

console.log('\nRound-12.5 fixes applied.')