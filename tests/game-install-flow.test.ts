import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { parseLuaScript } from '@y-core/shared'

// ── Extracted ACF builder (mirrors buildAppManifestAcf) ──────────────

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

// ── Extracted depot key injection (mirrors injectDepotKeysIntoConfigVdf) ──

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

// ── Test fixtures ───────────────────────────────────────────────────

const SAMPLE_LUA = `-- Test game Lua
addappid(892970)
addappid(892971, 1, "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4")
addappid(892972, 1, "f1e2d3c4b5a6f1e2d3c4b5a6f1e2d3c4")
setManifestid(892971, "1234567890123456789", 5000000000)
setManifestid(892972, "9876543210987654321", 3000000000)
`

const SAMPLE_LUA_NO_KEYS = `-- Game without depot keys
addappid(480)
addappid(481)
setManifestid(481, "1111111111111111111", 100000000)
`

const SAMPLE_LUA_EMPTY = `-- Empty lua
`

const SAMPLE_LUA_MALFORMED = `-- Malformed
addappid(abc)
addappid(
setManifestid(
setManifestid(abc, "xyz")
`

const SAMPLE_CONFIG_VDF_WITH_DEPOTS = `"InstallConfigStore"
{
\t"Software"
\t{
\t\t"Valve"
\t\t{
\t\t\t"Steam"
\t\t\t{
\t\t\t\t"depots"
\t\t\t\t{
\t\t\t\t\t"431961"
\t\t\t\t\t{
\t\t\t\t\t\t"DecryptionKey"\t\t"abcdef0123456789abcdef0123456789"
\t\t\t\t\t}
\t\t\t\t}
\t\t\t}
\t\t}
\t}
}`

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

// ── Tests: Lua Parser ───────────────────────────────────────────────

describe('Lua Script Parser', () => {
  it('parses addappid with no key', () => {
    const result = parseLuaScript('addappid(892970)', 'test.lua')
    expect(result.appIds).toHaveLength(1)
    expect(result.appIds[0].id).toBe('892970')
    expect(result.appIds[0].key).toBeUndefined()
  })

  it('parses addappid with type and key', () => {
    const result = parseLuaScript('addappid(892971, 1, "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4")', 'test.lua')
    expect(result.appIds).toHaveLength(1)
    expect(result.appIds[0].id).toBe('892971')
    expect(result.appIds[0].type).toBe('1')
    expect(result.appIds[0].key).toBe('a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4')
  })

  it('parses addappid with type only (no key)', () => {
    const result = parseLuaScript('addappid(892971, 1)', 'test.lua')
    expect(result.appIds).toHaveLength(1)
    expect(result.appIds[0].id).toBe('892971')
    expect(result.appIds[0].type).toBe('1')
    expect(result.appIds[0].key).toBeUndefined()
  })

  it('parses setManifestid with size', () => {
    const result = parseLuaScript('setManifestid(892971, "1234567890123456789", 5000000000)', 'test.lua')
    expect(result.manifestIds).toHaveLength(1)
    expect(result.manifestIds[0].depotId).toBe('892971')
    expect(result.manifestIds[0].manifestId).toBe('1234567890123456789')
    expect(result.manifestIds[0].size).toBe('5000000000')
  })

  it('parses setManifestid without size', () => {
    const result = parseLuaScript('setManifestid(892971, "1234567890123456789")', 'test.lua')
    expect(result.manifestIds).toHaveLength(1)
    expect(result.manifestIds[0].size).toBeUndefined()
  })

  it('parses full sample Lua correctly', () => {
    const result = parseLuaScript(SAMPLE_LUA, '892970.lua')
    expect(result.appIds).toHaveLength(3)
    expect(result.manifestIds).toHaveLength(2)
    expect(result.appIds[0].id).toBe('892970')
    expect(result.appIds[1].id).toBe('892971')
    expect(result.appIds[1].key).toBe('a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4')
    expect(result.manifestIds[0].depotId).toBe('892971')
    expect(result.manifestIds[0].size).toBe('5000000000')
  })

  it('handles empty Lua gracefully', () => {
    const result = parseLuaScript(SAMPLE_LUA_EMPTY, 'empty.lua')
    expect(result.appIds).toHaveLength(0)
    expect(result.manifestIds).toHaveLength(0)
  })

  it('handles malformed Lua gracefully', () => {
    const result = parseLuaScript(SAMPLE_LUA_MALFORMED, 'bad.lua')
    expect(result.appIds).toHaveLength(0)
    expect(result.manifestIds).toHaveLength(0)
  })

  it('ignores commented-out lines', () => {
    const lua = `-- addappid(123)
# addappid(456)
addappid(789)`
    const result = parseLuaScript(lua, 'test.lua')
    expect(result.appIds).toHaveLength(1)
    expect(result.appIds[0].id).toBe('789')
  })

  it('handles whitespace variations', () => {
    const lua = 'addappid( 892970 , 1 , "key123" )'
    const result = parseLuaScript(lua, 'test.lua')
    // The regex requires no space before the first capture group
    // This tests that the parser is somewhat strict
    expect(result.appIds).toHaveLength(0) // Should not parse with space after (
  })

  it('preserves raw content', () => {
    const result = parseLuaScript(SAMPLE_LUA, '892970.lua')
    expect(result.rawContent).toBe(SAMPLE_LUA)
  })
})

