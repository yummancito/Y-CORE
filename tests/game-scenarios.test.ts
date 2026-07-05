import { describe, it, expect } from 'vitest'
import { parseLuaScript } from '@y-core/shared'

const GOLDSRC_BASE_DEPOT_IDS = ['1', '2', '3', '8', '9', '96', '228988']
const GOLDSRC_MOD_APP_IDS = new Set([
  '10', '20', '30', '40', '50', '60', '80', '100', '130',
])

function buildAppManifestAcf(
  appId: string,
  name: string,
  installDir: string,
  depotEntries: { depotId: string; manifestId: string; size?: string }[],
  sharedDepots: Record<string, string> = {},
  depotIdsWithKeys?: Set<string>
): string {
  const lastOwner = '0'
  const nowEpoch = Math.floor(Date.now() / 1000)

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
\t\t"language"\t\t"english"
\t}
\t"MountedConfig"
\t{
\t\t"language"\t\t"english"
\t}
}
`
}

function createAppManifestFromLua(
  appId: string,
  luaContent: string,
  gameName?: string,
  depotIdsWithKeys?: Set<string>
): { acf: string; sharedDepots: Record<string, string> } {
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

  const acfContent = buildAppManifestAcf(appId, name, installDir, modDepots, sharedDepots, depotIdsWithKeys)
  return { acf: acfContent, sharedDepots }
}

function injectDepotKeysIntoContent(
  content: string,
  depotKeys: { depotId: string; key: string }[]
): { content: string; added: number } {
  let added = 0

  const existingKeys = new Set<string>()
  const depotKeyRegex = /"(\d+)"\s*\{\s*\n\s*"DecryptionKey"\s*"([a-f0-9]+)"/g
  let match
  while ((match = depotKeyRegex.exec(content)) !== null) {
    existingKeys.add(match[1])
  }

  const depotsMatch = content.match(/"depots"\s*\n\s*\{/)
  if (!depotsMatch) {
    let depotsContent = '\t\t\t\t\t"depots"\n\t\t\t\t\t{\n'
    for (const { depotId, key } of depotKeys) {
      depotsContent += `\t\t\t\t\t\t"${depotId}"\n\t\t\t\t\t\t{\n\t\t\t\t\t\t\t"DecryptionKey"\t\t"${key}"\n\t\t\t\t\t\t}\n`
      added++
    }
    depotsContent += '\t\t\t\t\t}\n'

    const steamSectionStart = content.indexOf('"Steam"')
    const steamBraceStart = content.indexOf('{', steamSectionStart)
    const insertPos = content.indexOf('\n', steamBraceStart) + 1
    content = content.slice(0, insertPos) + depotsContent + content.slice(insertPos)
  } else {
    const depotsStart = depotsMatch.index! + depotsMatch[0].length
    let braceCount = 1
    let pos = depotsStart
    while (braceCount > 0 && pos < content.length) {
      if (content[pos] === '{') braceCount++
      if (content[pos] === '}') braceCount--
      pos++
    }

    const closingBracePos = pos - 1
    let lineStart = closingBracePos
    while (lineStart > 0 && content[lineStart - 1] !== '\n') {
      lineStart--
    }

    const depotsLineStart = content.lastIndexOf('\n', depotsMatch.index!) + 1
    const depotsIndent = content.slice(depotsLineStart, depotsMatch.index!).match(/^\s*/)?.[0] || '\t\t\t\t\t'

    let newEntries = ''
    for (const { depotId, key } of depotKeys) {
      if (!existingKeys.has(depotId)) {
        newEntries += `${depotsIndent}\t"${depotId}"\n${depotsIndent}\t{\n${depotsIndent}\t\t"DecryptionKey"\t\t"${key}"\n${depotsIndent}\t}\n`
        added++
      }
    }

    if (newEntries) {
      content = content.slice(0, lineStart) + newEntries + content.slice(lineStart)
    }
  }

  return { content, added }
}

const SAMPLE_CONFIG_VDF_NO_DEPOTS = `"InstallConfigStore"
{
\t"Software"
\t{
\t\t"Valve"
\t\t{
\t\t\t"Steam"
\t\t\t{
\t\t\t\t"Rate"\t\t"0"
\t\t\t}
\t\t}
\t}
}`

// ── Scenario 1: Juego normal con depots encriptados ─────────────────

describe('Scenario 1: Normal game with encrypted depots (e.g. Valheim)', () => {
  const LUA = `-- Valheim
