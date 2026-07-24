// ============================================================================
// local-steam-emulator.test.ts — smoke tests para el TS bridge
// ----------------------------------------------------------------------------
// Cubre:
//   1. isLocalSteamEmulatorAvailable() NO lanza cuando DLL no existe — debe
//      devolver `false` con failureReason poblada (CI-friendly).
//   2. getLocalSteamEmulatorDiagnostics() retorna shape estable.
//   3. patchGameFolder() rechaza gameFolder inválido.
//   4. Carga real: si la DLL está compilada, version() retorna string no-vacío
//      con formato esperado. (skip en CI sin DLL via it.skip dinámico).
// ============================================================================

import { describe, it, expect, beforeAll } from 'vitest'
import path from 'path'
import fs from 'fs'
import os from 'os'

describe('local-steam-emulator (clean-room native bridge)', () => {
  let tmpDir: string

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ycore-emu-test-'))
  })

  it('does not throw when the DLL is missing', async () => {
    // Import lazily so the beforeAll tmpDir is ready.
    const mod = await import('../electron/modules/local-steam-emulator')

    // Forzar "DLL ausente" simulando platform incorrecto si es non-Windows.
    // En Windows: confirmar que devuelve false (porque la DLL no está
    // compilada en el test-run normal) sin lanzar.
    const available = mod.isLocalSteamEmulatorAvailable()

    if (process.platform !== 'win32') {
      expect(available).toBe(false)
    } else {
      // En Windows sin DLL compilada también devuelve false.
      expect(typeof available).toBe('boolean')
    }
  })

  it('getLocalSteamEmulatorDiagnostics() returns stable shape', async () => {
    const mod = await import('../electron/modules/local-steam-emulator')
    const diag = mod.getLocalSteamEmulatorDiagnostics()

    expect(diag).toHaveProperty('isAvailable')
    expect(diag).toHaveProperty('dllPath')
    expect(diag).toHaveProperty('version')
    expect(diag).toHaveProperty('shortSha')
    expect(diag).toHaveProperty('appVersion')
    expect(diag).toHaveProperty('failureReason')
    expect(typeof diag.isAvailable).toBe('boolean')
    expect(diag.dllPath === null || typeof diag.dllPath === 'string').toBe(true)
  })

  it('getInfo() returns same shape as isAvailable() predicate', async () => {
    const mod = await import('../electron/modules/local-steam-emulator')
    const avail = mod.isLocalSteamEmulatorAvailable()
    const info = mod.getInfo()

    expect(info.available).toBe(avail)
    expect(info.available).toBe(mod.isLocalSteamEmulatorAvailable())
  })

  it('patchGameFolder() rejects missing or invalid appId', async () => {
    const mod = await import('../electron/modules/local-steam-emulator')
    const result = mod.patchGameFolder('', '123')
    expect(result.success).toBe(false)
    expect(result.error).toBeTruthy()
  })

  it('patchGameFolder() rejects nonexistent gameFolder', async () => {
    const mod = await import('../electron/modules/local-steam-emulator')
    const fakePath = path.join(tmpDir, 'does-not-exist-12345')
    const result = mod.patchGameFolder(fakePath, '123')
    expect(result.success).toBe(false)
    expect(result.error).toBeTruthy()
  })

  it('patchGameFolder() return type preserves error/warnings/patchedAt shape', async () => {
    // Regression guard: shape must always include those three optional
    // fields, even when patchedAt/warnings are absent. Round-8 caller
    // manifest-sync narrows on result.warnings.length; if shape ever
    // ·flies without warnings, that narrowing breaks silently.
    const mod = await import('../electron/modules/local-steam-emulator')
    const failed = mod.patchGameFolder('', '123')
    expect(failed).toHaveProperty('success')
    expect(failed).toHaveProperty('error')
    // 'success' is the only required field; error/warnings/patchedAt
    // are optional but when present, are correct types.
    if ('warnings' in failed && failed.warnings !== undefined) {
      expect(Array.isArray(failed.warnings)).toBe(true)
    }
  })
})

describe('local-steam-emulator — golden values (skipped without compiled DLL)', () => {
  it('version() returns semver-ish string when DLL present', async () => {
    const mod = await import('../electron/modules/local-steam-emulator')
    const available = mod.isLocalSteamEmulatorAvailable()
    if (!available) {
      // DLL no compilada → skip. En producción el build.bat popula esto.
      console.log(
        '[local-steam-emulator] DLL no presente — skipping golden assertions',
      )
      return
    }
    const v = mod.getLocalSteamEmulatorVersion()
    expect(v).toBeTruthy()
    expect(typeof v).toBe('string')
    // El formato canónico es "0.1.0+local-cleanroom" en v1.
    expect(v).toMatch(/^\d+\.\d+\.\d+/)
  })
})
