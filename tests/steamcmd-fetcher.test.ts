// tests/steamcmd-fetcher.test.ts
//
// H1.7.4 — Contract test for the SteamCMD cache-self-healing fix.
//
// Regression test for: "fetch on-demand completed" reported as success even
// though 7zip-min extracted Valve's nested `steamcmd/steamcmd.exe` instead
// of the flat `steamcmd.exe` we expected. `isSteamCmdAvailable()` then
// returned `false` post-fetch and the install aborted.
//
// Mocking strategy: electron-context.ts uses require('electron') which doesn't
// reliably hit vi.mock('electron') because of how the env fallback chain
// works (require throws on Node-pure → falls back to LOCALAPPDATA). So we
// mock electron-context directly and return TMP_DIR from getUserDataDir().

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'

let TMP_DIR = ''

vi.mock('../electron/modules/electron-context', async () => {
  // Lazy TMP_DIR accessor — by the time tests run, beforeAll has set it.
  return {
    isElectronContext: true,
    isElectronPackaged: () => false,
    getUserDataDir: () => TMP_DIR,
    getAppPath: () => TMP_DIR,
    getHome: () => os.homedir(),
    getLibraryRoot: () => path.join(TMP_DIR, 'Library'),
    getLogDir: () => TMP_DIR,
    emitToRenderers: () => {},
    safeEmitToRenderers: () => false,
  }
})

// Static imports AFTER mock setup (vitest hoists vi.mock above imports).
import {
  findSteamCmdBinary,
  fetchSteamCmd,
  getSteamCmdCacheDir,
} from '../electron/modules/steamcmd-fetcher'
import { getSteamCmdPath } from '../electron/modules/steamcmd-manager'

beforeAll(() => {
  TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ycore-steamcmd-test-'))
})

afterEach(() => {
  try {
    fs.rmSync(TMP_DIR, { recursive: true, force: true })
  } catch { /* ignore */ }
  vi.restoreAllMocks()
})

describe('steamcmd-fetcher self-healing', () => {
  beforeEach(() => {
    // Fresh scratch dir per test, AND create the cache root so flat-path
    // tests don't fall over their own feet trying to write into a missing dir.
    TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ycore-steamcmd-test-'))
    fs.mkdirSync(getSteamCmdCacheDir(), { recursive: true })
  })

  it('findSteamCmdBinary resolves nested layout (Valve current zip wraps in steamcmd/)', () => {
    const nested = path.join(getSteamCmdCacheDir(), 'steamcmd', 'steamcmd.exe')
    fs.mkdirSync(path.dirname(nested), { recursive: true })
    fs.writeFileSync(nested, Buffer.alloc(2_000_000, 0)) // 2MB > MIN_BIN_BYTES

    expect(findSteamCmdBinary()).toBe(nested)
  })

  it('findSteamCmdBinary resolves flat layout when present', () => {
    const flat = path.join(getSteamCmdCacheDir(), 'steamcmd.exe')
    fs.writeFileSync(flat, Buffer.alloc(2_000_000, 0))

    expect(findSteamCmdBinary()).toBe(flat)
  })

  it('findSteamCmdBinary returns null when cache is empty', () => {
    expect(findSteamCmdBinary()).toBeNull()
  })

  it('findSteamCmdBinary finds the bin at deeper nesting (recursivo)', () => {
    const deep = path.join(getSteamCmdCacheDir(), 'wrap1', 'wrap2', 'wrap3', 'steamcmd.exe')
    fs.mkdirSync(path.dirname(deep), { recursive: true })
    fs.writeFileSync(deep, Buffer.alloc(2_000_000, 0))

    expect(findSteamCmdBinary()).toBe(deep)
  })

  it('fetchSteamCmd cache-hit returns success:true + nested binPath', async () => {
    // Pre-write the bin in the nested layout, simulating a prior successful fetch.
    const nested = path.join(getSteamCmdCacheDir(), 'steamcmd', 'steamcmd.exe')
    fs.mkdirSync(path.dirname(nested), { recursive: true })
    fs.writeFileSync(nested, Buffer.alloc(2_000_000, 0))

    const result = await fetchSteamCmd({})
    expect(result.success).toBe(true)
    expect(result.binPath).toBe(nested)
    expect(result.source).toBe('cache')
  })
})

describe('steamcmd-manager path resolution (nested extraction layout)', () => {
  beforeEach(() => {
    TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ycore-steamcmd-test-'))
  })

  it('getSteamCmdPath resolves the nested bin in userData cache', () => {
    const nested = path.join(getSteamCmdCacheDir(), 'steamcmd', 'steamcmd.exe')
    fs.mkdirSync(path.dirname(nested), { recursive: true })
    fs.writeFileSync(nested, Buffer.alloc(2_000_000, 0))

    expect(getSteamCmdPath()).toBe(nested)
  })

  it('getSteamCmdPath resolves a deeper recursivo layout', () => {
    const deep = path.join(getSteamCmdCacheDir(), 'wrap1', 'wrap2', 'wrap3', 'steamcmd.exe')
    fs.mkdirSync(path.dirname(deep), { recursive: true })
    fs.writeFileSync(deep, Buffer.alloc(2_000_000, 0))

    expect(getSteamCmdPath()).toBe(deep)
  })

  it('getSteamCmdPath returns null when nothing installed', () => {
    expect(getSteamCmdPath()).toBeNull()
  })
})
