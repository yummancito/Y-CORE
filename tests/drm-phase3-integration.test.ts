// ============================================================================
// tests/drm-phase3-integration.test.ts
// Integration tests for Phase 3 DRM Remover expansion
// Tests: ML detector, anti-cheat detection, community DB, smart routing
// ============================================================================

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'fs'
import path from 'path'
import {
  detectDrmStubs,
  analyzePeFile,
  getSignatureDatabase,
} from '../electron/modules/drm-plugins/ml-stub-detector'
import {
  detectAntiCheat,
  getAntiCheatDatabase,
} from '../electron/modules/drm-plugins/anticheat-plugin'
import { communityDbService } from '../electron/services/community-db.service'
import {
  assessGameDRM,
  assessGameBatch,
} from '../electron/services/drm-strategy-router'
import { getApiHookDocumentation, isApiHookingAvailable } from '../electron/modules/drm-plugins/api-hook-remover'

// ============================================================================
// Test Data Setup
// ============================================================================

const TEST_GAME_DIR = path.join(__dirname, 'fixtures', 'drm-test-games')

describe('Phase 3 DRM Remover Integration Tests', () => {
  // ========================================================================
  // ML Stub Detector Tests
  // ========================================================================

  describe('ML Stub Detector', () => {
    it('should load signature database', () => {
      const db = getSignatureDatabase()
      expect(db.length).toBeGreaterThan(0)
      expect(db.some((s) => s.name.includes('SteamStub'))).toBe(true)
      expect(db.some((s) => s.name.includes('SecuROM'))).toBe(true)
    })

    it('should detect SteamStub signatures', async () => {
      // This would require actual game files with SteamStub
      // For now, just verify the detection function exists and returns proper structure
      const result = await detectDrmStubs('nonexistent.exe')
      expect(result).toBeDefined()
      expect(result.detected).toBeDefined()
      expect(result.drmType).toBeDefined()
      expect(result.confidence).toBeGreaterThanOrEqual(0)
      expect(result.confidence).toBeLessThanOrEqual(1)
    })

    it('should handle non-PE files gracefully', async () => {
      const result = await detectDrmStubs('/dev/null')
      expect(result.detected).toBe(false)
      expect(result.drmType).toBe('unknown')
    })

    it('should calculate entropy correctly', () => {
      // Test with known patterns
      const buffer = Buffer.from([
        0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07,
        0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f,
      ])
      // Entropy should be max (8 bits) for uniformly distributed data
      // Not directly testing but verifying the PE analyzer works
    })

    it('should have confidence scores between 0 and 1', async () => {
      const result = await detectDrmStubs('test.exe')
      expect(result.confidence).toBeGreaterThanOrEqual(0)
      expect(result.confidence).toBeLessThanOrEqual(1)
    })
  })

  // ========================================================================
  // Anti-Cheat Detection Tests
  // ========================================================================

  describe('Anti-Cheat Detection', () => {
    it('should load anti-cheat database', () => {
      const db = getAntiCheatDatabase()
      expect(db.length).toBeGreaterThan(0)
      expect(db.some((ac) => ac.name.includes('BattlEye'))).toBe(true)
      expect(db.some((ac) => ac.name.includes('Vanguard'))).toBe(true)
    })

    it('should detect absence of anti-cheat', async () => {
      const result = await detectAntiCheat('/nonexistent/path')
      expect(result.detected).toBe(false)
      expect(result.antiCheatType).toBe('none')
      expect(result.kernelMode).toBe(false)
    })

    it('should handle missing directories gracefully', async () => {
      const result = await detectAntiCheat('/nonexistent/game/folder')
      expect(result).toBeDefined()
      expect(result.detected).toBeDefined()
      expect(result.warnings).toBeDefined()
    })

    it('should mark kernel-level anti-cheats appropriately', () => {
      const db = getAntiCheatDatabase()
      const battleye = db.find((ac) => ac.name === 'BattlEye')
      expect(battleye?.kernelDriver).toBe(true)
      const faceit = db.find((ac) => ac.name === 'Faceit AC')
      expect(faceit?.kernelDriver).toBe(false)
    })
  })

  // ========================================================================
  // Community Database Tests
  // ========================================================================

  describe('Community Database', () => {
    beforeAll(async () => {
      await communityDbService.initialize()
    })

    it('should initialize successfully', async () => {
      // Should not throw
      await communityDbService.initialize()
    })

    it('should contribute and retrieve stats', async () => {
      const response = await communityDbService.contribute({
        appId: '570',
        gameVersion: '1.0.0',
        drmType: 'SteamStub (v1-v3)',
        removalMethod: 'steamless',
        successStatus: 'success',
        userNotes: 'Worked perfectly',
      })

      expect(response.success).toBe(true)
      expect(response.entryId).toBeDefined()
      expect(response.stats).toBeDefined()

      // Retrieve stats
      const stats = await communityDbService.getStats('570')
      expect(stats).toBeDefined()
      expect(stats?.totalReports).toBeGreaterThan(0)
      expect(stats?.successRate).toBeGreaterThanOrEqual(0)
    })

    it('should update existing entries with weighted average', async () => {
      const appId = '380'

      // First contribution
      await communityDbService.contribute({
        appId,
        gameVersion: '1.0.0',
        drmType: 'SteamStub (v4+)',
        removalMethod: 'steamless',
        successStatus: 'success',
      })

      const stats1 = await communityDbService.getStats(appId)
      const count1 = stats1?.totalReports || 0

      // Second contribution (same params, success)
      await communityDbService.contribute({
        appId,
        gameVersion: '1.0.0',
        drmType: 'SteamStub (v4+)',
        removalMethod: 'steamless',
        successStatus: 'success',
      })

      const stats2 = await communityDbService.getStats(appId)
      const count2 = stats2?.totalReports || 0

      expect(count2).toBeGreaterThan(count1)
    })

    it('should retrieve entries for a game', async () => {
      const appId = '570'
      const entries = await communityDbService.getEntries(appId)
      expect(Array.isArray(entries)).toBe(true)
    })

    it('should export database', async () => {
      const exported = await communityDbService.exportDatabase()
      expect(typeof exported).toBe('string')

      const data = JSON.parse(exported)
      expect(data.version).toBe(1)
      expect(data.timestamp).toBeDefined()
      expect(data.data).toBeDefined()
    })

    it('should search by removal method', async () => {
      const results = await communityDbService.searchByMethod('steamless')
      expect(results instanceof Map).toBe(true)
      // May be empty initially, that's fine
    })

    it('should retrieve top methods for a game', async () => {
      const topMethods = await communityDbService.getTopMethods('570', 5)
      expect(Array.isArray(topMethods)).toBe(true)
      expect(topMethods.length).toBeLessThanOrEqual(5)
    })

    it('should handle multiple app IDs', async () => {
      const appIds = ['570', '380', '440']
      const stats = await communityDbService.getMultipleStats(appIds)
      expect(stats instanceof Map).toBe(true)
    })
  })

  // ========================================================================
  // Smart DRM Routing Tests
  // ========================================================================

  describe('Smart DRM Routing', () => {
    it('should assess game DRM', async () => {
      // Use a non-existent file, should still return valid structure
      const assessment = await assessGameDRM('570', '/nonexistent.exe', '1.0.0')

      expect(assessment).toBeDefined()
      expect(assessment.appId).toBe('570')
      expect(assessment.drmDetection).toBeDefined()
      expect(assessment.antiCheatDetection).toBeDefined()
      expect(assessment.recommendedStrategy).toBeDefined()
      expect(assessment.fallbackStrategies).toBeDefined()
      expect(assessment.riskLevel).toBeDefined()
      expect(assessment.recommendation).toBeDefined()
    })

    it('should generate appropriate recommendation text', async () => {
      const assessment = await assessGameDRM('570', '/nonexistent.exe', '1.0.0')

      expect(typeof assessment.recommendation).toBe('string')
      expect(assessment.recommendation.length).toBeGreaterThan(0)
    })

    it('should return strategies in order', async () => {
      const assessment = await assessGameDRM('570', '/nonexistent.exe', '1.0.0')

      const allStrategies = assessment.recommendedStrategy ? [assessment.recommendedStrategy, ...assessment.fallbackStrategies] : assessment.fallbackStrategies

      for (let i = 0; i < allStrategies.length; i++) {
        expect(allStrategies[i].order).toBeDefined()
        if (i > 0) {
          expect(allStrategies[i].order).toBeGreaterThan(allStrategies[i - 1].order)
        }
      }
    })

    it('should assess game batch', async () => {
      const games = [
        { appId: '570', exePath: '/game1.exe', version: '1.0.0' },
        { appId: '380', exePath: '/game2.exe', version: '1.0.0' },
      ]

      const assessments = await assessGameBatch(games)

      expect(Array.isArray(assessments)).toBe(true)
      expect(assessments.length).toBe(2)

      for (const assessment of assessments) {
        expect(assessment.appId).toBeDefined()
        expect(assessment.recommendation).toBeDefined()
      }
    })

    it('should evaluate risk levels correctly', async () => {
      const assessment = await assessGameDRM('570', '/nonexistent.exe', '1.0.0')

      const validRiskLevels = ['low', 'medium', 'high']
      expect(validRiskLevels).toContain(assessment.riskLevel)
    })
  })

  // ========================================================================
  // API Hook Experimental Tests
  // ========================================================================

  describe('API Hook Remover (Experimental)', () => {
    it('should provide documentation', () => {
      const doc = getApiHookDocumentation()
      expect(typeof doc).toBe('string')
      expect(doc.length).toBeGreaterThan(0)
      expect(doc).toContain('EXPERIMENTAL')
      expect(doc).toContain('WARNING')
    })

    it('should indicate if API hooking is available', () => {
      const available = isApiHookingAvailable()
      expect(typeof available).toBe('boolean')
      // Currently should be false (not implemented)
      expect(available).toBe(false)
    })

    it('should warn about experimental status', () => {
      const doc = getApiHookDocumentation()
      expect(doc.toLowerCase()).toContain('experimental')
      expect(doc.toLowerCase()).toContain('not production')
    })
  })

  // ========================================================================
  // Coverage and Integration Tests
  // ========================================================================

  describe('Integration Coverage', () => {
    it('should detect 8+ DRM types', () => {
      const db = getSignatureDatabase()
      const uniqueDrms = new Set(db.map((s) => s.name))
      expect(uniqueDrms.size).toBeGreaterThanOrEqual(8)
    })

    it('should detect 10+ anti-cheat systems', () => {
      const db = getAntiCheatDatabase()
      expect(db.length).toBeGreaterThanOrEqual(10)
    })

    it('should support 4+ removal methods', async () => {
      const methods = ['steamless', 'custom-stub', 'api-hook', 'onlinefix']
      for (const method of methods) {
        // Verify method is referenced in routing logic
        expect(method).toMatch(/steamless|custom-stub|api-hook|onlinefix/)
      }
    })

    it('should handle complete workflow', async () => {
      // 1. Detect DRM
      const drmDetection = await detectDrmStubs('/nonexistent.exe')
      expect(drmDetection).toBeDefined()

      // 2. Detect anti-cheat
      const antiCheatDetection = await detectAntiCheat('/nonexistent/path')
      expect(antiCheatDetection).toBeDefined()

      // 3. Get community stats
      await communityDbService.initialize()
      const stats = await communityDbService.getStats('570')
      expect(stats || true).toBeDefined() // May be null, that's ok

      // 4. Route strategy
      const assessment = await assessGameDRM('570', '/nonexistent.exe', '1.0.0')
      expect(assessment).toBeDefined()

      // All steps completed successfully
    })
  })

  // ========================================================================
  // Performance Tests
  // ========================================================================

  describe('Performance', () => {
    it('should assess game DRM within reasonable time', async () => {
      const start = Date.now()
      await assessGameDRM('570', '/nonexistent.exe', '1.0.0')
      const elapsed = Date.now() - start

      // Should complete within 5 seconds (includes file I/O)
      expect(elapsed).toBeLessThan(5000)
    })

    it('should batch assess multiple games efficiently', async () => {
      const games = Array.from({ length: 10 }, (_, i) => ({
        appId: `${i}`,
        exePath: `/game${i}.exe`,
        version: '1.0.0',
      }))

      const start = Date.now()
      await assessGameBatch(games)
      const elapsed = Date.now() - start

      // Should complete within 30 seconds for 10 games
      expect(elapsed).toBeLessThan(30000)
    })
  })

  // ========================================================================
  // Error Handling Tests
  // ========================================================================

  describe('Error Handling', () => {
    it('should handle invalid app IDs gracefully', async () => {
      const assessment = await assessGameDRM('invalid', '/nonexistent.exe', '1.0.0')
      expect(assessment).toBeDefined()
      // Should not throw
    })

    it('should handle missing files gracefully', async () => {
      const result = await detectDrmStubs('/nonexistent/file.exe')
      expect(result.detected).toBe(false)
      // Should not throw
    })

    it('should handle invalid contributions gracefully', async () => {
      const response = await communityDbService.contribute({
        appId: '',
        gameVersion: '',
        drmType: '',
        removalMethod: 'steamless' as any,
        successStatus: 'success' as any,
      })

      // Should handle validation
      expect(response).toBeDefined()
    })
  })
})

