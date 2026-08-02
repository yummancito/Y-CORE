import path from 'path'
import fs from 'fs'
import https from 'https'
import os from 'os'
import { app } from 'electron'
import { logger } from '../logger'
import { getSteamPath, closeSteamProcess } from './steam-helpers'

/**
 * Descarga archivos IPC spec desde GitHub para que YCoreTool funcione
 */
async function downloadIpcSpec(steamPath: string, sha256: string): Promise<boolean> {
  return new Promise((resolve) => {
    // OpenSteamTool 1.4.x reads specs from <Steam>\opensteamtool\ipc\...
    // (renamed from ycoretool\). Write BOTH roots so any deployed build works.
    const ipcRoots = [
      path.join(steamPath, 'opensteamtool', 'ipc', 'steamclient'),
      path.join(steamPath, 'ycoretool', 'ipc', 'steamclient'),
    ]

    // Si ya existe, no descargar
    if (ipcRoots.some((dir) => fs.existsSync(path.join(dir, `${sha256}.toml`)))) {
      logger.info(`[hook-dll-installer] IPC spec already exists`, 'installer')
      return resolve(true)
    }

    // Crear directorio si no existe
    const ipcDir = ipcRoots[0]
    if (!fs.existsSync(ipcDir)) {
      try {
        fs.mkdirSync(ipcDir, { recursive: true })
      } catch (err) {
        logger.warn(`[hook-dll-installer] Could not create IPC dir: ${err}`, 'installer')
        return resolve(false)
      }
    }

    // Descargar desde GitHub
    const url = `https://raw.githubusercontent.com/OpenSteam001/steam-monitor/ipc/steamclient/${sha256}.toml`
    logger.info(`[hook-dll-installer] Downloading IPC spec from ${url}`, 'installer')

    https.get(url, { timeout: 10000 }, (res) => {
      if (res.statusCode !== 200) {
        logger.warn(`[hook-dll-installer] Download failed: ${res.statusCode}`, 'installer')
        return resolve(false)
      }

      const file = fs.createWriteStream(path.join(ipcDir, `${sha256}.toml`))
      res.pipe(file)

      file.on('finish', () => {
        file.close()
        // Mirror to the legacy root as well
        try {
          const legacyFile = path.join(ipcRoots[1], `${sha256}.toml`)
          if (!fs.existsSync(path.dirname(legacyFile))) fs.mkdirSync(path.dirname(legacyFile), { recursive: true })
          fs.copyFileSync(path.join(ipcDir, `${sha256}.toml`), legacyFile)
        } catch {}
        logger.info(`[hook-dll-installer] Downloaded IPC spec successfully`, 'installer')
        resolve(true)
      })

      file.on('error', (err: any) => {
        fs.unlink(path.join(ipcDir, `${sha256}.toml`), () => {})
        logger.warn(`[hook-dll-installer] File write error: ${err.message}`, 'installer')
        resolve(false)
      })
    }).on('error', (err: any) => {
      logger.warn(`[hook-dll-installer] Download error: ${err.message}`, 'installer')
      resolve(false)
    })
  })
}

/**
 * Inyecta el hook DLL en Steam (versión simplificada sin validación de firmas)
 * Usa el flujo de dll-inject.ts pero SIN los diálogos y complejidad de firmas
 */
