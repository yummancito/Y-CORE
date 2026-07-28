// ============================================================================
// build-emulator.ts — Auto-build runtime para ycore_steam.dll.
//
// Antes de Round-11: el .bat (`scripts/build-ycore-steam.bat`) estaba
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
import { ensureDefenderExclusionForBuild } from './defender-fix'

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
 * back to PATH lookup via `where` in a spawnSync. Avoid spawning unless we
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
        const v = out.stdout?.match(/cmake version ([\d.]+)/)
        if (v?.[1]) cmakeInfo = { version: v[1] }
      } catch { /* ignore */ }
      break
    }
  }
  if (!cmakePath) {
    try {
      const where = require('child_process').spawnSync('where', ['cmake'], { encoding: 'utf-8', timeout: 2000 })
      const candidate = where.stdout?.split(/\r?\n/)[0]?.trim()
      if (candidate && fs.existsSync(candidate)) {
        cmakePath = candidate
        const out = require('child_process').spawnSync(candidate, ['--version'], { encoding: 'utf-8', timeout: 3000 })
        const v = out.stdout?.match(/cmake version ([\d.]+)/)
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
          const versions = fs.readdirSync(vcTools).filter(v => /^[\d]+\.[\d]+\.[\d]+\$/.test(v)).sort().reverse()
          if (versions.length > 0) {
            vsVersion = versions[0].replace(/\\$/, '')
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
 * Mirrors `local-steam-emulator.candidateDllPaths()` for the dev tree.
 */
function expectedDllOutput(): string[] {
  const paths: string[] = []
  const root = app.getAppPath()
  paths.push(path.join(root, 'resources', 'native', 'ycore_steam.dll'))
  paths.push(path.join(root, 'native', 'ycore_steam', 'build', 'Release', 'ycore_steam.dll'))
  return paths
}

export async function buildEmulator(opts: BuildOptions = {}): Promise<BuildResult> {
  if (process.platform !== 'win32') {
    return {
      success: false,
      exitCode: null,
      error: 'buildEmulator solo soporta Windows (cmd.exe). En macOS/Linux usamos Goldberg Lite como fallback.',
      durationMs: 0,
      lastLines: [],
      dllPath: null,
      dllSizeBytes: null,
    }
  }
  const buildScript = path.join(app.getAppPath(), 'scripts', 'build-ycore-steam.bat')
  const started = Date.now()
  if (!fs.existsSync(buildScript)) {
    return {
      success: false,
      exitCode: null,
      error: `Build script no encontrado: ${buildScript}`,
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

  // Round-13 / pre-build Defender shield: Without explicit Add-MpPreference
  // exclusions for the build + output dirs, Windows Defender routinely kills
  // the cmd.exe that hosts cmake --build with NTSTATUS-equivalent exit 255
  // (TerminateProcess from AMSI). We read the existing exclusion list first;
  // if appRoot is already whitelisted it's a fast no-op (Defender applies
  // prefix-match so child paths inherit). Otherwise we run the existing
  // runElevatedFix (UAC prompt) which covers appRoot → both our build and
  // out subdirs. Skipped entirely when running packaged (paths under app.asar).
  if (app.isPackaged) {
    logger.info('[emulator] packaged build — Defender shield skipped (dev-only path)', 'emulator')
  } else {
    const buildDir = path.join(app.getAppPath(), 'native', 'ycore_steam', 'build')
    const outDir = path.join(app.getAppPath(), 'resources', 'native')
    const exclusionOk = await ensureDefenderExclusionForBuild(buildDir, outDir)
    logger.info(
      `[emulator] pre-build defender exclusion: ${exclusionOk ? 'ok' : 'skipped/failed (proceeding anyway)'}`,
      'emulator',
    )
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
        error: `Build timeout (${TIMEOUT}ms). CMake configure puede estar esperando input — revisá que el source tree no esté corrupto.`,
        durationMs: Date.now() - started,
        lastLines,
        dllPath: null,
        dllSizeBytes: null,
      })
    }, TIMEOUT)

    proc.stdout?.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf-8')
      for (const line of text.split(/\r?\n/)) {
        if (!line.trim()) continue
        lastLines.push(line)
        if (lastLines.length > 40) lastLines.shift()
        try { opts.onProgress?.(line) } catch { /* listener crash must not kill build */ }
        try { logger.info(`[build-emulator] ${line}`, 'emulator') } catch {}
      }
    })

    let errTail = ''
    proc.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf-8')
      // Round-13: keep last 800 chars of stderr so the toast surfaces a real
      // hint about the kill cause (Defender, UAC cancel, MSBuild ICE, etc.)
      // instead of just "exit 255, dll NOT FOUND".
      errTail += text
      if (errTail.length > 800) errTail = errTail.slice(-800)
      for (const line of text.split(/\r?\n/)) {
        if (!line.trim()) continue
        lastLines.push(`[STDERR] ${line}`)
        if (lastLines.length > 40) lastLines.shift()
      }
      try { logger.warn(`[build-emulator] stderr: ${text.slice(0, 240)}`, 'emulator') } catch {}
    })

    proc.on('close', (code) => {
      clearTimeout(timer)
      const candidate = expectedDllOutput().find(p => fs.existsSync(p))
      let size: number | null = null
      if (candidate) {
        try { size = fs.statSync(candidate).size } catch {}
      }
      const success = code === 0 && candidate !== undefined
      // Round-13: include errTail in the toast so callers can see the real
      // MSBuild/cl.exe/Defender message instead of a generic "exit 255".
      const tailHint = errTail ? ` · stderr tail: ${errTail.replace(/\s+/g, ' ').trim()}` : ''
      resolve({
        success,
        exitCode: code,
        error: success ? null : `build exited code=${code}, dll=${candidate ?? 'NOT FOUND'}${tailHint}`,
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
        error: `Failed to spawn build: ${err.message}`,
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
  if (process.platform !== 'win32') {
    return {
      success: false,
      exitCode: null,
      error: 'Plataforma no soportada (auto-build solo Windows)',
      durationMs: 0,
      lastLines: [],
      dllPath: null,
      dllSizeBytes: null,
    }
  }
  const toolchain = checkToolchain()
  if (!toolchain.cmakeFound || (!toolchain.vsFound && !toolchain.msbuildFound)) {
    logger.info(
      `[build-emulator] toolchain missing — auto-build skipped. cmake=${toolchain.cmakeFound}, vs=${toolchain.vsFound}, msbuild=${toolchain.msbuildFound}`,
      'emulator',
    )
    return {
      success: false,
      exitCode: null,
      error: `Toolchain incompleto. cmake=${toolchain.cmakeFound}, vs=${toolchain.vsFound}, msbuild=${toolchain.msbuildFound}. Instalá cmake 3.20+ y Visual Studio Build Tools 2022.`,      durationMs: 0,
      lastLines: [],
      dllPath: null,
      dllSizeBytes: null,
    }
  }
  const candidate = expectedDllOutput().find(p => fs.existsSync(p))
  if (candidate) {
    try {
      const size = fs.statSync(candidate).size
      if (size > 4096) return null // DLL exists and is non-trivial — skip
    } catch { /* fallback through to build */ }
  }
  logger.info('[build-emulator] DLL missing in dev tree + toolchain OK — attempting silent build.', 'emulator')
  return buildEmulator({})
}