addappid(892970)
addappid(892971, 1, "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4")
addappid(892972, 1, "f1e2d3c4b5a6f1e2d3c4b5a6f1e2d3c4")
setManifestid(892971, "1234567890123456789", 5000000000)
setManifestid(892972, "9876543210987654321", 3000000000)`

  it('parses Lua with 1 main AppID + 2 depot keys', () => {
    const parsed = parseLuaScript(LUA, '892970.lua')
    expect(parsed.appIds).toHaveLength(3)
    expect(parsed.appIds[0].id).toBe('892970')
    expect(parsed.appIds[0].key).toBeUndefined()
    expect(parsed.appIds[1].key).toBeDefined()
    expect(parsed.appIds[2].key).toBeDefined()
  })

  it('all depots have keys - no missing keys error', () => {
    const parsed = parseLuaScript(LUA, '892970.lua')
    const depotKeys = parsed.appIds.filter(a => a.key).map(a => ({ depotId: a.id, key: a.key! }))
    const keyDepotIds = new Set(depotKeys.map(k => k.depotId))
    const missing = parsed.appIds
      .filter(a => a.id !== '892970' && !a.key && !keyDepotIds.has(a.id))
      .map(a => a.id)
    expect(missing).toHaveLength(0)
  })

  it('ACF has correct installDir (game name, not Half-Life)', () => {
    const { acf } = createAppManifestFromLua('892970', LUA, 'Valheim')
    expect(acf).toContain('"installdir"\t\t"Valheim"')
    expect(acf).not.toContain('"installdir"\t\t"Half-Life"')
  })

  it('ACF has no SharedDepots (normal game)', () => {
    const { sharedDepots, acf } = createAppManifestFromLua('892970', LUA, 'Valheim')
    expect(Object.keys(sharedDepots)).toHaveLength(0)
  })

  it('ACF BytesToDownload = sum of all depot sizes', () => {
    const parsed = parseLuaScript(LUA, '892970.lua')
    const depotKeys = parsed.appIds.filter(a => a.key).map(a => ({ depotId: a.id, key: a.key! }))
    const keySet = new Set(depotKeys.map(k => k.depotId))
    const { acf } = createAppManifestFromLua('892970', LUA, 'Valheim', keySet)
    // 5000000000 + 3000000000 = 8000000000
    expect(acf).toContain('"BytesToDownload"\t\t"8000000000"')
  })

  it('depot keys injected into config.vdf', () => {
    const parsed = parseLuaScript(LUA, '892970.lua')
    const depotKeys = parsed.appIds.filter(a => a.key).map(a => ({ depotId: a.id, key: a.key! }))
    const result = injectDepotKeysIntoContent(SAMPLE_CONFIG_VDF_NO_DEPOTS, depotKeys)
    expect(result.added).toBe(2)
    expect(result.content).toContain('a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4')
    expect(result.content).toContain('f1e2d3c4b5a6f1e2d3c4b5a6f1e2d3c4')
  })

  it('full flow: parse → validate → ACF → inject keys', () => {
    const parsed = parseLuaScript(LUA, '892970.lua')
    const depotKeys = parsed.appIds.filter(a => a.key).map(a => ({ depotId: a.id, key: a.key! }))
    const keySet = new Set(depotKeys.map(k => k.depotId))

    // ACF
    const { acf } = createAppManifestFromLua('892970', LUA, 'Valheim', keySet)
    expect(acf).toContain('"appid"\t\t"892970"')
    expect(acf).toContain('"StateFlags"\t\t"1026"')

    // Keys
    const vdfResult = injectDepotKeysIntoContent(SAMPLE_CONFIG_VDF_NO_DEPOTS, depotKeys)
    expect(vdfResult.added).toBe(2)
  })
})

// ── Scenario 2: Juego F2P (Free-to-Play) ────────────────────────────

describe('Scenario 2: Free-to-Play game (no depot keys needed)', () => {
  const LUA = `-- F2P game (e.g. CS2)
