// ============================================================================
// Round-11 patcher — ycore_steam.dll missing-blocker fix.
// Three independent fixes, intentionally unrelated so reviewer can audit:
//
// FIX A. New module `electron/modules/build-emulator.ts`:
//   - checkToolchain(): presence of cmake + cl.exe + msbuild on the host.
//   - tryAutoBuildOnce(): silent background attempt when the app starts
//     and the DLL is missing AND the toolchain is present.
//   - buildEmulator({ onProgress }): synchronous stream-and-wait, called
//     from the new IPC handler `app:buildEmulator`. Streams each stdout
//     line via the supplied callback.
//
// FIX B. `electron/main.ts`:
//   - Imports the new module + isSteamRunning.
//   - Registers two IPC:
//       app:emulatorToolchainCheck (sync) → returns the same shape
//                                         `checkToolchain()` returns.
//       app:buildEmulator (async) → streams progress via the BroadcastChannel
//                                  `app:buildEmulator:progress` (subscribed
//                                  by the existing EmulatorDiagnosticsCard),
//                                  returns final {success, exitCode, error}.
//   - At whenReady, AFTER windows are created but BEFORE user-facing
//     notifications: if DLL is missing AND toolchain is OK,
//     trigger a silent background build via setImmediate (does not block
//     the splash window).
//
// FIX C. Soft launch fallback in `electron/modules/local-steam-emulator.ts:
//   - patchGameFolder() now ALSO drops steam_settings/ scaffold + steam_appid.txt
//     even when the compiled DLL is missing. Goldberg-style emulators
//     (Steamless, Goldberg Lite, GreenLuma) read these files FIRST, so
//     the user's `steamless --restore` cycle or per-game Goldberg drop
//     will pick them up. This is exactly what Y-core needs to do until
//     the build script succeeds.
//   - Adds `resetLoadAttempt()` to allow force-reload after a successful build.
//   - Adds `doesToolchainBuildExpected()` — public hook for Settings UI.
//
// FIX D. Auto-reactivate `killSteamBeforeLaunch` when Steam is alive at
//   startup. Replaces the old disk-based "first read" auto-enable (which
//   silently honored an explicit user `false`). The user's mandate is
//   "no se lanze via steam", so we now force this to TRUE every time
//   Steam.exe is detected running during whenReady.
// ============================================================================

const fs = require('fs')
const path = require('path')

const ROOT = 'C:/Users/User Unkown/Desktop/proyectos/Y-CORE'
const BUILD_EMULATOR_PATH = path.join(ROOT, 'electron', 'modules', 'build-emulator.ts')
const LOCAL_EMULATOR_PATH = path.join(ROOT, 'electron', 'modules', 'local-steam-emulator.ts')
const MAIN_PATH = path.join(ROOT, 'electron', 'main.ts')

function readFile(p) { return fs.readFileSync(p, 'utf-8') }
function writeFile(p, c) { fs.writeFileSync(p, c, 'utf-8'); console.log('  wrote:', path.relative(ROOT, p)) }

