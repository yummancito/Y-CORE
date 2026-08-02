// ============================================================================
// electron/modules/drm-plugins/anticheat-plugin.ts
// Anti-cheat Detection Plugin — Flagging Only (NO REMOVAL ATTEMPTED)
// Detects: BattlEye, EAC, Vanguard, GameGuard, Ricochet, Faceit
// ============================================================================

import fs from 'fs'
import path from 'path'
import { logger } from '../../logger'

// ============================================================================
// Types & Interfaces
// ============================================================================

export interface AntiCheatSignature {
  name: string
  dllNames: string[]
  registryPaths: string[]
  files: string[]
  processes: string[]
  kernelDriver: boolean
  disablePossible: boolean
}

export interface AntiCheatDetectionResult {
  detected: boolean
  antiCheatType: string
  kernelMode: boolean
  confidence: number
  evidence: string[]
  warnings: string[]
  disableMethods: string[]
  documentation: string
}

// ============================================================================
// Anti-Cheat Database
// ============================================================================

const ANTICHEAT_SIGNATURES: AntiCheatSignature[] = [
  {
    name: 'BattlEye',
    dllNames: ['BEDaisy.sys', 'BEClient.dll', 'BEService.exe'],
    registryPaths: [
      'HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Services\\BEDaisy',
      'HKEY_LOCAL_MACHINE\\SOFTWARE\\BattlEye',
    ],
    files: ['BEDaisy.sys', 'BEClient.dll'],
    processes: ['BEService.exe'],
    kernelDriver: true,
    disablePossible: false, // Kernel driver, cannot disable
  },

  {
    name: 'Easy Anti-Cheat (EAC)',
    dllNames: ['EasyAntiCheat.sys', 'EasyAntiCheat.exe', 'EACLauncher.exe'],
    registryPaths: [
      'HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Services\\EasyAntiCheat',
      'HKEY_LOCAL_MACHINE\\SOFTWARE\\EasyAntiCheat',
    ],
    files: ['EasyAntiCheat.sys', 'EasyAntiCheat.exe'],
    processes: ['EasyAntiCheat.exe', 'EACLauncher.exe'],
    kernelDriver: true,
    disablePossible: false,
  },

  {
    name: 'Riot Vanguard',
    dllNames: ['vgc.sys', 'vgk.sys', 'vgk_sys'],
    registryPaths: [
      'HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Services\\vgc',
      'HKEY_LOCAL_MACHINE\\SOFTWARE\\Riot Games\\Riot Client',
    ],
    files: ['vgc.sys', 'vgk.sys'],
    processes: ['vgtray.exe', 'valorant.exe'],
    kernelDriver: true,
    disablePossible: false,
  },

  {
    name: 'GameGuard',
    dllNames: ['npgg.dll', 'GameGuard.des', 'ggpunksp.exe'],
    registryPaths: [
      'HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Services\\GGPKSpx64',
      'HKEY_LOCAL_MACHINE\\SOFTWARE\\GameGuard',
    ],
    files: ['npgg.dll', 'GameGuard.des'],
    processes: ['ggpunksp.exe'],
    kernelDriver: true,
    disablePossible: false,
  },

  {
    name: 'Ricochet (Call of Duty)',
    dllNames: ['ricochet_x64.sys', 'RicochetClient.dll'],
    registryPaths: [
      'HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Services\\ricochet_x64',
      'HKEY_LOCAL_MACHINE\\SOFTWARE\\Ricochet',
    ],
    files: ['ricochet_x64.sys'],
    processes: ['RicochetClient.exe'],
    kernelDriver: true,
    disablePossible: false,
  },

  {
    name: 'Faceit AC',
    dllNames: ['FaceItClient.exe', 'FaceItAnticheatService.exe'],
    registryPaths: [
      'HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Services\\FaceItAC',
      'HKEY_CURRENT_USER\\Software\\Faceit',
    ],
    files: ['FaceItAnticheatService.exe'],
    processes: ['FaceItClient.exe', 'FaceItAnticheatService.exe'],
    kernelDriver: false,
    disablePossible: true, // Can be uninstalled per-game
  },

  {
    name: 'nProtect GameGuard',
    dllNames: ['npggacc.dll', 'GameGuard.des'],
    registryPaths: [
      'HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Services\\npggacc64',
      'HKEY_LOCAL_MACHINE\\SOFTWARE\\nProtect',
    ],
    files: ['npggacc.dll'],
    processes: ['npgg.exe'],
    kernelDriver: true,
    disablePossible: false,
  },

  {
    name: 'XignCode3',
    dllNames: ['xhunter1.sys', 'xhunter.dll'],
    registryPaths: [
      'HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Services\\xhunter1',
      'HKEY_LOCAL_MACHINE\\SOFTWARE\\XignCode3',
    ],
    files: ['xhunter1.sys'],
    processes: ['xhunter.exe'],
    kernelDriver: true,
    disablePossible: false,
  },

  {
    name: 'Warden (World of Warcraft)',
    dllNames: ['Warden.sys', 'WardenKernel.sys'],
    registryPaths: [
      'HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Services\\Warden',
    ],
    files: ['Warden.sys'],
    processes: ['wow.exe'],
    kernelDriver: true,
    disablePossible: false,
  },
]

