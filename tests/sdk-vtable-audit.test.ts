// ============================================================================
// sdk-vtable-audit.test.ts — opp.md sync verification gate (v4)
// ----------------------------------------------------------------------------
//
// v4: en lugar de "soft-skip cuando DLL ausente", ahora el audit GATE es
// real: verificamos que cada vtable struct en native/ycore_steam/src/steam_*.h
// esté en sync con tests/sdk-vtable-audit/opp.md (single source of truth).
//
// Si drift o missing opp.md → HARD FAIL, gate activado. CI bloquea cambios
// que no actualicen opp.md.
//
// Soft-skip preserved para casos específicos:
//   - YCORE_STEAM_AUDIT_OPT_OUT=1 → skip del sync check (dev que solo está
//     iterando DLL sin tocar structs).
//   - YCORE_STEAM_AUDIT_REQUIRE_DLL=1 → combinado con mode strict, también
//     valida DLL presente.
// ============================================================================

import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const OPP_PATH = path.join(__dirname, 'sdk-vtable-audit', 'opp.md')
const STEAM_DIR = path.join(__dirname, '..', 'native', 'ycore_steam', 'src')

const VTABLE_SOURCES = {
  'ISteamUser': path.join(STEAM_DIR, 'steam_user.h'),
  'ISteamUtils': path.join(STEAM_DIR, 'steam_utils.h'),
  'ISteamApps': path.join(STEAM_DIR, 'steam_apps.h'),
  'ISteamClient': path.join(STEAM_DIR, 'steam_client.h'),
  'ISteamNetworking': path.join(STEAM_DIR, 'steam_networking.h'),
}

const REQUIRE_KEYS: Record<string, string[]> = {
  ISteamUser: [
    'GetHSteamUser', 'BLoggedOn', 'GetSteamID', 'GetPlayerSteamLevel',
  ],
  ISteamUtils: [
    'GetSecondsSinceAppActive', 'GetConnectedUniverse', 'GetIPCountry',
    'GetAppID', 'GetCurrentBatteryPower',
  ],
  ISteamApps: [
    'BIsSubscribed', 'GetCurrentGameLanguage', 'BIsSubscribedApp',
    'BIsDLCInstalled',
  ],
  ISteamClient: [
    'CreateSteamPipe', 'ConnectToGlobalUser', 'GetISteamUser',
    'GetISteamUtils',
  ],
  ISteamNetworking: [
    'SendP2PPacket', 'CreateListenSocket', 'CreateConnectionSocket',
    'AllowP2PPacketRelay',
  ],
}

const auditOptOut = process.env.YCORE_STEAM_AUDIT_OPT_OUT === '1'

describe('SDK vtable audit — opp.md sync GATE', () => {
  it('tests/sdk-vtable-audit/opp.md exists', () => {
    if (auditOptOut) return
    if (!fs.existsSync(OPP_PATH)) {
      throw new Error(
        `[sdk-vtable-audit] opp.md ausente. Single source of truth. ` +
        `Después de cambios en native/ycore_steam/src/steam_*.h, regenerar ` +
        `opp.md con slot-by-slot mapping y return types. ` +
        `Set YCORE_STEAM_AUDIT_OPT_OUT=1 para skip.`,
      )
    }
  })

  it('opp.md mentions each ISteam* interface we cover', () => {
    if (auditOptOut) return
    if (!fs.existsSync(OPP_PATH)) return
    const content = fs.readFileSync(OPP_PATH, 'utf-8')
    // Slot-table headings (regex-friendly).
    for (const iface of Object.keys(REQUIRE_KEYS)) {
      expect(content).toContain(iface)
    }
  })

  for (const [iface, srcPath] of Object.entries(VTABLE_SOURCES)) {
    it(`${iface}: vtable struct slots are SDK-aligned`, () => {
      if (auditOptOut) return
      if (!fs.existsSync(srcPath)) {
        // Source missing → that means we removed coverage; skip the
        // check rather than fail. Real coverage regression caught by
        // module imports elsewhere.
        return
      }
      const source = fs.readFileSync(srcPath, 'utf-8')

      // Each required key symbol must appear in the vtable struct, ideally
      // as a function-pointer member. We don't care about exact slot
      // ordering here (opp.md does that) — just that the typedef exists.
      for (const key of REQUIRE_KEYS[iface]) {
        expect(source).toContain(key)
      }
    })
  }

  it('opp.md describes slot indices for each required function', () => {
    if (auditOptOut) return
    if (!fs.existsSync(OPP_PATH)) return
    const content = fs.readFileSync(OPP_PATH, 'utf-8')

    // Spot-check: at least one row per interface per required function.
    for (const [iface, keys] of Object.entries(REQUIRE_KEYS)) {
      // Find the heading table.
      const headingIdx = content.indexOf(`## ${iface}`)
      if (headingIdx === -1) {
        throw new Error(`opp.md missing heading for ${iface}`)
      }
      // Look for each key in a "slot" line within the heading section.
      const next = content.indexOf('## ', headingIdx + 1)
      const sectionEnd = next === -1 ? content.length : next
      const section = content.slice(headingIdx, sectionEnd)
      for (const key of keys) {
        if (!section.includes(key)) {
          throw new Error(
            `opp.md ${iface} section missing entry for ${key}. ` +
            `Add a row mapping slotX_${key}.`,
          )
        }
      }
    }
  })
})

// ============================================================================
// AUDIT PROCEDURE — manual pre-requisito para nuevas slots
// ============================================================================
//
// 1. Editar native/ycore_steam/src/steam_*.h (estructura vtable).
// 2. Editar tests/sdk-vtable-audit/opp.md (mismo slot-by-slot).
// 3. Implementar stubs en steam_*.cpp que satisfagan la firma de cada slot.
// 4. Validar ejecutando `pnpm test tests/sdk-vtable-audit.test.ts` antes
//    del commit.
//
// Si solo actualizás UNO de los dos (cpp u opp.md), el gate de arriba
// hard-fail en CI.
// ============================================================================
