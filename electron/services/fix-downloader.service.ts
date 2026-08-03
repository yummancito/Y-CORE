import path from 'path'
import fs from 'fs'
import { execSync } from 'child_process'
import { logger } from '../logger'
import { getSteamAppsPath } from '../modules/steam-helpers'

export async function downloadAndApplyFix(appId: string, fixId: string, apiKey: string): Promise<{ success: boolean; message: string }> {
  try {
    const steamAppsPath = getSteamAppsPath()
    if (!steamAppsPath) {
      return { success: false, message: 'Steam path not found' }
    }

    // Get game folder name from appId
    const appManifestPath = path.join(steamAppsPath, `appmanifest_${appId}.acf`)
    if (!fs.existsSync(appManifestPath)) {
      return { success: false, message: 'Game not installed' }
    }

    const manifest = fs.readFileSync(appManifestPath, 'utf-8')
    const installDirMatch = manifest.match(/"installdir"\s+"([^"]+)"/)
    const installDir = installDirMatch ? installDirMatch[1] : appId
    const gamePath = path.join(steamAppsPath, 'common', installDir)

    if (!fs.existsSync(gamePath)) {
      return { success: false, message: `Game folder not found: ${gamePath}` }
    }

    // Download fix from DepotBox
    const tmpDir = path.join(process.env.TEMP || 'C:\\temp', `ycore-fix-${appId}`)
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true })
    }

    const fixFile = path.join(tmpDir, `fix_${fixId}.zip`)
    logger.info(`[fix-downloader] Downloading fix ${fixId}...`, 'fix-downloader')

    // Download using curl
    const downloadCmd = `curl -L "https://depotbox.org/api/game-fixes/download?id=${fixId}" -H "X-API-Key: ${apiKey}" --fail -o "${fixFile}" 2>&1`

    try {
      execSync(downloadCmd, { stdio: 'pipe', encoding: 'utf-8' })
    } catch (err: any) {
      logger.error(`[fix-downloader] Download failed: ${err.message}`, 'fix-downloader')
      return { success: false, message: `Download failed: ${err.message}` }
    }

    if (!fs.existsSync(fixFile)) {
      return { success: false, message: 'Fix file not created after download' }
    }

    logger.info(`[fix-downloader] Fix downloaded: ${fixFile}`, 'fix-downloader')

    // Extract fix
    const extractCmd = `cd "${gamePath}" && tar -xf "${fixFile}" 2>&1 || powershell -Command "Expand-Archive -Path '${fixFile}' -DestinationPath '${gamePath}' -Force" 2>&1`

    try {
      execSync(extractCmd, { stdio: 'pipe', encoding: 'utf-8', shell: 'cmd.exe' })
    } catch (err: any) {
      logger.error(`[fix-downloader] Extract failed: ${err.message}`, 'fix-downloader')
      return { success: false, message: `Extract failed: ${err.message}` }
    }

    // Cleanup
    try {
      fs.unlinkSync(fixFile)
    } catch {}

    logger.info(`[fix-downloader] Fix applied successfully to ${gamePath}`, 'fix-downloader')
    return { success: true, message: 'Fix installed successfully' }

  } catch (err: any) {
    logger.error(`[fix-downloader] Error: ${err.message}`, 'fix-downloader')
    return { success: false, message: err.message }
  }
}
