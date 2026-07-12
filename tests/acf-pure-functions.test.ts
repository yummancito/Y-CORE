import { describe, it, expect } from 'vitest'
import {
  generateAcfContent,
  shouldRepairAcf,
  extractDepotSizesFromLua,
  patchAcfForDownload,
} from '../electron/modules/acf'

describe('generateAcfContent', () => {
  it('creates valid ACF with minimal options', () => {
    const acf = generateAcfContent({ appId: '480', name: 'SpaceWar' })
    expect(acf).toContain('"appid"\t\t"480"')
    expect(acf).toContain('"name"\t\t"SpaceWar"')
    expect(acf).toContain('"StateFlags"\t\t"1026"')
  })

  it('accepts custom stateFlags', () => {
    const acf = generateAcfContent({ appId: '480', stateFlags: '4' })
    expect(acf).toContain('"StateFlags"\t\t"4"')
  })

  it('includes UserConfig with language', () => {
    const acf = generateAcfContent({ appId: '480' }, 'spanish')
    expect(acf).toContain('"Language"\t\t"spanish"')
  })

  it('includes MountedDepots block', () => {
    const acf = generateAcfContent({ appId: '480' })
    expect(acf).toContain('"MountedDepots"')
  })

  it('has valid structure with balanced braces', () => {
    const acf = generateAcfContent({ appId: '100' })
    const open = (acf.match(/{/g) || []).length
    const close = (acf.match(/}/g) || []).length
    expect(open).toBe(close)
  })
})

describe('shouldRepairAcf', () => {
  it('returns true when StateFlags is 4 with SizeOnDisk 0 and installed depots', () => {
    const acf = `"AppState"
{
\t"StateFlags"\t\t"4"
\t"SizeOnDisk"\t\t"0"
\t"InstalledDepots"
\t{
\t\t"481"
\t\t{
\t\t\t"manifest"\t\t"123"
\t\t}
\t}
}`
    expect(shouldRepairAcf(acf)).toBe(true)
  })

  it('returns true for StateFlags 36 with SizeOnDisk 0 and installed depots', () => {
    const acf = `"AppState"
{
\t"StateFlags"\t\t"36"
\t"SizeOnDisk"\t\t"0"
\t"InstalledDepots"
\t{
\t\t"481"
\t\t{
\t\t\t"manifest"\t\t"123"
\t\t}
\t}
}`
    expect(shouldRepairAcf(acf)).toBe(true)
  })

  it('returns false when StateFlags is not 4 or 36', () => {
    const acf = `"AppState"
{
\t"StateFlags"\t\t"1026"
\t"SizeOnDisk"\t\t"0"
\t"InstalledDepots"
\t{
\t\t"481"
\t\t{
\t\t\t"manifest"\t\t"123"
\t\t}
\t}
}`
    expect(shouldRepairAcf(acf)).toBe(false)
  })

  it('returns false when SizeOnDisk is not 0', () => {
    const acf = `"AppState"
{
\t"StateFlags"\t\t"4"
\t"SizeOnDisk"\t\t"5000000000"
\t"InstalledDepots"
\t{
\t\t"481"
\t\t{
\t\t\t"manifest"\t\t"123"
\t\t}
\t}
}`
    expect(shouldRepairAcf(acf)).toBe(false)
  })

  it('returns false when InstalledDepots is empty', () => {
    const acf = `"AppState"
{
\t"StateFlags"\t\t"4"
\t"SizeOnDisk"\t\t"0"
\t"InstalledDepots"
\t{
\t}
}`
    expect(shouldRepairAcf(acf)).toBe(false)
  })

  it('returns false for empty string', () => {
    expect(shouldRepairAcf('')).toBe(false)
  })
})

describe('extractDepotSizesFromLua', () => {
  it('extracts sizes from setManifestid lines', () => {
    const lua = `addappid(480)
addappid(481, 1, "key")
setManifestid(481, "123", 5000000000)
setManifestid(482, "456", 3000000000)`
    const sizes = extractDepotSizesFromLua(lua)
    expect(sizes['481']).toBe(5000000000)
    expect(sizes['482']).toBe(3000000000)
  })

  it('ignores depots without size', () => {
    const lua = `setManifestid(481, "123")`
    const sizes = extractDepotSizesFromLua(lua)
    expect(Object.keys(sizes)).toHaveLength(0)
  })

  it('returns empty object for Lua with no manifests', () => {
    const sizes = extractDepotSizesFromLua('addappid(480)')
    expect(Object.keys(sizes)).toHaveLength(0)
  })

  it('returns empty object for empty string', () => {
    const sizes = extractDepotSizesFromLua('')
    expect(Object.keys(sizes)).toHaveLength(0)
  })
})

