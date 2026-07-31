// ============================================================================
// electron/services/pcgamingwiki.service.ts
// PCGamingWiki API Integration for Auto-DRM Detection
// Queries PCGamingWiki API for game DRM info
// Caches results with 24h TTL
// ============================================================================

import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import { logger } from '../logger'

/**
 * PCGamingWiki DRM Info
 */
export interface PCGWikiDrmInfo {
  gameTitle: string
  appId: string
  drmTypes: string[]
  drm: {
    type: string
    removable: boolean
    notes?: string
  }[]
  wineCompatibility?: string
  lastUpdated: string
}

/**
 * Cache entry for API results
 */
interface CacheEntry {
  data: PCGWikiDrmInfo
  timestamp: number
  ttlMs: number
}

/**
 * PCGamingWiki Service
 */
class PCGamingWikiService {
  private cacheDir: string
  private cacheFilename: string
  private cache: Map<string, CacheEntry> = new Map()
  private readonly CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours
  private readonly API_TIMEOUT_MS = 30000 // 30 seconds

  constructor() {
    this.cacheDir = path.join(app.getPath('userData'), '.cache')
    this.cacheFilename = path.join(this.cacheDir, 'pcgamingwiki-drm-cache.json')
    this.loadCache()
  }

  /**
   * Load cache from disk
   */
  private loadCache(): void {
    try {
      if (!fs.existsSync(this.cacheFilename)) {
        return
      }

      const content = fs.readFileSync(this.cacheFilename, 'utf-8')
      const cacheData = JSON.parse(content) as Record<string, CacheEntry>

      // Load valid cache entries
      for (const [key, entry] of Object.entries(cacheData)) {
        if (this.isCacheEntryValid(entry)) {
          this.cache.set(key, entry)
        }
      }

      logger.info(
        `[PCGamingWiki Service] Loaded ${this.cache.size} cache entries from disk`,
        'pcgamingwiki'
      )
    } catch (err) {
      logger.warn(`[PCGamingWiki Service] Failed to load cache: ${err instanceof Error ? err.message : 'unknown'}`, 'pcgamingwiki')
    }
  }

  /**
   * Save cache to disk
   */
  private saveCache(): void {
    try {
      if (!fs.existsSync(this.cacheDir)) {
        fs.mkdirSync(this.cacheDir, { recursive: true })
      }

      const cacheData: Record<string, CacheEntry> = {}
      for (const [key, entry] of this.cache) {
        if (this.isCacheEntryValid(entry)) {
          cacheData[key] = entry
        }
      }

      fs.writeFileSync(this.cacheFilename, JSON.stringify(cacheData, null, 2), 'utf-8')
      logger.info('[PCGamingWiki Service] Cache saved to disk', 'pcgamingwiki')
    } catch (err) {
      logger.warn(`[PCGamingWiki Service] Failed to save cache: ${err instanceof Error ? err.message : 'unknown'}`, 'pcgamingwiki')
    }
  }

  /**
   * Check if cache entry is still valid
   */
  private isCacheEntryValid(entry: CacheEntry): boolean {
    const now = Date.now()
    return now - entry.timestamp < entry.ttlMs
  }

  /**
   * Get DRM info for a game
   * Tries cache first, then API
   */
  async getDrmInfo(appId: string | string): Promise<PCGWikiDrmInfo | null> {
    const appIdStr = String(appId)

    // Check cache first
    const cached = this.cache.get(appIdStr)
    if (cached && this.isCacheEntryValid(cached)) {
      logger.info(`[PCGamingWiki Service] Cache hit for app ${appIdStr}`, 'pcgamingwiki')
      return cached.data
    }

    // Remove expired entry
    if (cached) {
      this.cache.delete(appIdStr)
    }

    // Try API
    const result = await this.fetchFromApi(appIdStr)
    if (result) {
      // Cache the result
      this.cache.set(appIdStr, {
        data: result,
        timestamp: Date.now(),
        ttlMs: this.CACHE_TTL_MS,
      })
      this.saveCache()
    }

    return result
  }

