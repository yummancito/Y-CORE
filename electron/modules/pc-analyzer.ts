// ============================================================================
// electron/modules/pc-analyzer.ts
// ----------------------------------------------------------------------------
// Comprehensive PC analyzer for Y-Core + Steam diagnostics.
// Gathers everything essential so users can send a full report to Discord.
// ============================================================================

import path from 'path'
import fs from 'fs'
import os from 'os'
import { app } from 'electron'
import { logger } from '../logger'
import {
  getSteamPath,
  getSteamBuildId,
  getSteamLibraryFolders,
  getSteamAppsPath,
  getSteamUserId,
  isSteamRunning,
} from './steam-helpers'
import { checkSteamVerification } from './dll-inject'
import { getLocalSteamEmulatorDiagnostics } from './local-steam-emulator'
import { getNativeDiagnostics } from './ycore-native'
import { checkToolchain } from './build-emulator'
import { scanDlls } from './defender-check'

// ============================================================================
// Types
// ============================================================================

export interface PcAnalyzerReport {
  timestamp: string
  ycoreVersion: string
  electronVersion: string

  /** OS & hardware */
  system: {
    platform: string
    arch: string
    cpuCores: number
    totalMemoryMB: number
    freeMemoryMB: number
    hostname: string
    userDataPath: string
    appPath: string
  }

  /** Relevant paths for Steam & Y-Core */
  relevantPaths: {
    path: string
    exists: boolean
    label: string
  }[]

  /** Steam installation */
  steam: {
    found: boolean
    path: string | null
    buildId: string | null
    userId: string | null
    running: boolean
    libraryFolders: string[]
    steamAppsPath: string | null
    configVdf: {
      exists: boolean
      sizeBytes: number | null
      hasDepotsSection: boolean
      depotCount: number
      parseError: string | null
    }
    depotCache: {
      exists: boolean
      fileCount: number
      totalSizeMB: number
    }
    appManifests: {
      totalCount: number
      /** Per-library breakdown */
      byLibrary: { libraryPath: string; count: number }[]
      /** States: 4=ready, 1024=updating, etc. */
      stateSummary: Record<string, number>
      /** Count of manifests with fully downloaded state (StateFlags=4) */
      fullyInstalled: number
    }
  }

  /** Y-Core ownership hook */
  hook: {
    installed: boolean
    missingDlls: string[]
    ycoreToolExists: boolean
    openSteamToolExists: boolean
    dwmapiExists: boolean
    xinputExists: boolean
    hookConsent: boolean
    lastBuildId: string | null
    /** failed_signatures.json entries */
    failedSignatures: string[]
  }

  /** Y-Core native emulator */
  emulator: {
    available: boolean
    dllPath: string | null
    version: string | null
    dllSizeMB: number | null
    failureReason: string | null
    exportCount: number
  }

  /** Y-Core native FFI */
  native: {
    available: boolean
    dllPath: string | null
    version: string | null
    failureReason: string | null
  }

  /** Build toolchain */
  toolchain: {
    cmakeFound: boolean
    cmakeVersion: string | null
    vsFound: boolean
    vsVersion: string | null
    msbuildFound: boolean
  }

  /** Defender / DLL integrity */
  defender: {
    hasMissingCritical: boolean
    hasMissingExpected: boolean
    hasEmptyDlls: boolean
    hasDefenderArtifacts: boolean
    dlls: { name: string; exists: boolean; isEmpty: boolean; sizeKB: number | null }[]
    suggestions: string[]
  }

  /** Issues summary */
  issues: {
    severity: 'critical' | 'warning' | 'info'
    message: string
  }[]

  /** Overall health */
  health: 'ok' | 'warning' | 'critical'
}

// ============================================================================
// Helpers
// ============================================================================

function formatMB(bytes: number): number {
  return Math.round((bytes / (1024 * 1024)) * 10) / 10
}

function formatGB(bytes: number): number {
  return Math.round((bytes / (1024 * 1024 * 1024)) * 10) / 10
}

// ============================================================================
// Steam section
// ============================================================================

