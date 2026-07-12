import { describe, it, expect, vi } from 'vitest'

vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(() => false),
    readFileSync: vi.fn(() => null),
    readdirSync: vi.fn(() => []),
  },
  existsSync: vi.fn(() => false),
  readFileSync: vi.fn(() => null),
  readdirSync: vi.fn(() => []),
}))

import {
  GOLDSRC_MOD_APP_IDS,
  GOLDSRC_BASE_DEPOT_IDS,
  ensureGoldSrcBaseDepots,
} from '../electron/modules/goldsrc'

describe('GOLDSRC_MOD_APP_IDS', () => {
  it('contains known GoldSrc mods', () => {
    expect(GOLDSRC_MOD_APP_IDS.has('10')).toBe(true) // Counter-Strike
    expect(GOLDSRC_MOD_APP_IDS.has('130')).toBe(true) // Blue Shift
    expect(GOLDSRC_MOD_APP_IDS.has('70')).toBe(false) // Half-Life (base game, not a mod)
  })
})

describe('GOLDSRC_BASE_DEPOT_IDS', () => {
  it('contains Half-Life base depot IDs', () => {
    expect(GOLDSRC_BASE_DEPOT_IDS).toContain('1')
    expect(GOLDSRC_BASE_DEPOT_IDS).toContain('2')
    expect(GOLDSRC_BASE_DEPOT_IDS).toContain('3')
  })
})

describe('ensureGoldSrcBaseDepots', () => {
  it('returns unchanged when appId is not a GoldSrc mod', () => {
    const result = ensureGoldSrcBaseDepots('892970', 'addappid(892970)', [])
    expect(result.updatedLua).toBe('addappid(892970)')
    expect(result.addedDepotKeys).toHaveLength(0)
    expect(result.addedManifests).toHaveLength(0)
  })

  it('returns unchanged when lua already has all base depots', () => {
    const lua = `
addappid(10)
addappid(1)
addappid(2)
addappid(3)
addappid(8)
addappid(9)
addappid(96)
addappid(228988)
`
    const result = ensureGoldSrcBaseDepots('10', lua, [])
    expect(result.updatedLua).toBe(lua)
    expect(result.addedDepotKeys).toHaveLength(0)
    expect(result.addedManifests).toHaveLength(0)
  })

  it('returns warning when no base lua files exist (readGoldSrcBaseDepots returns null)', () => {
    const result = ensureGoldSrcBaseDepots('10', 'addappid(10)', [])
    expect(result.warning).toBeDefined()
    expect(result.warning).toContain('Missing Half-Life base depots')
  })

  it('does not add keys for already-existing depot keys', () => {
    const lua = 'addappid(10)'
    const result = ensureGoldSrcBaseDepots('10', lua, [{ depot_id: '1', key: 'key1' }])
    expect(result.warning).toBeDefined()
  })

  it('returns empty arrays for non-mod with base depots in lua', () => {
    const lua = `
addappid(892970)
addappid(1)
addappid(2)
`
    const result = ensureGoldSrcBaseDepots('892970', lua, [])
    expect(result.updatedLua).toBe(lua)
    expect(result.addedDepotKeys).toHaveLength(0)
  })
})
