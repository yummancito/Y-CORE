// ============================================================================
// electron/modules/drm-plugins/denuvo-plugin.ts
// Denuvo DRM Detection Plugin (Detection-Only)
// NO removal attempted (DMCA legal concerns)
// Shows warning + alternatives instead
// ============================================================================

import fs from 'fs'
import path from 'path'
import { logger } from '../../logger'
import type { DrmPlugin, DrmDetectionResult, DrmRemovalResult } from './types'
import { readPeHeader, hasPeSection } from './pe-parser'

// Denuvo-specific PE sections
const DENUVO_SECTIONS = ['.vmp0', '.vmp1', '.text', '.rdata']

// Denuvo signature patterns
const DENUVO_SIGNATURES = [
  Buffer.from('Denuvo', 'utf8'),
  Buffer.from('AxProtector', 'utf8'),
  Buffer.from('denuvo', 'utf8'),
]

/**
 * Denuvo Plugin
 * Detects Denuvo DRM but does not attempt removal (legal/DMCA concerns)
 * Instead shows warnings and alternatives
 */
export const denuvoPlugin: DrmPlugin = {
  id: 'denuvo',
  name: 'Denuvo',
  version: '1.0.0',
  drmTypes: ['Denuvo', 'VMProtect'],
  supportedPlatforms: ['windows'],

  async detect(exePath: string, _gameDir: string): Promise<DrmDetectionResult> {
    try {
      // Check if executable exists
      if (!fs.existsSync(exePath)) {
        return {
          detected: false,
          drmTypes: [],
          platformSupported: false,
        }
      }

      // Check PE header
      const peHeader = readPeHeader(exePath)
      if (!peHeader) {
        return {
          detected: false,
          drmTypes: [],
          platformSupported: true,
        }
      }

      // Check for Denuvo-specific sections
      const hasDenuvoSection = DENUVO_SECTIONS.some((section) => hasPeSection(exePath, section))

      if (!hasDenuvoSection) {
        return {
          detected: false,
          drmTypes: [],
          platformSupported: true,
        }
      }

      // Try to extract Denuvo version
      const version = extractDenuvoVersion(exePath)

      return {
        detected: true,
        drmTypes: [
          {
            type: 'Denuvo',
            version,
            location: exePath,
            confidence: 85,
            canRemove: false, // Cannot remove due to legal concerns
            riskLevel: 'risky', // Even attempting removal is risky legally
          },
        ],
        platformSupported: true,
      }
    } catch (err) {
      logger.warn(
        `[Denuvo Plugin] Detection error: ${err instanceof Error ? err.message : 'unknown'}`,
        'drm'
      )
      return {
        detected: false,
        drmTypes: [],
        platformSupported: true,
      }
    }
  },

  async remove(_exePath: string, _gameDir: string): Promise<DrmRemovalResult> {
    // Denuvo removal is not supported due to DMCA and legal concerns
    return {
      success: false,
      message:
        'Denuvo removal is not available in Y-Core. ' +
        'Attempting to remove Denuvo may violate DMCA protections. ' +
        'Try these alternatives instead: ' +
        '1) Purchase from GOG (DRM-free), ' +
        '2) Wait for old versions that may lack Denuvo, ' +
        '3) Use community patches (OnlineFix) if available',
      drmType: 'Denuvo',
      hadDrm: true,
      errorKey: 'denuvo.error.removalNotSupported',
      suggestions: [
        'Purchase from GOG (often DRM-free)',
        'Look for GOG version in community databases',
        'Wait for patches that may remove Denuvo',
        'Use OnlineFix if available',
        'Check PCGamingWiki for alternatives',
      ],
    }
  },
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Extract Denuvo version from executable
 * Looks for version markers in PE sections
 */
function extractDenuvoVersion(exePath: string): string | undefined {
  try {
    // Read sections that might contain version info
    const buffer = Buffer.alloc(8192)
    const fd = fs.openSync(exePath, 'r')
    fs.readSync(fd, buffer, 0, 8192, 0)
    fs.closeSync(fd)

    // Common Denuvo version patterns: "v5.x", "v6.x", "v7.x"
    const content = buffer.toString('utf8', 0, Math.min(buffer.length, 4096))
    const versionMatch = content.match(/(?:Denuvo|AxProtector|VMProtect)\s*v?(\d+\.\d+)/i)

    if (versionMatch) {
      return versionMatch[1]
    }

    return undefined
  } catch (err) {
    logger.warn(
      `[Denuvo Plugin] Version extraction failed: ${err instanceof Error ? err.message : 'unknown'}`,
      'drm'
    )
    return undefined
  }
}

/**
 * Load Denuvo whitelist from data file
 * Whitelist contains community-contributed information about working versions
 */
export interface DenuvoWhitelistEntry {
  gameId: string
  gameTitle: string
  denuvoVersion: string
  condition: 'old-release' | 'regional' | 'pre-denuvo'
  worksWithOnlineFix: boolean
  gogAvailable: boolean
  notes: string
  lastVerified: string
  verifiedBy: string
}

export function loadDenuvoWhitelist(): DenuvoWhitelistEntry[] {
  try {
    const whitelistPath = path.join(__dirname, '../../data/denuvo-whitelist.json')
    if (!fs.existsSync(whitelistPath)) {
      return []
    }

    const content = fs.readFileSync(whitelistPath, 'utf-8')
    return JSON.parse(content) as DenuvoWhitelistEntry[]
  } catch (err) {
    logger.warn(`[Denuvo Plugin] Failed to load whitelist: ${err instanceof Error ? err.message : 'unknown'}`, 'drm')
    return []
  }
}

/**
 * Find whitelist entry for a game
 */
export function findWhitelistEntry(gameId: string): DenuvoWhitelistEntry | undefined {
  const whitelist = loadDenuvoWhitelist()
  return whitelist.find((entry) => entry.gameId === gameId)
}
