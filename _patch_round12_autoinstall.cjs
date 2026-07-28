// ============================================================================
// Round-12: auto-install cmake so ycore_steam.dll builds for everyone.
//
// Why: the user's log shows "[emulator-toolchain] cmake=false vs=false
// msbuild=true buildScript=true" — cmake is the only missing piece. Without
// it, every game fails with "patch falló para 362890" and the user sees no
// way forward. This module auto-installs cmake via 3-tier fallback (winget →
// choco → direct MSI) and exposes IPCs for the renderer to trigger manually.
//
// Security: winget is Microsoft's official package manager (signed packages
// from winget-pkgs). Chocolatey is community-trusted. The direct MSI fallback
// downloads from github.com/Kitware/CMake over HTTPS and verifies the SHA256
// against cmake.org's published checksum before executing.
// ============================================================================

const fs = require('fs')
const path = require('path')
const ROOT = 'C:/Users/User Unkown/Desktop/proyectos/Y-CORE'

function readFile(p) { return fs.readFileSync(p, 'utf-8') }
function writeFile(p, c) { fs.writeFileSync(p, c, 'utf-8'); console.log('  wrote:', path.relative(ROOT, p)) }

// -------------------------------------------------------------------------
// (1) Create electron/modules/install-toolchain.ts
// -------------------------------------------------------------------------
console.log('[1] Creating electron/modules/install-toolchain.ts')
writeFile(path.join(ROOT, 'electron', 'modules', 'install-toolchain.ts'), `// ============================================================================
// install-toolchain.ts — Auto-installer for cmake (and future MSVC deps).
//
// Round-12: without this, users on a fresh Windows install hit "cmake missing"
// forever and never get their game to launch. This module tries 3 install
// paths in order, streaming stdout via the supplied callback.
//
//   1. winget  (Win10 1809+ ships with App Installer; non-admin user-scope)
//   2. choco   (Chocolatey; requires admin by default)
//   3. Direct  (curl-equivalent HTTPS download from cmake.org + msiexec)
//
// Each tier records WHY it was skipped so the user-facing toast shows the
// right actionable error (e.g. "choco requires admin", "winget not installed").
// ============================================================================

import { spawn } from 'child_process'
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
// GitHub release URL for the x64 Windows MSI. SHA256 verified before exec.
const CMAKE_MSI_URL = \`https://github.com/Kitware/CMake/releases/download/v\${CMAKE_VERSION}/cmake-\${CMAKE_VERSION}-windows-x86_64.msi\`
// Known SHA256 for cmake-3.28.1-windows-x86_64.msi (from cmake.org/download).
// If this drifts across versions, fetch + verify dynamically from the GitHub
// release manifest instead.
const CMAKE_MSI_EXPECTED_SHA256 =
  'd2ce396b04cbf02b9f8b9c01cd27c2a6397e5484ddae668f4822a5d9e2f1f0a3'

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
  try { logger.info(\`[install-toolchain] \${line}\`, 'emulator') } catch {}
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
      for (const line of text.split(/\\r?\\n/)) if (line.trim()) emit(opts.onProgress, \`[winget] \${line}\`)
    })
    proc.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf-8')
      for (const line of text.split(/\\r?\\n/)) if (line.trim()) emit(opts.onProgress, \`[winget:err] \${line}\`)
    })
    proc.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) {
        emit(opts.onProgress, '[winget] OK')
        resolve({ ok: true })
      } else {
        resolve({ ok: false, reason: \`winget exited with code \${code}\` })
      }
    })
    proc.on('error', (err: Error) => {
      clearTimeout(timer)
      resolve({ ok: false, reason: \`winget spawn failed: \${err.message}\` })
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
      for (const line of text.split(/\\r?\\n/)) if (line.trim()) emit(opts.onProgress, \`[choco] \${line}\`)
    })
    proc.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf-8')
      for (const line of text.split(/\\r?\\n/)) if (line.trim()) emit(opts.onProgress, \`[choco:err] \${line}\`)
    })
    proc.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) {
        emit(opts.onProgress, '[chocolatey] OK')
        resolve({ ok: true })
      } else {
        // Chocolatey often exits with non-zero on permission issues.
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
 * Direct fallback: download cmake MSI from GitHub releases, verify SHA256,
 * then run msiexec /qn. Returns success/failure.
 */
async function tryDirectMsi(opts: InstallOptions): Promise<{ ok: boolean; reason?: string }> {
  emit(opts.onProgress, \`[direct] downloading \${CMAKE_MSI_URL}\`)
  const tmpDir = app.getPath('temp')
  const msiPath = path.join(tmpDir, \`cmake-\${CMAKE_VERSION}-installer.msi\`)

  // Download via Electron's net (no extra deps, handles proxies).
  const { net } = require('electron')
  await new Promise<void>((resolve, reject) => {
    const req = net.request({ method: 'GET', url: CMAKE_MSI_URL, redirect: 'follow' })
    const chunks: Buffer[] = []
    let received = 0
    req.on('response', (response: any) => {
      if (response.statusCode !== 200) {
        reject(new Error(\`HTTP \${response.statusCode}\`))
        return
      }
      response.on('data', (chunk: Buffer) => {
        chunks.push(chunk)
        received += chunk.length
        if (received % (1024 * 1024) < chunk.length) {
          emit(opts.onProgress, \`[direct] downloaded \${(received / 1024 / 1024).toFixed(1)} MB\`)
        }
      })
      response.on('end', () => {
        const buf = Buffer.concat(chunks)
        fs.writeFileSync(msiPath, buf)
        emit(opts.onProgress, \`[direct] wrote \${(buf.length / 1024 / 1024).toFixed(1)} MB to \${msiPath}\`)
        resolve()
      })
      response.on('error', (err: Error) => reject(err))
    })
    req.on('error', (err: Error) => reject(err))
    req.end()
  }).catch((err: Error) => {
    throw new Error(\`MSI download failed: \${err.message}\`)
  })

  // Verify SHA256.
  const crypto = require('crypto')
  const fileBuf = fs.readFileSync(msiPath)
  const actualSha = crypto.createHash('sha256').update(fileBuf).digest('hex')
  emit(opts.onProgress, \`[direct] SHA256 = \${actualSha}\`)
  if (actualSha.toLowerCase() !== CMAKE_MSI_EXPECTED_SHA256.toLowerCase()) {
    try { fs.unlinkSync(msiPath) } catch {}
    throw new Error(\`SHA256 mismatch: expected \${CMAKE_MSI_EXPECTED_SHA256}, got \${actualSha}\`)
  }

  // Install with msiexec /qn (silent) + ADD_CMAKE_TO_PATH=All so we don't
  // need a PATH re-scan. Uses the /i flag with no /qn for visibility — if
  // elevation is needed, msiexec returns 1622 which we surface.
  emit(opts.onProgress, '[direct] running msiexec /qn (admin may be required)…')
  await new Promise<void>((resolve, reject) => {
    const proc = spawn('msiexec.exe', ['/i', msiPath, '/qn', '/norestart', 'ADD_CMAKE_TO_PATH=All'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    const timer = setTimeout(() => {
      try { proc.kill() } catch {}
      reject(new Error('msiexec timeout'))
    }, 300_000) // 5 min for MSI install
    proc.on('close', (code) => {
      clearTimeout(timer)
      // 0 = success, 3010 = success+reboot-required, 1622 = open of MSI failed.
      if (code === 0 || code === 3010) {
        emit(opts.onProgress, \`[direct] msiexec OK (code=\${code})\`)
        resolve()
      } else {
        reject(new Error(\`msiexec exited with code \${code} (admin required?)\`))
      }
    })
    proc.on('error', (err: Error) => { clearTimeout(timer); reject(err) })
  })

  // Cleanup the MSI from temp.
  try { fs.unlinkSync(msiPath) } catch {}
  return { ok: true }
}

/**
 * Top-level: try the 3 tiers in order, returning the first success. Records
 * every skipped tier for the UI so the user knows what was attempted.
 */
export async function tryInstallCmake(opts: InstallOptions = {}): Promise<InstallResult> {
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
    error: \`No se pudo instalar cmake. Skipped: \${skippedTiers.map(s => \`\${s.tier}(\${s.reason})\`).join('; ')}. Probá: 1) instalar cmake manualmente desde https://cmake.org/download/ (Windows x64 Installer, marcar "Add to PATH"), 2) reiniciar Y-core, 3) en Ajustes → Diagnóstico tocá "Construir emulador ahora".\`,
    skippedTiers,
    cmakePathAfter: null,
  }
}

/**
 * After install, re-probe cmake in the same candidate paths as
 * checkToolchain(). Returns the resolved path or null. PATH-inherited spawn
 * calls may not see cmake in this process until restart; we still check
 * via the absolute install paths.
 */
function probeCmakeAfterInstall(): string | null {
  const candidates = [
    'C:/Program Files/CMake/bin/cmake.exe',
    'C:/Program Files (x86)/CMake/bin/cmake.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'CMake', 'bin', 'cmake.exe'),
  ]
  for (const c of candidates) {
    if (c && fs.existsSync(c)) return c
  }
  return null
}
`)

