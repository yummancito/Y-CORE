import { describe, it, expect } from 'vitest'
import { parseLuaScript, findMainLua, type ExtractedFile } from '@y-core/shared'

describe('parseLuaScript', () => {
  it('parses a simple addappid without key', () => {
    const content = `addappid(123456)`
    const result = parseLuaScript(content, '123456.lua')

    expect(result.appIds).toHaveLength(1)
    expect(result.appIds[0].id).toBe('123456')
    expect(result.appIds[0].key).toBeUndefined()
    // mainAppId requires a comma: addappid(id, ...)
    expect(result.mainAppId).toBeNull()
  })

  it('parses addappid with type and key', () => {
    const content = `addappid(123456, 1, "abc123def456")`
    const result = parseLuaScript(content, '123456.lua')

    expect(result.appIds).toHaveLength(1)
    expect(result.appIds[0].id).toBe('123456')
    expect(result.appIds[0].type).toBe('1')
    expect(result.appIds[0].key).toBe('abc123def456')
  })

  it('parses multiple addappid lines', () => {
    const content = `
addappid(100)
addappid(200, 1, "key200")
addappid(300, 1, "key300")
`
    const result = parseLuaScript(content, '100.lua')

    expect(result.appIds).toHaveLength(3)
    expect(result.appIds[0].id).toBe('100')
    expect(result.appIds[1].id).toBe('200')
    expect(result.appIds[1].key).toBe('key200')
    expect(result.appIds[2].id).toBe('300')
    expect(result.appIds[2].key).toBe('key300')
  })

  it('parses setManifestid lines', () => {
    const content = `
addappid(100)
setManifestid(100, "1111111111111111111")
setManifestid(200, "2222222222222222222")
`
    const result = parseLuaScript(content, '100.lua')

    expect(result.manifestIds).toHaveLength(2)
    expect(result.manifestIds[0].depotId).toBe('100')
    expect(result.manifestIds[0].manifestId).toBe('1111111111111111111')
    expect(result.manifestIds[1].depotId).toBe('200')
    expect(result.manifestIds[1].manifestId).toBe('2222222222222222222')
  })

  it('parses setManifestid with size', () => {
    const content = `
addappid(100)
setManifestid(100, "1111111111111111111", 5000)
`
    const result = parseLuaScript(content, '100.lua')

    expect(result.manifestIds).toHaveLength(1)
    expect(result.manifestIds[0].size).toBe('5000')
  })

  it('handles comments and empty lines', () => {
    const content = `-- This is a comment
addappid(100)

-- Another comment
setManifestid(100, "1111111111111111111")
`
    const result = parseLuaScript(content, '100.lua')

    expect(result.appIds).toHaveLength(1)
    expect(result.manifestIds).toHaveLength(1)
  })

  it('returns empty arrays for empty content', () => {
    const result = parseLuaScript('', 'empty.lua')

    expect(result.appIds).toHaveLength(0)
    expect(result.manifestIds).toHaveLength(0)
    expect(result.mainAppId).toBeNull()
  })

  it('preserves rawContent and fileName', () => {
    const content = 'addappid(100)'
    const result = parseLuaScript(content, '100.lua')

    expect(result.rawContent).toBe(content)
    expect(result.fileName).toBe('100.lua')
  })

  it('extracts mainAppId from first addappid with comma', () => {
    const content = `
addappid(100, 1, "key100")
addappid(200, 1, "key200")
`
    const result = parseLuaScript(content, '100.lua')

    expect(result.mainAppId).toBe('100')
  })

  it('does not match addappid with internal spaces (regex is strict)', () => {
    const content = `addappid( 100 , 1 , "key100" )`
    const result = parseLuaScript(content, '100.lua')

    // The parser regex requires no space after opening paren
    expect(result.appIds).toHaveLength(0)
  })
})

describe('findMainLua', () => {
  it('finds the Lua file containing the target appId', () => {
    const files: ExtractedFile[] = [
      { path: 'folder/200.lua', content: Buffer.from('addappid(200)') },
      { path: 'folder/100.lua', content: Buffer.from('addappid(100)') },
    ]

    const result = findMainLua(files, '100')

    expect(result.appId).toBe('100')
    expect(result.content).toContain('addappid(100)')
  })

  it('falls back to first file if appId not found', () => {
    const files: ExtractedFile[] = [
      { path: 'folder/999.lua', content: Buffer.from('addappid(999)') },
    ]

    const result = findMainLua(files, '100')

    expect(result.appId).toBe('999')
    expect(result.content).toContain('addappid(999)')
  })

  it('extracts appId from filename when matching', () => {
    const files: ExtractedFile[] = [
      { path: 'folder/100.lua', content: Buffer.from('addappid(100)') },
    ]

    const result = findMainLua(files, '100')

    expect(result.appId).toBe('100')
  })
})