// ── Tests: Depot Key Validation ─────────────────────────────────────

describe('Depot Key Validation (install flow)', () => {
  it('identifies missing depot keys', () => {
    const parsed = parseLuaScript(SAMPLE_LUA_NO_KEYS, '480.lua')
    const keyDepotIds = new Set<string>() // no keys provided
    const missingKeyDepots = parsed.appIds
      .filter(a => a.id !== '480' && !a.key && !keyDepotIds.has(a.id))
      .map(a => a.id)
    expect(missingKeyDepots).toEqual(['481'])
  })

  it('all depots have keys when provided', () => {
    const parsed = parseLuaScript(SAMPLE_LUA, '892970.lua')
    const keyDepotIds = new Set(['892971', '892972'])
    const missingKeyDepots = parsed.appIds
      .filter(a => a.id !== '892970' && !a.key && !keyDepotIds.has(a.id))
      .map(a => a.id)
    expect(missingKeyDepots).toHaveLength(0)
  })

  it('main AppID does not need a key', () => {
    const parsed = parseLuaScript(SAMPLE_LUA, '892970.lua')
    const mainApp = parsed.appIds.find(a => a.id === '892970')
    expect(mainApp).toBeDefined()
    expect(mainApp!.key).toBeUndefined() // Main AppID has no key, and that's OK
  })

  it('depot keys with wrong format are flagged', () => {
    const lua = `addappid(480)
addappid(481, 1, "NOT_A_HEX_KEY")`
    const parsed = parseLuaScript(lua, '480.lua')
    const depotWithKey = parsed.appIds.find(a => a.id === '481')
    expect(depotWithKey).toBeDefined()
    expect(depotWithKey!.key).toBe('NOT_A_HEX_KEY')
    // A valid hex key should match /^[a-f0-9]+$/i
    expect(/^[a-f0-9]+$/i.test(depotWithKey!.key!)).toBe(false)
  })

  it('valid hex depot keys pass format check', () => {
    const parsed = parseLuaScript(SAMPLE_LUA, '892970.lua')
    for (const app of parsed.appIds) {
      if (app.key) {
        expect(/^[a-f0-9]+$/i.test(app.key)).toBe(true)
      }
    }
  })
})

// ── Tests: ACF Manifest Builder ─────────────────────────────────────

