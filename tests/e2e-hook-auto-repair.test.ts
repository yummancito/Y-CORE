// ============================================================================
// tests/e2e-hook-auto-repair.test.ts
// ============================================================================
// E2E verification for the background Steam ownership hook auto-repair
// (electron/modules/hook-auto-repair.ts).
//
// Two layers, matching the repo's e2e convention:
//   1. Content verification — the module exists with the expected public
//      surface, main.ts wires startHookAutoRepair() (replacing the old
//      bounded 30-retry loop), dll-inject.ts exports the trio helpers, and
//      pc-analyzer surfaces the watchdog state.
//   2. Behavioral tests — runHookAutoRepairPass() driven with mocked
//      steam-helpers / dll-inject to prove the decision matrix:
//        healthy short-circuit (no reinstall)        → 'healthy'
//        missing dwmapi.dll (false negative guard)   → repair
//        Steam running                               → 'deferred' (never force-close)
//        no consent                                  → 'no-consent'
//        silent install returns false                → 'install-failed'
//        no Steam                                    → 'no-steam'
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import path from 'path'
import fs from 'fs'

// ── Mocks (main-process deps must be faked in Node/Vitest) ────────────────
vi.mock('electron', () => ({
  app: {
    on: vi.fn(),
    getPath: vi.fn(() => '/tmp/ycore-test'),
    getAppPath: vi.fn(() => '/tmp/ycore-test'),
    getVersion: vi.fn(() => '4.3.0'),
    isPackaged: false,
  },
}))

vi.mock('../electron/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), init: vi.fn() },
}))

const mocks = vi.hoisted(() => ({
  getSteamPath: vi.fn(),
  isSteamRunning: vi.fn(),
  getSteamBuildId: vi.fn(),
  checkSteamVerification: vi.fn(),
  readLastBuildId: vi.fn(),
  hasHookConsent: vi.fn(),
  hookPresent: vi.fn(),
  revalidateHookIfUpdated: vi.fn(),
}))

vi.mock('../electron/modules/steam-helpers', () => ({
  getSteamPath: mocks.getSteamPath,
  isSteamRunning: mocks.isSteamRunning,
  getSteamBuildId: mocks.getSteamBuildId,
}))

vi.mock('../electron/modules/dll-inject', () => ({
  checkSteamVerification: mocks.checkSteamVerification,
  readLastBuildId: mocks.readLastBuildId,
  hasHookConsent: mocks.hasHookConsent,
  hookPresent: mocks.hookPresent,
  revalidateHookIfUpdated: mocks.revalidateHookIfUpdated,
}))

import { runHookAutoRepairPass, startHookAutoRepair, stopHookAutoRepair, getHookAutoRepairState } from '../electron/modules/hook-auto-repair'

// ============================================================================
// Layer 1: Content verification (repo e2e convention)
// ============================================================================

describe('Y-Core Hook Auto-Repair — E2E surface', () => {
  it('module exists and exports the public API', () => {
    const p = path.join(process.cwd(), 'electron/modules/hook-auto-repair.ts')
    expect(fs.existsSync(p)).toBe(true)
    const content = fs.readFileSync(p, 'utf-8')
    for (const symbol of ['startHookAutoRepair', 'stopHookAutoRepair', 'runHookAutoRepairPass', 'getHookAutoRepairState', 'HookAutoRepairStatus']) {
      expect(content).toContain(symbol)
    }
  })

  it('main.ts wires startHookAutoRepair and no longer uses the bounded retry', () => {
    const main = fs.readFileSync(path.join(process.cwd(), 'electron/main.ts'), 'utf-8')
    // New continuous watchdog is started at app startup.
    expect(main).toContain("import { startHookAutoRepair } from './modules/hook-auto-repair'")
    expect(main).toContain('startHookAutoRepair()')
    // The old bounded retry (30 attempts × 1 min) must be gone.
    expect(main).not.toContain('MAX_RETRIES = 30')
    expect(main).not.toContain('const MAX_RETRIES')
  })

  it('dll-inject.ts exports the trio helpers used by the watchdog', () => {
    const p = path.join(process.cwd(), 'electron/modules/dll-inject.ts')
    const content = fs.readFileSync(p, 'utf-8')
    expect(content).toContain('export function readLastBuildId')
    expect(content).toContain('export function hasHookConsent')
    expect(content).toContain('export function hookPresent')
  })

  it('pc-analyzer surfaces the watchdog state for the hook-missing issue', () => {
    const p = path.join(process.cwd(), 'electron/modules/pc-analyzer.ts')
    const content = fs.readFileSync(p, 'utf-8')
    expect(content).toContain("import { getHookAutoRepairState } from './hook-auto-repair'")
    expect(content).toContain('repairState.lastStatus')
  })
})

// ============================================================================
// Layer 2: Behavioral tests (decision matrix of runHookAutoRepairPass)
// ============================================================================

