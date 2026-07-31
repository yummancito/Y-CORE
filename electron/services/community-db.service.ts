// ============================================================================
// electron/services/community-db.service.ts
// Y-CORE Community Database Service
// Manages crowdsourced DRM removal success data
// ============================================================================

import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { app } from 'electron'
import { logger } from '../logger'

// ============================================================================
// Types & Interfaces
// ============================================================================

export interface CommunityEntry {
  id: string
  appId: string
  gameVersion: string
  steamVersion?: string
  drmType: string
  removalMethod: string // 'steamless', 'custom-stub', 'api-hook', 'onlinefix'
  successStatus: 'success' | 'partial' | 'failed'
  successRate: number // 0-100
  reportCount: number
  lastUpdated: string
  userNotes: string
  riskAssessment: 'low' | 'medium' | 'high'
  recommendedVersion?: string
  knownIssues: string[]
}

export interface CommunityStats {
  appId: string
  totalReports: number
  successRate: number
  preferredMethod: string
  lastRiskLevel: 'low' | 'medium' | 'high'
  supportedVersions: string[]
}

export interface ContributionRequest {
  appId: string
  gameVersion: string
  drmType: string
  removalMethod: string
  successStatus: 'success' | 'partial' | 'failed'
  userNotes?: string
  knownIssues?: string[]
}

export interface ContributionResponse {
  success: boolean
  entryId?: string
  message: string
  stats?: CommunityStats
}

// ============================================================================
// Database Management
// ============================================================================

class CommunityDatabase {
  private dbPath: string
  private db: Map<string, CommunityEntry[]> = new Map()
  private initialized = false

  constructor() {
    const userData = app.getPath('userData')
    this.dbPath = path.join(userData, 'ycore-community-db.json')
  }

  async initialize(): Promise<void> {
    if (this.initialized) return

    try {
      if (fs.existsSync(this.dbPath)) {
        const content = await fs.promises.readFile(this.dbPath, 'utf-8')
        const data = JSON.parse(content)

        // Reconstruct Map from JSON
        for (const [appId, entries] of Object.entries(data)) {
          this.db.set(appId, entries as CommunityEntry[])
        }
      }

      this.initialized = true
      logger.info('[CommunityDB] Database initialized', 'community-db')
    } catch (err) {
      logger.error(
        `[CommunityDB] Initialization failed: ${err instanceof Error ? err.message : 'unknown'}`,
        'community-db'
      )
      this.db = new Map()
      this.initialized = true
    }
  }

  async save(): Promise<void> {
    try {
      const data: Record<string, CommunityEntry[]> = {}
      for (const [appId, entries] of this.db) {
        data[appId] = entries
      }

      await fs.promises.writeFile(this.dbPath, JSON.stringify(data, null, 2), 'utf-8')
    } catch (err) {
      logger.error(
        `[CommunityDB] Save failed: ${err instanceof Error ? err.message : 'unknown'}`,
        'community-db'
      )
    }
  }

  async addContribution(request: ContributionRequest): Promise<ContributionResponse> {
    await this.initialize()

    try {
      const entry: CommunityEntry = {
        id: this.generateId(),
        appId: request.appId,
        gameVersion: request.gameVersion,
        drmType: request.drmType,
        removalMethod: request.removalMethod,
        successStatus: request.successStatus,
        successRate: this.calculateSuccessRate(request.successStatus),
        reportCount: 1,
        lastUpdated: new Date().toISOString(),
        userNotes: request.userNotes || '',
        riskAssessment: this.assessRisk(request.removalMethod, request.successStatus),
        knownIssues: request.knownIssues || [],
      }

      // Check if similar entry exists
      const appEntries = this.db.get(request.appId) || []
      const existing = appEntries.find(
        (e) =>
          e.gameVersion === request.gameVersion &&
          e.removalMethod === request.removalMethod &&
          e.drmType === request.drmType
      )

      if (existing) {
        // Update existing entry with weighted average
        const totalReports = existing.reportCount + 1
        existing.successRate =
          (existing.successRate * existing.reportCount + entry.successRate) / totalReports
        existing.reportCount = totalReports
        existing.lastUpdated = new Date().toISOString()
        existing.knownIssues = Array.from(
          new Set([...existing.knownIssues, ...entry.knownIssues])
        )

        if (request.userNotes) {
          existing.userNotes = `${existing.userNotes}\n---\n${request.userNotes}`
        }

        entry.id = existing.id
      } else {
        // Add new entry
        appEntries.push(entry)
        this.db.set(request.appId, appEntries)
      }

      await this.save()

      const stats = await this.getStats(request.appId)
      return {
        success: true,
        entryId: entry.id,
        message: 'Contribution recorded successfully',
        stats: stats || undefined,
      }
    } catch (err) {
      logger.error(
        `[CommunityDB] Add contribution failed: ${err instanceof Error ? err.message : 'unknown'}`,
        'community-db'
      )
      return {
        success: false,
        message: `Failed to record contribution: ${err instanceof Error ? err.message : 'unknown'}`,
      }
    }
  }

