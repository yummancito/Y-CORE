/**
 * Steam Workshop API Service
 * Handles all interactions with Steam Workshop API for mod discovery and metadata
 * Features: API integration, caching, rate limiting, error handling
 */

import axios, { AxiosError } from 'axios'
import { LRUCache } from 'lru-cache'
import { logger } from '../logger'
import type {
  SteamModDetails,
  SteamWorkshopFile,
  SteamCatalogResponse,
  ModSearchQuery,
  ModSearchResult,
  CachedModDetails,
  CacheStats,
} from '../common/mod-types'

// ============================================================================
// Constants
// ============================================================================

const STEAM_API_BASE = 'https://api.steampowered.com'
const STEAM_WORKSHOP_API = `${STEAM_API_BASE}/ISteamRemoteStorage/GetPublishedFileDetails/v1/`

const DEFAULT_CACHE_TTL = 24 * 60 * 60 * 1000 // 24 hours
const DEFAULT_MAX_CACHE_SIZE = 100 * 1024 * 1024 // 100 MB
const API_RATE_LIMIT_DELAY = 100 // ms between requests
const API_TIMEOUT = 30000 // 30 seconds
const MAX_RETRIES = 3

// ============================================================================
// Rate Limiter
// ============================================================================

class RateLimiter {
  private lastRequestTime = 0
  private readonly delay: number

  constructor(delayMs: number) {
    this.delay = delayMs
  }

  async wait(): Promise<void> {
    const elapsed = Date.now() - this.lastRequestTime
    if (elapsed < this.delay) {
      await new Promise(resolve => setTimeout(resolve, this.delay - elapsed))
    }
    this.lastRequestTime = Date.now()
  }
}

// ============================================================================
// Steam Workshop Service
// ============================================================================

class SteamWorkshopService {
  private cache: LRUCache<string, CachedModDetails>
  private rateLimiter: RateLimiter
  private cacheStats = {
    hits: 0,
    misses: 0,
    evictions: 0,
  }
  // FIX #6: Support for corporate proxies
  private proxyAgent: any = null

  constructor(
    cacheTTL: number = DEFAULT_CACHE_TTL,
    maxCacheSize: number = DEFAULT_MAX_CACHE_SIZE
  ) {
    this.cache = new LRUCache<string, CachedModDetails>({
      max: 1000, // max items
      maxSize: maxCacheSize,
      sizeCalculation: (item) => {
        return JSON.stringify(item).length
      },
      ttl: cacheTTL,
      updateAgeOnGet: false,
      updateAgeOnHas: false,
    })

    this.rateLimiter = new RateLimiter(API_RATE_LIMIT_DELAY)

    // FIX #6: Initialize proxy agent if proxy environment variables are set
    this.initializeProxyAgent()

    logger.info('Steam Workshop Service initialized', 'steam-workshop')
  }

  /**
   * FIX #6: Initialize HTTP proxy agent from environment variables
   */
  private initializeProxyAgent(): void {
    try {
      const proxyUrl = process.env.HTTP_PROXY || process.env.http_proxy || process.env.HTTPS_PROXY || process.env.https_proxy
      if (!proxyUrl) return

      const { HttpProxyAgent, HttpsProxyAgent } = require('http-proxy-agent')
      const url = proxyUrl.startsWith('http') ? proxyUrl : `http://${proxyUrl}`
      const protocol = url.startsWith('https') ? 'https' : 'http'

      if (protocol === 'https') {
        this.proxyAgent = new HttpsProxyAgent(url)
      } else {
        this.proxyAgent = new HttpProxyAgent(url)
      }

      logger.info(`Steam Workshop Service using proxy: ${proxyUrl}`, 'steam-workshop')
    } catch (err: any) {
      logger.warn(`Failed to initialize proxy agent: ${err?.message}`, 'steam-workshop')
    }
  }

  /**
   * Get mod details from Steam Workshop
   */
  async getModDetails(fileId: string): Promise<SteamModDetails | null> {
    const cacheKey = `mod:${fileId}`

    // Check cache
    const cached = this.cache.get(cacheKey)
    if (cached && Date.now() - cached.timestamp < cached.ttl) {
      this.cacheStats.hits++
      logger.debug(`Cache hit for mod ${fileId}`, 'steam-workshop')
      return cached.data
    }

    this.cacheStats.misses++

    try {
      const details = await this.fetchModDetailsFromAPI(fileId)
      if (details) {
        this.cache.set(cacheKey, {
          data: details,
          timestamp: Date.now(),
          ttl: DEFAULT_CACHE_TTL,
        })
      }
      return details
    } catch (err: any) {
      logger.error(`Failed to get mod details for ${fileId}: ${err?.message}`, 'steam-workshop')
      return null
    }
  }

