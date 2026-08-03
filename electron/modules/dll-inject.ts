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

export function readLastBuildId(steamPath: string): string | null {
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

// Dedicated consent marker. last_build_id.txt is also written on FAILURE
// paths (unsupported build, signature retry), so it can NOT be used as proof
// the user ever accepted the hook dialog. This file is written only on a
// successful install, so silent revalidation never background-installs DLLs
// into Steam without prior consent.
const HOOK_CONSENT_FILE = path.join('ycoretool', 'hook_consent.txt')

function writeHookConsent(steamPath: string): void {
  try {
    const p = path.join(steamPath, HOOK_CONSENT_FILE)
    const dir = path.dirname(p)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(p, '1', 'utf-8')
  } catch {}
}

export function hasHookConsent(steamPath: string): boolean {
  try {
    return fs.existsSync(path.join(steamPath, HOOK_CONSENT_FILE))
  } catch {
    return false
  }
}

/** Hook DLL names installHookDll may deploy (YCoreTool preferred, legacy names included). */
const HOOK_DLL_NAMES = ['YCoreTool.dll', 'steamtools_hook.dll', 'OpenSteamTool.dll']

export function hookPresent(steamPath: string): boolean {
  return HOOK_DLL_NAMES.some((n) => fs.existsSync(path.join(steamPath, n)))
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
    path.join(steamPath, 'OpenSteamTool.dll'),
    path.join(steamPath, 'steamtools_hook.dll'),
    path.join(steamPath, 'dwmapi.dll'),
    path.join(steamPath, 'xinput1_4.dll'),
    path.join(steamPath, 'ycoretool.toml'),
    // OpenSteamTool 1.4.x renamed its config file; remove both names.
    path.join(steamPath, 'opensteamtool.toml'),
  ]
  for (const f of candidates) restoreOrDelete(f)
  logger.warn('Removed incompatible hook DLLs to recover Steam', 'dll-inject')
}

