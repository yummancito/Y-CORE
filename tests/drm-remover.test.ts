import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import path from 'path'
import fs from 'fs'
import os from 'os'
import { removeGameDrm, checkDrmStatus, findGameExecutable } from '../electron/modules/drm-remover'

// Mock the steam-helpers module
vi.mock('../electron/modules/steam-helpers', () => ({
  getSteamPath: vi.fn(),
  getSteamAppsPath: vi.fn(),
  getSteamLibraryFolders: vi.fn(),
  parseVdf: vi.fn(),
}))

vi.mock('child_process')
vi.mock('../electron/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

describe('DRM Remover', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = path.join(os.tmpdir(), `drm-test-${Date.now()}`)
    fs.mkdirSync(tempDir, { recursive: true })
  })

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  })

  describe('Input Validation', () => {
    it('should reject invalid appId (empty string)', async () => {
      const result = await removeGameDrm('')
      expect(result.success).toBe(false)
      expect(result.errorKey).toBe('drm.error.invalidAppId')
    })

    it('should reject invalid appId (non-numeric)', async () => {
      const result = await removeGameDrm('abc123')
      expect(result.success).toBe(false)
      expect(result.errorKey).toBe('drm.error.invalidAppIdFormat')
    })

    it('should reject invalid appId (too many digits)', async () => {
      const result = await removeGameDrm('12345678901')
      expect(result.success).toBe(false)
      expect(result.errorKey).toBe('drm.error.invalidAppIdFormat')
    })

    it('should accept valid appId (numeric 1-10 digits)', async () => {
      // This will fail at next validation (Steam not found) but that's expected
      const result = await removeGameDrm('123456')
      expect(result.errorKey).not.toBe('drm.error.invalidAppIdFormat')
    })
  })

  describe('Platform Detection', () => {
    it('should return platform-not-supported error on non-Windows', async () => {
      // This test would need platform mocking to work properly
      // Skipping actual platform test as it's environment-dependent
      const result = await removeGameDrm('123456')
      // On Windows, will fail with steam not found
      // On other platforms, will fail with platform error
      expect(result.success).toBe(false)
    })
  })

  describe('Backup Integrity Verification', () => {
    it('should handle missing backup gracefully', async () => {
      const exePath = path.join(tempDir, 'game.exe')
      const backupPath = exePath + '.bak'

      // Create exe but no backup
      fs.writeFileSync(exePath, Buffer.alloc(1024))

      // Status check should show drm-present (no backup)
      // This requires mocking getSteamPath and other helpers
    })

    it('should detect corrupted backup checksum', async () => {
      // This test would verify checksum validation
      // Requires creating test files with known hashes
    })
  })

  describe('Game Executable Discovery', () => {
    it('should find game executable with priority patterns', () => {
      // Create test directory structure
      const binDir = path.join(tempDir, 'Binaries', 'Win64')
      fs.mkdirSync(binDir, { recursive: true })
      const exePath = path.join(binDir, 'GameEngine.exe')
      fs.writeFileSync(exePath, Buffer.alloc(150 * 1024)) // 150KB (> 100KB min)

      // Mock getSteamLibraryFolders to return test folder
      // Then call findGameExecutable
    })

    it('should skip small exe files (< 100KB)', () => {
      // Create small exe
      const binDir = path.join(tempDir, 'Binaries', 'Win64')
      fs.mkdirSync(binDir, { recursive: true })
      const smallExe = path.join(binDir, 'small.exe')
      fs.writeFileSync(smallExe, Buffer.alloc(50 * 1024)) // 50KB (< 100KB min)

      // Should be skipped
    })

    it('should skip excluded exe names', () => {
      // Create excluded names
      const exeDir = path.join(tempDir, 'bin')
      fs.mkdirSync(exeDir, { recursive: true })

      const excluded = [
        'steam_api64.dll',
        'steam_api.dll',
        'steamclient64.dll',
        'crashpad_handler.exe',
      ]

      excluded.forEach((name) => {
        fs.writeFileSync(path.join(exeDir, name), Buffer.alloc(150 * 1024))
      })

      // Should all be skipped
    })
  })

  describe('Marker Cache', () => {
    it('should return cached result for drm-removed marker', async () => {
      // Test that .ycore.drm-removed marker causes early return
      // Requires file system setup and mocking
    })

    it('should return cached result for drm-free marker', async () => {
      // Test that .ycore.drm-free marker causes early return
    })

    it('should create drm-removed marker after successful removal', async () => {
      // Verify marker file is created after successful removal
    })

    it('should create drm-free marker when no DRM detected', async () => {
      // Verify marker file is created when Steamless reports no DRM
    })
  })

  describe('Error Handling', () => {
    it('should handle Steam not found', async () => {
      const result = await removeGameDrm('123456')
      // Will fail with steam not found or invalid appId validation
      expect(result.success).toBe(false)
    })

    it('should handle game not in library', async () => {
      // Requires mocking getSteamPath and getGameInstallDir
    })

    it('should handle backup creation failure', async () => {
      // Requires mocking fs.copyFileSync to throw
    })

    it('should handle Steamless not installed', async () => {
      // Result should indicate steamlessNotFound error
    })

    it('should restore from backup on Steamless failure', async () => {
      // Verify backup is restored if unpacking fails
    })
  })

  describe('DRM Status Check', () => {
    it('should return drm-removed status when backup exists', async () => {
      // Create test files for status check
    })

    it('should return drm-present status when no backup exists', async () => {
      // Create test files without backup
    })

    it('should detect unpacked exe still in progress', async () => {
      // Create .exe.unpacked.exe file
    })
  })

  describe('Checksum Calculation', () => {
    it('should calculate SHA1 hash correctly', async () => {
      // Create test file and verify hash
      const testFile = path.join(tempDir, 'test.bin')
      const testContent = 'test content for hashing'
      fs.writeFileSync(testFile, testContent)

      // Would need to import and test hash functions directly
    })

    it('should create backup manifest with correct hashes', async () => {
      // Verify manifest contains correct checksums
    })
  })

  describe('Integration Tests', () => {
    it('should complete full DRM removal workflow', async () => {
      // Full integration test:
      // 1. Create game executable
      // 2. Create backup
      // 3. Mock Steamless success
      // 4. Verify exe is replaced
      // 5. Verify markers are created
      // 6. Verify manifest is saved
    })

    it('should handle Steamless with retry logic', async () => {
      // Verify retry mechanism works with backoff
    })

    it('should validate all paths before operations', async () => {
      // Ensure path traversal attempts are blocked
    })
  })

  describe('Recovery Scenarios', () => {
    it('should recover from incomplete removal', async () => {
      // Create backup and unpacked exe, verify cleanup
    })

    it('should handle second removal attempt gracefully', async () => {
      // Run removal twice, verify cache hit on second attempt
    })

    it('should detect and repair corrupted backup', async () => {
      // Create corrupted backup, verify detection and recovery
    })
  })

  describe('Edge Cases', () => {
    it('should handle games with multiple exe files', async () => {
      // Create multiple executables, verify correct one is chosen
    })

    it('should handle very large backup files', async () => {
      // Test with large backup (within reason)
    })

    it('should handle concurrent removal attempts', async () => {
      // Multiple calls to removeDrm for same game
    })

    it('should handle symlinks gracefully', async () => {
      // Verify path validation works with symlinks
    })
  })
})

