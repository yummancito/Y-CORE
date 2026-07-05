import path from 'path'
import fs from 'fs'
import { getLuaScriptsDir } from './steam-helpers'
import { parseLuaScript, type ParsedLuaAppId, type ParsedLuaManifest } from './lua'

export const GOLDSRC_BASE_DEPOT_IDS = ['1', '2', '3', '8', '9', '96', '228988']
export const GOLDSRC_MOD_APP_IDS = new Set([
  '10', // Counter-Strike
  '20', // Team Fortress Classic
  '30', // Day of Defeat
  '40', // Deathmatch Classic
  '50', // Half-Life: Opposing Force
  '60', // Ricochet
  '80', // Counter-Strike: Condition Zero
  '100', // Counter-Strike: Condition Zero Deleted Scenes
  '130', // Half-Life: Blue Shift
])

export function readGoldSrcBaseDepots(): {
  depotKeys: { depotId: string; key: string }[]
  manifests: { depotId: string; manifestId: string }[]
  source: string
} | null {
  const scriptsDir = getLuaScriptsDir()
  if (!scriptsDir) return null

  const candidates = ['130.lua', '70.lua', '50.lua', '100.lua', '80.lua']
  for (const fileName of candidates) {
    const filePath = path.join(scriptsDir, fileName)
    if (!fs.existsSync(filePath)) continue
    try {
      const content = fs.readFileSync(filePath, 'utf-8')
      const parsed = parseLuaScript(content, fileName)
      const depotKeys = parsed.appIds
        .filter((a: ParsedLuaAppId) => a.key && GOLDSRC_BASE_DEPOT_IDS.includes(a.id))
        .map((a: ParsedLuaAppId) => ({ depotId: a.id, key: a.key! }))
      const manifests = parsed.manifestIds.filter((m: ParsedLuaManifest) => GOLDSRC_BASE_DEPOT_IDS.includes(m.depotId))
      if (depotKeys.length === 0 || manifests.length === 0) continue
      return { depotKeys, manifests, source: fileName }
    } catch {
      continue
    }
  }
  return null
}

export function ensureGoldSrcBaseDepots(
  appId: string,
  luaContent: string,
  existingDepotKeys: { depot_id: string; key: string }[]
): {
  updatedLua: string
  addedDepotKeys: { depot_id: string; key: string }[]
  addedManifests: { depot_id: string; manifest_id: string }[]
  source?: string
  warning?: string
} {
  const existingDepotIds = new Set(existingDepotKeys.map(k => k.depot_id))
  const parsed = parseLuaScript(luaContent, `${appId}.lua`)
  const luaDepotIds = new Set(parsed.appIds.map((a: ParsedLuaAppId) => a.id))

  const isMissingBase = GOLDSRC_BASE_DEPOT_IDS.some(id => !luaDepotIds.has(id))
  if (!GOLDSRC_MOD_APP_IDS.has(appId) || !isMissingBase) {
    return { updatedLua: luaContent, addedDepotKeys: [], addedManifests: [] }
  }

  const base = readGoldSrcBaseDepots()
  if (!base) {
    return {
      updatedLua: luaContent,
      addedDepotKeys: [],
      addedManifests: [],
      warning: 'Missing Half-Life base depots. Install Half-Life/Blue Shift first or add base depots to the store Lua.',
    }
  }

  let updatedLua = luaContent
  const addedDepotKeys: { depot_id: string; key: string }[] = []
  const addedManifests: { depot_id: string; manifest_id: string }[] = []

  for (const dk of base.depotKeys) {
    if (!luaDepotIds.has(dk.depotId) && !existingDepotIds.has(dk.depotId)) {
      updatedLua += `\naddappid(${dk.depotId}, 1, "${dk.key}")`
      addedDepotKeys.push({ depot_id: dk.depotId, key: dk.key })
    }
  }

  for (const mf of base.manifests) {
    if (!parsed.manifestIds.some((m: ParsedLuaManifest) => m.depotId === mf.depotId)) {
      updatedLua += `\nsetManifestid(${mf.depotId}, "${mf.manifestId}")`
      addedManifests.push({ depot_id: mf.depotId, manifest_id: mf.manifestId })
    }
  }

  return { updatedLua, addedDepotKeys, addedManifests, source: base.source }
}
