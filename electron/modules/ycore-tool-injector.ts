import path from 'path'
import fs from 'fs'
import { app } from 'electron'
import { logger } from '../logger'
import { getSteamPath } from './steam-helpers'

export function injectYCoreTool(): { success: boolean; injected: number; error?: string } {
  try {
    const steamPath = getSteamPath()
    if (!steamPath) {
      return { success: false, injected: 0, error: 'Steam path not found' }
    }

    const appRoot = app.getAppPath()

    // Buscar YCoreTool.dll en múltiples ubicaciones (dev y production)
    let dllDir = path.join(appRoot, 'native', 'opensteamtool')
    if (!fs.existsSync(path.join(dllDir, 'YCoreTool.dll'))) {
      dllDir = path.join(appRoot, 'dist-electron', 'native', 'opensteamtool')
    }
    if (!fs.existsSync(path.join(dllDir, 'YCoreTool.dll'))) {
      dllDir = path.join(appRoot, 'resources', 'app.asar.unpacked', 'native', 'opensteamtool')
    }

    const srcHookPath = path.join(dllDir, 'YCoreTool.dll')
    const srcDwmapiPath = path.join(dllDir, 'dwmapi.dll')
    const srcXinputPath = path.join(dllDir, 'xinput1_4.dll')
    const srcTomlPath = path.join(dllDir, 'ycoretool.toml')

    const dstHookPath = path.join(steamPath, 'YCoreTool.dll')
    const dstDwmapiPath = path.join(steamPath, 'dwmapi.dll')
    const dstXinputPath = path.join(steamPath, 'xinput1_4.dll')
    const dstTomlPath = path.join(steamPath, 'ycoretool.toml')

    let injected = 0

    // Función auxiliar para copiar, haciendo rename del destino si está locked
    const copyWithRename = (src: string, dst: string): boolean => {
      try {
        if (fs.existsSync(dst)) {
          // Si existe, intentar hacerle rename para liberar el lock
          try {
            const renamePath = `${dst}.old-${Date.now()}`
            fs.renameSync(dst, renamePath)
            logger.info(`[ycore-tool-injector] Renamed old ${dst} to ${renamePath}`, 'injector')
          } catch (renameErr: any) {
            // Si no se puede renombrar, hacer backup
            const backupPath = `${dst}.bak`
            try {
              fs.copyFileSync(dst, backupPath)
              logger.info(`[ycore-tool-injector] Backed up old ${dst}`, 'injector')
            } catch {}
          }
        }
        fs.copyFileSync(src, dst)
        return true
      } catch (err: any) {
        logger.warn(`[ycore-tool-injector] Failed to copy ${src} to ${dst}: ${err.message}`, 'injector')
        return false
      }
    }

    // Verificar que existen los archivos fuente
    if (!fs.existsSync(srcHookPath)) {
      logger.warn(`[ycore-tool-injector] YCoreTool.dll not found at ${srcHookPath}`, 'injector')
    }

    // Copiar YCoreTool.dll
    if (fs.existsSync(srcHookPath)) {
      if (copyWithRename(srcHookPath, dstHookPath)) {
        logger.info(`[ycore-tool-injector] Injected YCoreTool.dll`, 'injector')
        injected++
      }
    }

    // Copiar dwmapi.dll (hijack)
    if (fs.existsSync(srcDwmapiPath)) {
      if (copyWithRename(srcDwmapiPath, dstDwmapiPath)) {
        logger.info(`[ycore-tool-injector] Injected dwmapi.dll`, 'injector')
        injected++
      }
    }

    // Copiar xinput1_4.dll (hijack)
    if (fs.existsSync(srcXinputPath)) {
      if (copyWithRename(srcXinputPath, dstXinputPath)) {
        logger.info(`[ycore-tool-injector] Injected xinput1_4.dll`, 'injector')
        injected++
      }
    }

    // Copiar ycoretool.toml (configuración) — también como opensteamtool.toml
    // porque OpenSteamTool 1.4.x (renombrado) lee la config con ese nombre.
    if (fs.existsSync(srcTomlPath)) {
      try {
        fs.copyFileSync(srcTomlPath, dstTomlPath)
        fs.copyFileSync(srcTomlPath, path.join(steamPath, 'opensteamtool.toml'))
        logger.info(`[ycore-tool-injector] Injected ycoretool.toml`, 'injector')
        injected++
      } catch (err: any) {
        logger.warn(`[ycore-tool-injector] Failed to copy ycoretool.toml: ${err.message}`, 'injector')
      }
    }

    // Copiar recursivamente directorio ipc/ (IPC specs para diferentes versiones de steamclient)
    // a AMBAS raíces: legacy ycoretool/ y la que lee el hook 1.4.x (opensteamtool/).
    const srcIpcDir = path.join(dllDir, 'ipc')
    const dstIpcDirs = [
      path.join(steamPath, 'opensteamtool', 'ipc'),
      path.join(steamPath, 'ycoretool', 'ipc'),
    ]
    if (fs.existsSync(srcIpcDir)) {
      try {
        const copyDirRecursive = (src: string, dst: string) => {
          if (!fs.existsSync(dst)) fs.mkdirSync(dst, { recursive: true })
          const files = fs.readdirSync(src)
          for (const file of files) {
            const srcFile = path.join(src, file)
            const dstFile = path.join(dst, file)
            if (fs.statSync(srcFile).isDirectory()) {
              copyDirRecursive(srcFile, dstFile)
            } else {
              fs.copyFileSync(srcFile, dstFile)
            }
          }
        }
        for (const dst of dstIpcDirs) copyDirRecursive(srcIpcDir, dst)
        logger.info(`[ycore-tool-injector] Injected ipc/ directory (opensteamtool + ycoretool)`, 'injector')
        injected++
      } catch (err: any) {
        logger.warn(`[ycore-tool-injector] Failed to copy ipc/ directory: ${err.message}`, 'injector')
      }
    }

    // Remover DLLs viejos/incompatibles
    const oldDlls = ['OpenSteamTool.dll', 'steamtools_hook.dll', 'ycore_hook.dll']
    for (const oldDll of oldDlls) {
      const oldPath = path.join(steamPath, oldDll)
      if (fs.existsSync(oldPath)) {
        try {
          fs.unlinkSync(oldPath)
          logger.info(`[ycore-tool-injector] Removed old DLL: ${oldDll}`, 'injector')
        } catch (err: any) {
          logger.warn(`[ycore-tool-injector] Failed to remove ${oldDll}: ${err.message}`, 'injector')
        }
      }
    }

    if (injected > 0) {
      logger.info(`[ycore-tool-injector] Successfully injected ${injected} components`, 'injector')
      return { success: true, injected }
    } else {
      return { success: false, injected: 0, error: 'No components were injected' }
    }
  } catch (err: any) {
    logger.error(`[ycore-tool-injector] Error: ${err.message}`, 'injector')
    return { success: false, injected: 0, error: err.message }
  }
}
