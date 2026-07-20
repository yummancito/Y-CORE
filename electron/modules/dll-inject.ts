import { app, dialog } from 'electron'
import path from 'path'
import fs from 'fs'
import { spawn, exec } from 'child_process'
import { logger } from '../logger'
import { state } from '../state'
import { closeSteamProcess, getSteamPath, getSteamBuildId, isSteamRunning } from './steam-helpers'
import { ensureAllChannelsCached, ensureAllSignaturesCached, SignatureCacheResult } from './signature-cache'
import { reportSignatureResult, reportUnknownSignature, detectYCoreToolPopup } from './signature-report'

function getAppRoot(): string {
  return app.getAppPath()
}

function backupExistingFile(filePath: string): void {
  if (!fs.existsSync(filePath)) return
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupPath = `${filePath}.backup-${timestamp}`
  try { fs.copyFileSync(filePath, backupPath) } catch {}
}

function hookFilesUpToDate(srcHook: string, srcDwmapi: string, srcXinput: string, dstHook: string, dstDwmapi: string, dstXinput: string): boolean {
  if (!fs.existsSync(dstHook) || !fs.existsSync(dstDwmapi) || !fs.existsSync(dstXinput)) return false
  try {
    const srcHookStat = fs.statSync(srcHook)
    const srcDwmapiStat = fs.statSync(srcDwmapi)
    const srcXinputStat = fs.statSync(srcXinput)
    const dstHookStat = fs.statSync(dstHook)
    const dstDwmapiStat = fs.statSync(dstDwmapi)
    const dstXinputStat = fs.statSync(dstXinput)
    return (
      srcHookStat.size === dstHookStat.size && srcHookStat.mtime.getTime() === dstHookStat.mtime.getTime() &&
      srcDwmapiStat.size === dstDwmapiStat.size && srcDwmapiStat.mtime.getTime() === dstDwmapiStat.mtime.getTime() &&
      srcXinputStat.size === dstXinputStat.size && srcXinputStat.mtime.getTime() === dstXinputStat.mtime.getTime()
    )
  } catch { return false }
}

function removeDirectoryRecursive(dirPath: string): void {
  if (!fs.existsSync(dirPath)) return
  const entries = fs.readdirSync(dirPath, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name)
    if (entry.isDirectory()) {
      removeDirectoryRecursive(fullPath)
      fs.rmdirSync(fullPath)
    } else {
      try { fs.chmodSync(fullPath, 0o666) } catch {}
      fs.unlinkSync(fullPath)
    }
  }
  fs.rmdirSync(dirPath)
}

const LAST_BUILD_ID_FILE = path.join('ycoretool', 'last_build_id.txt')

function readLastBuildId(steamPath: string): string | null {
  try {
    const p = path.join(steamPath, LAST_BUILD_ID_FILE)
    if (fs.existsSync(p)) {
      const v = fs.readFileSync(p, 'utf-8').trim()
      return v || null
    }
  } catch {}
  return null
}

function writeLastBuildId(steamPath: string, buildId: string | null): void {
  if (!buildId) return
  try {
    const p = path.join(steamPath, LAST_BUILD_ID_FILE)
    const dir = path.dirname(p)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(p, buildId, 'utf-8')
  } catch {}
}

const FAILED_SIGS_FILE = path.join('ycoretool', 'failed_signatures.json')

function readFailedSignatures(steamPath: string): string[] {
  try {
    const p = path.join(steamPath, FAILED_SIGS_FILE)
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf-8'))
  } catch {}
  return []
}

function markBuildAsBad(steamPath: string, sha256: string): void {
  try {
    const p = path.join(steamPath, FAILED_SIGS_FILE)
    const dir = path.dirname(p)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    const list = readFailedSignatures(steamPath)
    if (!list.includes(sha256)) list.push(sha256)
    fs.writeFileSync(p, JSON.stringify(list), 'utf-8')
  } catch {}
}

