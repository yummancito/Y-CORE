import { describe, it, expect } from 'vitest'
import {
  getCompatibility,
  getCompatibilityReason,
  getLauncherInfo,
  type CompatibilityStatus,
} from '../src/lib/onlinefix-compatibility'

describe('onlinefix-compatibility', () => {
  describe('getCompatibility', () => {
    it('returns "compatible" for known compatible games', () => {
      const result = getCompatibility('892970') // Valheim
      expect(result.status).toBe('compatible')
      expect(result.name).toBe('Valheim')
    })

    it('returns "incompatible" for known incompatible games', () => {
      const result = getCompatibility('578080') // PUBG
      expect(result.status).toBe('incompatible')
      expect(result.reason).toBe('dedicated_servers')
    })

    it('returns "compatible" for Phasmophobia', () => {
      const result = getCompatibility('739630')
      expect(result.status).toBe('compatible')
    })

    it('returns "unknown" for unlisted AppIDs', () => {
      const result = getCompatibility('999999999')
      expect(result.status).toBe('unknown')
      expect(result.name).toBe('')
    })

    it('returns "unknown" for empty string appId', () => {
      const result = getCompatibility('')
      expect(result.status).toBe('unknown')
    })

    it('handles all incompatible games correctly', () => {
      const incompatibleAppIds: string[] = [
        '1336200', '1366540',
        '1646240', '2378290', '962130', '270880', '239140',
        '578080', '444090', '813780', '1089980', '602280',
        '548430', '774171', '289070',
      ]
      for (const appId of incompatibleAppIds) {
        const result = getCompatibility(appId)
        expect(result.status, `appId ${appId} expected incompatible`).toBe('incompatible')
        expect(result.reason, `appId ${appId} should have a reason`).toBeDefined()
      }
    })

    it('handles all compatible games correctly', () => {
      const compatibleAppIds = [
        '892970', '1086320', '367520', '460930', '322330',
        '105600', '274850', '242760', '677120', '506540',
        '692890', '40900', '227600', '410370',
      ]
      for (const appId of compatibleAppIds) {
        const result = getCompatibility(appId)
        expect(result.status).toBe('compatible')
      }
    })

    it('does not return compatible for an incompatible game', () => {
      const result = getCompatibility('578080') // PUBG
      expect(result.status).not.toBe('compatible')
    })

    it('does not return incompatible for a compatible game', () => {
      const result = getCompatibility('892970') // Valheim
      expect(result.status).not.toBe('incompatible')
    })
  })

  describe('getCompatibilityReason', () => {
    it('returns human-readable text for dedicated_servers', () => {
      expect(getCompatibilityReason('dedicated_servers')).toBe('Uses dedicated servers')
    })

    it('returns human-readable text for photon', () => {
      expect(getCompatibilityReason('photon')).toBe('Uses Photon networking')
    })

    it('returns human-readable text for authentication', () => {
      expect(getCompatibilityReason('authentication')).toBe('Requires external authentication')
    })

    it('returns human-readable text for microsoft_auth', () => {
      expect(getCompatibilityReason('microsoft_auth')).toBe('Requires Microsoft account')
    })

    it('returns human-readable text for eos', () => {
      expect(getCompatibilityReason('eos')).toBe('Uses Epic Online Services')
    })

    it('returns human-readable text for compatibility', () => {
      expect(getCompatibilityReason('compatibility')).toBe('Known compatibility issues')
    })

    it('returns empty string for undefined reason', () => {
      expect(getCompatibilityReason(undefined)).toBe('')
    })

    it('returns the raw reason string for unknown reasons', () => {
      expect(getCompatibilityReason('custom_reason')).toBe('custom_reason')
    })

    it('returns human-readable text for rockstar_launcher', () => {
      expect(getCompatibilityReason('rockstar_launcher')).toBe('Rockstar Games Launcher')
    })

    it('returns human-readable text for ea_launcher', () => {
      expect(getCompatibilityReason('ea_launcher')).toBe('EA App')
    })

    it('returns human-readable text for ubisoft_connect', () => {
      expect(getCompatibilityReason('ubisoft_connect')).toBe('Ubisoft Connect')
    })

    it('returns human-readable text for battlenet', () => {
      expect(getCompatibilityReason('battlenet')).toBe('Activision / Battle.net')
    })

    it('returns human-readable text for launcher_2k', () => {
      expect(getCompatibilityReason('launcher_2k')).toBe('2K Launcher')
    })
  })

  describe('getLauncherInfo', () => {
    it('returns launcher info for GTA V Enhanced', () => {
      const info = getLauncherInfo('3240220')
      expect(info).toBeDefined()
      expect(info!.name).toBe('Grand Theft Auto V Enhanced')
      expect(info!.launcher).toBe('Rockstar Games Launcher')
    })

    it('returns launcher info for Red Dead Redemption 2', () => {
      const info = getLauncherInfo('1174180')
      expect(info).toBeDefined()
      expect(info!.launcher).toBe('Rockstar Games Launcher')
    })

    it('returns launcher info for Star Wars Jedi Survivor', () => {
      const info = getLauncherInfo('1774580')
      expect(info).toBeDefined()
      expect(info!.launcher).toBe('EA App')
    })

    it('returns launcher info for Rainbow Six Siege', () => {
      const info = getLauncherInfo('359550')
      expect(info).toBeDefined()
      expect(info!.launcher).toBe('Ubisoft Connect')
    })

    it('returns undefined for games without a launcher', () => {
      const info = getLauncherInfo('892970')
      expect(info).toBeUndefined()
    })

    it('returns undefined for unknown AppIDs', () => {
      const info = getLauncherInfo('999999999')
      expect(info).toBeUndefined()
    })

    it('returns undefined for empty string', () => {
      const info = getLauncherInfo('')
      expect(info).toBeUndefined()
    })
  })
})
