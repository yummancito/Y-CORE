import { describe, it, expect } from 'vitest'
import { parseVdf, isValidAppId } from '../electron/modules/steam-helpers'

describe('parseVdf', () => {
  it('parses simple key-value pairs', () => {
    const vdf = `"AppState"
{
\t"appid"\t\t"123456"
\t"name"\t\t"Test Game"
}`
    const result = parseVdf(vdf)

    expect(result['AppState']).toBeDefined()
    expect(result['AppState']['appid']).toBe('123456')
    expect(result['AppState']['name']).toBe('Test Game')
  })

  it('parses nested objects', () => {
    const vdf = `"AppState"
{
\t"appid"\t\t"123456"
\t"UserConfig"
\t{
\t\t"Language"\t\t"english"
\t}
}`
    const result = parseVdf(vdf)

    expect(result['AppState']['appid']).toBe('123456')
    expect(result['AppState']['UserConfig']).toBeDefined()
    expect(result['AppState']['UserConfig']['Language']).toBe('english')
  })

  it('parses deeply nested structures', () => {
    const vdf = `"AppState"
{
\t"MountedDepots"
\t{
\t\t"100"\t\t"111"
\t\t"200"\t\t"222"
\t}
}`
    const result = parseVdf(vdf)

    expect(result['AppState']['MountedDepots']['100']).toBe('111')
    expect(result['AppState']['MountedDepots']['200']).toBe('222')
  })

  it('parses a real ACF file structure', () => {
    const vdf = `"AppState"
{
\t"appid"\t\t"240"
\t"Universe"\t\t"1"
\t"name"\t\t"Source SDK Base 2007"
\t"StateFlags"\t\t"4"
\t"installdir"\t\t"Source SDK Base 2007"
\t"InstalledDepots"
\t{
\t	"456"
		{
			"manifest"\t\t"1234567890123456789"
		}
	}
}`
    const result = parseVdf(vdf)

    expect(result['AppState']['appid']).toBe('240')
    expect(result['AppState']['StateFlags']).toBe('4')
    expect(result['AppState']['InstalledDepots']['456']['manifest']).toBe('1234567890123456789')
  })

  it('handles empty values', () => {
    const vdf = `"AppState"
{
\t"name"\t\t""
}`
    const result = parseVdf(vdf)

    expect(result['AppState']['name']).toBe('')
  })
})

describe('isValidAppId', () => {
  it('returns true for numeric strings', () => {
    expect(isValidAppId('123456')).toBe(true)
    expect(isValidAppId('240')).toBe(true)
    expect(isValidAppId('1')).toBe(true)
  })

  it('returns false for non-numeric strings', () => {
    expect(isValidAppId('abc')).toBe(false)
    expect(isValidAppId('12abc')).toBe(false)
    expect(isValidAppId('')).toBe(false)
  })

  it('returns false for strings with spaces or special chars', () => {
    expect(isValidAppId('123 456')).toBe(false)
    expect(isValidAppId('123-456')).toBe(false)
    expect(isValidAppId('12.3')).toBe(false)
  })
})
