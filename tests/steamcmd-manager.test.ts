// tests/steamcmd-manager.test.ts
//
// H1.7 — Unit tests del parser de SteamCMD (capa pura, sin spawn ni fs).
// Apuntan directamente a electron/modules/steamcmd-parser.ts porque ahí
// viven los helpers. Los helpers son reimportados por steamcmd-manager.ts
// para uso interno; los tests los apuntan al módulo-canónico.
//
// Cubre:
//   - classifyUpdateState: todas las ramas + estado previo + regresión de
//     orden (preallocat antes de allocat).
//   - extractErrorMessage: trimming + strip + cap a 240 chars + regresión
//     de orden (trim antes de replace).
//   - buildArgs: happy path + variantes (validate, beta) + runtime guard.
//
// Sin red, sin spawn, sin fixtures en disco. Tests del spawn real viven en
// un script manual (`npx tsx scripts/...`) que corre contra un binario
// SteamCMD bajado por el fetcher.

import { describe, it, expect } from 'vitest'
import {
  classifyUpdateState,
  extractErrorMessage,
  buildArgs,
} from '../electron/modules/steamcmd-parser'

describe('classifyUpdateState', () => {
  it('mapea "Downloading" → downloading', () => {
    expect(classifyUpdateState('Downloading', 'preparing')).toBe('downloading')
  })

  it('mapea "Verifying" → verifying', () => {
    expect(classifyUpdateState('Verifying', 'downloading')).toBe('verifying')
  })

  it('mapea "Committing" → committing', () => {
    expect(classifyUpdateState('Committing', 'verifying')).toBe('committing')
  })

  it('mapea "Allocating" → allocating', () => {
    expect(classifyUpdateState('Allocating disk space', 'committing')).toBe('allocating')
  })

  it('mapea "Preallocating" → preparing (no allocating)', () => {
    // Guard contra regresión: preallocat chequea ANTES de allocat porque
    // "Preallocating" contiene ambos substrings.
    expect(classifyUpdateState('Preallocating', 'downloading')).toBe('preparing')
  })

  it('case-insensitive: MAYÚSCULAS también funcionan', () => {
    expect(classifyUpdateState('DOWNLOAD', 'preparing')).toBe('downloading')
  })

  it('estado desconocido mantiene el prev (no rompe el parser)', () => {
    expect(classifyUpdateState('Something Weird', 'verifying')).toBe('verifying')
    expect(classifyUpdateState('', 'preparing')).toBe('preparing')
  })
})

describe('extractErrorMessage', () => {
  it('strips "ERROR!" prefix y trimea', () => {
    expect(extractErrorMessage('ERROR! Something broke')).toBe('Something broke')
    expect(extractErrorMessage('  ERROR!   trimmed   ')).toBe('trimmed')
  })

  it('case-insensitive en el prefix', () => {
    expect(extractErrorMessage('error! lowercase')).toBe('lowercase')
  })

  it('cap a 240 chars para no inflar el payload', () => {
    const huge = 'A'.repeat(500)
    const result = extractErrorMessage(`ERROR! ${huge}`)
    expect(result.length).toBe(240)
  })

  it('sin prefix deja el texto tal cual (después de trim)', () => {
    expect(extractErrorMessage('plain text')).toBe('plain text')
  })
})

describe('buildArgs — pure helper', () => {
  it('construye args default (force_install_dir + login anonymous + app_update + validate + quit)', () => {
    // force_install_dir DEBE preceder a login: SteamCMD rechaza el login
    // ("Please use force_install_dir before logon!") si el orden se invierte.
    const args = buildArgs({ appId: '440', installDir: '/games/hl2' })
    expect(args).toEqual([
      '+force_install_dir', '/games/hl2',
      '+login', 'anonymous',
      '+app_update', '440',
      'validate',
      '+quit',
    ])
  })

  it('omite "validate" cuando validate=false (updates incrementales)', () => {
    const args = buildArgs({ appId: '440', installDir: '/x', validate: false })
    expect(args).not.toContain('validate')
    expect(args).toContain('+quit')
  })

  it('agrega -beta cuando betaBranch != "public"', () => {
    const args = buildArgs({ appId: '440', installDir: '/x', betaBranch: 'experimental' })
    expect(args).toContain('-beta')
    expect(args).toContain('experimental')
  })

  it('NO agrega -beta cuando betaBranch="public" u omitido', () => {
    expect(buildArgs({ appId: '440', installDir: '/x', betaBranch: 'public' })).not.toContain('-beta')
    expect(buildArgs({ appId: '440', installDir: '/x' })).not.toContain('-beta')
  })

  it('RUNTIME GUARD: throws cuando installDir es empty/undefined', () => {
    expect(() => buildArgs({ appId: '440', installDir: '' })).toThrow(/installDir is required/)
    // @ts-expect-error — exercising runtime guard at runtime
    expect(() => buildArgs({ appId: '440' })).toThrow(/installDir is required/)
    // @ts-expect-error — exercising runtime guard at runtime
    expect(() => buildArgs({ appId: '440', installDir: undefined })).toThrow(/installDir is required/)
  })
})
