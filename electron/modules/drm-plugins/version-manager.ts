// ============================================================================
// electron/modules/drm-plugins/version-manager.ts
// Version-Specific DRM Handling
// Tracks game versions and allows version-specific removal instructions
// Community database: game_id + version + works_with alternatives
// ============================================================================

import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import { logger } from '../../logger'
import type { VersionSpecificData } from './types'

/**
 * Version-specific DRM removal instruction
 */
export interface DrmVersionInstruction {
  gameId: string
  gameName: string
  version: string
  drmTypes: string[]
  removable: boolean
  worksWithOnlineFix: boolean
  worksWithGog: boolean
  alternatives: string[] // ['OnlineFix', 'GOG', 'patch-1.2.3']
  notes?: string
  lastVerified: string
  verifiedBy: string
  confidence: number // 0-100
  communityContributed: boolean
}

/**
 * Version Manager
 * Manages version-specific DRM handling data
 */
class VersionManager {
  private dataDir: string
  private dbFile: string
  private database: Map<string, DrmVersionInstruction[]> = new Map()

  constructor() {
    this.dataDir = path.join(app.getPath('userData'), '.data')
    this.dbFile = path.join(this.dataDir, 'game-version-drm.json')
    this.loadDatabase()
  }

  /**
   * Load version database from disk
   */
  private loadDatabase(): void {
    try {
      if (!fs.existsSync(this.dbFile)) {
        logger.info('[Version Manager] No version database found, creating new', 'drm')
        this.initializeDefaultDatabase()
        return
      }

      const content = fs.readFileSync(this.dbFile, 'utf-8')
      const data = JSON.parse(content) as Record<string, DrmVersionInstruction[]>

      for (const [gameId, instructions] of Object.entries(data)) {
        this.database.set(gameId, instructions)
      }

      logger.info(`[Version Manager] Loaded ${this.database.size} game entries from database`, 'drm')
    } catch (err) {
      logger.warn(
        `[Version Manager] Failed to load database: ${err instanceof Error ? err.message : 'unknown'}`,
        'drm'
      )
      this.initializeDefaultDatabase()
    }
  }

  /**
   * Initialize with default community data
   */
  private initializeDefaultDatabase(): void {
    // Seed with known community data
    const defaultData: Record<string, DrmVersionInstruction[]> = {
      '289650': [
        // Witcher 3
        {
          gameId: '289650',
          gameName: 'The Witcher 3: Wild Hunt',
          version: '1.31',
          drmTypes: ['Denuvo'],
          removable: false,
          worksWithOnlineFix: false,
          worksWithGog: true,
          alternatives: ['GOG version', 'Wait for patch removal'],
          notes: 'Denuvo present. GOG version is DRM-free.',
          lastVerified: new Date().toISOString().split('T')[0],
          verifiedBy: 'Y-Core Community',
          confidence: 95,
          communityContributed: true,
        },
      ],
      '570': [
        // Deus Ex Human Revolution
        {
          gameId: '570',
          gameName: 'Deus Ex: Human Revolution',
          version: '1.0',
          drmTypes: ['SecuROM', 'Denuvo'],
          removable: true,
          worksWithOnlineFix: true,
          worksWithGog: true,
          alternatives: ['OnlineFix patch', 'GOG version'],
          notes: 'SecuROM can be removed safely. Denuvo cannot.',
          lastVerified: new Date().toISOString().split('T')[0],
          verifiedBy: 'Y-Core Community',
          confidence: 90,
          communityContributed: true,
        },
      ],
    }

    this.database = new Map(Object.entries(defaultData))
    this.saveDatabase()
  }

  /**
   * Save database to disk
   */
  private saveDatabase(): void {
    try {
      if (!fs.existsSync(this.dataDir)) {
        fs.mkdirSync(this.dataDir, { recursive: true })
      }

      const data: Record<string, DrmVersionInstruction[]> = {}
      for (const [gameId, instructions] of this.database) {
        data[gameId] = instructions
      }

      fs.writeFileSync(this.dbFile, JSON.stringify(data, null, 2), 'utf-8')
      logger.info('[Version Manager] Database saved', 'drm')
    } catch (err) {
      logger.warn(
        `[Version Manager] Failed to save database: ${err instanceof Error ? err.message : 'unknown'}`,
        'drm'
      )
    }
  }