// ============================================================================
// Registry Check (Windows only)
// ============================================================================

async function checkRegistry(registryPaths: string[]): Promise<boolean> {
  // This requires native module or WMI query
  // For now, we'll skip if not on Windows or if native interface unavailable
  try {
    const { execFileSync } = await import('child_process')

    for (const registryPath of registryPaths) {
      try {
        // execFileSync spawns argv directly (no shell), so registry path
        // values can't break out or inject shell commands.
        const result = execFileSync('reg', ['query', registryPath, '/v', 'Service'], {
          encoding: 'utf8',
          stdio: 'pipe',
        })
        if (result) return true
      } catch {
        // Registry path doesn't exist
      }
    }
  } catch {
    // Native module not available
  }

  return false
}

// ============================================================================
// File Existence Check
// ============================================================================

async function checkSystemFiles(
  gameDir: string,
  systemFiles: string[]
): Promise<{ found: boolean; paths: string[] }> {
  const found: string[] = []

  // Check in game directory
  for (const file of systemFiles) {
    const gamePath = path.join(gameDir, file)
    if (fs.existsSync(gamePath)) {
      found.push(gamePath)
    }
  }

  // Check in system paths (Windows)
  if (process.platform === 'win32') {
    const systemPaths = [
      'C:\\Windows\\System32',
      'C:\\Windows\\SysWOW64',
      'C:\\Program Files',
      'C:\\Program Files (x86)',
    ]

    for (const sysPath of systemPaths) {
      for (const file of systemFiles) {
        const fullPath = path.join(sysPath, file)
        if (fs.existsSync(fullPath)) {
          found.push(fullPath)
        }
      }
    }
  }

  return { found: found.length > 0, paths: found }
}

// ============================================================================
// Kernel Driver Detection
// ============================================================================

async function checkKernelDrivers(driverNames: string[]): Promise<string[]> {
  const loadedDrivers: string[] = []

  if (process.platform !== 'win32') {
    return loadedDrivers
  }

  try {
    const { execSync } = await import('child_process')

    // Use driverquery to list loaded drivers
    try {
      const output = execSync('driverquery /FO list 2>nul', { encoding: 'utf8', stdio: 'pipe' })

      for (const driverName of driverNames) {
        const driverNameClean = driverName.replace(/\.(sys|dll)$/i, '')
        if (output.toLowerCase().includes(driverNameClean.toLowerCase())) {
          loadedDrivers.push(driverName)
        }
      }
    } catch {
      // driverquery not available
    }
  } catch {
    // Native module not available
  }

  return loadedDrivers
}

// ============================================================================
// Main Detection Function
// ============================================================================

export async function detectAntiCheat(gameDir: string): Promise<AntiCheatDetectionResult> {
  try {
    for (const ac of ANTICHEAT_SIGNATURES) {
      const evidence: string[] = []

      // Check for files
      const { found: filesFound, paths } = await checkSystemFiles(gameDir, ac.files)
      if (filesFound) {
        evidence.push(`Files found: ${paths.join(', ')}`)
      }

      // Check for DLL/processes
      for (const dll of ac.dllNames) {
        const filePath = path.join(gameDir, dll)
        if (fs.existsSync(filePath)) {
          evidence.push(`${dll} detected in game directory`)
        }
      }

      // Check for kernel drivers
      if (ac.kernelDriver) {
        const loadedDrivers = await checkKernelDrivers(ac.dllNames.filter((n) => n.endsWith('.sys')))
        if (loadedDrivers.length > 0) {
          evidence.push(`Kernel drivers loaded: ${loadedDrivers.join(', ')}`)
        }
      }

      // Check registry (Windows only)
      if (process.platform === 'win32') {
        const registryFound = await checkRegistry(ac.registryPaths)
        if (registryFound) {
          evidence.push(`Registry entries found for ${ac.name}`)
        }
      }

      // If we found evidence, return result
      if (evidence.length > 0) {
        const disableMethods: string[] = []

        if (!ac.kernelDriver && ac.disablePossible) {
          disableMethods.push('Uninstall via Control Panel > Programs and Features')
          disableMethods.push(`Run: "${gameDir}/uninstall_${ac.name.replace(/\s+/g, '_').toLowerCase()}.exe"`)
        }

        const warnings: string[] = []
        if (ac.kernelDriver) {
          warnings.push('Kernel-level anti-cheat detected - Cannot be disabled or removed at user level')
          warnings.push('Game cannot run offline without anti-cheat driver')
          warnings.push('Disabling requires admin access and may trigger detection alerts on next launch')
        } else if (ac.disablePossible) {
          warnings.push('This anti-cheat may be uninstalled for offline play')
          warnings.push('Uninstalling will prevent online play on next update')
        }

        return {
          detected: true,
          antiCheatType: ac.name,
          kernelMode: ac.kernelDriver,
          confidence: evidence.length / Math.max(ac.files.length, 1) > 0.5 ? 0.95 : 0.75,
          evidence,
          warnings,
          disableMethods,
          documentation: getAntiCheatDocumentation(ac.name),
        }
      }
    }

    // No anti-cheat detected
    return {
      detected: false,
      antiCheatType: 'none',
      kernelMode: false,
      confidence: 1.0,
      evidence: [],
      warnings: [],
      disableMethods: [],
      documentation: '',
    }
  } catch (err) {
    logger.error(`[AntiCheat Detector] Detection failed: ${err instanceof Error ? err.message : 'unknown'}`, 'drm')
    return {
      detected: false,
      antiCheatType: 'unknown',
      kernelMode: false,
      confidence: 0,
      evidence: [],
      warnings: [`Detection error: ${err instanceof Error ? err.message : 'unknown'}`],
      disableMethods: [],
      documentation: '',
    }
  }
}