describe('patchAcfForDownload', () => {
  const SAMPLE_ACF = `"AppState"
{
\t"appid"\t\t"480"
\t"StateFlags"\t\t"4"
\t"SizeOnDisk"\t\t"5000000000"
\t"buildid"\t\t"12345"
\t"DownloadType"\t\t"0"
\t"UpdateResult"\t\t"99"
\t"BytesToDownload"\t\t"0"
\t"BytesDownloaded"\t\t"5000000000"
\t"BytesToStage"\t\t"0"
\t"BytesStaged"\t\t"5000000000"
\t"InstalledDepots"
\t{
\t\t"481"
\t\t{
\t\t\t"manifest"\t\t"123"
\t\t\t"size"\t\t"0"
\t\t}
\t}
}`

  it('resets StateFlags to 1026', () => {
    const patched = patchAcfForDownload(SAMPLE_ACF)
    expect(patched).toContain('"StateFlags"\t\t"1026"')
  })

  it('resets DownloadType to 1', () => {
    const patched = patchAcfForDownload(SAMPLE_ACF)
    expect(patched).toContain('"DownloadType"\t\t"1"')
  })

  it('resets UpdateResult to 0', () => {
    const patched = patchAcfForDownload(SAMPLE_ACF)
    expect(patched).toContain('"UpdateResult"\t\t"0"')
  })

  it('resets BytesDownloaded to 0', () => {
    const patched = patchAcfForDownload(SAMPLE_ACF)
    expect(patched).toContain('"BytesDownloaded"\t\t"0"')
  })

  it('sets depot sizes and totals when depotSizes provided', () => {
    const sizes = { '481': 3000000000 }
    const patched = patchAcfForDownload(SAMPLE_ACF, sizes)
    expect(patched).toContain('"size"\t\t"3000000000"')
    expect(patched).toContain('"SizeOnDisk"\t\t"3000000000"')
    expect(patched).toContain('"BytesToDownload"\t\t"3000000000"')
    expect(patched).toContain('"BytesToStage"\t\t"3000000000"')
  })

  it('adds missing fields (TargetBuildID, etc.) when not present', () => {
    const minimal = `"AppState"
{
\t"appid"\t\t"480"
\t"StateFlags"\t\t"4"
\t"buildid"\t\t"67890"
\t"DownloadType"\t\t"0"
}`
    const patched = patchAcfForDownload(minimal)
    expect(patched).toContain('"TargetBuildID"\t\t"67890"')
    expect(patched).toContain('"BytesToDownload"\t\t"0"')
    expect(patched).toContain('"BytesDownloaded"\t\t"0"')
    expect(patched).toContain('"BytesToStage"\t\t"0"')
    expect(patched).toContain('"UpdateResult"\t\t"0"')
    expect(patched).toContain('"BytesStaged"\t\t"0"')
  })

  it('does not modify content when ACF is already in download state', () => {
    const alreadyDownload = `"AppState"
{
\t"appid"\t\t"480"
\t"StateFlags"\t\t"1026"
\t"DownloadType"\t\t"1"
\t"UpdateResult"\t\t"0"
\t"BytesToDownload"\t\t"1000"
\t"BytesDownloaded"\t\t"0"
\t"BytesToStage"\t\t"1000"
\t"BytesStaged"\t\t"0"
\t"TargetBuildID"\t\t"0"
}`
    const patched = patchAcfForDownload(alreadyDownload)
    expect(patched).toContain('"StateFlags"\t\t"1026"')
    expect(patched).toContain('"UpdateResult"\t\t"0"')
  })

  it('has balanced braces after patching', () => {
    const patched = patchAcfForDownload(SAMPLE_ACF, { '481': 1000 })
    const open = (patched.match(/{/g) || []).length
    const close = (patched.match(/}/g) || []).length
    expect(open).toBe(close)
  })
})
