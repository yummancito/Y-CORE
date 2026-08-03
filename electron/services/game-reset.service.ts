import path from 'path'
import fs from 'fs'
import { logger } from '../logger'
import { getSteamAppsPath } from '../modules/steam-helpers'

export function resetGameForDownload(appId: string): { success: boolean; message: string } {
  try {
    const steamAppsPath = getSteamAppsPath()
    if (!steamAppsPath) {
      return { success: false, message: 'Steam path not found' }
    }

    const acfPath = path.join(steamAppsPath, `appmanifest_${appId}.acf`)
    if (!fs.existsSync(acfPath)) {
      return { success: false, message: 'Game manifest not found' }
    }

    let manifest = fs.readFileSync(acfPath, 'utf-8')

    // Reset manifest fields to make Steam think download is needed
    manifest = manifest
      .replace(/"StateFlags"\s+"(\d+)"/, '"StateFlags"\t\t"4"')
      .replace(/"BytesDownloaded"\s+"\d+"/, '"BytesDownloaded"\t\t"0"')
      .replace(/"BytesStaged"\s+"\d+"/, '"BytesStaged"\t\t"0"')
      .replace(/"SizeOnDisk"\s+"\d+"/, '"SizeOnDisk"\t\t"0"')

    // Remove or clear InstalledDepots to force re-download
    manifest = manifest.replace(
      /"InstalledDepots"\s*\{[\s\S]*?\n\t\}/,
      '"InstalledDepots"\n\t{\n\t}'
    )

    fs.writeFileSync(acfPath, manifest, 'utf-8')
    logger.info(`[game-reset] Reset game ${appId} for download`, 'game-reset')

    return { success: true, message: 'Game reset - Steam will now show as "Install"' }

  } catch (err: any) {
    logger.error(`[game-reset] Error: ${err.message}`, 'game-reset')
    return { success: false, message: err.message }
  }
}
