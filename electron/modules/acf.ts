import path from 'path'
import fs from 'fs'
import { app } from 'electron'
import { getSteamAppsPath, getSteamUserId } from './steam-helpers'
import { GOLDSRC_BASE_DEPOT_IDS, GOLDSRC_MOD_APP_IDS } from './goldsrc'

const APP_LANG_TO_STEAM: Record<string, string> = {
  es: 'spanish',
  en: 'english',
  fr: 'french',
  pt: 'portuguese',
  de: 'german',
  zh: 'schinese',
  hi: 'hindi',
}

function getLanguageFromConfig(): string {
  try {
    const configPath = path.join(app.getPath('userData'), 'ycore-config.json')
    if (!fs.existsSync(configPath)) return 'english'
    const raw = fs.readFileSync(configPath, 'utf-8')
    const config = JSON.parse(raw)
    const lang = config.language || 'en'
    return APP_LANG_TO_STEAM[lang] || 'english'
  } catch {
    return 'english'
  }
}

export interface AddGameOptions {
  appId: string
  name?: string
  installDir?: string
  universe?: string
  stateFlags?: string
}

export function generateAcfContent(options: AddGameOptions, language?: string): string {
  const {
    appId,
    name = '',
    installDir = '',
    universe = '1',
    stateFlags = '1026',
  } = options

  const now = Math.floor(Date.now() / 1000)
  const lang = language || getLanguageFromConfig()

  return `"AppState"
{
\t"appid"\t\t"${appId}"
\t"Universe"\t\t"${universe}"
\t"name"\t\t"${name}"
\t"StateFlags"\t\t"${stateFlags}"
\t"installdir"\t\t"${installDir}"
\t"LastUpdated"\t\t"${now}"
\t"UpdateResult"\t\t"0"
\t"SizeOnDisk"\t\t"0"
\t"buildid"\t\t"0"
\t"LastOwner"\t\t"0"
\t"BytesToDownload"\t\t"0"
\t"BytesDownloaded"\t\t"0"
\t"AutoUpdateBehavior"\t\t"0"
\t"AllowOtherDownloadsWhileRunning"\t\t"0"
\t"ScheduledAutoUpdate"\t\t"0"
\t"UserConfig"
\t{
\t\t"Language"\t\t"${lang}"
\t}
\t"MountedDepots"
\t{
\t}
}
`
}