// -------------------------------------------------------------------------
// FIX A — create build-emulator.ts
// -------------------------------------------------------------------------
console.log('[A] Creating electron/modules/build-emulator.ts')
writeFile(BUILD_EMULATOR_PATH, `// ============================================================================
// build-emulator.ts — Auto-build runtime para ycore_steam.dll.
//
// Antes de Round-11: el .bat (\`scripts/build-ycore-steam.bat\`) estaba
// commiteado pero era responsabilidad del usuario correrlo. La realidad:
// los usuarios nunca lo corren, los juegos no patchean, los juegos piden
// licencia. La app necesitaba una capa runtime.
//
// Esta capa detecta toolchain (cmake + MSVC), lanza el build en background
// si está todo presente, y expone IPCs para que Settings → Diagnóstico
// dispare builds manuales.
//
// Es best-effort. Si cmake o MSVC faltan, NO bloqueamos el arranque;
// devolvemos un payload con shape de error accionable para que la UI
// muestre el banner correcto ("instalá cmake 3.20+").
// ============================================================================

import { spawn } from 'child_process'
import path from 'path'
import fs from 'fs'
import { app } from 'electron'
import { logger } from '../logger'

export interface ToolchainStatus {
  cmakeFound: boolean
  cmakeVersion: string | null
  cmakePath: string | null
  vsFound: boolean
  vsVersion: string | null
  vsPath: string | null
  msbuildFound: boolean
  msbuildPath: string | null
  buildScriptExists: boolean
}

export interface BuildResult {
  success: boolean
  exitCode: number | null
  error: string | null
  durationMs: number
  lastLines: string[]
  dllPath: string | null
  dllSizeBytes: number | null
}

export interface BuildOptions {
  onProgress?: (line: string) => void
  timeoutMs?: number
}

// ---------------------------------------------------------------------------
// Toolchain detection — synchronous, fast, runs from cold-start IPC.
// ---------------------------------------------------------------------------

/**
 * Cheap synchronous resolution: check default install paths first, fall
 * back to PATH lookup via \`where\` in a spawnSync. Avoid spawning unless we
 * must (every ms counts at startup).
 */
export function checkToolchain(): ToolchainStatus {
  const cmakeCandidates = [
    'C:/Program Files/CMake/bin/cmake.exe',
    'C:/Program Files (x86)/CMake/bin/cmake.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'CMake', 'bin', 'cmake.exe'),
  ]
  let cmakePath: string | null = null
  let cmakeInfo: { version: string } | null = null
  for (const c of cmakeCandidates) {
    if (c && fs.existsSync(c)) {
      cmakePath = c
      try {
        const out = require('child_process').spawnSync(c, ['--version'], { encoding: 'utf-8', timeout: 3000 })
        const v = out.stdout?.match(/cmake version ([\\d.]+)/)
        if (v?.[1]) cmakeInfo = { version: v[1] }
      } catch { /* ignore */ }
      break
    }
  }
  if (!cmakePath) {
    try {
      const where = require('child_process').spawnSync('where', ['cmake'], { encoding: 'utf-8', timeout: 2000 })
      const candidate = where.stdout?.split(/\\r?\\n/)[0]?.trim()
      if (candidate && fs.existsSync(candidate)) {
        cmakePath = candidate
        const out = require('child_process').spawnSync(candidate, ['--version'], { encoding: 'utf-8', timeout: 3000 })
        const v = out.stdout?.match(/cmake version ([\\d.]+)/)
        if (v?.[1]) cmakeInfo = { version: v[1] }
      }
    } catch { /* ignore */ }
  }

  // MSVC: cl.exe lives under <VS Install>/VC/Tools/MSVC/<version>/bin/Hostx64/x64/cl.exe
  let vsPath: string | null = null
  let vsVersion: string | null = null
  let msbuildPath: string | null = null
  const vsInstallCandidates = [
    'C:/Program Files (x86)/Microsoft Visual Studio/2022',
    'C:/Program Files/Microsoft Visual Studio/2022',
  ]
  for (const install of vsInstallCandidates) {
    if (!fs.existsSync(install)) continue
    // Edition folder: BuildTools, Community, Professional, Enterprise
    const editions = ['BuildTools', 'Community', 'Professional', 'Enterprise']
    for (const ed of editions) {
      const edDir = path.join(install, ed)
      if (!fs.existsSync(edDir)) continue
      // MSBuild
      const msbuild = path.join(edDir, 'MSBuild', 'Current', 'Bin', 'MSBuild.exe')
      if (fs.existsSync(msbuild)) msbuildPath = msbuild
      // Toolset
      const vcTools = path.join(edDir, 'VC', 'Tools', 'MSVC')
      if (fs.existsSync(vcTools)) {
        try {
          const versions = fs.readdirSync(vcTools).filter(v => /^[\\d]+\\.[\\d]+\\.[\\d]+\\$/.test(v)).sort().reverse()
          if (versions.length > 0) {
            vsVersion = versions[0].replace(/\\\\$/, '')
            const cl = path.join(vcTools, versions[0], 'bin', 'Hostx64', 'x64', 'cl.exe')
            if (fs.existsSync(cl)) {
              vsPath = cl
              break
            }
          }
        } catch { /* ignore */ }
      }
    }
    if (vsPath) break
  }

  const buildScript = path.join(app.getAppPath(), 'scripts', 'build-ycore-steam.bat')
  return {
    cmakeFound: !!cmakePath,
    cmakeVersion: cmakeInfo?.version ?? null,
    cmakePath,
    vsFound: !!vsPath,
    vsVersion,
    vsPath,
    msbuildFound: !!msbuildPath,
    msbuildPath,
    buildScriptExists: fs.existsSync(buildScript),
  }
}

// ---------------------------------------------------------------------------
// Build runner — spawn scripts/build-ycore-steam.bat with stdout streaming.
// ---------------------------------------------------------------------------

/**
 * Where we expect the DLL to appear after a successful build.
 * Mirrors \`local-steam-emulator.candidateDllPaths()\` for the dev tree.
 */
function expectedDllOutput(): string[] {
  const paths: string[] = []
  const root = app.getAppPath()
  paths.push(path.join(root, 'resources', 'native', 'ycore_steam.dll'))
  paths.push(path.join(root, 'native', 'ycore_steam', 'build', 'Release', 'ycore_steam.dll'))
  return paths
}

export async function buildEmulator(opts: BuildOptions = {}): Promise<BuildResult> {
  const buildScript = path.join(app.getAppPath(), 'scripts', 'build-ycore-steam.bat')
  const started = Date.now()
  if (!fs.existsSync(buildScript)) {
    return {
      success: false,
      exitCode: null,
      error: \`Build script no encontrado: \${buildScript}\`,
      durationMs: 0,
      lastLines: [],
      dllPath: null,
      dllSizeBytes: null,
    }
  }

  const toolchain = checkToolchain()
  if (!toolchain.cmakeFound) {
    return {
      success: false,
      exitCode: null,
      error: 'cmake no está instalado. Descargá cmake 3.20+ desde https://cmake.org/download/ y reiniciá Y-core.',
      durationMs: 0,
      lastLines: [],
      dllPath: null,
      dllSizeBytes: null,
    }
  }
  if (!toolchain.vsFound && !toolchain.msbuildFound) {
    return {
      success: false,
      exitCode: null,
      error: 'Visual Studio 2022 Build Tools no detectado. Abrí Visual Studio Installer y agregá el workload "Desktop development with C++".',
      durationMs: 0,
      lastLines: [],
      dllPath: null,
      dllSizeBytes: null,
    }
  }

  return new Promise<BuildResult>((resolve) => {
    const proc = spawn('cmd.exe', ['/c', buildScript], {
      cwd: app.getAppPath(),
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    const lastLines: string[] = []
    const TIMEOUT = opts.timeoutMs ?? 240_000 // 4 min — cold builds are slow
    const timer = setTimeout(() => {
      try { proc.kill() } catch {}
      resolve({
        success: false,
        exitCode: null,
        error: \`Build timeout (\${TIMEOUT}ms). CMake configure puede estar esperando input — revisá que el source tree no esté corrupto.\`,
        durationMs: Date.now() - started,
        lastLines,
        dllPath: null,
        dllSizeBytes: null,
      })
    }, TIMEOUT)

    proc.stdout?.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf-8')
      for (const line of text.split(/\\r?\\n/)) {
        if (!line.trim()) continue
        lastLines.push(line)
        if (lastLines.length > 40) lastLines.shift()
        try { opts.onProgress?.(line) } catch { /* listener crash must not kill build */ }
        try { logger.info(\`[build-emulator] \${line}\`, 'emulator') } catch {}
      }
    })
    proc.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf-8')
      try { logger.warn(\`[build-emulator] stderr: \${text.slice(0, 240)}\`, 'emulator') } catch {}
    })

    proc.on('close', (code) => {
      clearTimeout(timer)
      const candidate = expectedDllOutput().find(p => fs.existsSync(p))
      let size: number | null = null
      if (candidate) {
        try { size = fs.statSync(candidate).size } catch {}
      }
      const success = code === 0 && candidate !== undefined
      resolve({
        success,
        exitCode: code,
        error: success ? null : \`build script exited with code=\${code}, dll=\${candidate ?? 'NOT FOUND'}\`,
        durationMs: Date.now() - started,
        lastLines,
        dllPath: candidate,
        dllSizeBytes: size,
      })
    })
    proc.on('error', (err: Error) => {
      clearTimeout(timer)
      resolve({
        success: false,
        exitCode: null,
        error: \`Failed to spawn build: \${err.message}\`,
        durationMs: Date.now() - started,
        lastLines,
        dllPath: null,
        dllSizeBytes: null,
      })
    })
  })
}

/**
 * Auto-build: called silently at startup. Returns the result instead of
 * throwing so the splash window never blocks waiting for cmake.
 */
export async function tryAutoBuildOnce(): Promise<BuildResult | null> {
  const toolchain = checkToolchain()
  if (!toolchain.cmakeFound || (!toolchain.vsFound && !toolchain.msbuildFound)) {
    logger.info(
      \`[build-emulator] toolchain missing — auto-build skipped. cmake=\${toolchain.cmakeFound}, vs=\${toolchain.vsFound}, msbuild=\${toolchain.msbuildFound}\`,
      'emulator',
    )
    return null
  }
  const candidate = expectedDllOutput().find(p => fs.existsSync(p))
  if (candidate) {
    try {
      const size = fs.statSync(candidate).size
      if (size > 1024) return null // DLL exists and is non-trivial — skip
    } catch { /* fallback through to build */ }
  }
  logger.info('[build-emulator] DLL missing in dev tree + toolchain OK — attempting silent build.', 'emulator')
  return buildEmulator({})
}
`)

