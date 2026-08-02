import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, it, vi } from 'vitest'

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ycore-local-diagnostic-'))
const steamAppsPath = path.join(tempRoot, 'steamapps')
const commonPath = path.join(steamAppsPath, 'common')
const luaPath = path.join(tempRoot, 'stplug-in')
const depotCachePath = path.join(tempRoot, 'depotcache')

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => tempRoot),
    getVersion: vi.fn(() => '0.0.0-test'),
    getName: vi.fn(() => 'Y-core-test'),
    isPackaged: false,
  },
}))

vi.mock('../electron/modules/steam-helpers', () => ({
  getSteamLibraryFolders: () => [steamAppsPath],
  getSteamAppsPath: () => steamAppsPath,
  getLuaScriptsDir: () => luaPath,
  getDepotCachePath: () => depotCachePath,
  isValidAppId: (appId: string) => /^\d+$/.test(appId),
}))

const { diagnoseAndRepairLocalInstallation } = await import(
  '../electron/modules/local-installation-diagnostics'
)

afterEach(() => {
  fs.rmSync(tempRoot, { recursive: true, force: true })
  fs.mkdirSync(tempRoot, { recursive: true })
})

describe('diagnoseAndRepairLocalInstallation', () => {
  it('rejects invalid app ids without touching the filesystem', async () => {
    const result = await diagnoseAndRepairLocalInstallation('../escape', 'Game')

    expect(result.ok).toBe(false)
    expect(result.issues).toContain('Invalid AppID')
    expect(result.repaired).toEqual([])
  })

  it('repairs stale local ACF metadata and reports missing manifests', async () => {
    const gameDir = path.join(commonPath, 'Example Game')
    fs.mkdirSync(gameDir, { recursive: true })
    fs.writeFileSync(path.join(gameDir, 'game.exe'), 'local test file')
    fs.mkdirSync(steamAppsPath, { recursive: true })
    fs.mkdirSync(luaPath, { recursive: true })
    fs.mkdirSync(depotCachePath, { recursive: true })
    fs.writeFileSync(
      path.join(luaPath, '123.lua'),
      'addappid(123)\nsetManifestid(123, "456", 100)\n',
    )
    const acfPath = path.join(steamAppsPath, 'appmanifest_123.acf')
    fs.writeFileSync(
      acfPath,
      '"StateFlags" "4"\n"SizeOnDisk" "0"\n"InstalledDepots"\n{\n\t"123"\n\t{\n\t\t"manifest" "456"\n\t}\n}\n',
    )

    const result = await diagnoseAndRepairLocalInstallation('123', 'Example Game')

    expect(result.gameDir).toBe(gameDir)
    expect(result.acfPresent).toBe(true)
    expect(result.luaPresent).toBe(true)
    expect(result.repaired).toContain('Steam appmanifest metadata')
    expect(result.missingManifests).toEqual(['123_456.manifest'])
    expect(result.issues).toContain('1 manifest file(s) are unavailable locally')
    expect(fs.readFileSync(acfPath, 'utf8')).toContain('"StateFlags"\t\t"1026"')
  })
})