// OpenSteamTool was renamed from YCoreTool and the 1.4.x DLL reads its
// config from <Steam>\opensteamtool.toml (not ycoretool.toml). Write BOTH
// names so the currently-deployed hook always picks up the config regardless
// of which build is installed.
function copyHookConfig(steamPath: string, ostDir: string): void {
  const tomlSrc = path.join(ostDir, 'ycoretool.toml')
  if (!fs.existsSync(tomlSrc)) return
  try {
    fs.copyFileSync(tomlSrc, path.join(steamPath, 'ycoretool.toml'))
    fs.copyFileSync(tomlSrc, path.join(steamPath, 'opensteamtool.toml'))
  } catch {}
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
      // Check BOTH cache roots: legacy ycoretool\ and the opensteamtool\
      // path the 1.4.x hook actually reads.
      for (const base of ['opensteamtool', 'ycoretool']) {
        const dir = path.join(steamPath, base, 'ipc', r.component)
        const target = path.join(dir, `${r.sha256}.toml`)
        if (fs.existsSync(target)) continue
        copyAnyIpcToml(dir, target)
      }
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
  // NOTE: Steamless has been removed from Y-core's DRM removal system.
  // Only native C++ steamstub_remover.dll is used now.
  // const steamlessSrcDir = path.join(appRoot, 'tools', 'steamless')
  // const destSteamlessDir = path.join(steamPath, 'steamless')

  const ostDir = path.join(appRoot, 'native', mode === 'debug' ? 'opensteamtool-debug' : 'opensteamtool')
  const ostHookPath = path.join(ostDir, 'YCoreTool.dll')
  const ostDwmapiPath = path.join(ostDir, 'dwmapi.dll')
  const ostXinputPath = path.join(ostDir, 'xinput1_4.dll')
  const useYCoreTool = fs.existsSync(ostHookPath) && fs.existsSync(ostDwmapiPath) && fs.existsSync(ostXinputPath)

  // Legacy fallback name, still shipped in native/opensteamtool/ as
  // OpenSteamTool.dll. The OLD fallback below pointed at
  // native/steamtools_hook.dll directly under appRoot — a path that never
  // existed in this repo, so every install silently failed with
  // errors.hook.notFound whenever YCoreTool.dll wasn't present.
  const legacyHookPath = path.join(ostDir, 'OpenSteamTool.dll')
  const useLegacyOst = !useYCoreTool && fs.existsSync(legacyHookPath) && fs.existsSync(ostDwmapiPath) && fs.existsSync(ostXinputPath)

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
  } else if (useLegacyOst) {
    hookPath = legacyHookPath
    dwmapiPath = ostDwmapiPath
    xinputPath = ostXinputPath
    destHook = path.join(steamPath, 'OpenSteamTool.dll')
    hookName = 'OpenSteamTool'
  } else {
    hookPath = path.join(appRoot, 'native', 'steamtools_hook.dll')
    dwmapiPath = path.join(appRoot, 'native', 'dwmapi.dll')
    xinputPath = path.join(appRoot, 'native', 'xinput1_4.dll')
    destHook = path.join(steamPath, 'steamtools_hook.dll')
    hookName = 'steamtools_hook'
  }

  const destDwmapi = path.join(steamPath, 'dwmapi.dll')
  const destXinput = path.join(steamPath, 'xinput1_4.dll')

  // Localizar ycore_steam.dll (emulador Steam que YCoreTool necesita)
  let srcSteamDll = ''
  const steamDllCandidates = [
    path.join(appRoot, 'resources', 'native', 'ycore_steam.dll'),
    path.join(appRoot, 'native', 'ycore_steam', 'build', 'Release', 'ycore_steam.dll'),
    path.join('C:\\Program Files\\Y-core\\resources\\native', 'ycore_steam.dll'),
  ]
  for (const candidate of steamDllCandidates) {
    if (fs.existsSync(candidate)) {
      srcSteamDll = candidate
      break
    }
  }
  const destSteamDll = path.join(steamPath, 'ycore_steam.dll')

  if (!fs.existsSync(hookPath)) {
    return { success: false, error: 'errors.hook.notFound', installed: false }
  }
  if (!fs.existsSync(dwmapiPath)) {
    return { success: false, error: 'errors.hook.notFound', installed: false }
  }
  if (!fs.existsSync(xinputPath)) {
    return { success: false, error: 'errors.hook.notFound', installed: false }
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
    // NOTE: Steamless copy removed (native module only)
    // if (!fs.existsSync(path.join(destSteamlessDir, 'Steamless.CLI.exe')) && fs.existsSync(steamlessSrcDir)) {
    //   try { fs.cpSync(steamlessSrcDir, destSteamlessDir, { recursive: true }) } catch {}
    // }
    writeLastBuildId(steamPath, currentBuildId)
    // Migration: existing installs (hook files present but no marker, since
    // hook_consent.txt is new) — backfill the consent marker so silent
    // revalidation can auto-heal after future Steam updates.
    writeHookConsent(steamPath)
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
        logger.warn(`installHookDll: closeSteamProcess failed during DLL update: ${closeResult.error}`, 'dll-inject')
        return { success: false, installed: false, error: `Cannot update DLLs while Steam is running: ${closeResult.error}` }
      }
      backupExistingFile(destHook)
      backupExistingFile(destDwmapi)
      backupExistingFile(destXinput)
      if (srcSteamDll) backupExistingFile(destSteamDll)
      fs.copyFileSync(hookPath, destHook)
      fs.copyFileSync(dwmapiPath, destDwmapi)
      fs.copyFileSync(xinputPath, destXinput)
      if (srcSteamDll) {
        fs.copyFileSync(srcSteamDll, destSteamDll)
        logger.info(`Copied ycore_steam.dll to Steam folder`, 'dll-inject')
      }
      copyHookConfig(steamPath, ostDir)
      // NOTE: Steamless copy removed (native module only)
      // if (fs.existsSync(steamlessSrcDir)) fs.cpSync(steamlessSrcDir, destSteamlessDir, { recursive: true })
      writeLastBuildId(steamPath, currentBuildId)
      writeHookConsent(steamPath)
      monitorAndRemediateHook(steamPath, signatureResults, currentBuildId).catch((err: any) => {
        logger.error(`monitorAndRemediateHook error: ${err.message}`, 'dll-inject')
      })
      return { success: true, installed: true }
    } catch (err: any) {
      logger.error(`installHookDll: DLL copy failed (DLLs already exist path). Error: ${err?.message ?? err}`, 'dll-inject')
      return { success: false, installed: false, error: `DLL replacement failed: ${err?.message ?? 'unknown error'}` }
    }
  }

  // Silent revalidation is only safe when the user already consented to the
  // hook. Consent = the dedicated marker written on a successful install OR
  // hook DLLs already present in the Steam folder (implied consent — they
  // were actually deployed, and reinstalling carries the same risk the user
  // already accepted; this also covers existing users who predate the
  // hook_consent.txt marker). Without consent we must never background-
  // install DLLs into Steam. With consent, skip the dialog and reinstall —
  // this is the auto-heal path after a Steam client update removes the hook.
  const previouslyInstalled = hasHookConsent(steamPath) || hookPresent(steamPath)
  if (opts.silent) {
    if (!previouslyInstalled) {
      return { success: false, installed: false, unsupportedBuild: true, error: 'Silent revalidation requires prior hook consent; skipping install.' }
    }
  } else {
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
      return { success: false, error: 'errors.hook.userCancelled', installed: false }
    }
  }

  try {
    const closeResult = await closeSteamProcess()
    if (!closeResult.success) {
      logger.error(`installHookDll: closeSteamProcess failed: ${closeResult.error}`, 'dll-inject')
      return { success: false, error: `Failed to close Steam: ${closeResult.error}`, installed: false }
    }

    backupExistingFile(destHook)
    backupExistingFile(destDwmapi)
    backupExistingFile(destXinput)
    if (srcSteamDll) backupExistingFile(destSteamDll)
    fs.copyFileSync(hookPath, destHook)
    fs.copyFileSync(dwmapiPath, destDwmapi)
    fs.copyFileSync(xinputPath, destXinput)
    if (srcSteamDll) {
      fs.copyFileSync(srcSteamDll, destSteamDll)
      logger.info(`Copied ycore_steam.dll to Steam folder`, 'dll-inject')
    }
    copyHookConfig(steamPath, ostDir)
    // NOTE: Steamless copy removed (native module only)
    // if (fs.existsSync(steamlessSrcDir)) fs.cpSync(steamlessSrcDir, destSteamlessDir, { recursive: true })

    if (!fs.existsSync(destHook) || !fs.existsSync(destDwmapi) || !fs.existsSync(destXinput)) {
      return { success: false, error: 'errors.hook.notCopied', installed: false }
    }

    writeLastBuildId(steamPath, currentBuildId)
    writeHookConsent(steamPath)
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
    logger.error(`installHookDll: copy/write phase failed. Error: ${err?.message ?? err}. Steam: ${steamPath}`, 'dll-inject')
    return { success: false, error: `DLL installation failed: ${err?.message ?? 'unknown'}`, installed: false }
  }
}