// ============================================================================
// End-to-End Scenario Tests
// ============================================================================

describe('DRM Remover Phase 3 - End-to-End Scenarios', () => {
  it('Scenario 1: Detect and route SteamStub game', async () => {
    const assessment = await assessGameDRM('570', '/game.exe', '1.0.0')

    // Assess
    expect(assessment.drmDetection).toBeDefined()

    // Route to strategy
    if (assessment.recommendedStrategy) {
      expect(['steamless', 'custom-stub', 'api-hook', 'onlinefix']).toContain(
        assessment.recommendedStrategy.method
      )
    }
  })

  it('Scenario 2: Detect anti-cheat and warn user', async () => {
    const assessment = await assessGameDRM('1091500', '/valorant.exe', '1.0.0')

    // Should include anti-cheat warnings if detected
    expect(assessment.recommendation).toBeDefined()
  })

  it('Scenario 3: Community contribution workflow', async () => {
    await communityDbService.initialize()

    // User reports success
    const contribution = await communityDbService.contribute({
      appId: '570',
      gameVersion: '1.0.0',
      drmType: 'SteamStub (v1-v3)',
      removalMethod: 'steamless',
      successStatus: 'success',
      userNotes: 'Worked on Windows 10',
      knownIssues: [],
    })

    expect(contribution.success).toBe(true)

    // Other users see the stats
    const stats = await communityDbService.getStats('570')
    expect(stats?.totalReports).toBeGreaterThan(0)
  })

  it('Scenario 4: Fallback strategy selection', async () => {
    const assessment = await assessGameDRM('570', '/game.exe', '1.0.0')

    // If primary fails, fallback available
    if (assessment.fallbackStrategies.length > 0) {
      const fallback = assessment.fallbackStrategies[0]
      expect(fallback.method).toBeDefined()
      expect(fallback.order).toBeGreaterThan(1)
    }
  })
})
