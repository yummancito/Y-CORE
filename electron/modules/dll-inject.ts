import { dialog, BrowserWindow } from 'electron'
import path from 'path'
import fs from 'fs'
import { exec, spawn } from 'child_process'
import { logger } from '../logger'
import { state } from '../state'
import { closeSteamProcess, getSteamPath } from './steam-helpers'
import { ensureAllSignaturesCached, ensureAllChannelsCached } from './signature-cache'
import { waitAndReportSignatureOutcome } from './signature-report'

function backupExistingFile(filePath: string): void {
  if (!fs.existsSync(filePath)) return
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupPath = `${filePath}.backup-${timestamp}`
  try {
    fs.copyFileSync(filePath, backupPath)
  } catch {}
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

export async function installHookDll(steamPath: string, mode: 'release' | 'debug' = 'release'): Promise<{ success: boolean; error?: string; installed: boolean }> {
  const steamlessSrcDir = path.join(__dirname, '..', 'tools', 'steamless')
  const destSteamlessDir = path.join(steamPath, 'steamless')

  const ostDir = path.join(__dirname, '..', 'native', mode === 'debug' ? 'opensteamtool-debug' : 'opensteamtool')
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
    hookPath = path.join(__dirname, '..', 'native', 'steamtools_hook.dll')
    dwmapiPath = path.join(__dirname, '..', 'native', 'dwmapi.dll')
    xinputPath = path.join(__dirname, '..', 'native', 'xinput1_4.dll')
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
      if (fs.existsSync(oldPath)) {
        try { fs.unlinkSync(oldPath) } catch {}
      }
    }
  } else {
    const oldDlls = ['steamtools_hook.dll', 'YCoreTool.dll', 'OpenSteamTool.dll']
    for (const old of oldDlls) {
      const oldPath = path.join(steamPath, old)
      if (fs.existsSync(oldPath)) {
        try { fs.unlinkSync(oldPath) } catch {}
      }
    }
  }

  // Ensure YCoreTool pattern signature files are cached before installing hooks.
  // IPC specs are optional and only checked on demand via verifySteam().
  const signatureResults = await ensureAllSignaturesCached(steamPath, 'pattern')
  const pendingResult = signatureResults.find(r => r.status === 'pending')
  if (pendingResult) {
    logger.warn(`Signature pending for ${pendingResult.component}/${pendingResult.sha256}`, 'dll-inject')
    state.mainWindow?.webContents.send('signature:pending', {
      component: pendingResult.component,
      sha256: pendingResult.sha256,
    })
    return { success: false, error: 'Signature pending validation by beta testers', installed: false }
  }

  const failedResult = signatureResults.find(r => !r.ok && r.status !== 'pending')
  if (failedResult) {
    logger.error(`Signature cache failed: ${failedResult.error}`, 'dll-inject')
    return { success: false, error: `Signature cache failed: ${failedResult.error}`, installed: false }
  }

  if (fs.existsSync(destHook) && fs.existsSync(destDwmapi) && fs.existsSync(destXinput)) {
    if (!fs.existsSync(path.join(destSteamlessDir, 'Steamless.CLI.exe')) && fs.existsSync(steamlessSrcDir)) {
      try {
        fs.cpSync(steamlessSrcDir, destSteamlessDir, { recursive: true })
      } catch {}
    }
    return { success: true, installed: false }
  }

  const response = await dialog.showMessageBox(state.mainWindow!, {
    type: 'warning',
    buttons: ['Cancel', 'Install and close Steam'],
    defaultId: 1,
    cancelId: 0,
    title: 'Y-core',
    message: `Steam must be closed to install the hook DLLs (${mode} mode).\n\nThis will copy ${hookName}.dll, dwmapi.dll and xinput1_4.dll into your Steam folder. A backup of any existing files will be created.`,
    detail: 'If you cancel, the game may not launch correctly.'
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

    if (mode === 'debug') {
      const tomlSrc = path.join(ostDir, 'ycoretool.toml')
      const tomlDst = path.join(steamPath, 'ycoretool.toml')
      if (fs.existsSync(tomlSrc)) {
        fs.copyFileSync(tomlSrc, tomlDst)
      }
    }

    if (fs.existsSync(steamlessSrcDir)) {
      fs.cpSync(steamlessSrcDir, destSteamlessDir, { recursive: true })
    }

    if (!fs.existsSync(destHook) || !fs.existsSync(destDwmapi) || !fs.existsSync(destXinput)) {
      return { success: false, error: 'Hook files were not copied to the Steam folder. Try running as administrator or close Steam manually.', installed: false }
    }

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

export async function startSteam(): Promise<{ success: boolean; error?: string; message?: string }> {
  const platform = process.platform

  // Ensure YCoreTool pattern signatures are cached before launching Steam.
  // IPC specs are optional and only checked on demand via verifySteam().
  const steamPath = getSteamPath()
  if (steamPath) {
    const signatureResults = await ensureAllSignaturesCached(steamPath, 'pattern')
    const pendingResult = signatureResults.find(r => r.status === 'pending')
    if (pendingResult) {
      logger.warn(`Signature pending before Steam start: ${pendingResult.component}/${pendingResult.sha256}`, 'steam')
      state.mainWindow?.webContents.send('signature:pending', {
        component: pendingResult.component,
        sha256: pendingResult.sha256,
      })
      return { success: false, error: 'Signature pending validation by beta testers' }
    }

    const failedResult = signatureResults.find(r => !r.ok && r.status !== 'pending')
    if (failedResult) {
      logger.error(`Signature cache failed before Steam start: ${failedResult.error}`, 'steam')
      return { success: false, error: `Signature cache failed: ${failedResult.error}` }
    }

    // For any newly downloaded beta pattern signature, start background validation reporting.
    for (const result of signatureResults) {
      if (result.status === 'downloaded') {
        waitAndReportSignatureOutcome(result.component, result.sha256).catch((err) => {
          logger.error(`Signature report error: ${err.message}`, 'steam')
        })
      }
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
          resolve(err
            ? { success: false, error: err.message }
            : { success: true, message: 'Steam started' })
        })
      } else if (platform === 'linux') {
        exec('steam &', (err) => {
          resolve(err
            ? { success: false, error: err.message }
            : { success: true, message: 'Steam started' })
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

  // 1. Close Steam cleanly.
  const closeResult = await closeSteamProcess()
  if (!closeResult.success) {
    return { success: false, error: closeResult.error }
  }

  // 2. Force-check all signature channels (pattern + optional IPC).
  const signatureResults = await ensureAllChannelsCached(steamPath)
  const pendingResult = signatureResults.find(r => r.status === 'pending' && r.channel === 'pattern')
  if (pendingResult) {
    return { success: false, error: 'Signature pending validation by beta testers' }
  }
  const failedPatternResult = signatureResults.find(r => !r.ok && r.status !== 'pending' && r.channel === 'pattern')
  if (failedPatternResult) {
    return { success: false, error: `Signature cache failed: ${failedPatternResult.error}` }
  }
  const failedIpcResult = signatureResults.find(r => !r.ok && r.channel === 'ipc')
  if (failedIpcResult) {
    logger.info(`IPC signature optional for ${failedIpcResult.component}: ${failedIpcResult.error}`, 'steam')
  }

  // 3. Ensure hooks are installed/updated.
  const hookResult = await installHookDll(steamPath)
  if (!hookResult.success) {
    return { success: false, error: hookResult.error || 'Failed to install Steam hooks' }
  }

  // 4. Restart Steam.
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