export async function revalidateHookIfUpdated(steamPath: string, mode: 'release' | 'debug' = 'release'): Promise<boolean> {
  try {
    const current = getSteamBuildId()
    const last = readLastBuildId(steamPath)
    const hasHook = hookPresent(steamPath)

    // Revalidate when the Steam build changed OR the hook DLLs are missing
    // entirely (Defender quarantine, manual cleanup, or removal by a failed
    // signature check). A missing/stale hook = Steam stops faking ownership
    // and every game flips to "Comprar" in the library.
    const buildChanged = !!current && !!last && current !== last
    const needsRevalidation = buildChanged || (!!current && !hasHook)
    if (!needsRevalidation) {
      // Hook present + build matches → healthy, nothing to do.
      return true
    }

    // Missing hook + never consented → nothing we can install silently; this
    // is a terminal state for the background retry (the user must install a
    // game or run Settings → Steam → Verify to consent via the dialog).
    if (!hasHook && !hasHookConsent(steamPath)) {
      logger.info('[hook-revalidation] hook missing but no prior consent; skipping silent install', 'dll-inject')
      return true
    }

    if (await isSteamRunning()) {
      logger.info('Steam running during hook revalidation; will revalidate on next launch', 'dll-inject')
      return false // still pending — caller should retry later
    }

    logger.info(`Steam hook out of date (buildChanged=${buildChanged}, hasHook=${hasHook}, last=${last}, current=${current}); revalidating`, 'dll-inject')
    const installResult = await installHookDll(steamPath, mode, { silent: true })
    if (!installResult.success && installResult.error) {
      throw new Error(`Hook installation failed: ${installResult.error}`)
    }
    const present = hookPresent(steamPath)
    if (!present) {
      throw new Error(`Hook DLLs not present after install attempt. This usually means Defender quarantine, permission denied, or disk space issue.`)
    }
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
            resolve({ success: false, error: 'errors.steam.exeNotFound' })
          }
        } else {
          resolve({ success: false, error: 'errors.steam.pathNotFound' })
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
        resolve({ success: false, error: 'errors.platform.unsupported' })
      }
    }, 2000)
  })
}

export async function verifySteam(): Promise<{ success: boolean; error?: string; message?: string }> {
  const steamPath = getSteamPath()
  if (!steamPath) {
    return { success: false, error: 'errors.steam.pathNotFound' }
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
    return { success: false, error: hookResult.error || 'errors.hook.installFailed' }
  }

  return startSteam()
}

export function checkSteamVerification(): { installed: boolean; missing: string[] } {
  const steamPath = getSteamPath()
  if (!steamPath) {
    return { installed: false, missing: ['errors.steam.pathNotFound'] }
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
    return { success: false, error: 'errors.steam.pathNotFound' }
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