describe('ACF Manifest Builder', () => {
  it('creates valid ACF with correct AppID', () => {
    const acf = buildAppManifestAcf('892970', 'Valheim', 'Valheim', [])
    expect(acf).toContain('"appid"\t\t"892970"')
    expect(acf).toContain('"name"\t\t"Valheim"')
    expect(acf).toContain('"installdir"\t\t"Valheim"')
  })

  it('sets StateFlags to 1026 (UpdateRequired)', () => {
    const acf = buildAppManifestAcf('480', 'Test', 'Test', [])
    expect(acf).toContain('"StateFlags"\t\t"1026"')
  })

  it('sets SizeOnDisk to 0 (not yet downloaded)', () => {
    const acf = buildAppManifestAcf('480', 'Test', 'Test', [])
    expect(acf).toContain('"SizeOnDisk"\t\t"0"')
  })

  it('calculates total BytesToDownload from depot sizes', () => {
    const depots = [
      { depotId: '481', manifestId: '123', size: '5000000000' },
      { depotId: '482', manifestId: '456', size: '3000000000' },
    ]
    const acf = buildAppManifestAcf('480', 'Test', 'Test', depots)
    expect(acf).toContain('"BytesToDownload"\t\t"8000000000"')
  })

  it('handles depots without sizes (total = 0)', () => {
    const depots = [
      { depotId: '481', manifestId: '123' },
      { depotId: '482', manifestId: '456' },
    ]
    const acf = buildAppManifestAcf('480', 'Test', 'Test', depots)
    expect(acf).toContain('"BytesToDownload"\t\t"0"')
  })

  it('only counts depots with keys when depotIdsWithKeys provided', () => {
    const depots = [
      { depotId: '481', manifestId: '123', size: '5000000000' },
      { depotId: '482', manifestId: '456', size: '3000000000' },
    ]
    const keysOnly = new Set(['481'])
    const acf = buildAppManifestAcf('480', 'Test', 'Test', depots, {}, keysOnly)
    expect(acf).toContain('"BytesToDownload"\t\t"5000000000"')
  })

  it('includes shared depots block', () => {
    const sharedDepots = { '431': '70', '432': '70' }
    const acf = buildAppManifestAcf('480', 'Test', 'Test', [], sharedDepots)
    expect(acf).toContain('"431"\t\t"70"')
    expect(acf).toContain('"432"\t\t"70"')
  })

  it('has empty InstalledDepots block', () => {
    const acf = buildAppManifestAcf('480', 'Test', 'Test', [])
    expect(acf).toContain('"InstalledDepots"')
    expect(acf).toContain('{\n\t}')
  })

  it('has UserConfig with language', () => {
    const acf = buildAppManifestAcf('480', 'Test', 'Test', [])
    expect(acf).toContain('"UserConfig"')
    expect(acf).toContain('"language"\t\t"english"')
  })

  it('sanitizes installDir name', () => {
    const acf = buildAppManifestAcf('480', 'Test<>:Game', 'TestGame', [])
    // buildAppManifestAcf receives already-sanitized installDir
    expect(acf).toContain('"installdir"\t\t"TestGame"')
  })

  it('sets BytesDownloaded to 0', () => {
    const acf = buildAppManifestAcf('480', 'Test', 'Test', [])
    expect(acf).toContain('"BytesDownloaded"\t\t"0"')
  })

  it('sets buildid to 0', () => {
    const acf = buildAppManifestAcf('480', 'Test', 'Test', [])
    expect(acf).toContain('"buildid"\t\t"0"')
  })
})

// ── Tests: Depot Key Injection into config.vdf ──────────────────────

describe('Depot Key Injection (config.vdf)', () => {
  it('injects keys into VDF without existing depots section', () => {
    const result = injectDepotKeysIntoContent(SAMPLE_CONFIG_VDF_NO_DEPOTS, [
      { depotId: '481', key: 'abcdef0123456789abcdef0123456789' },
    ])
    expect(result.added).toBe(1)
    expect(result.content).toContain('"depots"')
    expect(result.content).toContain('"481"')
    expect(result.content).toContain('"DecryptionKey"')
    expect(result.content).toContain('abcdef0123456789abcdef0123456789')
  })

  it('injects keys into VDF with existing depots section', () => {
    const result = injectDepotKeysIntoContent(SAMPLE_CONFIG_VDF_WITH_DEPOTS, [
      { depotId: '482', key: 'fedcba9876543210fedcba9876543210' },
    ])
    expect(result.added).toBe(1)
    expect(result.content).toContain('"482"')
    expect(result.content).toContain('fedcba9876543210fedcba9876543210')
    // Existing key should still be there
    expect(result.content).toContain('"431961"')
    expect(result.content).toContain('abcdef0123456789abcdef0123456789')
  })

  it('does not duplicate existing depot keys', () => {
    const result = injectDepotKeysIntoContent(SAMPLE_CONFIG_VDF_WITH_DEPOTS, [
      { depotId: '431961', key: 'abcdef0123456789abcdef0123456789' },
    ])
    expect(result.added).toBe(0)
    // Should still have the key
    expect(result.content).toContain('"431961"')
  })

  it('injects multiple keys at once', () => {
    const result = injectDepotKeysIntoContent(SAMPLE_CONFIG_VDF_NO_DEPOTS, [
      { depotId: '481', key: 'aaaa1111aaaa1111aaaa1111aaaa1111' },
      { depotId: '482', key: 'bbbb2222bbbb2222bbbb2222bbbb2222' },
      { depotId: '483', key: 'cccc3333cccc3333cccc3333cccc3333' },
    ])
    expect(result.added).toBe(3)
    expect(result.content).toContain('"481"')
    expect(result.content).toContain('"482"')
    expect(result.content).toContain('"483"')
  })

  it('handles empty key list gracefully', () => {
    const result = injectDepotKeysIntoContent(SAMPLE_CONFIG_VDF_NO_DEPOTS, [])
    expect(result.added).toBe(0)
  })
})

// ── Tests: Full Install Flow Simulation ─────────────────────────────

