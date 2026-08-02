import { describe, it, expect } from 'vitest'
import { injectDepotKeysIntoVdfContent } from '../electron/modules/depot-keys'

// Realistic config.vdf WITHOUT a "depots" section (fresh Steam install)
const VDF_NO_DEPOTS = `"InstallConfigStore"
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

// Realistic config.vdf WITH an existing "depots" section
const VDF_WITH_DEPOTS = `"InstallConfigStore"
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

const KEY1 = { depotId: '481', key: 'abcdef0123456789abcdef0123456789' }
const KEY2 = { depotId: '482', key: 'fedcba9876543210fedcba9876543210' }

describe('injectDepotKeysIntoVdfContent', () => {
  it('creates the depots section when config.vdf has none (fresh install)', () => {
    const result = injectDepotKeysIntoVdfContent(VDF_NO_DEPOTS, [KEY1])

    expect(result.error).toBeUndefined()
    expect(result.added).toBe(1)
    expect(result.content).toContain('"depots"')
    expect(result.content).toContain('"481"')
    expect(result.content).toContain('"DecryptionKey"')
    expect(result.content).toContain('abcdef0123456789abcdef0123456789')
    // Section must live inside the Steam block
    const steamIdx = result.content.indexOf('"Steam"')
    const depotsIdx = result.content.indexOf('"depots"')
    expect(depotsIdx).toBeGreaterThan(steamIdx)
  })

  it('injects multiple keys into a newly created depots section', () => {
    const result = injectDepotKeysIntoVdfContent(VDF_NO_DEPOTS, [KEY1, KEY2])

    expect(result.error).toBeUndefined()
    expect(result.added).toBe(2)
    expect(result.content).toContain('"481"')
    expect(result.content).toContain('"482"')
  })

  it('adds to an existing depots section without losing existing entries', () => {
    const result = injectDepotKeysIntoVdfContent(VDF_WITH_DEPOTS, [KEY2])

    expect(result.error).toBeUndefined()
    expect(result.added).toBe(1)
    expect(result.content).toContain('"482"')
    // Existing key untouched
    expect(result.content).toContain('"431961"')
    expect(result.content).toContain('abcdef0123456789abcdef0123456789')
  })

  it('replaces an existing depot key', () => {
    const result = injectDepotKeysIntoVdfContent(VDF_WITH_DEPOTS, [
      { depotId: '431961', key: '11111111111111111111111111111111' },
    ])

    expect(result.error).toBeUndefined()
    expect(result.added).toBe(1)
    expect(result.content).toContain('11111111111111111111111111111111')
    expect(result.content).not.toContain('"DecryptionKey"\t\t"abcdef0123456789abcdef0123456789"')
  })

  it('does not duplicate an existing depot key', () => {
    const result = injectDepotKeysIntoVdfContent(VDF_WITH_DEPOTS, [
      { depotId: '431961', key: 'abcdef0123456789abcdef0123456789' },
    ])

    expect(result.error).toBeUndefined()
    expect(result.added).toBe(0)
  })

  it('handles empty key list gracefully', () => {
    const result = injectDepotKeysIntoVdfContent(VDF_NO_DEPOTS, [])

    expect(result.added).toBe(0)
    expect(result.content).toBe(VDF_NO_DEPOTS)
  })

  it('returns an error when no Steam section exists', () => {
    const result = injectDepotKeysIntoVdfContent('{"foo":"bar"}', [KEY1])

    expect(result.error).toBeTruthy()
    expect(result.added).toBe(0)
  })
})
