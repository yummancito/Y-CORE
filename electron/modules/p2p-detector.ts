// ============================================================================
// electron/modules/p2p-detector.ts
// ============================================================================
// P2P Protocol Detection module for Online Fix
// Analyzes game binaries and configurations to detect P2P protocol types
// Supports: Steam P2P API, GameSpy, custom P2P implementations
// ============================================================================

import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'
import { logger } from '../logger'

// ============================================================================
// Types and Interfaces
// ============================================================================

export type P2PProtocolType = 'steam_p2p' | 'gamespy' | 'custom_p2p' | 'none' | 'unknown'

export interface P2PProtocolConfig {
  type: P2PProtocolType
  requiresUPnP: boolean
  requiresRelay: boolean
  requiresSTUN: boolean
  requiresTURN: boolean
  natTraversalMethod: 'upnp' | 'hole_punch' | 'relay' | 'none'
  recommendedConnectionTimeout: number // ms
  maxPeers: number
  detectionConfidence: number // 0-100
  detectionMethod: string[]
}

export interface P2PDetectionResult {
  protocol: P2PProtocolConfig
  detectedFiles: string[]
  detectedAPICalls: string[]
  steamAppManifestFlags: string[]
  rawDetectionData: Record<string, unknown>
}

export interface DetectionCache {
  appId: string
  result: P2PDetectionResult
  timestamp: number
  ttlMs: number
}

// ============================================================================
// Constants
// ============================================================================

const CACHE_DIR = path.join(__dirname, '.p2p-cache')
const DEFAULT_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

// Steam P2P API indicators
const STEAM_P2P_SIGNATURES = [
  'SteamP2P',
  'SteamNetworking',
  'ISteamP2P',
  'CreateP2PSocketPair',
  'SendP2PPacket',
  'ReceiveP2PPacket',
  'AcceptP2PSocketConnection',
  'GetP2PSessionState',
  'CloseP2PChannel',
  'P2PSendPacket',
  'P2PReceivePacket',
]

// GameSpy protocol indicators
const GAMESPY_SIGNATURES = [
  'GameSpy',
  'GP_',
  'gp_',
  'peerchat',
  'pepsl',
  'pgeraw',
  'gstats',
  'sake_',
  'oneauth',
  'sclient',
]

// Common relay/NAT traversal indicators
const RELAY_INDICATORS = [
  'relay',
  'RELAY',
  'turn_server',
  'TURN',
  'stun_server',
  'STUN',
  'signaling',
  'ICEServer',
  'PeerConnection',
]

// Common hole punching indicators
const HOLEPUNCH_INDICATORS = [
  'hole_punch',
  'UPnP',
  'UPNP',
  'upnp',
  'port_mapping',
  'PortMap',
  'IGD',
  'UPnPDevice',
  'NAT',
  'nat_type',
]

// ============================================================================
// Core Detection Functions
// ============================================================================

/**
 * Scan binary file for API signatures using binary search
 */
function scanBinaryForSignatures(filePath: string, signatures: string[]): string[] {
  const found: string[] = []
  try {
    const buffer = fs.readFileSync(filePath)
    const text = buffer.toString('utf-8', 0, buffer.length).replace(/\0/g, ' ')

    for (const sig of signatures) {
      if (text.includes(sig)) {
        found.push(sig)
      }
    }

    // Also try using strings command on Windows (if dumpbin available)
    if (process.platform === 'win32') {
      try {
        const output = execSync(`powershell -Command "[System.IO.File]::ReadAllText('${filePath}', [System.Text.Encoding]::ASCII)"`, {
          encoding: 'utf-8',
          maxBuffer: 10 * 1024 * 1024,
          timeout: 5000,
        })
        for (const sig of signatures) {
          if (output.includes(sig) && !found.includes(sig)) {
            found.push(sig)
          }
        }
      } catch (err) {
        // Silently fail, we got what we could from buffer scan
      }
    }
  } catch (err: any) {
    logger.warn(`Failed to scan binary ${filePath}: ${err.message}`, 'p2p-detector')
  }

  return found
}

/**
 * Scan directory recursively for configuration files that might indicate P2P
 */