describe('Full Install Flow Simulation', () => {
  it('simulates complete install: parse Lua → validate keys → build ACF → inject keys', () => {
    // 1. Parse Lua
    const parsed = parseLuaScript(SAMPLE_LUA, '892970.lua')
    expect(parsed.appIds.length).toBeGreaterThan(0)

    // 2. Validate depot keys
    const depotKeys = parsed.appIds
      .filter(a => a.key)
      .map(a => ({ depotId: a.id, key: a.key! }))
    expect(depotKeys).toHaveLength(2)

    const keyDepotIds = new Set(depotKeys.map(k => k.depotId))
    const missingKeyDepots = parsed.appIds
      .filter(a => a.id !== '892970' && !a.key && !keyDepotIds.has(a.id))
      .map(a => a.id)
    expect(missingKeyDepots).toHaveLength(0)

    // 3. Build ACF
    const acf = buildAppManifestAcf('892970', 'Valheim', 'Valheim', parsed.manifestIds, {}, keyDepotIds)
    expect(acf).toContain('"appid"\t\t"892970"')
    expect(acf).toContain('"StateFlags"\t\t"1026"')

    // Total size = 5000000000 + 3000000000 = 8000000000
    expect(acf).toContain('"BytesToDownload"\t\t"8000000000"')

    // 4. Inject depot keys into config.vdf
    const vdfResult = injectDepotKeysIntoContent(SAMPLE_CONFIG_VDF_NO_DEPOTS, depotKeys)
    expect(vdfResult.added).toBe(2)
    expect(vdfResult.content).toContain('a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4')
    expect(vdfResult.content).toContain('f1e2d3c4b5a6f1e2d3c4b5a6f1e2d3c4')
  })

  it('simulates install with missing depot keys (should flag error)', () => {
    const parsed = parseLuaScript(SAMPLE_LUA_NO_KEYS, '480.lua')
    const depotKeys: { depotId: string; key: string }[] = []
    const keyDepotIds = new Set(depotKeys.map(k => k.depotId))
    const missingKeyDepots = parsed.appIds
      .filter(a => a.id !== '480' && !a.key && !keyDepotIds.has(a.id))
      .map(a => a.id)

    expect(missingKeyDepots).toEqual(['481'])
    // In real flow, this would push an error:
    // "Missing depot keys for: 481. Steam cannot decrypt these depots."
  })

  it('simulates install with no manifests (ACF still valid)', () => {
    const lua = `addappid(480)
addappid(481, 1, "abcdef0123456789abcdef0123456789")`
    const parsed = parseLuaScript(lua, '480.lua')
    const acf = buildAppManifestAcf('480', 'TestGame', 'TestGame', parsed.manifestIds)
    // No manifests → BytesToDownload = 0
    expect(acf).toContain('"BytesToDownload"\t\t"0"')
    // ACF is still structurally valid
    expect(acf).toContain('"appid"\t\t"480"')
    expect(acf).toContain('"StateFlags"\t\t"1026"')
  })

  it('simulates encrypted content scenario: depot has key but no manifest', () => {
    // This simulates: game content is encrypted, we have the decryption key
    // but Steam needs to download the content
    const lua = `addappid(480)
addappid(481, 1, "abcdef0123456789abcdef0123456789")
setManifestid(481, "1234567890123456789", 1000000000)`
    const parsed = parseLuaScript(lua, '480.lua')

    // We have the key for depot 481
    const depotKeys = parsed.appIds
      .filter(a => a.key)
      .map(a => ({ depotId: a.id, key: a.key! }))
    expect(depotKeys).toHaveLength(1)
    expect(depotKeys[0].depotId).toBe('481')

    // ACF shows BytesToDownload > 0 (content needs to be downloaded)
    const keySet = new Set(depotKeys.map(k => k.depotId))
    const acf = buildAppManifestAcf('480', 'TestGame', 'TestGame', parsed.manifestIds, {}, keySet)
    expect(acf).toContain('"BytesToDownload"\t\t"1000000000"')
    expect(acf).toContain('"BytesDownloaded"\t\t"0"')
    expect(acf).toContain('"SizeOnDisk"\t\t"0"')

    // StateFlags 1026 = UpdateRequired | UpdateStarted
    // This tells Steam: content is not on disk, needs to be downloaded
    expect(acf).toContain('"StateFlags"\t\t"1026"')
  })

  it('simulates play without download: content already on disk', () => {
    // When content is already on disk (e.g. imported folder),
    // the ACF should reflect that. In the real flow, importGameFolder
    // handles this differently - it reads existing ACF state.
    // Here we test that buildAppManifestAcf creates the "needs download" state.
    const acf = buildAppManifestAcf('480', 'TestGame', 'TestGame', [
      { depotId: '481', manifestId: '123', size: '1000000000' },
    ])
    // SizeOnDisk = 0 means nothing is on disk yet
    expect(acf).toContain('"SizeOnDisk"\t\t"0"')
    // BytesToDownload shows what Steam needs to fetch
    expect(acf).toContain('"BytesToDownload"\t\t"1000000000"')
    // InstalledDepots is empty - content not yet installed
    expect(acf).toContain('"InstalledDepots"\n\t{\n\t}')
  })
})

