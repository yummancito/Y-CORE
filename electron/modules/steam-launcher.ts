// ============================================================================
// steam-launcher.ts — Auto-launch Steam for downloads + monitor progress
// ============================================================================
// Detecta Steam, lo lanza silenciosamente, monitorea descargas en tiempo real
// leyendo ACF y archivos. Sin UI de Steam visible para el usuario.

import { spawn, exec } from 'child_process'
import path from 'path'
import fs from 'fs'
import { logger } from '../logger'
import { getSteamPath, getSteamAppsPath } from './steam-helpers'

export interface SteamDownloadProgress {
  appId: string
  bytesDownloaded: number
  bytesTotal: number
  percent: number
  speed: number // bytes/sec
}

let steamProcess: any = null
let monitorInterval: any = null

/**
 * Detecta si Steam está instalado y retorna su ruta
 */
export function detectSteamPath(): string | null {
  const steamPath = getSteamPath()
  if (!steamPath) {
    logger.warn('[steam-launcher] Steam not found in registry', 'steam')
    return null
  }

  const steamExe = path.join(steamPath, 'steam.exe')
  if (!fs.existsSync(steamExe)) {
    logger.warn('[steam-launcher] steam.exe not found at ' + steamExe, 'steam')
    return null
  }

  return steamPath
}

/**
 * Lanza Steam silenciosamente para descargar un juego
 */
export async function launchSteamForDownload(appId: string): Promise<boolean> {
  try {
    const steamPath = detectSteamPath()
    if (!steamPath) {
      logger.error('[steam-launcher] Steam not found', 'steam')
      return false
    }

    // Matar Steam si ya está corriendo
    try {
      exec('taskkill /IM steam.exe /F')
    } catch {}

    // Lanzar Steam silenciosamente con comando de app
    const steamExe = path.join(steamPath, 'steam.exe')
    const args = [
      '-silent',
      '-no-cef-sandbox',
      `-applaunch ${appId}`,
    ]

    steamProcess = spawn(steamExe, args, {
      detached: false,
      stdio: 'ignore',
      windowsHide: true,
    })

    logger.info(`[steam-launcher] Steam launched for app ${appId}`, 'steam')
    return true
  } catch (err: any) {
    logger.error(`[steam-launcher] Failed to launch Steam: ${err.message}`, 'steam')
    return false
  }
}

/**
 * Lee el ACF de un juego para obtener progreso de descarga
 */
function readGameProgress(appId: string): SteamDownloadProgress | null {
  try {
    const steamAppsPath = getSteamAppsPath()
    if (!steamAppsPath) return null

    const acfPath = path.join(steamAppsPath, `appmanifest_${appId}.acf`)
    if (!fs.existsSync(acfPath)) {
      return null
    }

    const content = fs.readFileSync(acfPath, 'utf-8')

    // Parse ACF (formato Valve)
    const bytesDownloadedMatch = content.match(/"BytesDownloaded"\s+"(\d+)"/)
    const bytesToDownloadMatch = content.match(/"BytesToDownload"\s+"(\d+)"/)

    const bytesDownloaded = parseInt(bytesDownloadedMatch?.[1] || '0')
    const bytesTotal = parseInt(bytesToDownloadMatch?.[1] || '1')

    return {
      appId,
      bytesDownloaded,
      bytesTotal,
      percent: bytesTotal > 0 ? (bytesDownloaded / bytesTotal) * 100 : 0,
      speed: 0, // Calculado por el monitor
    }
  } catch {
    return null
  }
}

/**
 * Monitorea el progreso de descarga en tiempo real
 */
export function startDownloadMonitor(
  appId: string,
  onProgress: (progress: SteamDownloadProgress) => void,
  onComplete: () => void,
  checkInterval: number = 2000
): () => void {
  let lastBytes = 0
  let lastCheckTime = Date.now()

  monitorInterval = setInterval(() => {
    const progress = readGameProgress(appId)

    if (!progress) {
      logger.debug(`[steam-launcher] No progress data for ${appId}`, 'steam')
      return
    }

    // Calcular velocidad
    const now = Date.now()
    const elapsedSec = (now - lastCheckTime) / 1000
    const bytesDiff = progress.bytesDownloaded - lastBytes

    if (elapsedSec > 0) {
      progress.speed = Math.round(bytesDiff / elapsedSec)
    }

    lastBytes = progress.bytesDownloaded
    lastCheckTime = now

    onProgress(progress)

    // Detectar descarga completada
    if (progress.percent >= 100) {
      logger.info(`[steam-launcher] Download completed for app ${appId}`, 'steam')
      clearInterval(monitorInterval)
      onComplete()
    }
  }, checkInterval)

  // Retornar función para detener el monitor
  return () => {
    if (monitorInterval) {
      clearInterval(monitorInterval)
      monitorInterval = null
    }
  }
}

/**
 * Detiene Steam si está corriendo
 */
export function stopSteam(): boolean {
  try {
    if (steamProcess) {
      steamProcess.kill()
      steamProcess = null
    }

    // Asegurar que se mata via taskkill también
    exec('taskkill /IM steam.exe /F', { windowsHide: true })

    logger.info('[steam-launcher] Steam stopped', 'steam')
    return true
  } catch (err: any) {
    logger.warn(`[steam-launcher] Error stopping Steam: ${err.message}`, 'steam')
    return false
  }
}

/**
 * Optimizaciones de red para descargas más rápidas
 */
export async function optimizeNetworkForDownloads(): Promise<void> {
  try {
    // Aumentar buffer de socket
    const commands = [
      'netsh int tcp set global autotuninglevel=normal',
      'netsh int tcp set global congestionprovider=bbr',
      'netsh interface tcp set supplemental Internet congestionprovider=bbr',
    ]

    for (const cmd of commands) {
      exec(cmd, { windowsHide: true }, (err) => {
        if (!err) {
          logger.info(`[steam-launcher] Applied: ${cmd}`, 'network')
        }
      })
    }

    logger.info('[steam-launcher] Network optimizations applied', 'network')
  } catch (err: any) {
    logger.warn(`[steam-launcher] Network optimization failed: ${err.message}`, 'network')
  }
}
