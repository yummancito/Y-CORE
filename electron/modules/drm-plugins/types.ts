// ============================================================================
// electron/modules/drm-plugins/types.ts
// DRM Plugin interface definitions and shared types
// ============================================================================

/**
 * Platform where DRM detection/removal is supported
 */
export type Platform = 'windows' | 'macos' | 'linux' | 'unknown'

/**
 * Risk level of DRM removal operation
 */
export type RiskLevel = 'safe' | 'moderate' | 'risky'

/**
 * Removal method used by plugin
 */
export type RemovalMethod = 'file-delete' | 'patch' | 'file-delete+patch' | 'detection-only'

/**
 * Result of DRM detection
 */
export interface DrmDetectionResult {
  detected: boolean
  drmTypes: DrmInfo[]
  gameVersion?: string
  platformSupported: boolean
}

/**
 * Detailed DRM information
 */
export interface DrmInfo {
  type: string // 'SecuROM', 'Tages', 'Denuvo', etc.
  version?: string
  location?: string // Where DRM was detected (file path or PE section)
  confidence: number // 0-100
  canRemove: boolean
  method?: RemovalMethod
  riskLevel?: RiskLevel
}

/**
 * Result of DRM removal attempt
 */
export interface DrmRemovalResult {
  success: boolean
  message: string
  drmType: string
  hadDrm: boolean
  backupPath?: string
  exePath?: string
  errorKey?: string
  suggestions?: string[] // Alternative solutions if removal failed
}

/**
 * DRM Plugin interface
 */
export interface DrmPlugin {
  /**
   * Unique identifier for the plugin
   */
  readonly id: string

  /**
   * Human-readable name
   */
  readonly name: string

  /**
   * Plugin version (semver)
   */
  readonly version: string

  /**
   * DRM types this plugin handles
   */
  readonly drmTypes: string[]

  /**
   * Platforms where this plugin works
   */
  readonly supportedPlatforms: Platform[]

  /**
   * Detect DRM in game executable/directory
   */
  detect(exePath: string, gameDir: string, appId?: string): Promise<DrmDetectionResult>

  /**
   * Remove DRM from game
   */
  remove(exePath: string, gameDir: string, appId?: string): Promise<DrmRemovalResult>

  /**
   * Optional: Handle restoration from backup
   */
  restore?(exePath: string, backupPath: string): Promise<{ success: boolean; message: string }>

  /**
   * Cleanup routine (called on app exit)
   */
  cleanup?(): Promise<void>
}

/**
 * Cache entry for DRM detection results
 */
export interface DrmCacheEntry {
  appId: string
  detected: boolean
  drmTypes: string[]
  timestamp: number
  exeHash: string // Hash of executable to invalidate cache if file changes
  ttlMs: number // Time to live in milliseconds
}

/**
 * Version-specific DRM handling data
 */
export interface VersionSpecificData {
  gameId: string
  gameVersion: string
  worksWith: string[] // ['OnlineFix', 'GOG', 'patch-X.Y.Z']
  notes?: string
  lastUpdated: string
  communityContributed: boolean
}
