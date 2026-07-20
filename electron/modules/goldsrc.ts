import path from 'path'
import fs from 'fs'
import { getSteamAppsPath } from './steam-helpers'

// ============================================================================
// GoldSrc (Half-Life engine) base-depot handling
// ----------------------------------------------------------------------------
// GoldSrc mods (Counter-Strike, Blue Shift, Opposing Force, …) do not ship the
// Half-Life engine/content themselves — on Steam they mount Half-Life's (appid
// 70) base depots via SharedDepots. When we install one of these mods through a
// Lua script we must make sure the Half-Life base depots (and their keys) are
// present, otherwise the game will not launch.
// ============================================================================

/**
 * App IDs that are GoldSrc *mods* which depend on Half-Life (70) base content.
 * Half-Life itself (70) is intentionally NOT in this set — it is the base game,
 * not a mod.
 */
export const GOLDSRC_MOD_APP_IDS = new Set<string>([
  '10',  // Counter-Strike
  '20',  // Team Fortress Classic
  '30',  // Day of Defeat
  '40',  // Deathmatch Classic
  '50',  // Half-Life: Opposing Force
  '60',  // Ricochet
  '80',  // Condition Zero
  '100', // Condition Zero: Deleted Scenes
  '130', // Half-Life: Blue Shift
])

/**
 * Half-Life (appid 70) base depot IDs that GoldSrc mods share via SharedDepots.
 */
export const GOLDSRC_BASE_DEPOT_IDS: string[] = [
  '1',
  '2',
  '3',
  '8',
  '9',
  '96',
  '228988',
]

export interface DepotKey {
  depot_id: string
  key: string
}

export interface ManifestEntry {
  depotId: string
  manifestId: string
  size?: string
}

export interface GoldSrcBaseData {
  /** addappid(depot, 1, "key") entries parsed from the Half-Life base Lua */
  depotKeys: DepotKey[]
  /** setManifestid(depot, "manifest", size) entries from the base Lua */
  manifests: ManifestEntry[]
}

export interface EnsureGoldSrcResult {
  updatedLua: string
  addedDepotKeys: DepotKey[]
  addedManifests: ManifestEntry[]
  warning?: string
}

function hasAppId(lua: string, id: string): boolean {
  return new RegExp(`addappid\\(\\s*${id}\\s*[,)]`).test(lua)
}

/**
 * Attempt to read Half-Life's base depot keys/manifests from a locally-present
 * Half-Life Lua (installed previously as appid 70). Returns null when no base
 * Lua can be found — the caller then surfaces a warning telling the user to
 * install Half-Life first.
 */
export function readGoldSrcBaseDepots(): GoldSrcBaseData | null {
  const steamApps = getSteamAppsPath()
  if (!steamApps) return null

  // SteamTools-style plugin folder holds the per-app Lua scripts.
  const candidatePaths = [
    path.join(steamApps, 'stplug-in', '70.lua'),
    path.join(steamApps, 'stplug-in', 'Half-Life.lua'),
  ]

  let content: string | null = null
  for (const p of candidatePaths) {
    try {
      if (fs.existsSync(p)) {
        content = fs.readFileSync(p, 'utf-8') as unknown as string
        if (content) break
      }
    } catch {
      // ignore and try next candidate
    }
  }

  if (!content) return null

  const baseSet = new Set(GOLDSRC_BASE_DEPOT_IDS)

  const depotKeys: DepotKey[] = []
  const keyRegex = /addappid\((\d+)\s*,\s*\d+\s*,\s*"([^"]+)"\)/g
  let km: RegExpExecArray | null
  while ((km = keyRegex.exec(content)) !== null) {
    if (baseSet.has(km[1])) depotKeys.push({ depot_id: km[1], key: km[2] })
  }

  const manifests: ManifestEntry[] = []
  const manifestRegex = /setManifestid\((\d+)\s*,\s*"(\d+)"(?:\s*,\s*(\d+))?\)/g
  let mm: RegExpExecArray | null
  while ((mm = manifestRegex.exec(content)) !== null) {
    if (baseSet.has(mm[1])) manifests.push({ depotId: mm[1], manifestId: mm[2], size: mm[3] })
  }

  if (depotKeys.length === 0 && manifests.length === 0) return null
  return { depotKeys, manifests }
}

/**
 * Ensure a GoldSrc mod's Lua contains the Half-Life base depots. For non-mods
 * (or mods that already list every base depot) the Lua is returned unchanged.
 * When base depots are missing it pulls them from a locally installed Half-Life
 * Lua; if that is unavailable it returns a warning instead of mutating the Lua.
 */
export function ensureGoldSrcBaseDepots(
  appId: string,
  currentLua: string,
  existingDepotKeys: DepotKey[],
): EnsureGoldSrcResult {
  // Not a GoldSrc mod → nothing to do.
  if (!GOLDSRC_MOD_APP_IDS.has(appId)) {
    return { updatedLua: currentLua, addedDepotKeys: [], addedManifests: [] }
  }

  const existingKeyIds = new Set(existingDepotKeys.map(k => k.depot_id))
  const missingDepots = GOLDSRC_BASE_DEPOT_IDS.filter(d => !hasAppId(currentLua, d))

  // Every base depot is already declared in the Lua → nothing to add.
  if (missingDepots.length === 0) {
    return { updatedLua: currentLua, addedDepotKeys: [], addedManifests: [] }
  }

  const base = readGoldSrcBaseDepots()
  if (!base) {
    return {
      updatedLua: currentLua,
      addedDepotKeys: [],
      addedManifests: [],
      warning:
        `Missing Half-Life base depots (${missingDepots.join(', ')}). ` +
        `Install Half-Life (appid 70) first so its base game files are available for this GoldSrc mod.`,
    }
  }

  const addedDepotKeys: DepotKey[] = []
  const addedManifests: ManifestEntry[] = []
  const linesToAppend: string[] = []

  for (const dk of base.depotKeys) {
    if (!missingDepots.includes(dk.depot_id)) continue
    if (existingKeyIds.has(dk.depot_id)) continue
    addedDepotKeys.push(dk)
    linesToAppend.push(`addappid(${dk.depot_id}, 1, "${dk.key}")`)
  }

  for (const mf of base.manifests) {
    if (!missingDepots.includes(mf.depotId)) continue
    addedManifests.push(mf)
    linesToAppend.push(
      mf.size
        ? `setManifestid(${mf.depotId}, "${mf.manifestId}", ${mf.size})`
        : `setManifestid(${mf.depotId}, "${mf.manifestId}")`,
    )
  }

  if (linesToAppend.length === 0) {
    return { updatedLua: currentLua, addedDepotKeys: [], addedManifests: [] }
  }

  const updatedLua =
    currentLua.replace(/\s*$/, '') + '\n' + linesToAppend.join('\n') + '\n'

  return { updatedLua, addedDepotKeys, addedManifests }
}