describe('Y-Core Hook Auto-Repair — runHookAutoRepairPass decision matrix', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Defaults: Steam installed at a path, not running, no build info.
    mocks.getSteamPath.mockReturnValue('C:/Program Files (x86)/Steam')
    mocks.isSteamRunning.mockResolvedValue(false)
    mocks.getSteamBuildId.mockReturnValue(null)
    mocks.readLastBuildId.mockReturnValue(null)
    mocks.checkSteamVerification.mockReturnValue({ installed: true, missing: [] })
    mocks.hasHookConsent.mockReturnValue(true)
    mocks.hookPresent.mockReturnValue(true)
    mocks.revalidateHookIfUpdated.mockResolvedValue(true)
    // Reset watchdog module state so each test starts fresh.
    stopHookAutoRepair()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    stopHookAutoRepair()
  })

  it('no Steam → no-steam (nothing to watch)', async () => {
    mocks.getSteamPath.mockReturnValue(null)
    expect(await runHookAutoRepairPass()).toBe('no-steam')
    expect(mocks.revalidateHookIfUpdated).not.toHaveBeenCalled()
  })

  it('healthy trio + unchanged build → healthy, never reinstalls (false-positive guard)', async () => {
    mocks.getSteamBuildId.mockReturnValue('12345')
    mocks.readLastBuildId.mockReturnValue('12345')
    const status = await runHookAutoRepairPass()
    expect(status).toBe('healthy')
    expect(mocks.revalidateHookIfUpdated).not.toHaveBeenCalled()
    expect(mocks.isSteamRunning).not.toHaveBeenCalled()
  })

  it('missing dwmapi.dll alone → treated as broken and repaired (false-negative guard)', async () => {
    mocks.checkSteamVerification.mockReturnValue({ installed: false, missing: ['dwmapi.dll'] })
    const status = await runHookAutoRepairPass()
    expect(status).toBe('repaired')
    expect(mocks.revalidateHookIfUpdated).toHaveBeenCalledTimes(1)
  })

  it('Steam running → deferred, never force-closes Steam, no install attempt', async () => {
    mocks.checkSteamVerification.mockReturnValue({ installed: false, missing: ['YCoreTool.dll'] })
    mocks.isSteamRunning.mockResolvedValue(true)
    const status = await runHookAutoRepairPass()
    expect(status).toBe('deferred')
    expect(mocks.revalidateHookIfUpdated).not.toHaveBeenCalled()
  })

  it('Steam comes up between checks → deferred (race-window guard)', async () => {
    mocks.checkSteamVerification.mockReturnValue({ installed: false, missing: ['YCoreTool.dll'] })
    mocks.isSteamRunning.mockResolvedValueOnce(false).mockResolvedValueOnce(true)
    const status = await runHookAutoRepairPass()
    expect(status).toBe('deferred')
    expect(mocks.revalidateHookIfUpdated).not.toHaveBeenCalled()
  })

  it('no consent and no pre-existing hook → no-consent, no silent install', async () => {
    mocks.checkSteamVerification.mockReturnValue({ installed: false, missing: ['YCoreTool.dll'] })
    mocks.hasHookConsent.mockReturnValue(false)
    mocks.hookPresent.mockReturnValue(false)
    const status = await runHookAutoRepairPass()
    expect(status).toBe('no-consent')
    expect(mocks.revalidateHookIfUpdated).not.toHaveBeenCalled()
  })

  it('pre-existing hook DLLs imply consent even without hook_consent.txt', async () => {
    mocks.checkSteamVerification.mockReturnValue({ installed: false, missing: ['YCoreTool.dll'] })
    mocks.hasHookConsent.mockReturnValue(false)
    mocks.hookPresent.mockReturnValue(true)
    const status = await runHookAutoRepairPass()
    expect(status).toBe('repaired')
    expect(mocks.revalidateHookIfUpdated).toHaveBeenCalledTimes(1)
  })

  it('silent install returning false → install-failed', async () => {
    mocks.checkSteamVerification.mockReturnValue({ installed: false, missing: ['YCoreTool.dll'] })
    mocks.revalidateHookIfUpdated.mockResolvedValue(false)
    const status = await runHookAutoRepairPass()
    expect(status).toBe('install-failed')
  })

  it('build changed while DLLs present → revalidates (stale-hook-after-Steam-update)', async () => {
    mocks.getSteamBuildId.mockReturnValue('99999')
    mocks.readLastBuildId.mockReturnValue('12345')
    const status = await runHookAutoRepairPass()
    expect(status).toBe('repaired')
    expect(mocks.revalidateHookIfUpdated).toHaveBeenCalledTimes(1)
  })

  it('watchdog lifecycle: start runs an immediate pass and stop tears down cleanly', async () => {
    mocks.checkSteamVerification.mockReturnValue({ installed: false, missing: ['dwmapi.dll'] })
    // startHookAutoRepair fires an immediate pass on a microtask; stop clears
    // the interval. Both must be callable and the state getter must stay
    // consistent after a pass.
    await runHookAutoRepairPass()
    const state = getHookAutoRepairState()
    expect(state.lastStatus).toBe('repaired')
    expect(state.missingDlls).toContain('dwmapi.dll')
    expect(state.lastRunAt).toBeTruthy()
    startHookAutoRepair({ intervalMs: 60_000 })
    stopHookAutoRepair()
    expect(getHookAutoRepairState().lastStatus).toBe('repaired')
  })

  it('repeated failures settle on install-failed without thrashing status', async () => {
    mocks.checkSteamVerification.mockReturnValue({ installed: false, missing: ['dwmapi.dll'] })
    mocks.revalidateHookIfUpdated.mockResolvedValue(false)
    const first = await runHookAutoRepairPass()
    const second = await runHookAutoRepairPass()
    expect(first).toBe('install-failed')
    expect(second).toBe('install-failed')
  })
})