export function shouldRepairAcf(acfContent: string): boolean {
  const stateFlagsMatch = acfContent.match(/"StateFlags"\s+"(\d+)"/)
  const stateFlags = stateFlagsMatch ? parseInt(stateFlagsMatch[1]) : 0
  const sizeOnDisk0 = /"SizeOnDisk"\s+"0"/.test(acfContent)
  const hasInstalledDepots = /"InstalledDepots"\s*\{[\s\S]*?"\d+"\s*\{/.test(acfContent)
  return (stateFlags === 4 || stateFlags === 36) && sizeOnDisk0 && hasInstalledDepots
}

export function extractDepotSizesFromLua(luaContent: string): Record<string, number> {
  const sizes: Record<string, number> = {}
  const regex = /setManifestid\s*\(\s*(\d+)\s*,\s*"(\d+)"\s*,\s*(\d+)\s*\)/gi
  let match
  while ((match = regex.exec(luaContent)) !== null) {
    const depotId = match[1]
    const size = parseInt(match[3], 10)
    if (size > 0) sizes[depotId] = size
  }
  return sizes
}

export function patchAcfForDownload(acfContent: string, depotSizes?: Record<string, number>): string {
  let patched = acfContent
    .replace(/"StateFlags"\s+"\d+"/, '"StateFlags"\t\t"1026"')
    .replace(/"DownloadType"\s+"\d+"/, '"DownloadType"\t\t"1"')
    .replace(/"UpdateResult"\s+"\d+"/, '"UpdateResult"\t\t"0"')

  patched = patched
    .replace(/"BytesDownloaded"\s+"\d+"/, '"BytesDownloaded"\t\t"0"')
    .replace(/"BytesStaged"\s+"\d+"/, '"BytesStaged"\t\t"0"')

  if (depotSizes && Object.keys(depotSizes).length > 0) {
    let totalSize = 0
    for (const [depotId, size] of Object.entries(depotSizes)) {
      totalSize += size
      const depotSizeRegex = new RegExp(
        `(\\"${depotId}\\"\\s*\\{\\s*\\"manifest\\"\\s*\\"[^\\"]+\\"\\s*\\"size\\"\\s*\\")\\d+\\"`,
        'g'
      )
      patched = patched.replace(depotSizeRegex, `$1${size}"`)
    }
    patched = patched.replace(/"SizeOnDisk"\s+"\d+"/, `"SizeOnDisk"\t\t"${totalSize}"`)
    patched = patched.replace(/"BytesToDownload"\s+"\d+"/, `"BytesToDownload"\t\t"${totalSize}"`)
    patched = patched.replace(/"BytesToStage"\s+"\d+"/, `"BytesToStage"\t\t"${totalSize}"`)
  }

  const missingFields: Record<string, string> = {}
  if (!/"UpdateResult"/.test(patched)) missingFields['UpdateResult'] = '0'
  if (!/"BytesDownloaded"/.test(patched)) missingFields['BytesDownloaded'] = '0'
  if (!/"BytesStaged"/.test(patched)) missingFields['BytesStaged'] = '0'
  if (!/"BytesToDownload"/.test(patched)) missingFields['BytesToDownload'] = '0'
  if (!/"BytesToStage"/.test(patched)) missingFields['BytesToStage'] = '0'
  if (!/"TargetBuildID"/.test(patched)) {
    const buildidMatch = patched.match(/"buildid"\s+"(\d+)"/)
    missingFields['TargetBuildID'] = buildidMatch ? buildidMatch[1] : '0'
  }

  if (Object.keys(missingFields).length > 0) {
    const block = Object.entries(missingFields)
      .map(([key, value]) => `\t"${key}"\t\t"${value}"`)
      .join('\n')
    patched = patched.replace(/("DownloadType"\s+"1")/, `$1\n${block}`)
  }

  return patched
}

export function buildAppManifestAcf(
  appId: string,
  name: string,
  installDir: string,
  depotEntries: { depotId: string; manifestId: string; size?: string }[],
  sharedDepots: Record<string, string> = {},
  depotIdsWithKeys?: Set<string>,
  language?: string
): string {
  const lastOwner = getSteamUserId() || '0'
  const nowEpoch = Math.floor(Date.now() / 1000)
  const lang = language || getLanguageFromConfig()

  let totalSize = 0
  for (const entry of depotEntries) {
    if (depotIdsWithKeys && !depotIdsWithKeys.has(entry.depotId)) continue
    if (entry.size) totalSize += parseInt(entry.size)
  }

  const sharedDepotsBlock = Object.entries(sharedDepots)
    .map(([depotId, parentAppId]) => `\t\t"${depotId}"\t\t"${parentAppId}"`)
    .join('\n')

  return `"AppState"
{
\t"appid"\t\t"${appId}"
\t"Universe"\t\t"1"
\t"name"\t\t"${name}"
\t"StateFlags"\t\t"1026"
\t"installdir"\t\t"${installDir}"
\t"LastUpdated"\t\t"${nowEpoch}"
\t"LastPlayed"\t\t"0"
\t"SizeOnDisk"\t\t"0"
\t"StagingSize"\t\t"0"
\t"buildid"\t\t"0"
\t"LastOwner"\t\t"${lastOwner}"
\t"DownloadType"\t\t"1"
\t"UpdateResult"\t\t"0"
\t"BytesToDownload"\t\t"${totalSize}"
\t"BytesDownloaded"\t\t"0"
\t"BytesToStage"\t\t"0"
\t"BytesStaged"\t\t"0"
\t"TargetBuildID"\t\t"0"
\t"AutoUpdateBehavior"\t\t"0"
\t"AllowOtherDownloadsWhileRunning"\t\t"0"
\t"ScheduledAutoUpdate"\t\t"0"
\t"InstalledDepots"
\t{
\t}
\t"SharedDepots"
\t{
${sharedDepotsBlock}
\t}
\t"UserConfig"
\t{
\t\t"language"\t\t"${lang}"
\t}
\t"MountedConfig"
\t{
\t\t"language"\t\t"${lang}"
\t}
}
`
}

export function createAppManifestFromLua(
  appId: string,
  luaContent: string,
  gameName?: string,
  depotIdsWithKeys?: Set<string>,
  language?: string
): { success: boolean; path?: string; error?: string; sharedDepots?: Record<string, string> } {
  const steamAppsPath = getSteamAppsPath()
  if (!steamAppsPath) return { success: false, error: 'Steam apps directory not found' }

  const acfPath = path.join(steamAppsPath, `appmanifest_${appId}.acf`)

  if (fs.existsSync(acfPath)) {
    try { fs.unlinkSync(acfPath) } catch {}
  }

  const manifestRegex = /setManifestid\((\d+)\s*,\s*"(\d+)"(?:\s*,\s*(\d+))?\)/g
  const manifestEntries: { depotId: string; manifestId: string; size?: string }[] = []
  let m: RegExpExecArray | null
  while ((m = manifestRegex.exec(luaContent)) !== null) {
    manifestEntries.push({ depotId: m[1], manifestId: m[2], size: m[3] })
  }

  const name = gameName || appId
  const isGoldSrcMod = GOLDSRC_MOD_APP_IDS.has(appId)
  const installDir = isGoldSrcMod
    ? 'Half-Life'
    : name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '').trim() || appId

  const baseDepotIds = new Set(GOLDSRC_BASE_DEPOT_IDS)
  const modDepots = manifestEntries.filter(
    e => e.depotId !== appId && (!depotIdsWithKeys || depotIdsWithKeys.has(e.depotId)) && !baseDepotIds.has(e.depotId)
  )
  const sharedDepots: Record<string, string> = {}
  if (isGoldSrcMod) {
    for (const e of manifestEntries) {
      if (baseDepotIds.has(e.depotId) && (!depotIdsWithKeys || depotIdsWithKeys.has(e.depotId))) {
        sharedDepots[e.depotId] = '70'
      }
    }
  }

  const acfContent = buildAppManifestAcf(appId, name, installDir, modDepots, sharedDepots, depotIdsWithKeys, language)

  try {
    fs.writeFileSync(acfPath, acfContent, 'utf-8')
    return { success: true, path: acfPath, sharedDepots }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

export function createGoldSrcBaseAppManifest(
  luaContent: string,
  depotIdsWithKeys?: Set<string>,
  language?: string
): { success: boolean; path?: string; error?: string } {
  const steamAppsPath = getSteamAppsPath()
  if (!steamAppsPath) return { success: false, error: 'Steam apps directory not found' }

  const acfPath = path.join(steamAppsPath, 'appmanifest_70.acf')
  if (fs.existsSync(acfPath)) {
    try { fs.unlinkSync(acfPath) } catch {}
  }

  const manifestRegex = /setManifestid\((\d+)\s*,\s*"(\d+)"(?:\s*,\s*(\d+))?\)/g
  const manifestEntries: { depotId: string; manifestId: string; size?: string }[] = []
  let m: RegExpExecArray | null
  while ((m = manifestRegex.exec(luaContent)) !== null) {
    manifestEntries.push({ depotId: m[1], manifestId: m[2], size: m[3] })
  }

  const baseDepotIds = new Set(GOLDSRC_BASE_DEPOT_IDS)
  const baseDepots = manifestEntries.filter(
    e => baseDepotIds.has(e.depotId) && (!depotIdsWithKeys || depotIdsWithKeys.has(e.depotId))
  )

  if (baseDepots.length === 0) {
    return { success: false, error: 'No Half-Life base depots found in Lua' }
  }

  const acfContent = buildAppManifestAcf('70', 'Half-Life', 'Half-Life', baseDepots, {}, depotIdsWithKeys)

  try {
    fs.writeFileSync(acfPath, acfContent, 'utf-8')
    return { success: true, path: acfPath }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}