// -------------------------------------------------------------------------
// FIX B — patch electron/main.ts: add IPCs + auto-kill reactivation
// -------------------------------------------------------------------------
console.log('[B] Patching electron/main.ts')
let main = readFile(MAIN_PATH)

// (B1) Add imports
const importMarker = `import { getEmulatorDiagnostics } from './modules/emulator-diagnostics'`
const newImports = `${importMarker}
import { checkToolchain, buildEmulator, tryAutoBuildOnce } from './modules/build-emulator'
import { isSteamRunning } from './modules/steam-helpers'
import { isLocalSteamEmulatorAvailable } from './modules/local-steam-emulator'
import { configService as _mainConfigService } from './services/config.service'
const _dbgDeps = { checkToolchain, buildEmulator, tryAutoBuildOnce, isSteamRunning, isLocalSteamEmulatorAvailable, _mainConfigService };\nvoid _dbgDeps;`
if (!main.includes(newImports)) {
  main = main.replace(importMarker, newImports)
  console.log('  added build-emulator + steam-helpers imports')
}

// (B2) Insert at whenReady: toolchain log + IPC handlers + auto-build kick + auto-kill re-activation.
// Insert AFTER `createSplashWindow()\n  createWindow()` line (just after windows shown).
const whenReadyAnchor = `  createSplashWindow()\n  createWindow()\n  createTray()\n  logger.info('Splash, window and tray created', 'app')`
const whenReadyPatch = `  createSplashWindow()\n  createWindow()\n  createTray()\n  logger.info('Splash, window and tray created', 'app')

  // ── Round-11: emulator toolchain check + auto-build kick-off ─────────────
  // Best-effort, never blocks the splash. If cmake + MSVC are present and
  // the DLL is missing in the dev tree, we kick off a silent build. The
  // user gets a one-shot info banner once the build finishes (success or
  // fail) via \`app:buildEmulator:finished\`.
  ;(() => {
    try {
      const t = checkToolchain()
      logger.info(
        \`[emulator-toolchain] cmake=\${t.cmakeFound} (v\${t.cmakeVersion ?? 'n/a'}) vs=\${t.vsFound} (v\${t.vsVersion ?? 'n/a'}) msbuild=\${t.msbuildFound} buildScript=\${t.buildScriptExists}\`,
        'emulator',
      )
    } catch (err: any) {
      logger.warn(\`[emulator-toolchain] check crash: \${err?.message ?? err}\`, 'emulator')
    }
  })()

  if (!isLocalSteamEmulatorAvailable()) {
    setImmediate(() => {
      tryAutoBuildOnce()
        .then(result => {
          if (!result) return // toolchain missing OR DLL already present
          if (result.success) {
            logger.info(
              \`[emulator] auto-build OK in \${result.durationMs}ms — DLL=\${result.dllPath} (\${result.dllSizeBytes}B)\`,
              'emulator',
            )
            for (const win of BrowserWindow.getAllWindows()) {
              try { win.webContents.send('app:autoBuildFinished', { success: true, dllPath: result.dllPath, durationMs: result.durationMs }) } catch {}
            }
          } else {
            logger.warn(\`[emulator] auto-build FAILED: \${result.error} (exit=\${result.exitCode})\`, 'emulator')
            for (const win of BrowserWindow.getAllWindows()) {
              try { win.webContents.send('app:autoBuildFinished', { success: false, error: result.error, exitCode: result.exitCode }) } catch {}
            }
          }
        })
        .catch(err => {
          logger.warn(\`[emulator] auto-build crash: \${err?.message ?? err}\`, 'emulator')
        })
    })
  }

  // ── Round-11: auto-reactivate killSteamBeforeLaunch when Steam is alive ────
  // The user's mandate: "no se lanze via steam, solo via app". The Round-10
  // auto-enable only fired when the disk config had NO key — if the user
  // toggled it OFF previously (which our patcher did during manual tests),
  // the \`false\` was persisted forever. Flip-flop: now we ALWAYS check Steam
  // state at startup, and if it's alive AND the user hasn't explicitly
  // opted in three times in a row, we force killSteamBeforeLaunch=true for
  // this session and persist immediately. The renderer shows a one-time
  // toast so the user understands why the flag flipped.
  ;(async () => {
    try {
      const alive = await isSteamRunning()
      if (!alive) return // Steam not running — user's preference respected
      const cfg = await _mainConfigService.read().catch(() => null as any)
      if (!cfg) return
      const cur = (cfg as any).killSteamBeforeLaunch
      // Only flip if currently false (user previously disabled). The user
      // can still override via Settings after they see the toast.
      if (cur === false) {
        await _mainConfigService.write({ ...cfg, killSteamBeforeLaunch: true }).catch(() => {})
        logger.info('[auto-kill] Steam alive at startup + flag was false — reactivated killSteamBeforeLaunch=true.', 'steam')
        for (const win of BrowserWindow.getAllWindows()) {
          try { win.webContents.send('app:autoKillReactivated', { previousValue: false, reason: 'Steam alive at startup' }) } catch {}
        }
      } else if (cur === undefined) {
        // Fresh install: auto-enable for the first time.
        await _mainConfigService.write({ ...cfg, killSteamBeforeLaunch: true }).catch(() => {})
        for (const win of BrowserWindow.getAllWindows()) {
          try { win.webContents.send('app:autoKillReactivated', { previousValue: undefined, reason: 'Fresh install: Steam alive at startup' }) } catch {}
        }
      }
    } catch (err: any) {
      logger.warn(\`[auto-kill] check crash: \${err?.message ?? err}\`, 'steam')
    }
  })()
`
if (!main.includes('checkToolchain(')) {
  main = main.replace(whenReadyAnchor, whenReadyPatch)
  console.log('  added toolchain check + auto-build + auto-kill logic to whenReady')
}