// ============================================================================
// Documentation
// ============================================================================

function getAntiCheatDocumentation(antiCheatType: string): string {
  const docs: Record<string, string> = {
    BattlEye: `
BattlEye is a kernel-level anti-cheat driver. It cannot be disabled or removed.
To play offline: Check if the developer offers offline mode or cracked versions.
Reference: https://www.battleye.com/
    `.trim(),

    'Easy Anti-Cheat (EAC)': `
EAC is a kernel-level anti-cheat. Some games support offline mode without EAC.
Check game settings for "Offline" or "Single Player" modes.
Reference: https://www.easyanticheat.net/
    `.trim(),

    'Riot Vanguard': `
Vanguard is a kernel-level anti-cheat for Riot games (Valorant, League of Legends).
It runs at the system level and cannot be disabled during play.
Uninstalling requires Riot Client restart and disables ranked play.
Reference: https://support.riotgames.com/hc/articles/4409123908503
    `.trim(),

    GameGuard: `
GameGuard is a kernel-level anti-cheat used in older MMORPG games.
Some games allow offline play by running without connecting to game servers.
Reference: https://www.gameguard.co.kr/
    `.trim(),

    'Ricochet (Call of Duty)': `
Ricochet is Activision's kernel-level anti-cheat for Call of Duty.
It cannot be disabled while playing online.
Offline play may require game updates or specific server settings.
Reference: https://support.activision.com/article/anti-cheat-system-information
    `.trim(),

    'Faceit AC': `
Faceit anti-cheat can be uninstalled but disables Faceit-specific games.
Some games allow offline play without Faceit client.
Reference: https://support.faceit.com/hc/articles/360001813937
    `.trim(),

    'nProtect GameGuard': `
nProtect GameGuard is kernel-level and cannot be disabled by users.
Some games offer offline mode that bypasses the anti-cheat check.
Reference: https://www.nprotect.com/
    `.trim(),

    XignCode3: `
XignCode3 is kernel-level anti-cheat used in Korean games.
Cannot be disabled at runtime.
Offline play mode may be available in game settings.
Reference: https://www.gameguard.co.kr/
    `.trim(),

    'Warden (World of Warcraft)': `
Warden is Blizzard's kernel-level anti-cheat for WoW and Diablo.
It cannot be disabled and runs only during online play.
Single player or offline servers may not require Warden.
Reference: https://us.battle.net/support/en/article/80871
    `.trim(),
  }

  return docs[antiCheatType] || 'No documentation available for this anti-cheat.'
}

// ============================================================================
// Batch Detection
// ============================================================================

export async function detectAntiCheatBatch(
  gameDirectories: Map<string, string>
): Promise<Map<string, AntiCheatDetectionResult>> {
  const results = new Map<string, AntiCheatDetectionResult>()

  for (const [appId, gameDir] of gameDirectories) {
    try {
      const result = await detectAntiCheat(gameDir)
      results.set(appId, result)
    } catch (err) {
      logger.error(`[AntiCheat Detector] Batch detection failed for ${appId}: ${err}`, 'drm')
    }
  }

  return results
}

// ============================================================================
// Export database
// ============================================================================

export function getAntiCheatDatabase(): AntiCheatSignature[] {
  return [...ANTICHEAT_SIGNATURES]
}