  /**
   * Get multiple mods details (batch)
   */
  async getModDetailsBatch(fileIds: string[]): Promise<SteamModDetails[]> {
    const results: SteamModDetails[] = []

    for (const fileId of fileIds) {
      const details = await this.getModDetails(fileId)
      if (details) {
        results.push(details)
      }
    }

    return results
  }

  /**
   * Search mods by query
   */
  async searchMods(query: ModSearchQuery): Promise<ModSearchResult> {
    const cacheKey = `search:${JSON.stringify(query)}`

    // Check cache (but with shorter TTL for searches)
    const cached = this.cache.get(cacheKey)
    if (cached && Date.now() - cached.timestamp < 60 * 60 * 1000) {
      // 1 hour TTL for searches
      this.cacheStats.hits++
      return {
        query,
        mods: [cached.data as any].filter(m => m),
        total: 1,
        hasMore: false,
        searchTime: 0,
      }
    }

    this.cacheStats.misses++

    try {
      const results = await this.performSearch(query)
      return results
    } catch (err: any) {
      logger.error(`Search failed: ${err?.message}`, 'steam-workshop')
      return {
        query,
        mods: [],
        total: 0,
        hasMore: false,
        searchTime: 0,
      }
    }
  }

  /**
   * Get mods for game (catalog)
   */
  async getGameMods(appId: string, limit = 100, offset = 0): Promise<SteamCatalogResponse> {
    const cacheKey = `catalog:${appId}:${limit}:${offset}`

    // Check cache
    const cached = this.cache.get(cacheKey)
    if (cached && Date.now() - cached.timestamp < DEFAULT_CACHE_TTL) {
      this.cacheStats.hits++
      return {
        success: true,
        mods: [cached.data as any].filter(m => m),
        total: 1,
      }
    }

    this.cacheStats.misses++

    try {
      const mods = await this.fetchGameMods(appId, limit, offset)
      return {
        success: true,
        mods: mods || [],
        total: mods?.length || 0,
      }
    } catch (err: any) {
      logger.error(`Failed to fetch game mods for app ${appId}: ${err?.message}`, 'steam-workshop')
      return {
        success: false,
        total: 0,
        mods: [],
        error: err?.message || 'Unknown error',
      }
    }
  }

  /**
   * Validate that a path stays within a base directory (prevent path traversal)
   * FIX #11: Add path validation to prevent directory traversal attacks
   */
  private validateModPath(basePath: string, requestedPath: string): string {
    const path = require('path')
    const fs = require('fs')

    // Resolve to absolute path
    const resolved = path.resolve(basePath, requestedPath)
    const baseResolved = path.resolve(basePath)

    // Ensure it's within the base directory (no .. traversal)
    if (!resolved.startsWith(baseResolved)) {
      logger.error(
        `Path traversal attempt detected: ${requestedPath} resolves outside ${basePath}`,
        'steam-workshop'
      )
      throw new Error('Path traversal attempt detected')
    }

    // Additional check for suspicious patterns
    if (resolved.includes('..') || requestedPath.includes('~')) {
      logger.error(
        `Invalid path characters detected: ${requestedPath}`,
        'steam-workshop'
      )
      throw new Error('Invalid characters in path')
    }

    return resolved
  }