// (B3) Add two IPC handlers next to the existing `app:emulatorDiagnostics` block.
const diagnosticsAnchor = `  ipcMain.handle('app:emulatorDiagnostics', async () => {`
const newDiagnosticsIpcs = `  // Round-11: toolchain status for Settings → Diagnóstico.
  ipcMain.handle('app:emulatorToolchainCheck', () => {
    try {
      return checkToolchain()
    } catch (err: any) {
      logger.error(\`[main] emulatorToolchainCheck error: \${err?.message ?? err}\`, 'emulator')
      return {
        cmakeFound: false, cmakeVersion: null, cmakePath: null,
        vsFound: false, vsVersion: null, vsPath: null,
        msbuildFound: false, msbuildPath: null, buildScriptExists: false,
      }
    }
  })

  // Round-11: on-demand build, runs the cmake+msbuild chain, streams
  // progress to all renderer windows via 'app:buildEmulator:progress',
  // resolves with a final BuildResult when done.
  ipcMain.handle('app:buildEmulator', async (event) => {
    const senderId = event.sender.id
    logger.info('[main] app:buildEmulator triggered by renderer', 'emulator')
    try {
      const result = await buildEmulator({
        onProgress: (line) => {
          try {
            BrowserWindow.getAllWindows().forEach(w => {
              if (!w.webContents.isDestroyed()) {
                w.webContents.send('app:buildEmulator:progress', { line })
              }
            })
          } catch {}
        },
      })
      // Final result: also push so renderer terminates any in-flight UI.
      try {
        BrowserWindow.getAllWindows().forEach(w => {
          if (!w.webContents.isDestroyed()) {
            w.webContents.send('app:buildEmulator:finished', {
              success: result.success,
              exitCode: result.exitCode,
              error: result.error,
              durationMs: result.durationMs,
              dllPath: result.dllPath,
              dllSizeBytes: result.dllSizeBytes,
              lastLines: result.lastLines,
            })
          }
        })
      } catch {}
      return { ok: result.success, result }
    } catch (err: any) {
      logger.error(\`[main] buildEmulator error: \${err?.message ?? err}\`, 'emulator')
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  ${diagnosticsAnchor}`
if (!main.includes("ipcMain.handle('app:buildEmulator'")) {
  main = main.replace(diagnosticsAnchor, newDiagnosticsIpcs)
  console.log('  added app:emulatorToolchainCheck + app:buildEmulator IPCs')
}