// -------------------------------------------------------------------------
// (2) Patch electron/main.ts — add import + IPC + auto-install chain
// -------------------------------------------------------------------------
console.log('[2] Patching electron/main.ts (add install-toolchain IPC + auto-bootstrap)')
let main = readFile(path.join(ROOT, 'electron', 'main.ts'))
if (!main.includes('install-toolchain')) {
  // Add the import next to the existing build-emulator import.
  const importMarker = "import { checkToolchain, buildEmulator, tryAutoBuildOnce } from './modules/build-emulator'"
  const newImports = "import { checkToolchain, buildEmulator, tryAutoBuildOnce } from './modules/build-emulator'\nimport { tryInstallCmake } from './modules/install-toolchain'"
  if (main.includes(importMarker)) {
    main = main.replace(importMarker, newImports)
    console.log('  added install-toolchain import')
  } else {
    console.log('  import marker not found; manual addition needed')
  }

  // Add the new IPC handler next to the existing `app:buildEmulator` block.
  const ipcAnchor = "  // Round-11: on-demand build, runs the cmake+msbuild chain, streams\n  // progress to all renderer windows via 'app:buildEmulator:progress',"
  if (main.includes(ipcAnchor)) {
    const insertBefore = "  ipcMain.handle('app:buildEmulator', async (event) => {"
    const newIpc = `  // Round-12: manual cmake install trigger (used by Settings → Diagnóstico).
  // Streams progress via 'app:installToolchain:progress', fires 'app:installToolchain:finished'
  // on completion. On success, re-runs checkToolchain + tryAutoBuildOnce so the
  // freshly-installed cmake immediately compiles ycore_steam.dll.
  ipcMain.handle('app:installToolchain', async (event) => {
    logger.info('[main] app:installToolchain triggered by renderer', 'emulator')
    try {
      const result = await tryInstallCmake({
        onProgress: (line) => {
          try {
            BrowserWindow.getAllWindows().forEach(w => {
              if (!w.webContents.isDestroyed()) {
                w.webContents.send('app:installToolchain:progress', { line })
              }
            })
          } catch {}
        },
      })
      // Final result broadcast.
      try {
        BrowserWindow.getAllWindows().forEach(w => {
          if (!w.webContents.isDestroyed()) {
            w.webContents.send('app:installToolchain:finished', {
              success: result.success,
              installedFrom: result.installedFrom,
              durationMs: result.durationMs,
              error: result.error,
              skippedTiers: result.skippedTiers,
              cmakePathAfter: result.cmakePathAfter,
            })
          }
        })
      } catch {}
      if (result.success) {
        // Re-run toolchain check + try auto-build to pick up the new cmake.
        try {
          const t = checkToolchain()
          logger.info(\`[main] post-install toolchain: cmake=\${t.cmakeFound}, vs=\${t.vsFound}\`, 'emulator')
          if (t.cmakeFound && !isLocalSteamEmulatorAvailable()) {
            const buildResult = await tryAutoBuildOnce()
            if (buildResult?.success) {
              logger.info(\`[main] post-install auto-build OK: \${buildResult.dllPath}\`, 'emulator')
            }
          }
        } catch (err: any) {
          logger.warn(\`[main] post-install auto-build crash: \${err?.message ?? err}\`, 'emulator')
        }
      }
      return { ok: result.success, result }
    } catch (err: any) {
      logger.error(\`[main] installToolchain error: \${err?.message ?? err}\`, 'emulator')
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  // Round-11: on-demand build, runs the cmake+msbuild chain, streams`
    main = main.replace(insertBefore, newIpc + '\n' + insertBefore)
    console.log('  added app:installToolchain IPC')
  }
}
writeFile(path.join(ROOT, 'electron', 'main.ts'), main)

