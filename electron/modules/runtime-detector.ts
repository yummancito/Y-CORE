// ============================================================================
// electron/modules/runtime-detector.ts
// ----------------------------------------------------------------------------
// Runtime Detector — detects Windows game dependencies via registry + filesystem.
// Supports: VC++ Redistributable (2010-2022), DirectX, .NET Framework, .NET 8+,
// OpenAL, XNA Framework.
//
// Uses pattern matching on registry DisplayName values instead of specific GUIDs,
// because GUIDs change across versions and Windows releases. This is more robust
// than maintaining a static GUID table that will inevitably go stale.
//
// Inspired by: Steam's runtime detection + Bottles dependency manifests.
// ============================================================================

import { execSync, spawn, type ChildProcess } from 'child_process'
import fs from 'fs'
import path from 'path'
import https from 'https'
import os from 'os'
import { logger } from '../logger'

// ── Types ──────────────────────────────────────────────────────────────────

export interface RuntimeCheck {
  name: string
  installed: boolean
  version?: string
  installPath?: string
}

export type RuntimeType =
  | 'vc_redist_2010'
  | 'vc_redist_2012'
  | 'vc_redist_2013'
  | 'vc_redist_2015_2022'
  | 'directx'
  | 'dotnet_48'
  | 'dotnet_80'
  | 'openal'
  | 'xna'

interface RuntimeDefinition {
  name: string
  type: RuntimeType
  displayNamePattern: RegExp
  versionValueName?: string
  versionMatch?: RegExp
  downloadUrl?: string
  installerArgs?: string[]
}

// ── Runtime Definitions (pattern-based, no GUIDs) ─────────────────────────
//
// Instead of using specific GUIDs (which change across versions), we scan ALL
// registry uninstall keys and match against DisplayName patterns.
// This is the approach used by Steam and other launchers.

const RUNTIME_DEFINITIONS: RuntimeDefinition[] = [
  {
    name: 'Microsoft Visual C++ 2010 Redistributable (x64)',
    type: 'vc_redist_2010',
    displayNamePattern: /Microsoft Visual C\+\+ 2010.*Redistributable.*x64/i,
    downloadUrl: 'https://aka.ms/vs/17/release/vc_redist.x64.exe',
    installerArgs: ['/install', '/quiet', '/norestart'],
  },
  {
    name: 'Microsoft Visual C++ 2012 Redistributable (x64)',
    type: 'vc_redist_2012',
    displayNamePattern: /Microsoft Visual C\+\+ 2012.*Redistributable.*x64/i,
  },
  {
    name: 'Microsoft Visual C++ 2013 Redistributable (x64)',
    type: 'vc_redist_2013',
    displayNamePattern: /Microsoft Visual C\+\+ 2013.*Redistributable.*x64/i,
  },
  {
    name: 'Microsoft Visual C++ 2015-2022 Redistributable (x64)',
    type: 'vc_redist_2015_2022',
    displayNamePattern: /Microsoft Visual C\+\+ 2015-2022.*Redistributable.*x64/i,
    versionValueName: 'DisplayVersion',
    versionMatch: /(\d+\.\d+\.\d+)/,
    downloadUrl: 'https://aka.ms/vs/17/release/vc_redist.x64.exe',
    installerArgs: ['/install', '/quiet', '/norestart'],
  },
  {
    name: 'Microsoft Visual C++ 2010 Redistributable (x86)',
    type: 'vc_redist_2010',
    displayNamePattern: /Microsoft Visual C\+\+ 2010.*Redistributable.*x86/i,
  },
  {
    name: 'Microsoft Visual C++ 2012 Redistributable (x86)',
    type: 'vc_redist_2012',
    displayNamePattern: /Microsoft Visual C\+\+ 2012.*Redistributable.*x86/i,
  },
  {
    name: 'Microsoft Visual C++ 2013 Redistributable (x86)',
    type: 'vc_redist_2013',
    displayNamePattern: /Microsoft Visual C\+\+ 2013.*Redistributable.*x86/i,
  },
  {
    name: 'Microsoft Visual C++ 2015-2022 Redistributable (x86)',
    type: 'vc_redist_2015_2022',
    displayNamePattern: /Microsoft Visual C\+\+ 2015-2022.*Redistributable.*x86/i,
    versionValueName: 'DisplayVersion',
    versionMatch: /(\d+\.\d+\.\d+)/,
  },
  {
    name: 'DirectX Runtime',
    type: 'directx',
    displayNamePattern: /DirectX|Microsoft DirectX/i,
    versionValueName: 'Version',
    downloadUrl: 'https://download.microsoft.com/download/8/4/A/84A35BF1-DAFE-4AE8-82AF-AD2AE20B6B14/directx_Jun2010_redist.exe',
    installerArgs: ['/Q', '/T:%temp%\\dx'],
  },
  {
    name: '.NET Framework 4.8',
    type: 'dotnet_48',
    displayNamePattern: /Microsoft \.NET Framework 4\.8/i,
    versionValueName: 'Version',
    versionMatch: /4\.8\./,
    downloadUrl: 'https://go.microsoft.com/fwlink/?linkid=2088631',
    installerArgs: ['/quiet', '/norestart'],
  },
  {
    name: '.NET Runtime 8.0',
    type: 'dotnet_80',
    displayNamePattern: /Microsoft \.NET (Runtime|Core) 8\.|\.NET Desktop Runtime 8\./i,
    versionValueName: 'Version',
    versionMatch: /8\.0\./,
  },
  {
    name: 'OpenAL',
    type: 'openal',
    displayNamePattern: /OpenAL/i,
    downloadUrl: 'https://openal.org/download/oalinst.zip',
    installerArgs: ['/S'],
  },
  {
    name: 'XNA Framework 4.0',
    type: 'xna',
    displayNamePattern: /Microsoft XNA Framework/i,
    downloadUrl: 'https://www.microsoft.com/en-us/download/details.aspx?id=20914',
    installerArgs: ['/quiet'],
  },
]

