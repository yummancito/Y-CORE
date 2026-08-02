import fs from 'fs'
import path from 'path'
import {
  getDepotCachePath,
  getLuaScriptsDir,
  getSteamLibraryFolders,
  getSteamAppsPath,
  isValidAppId,
} from './steam-helpers'
import { extractDepotSizesFromLua, patchAcfForDownload, shouldRepairAcf } from './acf'

export interface LocalInstallationDiagnostic {
  appId: string
  ok: boolean
  gameDir: string | null
  acfPresent: boolean
  luaPresent: boolean
  referencedManifestCount: number
  presentManifestCount: number
  missingManifests: string[]
  repaired: string[]
  issues: string[]
}

function isInside(parent: string, candidate: string): boolean {
  const root = path.resolve(parent)
  const resolved = path.resolve(candidate)
  return resolved === root || resolved.startsWith(root + path.sep)
}

function resolveGameDir(installDir: string): { gameDir: string | null; steamAppsPath: string | null } {
  if (!installDir || installDir.includes('\0')) return { gameDir: null, steamAppsPath: null }

  for (const library of getSteamLibraryFolders()) {
    const commonDir = path.join(library, 'common')
    const candidate = path.isAbsolute(installDir)
      ? path.resolve(installDir)
      : path.resolve(commonDir, installDir)
    if (!isInside(commonDir, candidate) || candidate === path.resolve(commonDir)) continue

    try {
      // Resolve the complete path before any write. This catches symlinked
      // parent components as well as a symlinked game directory escaping the
      // selected Steam library.
      const realCommonDir = fs.realpathSync(commonDir)
      const realCandidate = fs.realpathSync(candidate)
      if (!isInside(realCommonDir, realCandidate) || realCandidate === realCommonDir) continue
      if (fs.lstatSync(candidate).isSymbolicLink()) continue
      if (fs.statSync(candidate).isDirectory()) {
        // getSteamLibraryFolders() returns paths ending in `steamapps`.
        return { gameDir: candidate, steamAppsPath: library }
      }
    } catch {
      // Missing or inaccessible paths are diagnosed as not found below.
      continue
    }
  }

  // Do not fall back to the default library when the supplied installDir was
  // not found. That could cause a repair action for one game to rewrite an
  // unrelated appmanifest in another library.
  return { gameDir: null, steamAppsPath: null }
}

function readManifestReferences(luaContent: string): string[] {
  const refs: string[] = []
  const regex = /setManifestid\s*\(\s*(\d+)\s*,\s*["']?(\d+)/gi
  let match: RegExpExecArray | null
  while ((match = regex.exec(luaContent)) !== null) {
    refs.push(`${match[1]}_${match[2]}.manifest`)
  }
  return [...new Set(refs)]
}

/**
 * Diagnose and repair only local installation metadata.
 *
 * This deliberately does not download files, fetch keys, modify executables,
 * apply online/bypass fixes, or change Steam ownership state. It can repair a
 * stale ACF and copy manifest files that are already present locally.
 */
export async function diagnoseAndRepairLocalInstallation(
  appId: string,
  installDir: string,
): Promise<LocalInstallationDiagnostic> {
  const result: LocalInstallationDiagnostic = {
    appId,
    ok: false,
    gameDir: null,
    acfPresent: false,
    luaPresent: false,
    referencedManifestCount: 0,
    presentManifestCount: 0,
    missingManifests: [],
    repaired: [],
    issues: [],
  }

  if (!isValidAppId(appId)) {
    result.issues.push('Invalid AppID')
    return result
  }

  const resolved = resolveGameDir(installDir)
  result.gameDir = resolved.gameDir
  if (!resolved.gameDir) {
    result.issues.push('Game installation folder was not found in a Steam library')
  }

  const luaDir = getLuaScriptsDir()
  const luaPath = luaDir ? path.join(luaDir, `${appId}.lua`) : null
  const luaContent = luaPath && fs.existsSync(luaPath) ? fs.readFileSync(luaPath, 'utf8') : ''
  result.luaPresent = Boolean(luaContent.trim())
  if (!result.luaPresent) result.issues.push('Local Lua metadata is missing or empty')

  const steamAppsPath = resolved.steamAppsPath
  const acfPath = steamAppsPath ? path.join(steamAppsPath, `appmanifest_${appId}.acf`) : null
  let acfContent = ''
  if (acfPath && fs.existsSync(acfPath)) {
    result.acfPresent = true
    acfContent = fs.readFileSync(acfPath, 'utf8')
  } else {
    result.issues.push('Steam appmanifest is missing')
  }

  // Repair only a local stale ACF. No executable or license data is touched.
  if (acfPath && acfContent && luaContent && shouldRepairAcf(acfContent)) {
    const repairedAcf = patchAcfForDownload(acfContent, extractDepotSizesFromLua(luaContent))
    if (repairedAcf !== acfContent) {
      const backupPath = `${acfPath}.ycore.bak`
      const tempPath = `${acfPath}.ycore.tmp-${process.pid}`
      try {
        if (fs.lstatSync(acfPath).isSymbolicLink()) {
          result.issues.push('Steam appmanifest is a symlink and was not modified')
        } else {
          if (fs.existsSync(backupPath) && fs.lstatSync(backupPath).isSymbolicLink()) {
            result.issues.push('Existing appmanifest backup is a symlink and was not overwritten')
          } else {
            if (!fs.existsSync(backupPath)) fs.copyFileSync(acfPath, backupPath)
            // Write beside the original and rename atomically so an interrupted
            // repair cannot leave Steam with a truncated ACF.
            fs.writeFileSync(tempPath, repairedAcf, 'utf8')
            fs.renameSync(tempPath, acfPath)
            result.repaired.push('Steam appmanifest metadata')
          }
        }
      } finally {
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath)
      }
    }
  }

  const references = readManifestReferences(luaContent)
  result.referencedManifestCount = references.length
  const depotCache = getDepotCachePath()
  // Do not copy arbitrary files from Downloads/Desktop into Steam's cache.
  // A repair must be deterministic and local; missing manifests are reported
  // so the user can use the normal authorized reinstall/download flow.
  result.missingManifests = references.filter((file) => !depotCache || !fs.existsSync(path.join(depotCache, file)))
  result.presentManifestCount = references.length - result.missingManifests.length
  if (result.missingManifests.length > 0) {
    result.issues.push(`${result.missingManifests.length} manifest file(s) are unavailable locally`)
  }
  if (result.gameDir) {
    const entries = fs.readdirSync(result.gameDir)
    if (entries.length === 0) result.issues.push('Game installation folder is empty')
  }

  result.ok = result.issues.length === 0
  return result
}
