/**
 * DRM Plugin Base Interface
 * ============================================================================
 * Defines the contract for all DRM detection and removal plugins.
 * Plugins implement specific DRM detection logic and removal strategies.
 * ============================================================================
 */

/**
 * Detected DRM information with confidence scoring
 */
export interface DrmDetectionResult {
  /** Type of DRM detected (e.g., "steamstub", "ceg", "denuvo", "securom") */
  type: string

  /** Confidence level: 0-100 (100 = certain, 0 = not detected) */
  confidence: number

  /** Human-readable description of detection */
  description: string

  /** Location/path where DRM was detected */
  detectedPath?: string

  /** Additional metadata about the DRM instance */
  metadata?: Record<string, any>

  /** Risk level for attempting removal: 'low' | 'medium' | 'high' | 'critical' */
  riskLevel: 'low' | 'medium' | 'high' | 'critical'
}

/**
 * Result of DRM removal attempt
 */
export interface DrmRemovalResult {
  /** Whether removal was successful */
  success: boolean

  /** Human-readable message about the operation */
  message: string

  /** Whether the game had DRM before removal attempt */
  hadDrm: boolean

  /** Path to backup of original file (if created) */
  backupPath?: string

  /** Path to the modified/unpacked executable */
  exePath?: string

  /** Detailed error information if unsuccessful */
  error?: {
    code: string
    details: string
    recoverable: boolean
  }
}

/**
 * DRM Plugin Interface
 * All DRM detection/removal implementations must conform to this interface
 */
export interface IDrmPlugin {
  /** Unique identifier for this plugin (lowercase, hyphenated) */
  readonly id: string

  /** Display name for user interfaces */
  readonly name: string

  /** Version of this plugin implementation */
  readonly version: string

  /** Risk level of using this plugin's removal method */
  readonly riskLevel: 'low' | 'medium' | 'high' | 'critical'

  /** Whether this plugin supports removal on the current platform */
  readonly supportsCurrentPlatform: boolean

  /**
   * Detect if this DRM type is present in the given executable
   *
   * @param exePath - Full path to the game executable to scan
   * @returns Detection result with confidence score
   * @throws Error if file cannot be read or parsed
   */
  detect(exePath: string): Promise<DrmDetectionResult>

  /**
   * Attempt to remove DRM from the given executable
   * Should create backups before modification
   *
   * @param exePath - Full path to the game executable
   * @param options - Optional removal parameters
   * @returns Removal result with success status and details
   * @throws Error if removal cannot be attempted or backup fails
   */
  remove(exePath: string, options?: RemovalOptions): Promise<DrmRemovalResult>

  /**
   * Restore original executable from backup
   * Should be idempotent (safe to call multiple times)
   *
   * @param exePath - Full path to the modified game executable
   * @returns Whether restoration was successful
   */
  restore(exePath: string): Promise<boolean>

  /**
   * Check if the plugin is properly initialized and ready to use
   * Verify any external dependencies (tools, DLLs, etc.)
   *
   * @returns Whether the plugin is ready for use
   */
  isReady(): Promise<boolean>

  /**
   * Get human-readable status information about this plugin
   * Used for UI display and debugging
   *
   * @returns Status information
   */
  getStatus(): Promise<PluginStatus>
}

/**
 * Options for DRM removal operations
 */
export interface RemovalOptions {
  /** Override whether to keep a backup */
  keepBackup?: boolean

  /** Directory to store backups (if not in exe directory) */
  backupDir?: string

  /** Whether to attempt aggressive removal methods */
  aggressive?: boolean

  /** Additional metadata to include in backup manifest */
  metadata?: Record<string, any>
}

/**
 * Plugin status information
 */
export interface PluginStatus {
  /** Whether plugin is ready */
  ready: boolean

  /** Current status message */
  message: string

  /** Any issues or warnings */
  issues: string[]

  /** Required dependencies that are missing */
  missingDependencies: string[]
}

/**
 * Base class for DRM plugins
 * Provides common utility methods and error handling
 */
export abstract class BaseDrmPlugin implements IDrmPlugin {
  abstract readonly id: string
  abstract readonly name: string
  abstract readonly version: string
  abstract readonly riskLevel: 'low' | 'medium' | 'high' | 'critical'

  readonly supportsCurrentPlatform: boolean = process.platform === 'win32'

  abstract detect(exePath: string): Promise<DrmDetectionResult>
  abstract remove(exePath: string, options?: RemovalOptions): Promise<DrmRemovalResult>
  abstract restore(exePath: string): Promise<boolean>
  abstract isReady(): Promise<boolean>
  abstract getStatus(): Promise<PluginStatus>

  /**
   * Validate that a file path is safe and accessible
   * Prevents path traversal attacks
   */
  protected async validateExecutablePath(exePath: string): Promise<void> {
    const fs = await import('fs').then((m) => m.promises)
    const path = await import('path')

    try {
      const stat = await fs.stat(exePath)
      if (!stat.isFile()) {
        throw new Error(`Path is not a file: ${exePath}`)
      }
    } catch (err) {
      throw new Error(`Cannot access executable: ${err instanceof Error ? err.message : 'unknown error'}`)
    }
  }

  /**
   * Create a timestamped backup of the original executable
   */
  protected async createBackup(exePath: string, suffix: string = '.bak'): Promise<string> {
    const fs = await import('fs').then((m) => m.promises)
    const backupPath = exePath + suffix
    await fs.copyFile(exePath, backupPath)
    return backupPath
  }

  /**
   * Calculate SHA1 hash of a file for integrity verification
   */
  protected async calculateFileHash(filePath: string): Promise<string> {
    const fs = await import('fs').then((m) => m)
    const crypto = await import('crypto')

    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha1')
      const stream = fs.createReadStream(filePath)
      stream.on('data', (chunk) => hash.update(chunk))
      stream.on('end', () => resolve(hash.digest('hex')))
      stream.on('error', reject)
    })
  }
}