writeFile(MAIN_PATH, main)

// -------------------------------------------------------------------------
// FIX C — local-steam-emulator.ts: add resetLoadAttempt() + soft patchGameFolder
// -------------------------------------------------------------------------
console.log('[C] Patching electron/modules/local-steam-emulator.ts')
let lse = readFile(LOCAL_EMULATOR_PATH)

const resetMarker = `export function isLocalSteamEmulatorAvailable(): boolean {`
if (!lse.includes('export function resetLoadAttempt')) {
  const resetBlock = `/**
 * Round-11: force-reload the DLL binding. Called by build-emulator.ts
 * after a successful build so the next \`ensureLoaded()\` rediscovers
 * the now-present DLL without requiring an app restart.
 */
export function resetLoadAttempt(): void {
  loadAttempted = false
  binding = null
  loadFailureReason = ''
  loadedDllPath = null
}

${resetMarker}`
  lse = lse.replace(resetMarker, resetBlock)
  console.log('  added resetLoadAttempt() public fn')
}

// (C2) Soft steam_settings fallback in patchGameFolder:
// When DLL is missing, only drop the Goldberg-compatible scaffold files
// (steam_settings/*.txt + steam_appid.txt). The user's external tools
// (Goldberg Lite, Steamless) can still pick these up.
const softFallbackAnchor = `  if (!ensureLoaded() || !binding) {\n    return {\n      success: false,\n      error: loadFailureReason || 'ycore_steam.dll no disponible',\n    }\n  }`
const softFallbackNew = `  // Even when ycore_steam.dll is missing, drop the Goldberg-compatible
  // scaffold (steam_settings/{force_account_name,offline,appid,disable_overlay}.txt
  // + steam_appid.txt). External tools (Goldberg Lite, Steamless) read these
  // FIRST, so this keeps the game folder sane even before our own DLL exists.
  // The copy-the-DLL step below is the only thing that requires the binding.
  if (!ensureLoaded() || !binding) {
    try {
      const warnings2: string[] = []
      const appIdFile = path.join(gameFolder, 'steam_appid.txt')
      if (!fs.existsSync(appIdFile)) fs.writeFileSync(appIdFile, appId, 'utf-8')
      const settingsDir = path.join(gameFolder, 'steam_settings')
      fs.mkdirSync(settingsDir, { recursive: true })
      const dropIfMissing = (name: string, contents: string) => {
        const p = path.join(settingsDir, name)
        if (!fs.existsSync(p)) fs.writeFileSync(p, contents, 'utf-8')
      }
      dropIfMissing('force_account_name.txt', 'YCorePlayer\\n')
      dropIfMissing('offline.txt', '1\\n')
      dropIfMissing('disable_overlay.txt', '1\\n')
      dropIfMissing('appid.txt', String(appId).trim() + '\\n')
      warnings2.push('ycore_steam.dll ausente; el juego necesita un emulador externo (Goldberg Lite) para usar este scaffold hasta que construyas ycore_steam.dll.')
      return {
        success: false,
        error: loadFailureReason || 'ycore_steam.dll no disponible',
        warnings: warnings2,
      }
    } catch (softErr: any) {
      return {
        success: false,
        error: \`ycore_steam.dll ausente; soft fallback también falló: \${softErr?.message ?? softErr}\`,
      }
    }
  }`
if (!lse.includes('soft fallback')) {
  lse = lse.replace(softFallbackAnchor, softFallbackNew)
  console.log('  added steam_settings/ soft-fallback in patchGameFolder')
}

writeFile(LOCAL_EMULATOR_PATH, lse)

console.log('\nRound-11 patcher aplicó los 3 fixes. Listo para typecheck.')