// ── Registry Scanner ──────────────────────────────────────────────────────

/**
 * Scan all registry uninstall keys and return entries matching a display name pattern.
 * This is more robust than hardcoding GUIDs because it doesn't break when Microsoft
 * changes GUIDs between releases.
 */
function scanRegistryForKey(
  pattern: RegExp,
): { displayName: string; version?: string; installPath?: string; keyPath: string }[] {
  if (process.platform !== 'win32') return []

  const results: { displayName: string; version?: string; installPath?: string; keyPath: string }[] = []
  const basePaths = [
    'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
    'HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
  ]

  for (const basePath of basePaths) {
    try {
      const output = execSync(
        `reg query "${basePath}" /s /f "" 2>nul`,
        { encoding: 'utf-8', timeout: 10000, windowsHide: true, maxBuffer: 10 * 1024 * 1024 },
      )

      // Parse the output to find subkeys
      const lines = output.split('\n')
      let currentKey = ''
      let currentDisplayName = ''
      let currentVersion = ''
      let currentInstallPath = ''

      for (const line of lines) {
        const keyMatch = line.match(/^HKEY_/)
        if (keyMatch) {
          // Check previous key before moving on
          if (currentDisplayName && pattern.test(currentDisplayName)) {
            results.push({
              displayName: currentDisplayName,
              version: currentVersion || undefined,
              installPath: currentInstallPath || undefined,
              keyPath: currentKey,
            })
          }
          currentKey = line.trim()
          currentDisplayName = ''
          currentVersion = ''
          currentInstallPath = ''
          continue
        }

        const displayMatch = line.match(/^\s*DisplayName\s+REG_SZ\s+(.+)$/i)
        if (displayMatch) { currentDisplayName = displayMatch[1].trim(); continue }

        const versionMatch = line.match(/^\s*DisplayVersion\s+REG_SZ\s+(.+)$/i)
        if (versionMatch) { currentVersion = versionMatch[1].trim(); continue }

        const pathMatch = line.match(/^\s*(InstallLocation|InstallPath)\s+REG_SZ\s+(.+)$/i)
        if (pathMatch) { currentInstallPath = pathMatch[2].trim(); continue }
      }

      // Check last key
      if (currentDisplayName && pattern.test(currentDisplayName)) {
        results.push({
          displayName: currentDisplayName,
          version: currentVersion || undefined,
          installPath: currentInstallPath || undefined,
          keyPath: currentKey,
        })
      }
    } catch {
      // reg query can fail if base key doesn't exist
      continue
    }
  }

  return results
}

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Detect all available Windows game runtimes.
 * Uses pattern matching on registry DisplayName values (more robust than GUIDs).
 */
export function detectRuntimes(): RuntimeCheck[] {
  const results: RuntimeCheck[] = []

  for (const def of RUNTIME_DEFINITIONS) {
    const entries = scanRegistryForKey(def.displayNamePattern)
    const installed = entries.length > 0

    const check: RuntimeCheck = {
      name: def.name,
      installed,
    }

    if (installed && def.versionValueName && entries[0].version) {
      check.version = entries[0].version
    }

    if (installed && entries[0].installPath) {
      check.installPath = entries[0].installPath
    }

    results.push(check)
  }

  return results
}

/**
 * Detect a specific runtime by type.
 */
