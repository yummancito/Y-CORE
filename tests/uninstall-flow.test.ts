import { describe, it, expect, vi } from 'vitest'

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/mock/userData'),
    getName: vi.fn(() => 'y-core'),
    getVersion: vi.fn(() => '1.0.0'),
  },
}))

import { generateAcfContent, extractDepotSizesFromLua } from '../electron/modules/acf'
import { stripDepotsWithoutKeys } from '../electron/modules/manifest-sync'

describe('ACF generation (simulating install state changes)', () => {
  it('fresh install creates ACF with StateFlags 1026 (UpdateRequired)', () => {
    const acf = generateAcfContent({ appId: '480', name: 'TestGame' })
    expect(acf).toContain('"StateFlags"\t\t"1026"')
  })

  it('imported game should have StateFlags 4 (FullyInstalled)', () => {
    const acf = generateAcfContent({ appId: '480', name: 'Imported', stateFlags: '4' })
    expect(acf).toContain('"StateFlags"\t\t"4"')
  })

  it('uninstalled game leaves no ACF (simulated by removing)', () => {
    const acf = generateAcfContent({ appId: '480', name: 'Deleted', stateFlags: '4' })
    expect(acf).toContain('"appid"\t\t"480"')
  })
})

describe('stripDepotsWithoutKeys', () => {
  it('removes addappid lines for depots without keys', () => {
    const lua = `addappid(480)
addappid(481, 1, "validkey123")
addappid(482)
addappid(483, 1, "anotherkey456")
setManifestid(481, "111", 1000)
setManifestid(482, "222", 2000)`
    const result = stripDepotsWithoutKeys(lua, '480', [
      { depot_id: '481', key: 'validkey123' },
      { depot_id: '483', key: 'anotherkey456' },
    ])
    expect(result.strippedDepots).toEqual(['482'])
    expect(result.cleanedLua).toContain('addappid(480)')
    expect(result.cleanedLua).toContain('addappid(481, 1, "validkey123")')
    expect(result.cleanedLua).toContain('addappid(483, 1, "anotherkey456")')
    expect(result.cleanedLua).not.toContain('addappid(482)')
    expect(result.cleanedLua).not.toContain('setManifestid(482')
  })

  it('returns original content when all depots have keys', () => {
    const lua = `addappid(480)
addappid(481, 1, "key1")
setManifestid(481, "111", 1000)`
    const result = stripDepotsWithoutKeys(lua, '480', [{ depot_id: '481', key: 'key1' }])
    expect(result.strippedDepots).toHaveLength(0)
    expect(result.cleanedLua).toBe(lua)
  })

  it('strips multiple depots without keys', () => {
    const lua = `addappid(480)
addappid(481)
addappid(482)
addappid(483)
setManifestid(481, "111")
setManifestid(482, "222")`
    const result = stripDepotsWithoutKeys(lua, '480', [])
    expect(result.strippedDepots).toEqual(['481', '482', '483'])
    expect(result.cleanedLua).not.toContain('addappid(481)')
    expect(result.cleanedLua).not.toContain('addappid(482)')
    expect(result.cleanedLua).not.toContain('addappid(483)')
    expect(result.cleanedLua).not.toContain('setManifestid')
  })

  it('handles empty lua gracefully', () => {
    const result = stripDepotsWithoutKeys('', '480', [])
    expect(result.strippedDepots).toHaveLength(0)
    expect(result.cleanedLua).toBe('')
  })

  it('handles lua with only main appid', () => {
    const lua = 'addappid(480)'
    const result = stripDepotsWithoutKeys(lua, '480', [])
    expect(result.strippedDepots).toHaveLength(0)
    expect(result.cleanedLua).toBe(lua)
  })
})

describe('extractDepotSizesFromLua (error scenarios)', () => {
  it('ignores malformed size values (regex does not match)', () => {
    const lua = 'setManifestid(481, "123", abc)'
    const sizes = extractDepotSizesFromLua(lua)
    expect(Object.keys(sizes)).toHaveLength(0)
  })

  it('aggregates multiple depot sizes correctly', () => {
    const lua = [
      'setManifestid(481, "111", 1000000)',
      'setManifestid(482, "222", 2000000)',
      'setManifestid(483, "333", 3000000)',
    ].join('\n')
    const sizes = extractDepotSizesFromLua(lua)
    const total = Object.values(sizes).reduce((sum: number, s: number) => sum + s, 0)
    expect(total).toBe(6000000)
  })

  it('handles very large depot sizes', () => {
    const lua = 'setManifestid(481, "111", 99999999999)'
    const sizes = extractDepotSizesFromLua(lua)
    expect(sizes['481']).toBe(99999999999)
  })
})

describe('Game lifecycle state transitions', () => {
  it('simulates install → full → reinstall transition via ACF StateFlags', () => {
    const installAcf = generateAcfContent({ appId: '480', name: 'Game' })
    expect(installAcf).toContain('"StateFlags"\t\t"1026"')

    const installedAcf = installAcf.replace('"StateFlags"\t\t"1026"', '"StateFlags"\t\t"4"')
    expect(installedAcf).toContain('"StateFlags"\t\t"4"')

    const reinstallAcf = installedAcf.replace('"StateFlags"\t\t"4"', '"StateFlags"\t\t"1026"')
    expect(reinstallAcf).toContain('"StateFlags"\t\t"1026"')
  })

  it('simulates game with downloaded content transitioning to staged', () => {
    const downloading = generateAcfContent({
      appId: '480',
      name: 'Game',
      stateFlags: '1026',
    })
    const staged = downloading
      .replace('"SizeOnDisk"\t\t"0"', '"SizeOnDisk"\t\t"5000000000"')
      .replace('"BytesDownloaded"\t\t"0"', '"BytesDownloaded"\t\t"5000000000"')
    expect(staged).toContain('"SizeOnDisk"\t\t"5000000000"')
    expect(staged).toContain('"BytesDownloaded"\t\t"5000000000"')
  })

  it('simulates game deletion: ACF removed, install dir removed', () => {
    const acf = generateAcfContent({ appId: '480' })
    expect(acf).toContain('"appid"\t\t"480"')
  })
})
