import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'

// ── Extracted ACF logic (mirrors electron/main.ts) ──────────────────

function readAcfLaunchOptions(acfPath: string): string {
  try {
    const content = fs.readFileSync(acfPath, 'utf-8')
    const match = content.match(/"LaunchOptions"\s+"([^"]*)"/)
    return match ? match[1] : ''
  } catch {
    return ''
  }
}

function writeAcfLaunchOptions(acfPath: string, launchOptions: string): boolean {
  try {
    let content = fs.readFileSync(acfPath, 'utf-8')

    if (launchOptions) {
      if (/"LaunchOptions"\s+"[^"]*"/.test(content)) {
        content = content.replace(/"LaunchOptions"\s+"[^"]*"/, `"LaunchOptions"\t\t"${launchOptions}"`)
      } else if (/"UserConfig"\s*\{/.test(content)) {
        content = content.replace(
          /"UserConfig"\s*\{/,
          `"UserConfig"\n\t{\n\t\t"LaunchOptions"\t\t"${launchOptions}"`
        )
      } else {
        content = content.replace(/\n\}\s*$/, `\n\t"UserConfig"\n\t{\n\t\t"LaunchOptions"\t\t"${launchOptions}"\n\t}\n}`)
      }
    } else {
      content = content.replace(/\s*"LaunchOptions"\s+"[^"]*"/, '')
    }

    fs.writeFileSync(acfPath, content, 'utf-8')
    return true
  } catch {
    return false
  }
}

function isValidAppId(appId: string): boolean {
  return /^\d+$/.test(appId)
}

// ── Test fixtures ───────────────────────────────────────────────────

const ACF_WITH_LAUNCH_OPTIONS = `"AppState"
{
\t"appid"        "480"
\t"name"         "SpaceWar"
\t"UserConfig"
\t{
\t\t"LaunchOptions"\t\t"-novid -windowed"
\t}
}`

const ACF_WITH_USERCONFIG_NO_LAUNCH = `"AppState"
{
\t"appid"        "480"
\t"name"         "SpaceWar"
\t"UserConfig"
\t{
\t\t"language"    "english"
\t}
}`

const ACF_NO_USERCONFIG = `"AppState"
{
\t"appid"        "480"
\t"name"         "SpaceWar"
}`

function makeTempAcf(content: string): string {
  const tmp = path.join(os.tmpdir(), `test_acf_${Date.now()}_${Math.random().toString(36).slice(2)}.acf`)
  fs.writeFileSync(tmp, content, 'utf-8')
  return tmp
}

// ── Tests ───────────────────────────────────────────────────────────

describe('ACF LaunchOptions - read', () => {
  it('reads existing LaunchOptions', () => {
    const file = makeTempAcf(ACF_WITH_LAUNCH_OPTIONS)
    expect(readAcfLaunchOptions(file)).toBe('-novid -windowed')
    fs.unlinkSync(file)
  })

  it('returns empty string when LaunchOptions not present', () => {
    const file = makeTempAcf(ACF_WITH_USERCONFIG_NO_LAUNCH)
    expect(readAcfLaunchOptions(file)).toBe('')
    fs.unlinkSync(file)
  })

  it('returns empty string when UserConfig not present', () => {
    const file = makeTempAcf(ACF_NO_USERCONFIG)
    expect(readAcfLaunchOptions(file)).toBe('')
    fs.unlinkSync(file)
  })

  it('returns empty string for non-existent file', () => {
    expect(readAcfLaunchOptions('C:\\nonexistent\\file.acf')).toBe('')
  })
})

describe('ACF LaunchOptions - write', () => {
  it('updates existing LaunchOptions', () => {
    const file = makeTempAcf(ACF_WITH_LAUNCH_OPTIONS)
    expect(writeAcfLaunchOptions(file, '-novid -windowed -onlinefix')).toBe(true)
    expect(readAcfLaunchOptions(file)).toBe('-novid -windowed -onlinefix')
    fs.unlinkSync(file)
  })

  it('adds LaunchOptions to UserConfig without it', () => {
    const file = makeTempAcf(ACF_WITH_USERCONFIG_NO_LAUNCH)
    expect(writeAcfLaunchOptions(file, '-onlinefix')).toBe(true)
    expect(readAcfLaunchOptions(file)).toBe('-onlinefix')
    fs.unlinkSync(file)
  })

  it('adds UserConfig + LaunchOptions when neither exists', () => {
    const file = makeTempAcf(ACF_NO_USERCONFIG)
    expect(writeAcfLaunchOptions(file, '-onlinefix')).toBe(true)
    expect(readAcfLaunchOptions(file)).toBe('-onlinefix')
    fs.unlinkSync(file)
  })

  it('removes LaunchOptions when empty string passed', () => {
    const file = makeTempAcf(ACF_WITH_LAUNCH_OPTIONS)
    expect(writeAcfLaunchOptions(file, '')).toBe(true)
    expect(readAcfLaunchOptions(file)).toBe('')
    fs.unlinkSync(file)
  })

  it('returns false for non-existent file', () => {
    expect(writeAcfLaunchOptions('C:\\nonexistent\\file.acf', '-onlinefix')).toBe(false)
  })
})