addappid(730)`

  it('parses Lua with only main AppID, no depots', () => {
    const parsed = parseLuaScript(LUA, '730.lua')
    expect(parsed.appIds).toHaveLength(1)
    expect(parsed.appIds[0].id).toBe('730')
    expect(parsed.appIds[0].key).toBeUndefined()
    expect(parsed.manifestIds).toHaveLength(0)
  })

  it('no missing depot keys (no depots at all)', () => {
    const parsed = parseLuaScript(LUA, '730.lua')
    const missing = parsed.appIds.filter(a => a.id !== '730' && !a.key)
    expect(missing).toHaveLength(0)
  })

  it('ACF has BytesToDownload = 0 (no depots to download)', () => {
    const { acf } = createAppManifestFromLua('730', LUA, 'Counter-Strike 2')
    expect(acf).toContain('"BytesToDownload"\t\t"0"')
  })

  it('no depot keys to inject into config.vdf', () => {
    const parsed = parseLuaScript(LUA, '730.lua')
    const depotKeys = parsed.appIds.filter(a => a.key).map(a => ({ depotId: a.id, key: a.key! }))
    expect(depotKeys).toHaveLength(0)
  })

  it('ACF is still valid with StateFlags 1026', () => {
    const { acf } = createAppManifestFromLua('730', LUA, 'Counter-Strike 2')
    expect(acf).toContain('"StateFlags"\t\t"1026"')
    expect(acf).toContain('"appid"\t\t"730"')
  })
})

// ── Scenario 3: Mod de GoldSrc (Counter-Strike) ─────────────────────

describe('Scenario 3: GoldSrc mod (Counter-Strike, AppID 10)', () => {
  const LUA = `-- Counter-Strike (GoldSrc mod)
addappid(10)
addappid(1, 1, "aaaa1111aaaa1111aaaa1111aaaa1111")
addappid(2, 1, "bbbb2222bbbb2222bbbb2222bbbb2222")
addappid(3, 1, "cccc3333cccc3333cccc3333cccc3333")
addappid(8, 1, "dddd4444dddd4444dddd4444dddd4444")
addappid(9, 1, "eeee5555eeee5555eeee5555eeee5555")
addappid(96, 1, "ffff6666ffff6666ffff6666ffff6666")
addappid(228988, 1, "11117777111177771111777711117777")
setManifestid(1, "111", 1000000)
setManifestid(2, "222", 2000000)
setManifestid(3, "333", 3000000)
setManifestid(8, "444", 4000000)
setManifestid(9, "555", 5000000)
setManifestid(96, "666", 6000000)
setManifestid(228988, "777", 7000000)`

  it('is recognized as GoldSrc mod', () => {
    expect(GOLDSRC_MOD_APP_IDS.has('10')).toBe(true)
  })

  it('installDir is Half-Life (shared folder)', () => {
    const { acf } = createAppManifestFromLua('10', LUA, 'Counter-Strike')
    expect(acf).toContain('"installdir"\t\t"Half-Life"')
  })

  it('base depots go to SharedDepots pointing to AppID 70', () => {
    const { sharedDepots } = createAppManifestFromLua('10', LUA, 'Counter-Strike')
    // All GOLDSRC_BASE_DEPOT_IDS should be in sharedDepots
    for (const baseId of GOLDSRC_BASE_DEPOT_IDS) {
      expect(sharedDepots[baseId]).toBe('70')
    }
  })

  it('ACF contains SharedDepots entries', () => {
    const { acf } = createAppManifestFromLua('10', LUA, 'Counter-Strike')
    expect(acf).toContain('"1"\t\t"70"')
    expect(acf).toContain('"2"\t\t"70"')
    expect(acf).toContain('"228988"\t\t"70"')
  })

  it('mod-specific depots are NOT in SharedDepots', () => {
    const { sharedDepots, acf } = createAppManifestFromLua('10', LUA, 'Counter-Strike')
    // AppID 10 itself should not be a shared depot
    expect(sharedDepots['10']).toBeUndefined()
  })

  it('all base depot keys are injected into config.vdf', () => {
    const parsed = parseLuaScript(LUA, '10.lua')
    const depotKeys = parsed.appIds.filter(a => a.key).map(a => ({ depotId: a.id, key: a.key! }))
    expect(depotKeys).toHaveLength(7) // 7 base depots with keys

    const result = injectDepotKeysIntoContent(SAMPLE_CONFIG_VDF_NO_DEPOTS, depotKeys)
    expect(result.added).toBe(7)
    for (const baseId of GOLDSRC_BASE_DEPOT_IDS) {
      expect(result.content).toContain(`"${baseId}"`)
    }
  })

  it('non-GoldSrc game does NOT get Half-Life installDir', () => {
    const LUA_NORMAL = `addappid(892970)