async function analyzeSteam(): Promise<PcAnalyzerReport['steam']> {
  const steamPath = getSteamPath()
  const buildId = steamPath ? getSteamBuildId() : null
  const userId = steamPath ? getSteamUserId() : null
  const running = await isSteamRunning()
  const libraryFolders = steamPath ? getSteamLibraryFolders() : []
  const steamAppsPath = steamPath ? getSteamAppsPath() : null

  // config.vdf analysis
  let configVdf: PcAnalyzerReport['steam']['configVdf'] = {
    exists: false,
    sizeBytes: null,
    hasDepotsSection: false,
    depotCount: 0,
    parseError: null,
  }
  if (steamPath) {
    const configPath = path.join(steamPath, 'config', 'config.vdf')
    if (fs.existsSync(configPath)) {
      try {
        const content = fs.readFileSync(configPath, 'utf-8')
        configVdf.exists = true
        configVdf.sizeBytes = Buffer.byteLength(content, 'utf-8')
      // Check for Depots section robustly — look for the VDF key pattern
      const depotIdx = content.indexOf('"Depots"')
      // Also verify it's a proper VDF section (followed by {)
      configVdf.hasDepotsSection = depotIdx >= 0 && /"Depots"\s*\{/.test(content.slice(Math.max(0, depotIdx - 5), depotIdx + 12))
        if (configVdf.hasDepotsSection) {
          const depotMatches = content.match(/"DecryptionKey"/g)
          configVdf.depotCount = depotMatches ? depotMatches.length : 0
        }
      } catch (err: any) {
        configVdf.parseError = err?.message ?? String(err)
      }
    }
  }

  // depotcache analysis
  let depotCache: PcAnalyzerReport['steam']['depotCache'] = {
    exists: false,
    fileCount: 0,
    totalSizeMB: 0,
  }
  if (steamPath) {
    const depotCachePath = path.join(steamPath, 'depotcache')
    if (fs.existsSync(depotCachePath)) {
      depotCache.exists = true
      try {
        const files = fs.readdirSync(depotCachePath)
        depotCache.fileCount = files.length
        let totalBytes = 0
        for (const file of files) {
          try {
            totalBytes += fs.statSync(path.join(depotCachePath, file)).size
          } catch {}
        }
        depotCache.totalSizeMB = formatMB(totalBytes)
      } catch {}
    }
  }

  // appmanifest analysis
  let appManifests: PcAnalyzerReport['steam']['appManifests'] = {
    totalCount: 0,
    byLibrary: [],
    stateSummary: {},
    fullyInstalled: 0,
  }
  const stateSummary: Record<string, number> = {}
  for (const libFolder of libraryFolders) {
    try {
      const entries = fs.readdirSync(libFolder).filter(e => e.startsWith('appmanifest_') && e.endsWith('.acf'))
      appManifests.byLibrary.push({ libraryPath: libFolder, count: entries.length })
      appManifests.totalCount += entries.length
      for (const entry of entries) {
        try {
          const acfContent = fs.readFileSync(path.join(libFolder, entry), 'utf-8')
          const stateMatch = acfContent.match(/"StateFlags"\s+"(\d+)"/)
          if (stateMatch) {
            const state = stateMatch[1]
            stateSummary[state] = (stateSummary[state] || 0) + 1
            if (state === '4') appManifests.fullyInstalled++
          }
        } catch {}
      }
    } catch {
      // Library folder inaccessible (network drive, permissions) — skip silently
    }
  }
  appManifests.stateSummary = stateSummary

  return {
    found: !!steamPath,
    path: steamPath,
    buildId,
    userId,
    running,
    libraryFolders,
    steamAppsPath,
    configVdf,
    depotCache,
    appManifests,
  }
}

// ============================================================================
// Hook section
// ============================================================================

function analyzeHook(): PcAnalyzerReport['hook'] {
  const steamPath = getSteamPath()
  const verification = checkSteamVerification()

  const ycoreToolExists = steamPath ? fs.existsSync(path.join(steamPath, 'YCoreTool.dll')) : false
  const openSteamToolExists = steamPath ? fs.existsSync(path.join(steamPath, 'OpenSteamTool.dll')) : false
  const dwmapiExists = steamPath ? fs.existsSync(path.join(steamPath, 'dwmapi.dll')) : false
  const xinputExists = steamPath ? fs.existsSync(path.join(steamPath, 'xinput1_4.dll')) : false

  let hookConsent = false
  let lastBuildId: string | null = null
  let failedSignatures: string[] = []

  if (steamPath) {
    const consentFile = path.join(steamPath, 'ycoretool', 'hook_consent.txt')
    hookConsent = fs.existsSync(consentFile)

    const buildIdFile = path.join(steamPath, 'ycoretool', 'last_build_id.txt')
    try {
      if (fs.existsSync(buildIdFile)) {
        lastBuildId = fs.readFileSync(buildIdFile, 'utf-8').trim() || null
      }
    } catch {}

    const failedSigsFile = path.join(steamPath, 'ycoretool', 'failed_signatures.json')
    try {
      if (fs.existsSync(failedSigsFile)) {
        failedSignatures = JSON.parse(fs.readFileSync(failedSigsFile, 'utf-8'))
      }
    } catch {}
  }

  return {
    installed: verification.installed,
    missingDlls: verification.missing,
    ycoreToolExists,
    openSteamToolExists,
    dwmapiExists,
    xinputExists,
    hookConsent,
    lastBuildId,
    failedSignatures,
  }
}

// ============================================================================
// Emulator + Native + Toolchain sections
// ============================================================================

function analyzeEmulator(): PcAnalyzerReport['emulator'] {
  const diag = getLocalSteamEmulatorDiagnostics()
  return {
    available: diag.isAvailable,
    dllPath: diag.dllPath,
    version: diag.version,
    dllSizeMB: null, // computed below if path exists
    failureReason: diag.failureReason,
    exportCount: 0,
  }
}

function analyzeNative(): PcAnalyzerReport['native'] {
  const nativeDiag = getNativeDiagnostics()
  return {
    available: nativeDiag.isAvailable ?? false,
    dllPath: nativeDiag.dllPath ?? null,
    version: nativeDiag.version ?? null,
    failureReason: nativeDiag.failureReason ?? null,
  }
}

function analyzeToolchain(): PcAnalyzerReport['toolchain'] {
  const t = checkToolchain()
  return {
    cmakeFound: t.cmakeFound ?? false,
    cmakeVersion: t.cmakeVersion ?? null,
    vsFound: t.vsFound ?? false,
    vsVersion: t.vsVersion ?? null,
    msbuildFound: t.msbuildFound ?? false,
  }
}

function analyzeDefender(): PcAnalyzerReport['defender'] {
  try {
    const scan = scanDlls()
    return {
      hasMissingCritical: scan.hasMissingCritical ?? false,
      hasMissingExpected: scan.hasMissingExpected ?? false,
      hasEmptyDlls: scan.hasEmptyDlls ?? false,
      hasDefenderArtifacts: scan.hasDefenderArtifacts ?? false,
      dlls: (scan.dlls || []).map((d: any) => ({
        name: d.name,
        exists: d.exists,
        isEmpty: d.isEmpty,
        sizeKB: d.size ? Math.round(d.size / 1024) : null,
      })),
      suggestions: scan.suggestions || [],
    }
  } catch {
    return {
      hasMissingCritical: false,
      hasMissingExpected: false,
      hasEmptyDlls: false,
      hasDefenderArtifacts: false,
      dlls: [],
      suggestions: [],
    }
  }
}

// ============================================================================
// Issues collector
// ============================================================================

function collectIssues(sections: {
  steam: PcAnalyzerReport['steam']
  hook: PcAnalyzerReport['hook']
  emulator: PcAnalyzerReport['emulator']
  native: PcAnalyzerReport['native']
  toolchain: PcAnalyzerReport['toolchain']
  defender: PcAnalyzerReport['defender']
}): PcAnalyzerReport['issues'] {
  const issues: PcAnalyzerReport['issues'] = []

  // Steam
  if (!sections.steam.found) {
    issues.push({ severity: 'critical', message: 'Steam no encontrado. Y-Core necesita Steam instalado.' })
  }
  if (!sections.steam.configVdf.hasDepotsSection) {
    issues.push({ severity: 'warning', message: 'config.vdf no tiene sección Depots. Las depot keys no se pueden inyectar.' })
  }
  if (sections.steam.configVdf.exists && sections.steam.configVdf.depotCount === 0) {
    issues.push({ severity: 'info', message: 'config.vdf tiene sección Depots pero sin claves. Normal si no has descargado juegos aún.' })
  }

  // Hook
  if (!sections.hook.installed) {
    issues.push({ severity: 'warning', message: `Hook DLLs faltantes: ${sections.hook.missingDlls.join(', ')}. Los juegos pueden aparecer como "Comprar" en Steam.` })
  }
  if (!sections.hook.hookConsent && sections.hook.installed) {
    issues.push({ severity: 'info', message: 'Consentimiento del hook no registrado (hook_consent.txt). La reinstalación silenciosa no funcionará.' })
  }
  if (sections.hook.failedSignatures.length > 0) {
    issues.push({ severity: 'warning', message: `${sections.hook.failedSignatures.length} firmas fallidas registradas. Algunas builds de Steam no son compatibles.` })
  }

  // Emulator
  if (!sections.emulator.available) {
    issues.push({ severity: 'warning', message: `ycore_steam.dll no disponible: ${sections.emulator.failureReason || 'desconocido'}. Los juegos necesitarán Steam Client para lanzarse.` })
  }

  // Native
  if (!sections.native.available) {
    issues.push({ severity: 'info', message: 'ycore.dll (nativo FFI) no disponible. Fallback JS activo.' })
  }

  // Toolchain
  if (!sections.toolchain.cmakeFound) {
    issues.push({ severity: 'warning', message: 'cmake no encontrado. No se puede compilar ycore_steam.dll automáticamente.' })
  }

  // Defender
  if (sections.defender.hasMissingCritical) {
    issues.push({ severity: 'critical', message: 'DLLs críticos eliminados por Windows Defender.' })
  }
  if (sections.defender.hasMissingExpected || sections.defender.hasEmptyDlls) {
    issues.push({ severity: 'warning', message: 'Windows Defender puede estar bloqueando DLLs nativos.' })
  }

  return issues
}

// ============================================================================
// Main public API
// ============================================================================

export async function analyzePc(): Promise<PcAnalyzerReport> {
  const steam = await analyzeSteam()
  const hook = analyzeHook()
  const emulator = analyzeEmulator()
  const native = analyzeNative()
  const toolchain = analyzeToolchain()
  const defender = analyzeDefender()

  const issues = collectIssues({ steam, hook, emulator, native, toolchain, defender })

  // Health
  let health: PcAnalyzerReport['health'] = 'ok'
  if (issues.some(i => i.severity === 'critical')) health = 'critical'
  else if (issues.some(i => i.severity === 'warning')) health = 'warning'

  // System info
  const totalMem = os.totalmem()
  const freeMem = os.freemem()

  // Relevant paths for context
  const relevantPaths: PcAnalyzerReport['relevantPaths'] = []
  const seenPaths = new Set<string>()
  if (steam.path && !seenPaths.has(steam.path)) {
    seenPaths.add(steam.path)
    relevantPaths.push({ path: steam.path, exists: fs.existsSync(steam.path), label: 'Steam' })
  }
  try {
    const ud = app.getPath('userData')
    if (!seenPaths.has(ud)) {
      seenPaths.add(ud)
      relevantPaths.push({ path: ud, exists: fs.existsSync(ud), label: 'Y-Core Data' })
    }
  } catch {}
  for (const lib of steam.libraryFolders) {
    if (!seenPaths.has(lib)) {
      seenPaths.add(lib)
      relevantPaths.push({ path: lib, exists: fs.existsSync(lib), label: 'Steam Library' })
    }
  }

  return {
    timestamp: new Date().toISOString(),
    ycoreVersion: (() => { try { return app.getVersion() } catch { return 'dev' } })(),
    electronVersion: process.versions.electron || 'unknown',

    system: {
      platform: os.platform(),
      arch: os.arch(),
      cpuCores: os.cpus().length,
      totalMemoryMB: formatMB(totalMem),
      freeMemoryMB: formatMB(freeMem),
      hostname: os.hostname(),
      userDataPath: (() => { try { return app.getPath('userData') } catch { return os.homedir() } })(),
      appPath: (() => { try { return app.getAppPath() } catch { return __dirname } })(),
    },

    relevantPaths,
    steam,
    hook,
    emulator,
    native,
    toolchain,
    defender,
    issues,
    health,
  }
}