describe('ACF LaunchOptions - Online Fix workflow', () => {
  it('enable: adds -onlinefix to empty options', () => {
    const file = makeTempAcf(ACF_WITH_USERCONFIG_NO_LAUNCH)
    const current = readAcfLaunchOptions(file)
    const newOpts = current ? `${current} -onlinefix` : '-onlinefix'
    writeAcfLaunchOptions(file, newOpts)
    expect(readAcfLaunchOptions(file)).toBe('-onlinefix')
    fs.unlinkSync(file)
  })

  it('enable: appends -onlinefix to existing options', () => {
    const file = makeTempAcf(ACF_WITH_LAUNCH_OPTIONS)
    const current = readAcfLaunchOptions(file)
    const newOpts = `${current} -onlinefix`
    writeAcfLaunchOptions(file, newOpts)
    expect(readAcfLaunchOptions(file)).toBe('-novid -windowed -onlinefix')
    fs.unlinkSync(file)
  })

  it('enable: idempotent when already enabled', () => {
    const file = makeTempAcf(ACF_WITH_LAUNCH_OPTIONS)
    // First enable
    let current = readAcfLaunchOptions(file)
    let newOpts = `${current} -onlinefix`
    writeAcfLaunchOptions(file, newOpts)
    // Second enable should detect already enabled
    current = readAcfLaunchOptions(file)
    expect(current.includes('-onlinefix')).toBe(true)
    // Should not double-add
    if (current.includes('-onlinefix')) {
      // Simulate the IPC handler's early return
    } else {
      newOpts = `${current} -onlinefix`
      writeAcfLaunchOptions(file, newOpts)
    }
    const final = readAcfLaunchOptions(file)
    const count = (final.match(/-onlinefix/g) || []).length
    expect(count).toBe(1)
    fs.unlinkSync(file)
  })

  it('disable: removes -onlinefix preserving other options', () => {
    const file = makeTempAcf(ACF_WITH_LAUNCH_OPTIONS)
    // Enable first
    writeAcfLaunchOptions(file, '-novid -windowed -onlinefix')
    // Disable
    const current = readAcfLaunchOptions(file)
    const newOpts = current.replace(/\s*-onlinefix/g, '').trim()
    writeAcfLaunchOptions(file, newOpts)
    expect(readAcfLaunchOptions(file)).toBe('-novid -windowed')
    fs.unlinkSync(file)
  })

  it('disable: when not enabled, returns not-enabled message', () => {
    const file = makeTempAcf(ACF_WITH_LAUNCH_OPTIONS)
    const current = readAcfLaunchOptions(file)
    expect(current.includes('-onlinefix')).toBe(false)
    fs.unlinkSync(file)
  })

  it('disable: removes -onlinefix when it is the only option', () => {
    const file = makeTempAcf(ACF_WITH_USERCONFIG_NO_LAUNCH)
    // Enable
    writeAcfLaunchOptions(file, '-onlinefix')
    expect(readAcfLaunchOptions(file)).toBe('-onlinefix')
    // Disable
    const current = readAcfLaunchOptions(file)
    const newOpts = current.replace(/\s*-onlinefix/g, '').trim()
    writeAcfLaunchOptions(file, newOpts)
    expect(readAcfLaunchOptions(file)).toBe('')
    fs.unlinkSync(file)
  })
})

describe('isValidAppId', () => {
  it('accepts numeric strings', () => {
    expect(isValidAppId('480')).toBe(true)
    expect(isValidAppId('892970')).toBe(true)
    expect(isValidAppId('0')).toBe(true)
  })

  it('rejects non-numeric strings', () => {
    expect(isValidAppId('abc')).toBe(false)
    expect(isValidAppId('480abc')).toBe(false)
    expect(isValidAppId('')).toBe(false)
    expect(isValidAppId('-1')).toBe(false)
    expect(isValidAppId('480.5')).toBe(false)
    expect(isValidAppId(' 480')).toBe(false)
    expect(isValidAppId('480 ')).toBe(false)
  })

  it('rejects special characters', () => {
    expect(isValidAppId('480;rm -rf')).toBe(false)
    expect(isValidAppId('480/../etc')).toBe(false)
    expect(isValidAppId('${HOME}')).toBe(false)
  })
})