function scanConfigFiles(gameDir: string, depth: number = 0): string[] {
  const found: string[] = []
  const maxDepth = 4

  if (depth > maxDepth) return found

  try {
    const entries = fs.readdirSync(gameDir, { withFileTypes: true })

    for (const entry of entries) {
      const fullPath = path.join(gameDir, entry.name)

      if (entry.isDirectory()) {
        // Skip common non-game directories
        const skipDirs = ['node_modules', '.git', '__pycache__', 'venv', '.venv', 'build', 'temp', '.temp']
        if (!skipDirs.includes(entry.name.toLowerCase())) {
          found.push(...scanConfigFiles(fullPath, depth + 1))
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase()
        const name = entry.name.toLowerCase()

        // Check config file patterns
        if (['.ini', '.cfg', '.conf', '.json', '.xml', '.yaml', '.yml'].includes(ext) || name.includes('config')) {
          try {
            const content = fs.readFileSync(fullPath, 'utf-8')

            // Check for P2P-related keywords
            const p2pKeywords = [
              'p2p',
              'peer',
              'network',
              'relay',
              'stun',
              'turn',
              'ice',
              'nat',
              'upnp',
              'gamespy',
              'steam',
            ]

            const hasP2P = p2pKeywords.some((kw) => content.toLowerCase().includes(kw))
            if (hasP2P) {
              found.push(fullPath)
            }
          } catch (err) {
            // Ignore read errors for config files
          }
        }
      }
    }
  } catch (err: any) {
    logger.debug(`Error scanning config directory ${gameDir}: ${err.message}`, 'p2p-detector')
  }

  return found
}

/**
 * Parse Steam app manifest for P2P-related flags
 */
function parseSteamAppManifest(appId: string): string[] {
  const flags: string[] = []

  try {
    const steamPath = process.env['SteamPath'] || 'C:\\Program Files (x86)\\Steam'
    const manifestPath = path.join(steamPath, 'steamapps', `appmanifest_${appId}.acf`)

    if (fs.existsSync(manifestPath)) {
      const content = fs.readFileSync(manifestPath, 'utf-8')

      // Look for networking-related flags
      const networkFlags = [
        'EnableNetworking',
        'Networking',
        'SteamP2P',
        'MultiplayerType',
        'LAN',
        'OnlinePlay',
        'P2PRequested',
        'ContentType',
      ]

      for (const flag of networkFlags) {
        if (content.includes(flag)) {
          const match = content.match(new RegExp(`"${flag}"\\s+"([^"]*)"`, 'i'))
          if (match) {
            flags.push(`${flag}:${match[1]}`)
          }
        }
      }
    }
  } catch (err: any) {
    logger.debug(`Failed to parse Steam manifest for ${appId}: ${err.message}`, 'p2p-detector')
  }

  return flags
}

/**
 * Analyze detected signatures and configuration to determine protocol
 */
function analyzeDetectionData(
  steamSigs: string[],
  gamespySigs: string[],
  relayIndicators: string[],
  holepunchIndicators: string[],
  manifestFlags: string[]
): P2PProtocolConfig {
  // Calculate confidence scores
  const steamScore = steamSigs.length * 20
  const gamespyScore = gamespySigs.length * 20
  const relayScore = relayIndicators.length * 10
  const holepunchScore = holepunchIndicators.length * 10

  const hasNetworkingInManifest = manifestFlags.some((f) => f.includes('Networking') || f.includes('OnlinePlay'))

  if (steamScore > gamespyScore && steamScore > 0) {
    return {
      type: 'steam_p2p',
      requiresUPnP: holepunchScore > 20,
      requiresRelay: relayScore > 30,
      requiresSTUN: relayScore > 20,
      requiresTURN: relayScore > 40,
      natTraversalMethod: holepunchScore > relayScore ? 'upnp' : relayScore > 0 ? 'relay' : 'hole_punch',
      recommendedConnectionTimeout: 15000,
      maxPeers: 32,
      detectionConfidence: Math.min(100, Math.max(steamScore, 70)),
      detectionMethod: ['steam_api_signatures', 'relay_indicators', 'holepunch_indicators'],
    }
  }

  if (gamespyScore > 0) {
    return {
      type: 'gamespy',
      requiresUPnP: true,
      requiresRelay: true,
      requiresSTUN: true,
      requiresTURN: false,
      natTraversalMethod: 'relay',
      recommendedConnectionTimeout: 20000,
      maxPeers: 64,
      detectionConfidence: Math.min(100, Math.max(gamespyScore, 65)),
      detectionMethod: ['gamespy_signatures', 'config_analysis'],
    }
  }

  if (relayScore > 20 || holepunchScore > 20) {
    return {
      type: 'custom_p2p',
      requiresUPnP: holepunchScore > relayScore,
      requiresRelay: relayScore > holepunchScore,
      requiresSTUN: relayScore > 0,
      requiresTURN: relayScore > 40,
      natTraversalMethod: holepunchScore > relayScore ? 'upnp' : 'relay',
      recommendedConnectionTimeout: 25000,
      maxPeers: 16,
      detectionConfidence: Math.min(100, Math.max(relayScore + holepunchScore, 50)),
      detectionMethod: ['config_analysis', 'keyword_detection'],
    }
  }

  // No clear P2P indicators found
  return {
    type: 'none',
    requiresUPnP: false,
    requiresRelay: false,
    requiresSTUN: false,
    requiresTURN: false,
    natTraversalMethod: 'none',
    recommendedConnectionTimeout: 0,
    maxPeers: 0,
    detectionConfidence: 0,
    detectionMethod: [],
  }
}

// ============================================================================
// Cache Management
// ============================================================================

/**
 * Initialize cache directory
 */
function initCacheDir(): void {
  try {
    if (!fs.existsSync(CACHE_DIR)) {
      fs.mkdirSync(CACHE_DIR, { recursive: true })
    }
  } catch (err: any) {
    logger.warn(`Failed to initialize P2P cache directory: ${err.message}`, 'p2p-detector')
  }
}

/**
 * Get cache file path for appId
 */
function getCachePath(appId: string): string {
  return path.join(CACHE_DIR, `p2p_${appId}.json`)
}

/**
 * Load cached detection result if still valid
 */
function loadFromCache(appId: string): P2PDetectionResult | null {
  try {
    const cachePath = getCachePath(appId)
    if (!fs.existsSync(cachePath)) return null

    const cached = JSON.parse(fs.readFileSync(cachePath, 'utf-8')) as DetectionCache
    const now = Date.now()

    if (now - cached.timestamp < cached.ttlMs) {
      logger.debug(`P2P detection cache hit for appId ${appId}`, 'p2p-detector')
      return cached.result
    }

    // Cache expired, remove it
    try {
      fs.unlinkSync(cachePath)
    } catch {
      // Ignore cleanup errors
    }
  } catch (err: any) {
    logger.debug(`Failed to load P2P cache for ${appId}: ${err.message}`, 'p2p-detector')
  }

  return null
}

/**
 * Save detection result to cache
 */
function saveToCache(appId: string, result: P2PDetectionResult, ttlMs: number = DEFAULT_CACHE_TTL_MS): void {
  try {
    initCacheDir()
    const cachePath = getCachePath(appId)
    const cache: DetectionCache = {
      appId,
      result,
      timestamp: Date.now(),
      ttlMs,
    }
    fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2), 'utf-8')
  } catch (err: any) {
    logger.warn(`Failed to save P2P cache for ${appId}: ${err.message}`, 'p2p-detector')
  }
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Detect P2P protocol for a game by analyzing its binary and configuration
 * @param gameDir - Path to game installation directory
 * @param appId - Steam App ID (used for caching)
 * @returns P2P detection result with protocol type and configuration
 */