export async function installHookDllSilent(): Promise<{ success: boolean; injected: boolean; error?: string }> {
  try {
    const steamPath = getSteamPath()
    if (!steamPath) {
      return { success: false, injected: false, error: 'Steam path not found' }
    }

    const appRoot = app.getAppPath()

    // Primero, intentar usar la app instalada de Y-core como referencia (esa FUNCIONA)
    const installedYcorePath = path.join(
      process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'),
      'Programs',
      'Y-core',
      'resources',
      'app.asar.unpacked',
      'native',
      'opensteamtool'
    )

    // Buscar en múltiples ubicaciones
    let ostDir = installedYcorePath
    if (!fs.existsSync(path.join(ostDir, 'YCoreTool.dll'))) {
      ostDir = path.join(appRoot, 'native', 'opensteamtool')
    }
    if (!fs.existsSync(path.join(ostDir, 'YCoreTool.dll'))) {
      ostDir = path.join(appRoot, 'dist-electron', 'native', 'opensteamtool')
    }
    if (!fs.existsSync(path.join(ostDir, 'YCoreTool.dll'))) {
      ostDir = path.join(appRoot, 'resources', 'app.asar.unpacked', 'native', 'opensteamtool')
    }

    const srcHookPath = path.join(ostDir, 'YCoreTool.dll')
    const srcDwmapiPath = path.join(ostDir, 'dwmapi.dll')
    const srcXinputPath = path.join(ostDir, 'xinput1_4.dll')
    const srcTomlPath = path.join(ostDir, 'ycoretool.toml')

    const dstHookPath = path.join(steamPath, 'YCoreTool.dll')
    const dstDwmapiPath = path.join(steamPath, 'dwmapi.dll')
    const dstXinputPath = path.join(steamPath, 'xinput1_4.dll')
    const dstTomlPath = path.join(steamPath, 'ycoretool.toml')

    // ycore_steam.dll se inyecta como steam_api64.dll (hijack del loader)
    const dstSteamDll = path.join(steamPath, 'steam_api64.dll')

    // Verificar que existen los archivos fuente
    if (!fs.existsSync(srcHookPath) || !fs.existsSync(srcDwmapiPath) || !fs.existsSync(srcXinputPath)) {
      logger.warn(`[hook-dll-installer] Source DLLs not found in ${ostDir}`, 'installer')
      return { success: false, injected: false, error: 'Source DLLs not found' }
    }

    // PASO 1: Cerrar Steam completamente
    logger.info(`[hook-dll-installer] Closing Steam...`, 'installer')
    const closeResult = await closeSteamProcess()
    if (!closeResult.success) {
      logger.warn(`[hook-dll-installer] Could not close Steam: ${closeResult.error}`, 'installer')
      // Continuar de todas formas
    }

    // Esperar a que Steam se cierre completamente
    await new Promise(resolve => setTimeout(resolve, 2000))

    // PASO 2: Remover DLLs viejos/incompatibles
    const oldDlls = ['steamtools_hook.dll', 'OpenSteamTool.dll', 'ycore_hook.dll']
    for (const oldDll of oldDlls) {
      const oldPath = path.join(steamPath, oldDll)
      if (fs.existsSync(oldPath)) {
        try {
          fs.unlinkSync(oldPath)
          logger.info(`[hook-dll-installer] Removed old DLL: ${oldDll}`, 'installer')
        } catch (err: any) {
          logger.warn(`[hook-dll-installer] Could not remove ${oldDll}: ${err.message}`, 'installer')
        }
      }
    }

    // PASO 3: Hacer backup de los DLLs existentes
    const backupExisting = (filePath: string) => {
      if (fs.existsSync(filePath)) {
        try {
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
          const backupPath = `${filePath}.backup-${timestamp}`
          fs.copyFileSync(filePath, backupPath)
          logger.info(`[hook-dll-installer] Backed up ${path.basename(filePath)}`, 'installer')
        } catch (err: any) {
          logger.warn(`[hook-dll-installer] Could not backup ${path.basename(filePath)}: ${err.message}`, 'installer')
        }
      }
    }

    backupExisting(dstHookPath)
    backupExisting(dstDwmapiPath)
    backupExisting(dstXinputPath)

    // PASO 4: Copiar los nuevos DLLs
    let injected = 0

    try {
      fs.copyFileSync(srcHookPath, dstHookPath)
      logger.info(`[hook-dll-installer] Installed YCoreTool.dll`, 'installer')
      injected++
    } catch (err: any) {
      logger.error(`[hook-dll-installer] Failed to copy YCoreTool.dll: ${err.message}`, 'installer')
    }

    try {
      fs.copyFileSync(srcDwmapiPath, dstDwmapiPath)
      logger.info(`[hook-dll-installer] Installed dwmapi.dll`, 'installer')
      injected++
    } catch (err: any) {
      logger.error(`[hook-dll-installer] Failed to copy dwmapi.dll: ${err.message}`, 'installer')
    }

    try {
      fs.copyFileSync(srcXinputPath, dstXinputPath)
      logger.info(`[hook-dll-installer] Installed xinput1_4.dll`, 'installer')
      injected++
    } catch (err: any) {
      logger.error(`[hook-dll-installer] Failed to copy xinput1_4.dll: ${err.message}`, 'installer')
    }

    // PASO 5: Copiar configuración TOML (ambos nombres: legacy y 1.4.x)
    if (fs.existsSync(srcTomlPath)) {
      try {
        fs.copyFileSync(srcTomlPath, dstTomlPath)
        fs.copyFileSync(srcTomlPath, path.join(steamPath, 'opensteamtool.toml'))
        logger.info(`[hook-dll-installer] Installed ycoretool.toml`, 'installer')
        injected++
      } catch (err: any) {
        logger.warn(`[hook-dll-installer] Could not copy ycoretool.toml: ${err.message}`, 'installer')
      }
    }

    // PASO 6: Copiar scripts Lua si existen
    const srcLuaDir = path.join(ostDir, '..', 'lua')
    const dstLuaDir = path.join(steamPath, 'config', 'lua')
    if (fs.existsSync(srcLuaDir)) {
      try {
        if (!fs.existsSync(dstLuaDir)) {
          fs.mkdirSync(dstLuaDir, { recursive: true })
        }
        const luaFiles = fs.readdirSync(srcLuaDir)
        for (const file of luaFiles) {
          if (file.toLowerCase().endsWith('.lua')) {
            const src = path.join(srcLuaDir, file)
            const dst = path.join(dstLuaDir, file)
            fs.copyFileSync(src, dst)
          }
        }
        logger.info(`[hook-dll-installer] Copied Lua scripts`, 'installer')
      } catch (err: any) {
        logger.warn(`[hook-dll-installer] Could not copy Lua scripts: ${err.message}`, 'installer')
      }
    }

    // Verificar que se copiaron correctamente
    const success = fs.existsSync(dstHookPath) && fs.existsSync(dstDwmapiPath) && fs.existsSync(dstXinputPath)

    if (success && injected >= 3) {
      logger.info(`[hook-dll-installer] Successfully installed hook DLLs (${injected} components)`, 'installer')

      // PASO 7: Descargar IPC spec para YCoreTool (sin bloquear)
      logger.info(`[hook-dll-installer] Attempting to download IPC spec for YCoreTool...`, 'installer')
      // Usar SHA256 genérico como fallback - en producción se extraería del steamclient.dll
      const sha256 = '52ff7a513f8d5913a185ac8820eadb17d6e8e4144cd8fff36cc5bae6fa9d3fee'
      downloadIpcSpec(steamPath, sha256).then((downloaded) => {
        if (downloaded) {
          logger.info(`[hook-dll-installer] IPC spec download successful`, 'installer')
        } else {
          logger.warn(`[hook-dll-installer] Could not download IPC spec (YCoreTool will work with pattern-based hooks)`, 'installer')
        }
      }).catch((err: any) => {
        logger.warn(`[hook-dll-installer] IPC spec download error: ${err.message}`, 'installer')
      })

      return { success: true, injected: true }
    } else {
      logger.error(`[hook-dll-installer] Installation incomplete (only ${injected}/3+ DLLs)`, 'installer')
      return { success: false, injected: false, error: 'Installation incomplete' }
    }
  } catch (err: any) {
    logger.error(`[hook-dll-installer] Error: ${err.message}`, 'installer')
    return { success: false, injected: false, error: err.message }
  }
}