  /**
   * Fetch DRM info from PCGamingWiki API
   */
  private async fetchFromApi(appId: string): Promise<PCGWikiDrmInfo | null> {
    try {
      logger.info(`[PCGamingWiki Service] Fetching DRM info for app ${appId}`, 'pcgamingwiki')

      // PCGamingWiki API endpoint
      // Note: This is a simplified approach - actual implementation would need proper API keys
      const url = `https://www.pcgamingwiki.com/w/api.php?action=query&format=json&titles=Category:Games_with_DRM&prop=revisions&rvprop=content`

      const response = await this.fetchWithTimeout(url, this.API_TIMEOUT_MS)

      if (!response.ok) {
        logger.warn(
          `[PCGamingWiki Service] API returned status ${response.status}`,
          'pcgamingwiki'
        )
        return null
      }

      const data = await response.json()

      // Parse response and extract DRM info
      // This is a simplified parser - actual implementation would need proper parsing
      const drmInfo = this.parseApiResponse(data, appId)

      if (drmInfo) {
        logger.info(`[PCGamingWiki Service] Found DRM info for app ${appId}`, 'pcgamingwiki')
      }

      return drmInfo
    } catch (err) {
      logger.warn(
        `[PCGamingWiki Service] API fetch failed: ${err instanceof Error ? err.message : 'unknown'}`,
        'pcgamingwiki'
      )
      return null
    }
  }

  /**
   * Fetch with timeout
   */
  private fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Fetch timeout after ${timeoutMs}ms`))
      }, timeoutMs)

      fetch(url)
        .then((response) => {
          clearTimeout(timer)
          resolve(response)
        })
        .catch((err) => {
          clearTimeout(timer)
          reject(err)
        })
    })
  }

  /**
   * Parse API response
   */
  private parseApiResponse(data: any, appId: string): PCGWikiDrmInfo | null {
    try {
      // This is a simplified parser
      // Actual implementation would need to parse PCGamingWiki's actual API format
      const drmTypes: string[] = []
      const drmDetails: PCGWikiDrmInfo['drm'] = []

      // Look for common DRM types in response
      const content = JSON.stringify(data).toLowerCase()
      if (content.includes('denuvo')) {
        drmTypes.push('Denuvo')
        drmDetails.push({ type: 'Denuvo', removable: false, notes: 'Legal concerns prevent removal' })
      }
      if (content.includes('securom')) {
        drmTypes.push('SecuROM')
        drmDetails.push({ type: 'SecuROM', removable: true })
      }
      if (content.includes('tages') || content.includes('safedisc')) {
        drmTypes.push('Tages')
        drmDetails.push({ type: 'Tages', removable: true })
      }
      if (content.includes('steamstub')) {
        drmTypes.push('SteamStub')
        drmDetails.push({ type: 'SteamStub', removable: true })
      }

      if (drmTypes.length === 0) {
        return null
      }

      return {
        gameTitle: `App ${appId}`,
        appId,
        drmTypes,
        drm: drmDetails,
        lastUpdated: new Date().toISOString(),
      }
    } catch (err) {
      logger.warn(`[PCGamingWiki Service] Parse error: ${err instanceof Error ? err.message : 'unknown'}`, 'pcgamingwiki')
      return null
    }
  }

  /**
   * Batch fetch for multiple apps
   */
  async getDrmInfoBatch(appIds: string[]): Promise<Map<string, PCGWikiDrmInfo | null>> {
    const results = new Map<string, PCGWikiDrmInfo | null>()

    for (const appId of appIds) {
      try {
        const info = await this.getDrmInfo(appId)
        results.set(appId, info)
      } catch (err) {
        logger.warn(
          `[PCGamingWiki Service] Batch fetch failed for ${appId}: ${err instanceof Error ? err.message : 'unknown'}`,
          'pcgamingwiki'
        )
        results.set(appId, null)
      }
    }

    return results
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear()
    try {
      if (fs.existsSync(this.cacheFilename)) {
        fs.unlinkSync(this.cacheFilename)
      }
    } catch {
      // Ignore errors
    }
    logger.info('[PCGamingWiki Service] Cache cleared', 'pcgamingwiki')
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; validEntries: number } {
    let validEntries = 0
    for (const entry of this.cache.values()) {
      if (this.isCacheEntryValid(entry)) {
        validEntries++
      }
    }
    return {
      size: this.cache.size,
      validEntries,
    }
  }
}

// Export singleton instance
export const pcgamingwikiService = new PCGamingWikiService()