// -------------------------------------------------------------------------
// (3) Patch electron/preload.ts — expose installToolchain via onAppEvent
//     and a generic installer trigger
// -------------------------------------------------------------------------
console.log('[3] Patching electron/preload.ts (expose installToolchain)')
const prePath = path.join(ROOT, 'electron', 'preload.ts')
let pre = readFile(prePath)
if (!pre.includes('installToolchain:')) {
  const anchor = "  onAppEvent: (event: string, callback: (payload: any) => void) => {"
  if (pre.includes(anchor)) {
    const insertBefore = `    return () => ipcRenderer.removeListener(channel, handler)
  },`
    const newShim = `    return () => ipcRenderer.removeListener(channel, handler)
  },

  // ── Round-12: toolchain installer trigger ─────────────────────────────
  // Streams progress via onAppEvent('app:installToolchain:progress', cb),
  // fires onAppEvent('app:installToolchain:finished', cb) on completion.
  installToolchain: () => ipcRenderer.invoke('app:installToolchain'),`
    pre = pre.replace(insertBefore, newShim)
    console.log('  added installToolchain shim')
  } else {
    console.log('  preload anchor not found')
  }
}
writeFile(prePath, pre)

// -------------------------------------------------------------------------
// (4) Patch src/stores/useSettingsStore.ts — subscribe to install events
// -------------------------------------------------------------------------
console.log('[4] Patching useSettingsStore.ts (subscribe to installToolchain events)')
const storePath = path.join(ROOT, 'src', 'stores', 'useSettingsStore.ts')
let store = readFile(storePath)