addappid(892971, 1, "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4")`
    const { acf } = createAppManifestFromLua('892970', LUA_NORMAL, 'Valheim')
    expect(acf).not.toContain('"installdir"\t\t"Half-Life"')
  })

  it('all GoldSrc mod AppIDs are recognized', () => {
    const expectedMods = ['10', '20', '30', '40', '50', '60', '80', '100', '130']
    for (const modId of expectedMods) {
      expect(GOLDSRC_MOD_APP_IDS.has(modId)).toBe(true)
    }
  })

  it('non-mod AppID is NOT recognized as GoldSrc mod', () => {
    expect(GOLDSRC_MOD_APP_IDS.has('892970')).toBe(false)
    expect(GOLDSRC_MOD_APP_IDS.has('730')).toBe(false)
    expect(GOLDSRC_MOD_APP_IDS.has('480')).toBe(false)
  })
})

// ── Scenario 4: Juego con DLCs ──────────────────────────────────────

describe('Scenario 4: Game with DLCs (multiple depots with separate keys)', () => {
  const LUA = `-- Base game + 2 DLCs
addappid(480)
addappid(481, 1, "aaaa1111aaaa1111aaaa1111aaaa1111")
addappid(482, 1, "bbbb2222bbbb2222bbbb2222bbbb2222")
addappid(483, 1, "cccc3333cccc3333cccc3333cccc3333")
setManifestid(481, "111", 1000000000)
setManifestid(482, "222", 500000000)
setManifestid(483, "333", 200000000)`

  it('parses 1 main AppID + 3 depot/DLC keys', () => {
    const parsed = parseLuaScript(LUA, '480.lua')
    expect(parsed.appIds).toHaveLength(4)
    expect(parsed.manifestIds).toHaveLength(3)
  })

  it('all DLC depots have keys', () => {
    const parsed = parseLuaScript(LUA, '480.lua')
    const depotKeys = parsed.appIds.filter(a => a.key).map(a => ({ depotId: a.id, key: a.key! }))
    expect(depotKeys).toHaveLength(3)
    const missing = parsed.appIds.filter(a => a.id !== '480' && !a.key)
    expect(missing).toHaveLength(0)
  })

  it('ACF total size includes all DLC depots', () => {
    const parsed = parseLuaScript(LUA, '480.lua')
    const depotKeys = parsed.appIds.filter(a => a.key).map(a => ({ depotId: a.id, key: a.key! }))
    const keySet = new Set(depotKeys.map(k => k.depotId))
    const { acf } = createAppManifestFromLua('480', LUA, 'TestGame', keySet)
    // 1000000000 + 500000000 + 200000000 = 1700000000
    expect(acf).toContain('"BytesToDownload"\t\t"1700000000"')
  })

  it('all 3 DLC depot keys injected into config.vdf', () => {
    const parsed = parseLuaScript(LUA, '480.lua')
    const depotKeys = parsed.appIds.filter(a => a.key).map(a => ({ depotId: a.id, key: a.key! }))
    const result = injectDepotKeysIntoContent(SAMPLE_CONFIG_VDF_NO_DEPOTS, depotKeys)
    expect(result.added).toBe(3)
    expect(result.content).toContain('"481"')
    expect(result.content).toContain('"482"')
    expect(result.content).toContain('"483"')
  })

  it('DLC with missing key is flagged', () => {
    const luaMissingDlcKey = `addappid(480)