  /**
   * Download mod file with resume support
   * FIX #11: Validate file paths to prevent directory traversal
   */
  async downloadModFile(
    fileUrl: string,
    outputPath: string,
    onProgress?: (progress: { loaded: number; total: number; speed: number }) => void
  ): Promise<{ success: boolean; path: string; size: number; error?: string }> {
    let lastUpdateTime = Date.now()
    let lastLoadedBytes = 0

    try {
      // FIX #11: Validate output path is within safe base directory
      const MOD_INSTALL_BASE = require('path').join(
        require('electron').app.getPath('userData'),
        'mods'
      )

      // Validate path to prevent directory traversal attacks
      const validatedPath = this.validateModPath(MOD_INSTALL_BASE, outputPath)

      await this.rateLimiter.wait()

      // FIX #6: Use proxy agent if configured
      const axiosConfig: any = {
        responseType: 'stream',
        timeout: API_TIMEOUT,
        headers: {
          'User-Agent': 'Y-Core-Mod-Manager/1.0',
        },
      }

      if (this.proxyAgent) {
        axiosConfig.httpAgent = this.proxyAgent
        axiosConfig.httpsAgent = this.proxyAgent
      }

      const response = await axios.get(fileUrl, axiosConfig)

      const totalSize = parseInt(String(response.headers['content-length'] || '0'), 10)
      let loadedBytes = 0

      return new Promise((resolve, reject) => {
        const fs = require('fs')
        const path = require('path')

        // Ensure output directory exists
        const dir = path.dirname(validatedPath)
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true })
        }

        const writeStream = fs.createWriteStream(validatedPath)

        response.data.on('data', (chunk: Buffer) => {
          loadedBytes += chunk.length

          // Report progress every 500ms
          const now = Date.now()
          if (now - lastUpdateTime > 500 && onProgress) {
            const speed = (loadedBytes - lastLoadedBytes) / ((now - lastUpdateTime) / 1000)
            onProgress({
              loaded: loadedBytes,
              total: totalSize || loadedBytes,
              speed,
            })
            lastUpdateTime = now
            lastLoadedBytes = loadedBytes
          }
        })

        response.data.pipe(writeStream)

        writeStream.on('finish', () => {
          logger.info(
            `Mod file downloaded: ${validatedPath} (${loadedBytes} bytes)`,
            'steam-workshop'
          )
          resolve({
            success: true,
            path: validatedPath,
            size: loadedBytes,
          })
        })

        writeStream.on('error', (err: Error) => {
          try {
            fs.unlinkSync(validatedPath)
          } catch (e) {
            // Ignore cleanup errors
          }
          reject(err)
        })

        response.data.on('error', (err: Error) => {
          writeStream.destroy()
          try {
            fs.unlinkSync(validatedPath)
          } catch (e) {
            // Ignore cleanup errors
          }
          reject(err)
        })
      })
    } catch (err: any) {
      logger.error(`Download failed for ${fileUrl}: ${err?.message}`, 'steam-workshop')
      return {
        success: false,
        path: outputPath,
        size: 0,
        error: err?.message || 'Download failed',
      }
    }
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): CacheStats {
    const entries = this.cache.dump()
    const sizes = entries.map(([, v]) => JSON.stringify(v).length)
    const totalSize = sizes.reduce((a, b) => a + b, 0)

    return {
      entriesCount: this.cache.size,
      cacheSize: totalSize,
      oldestEntryAge: entries.length > 0 ? Date.now() - (entries[0][1] as any).timestamp : 0,
      newestEntryAge: entries.length > 0 ? Date.now() - (entries[entries.length - 1][1] as any).timestamp : 0,
      hitRate: this.getCacheHitRate(), // 0-1 range
    }
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    const size = this.cache.size
    this.cache.clear()
    logger.info(`Cache cleared (${size} entries removed)`, 'steam-workshop')
  }

  /**
   * Get cache hit rate
   */
  getCacheHitRate(): number {
    const total = this.cacheStats.hits + this.cacheStats.misses
    return total === 0 ? 0 : this.cacheStats.hits / total
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private async fetchModDetailsFromAPI(fileId: string, retry = 0): Promise<SteamModDetails | null> {
    try {
      await this.rateLimiter.wait()

      const params = {
        publishedfileids: fileId,
        includevotes: 1,
        includemetadata: 1,
        includechildren: 1,
        striphtml: 1,
      }

      // FIX #6: Use proxy agent if configured
      const axiosConfig: any = {
        params,
        timeout: API_TIMEOUT,
        headers: {
          'User-Agent': 'Y-Core-Mod-Manager/1.0',
        },
      }

      if (this.proxyAgent) {
        axiosConfig.httpAgent = this.proxyAgent
        axiosConfig.httpsAgent = this.proxyAgent
      }

      const response = await axios.get(STEAM_WORKSHOP_API, axiosConfig)

      if (response.data?.response?.publishedfiledetails?.[0]) {
        const file = response.data.response.publishedfiledetails[0] as SteamWorkshopFile
        if (file.result === 1) {
          return this.transformWorkshopFile(file)
        }
      }

      logger.warn(`No results for mod ${fileId}`, 'steam-workshop')
      return null
    } catch (err: any) {
      if (retry < MAX_RETRIES) {
        logger.warn(`Retrying mod fetch for ${fileId} (attempt ${retry + 1}/${MAX_RETRIES})`, 'steam-workshop')
        await new Promise(resolve => setTimeout(resolve, 1000 * (retry + 1)))
        return this.fetchModDetailsFromAPI(fileId, retry + 1)
      }

      throw err
    }
  }

  private async fetchGameMods(appId: string, limit: number, offset: number): Promise<SteamWorkshopFile[] | null> {
    try {
      await this.rateLimiter.wait()

      // Steam API doesn't provide a direct endpoint to list all mods for a game
      // Return empty list for now - in production, integrate with:
      // - Custom mod database
      // - Nexus Mods API
      // - Mod portal specific to your game
      logger.info(`Fetching mods for appId: ${appId} (limit: ${limit}, offset: ${offset})`, 'steam-workshop')
      return []
    } catch (err: any) {
      logger.error(`Failed to fetch game mods: ${err?.message}`, 'steam-workshop')
      return null
    }
  }

  private async performSearch(query: ModSearchQuery): Promise<ModSearchResult> {
    const startTime = Date.now()

    try {
      // For now, we'll use a simple search through the API
      // In production, you might want to use Steam's community API or Steamspy
      const mods = await this.fetchGameMods(query.gameAppId, query.limit || 100, query.offset || 0)

      let filtered = mods || []

      // Apply search filter
      if (query.search) {
        const searchLower = query.search.toLowerCase()
        filtered = filtered.filter(
          m => (m.title?.toLowerCase().includes(searchLower) || m.description?.toLowerCase().includes(searchLower))
        )
      }

      // Apply tag filter
      if (query.tags && query.tags.length > 0) {
        filtered = filtered.filter(m =>
          query.tags?.some(tag => m.tags?.some(t => t.tag.toLowerCase().includes(tag.toLowerCase())))
        )
      }

      // Apply sorting
      if (query.sort) {
        filtered = this.sortMods(filtered, query.sort, query.order === 'asc')
      }

      const transformed = filtered.map(f => this.transformWorkshopFile(f)).filter(Boolean) as SteamModDetails[]

      return {
        query,
        mods: transformed,
        total: transformed.length,
        hasMore: false,
        searchTime: Date.now() - startTime,
      }
    } catch (err: any) {
      logger.error(`Search error: ${err?.message}`, 'steam-workshop')
      return {
        query,
        mods: [],
        total: 0,
        hasMore: false,
        searchTime: Date.now() - startTime,
      }
    }
  }

  private transformWorkshopFile(file: SteamWorkshopFile): SteamModDetails | null {
    if (!file.title || !file.publishedfileid) {
      return null
    }

    return {
      id: file.publishedfileid,
      fileId: file.publishedfileid,
      title: file.title,
      description: file.description || '',
      author: file.creator || 'Unknown',
      authorId: file.creator || '',
      createdAt: file.time_created || 0,
      updatedAt: file.time_updated || 0,
      fileSize: file.file_size || 0,
      fileUrl: file.file_url || '',
      previewUrl: file.preview_url || '',
      tags: file.tags?.map(t => t.tag) || [],
      votesUp: file.vote_data?.votes_up || 0,
      votesDown: file.vote_data?.votes_down || 0,
      score: file.vote_data?.score || 0,
      visibility: this.getVisibilityString(file.visibility),
    }
  }

  private sortMods(
    mods: SteamWorkshopFile[],
    sortBy: string,
    ascending: boolean
  ): SteamWorkshopFile[] {
    const sorted = [...mods]

    switch (sortBy) {
      case 'newest':
        sorted.sort((a, b) => (b.time_created || 0) - (a.time_created || 0))
        break
      case 'most_subscribed':
        sorted.sort((a, b) => (b.vote_data?.votes_up || 0) - (a.vote_data?.votes_up || 0))
        break
      case 'top_rated':
        sorted.sort((a, b) => (b.vote_data?.score || 0) - (a.vote_data?.score || 0))
        break
      case 'alphabetical':
        sorted.sort((a, b) => (a.title || '').localeCompare(b.title || ''))
        break
      case 'trending':
      default:
        sorted.sort((a, b) => (b.time_updated || 0) - (a.time_updated || 0))
    }

    return ascending ? sorted.reverse() : sorted
  }

  private getVisibilityString(visibility?: number): 'public' | 'friends_only' | 'private' {
    switch (visibility) {
      case 0:
        return 'public'
      case 1:
        return 'friends_only'
      case 2:
        return 'private'
      default:
        return 'public'
    }
  }
}

// ============================================================================
// Export Service Instance
// ============================================================================

export const steamWorkshopService = new SteamWorkshopService()