export function detectRuntime(type: RuntimeType): RuntimeCheck {
  const defs = RUNTIME_DEFINITIONS.filter((d) => d.type === type)
  if (defs.length === 0) return { name: type, installed: false }

  // Return first match
  for (const def of defs) {
    const entries = scanRegistryForKey(def.displayNamePattern)
    if (entries.length > 0) {
      return {
        name: def.name,
        installed: true,
        version: def.versionValueName ? entries[0].version : undefined,
        installPath: entries[0].installPath,
      }
    }
  }

  return { name: defs[0].name, installed: false }
}

/**
 * Check game runtime requirements.
 */
export function checkGameRequirements(): { met: boolean; checks: RuntimeCheck[]; missing: RuntimeCheck[] } {
  const checks = detectRuntimes()
  // Deduplicate by type
  const seen = new Set<RuntimeType>()
  const unique: RuntimeCheck[] = []
  for (let i = 0; i < checks.length; i++) {
    const def = RUNTIME_DEFINITIONS[i]
    if (!seen.has(def.type)) {
      seen.add(def.type)
      unique.push(checks[i])
    }
  }
  const missing = unique.filter((c) => !c.installed)
  return { met: missing.length === 0, checks: unique, missing }
}

/**
 * Download and install a runtime.
 */
export async function installRuntime(type: RuntimeType): Promise<{ success: boolean; message: string }> {
  const def = RUNTIME_DEFINITIONS.find((d) => d.type === type)
  if (!def) return { success: false, message: `Unknown runtime: ${type}` }

  // Already installed
  const check = detectRuntime(type)
  if (check.installed) return { success: true, message: `${def.name} is already installed` }

  if (!def.downloadUrl) return { success: false, message: `${def.name} has no installer URL configured` }

  const downloadUrl = def.downloadUrl;

  try {
    const tmpDir = path.join(os.tmpdir(), 'ycore-runtimes')
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true })
    const installerPath = path.join(tmpDir, `${type}-installer.exe`)

    // Download installer
    await new Promise<void>((resolve, reject) => {
      const file = fs.createWriteStream(installerPath)
      const doRequest = (url: string) => {
        https.get(url, (response) => {
          if (response.headers.location && (response.statusCode === 301 || response.statusCode === 302)) {
            response.destroy()
            file.close()
            if (fs.existsSync(installerPath)) fs.unlinkSync(installerPath)
            doRequest(response.headers.location)
            return
          }
          if (!response.statusCode || response.statusCode >= 400) {
            file.close()
            if (fs.existsSync(installerPath)) fs.unlinkSync(installerPath)
            reject(new Error(`HTTP ${response.statusCode}`))
            return
          }
          response.pipe(file)
          file.on('finish', () => { file.close(); resolve() })
        }).on('error', (err) => {
          file.close()
          if (fs.existsSync(installerPath)) fs.unlinkSync(installerPath)
          reject(err)
        })
      }
      doRequest(downloadUrl)
    })

    // Run installer silently
    if (def.installerArgs && def.installerArgs.length > 0) {
      await new Promise<void>((resolve, reject) => {
        const installerArgs = def.installerArgs;
        const proc = spawn(installerPath, installerArgs ?? [], {
          windowsHide: true,
          stdio: 'ignore',
        }) as ChildProcess
        const timeout = setTimeout(() => {
          proc.kill()
          reject(new Error('Installer timed out after 120s'))
        }, 120000)
        proc.on('close', (code: number | null) => {
          clearTimeout(timeout)
          if (code === 0) resolve()
          else reject(new Error(`Installer exited with code ${code}`))
        })
        proc.on('error', (err: Error) => { clearTimeout(timeout); reject(err) })
      })
    }

    logger.info(`[RuntimeDetector] Installed ${def.name}`, 'runtimes')
    return { success: true, message: `Installed ${def.name}` }
  } catch (err: any) {
    logger.error(`[RuntimeDetector] Failed to install ${def.name}: ${err.message}`, 'runtimes')
    return { success: false, message: `Failed to install ${def.name}: ${err.message}` }
  }
}

/**
 * Detect DirectX version using DLL inspection (most reliable method).
 */
export function detectDirectXVersion(): string {
  if (process.platform !== 'win32') return 'unknown'
  try {
    const sysDir = process.env.WINDIR
      ? path.join(process.env.WINDIR, 'System32')
      : 'C:\\Windows\\System32'
    const d3d12Path = path.join(sysDir, 'd3d12.dll')
    if (fs.existsSync(d3d12Path)) return '12'
    const d3d11Path = path.join(sysDir, 'd3d11.dll')
    if (fs.existsSync(d3d11Path)) return '11'
    const d3d10Path = path.join(sysDir, 'd3d10.dll')
    if (fs.existsSync(d3d10Path)) return '10'
    // Check for d3d9.dll (always present on modern Windows, but indicates DX9 support)
    const d3d9Path = path.join(sysDir, 'd3d9.dll')
    if (fs.existsSync(d3d9Path)) return '9'
  } catch { /* ignore */ }
  return 'unknown'
}