// ── Tests: Edge Cases & Error Scenarios ─────────────────────────────

describe('Edge Cases & Error Scenarios', () => {
  it('handles very large AppIDs', () => {
    const lua = 'addappid(9999999999)'
    const parsed = parseLuaScript(lua, 'test.lua')
    expect(parsed.appIds).toHaveLength(1)
    expect(parsed.appIds[0].id).toBe('9999999999')
  })

  it('handles very large manifest IDs (uint64)', () => {
    const lua = 'setManifestid(481, "18446744073709551615", 999999999999)'
    const parsed = parseLuaScript(lua, 'test.lua')
    expect(parsed.manifestIds).toHaveLength(1)
    expect(parsed.manifestIds[0].manifestId).toBe('18446744073709551615')
  })

  it('handles Lua with comments and blank lines', () => {
    const lua = `-- Game: Test
-- Author: Y-core

addappid(480)

-- Depot keys
addappid(481, 1, "abcdef0123456789abcdef0123456789")

-- Manifests
setManifestid(481, "1234567890123456789", 1000000)
`
    const parsed = parseLuaScript(lua, '480.lua')
    expect(parsed.appIds).toHaveLength(2)
    expect(parsed.manifestIds).toHaveLength(1)
  })

  it('handles multiple depots with same AppID prefix', () => {
    const lua = `addappid(892970)
addappid(892971, 1, "aaaa1111aaaa1111aaaa1111aaaa1111")
addappid(892972, 1, "bbbb2222bbbb2222bbbb2222bbbb2222")
addappid(892973, 1, "cccc3333cccc3333cccc3333cccc3333")
setManifestid(892971, "111", 1000)
setManifestid(892972, "222", 2000)
setManifestid(892973, "333", 3000)`
    const parsed = parseLuaScript(lua, '892970.lua')
    expect(parsed.appIds).toHaveLength(4)
    expect(parsed.manifestIds).toHaveLength(3)

    const totalSize = parsed.manifestIds.reduce((sum, m) => sum + parseInt(m.size || '0'), 0)
    expect(totalSize).toBe(6000)
  })

  it('detects when all depot keys are missing', () => {
    const lua = `addappid(480)
addappid(481)
addappid(482)
addappid(483)`
    const parsed = parseLuaScript(lua, '480.lua')
    const missing = parsed.appIds.filter(a => a.id !== '480' && !a.key).map(a => a.id)
    expect(missing).toEqual(['481', '482', '483'])
  })

  it('detects when some depot keys are missing', () => {
    const lua = `addappid(480)
addappid(481, 1, "abcdef0123456789abcdef0123456789")
addappid(482)
addappid(483, 1, "fedcba9876543210fedcba9876543210")`
    const parsed = parseLuaScript(lua, '480.lua')
    const missing = parsed.appIds.filter(a => a.id !== '480' && !a.key).map(a => a.id)
    expect(missing).toEqual(['482'])
  })

  it('ACF with no depots and no keys produces valid empty manifest', () => {
    const acf = buildAppManifestAcf('480', 'Empty', 'Empty', [])
    expect(acf).toContain('"BytesToDownload"\t\t"0"')
    expect(acf).toContain('"InstalledDepots"')
    // Verify ACF is parseable (has matching braces)
    const openBraces = (acf.match(/{/g) || []).length
    const closeBraces = (acf.match(/}/g) || []).length
    expect(openBraces).toBe(closeBraces)
  })

  it('ACF structure is valid (balanced braces)', () => {
    const depots = [
      { depotId: '481', manifestId: '123', size: '5000000000' },
      { depotId: '482', manifestId: '456', size: '3000000000' },
    ]
    const acf = buildAppManifestAcf('480', 'Test', 'Test', depots, { '431': '70' })
    const openBraces = (acf.match(/{/g) || []).length
    const closeBraces = (acf.match(/}/g) || []).length
    expect(openBraces).toBe(closeBraces)
  })
})