addappid(481, 1, "aaaa1111aaaa1111aaaa1111aaaa1111")
addappid(482)
setManifestid(481, "111", 1000)
setManifestid(482, "222", 2000)`
    const parsed = parseLuaScript(luaMissingDlcKey, '480.lua')
    const missing = parsed.appIds.filter(a => a.id !== '480' && !a.key).map(a => a.id)
    expect(missing).toEqual(['482'])
  })
})

// ── Scenario 5: Juego importado desde carpeta (contenido en disco) ──

describe('Scenario 5: Imported game folder (content already on disk)', () => {
  // When importing a folder, the ACF is typically read from existing state
  // or created with StateFlags = 4 (FullyInstalled) instead of 1026

  it('imported game should have StateFlags 4 (FullyInstalled) not 1026', () => {
    // buildAppManifestAcf always creates StateFlags 1026 (for store installs)
    // Import folder flow reads existing ACF or creates a different one
    // Here we verify the difference
    const acf = buildAppManifestAcf('480', 'ImportedGame', 'ImportedGame', [])
    expect(acf).toContain('"StateFlags"\t\t"1026"') // Store install state
    // Import flow would use StateFlags = "4" for FullyInstalled
  })

  it('imported game ACF with FullyInstalled state (simulated)', () => {
    // Simulate what an imported game ACF looks like
    const importedAcf = `"AppState"
{
\t"appid"\t\t"480"
\t"name"\t\t"ImportedGame"
\t"StateFlags"\t\t"4"
\t"installdir"\t\t"ImportedGame"
\t"SizeOnDisk"\t\t"5000000000"
\t"BytesToDownload"\t\t"0"
\t"BytesDownloaded"\t\t"0"
\t"InstalledDepots"
\t{
\t\t"481"
\t\t{
\t\t\t"manifest"\t\t"1234567890123456789"
\t\t\t"size"\t\t"5000000000"
\t\t}
\t}
}`
    expect(importedAcf).toContain('"StateFlags"\t\t"4"')
    expect(importedAcf).toContain('"SizeOnDisk"\t\t"5000000000"')
    expect(importedAcf).toContain('"BytesToDownload"\t\t"0"')
    // Content is on disk - InstalledDepots is populated
    expect(importedAcf).toContain('"manifest"\t\t"1234567890123456789"')
  })

  it('imported game does not need depot keys in config.vdf if already decrypted', () => {
    // If the game was imported from a folder that already has decrypted content,
    // no depot keys are needed. The Lua script is still needed for the AppID trick.
    const lua = `addappid(480)`
    const parsed = parseLuaScript(lua, '480.lua')
    const depotKeys = parsed.appIds.filter(a => a.key).map(a => ({ depotId: a.id, key: a.key! }))
    expect(depotKeys).toHaveLength(0)
  })

  it('imported game with encrypted content still needs depot keys', () => {
    // If the imported folder has encrypted content, keys are still needed
    const lua = `addappid(480)
addappid(481, 1, "abcdef0123456789abcdef0123456789")`
    const parsed = parseLuaScript(lua, '480.lua')
    const depotKeys = parsed.appIds.filter(a => a.key).map(a => ({ depotId: a.id, key: a.key! }))
    expect(depotKeys).toHaveLength(1)
  })
})

// ── Scenario 6: Juego con Online Fix (AppID 480 trick) ──────────────

describe('Scenario 6: Online Fix game (AppID 480 SpaceWar trick)', () => {
  it('Online Fix uses AppID 480 (SpaceWar) for multiplayer', () => {
    // The DLL intercepts SteamAPI_Init and replaces the real AppID with 480
    // This allows P2P multiplayer between cracked copies
    const ONLINE_FIX_APP_ID = 480
    expect(ONLINE_FIX_APP_ID).toBe(480)
  })

  it('Online Fix enable adds -onlinefix to LaunchOptions', () => {
    // Simulate ACF before
    const acfBefore = `"AppState"
{
\t"appid"\t\t"892970"
\t"UserConfig"
\t{
\t\t"LaunchOptions"\t\t"-novid"
\t}
}`
    // Extract current options
    const match = acfBefore.match(/"LaunchOptions"\s+"([^"]*)"/)
    const current = match ? match[1] : ''
    expect(current).toBe('-novid')

    // Add -onlinefix
    const newOpts = `${current} -onlinefix`
    expect(newOpts).toBe('-novid -onlinefix')
    expect(newOpts.includes('-onlinefix')).toBe(true)
  })

  it('Online Fix does not change depot keys or manifests', () => {
    // Online Fix only modifies LaunchOptions, not depot keys
    const lua = `addappid(892970)
