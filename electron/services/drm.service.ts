// ============================================================================
// electron/services/drm.service.ts — Backend DrmService
// Full implementation using shared logic from modules/drm-remover.
// ============================================================================

import { spawn } from 'child_process'
import path from 'path'
import fs from 'fs'
import { logger } from '../logger'
import { getSteamPath, getSteamAppsPath, getSteamLibraryFolders, parseVdf } from '../modules/steam-helpers'

function getGameInstallDir(appId: string): string | null {
  const steamAppsPath = getSteamAppsPath()
  if (!steamAppsPath) return null
  const acfPath = path.join(steamAppsPath, `appmanifest_${appId}.acf`)
  if (!fs.existsSync(acfPath)) return null
  try {
    const parsed = parseVdf(fs.readFileSync(acfPath, 'utf-8'))
    return parsed['AppState']?.['installdir'] || null
  } catch { return null }
}

function findGameExecutable(installDir: string): string | null {
  const folders = getSteamLibraryFolders()
  const patterns = [/Binaries[\\/]+(Win64|Win32)[\\/]+.*\.exe$/i, /-Win64-Shipping\.exe$/i, /-Win32-Shipping\.exe$/i]
  const exclude = new Set(['steam_api64.dll', 'steam_api.dll', 'steamclient64.dll', 'crashpad_handler.exe'])
  let best: { path: string; prio: number } | null = null
  for (const folder of folders) {
    const gf = path.join(folder, 'common', installDir)
    if (!fs.existsSync(gf)) continue
    const scan = (dir: string, depth: number) => {
      if (depth > 4) return
      let entries: fs.Dirent[] = []
      try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
      for (const e of entries) {
        const fp = path.join(dir, e.name)
        if (e.isDirectory()) { scan(fp, depth + 1) }
        else if (e.name.toLowerCase().endsWith('.exe') && !exclude.has(e.name.toLowerCase()) && !e.name.toLowerCase().endsWith('.unpacked.exe') && !e.name.toLowerCase().endsWith('.bak')) {
          let prio = 0
          for (let i = 0; i < patterns.length; i++) { if (patterns[i].test(fp)) { prio = patterns.length - i; break } }
          try { if (fs.statSync(fp).size < 102400) continue } catch { continue }
          if (!best || prio > best.prio) best = { path: fp, prio }
        }
      }
    }
    scan(gf, 0)
  }
  return best?.path ?? null
}

function runSteamless(exePath: string, steamlessDir: string): Promise<{ success: boolean; output: string; hadDrm: boolean }> {
  return new Promise((resolve) => {
    const cli = path.join(steamlessDir, 'Steamless.CLI.exe')
    if (!fs.existsSync(cli)) return resolve({ success: false, output: 'Steamless.CLI.exe not found', hadDrm: false })
    let output = ''; let hadDrm = false
    const proc = spawn(cli, ['--keepbind', '--quiet', exePath], { cwd: steamlessDir, windowsHide: true })
    proc.stdout?.on('data', (d: Buffer) => { const t = d.toString(); output += t; if (/stub\s+(detected|found)/i.test(t) || /unpacking\s+(file|stub)/i.test(t) || /File is packed with SteamStub/i.test(t) || /Successfully unpacked file/i.test(t)) hadDrm = true })
    proc.stderr?.on('data', (d: Buffer) => { output += d.toString() })
    const timeout = setTimeout(() => { proc.kill(); resolve({ success: false, output: output + '\nTimeout after 60s', hadDrm }) }, 60000)
    proc.on('close', (code) => { clearTimeout(timeout); resolve({ success: code === 0 && /unpacked|File unpacked/i.test(output), output, hadDrm }) })
    proc.on('error', (err) => { clearTimeout(timeout); resolve({ success: false, output: err.message, hadDrm }) })
  })
}

export const drmService = {
  async remove(appId: string) {
    const steamPath = getSteamPath()
    if (!steamPath) return { success: false, message: 'Steam installation not found', hadDrm: false }
    const installDir = getGameInstallDir(appId)
    if (!installDir) return { success: false, message: `No appmanifest found for AppId ${appId}`, hadDrm: false }
    const exePath = findGameExecutable(installDir)
    if (!exePath) return { success: false, message: `No game executable found in ${installDir}`, hadDrm: false }
    const backupPath = exePath + '.bak'
    if (fs.existsSync(backupPath)) return { success: true, message: 'DRM already removed (backup exists)', hadDrm: true, backupPath, exePath }
    const steamlessDir = path.join(steamPath, 'steamless')
    if (!fs.existsSync(steamlessDir)) return { success: false, message: 'Steamless not installed. Reinstall hook DLLs first.', hadDrm: false }
    try { fs.copyFileSync(exePath, backupPath) } catch (err: any) { return { success: false, message: `Failed to backup exe: ${err.message}`, hadDrm: false } }
    const result = await runSteamless(exePath, steamlessDir)
    if (!result.hadDrm) { try { fs.unlinkSync(backupPath) } catch {}; return { success: true, message: 'No SteamStub DRM detected — nothing to remove', hadDrm: false, exePath } }
    if (!result.success) {
      if (/All unpackers failed/i.test(result.output)) { try { fs.unlinkSync(backupPath) } catch {}; return { success: false, message: 'Steamless could not unpack this file. It may not have SteamStub DRM.', hadDrm: false, exePath } }
      try { fs.copyFileSync(backupPath, exePath); fs.unlinkSync(backupPath) } catch {}; return { success: false, message: `Steamless failed: ${result.output.substring(0, 200)}`, hadDrm: true, exePath }
    }
    const unpackedPath = exePath.replace(/\.exe$/i, '.exe.unpacked.exe')
    if (!fs.existsSync(unpackedPath)) return { success: true, message: 'DRM removed successfully', hadDrm: true, backupPath, exePath }
    try { fs.copyFileSync(unpackedPath, exePath); fs.unlinkSync(unpackedPath) } catch (err: any) { try { fs.copyFileSync(backupPath, exePath) } catch {}; return { success: false, message: `Failed to replace exe: ${err.message}`, hadDrm: true, backupPath, exePath } }
    return { success: true, message: 'DRM removed successfully', hadDrm: true, backupPath, exePath }
  },

  async status(appId: string) {
    const installDir = getGameInstallDir(appId)
    if (!installDir) return { status: 'not-found' as const, message: `No appmanifest found for AppId ${appId}` }
    const exePath = findGameExecutable(installDir)
    if (!exePath) return { status: 'not-found' as const, message: `No game executable found in ${installDir}` }
    const backupPath = exePath + '.bak'
    if (fs.existsSync(backupPath)) return { status: 'drm-removed' as const, exePath, backupPath, message: 'DRM already removed' }
    const unpackedPath = exePath.replace(/\.exe$/i, '.exe.unpacked.exe')
    if (fs.existsSync(unpackedPath)) return { status: 'drm-present' as const, exePath, message: 'Unpacked exe detected — DRM removal may be in progress' }
    return { status: 'drm-present' as const, exePath, message: 'DRM status unknown — run removal to check' }
  },
}