  /**
   * Get version instructions for a game
   */
  getInstructions(gameId: string, version?: string): DrmVersionInstruction[] {
    const instructions = this.database.get(gameId)
    if (!instructions) {
      return []
    }

    if (!version) {
      return instructions
    }

    // Find exact or closest version match
    const exact = instructions.find((i) => i.version === version)
    if (exact) {
      return [exact]
    }

    // Sort by closeness to requested version
    return instructions.sort((a, b) => {
      const aDist = this.versionDistance(a.version, version)
      const bDist = this.versionDistance(b.version, version)
      return aDist - bDist
    })
  }

  /**
   * Get best instruction for a game/version
   */
  getBestInstruction(gameId: string, version?: string): DrmVersionInstruction | null {
    const instructions = this.getInstructions(gameId, version)
    if (instructions.length === 0) {
      return null
    }

    // Sort by confidence descending
    return instructions.sort((a, b) => b.confidence - a.confidence)[0]
  }

  /**
   * Add or update version instruction
   * Allows community contributions
   */
  addInstruction(instruction: DrmVersionInstruction): void {
    const existing = this.database.get(instruction.gameId) || []
    const index = existing.findIndex(
      (i) => i.version === instruction.version && i.gameName === instruction.gameName
    )

    if (index >= 0) {
      // Update existing
      existing[index] = instruction
    } else {
      // Add new
      existing.push(instruction)
    }

    this.database.set(instruction.gameId, existing)
    this.saveDatabase()

    logger.info(
      `[Version Manager] Added instruction for ${instruction.gameName} v${instruction.version}`,
      'drm'
    )
  }

  /**
   * Batch add instructions
   */
  addInstructions(instructions: DrmVersionInstruction[]): void {
    for (const instruction of instructions) {
      this.addInstruction(instruction)
    }
  }

  /**
   * Remove instruction
   */
  removeInstruction(gameId: string, version: string): void {
    const instructions = this.database.get(gameId)
    if (!instructions) {
      return
    }

    this.database.set(
      gameId,
      instructions.filter((i) => i.version !== version)
    )
    this.saveDatabase()
  }

  /**
   * Export database for backup/sharing
   */
  exportDatabase(): string {
    const data: Record<string, DrmVersionInstruction[]> = {}
    for (const [gameId, instructions] of this.database) {
      data[gameId] = instructions
    }
    return JSON.stringify(data, null, 2)
  }

  /**
   * Import community database
   */
  importDatabase(jsonContent: string): { success: boolean; message: string } {
    try {
      const data = JSON.parse(jsonContent) as Record<string, DrmVersionInstruction[]>
      const initialSize = this.database.size

      for (const [gameId, instructions] of Object.entries(data)) {
        const existing = this.database.get(gameId) || []

        // Merge, prioritizing community contributions with higher confidence
        for (const newInstruction of instructions) {
          const existingIndex = existing.findIndex(
            (i) => i.version === newInstruction.version
          )
          if (existingIndex >= 0) {
            // Replace if new has higher confidence
            if (newInstruction.confidence > existing[existingIndex].confidence) {
              existing[existingIndex] = newInstruction
            }
          } else {
            existing.push(newInstruction)
          }
        }

        this.database.set(gameId, existing)
      }

      this.saveDatabase()

      const newSize = this.database.size
      return {
        success: true,
        message: `Imported database: ${newSize - initialSize} new games, ${this.getTotalInstructions()} total instructions`,
      }
    } catch (err) {
      return {
        success: false,
        message: err instanceof Error ? err.message : 'Import failed',
      }
    }
  }

  /**
   * Get all games with instructions
   */
  getAllGames(): Array<{ gameId: string; count: number }> {
    const result: Array<{ gameId: string; count: number }> = []
    for (const [gameId, instructions] of this.database) {
      result.push({ gameId, count: instructions.length })
    }
    return result
  }

  /**
   * Get total instruction count
   */
  getTotalInstructions(): number {
    let total = 0
    for (const instructions of this.database.values()) {
      total += instructions.length
    }
    return total
  }

  /**
   * Calculate version distance (simple: split by dots and compare)
   */
  private versionDistance(v1: string, v2: string): number {
    const parts1 = v1.split('.').map((p) => parseInt(p, 10))
    const parts2 = v2.split('.').map((p) => parseInt(p, 10))

    let distance = 0
    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
      const p1 = parts1[i] || 0
      const p2 = parts2[i] || 0
      distance += Math.abs(p1 - p2) * Math.pow(10, 2 - i)
    }

    return distance
  }
}

// Export singleton instance
export const versionManager = new VersionManager()