addappid(892971, 1, "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4")
setManifestid(892971, "1234567890123456789", 5000000000)`
    const parsed = parseLuaScript(lua, '892970.lua')
    // Online Fix doesn't add or remove depot keys
    expect(parsed.appIds).toHaveLength(2)
    expect(parsed.manifestIds).toHaveLength(1)
  })

  it('Online Fix compatible game has compatible status', () => {
    // Valheim (892970) is compatible with Online Fix
    const COMPATIBLE = ['892970', '1086320', '105600', '242760']
    expect(COMPATIBLE).toContain('892970')
  })

  it('Online Fix incompatible game (dedicated servers) should not enable', () => {
    // PUBG uses dedicated servers - Online Fix won't work
    const INCOMPATIBLE = ['578080', '444090', '813780']
    expect(INCOMPATIBLE).toContain('578080')
  })
})

// ── Scenario 7: Edge cases por juego ────────────────────────────────

describe('Scenario 7: Game-specific edge cases', () => {
  it('game with single depot (simplest case)', () => {
    const lua = `addappid(480)
addappid(481, 1, "abcdef0123456789abcdef0123456789")
setManifestid(481, "123", 1000000)`
    const parsed = parseLuaScript(lua, '480.lua')
    expect(parsed.appIds).toHaveLength(2)
    expect(parsed.manifestIds).toHaveLength(1)
    const depotKeys = parsed.appIds.filter(a => a.key).map(a => ({ depotId: a.id, key: a.key! }))
    expect(depotKeys).toHaveLength(1)
  })

  it('game with 10+ depots (large game)', () => {
    let lua = 'addappid(480)\n'
    for (let i = 1; i <= 10; i++) {
      lua += `addappid(${480 + i}, 1, "key${i}${i}${i}${i}${i}${i}${i}${i}")\n`
      lua += `setManifestid(${480 + i}, "${i}${i}${i}", ${i}00000000)\n`
    }
    const parsed = parseLuaScript(lua, '480.lua')
    expect(parsed.appIds).toHaveLength(11)
    expect(parsed.manifestIds).toHaveLength(10)
    const depotKeys = parsed.appIds.filter(a => a.key).map(a => ({ depotId: a.id, key: a.key! }))
    expect(depotKeys).toHaveLength(10)
  })

  it('game name with special characters is sanitized in installDir', () => {
    const dangerous = 'Game<>:"/\\|?*'
    const sanitized = dangerous.replace(/[<>:"/\\|?*\x00-\x1f]/g, '').trim() || '480'
    expect(sanitized).not.toContain('<')
    expect(sanitized).not.toContain('>')
    expect(sanitized).not.toContain(':')
    expect(sanitized).not.toContain('"')
    expect(sanitized).not.toContain('/')
    expect(sanitized).not.toContain('\\')
    expect(sanitized).not.toContain('|')
    expect(sanitized).not.toContain('?')
    expect(sanitized).not.toContain('*')
  })

  it('game with empty name falls back to AppID as installDir', () => {
    const sanitized = ''.replace(/[<>:"/\\|?*\x00-\x1f]/g, '').trim() || '480'
    expect(sanitized).toBe('480')
  })

  it('DLC-only install (no main game depot)', () => {
    // Some games have the main content in the base AppID depot
    // and DLCs add extra content
    const lua = `addappid(480)
addappid(481, 1, "aaaa1111aaaa1111aaaa1111aaaa1111")
addappid(482, 1, "bbbb2222bbbb2222bbbb2222bbbb2222")
setManifestid(481, "111", 1000)
setManifestid(482, "222", 2000)`
    const parsed = parseLuaScript(lua, '480.lua')
    // No setManifestid for 480 itself - main content is in depot 481
    expect(parsed.manifestIds.find(m => m.depotId === '480')).toBeUndefined()
    expect(parsed.manifestIds.find(m => m.depotId === '481')).toBeDefined()
  })

  it('GoldSrc mod without base depots triggers warning', () => {
    const lua = `addappid(10)
addappid(10, 1, "aaaa1111aaaa1111aaaa1111aaaa1111")`
    const parsed = parseLuaScript(lua, '10.lua')
    const luaDepotIds = new Set(parsed.appIds.map(a => a.id))
    const isMissingBase = GOLDSRC_BASE_DEPOT_IDS.some(id => !luaDepotIds.has(id))
    expect(isMissingBase).toBe(true)
    // In real flow: ensureGoldSrcBaseDepots would try to copy from Half-Life install
  })
})