function restoreOrDelete(file: string): void {
  const dir = path.dirname(file)
  const base = path.basename(file)
  try {
    const backups = fs.readdirSync(dir)
      .filter(f => f.startsWith(base + '.backup-'))
      .sort()
    if (backups.length > 0) {
      const newest = path.join(dir, backups[backups.length - 1])
      fs.copyFileSync(newest, file)
      fs.unlinkSync(newest)
      return
    }
  } catch {}
  try { if (fs.existsSync(file)) fs.unlinkSync(file) } catch {}
}

function removeHookDlls(steamPath: string): void {
  const candidates = [
    path.join(steamPath, 'YCoreTool.dll'),
    path.join(steamPath, 'steamtools_hook.dll'),
    path.join(steamPath, 'dwmapi.dll'),
    path.join(steamPath, 'xinput1_4.dll'),
    path.join(steamPath, 'ycoretool.toml'),
  ]
  for (const f of candidates) restoreOrDelete(f)
  logger.warn('Removed incompatible hook DLLs to recover Steam', 'dll-inject')
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function monitorAndRemediateHook(steamPath: string, results: SignatureCacheResult[], steamBuildId: string | null): Promise<void> {
  try {
    const wasRunning = await isSteamRunning()
    await delay(30000)
    const popup = await detectYCoreToolPopup()
    const running = await isSteamRunning()
    const monitored = results.filter(r => r.status === 'downloaded' || r.status === 'pending')

    if (popup) {
      for (const r of monitored) {
        await reportSignatureResult({ component: r.component, sha256: r.sha256, success: false, failure_reason: 'ycoretool_popup', steam_build_id: steamBuildId || undefined })
        if (r.channel === 'pattern') markBuildAsBad(steamPath, r.sha256)
      }
      await closeSteamProcess().catch(() => {})
      removeHookDlls(steamPath)
    } else if (wasRunning && !running) {
      for (const r of monitored) {
        await reportSignatureResult({ component: r.component, sha256: r.sha256, success: false, failure_reason: 'steam_crash', steam_build_id: steamBuildId || undefined })
        if (r.channel === 'pattern') markBuildAsBad(steamPath, r.sha256)
      }
      removeHookDlls(steamPath)
    } else if (running) {
      for (const r of monitored) {
        await reportSignatureResult({ component: r.component, sha256: r.sha256, success: true, steam_build_id: steamBuildId || undefined })
      }
    } else {
      for (const r of monitored) {
        await reportSignatureResult({ component: r.component, sha256: r.sha256, success: true, steam_build_id: steamBuildId || undefined })
      }
    }
  } catch (err: any) {
    logger.error(`monitorAndRemediateHook error: ${err.message}`, 'dll-inject')
  }
}

async function ensureIpcSideChannel(steamPath: string): Promise<void> {
  try {
    const buildId = getSteamBuildId()
    const results = await ensureAllChannelsCached(steamPath)
    const ipcMissing = results.filter(r => r.channel === 'ipc' && !r.ok && r.status === 'not_found')
    if (ipcMissing.length === 0) return
    for (const r of ipcMissing) {
      await reportUnknownSignature({ component: r.component, sha256: r.sha256, channel: 'ipc', steam_build_id: buildId || undefined })
    }
    await ensureAllChannelsCached(steamPath)
    for (const r of ipcMissing) {
      const dir = path.join(steamPath, 'ycoretool', 'ipc', r.component)
      const target = path.join(dir, `${r.sha256}.toml`)
      if (fs.existsSync(target)) continue
      copyAnyIpcToml(dir, target)
    }
  } catch (err: any) {
    logger.warn(`ensureIpcSideChannel error: ${err.message}`, 'dll-inject')
  }
}

function copyAnyIpcToml(dir: string, target: string): boolean {
  try {
    if (!fs.existsSync(dir)) return false
    const existing = fs.readdirSync(dir)
      .filter(f => f.endsWith('.toml') && path.join(dir, f) !== target)
      .sort()
    if (existing.length === 0) return false
    fs.copyFileSync(path.join(dir, existing[existing.length - 1]), target)
    logger.info(`Copied existing ipc toml ${existing[existing.length - 1]} -> ${path.basename(target)} as fallback`, 'dll-inject')
    return true
  } catch { return false }
}

export interface InstallHookDllOpts {
  silent?: boolean
}

export async function installHookDll(steamPath: string, mode: 'release' | 'debug' = 'release', opts: InstallHookDllOpts = {}): Promise<{ success: boolean; error?: string; installed: boolean; unsupportedBuild?: boolean }> {
  const appRoot = getAppRoot()
  const steamlessSrcDir = path.join(appRoot, 'tools', 'steamless')
  const destSteamlessDir = path.join(steamPath, 'steamless')

  const ostDir = path.join(appRoot, 'native', mode === 'debug' ? 'opensteamtool-debug' : 'opensteamtool')
  const ostHookPath = path.join(ostDir, 'YCoreTool.dll')
  const ostDwmapiPath = path.join(ostDir, 'dwmapi.dll')
  const ostXinputPath = path.join(ostDir, 'xinput1_4.dll')
  const useYCoreTool = fs.existsSync(ostHookPath) && fs.existsSync(ostDwmapiPath) && fs.existsSync(ostXinputPath)

  let hookPath: string
  let dwmapiPath: string
  let xinputPath: string
  let destHook: string
  let hookName: string

  if (useYCoreTool) {
    hookPath = ostHookPath
    dwmapiPath = ostDwmapiPath
    xinputPath = ostXinputPath
    destHook = path.join(steamPath, 'YCoreTool.dll')
    hookName = 'YCoreTool'
  } else {
    hookPath = path.join(appRoot, 'native', 'steamtools_hook.dll')
    dwmapiPath = path.join(appRoot, 'native', 'dwmapi.dll')
    xinputPath = path.join(appRoot, 'native', 'xinput1_4.dll')
    destHook = path.join(steamPath, 'steamtools_hook.dll')
    hookName = 'steamtools_hook'
  }

  const destDwmapi = path.join(steamPath, 'dwmapi.dll')
  const destXinput = path.join(steamPath, 'xinput1_4.dll')

  if (!fs.existsSync(hookPath)) {
    return { success: false, error: `${hookName}.dll not found in app resources`, installed: false }
  }
  if (!fs.existsSync(dwmapiPath)) {
    return { success: false, error: 'dwmapi.dll not found in app resources', installed: false }
  }
  if (!fs.existsSync(xinputPath)) {
    return { success: false, error: 'xinput1_4.dll not found in app resources', installed: false }
  }

  if (useYCoreTool) {
    const legacyDlls = ['ycore_hook.dll', 'steamtools_hook.dll']
    for (const old of legacyDlls) {
      const oldPath = path.join(steamPath, old)
      if (fs.existsSync(oldPath)) { try { fs.unlinkSync(oldPath) } catch {} }
    }
  } else {
    const oldDlls = ['steamtools_hook.dll', 'YCoreTool.dll', 'OpenSteamTool.dll']
    for (const old of oldDlls) {
      const oldPath = path.join(steamPath, old)
      if (fs.existsSync(oldPath)) { try { fs.unlinkSync(oldPath) } catch {} }
    }
  }

  const currentBuildId = getSteamBuildId()
  const lastBuildId = readLastBuildId(steamPath)
  const buildIdChanged = !!currentBuildId && !!lastBuildId && currentBuildId !== lastBuildId

  await ensureIpcSideChannel(steamPath).catch((err: any) => {
    logger.warn(`ensureIpcSideChannel failed: ${err.message}`, 'dll-inject')
  })

  if (hookFilesUpToDate(hookPath, dwmapiPath, xinputPath, destHook, destDwmapi, destXinput) && !buildIdChanged) {
    if (!fs.existsSync(path.join(destSteamlessDir, 'Steamless.CLI.exe')) && fs.existsSync(steamlessSrcDir)) {
      try { fs.cpSync(steamlessSrcDir, destSteamlessDir, { recursive: true }) } catch {}
    }
    writeLastBuildId(steamPath, currentBuildId)
    return { success: true, installed: false }
  }

  const signatureResults = await ensureAllSignaturesCached(steamPath, 'pattern')
  const steamBuildId = getSteamBuildId()
  const pendingResult = signatureResults.find(r => r.status === 'pending')
  if (pendingResult) {
    logger.warn(`Signature pending for ${pendingResult.component}/${pendingResult.sha256}`, 'dll-inject')
  }

  const failedResult = signatureResults.find(r => !r.ok && r.status !== 'pending')
  if (failedResult) {
    logger.error(`Signature cache failed: ${failedResult.error}`, 'dll-inject')
    if (failedResult.channel === 'pattern' && readFailedSignatures(steamPath).includes(failedResult.sha256)) {
      writeLastBuildId(steamPath, currentBuildId)
      return { success: true, installed: false, unsupportedBuild: true, error: 'This Steam build previously crashed with the auto-cloned hook; skipping to avoid breaking Steam. A correct pattern is needed.' }
    }
    const dllsExist = fs.existsSync(destHook) && fs.existsSync(destDwmapi) && fs.existsSync(destXinput)
    await reportUnknownSignature({ component: failedResult.component, sha256: failedResult.sha256, steam_build_id: steamBuildId || undefined })
    if (!buildIdChanged && dllsExist) {
      logger.info('DLLs exist but signature unknown for same build; continuing with existing DLLs', 'dll-inject')
      writeLastBuildId(steamPath, currentBuildId)
      return { success: true, installed: false, unsupportedBuild: true }
    }
    const retryResults = await ensureAllSignaturesCached(steamPath, 'pattern')
    const stillFailed = retryResults.find(r => !r.ok && r.status !== 'pending')
    if (stillFailed) {
      writeLastBuildId(steamPath, currentBuildId)
      if (buildIdChanged && dllsExist) {
        await closeSteamProcess().catch(() => {})
        removeHookDlls(steamPath)
      }
      return { success: true, error: buildIdChanged ? 'Steam updated; no compatible hook available yet. Removed stale hook to keep Steam working; a pattern will ship after validation.' : `Steam build (${failedResult.component}) not yet supported. Reported to the team; it will be available after validation.`, installed: false, unsupportedBuild: true }
    }
    // use cloned results
  }

  const dllsAlreadyExist = fs.existsSync(destHook) && fs.existsSync(destDwmapi) && fs.existsSync(destXinput)
  if (dllsAlreadyExist) {
    try {
      const closeResult = await closeSteamProcess()
      if (!closeResult.success) {
        return { success: true, installed: false }
      }
      backupExistingFile(destHook)
      backupExistingFile(destDwmapi)
      backupExistingFile(destXinput)
      fs.copyFileSync(hookPath, destHook)
      fs.copyFileSync(dwmapiPath, destDwmapi)
      fs.copyFileSync(xinputPath, destXinput)
      const tomlSrc = path.join(ostDir, 'ycoretool.toml')
      const tomlDst = path.join(steamPath, 'ycoretool.toml')
      if (fs.existsSync(tomlSrc)) fs.copyFileSync(tomlSrc, tomlDst)
      if (fs.existsSync(steamlessSrcDir)) fs.cpSync(steamlessSrcDir, destSteamlessDir, { recursive: true })
      writeLastBuildId(steamPath, currentBuildId)
      monitorAndRemediateHook(steamPath, signatureResults, currentBuildId).catch((err: any) => {
        logger.error(`monitorAndRemediateHook error: ${err.message}`, 'dll-inject')
      })
      return { success: true, installed: true }
    } catch (err: any) {
      return { success: true, installed: false }
    }
  }

  if (opts.silent) {
    return { success: false, installed: false, unsupportedBuild: true, error: 'Silent revalidation requires an existing hook; skipping dialog.' }
  }

  const response = await dialog.showMessageBox(state.mainWindow!, {
    type: 'warning',
    buttons: ['Cancelar', 'Instalar y reiniciar Steam'],
    defaultId: 1,
    cancelId: 0,
    title: 'Y-core',
    message: `Se instalará ${hookName}.dll, dwmapi.dll y xinput1_4.dll en tu carpeta de Steam (modo ${mode}).\n\nUsa bajo tu propio riesgo. Se recomienda usar una cuenta alterna.`,
    detail: 'Si cancelas, es posible que el juego no funcione correctamente.',
  })

  if (response.response === 0) {
    return { success: false, error: 'User cancelled hook DLL installation', installed: false }
  }

  try {
    const closeResult = await closeSteamProcess()
    if (!closeResult.success) {
      return { success: false, error: closeResult.error, installed: false }
    }

    backupExistingFile(destHook)
    backupExistingFile(destDwmapi)
    backupExistingFile(destXinput)
    fs.copyFileSync(hookPath, destHook)
    fs.copyFileSync(dwmapiPath, destDwmapi)
    fs.copyFileSync(xinputPath, destXinput)
    const tomlSrc = path.join(ostDir, 'ycoretool.toml')
    const tomlDst = path.join(steamPath, 'ycoretool.toml')
    if (fs.existsSync(tomlSrc)) fs.copyFileSync(tomlSrc, tomlDst)
    if (fs.existsSync(steamlessSrcDir)) fs.cpSync(steamlessSrcDir, destSteamlessDir, { recursive: true })

    if (!fs.existsSync(destHook) || !fs.existsSync(destDwmapi) || !fs.existsSync(destXinput)) {
      return { success: false, error: 'Hook files were not copied to the Steam folder. Try running as administrator or close Steam manually.', installed: false }
    }

    writeLastBuildId(steamPath, currentBuildId)
    monitorAndRemediateHook(steamPath, signatureResults, currentBuildId).catch((err: any) => {
      logger.error(`monitorAndRemediateHook error: ${err.message}`, 'dll-inject')
    })

    if (useYCoreTool) {
      const legacyLuaDir = path.join(steamPath, 'config', 'stplug-in')
      const ostLuaDir = path.join(steamPath, 'config', 'lua')
      if (fs.existsSync(legacyLuaDir)) {
        try {
          if (!fs.existsSync(ostLuaDir)) fs.mkdirSync(ostLuaDir, { recursive: true })
          const files = fs.readdirSync(legacyLuaDir)
          for (const file of files) {
            if (file.toLowerCase().endsWith('.lua')) {
              const src = path.join(legacyLuaDir, file)
              const dst = path.join(ostLuaDir, file)
              fs.copyFileSync(src, dst)
            }
          }
        } catch {}
      }
    }

    return { success: true, installed: true }
  } catch (err: any) {
    return { success: false, error: err.message, installed: false }
  }
}

export async function revalidateHookIfUpdated(steamPath: string, mode: 'release' | 'debug' = 'release'): Promise<boolean> {
  try {
    const current = getSteamBuildId()
    const last = readLastBuildId(steamPath)
    const hookPresent = fs.existsSync(path.join(steamPath, 'YCoreTool.dll')) || fs.existsSync(path.join(steamPath, 'steamtools_hook.dll'))
    const needsRevalidation = (!!current && !!last && current !== last) || (!!current && !last && hookPresent)
    if (!needsRevalidation) return false

    if (await isSteamRunning()) {
      logger.info('Steam running during hook revalidation; will revalidate on next launch', 'dll-inject')
      return false
    }

    logger.info(`Steam build changed since last hook install (last=${last}, current=${current}); revalidating`, 'dll-inject')
    await installHookDll(steamPath, mode, { silent: true })
    return true
  } catch (err: any) {
    logger.error(`revalidateHookIfUpdated error: ${err.message}`, 'dll-inject')
    return false
  }
}

export async function startSteam(): Promise<{ success: boolean; error?: string; message?: string }> {
  const platform = process.platform
  const steamPath = getSteamPath()

  if (steamPath) {
    const hookResult = await installHookDll(steamPath, 'release', { silent: true }).catch(() => null)

    const hookPresent = fs.existsSync(path.join(steamPath, 'YCoreTool.dll')) && fs.existsSync(path.join(steamPath, 'dwmapi.dll')) && fs.existsSync(path.join(steamPath, 'xinput1_4.dll'))
    if (hookResult && !hookResult.installed && hookPresent) {
      const buildId = getSteamBuildId()
      const signatureResults = await ensureAllSignaturesCached(steamPath, 'pattern')
      const monitorResults = signatureResults.map(r => ({ ...r, channel: 'pattern' as const }))
      monitorAndRemediateHook(steamPath, monitorResults, buildId).catch((err: any) => {
        logger.error(`monitorAndRemediateHook error: ${err.message}`, 'steam')
      })
    }
  }

  return new Promise((resolve) => {
    setTimeout(() => {
      if (platform === 'win32') {
        if (steamPath) {
          const steamExe = path.join(steamPath, 'steam.exe')
          if (fs.existsSync(steamExe)) {
            spawn(steamExe, [], { detached: true, stdio: 'ignore' }).unref()
            logger.info('Steam started', 'steam')
            resolve({ success: true, message: 'Steam started' })
          } else {
            resolve({ success: false, error: 'steam.exe not found' })
          }
        } else {
          resolve({ success: false, error: 'Steam path not found' })
        }
      } else if (platform === 'darwin') {
        exec('open -a Steam', (err) => {
          resolve(err ? { success: false, error: err.message } : { success: true, message: 'Steam started' })
        })
      } else if (platform === 'linux') {
        exec('steam &', (err) => {
          resolve(err ? { success: false, error: err.message } : { success: true, message: 'Steam started' })
        })
      } else {
        resolve({ success: false, error: 'Unsupported platform' })
      }
    }, 2000)
  })
}

export async function verifySteam(): Promise<{ success: boolean; error?: string; message?: string }> {
  const steamPath = getSteamPath()
  if (!steamPath) {
    return { success: false, error: 'Steam path not found' }
  }

  const closeResult = await closeSteamProcess()
  if (!closeResult.success) {
    return { success: false, error: closeResult.error }
  }

  const signatureResults = await ensureAllChannelsCached(steamPath)
  const pendingResult = signatureResults.find(r => r.status === 'pending' && r.channel === 'pattern')
  if (pendingResult) {
    logger.warn(`Signature pending during verify: ${pendingResult.component}/${pendingResult.sha256}`, 'steam')
  }

  const failedPatternResult = signatureResults.find(r => !r.ok && r.status !== 'pending' && r.channel === 'pattern')
  if (failedPatternResult) {
    logger.warn(`Pattern signature failed during verify: ${failedPatternResult.error}`, 'steam')
  }

  const failedIpcResult = signatureResults.find(r => !r.ok && r.channel === 'ipc')
  if (failedIpcResult) {
    logger.info(`IPC signature optional for ${failedIpcResult.component}: ${failedIpcResult.error}`, 'steam')
  }

  const hookResult = await installHookDll(steamPath)
  if (!hookResult.success) {
    return { success: false, error: hookResult.error || 'Failed to install Steam hooks' }
  }

  return startSteam()
}

export function checkSteamVerification(): { installed: boolean; missing: string[] } {
  const steamPath = getSteamPath()
  if (!steamPath) {
    return { installed: false, missing: ['Steam path not found'] }
  }

  const missing: string[] = []
  const yCoreTool = path.join(steamPath, 'YCoreTool.dll')
  const dwmapi = path.join(steamPath, 'dwmapi.dll')
  const xinput = path.join(steamPath, 'xinput1_4.dll')
  const legacyHook = path.join(steamPath, 'steamtools_hook.dll')

  if (!fs.existsSync(yCoreTool) && !fs.existsSync(legacyHook)) {
    missing.push('YCoreTool.dll')
  }
  if (!fs.existsSync(dwmapi)) {
    missing.push('dwmapi.dll')
  }
  if (!fs.existsSync(xinput)) {
    missing.push('xinput1_4.dll')
  }

  return { installed: missing.length === 0, missing }
}

export async function retrySignatureCheck(): Promise<{ success: boolean; status?: string; error?: string }> {
  const steamPath = getSteamPath()
  if (!steamPath) {
    return { success: false, error: 'Steam path not found' }
  }

  const results = await ensureAllSignaturesCached(steamPath, 'pattern')
  const pendingResult = results.find(r => r.status === 'pending')
  if (pendingResult) {
    return { success: false, status: 'pending', error: `Signature pending: ${pendingResult.component}/${pendingResult.sha256}` }
  }

  const failedResult = results.find(r => !r.ok && r.status !== 'pending')
  if (failedResult) {
    return { success: false, status: failedResult.status, error: `Signature check failed: ${failedResult.error}` }
  }

  return { success: true, status: 'approved' }
}