export async function detectP2PProtocol(gameDir: string, appId: string): Promise<P2PDetectionResult> {
  // Check cache first
  const cached = loadFromCache(appId)
  if (cached) return cached

  logger.info(`Starting P2P protocol detection for appId ${appId}`, 'p2p-detector')

  const result: P2PDetectionResult = {
    protocol: { type: 'unknown', requiresUPnP: false, requiresRelay: false, requiresSTUN: false, requiresTURN: false, natTraversalMethod: 'none', recommendedConnectionTimeout: 0, maxPeers: 0, detectionConfidence: 0, detectionMethod: [] },
    detectedFiles: [],
    detectedAPICalls: [],
    steamAppManifestFlags: [],
    rawDetectionData: {},
  }

  try {
    if (!fs.existsSync(gameDir)) {
      logger.warn(`Game directory not found: ${gameDir}`, 'p2p-detector')
      return result
    }

    // Find executable files
    const exeFiles: string[] = []
    const scanForExes = (dir: string, depth: number = 0) => {
      if (depth > 3) return
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true })
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name)
          if (entry.isDirectory() && !['steamapps', 'config', 'logs', 'cache'].includes(entry.name.toLowerCase())) {
            scanForExes(fullPath, depth + 1)
          } else if (entry.isFile() && ['.exe', '.dll', '.so', '.dylib'].includes(path.extname(entry.name).toLowerCase())) {
            exeFiles.push(fullPath)
          }
        }
      } catch (err) {
        // Ignore directory read errors
      }
    }

    scanForExes(gameDir)
    logger.debug(`Found ${exeFiles.length} executable files for scanning`, 'p2p-detector')

    // Scan binaries for P2P API signatures
    const steamSigs: string[] = []
    const gamespySigs: string[] = []
    const relayIndicators: string[] = []
    const holepunchIndicators: string[] = []

    for (const exeFile of exeFiles.slice(0, 10)) {
      // Limit to first 10 files for performance
      logger.debug(`Scanning binary: ${path.basename(exeFile)}`, 'p2p-detector')

      const steam = scanBinaryForSignatures(exeFile, STEAM_P2P_SIGNATURES)
      const gamespy = scanBinaryForSignatures(exeFile, GAMESPY_SIGNATURES)
      const relay = scanBinaryForSignatures(exeFile, RELAY_INDICATORS)
      const holepunch = scanBinaryForSignatures(exeFile, HOLEPUNCH_INDICATORS)

      if (steam.length > 0) steamSigs.push(...steam)
      if (gamespy.length > 0) gamespySigs.push(...gamespy)
      if (relay.length > 0) relayIndicators.push(...relay)
      if (holepunch.length > 0) holepunchIndicators.push(...holepunch)

      result.detectedFiles.push(exeFile)
    }

    // Scan configuration files
    const configFiles = scanConfigFiles(gameDir)
    result.detectedFiles.push(...configFiles)

    // Parse Steam manifest
    const manifestFlags = parseSteamAppManifest(appId)
    result.steamAppManifestFlags = manifestFlags

    // Deduplicate and store API calls
    result.detectedAPICalls = [...new Set([...steamSigs, ...gamespySigs, ...relayIndicators, ...holepunchIndicators])]

    // Store raw detection data
    result.rawDetectionData = {
      steamApiSignatures: [...new Set(steamSigs)],
      gamespySignatures: [...new Set(gamespySigs)],
      relayIndicators: [...new Set(relayIndicators)],
      holepunchIndicators: [...new Set(holepunchIndicators)],
      configFiles: configFiles,
      manifestFlags: manifestFlags,
    }

    // Analyze all collected data to determine protocol
    result.protocol = analyzeDetectionData(steamSigs, gamespySigs, relayIndicators, holepunchIndicators, manifestFlags)

    logger.info(`P2P detection completed: ${result.protocol.type} (confidence: ${result.protocol.detectionConfidence}%)`, 'p2p-detector')

    // Cache the result
    saveToCache(appId, result)

    return result
  } catch (err: any) {
    logger.error(`P2P detection error for ${appId}: ${err.message}`, 'p2p-detector')
    return result
  }
}

/**
 * Clear P2P detection cache for a specific app or all apps
 * @param appId - Optional App ID to clear specific cache. If omitted, clears all.
 */
export function clearP2PDetectionCache(appId?: string): void {
  try {
    if (appId) {
      const cachePath = getCachePath(appId)
      if (fs.existsSync(cachePath)) {
        fs.unlinkSync(cachePath)
        logger.info(`Cleared P2P cache for appId ${appId}`, 'p2p-detector')
      }
    } else {
      if (fs.existsSync(CACHE_DIR)) {
        fs.rmSync(CACHE_DIR, { recursive: true, force: true })
        logger.info(`Cleared all P2P detection cache`, 'p2p-detector')
      }
    }
  } catch (err: any) {
    logger.warn(`Failed to clear P2P cache: ${err.message}`, 'p2p-detector')
  }
}

/**
 * Get cached detection result without performing new detection
 */
export function getP2PDetectionFromCache(appId: string): P2PDetectionResult | null {
  return loadFromCache(appId)
}