  async getStats(appId: string): Promise<CommunityStats | null> {
    await this.initialize()

    const entries = this.db.get(appId)
    if (!entries || entries.length === 0) {
      return null
    }

    // Calculate aggregate stats
    const totalReports = entries.reduce((sum, e) => sum + e.reportCount, 0)
    const successRate =
      entries.reduce((sum, e) => sum + e.successRate * e.reportCount, 0) / totalReports

    // Find most popular method
    const methodCounts = new Map<string, number>()
    for (const entry of entries) {
      methodCounts.set(
        entry.removalMethod,
        (methodCounts.get(entry.removalMethod) || 0) + entry.reportCount
      )
    }
    const preferredMethod = Array.from(methodCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || 'unknown'

    // Highest risk level
    const lastRiskLevel: 'low' | 'medium' | 'high' = entries.reduce(
      (max, e) => {
        const riskOrder = { low: 0, medium: 1, high: 2 }
        return riskOrder[e.riskAssessment] > riskOrder[max] ? e.riskAssessment : max
      },
      'low' as 'low' | 'medium' | 'high'
    )

    // Supported versions
    const supportedVersions = Array.from(new Set(entries.map((e) => e.gameVersion))).sort()

    return {
      appId,
      totalReports,
      successRate: Math.round(successRate),
      preferredMethod,
      lastRiskLevel,
      supportedVersions,
    }
  }

  async getEntries(appId: string): Promise<CommunityEntry[]> {
    await this.initialize()
    return (this.db.get(appId) || []).sort((a, b) => {
      // Sort by success rate (descending) then by report count (descending)
      if (b.successRate !== a.successRate) return b.successRate - a.successRate
      return b.reportCount - a.reportCount
    })
  }

  async searchByMethod(removalMethod: string): Promise<Map<string, CommunityStats>> {
    await this.initialize()

    const results = new Map<string, CommunityStats>()

    for (const [appId, entries] of this.db) {
      const methodEntries = entries.filter((e) => e.removalMethod === removalMethod)
      if (methodEntries.length > 0) {
        const stats = await this.getStats(appId)
        if (stats) results.set(appId, stats)
      }
    }

    return results
  }

  async exportDatabase(): Promise<string> {
    await this.initialize()

    const data: Record<string, CommunityEntry[]> = {}
    for (const [appId, entries] of this.db) {
      data[appId] = entries
    }

    return JSON.stringify(
      {
        version: 1,
        timestamp: new Date().toISOString(),
        totalGames: this.db.size,
        totalContributions: Array.from(this.db.values()).reduce(
          (sum, entries) => sum + entries.reduce((s, e) => s + e.reportCount, 0),
          0
        ),
        data,
      },
      null,
      2
    )
  }

  // ========================================================================
  // Helper Functions
  // ========================================================================

  private generateId(): string {
    return crypto.randomBytes(8).toString('hex')
  }

  private calculateSuccessRate(status: 'success' | 'partial' | 'failed'): number {
    switch (status) {
      case 'success':
        return 100
      case 'partial':
        return 50
      case 'failed':
        return 0
    }
  }

  private assessRisk(
    method: string,
    status: 'success' | 'partial' | 'failed'
  ): 'low' | 'medium' | 'high' {
    // Steamless is low risk
    if (method === 'steamless') {
      return status === 'success' ? 'low' : 'medium'
    }

    // Custom stub and API hooks are medium-high risk
    if (method === 'custom-stub' || method === 'api-hook') {
      return status === 'success' ? 'medium' : 'high'
    }

    // OnlineFix is medium risk (works but may have issues)
    if (method === 'onlinefix') {
      return 'medium'
    }

    return 'high'
  }
}

// ============================================================================
// Service Instance
// ============================================================================

const communityDb = new CommunityDatabase()

// ============================================================================
// Public Service Interface
// ============================================================================

export const communityDbService = {
  async initialize(): Promise<void> {
    await communityDb.initialize()
  },

  async contribute(request: ContributionRequest): Promise<ContributionResponse> {
    return await communityDb.addContribution(request)
  },

  async getStats(appId: string): Promise<CommunityStats | null> {
    return await communityDb.getStats(appId)
  },

  async getEntries(appId: string): Promise<CommunityEntry[]> {
    return await communityDb.getEntries(appId)
  },

  async searchByMethod(removalMethod: string): Promise<Map<string, CommunityStats>> {
    return await communityDb.searchByMethod(removalMethod)
  },

  async exportDatabase(): Promise<string> {
    return await communityDb.exportDatabase()
  },

  // Batch stats retrieval
  async getMultipleStats(appIds: string[]): Promise<Map<string, CommunityStats>> {
    const results = new Map<string, CommunityStats>()

    for (const appId of appIds) {
      const stats = await communityDb.getStats(appId)
      if (stats) results.set(appId, stats)
    }

    return results
  },

  // Get top-rated methods for an app
  async getTopMethods(appId: string, limit: number = 5): Promise<CommunityEntry[]> {
    const entries = await communityDb.getEntries(appId)
    return entries.slice(0, limit)
  },

  // Get methods with highest success rate
  async getHighestSuccessMethods(minReports: number = 3): Promise<CommunityEntry[]> {
    await communityDb.initialize()

    const allEntries: CommunityEntry[] = []
    for (const entries of (communityDb as any).db.values()) {
      allEntries.push(...entries)
    }

    return allEntries
      .filter((e) => e.reportCount >= minReports)
      .sort((a, b) => b.successRate - a.successRate)
      .slice(0, 50)
  },
}