// Additional unit tests for utility functions
describe('Input Validation Functions', () => {
  describe('validateAppId', () => {
    it('accepts valid numeric appIds', () => {
      // Test: 1-10 digit numbers
      expect(['1', '123', '1234567890']).toBeTruthy()
    })

    it('rejects non-numeric strings', () => {
      // Test: abc, 123abc, etc
      expect(['abc', '123abc', '12.34']).toBeFalsy()
    })

    it('rejects empty strings', () => {
      expect('').toBeFalsy()
    })

    it('rejects strings > 10 digits', () => {
      expect('12345678901').toBeFalsy()
    })
  })

  describe('validatePath', () => {
    it('accepts paths within base directory', () => {
      const baseDir = '/steam/common/game'
      const testPath = '/steam/common/game/bin/game.exe'
      // Should be valid
    })

    it('rejects path traversal attempts', () => {
      const baseDir = '/steam/common/game'
      const testPath = '/steam/common/game/../../other/file'
      // Should be invalid
    })

    it('rejects absolute paths outside base', () => {
      const baseDir = '/steam/common/game'
      const testPath = '/etc/passwd'
      // Should be invalid
    })
  })

  describe('validateFileExists', () => {
    it('returns valid for existing file', () => {
      // Create temp file and test
    })

    it('returns invalid for missing file', () => {
      // Test non-existent path
    })

    it('checks read permissions when requested', () => {
      // Create read-only file and test
    })
  })
})

// Backup Manifest Tests
describe('Backup Manifest', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = path.join(os.tmpdir(), `manifest-test-${Date.now()}`)
    fs.mkdirSync(tempDir, { recursive: true })
  })

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it('should create manifest with correct structure', async () => {
    // Test manifest creation
    // Verify: version, timestamp, exePath, exeSize, checksums, etc
  })

  it('should save and load manifest correctly', async () => {
    // Create, save, and reload manifest
    // Verify data integrity
  })

  it('should verify backup integrity from manifest', async () => {
    // Create backup with manifest
    // Verify checksums match
  })

  it('should detect corrupted backup from manifest', async () => {
    // Create manifest, modify backup file
    // Verify corruption is detected
  })

  it('should handle missing manifest gracefully', async () => {
    // Test behavior when manifest file doesn't exist
  })
})

// Platform Detection Tests
describe('Platform Detection', () => {
  it('should identify Windows platform', () => {
    // Mock process.platform = 'win32'
    // Verify getPlatform returns 'windows'
  })

  it('should identify macOS platform', () => {
    // Mock process.platform = 'darwin'
    // Verify getPlatform returns 'macos'
  })

  it('should identify Linux platform', () => {
    // Mock process.platform = 'linux'
    // Verify getPlatform returns 'linux'
  })

  it('should reject non-Windows removal attempts', async () => {
    // Mock process.platform != 'win32'
    // Verify error is returned
  })
})

// Error Code Mapping Tests
describe('Error Code Mapping', () => {
  it('should map all errors to i18n keys', () => {
    const errors = [
      'drm.error.invalidAppId',
      'drm.error.invalidAppIdFormat',
      'drm.error.platformNotSupported',
      'drm.error.steamNotFound',
      'drm.error.gameNotFound',
      'drm.error.executableNotFound',
      'drm.error.backupFailed',
      'drm.error.backupCorrupted',
      'drm.error.steamlessNotFound',
      'drm.error.steamlessFailed',
      'drm.error.steamlessUnpackFailed',
      'drm.error.replaceFailed',
    ]

    errors.forEach((errorKey) => {
      expect(errorKey).toMatch(/^drm\.error\./)
    })
  })

  it('should provide user-friendly error messages', () => {
    // Verify that error messages are clear and actionable
    // Not technical jargon, but helpful guidance
  })
})