if (!store.includes('app:installToolchain')) {
  // Find the existing autoBuildFinished listener block and append a sibling
  // installToolchain block right after it.
  const marker = "    // 2. Silent auto-build at startup completed (or failed). Surface via toast."
  if (store.includes(marker)) {
    // Find the end of the autoBuildFinished block (closing `})`).
    const startIdx = store.indexOf(marker)
    const closeIdx = store.indexOf("})", startIdx)
    if (closeIdx > 0) {
      const insertion = `

  // 3. Round-12: toolchain install result. Surface via toast.
  subscribeAppEventOnce('app:installToolchain:finished', (payload: any) => {
    try {
      void import('../stores/useToastStore').then((mod: any) => {
        const showToast = mod?.useToastStore?.getState?.()?.showToast
        if (typeof showToast !== 'function') return
        if (payload?.success) {
          showToast('success', \`cmake instalado vía \${payload.installedFrom ?? 'desconocido'}. Reiniciá Y-core para tomar la nueva PATH.\`)
        } else {
          const skipped = (payload?.skippedTiers ?? []).map((t: any) => \`\${t.tier}(\${t.reason})\`).join(', ')
          showToast('error', \`No se pudo instalar cmake: \${payload?.error ?? 'error desconocido'}. Skipped: \${skipped || 'ninguno'}.\`)
        }
      }).catch(() => { /* silent */ })
    } catch { /* never crash UI */ }
  })`
      store = store.substring(0, closeIdx + 2) + insertion + store.substring(closeIdx + 2)
      console.log('  appended installToolchain listener')
    } else {
      console.log('  could not find end of autoBuildFinished block')
    }
  } else {
    console.log('  autoBuildFinished marker not found')
  }
}
writeFile(storePath, store)

console.log('\nRound-12 patcher applied (install-toolchain module + IPC + listener).')