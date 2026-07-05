import { ipcMain } from 'electron'
import fs from 'fs'
import path from 'path'
import { logger } from '../logger'
import { isValidAppId, getSteamAppsPath } from './steam-helpers'

function readAcfLaunchOptions(acfPath: string): string {
  try {
    const content = fs.readFileSync(acfPath, 'utf-8')
    const match = content.match(/"LaunchOptions"\s+"([^"]*)"/)
    return match ? match[1] : ''
  } catch {
    return ''
  }
}

function writeAcfLaunchOptions(acfPath: string, launchOptions: string): boolean {
  try {
    let content = fs.readFileSync(acfPath, 'utf-8')

    if (launchOptions) {
      if (/"LaunchOptions"\s+"[^"]*"/.test(content)) {
        content = content.replace(/"LaunchOptions"\s+"[^"]*"/, `"LaunchOptions"\t\t"${launchOptions}"`)
      } else if (/"UserConfig"\s*\{/.test(content)) {
        content = content.replace(
          /"UserConfig"\s*\{/,
          `"UserConfig"\n\t{\n\t\t"LaunchOptions"\t\t"${launchOptions}"`
        )
      } else {
        content = content.replace(/\n\}\s*$/, `\n\t"UserConfig"\n\t{\n\t\t"LaunchOptions"\t\t"${launchOptions}"\n\t}\n}`)
      }
    } else {
      content = content.replace(/\s*"LaunchOptions"\s+"[^"]*"/, '')
    }

    fs.writeFileSync(acfPath, content, 'utf-8')
    return true
  } catch (err: any) {
    logger.error(`Failed to write LaunchOptions: ${err.message}`, 'onlinefix')
    return false
  }
}

export function registerOnlineFixHandlers(invalidateGamesCache: () => void) {
  ipcMain.handle('onlinefix:enable', async (_event, data: { appId: string }) => {
    const { appId } = data
    if (!isValidAppId(appId)) {
      return { success: false, error: 'Invalid AppID' }
    }

    const steamAppsPath = getSteamAppsPath()
    if (!steamAppsPath) {
      return { success: false, error: 'Steam apps directory not found' }
    }

    const acfPath = path.join(steamAppsPath, `appmanifest_${appId}.acf`)
    if (!fs.existsSync(acfPath)) {
      return { success: false, error: `appmanifest_${appId}.acf not found` }
    }

    const current = readAcfLaunchOptions(acfPath)
    if (current.includes('-onlinefix')) {
      return { success: true, message: 'Online Fix already enabled' }
    }

    const newOptions = current ? `${current} -onlinefix` : '-onlinefix'
    const ok = writeAcfLaunchOptions(acfPath, newOptions)
    if (ok) {
      invalidateGamesCache()
      logger.info(`OnlineFix enabled for ${appId}`, 'onlinefix')
      return { success: true, launchOptions: newOptions }
    }
    return { success: false, error: 'Failed to write ACF file' }
  })

  ipcMain.handle('onlinefix:disable', async (_event, data: { appId: string }) => {
    const { appId } = data
    if (!isValidAppId(appId)) {
      return { success: false, error: 'Invalid AppID' }
    }

    const steamAppsPath = getSteamAppsPath()
    if (!steamAppsPath) {
      return { success: false, error: 'Steam apps directory not found' }
    }

    const acfPath = path.join(steamAppsPath, `appmanifest_${appId}.acf`)
    if (!fs.existsSync(acfPath)) {
      return { success: false, error: `appmanifest_${appId}.acf not found` }
    }

    const current = readAcfLaunchOptions(acfPath)
    if (!current.includes('-onlinefix')) {
      return { success: true, message: 'Online Fix not enabled' }
    }

    const newOptions = current.replace(/\s*-onlinefix/g, '').trim()
    const ok = writeAcfLaunchOptions(acfPath, newOptions)
    if (ok) {
      invalidateGamesCache()
      logger.info(`OnlineFix disabled for ${appId}`, 'onlinefix')
      return { success: true, launchOptions: newOptions }
    }
    return { success: false, error: 'Failed to write ACF file' }
  })

  ipcMain.handle('onlinefix:status', async (_event, data: { appId: string }) => {
    const { appId } = data
    if (!isValidAppId(appId)) {
      return { enabled: false, launchOptions: '' }
    }

    const steamAppsPath = getSteamAppsPath()
    if (!steamAppsPath) {
      return { enabled: false, launchOptions: '' }
    }

    const acfPath = path.join(steamAppsPath, `appmanifest_${appId}.acf`)
    if (!fs.existsSync(acfPath)) {
      return { enabled: false, launchOptions: '' }
    }

    const launchOptions = readAcfLaunchOptions(acfPath)
    return {
      enabled: launchOptions.includes('-onlinefix'),
      launchOptions,
    }
  })
}
