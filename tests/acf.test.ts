import { describe, it, expect } from 'vitest'
import { generateAcfContent, shouldRepairAcf, extractDepotSizesFromLua, patchAcfForDownload } from '../electron/modules/acf'

describe('generateAcfContent', () => {
  it('generates valid ACF with required fields', () => {
    const content = generateAcfContent({ appId: '123456', name: 'Test Game', installDir: 'TestGame' })

    expect(content).toContain('"AppState"')
    expect(content).toContain('"appid"\t\t"123456"')
    expect(content).toContain('"name"\t\t"Test Game"')
    expect(content).toContain('"installdir"\t\t"TestGame"')
    expect(content).toContain('"StateFlags"\t\t"1026"')
    expect(content).toContain('"Universe"\t\t"1"')
    expect(content).toContain('"Language"\t\t"english"')
  })

  it('uses default values when optional fields are missing', () => {
    const content = generateAcfContent({ appId: '100' })

    expect(content).toContain('"appid"\t\t"100"')
    expect(content).toContain('"name"\t\t""')
    expect(content).toContain('"installdir"\t\t""')
    expect(content).toContain('"StateFlags"\t\t"1026"')
  })

  it('respects custom stateFlags and universe', () => {
    const content = generateAcfContent({
      appId: '100',
      name: 'Test',
      installDir: 'test',
      universe: '2',
      stateFlags: '4',
    })

    expect(content).toContain('"Universe"\t\t"2"')
    expect(content).toContain('"StateFlags"\t\t"4"')
  })

  it('includes a numeric LastUpdated timestamp', () => {
    const content = generateAcfContent({ appId: '100' })
    const match = content.match(/"LastUpdated"\s+"(\d+)"/)
    expect(match).toBeTruthy()
    expect(parseInt(match![1])).toBeGreaterThan(0)
  })
})

describe('shouldRepairAcf', () => {
  it('returns true when StateFlags=4, SizeOnDisk=0, and has InstalledDepots', () => {
    const acf = `"AppState"
{
\t"StateFlags"\t\t"4"
\t"SizeOnDisk"\t\t"0"
\t"InstalledDepots"
\t{
\t\t"100"\t\t{}
\t}
}`
    expect(shouldRepairAcf(acf)).toBe(true)
  })

  it('returns true when StateFlags=36, SizeOnDisk=0, and has InstalledDepots', () => {
    const acf = `"AppState"
{
\t"StateFlags"\t\t"36"
\t"SizeOnDisk"\t\t"0"
\t"InstalledDepots"
\t{
\t\t"100"\t\t{}
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
\t\t"100"\t\t{}
\t}
}`
    expect(shouldRepairAcf(acf)).toBe(false)
  })

  it('returns false when SizeOnDisk is not 0', () => {
    const acf = `"AppState"
{
\t"StateFlags"\t\t"4"
\t"SizeOnDisk"\t\t"5000"
\t"InstalledDepots"
\t{
\t\t"100"\t\t{}
\t}
}`
    expect(shouldRepairAcf(acf)).toBe(false)
  })

  it('returns false when no InstalledDepots', () => {
    const acf = `"AppState"
{
\t"StateFlags"\t\t"4"
\t"SizeOnDisk"\t\t"0"
}`
    expect(shouldRepairAcf(acf)).toBe(false)
  })
})

describe('extractDepotSizesFromLua', () => {
  it('extracts sizes from setManifestid with size parameter', () => {
    const lua = `
addappid(100)
setManifestid(100, "1111111111111111111", 5000)
setManifestid(200, "2222222222222222222", 10000)
`
    const sizes = extractDepotSizesFromLua(lua)

    expect(sizes['100']).toBe(5000)
    expect(sizes['200']).toBe(10000)
  })

  it('returns empty object when no sizes in Lua', () => {
    const lua = `
addappid(100)
setManifestid(100, "1111111111111111111")
`
    const sizes = extractDepotSizesFromLua(lua)

    expect(Object.keys(sizes)).toHaveLength(0)
  })

  it('ignores zero sizes', () => {
    const lua = `
addappid(100)
setManifestid(100, "1111111111111111111", 0)
`
    const sizes = extractDepotSizesFromLua(lua)

    expect(Object.keys(sizes)).toHaveLength(0)
  })
})

describe('patchAcfForDownload', () => {
  it('sets StateFlags to 1026', () => {
    const acf = `"AppState"
{
\t"StateFlags"\t\t"4"
\t"DownloadType"\t\t"0"
\t"UpdateResult"\t\t"1"
\t"BytesDownloaded"\t\t"100"
\t"BytesStaged"\t\t"50"
}`
    const patched = patchAcfForDownload(acf)

    expect(patched).toContain('"StateFlags"\t\t"1026"')
    expect(patched).toContain('"DownloadType"\t\t"1"')
    expect(patched).toContain('"UpdateResult"\t\t"0"')
    expect(patched).toContain('"BytesDownloaded"\t\t"0"')
    expect(patched).toContain('"BytesStaged"\t\t"0"')
  })

  it('adds missing fields', () => {
    const acf = `"AppState"
{
\t"StateFlags"\t\t"4"
\t"DownloadType"\t\t"0"
}`
    const patched = patchAcfForDownload(acf)

    expect(patched).toContain('"UpdateResult"')
    expect(patched).toContain('"BytesDownloaded"')
    expect(patched).toContain('"BytesStaged"')
    expect(patched).toContain('"BytesToDownload"')
    expect(patched).toContain('"BytesToStage"')
  })
})
