// tests/manifest-sync-strip.test.ts
//
// H1.7.2 contract test — stripDepotsWithoutKeys (electron/modules/manifest-sync.ts)
// filtra depots sin clave del Lua antes de escribirlo a disco.
//
// Contrato preciso (verificado leyendo el código de stripDepotsWithoutKeys):
//   - SIEMPRE preserva addappid(mainAppId) aunque mainAppId NO esté en depot_keys
//     (caso defensivo: el API puede no devolver key para el depot principal,
//     pero Steam lo necesita para reconocer el juego como poseído).
//   - Strips addappid(<depot>) y setManifestid(<depot>) para depot_ids que
//     NO están en depot_keys NI son mainAppId.
//   - Reporta en strippedDepots[] los depot_ids que removió (los que NO son
//     mainAppId).
//
// Mocks: manifest-sync.ts importa transitivamente ./acf.ts que usa 'electron'
// (app.getPath, etc). Vitest corre Node puro, así que require('electron')
// throwea antes de que stripDepotsWithoutKeys quede definido. Por eso
// mockeamos 'electron' al tope.

import { describe, it, expect, vi } from 'vitest'

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn((name: string) => `/tmp/ycore-test-${name}`),
    getVersion: vi.fn(() => '0.0.0-test'),
    getName: vi.fn(() => 'Y-core-test'),
    isPackaged: false,
  },
  ipcMain: { handle: vi.fn(), on: vi.fn() },
  BrowserWindow: vi.fn(),
}))

const { stripDepotsWithoutKeys } = await import(
  '../electron/modules/manifest-sync'
)

// Fixture Lua corresponde a ARC Raiders (appid=1808500). Se incluyen varios
// addappid + setManifestid para probar el contrato de strip en ambos formatos.
const FIXTURE_LUA = `
addappid(1808500, 1)
addappid(1808501, 1)
addappid(4210150, 1)
addappid(4424920, 1)
addappid(4741040, 1)
setManifestid(1808501, "101547844270280678")
setManifestid(4210150, "999999999999")
setManifestid(228989, "5753583882400741046")
`

describe('stripDepotsWithoutKeys (H1.7.2 contract)', () => {
  it('remueve addappid() para depots sin clave, conservando mainAppId', () => {
    const KEYED = [
      { depot_id: '1808500', key: 'aaaa' }, // mainAppId
      { depot_id: '1808501', key: 'bbbb' },
      { depot_id: '228989', key: 'cccc' },
    ]
    const { cleanedLua, strippedDepots } = stripDepotsWithoutKeys(
      FIXTURE_LUA,
      '1808500',
      KEYED,
    )
    // addappid sin clave SÍ stripped:
    expect(cleanedLua).not.toMatch(/addappid\(4210150/)
    expect(cleanedLua).not.toMatch(/addappid\(4424920/)
    expect(cleanedLua).not.toMatch(/addappid\(4741040/)
    // addappid keyed preservados:
    expect(cleanedLua).toMatch(/addappid\(1808500/)
    expect(cleanedLua).toMatch(/addappid\(1808501/)
    // setManifestid del depot UNKEYED (4210150) SÍ strip:
    expect(cleanedLua).not.toMatch(/setManifestid\(4210150, "999999999999"/)
    // strippedDepots sólo reporta depots removidos (NO mainAppId):
    expect(strippedDepots).toEqual(['4210150', '4424920', '4741040'])
    expect(strippedDepots).not.toContain('1808500')
  })

  it('preserva mainAppId aunque no esté en depot_keys (caso defensivo)', () => {
    // El API devolvió keys para 1808501 pero NO para 1808500 (mainAppId).
    // El strip debe agregar mainAppId implícitamente al keyed set para no
    // borrarlo del Lua.
    const partly = [{ depot_id: '1808501', key: 'bbbb' }]
    const { cleanedLua, strippedDepots } = stripDepotsWithoutKeys(
      FIXTURE_LUA,
      '1808500',
      partly,
    )
    expect(cleanedLua).toMatch(/addappid\(1808500/)
    expect(cleanedLua).toMatch(/addappid\(1808501/)
    expect(cleanedLua).not.toMatch(/addappid\(4210150/)
    // stripped no incluye mainAppId (siempre se preserva):
    expect(strippedDepots).not.toContain('1808500')
    expect(strippedDepots).not.toContain('1808501')
    expect(strippedDepots).toContain('4210150')
    expect(strippedDepots).toContain('4424920')
    expect(strippedDepots).toContain('4741040')
  })

  it('no strips nada si todos los depots están keyed (sin mainAppId)', () => {
    const all = [
      { depot_id: '1808500', key: 'a' },
      { depot_id: '1808501', key: 'b' },
      { depot_id: '4210150', key: 'c' },
      { depot_id: '4424920', key: 'd' },
      { depot_id: '4741040', key: 'e' },
      { depot_id: '228989', key: 'f' },
    ]
    const { cleanedLua, strippedDepots } = stripDepotsWithoutKeys(
      FIXTURE_LUA,
      '1808500',
      all,
    )
    expect(strippedDepots).toEqual([])
    // Todos los addappid presentes:
    expect(cleanedLua).toMatch(/addappid\(1808500/)
    expect(cleanedLua).toMatch(/addappid\(1808501/)
    expect(cleanedLua).toMatch(/addappid\(4210150/)
    expect(cleanedLua).toMatch(/addappid\(4424920/)
    expect(cleanedLua).toMatch(/addappid\(4741040/)
    // El setManifestid de 228989 también se preserva:
    expect(cleanedLua).toMatch(/setManifestid\(228989, "5753583882400741046"/)
  })

  it('maneja depotKeys vacío sin romper; deja sólo mainAppId', () => {
    const { cleanedLua, strippedDepots } = stripDepotsWithoutKeys(
      FIXTURE_LUA,
      '1808500',
      [],
    )
    expect(cleanedLua).toMatch(/addappid\(1808500/)
    expect(cleanedLua).not.toMatch(/addappid\(1808501/)
    expect(cleanedLua).not.toMatch(/addappid\(4210150/)
    expect(strippedDepots).not.toContain('1808500') // mainAppId siempre preserved
    expect(strippedDepots).toContain('1808501')
    expect(strippedDepots).toContain('4210150')
    expect(strippedDepots).toContain('4424920')
    expect(strippedDepots).toContain('4741040')
  })
})
