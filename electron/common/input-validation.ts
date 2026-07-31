/**
 * Input Validation Utilities
 * Comprehensive validation and sanitization for all user inputs
 * Fixes for edge cases 1-51
 */

// ============================================================================
// Search & Query Validation (Issues #1-7)
// ============================================================================

/**
 * Issue #1: Empty Search String
 * Issue #6: Query with Only Whitespace
 */
export function validateSearchQuery(query: string | null | undefined): {
  valid: boolean
  error?: string
  sanitized?: string
} {
  if (!query || typeof query !== 'string') {
    return { valid: false, error: 'Search query must be a non-empty string' }
  }

  const trimmed = query.trim()
  if (trimmed.length === 0) {
    return { valid: false, error: 'Search query cannot be empty or whitespace only' }
  }

  return { valid: true, sanitized: trimmed }
}

/**
 * Issue #2: Extremely Long Search String (10,000+ characters)
 */
export function validateSearchLength(query: string, maxLength: number = 500): {
  valid: boolean
  error?: string
} {
  if (query.length > maxLength) {
    return {
      valid: false,
      error: `Search query exceeds maximum length of ${maxLength} characters (got ${query.length})`,
    }
  }

  return { valid: true }
}

/**
 * Issue #3: Regex Special Characters in Search
 */
export function escapeLikeSpecialChars(str: string): string {
  // Escape SQL LIKE special characters: % and _
  return str.replace(/[%_]/g, '\\$&')
}

/**
 * Issue #4: Non-ASCII Characters in Search (UTF-8 validation)
 */
export function validateUTF8(str: string): { valid: boolean; error?: string } {
  try {
    // Check if string is valid UTF-8
    const buf = Buffer.from(str, 'utf8')
    const decoded = buf.toString('utf8')
    if (decoded !== str) {
      return { valid: false, error: 'Invalid UTF-8 encoding detected' }
    }
    return { valid: true }
  } catch (err) {
    return { valid: false, error: 'Invalid UTF-8 encoding' }
  }
}

/**
 * Issue #5: Null or Undefined Query Parameter
 */
export function isValidString(value: any): boolean {
  return typeof value === 'string' && value !== null && value !== undefined
}

/**
 * Issue #7: Query Parameter Type Mismatch
 */
export function validateModSearchQuery(query: any): {
  valid: boolean
  error?: string
} {
  if (!query || typeof query !== 'object') {
    return { valid: false, error: 'Query must be an object' }
  }

  const requiredFields = ['gameAppId', 'searchText']
  for (const field of requiredFields) {
    if (!(field in query)) {
      return { valid: false, error: `Missing required field: ${field}` }
    }
    if (typeof query[field] !== 'string') {
      return { valid: false, error: `Field ${field} must be a string` }
    }
  }

  return { valid: true }
}

// ============================================================================
// File Path & I/O Validation (Issues #8-15)
// ============================================================================

/**
 * Issue #8: Path with Spaces in Directories
 * Issue #9: Path with Unicode Characters
 * Normalize and validate paths
 */
export function normalizePath(filePath: string): {
  valid: boolean
  normalized?: string
  error?: string
} {
  if (!filePath || typeof filePath !== 'string') {
    return { valid: false, error: 'Path must be a non-empty string' }
  }

  try {
    const path = require('path')
    // Normalize to canonical form
    const normalized = path.normalize(filePath)

    // For Unicode: normalize to NFC form
    const nfcPath = normalized.normalize('NFC')

    return { valid: true, normalized: nfcPath }
  } catch (err) {
    return { valid: false, error: `Invalid path: ${err instanceof Error ? err.message : 'unknown'}` }
  }
}

/**
 * Issue #10: Extremely Long File Paths (>500 chars)
 * Windows MAX_PATH is 260, but with UNC paths can be longer
 */
export function validatePathLength(
  filePath: string,
  maxLength: number = 260
): { valid: boolean; error?: string } {
  if (filePath.length > maxLength) {
    return {
      valid: false,
      error: `Path exceeds maximum length of ${maxLength} characters (got ${filePath.length})`,
    }
  }

  return { valid: true }
}

/**
 * Issue #11: Path Traversal Attack (../ in modId)
 * Whitelist approach - only allow alphanumeric, dash, underscore
 */
export function validateModId(modId: string): {
  valid: boolean
  error?: string
} {
  if (!modId || typeof modId !== 'string') {
    return { valid: false, error: 'ModId must be a non-empty string' }
  }

  // Whitelist: only alphanumeric, dash, underscore, 1-100 chars
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(modId)) {
    return {
      valid: false,
      error: 'ModId must contain only alphanumeric characters, dashes, and underscores (max 100 chars)',
    }
  }

  // Additional check: prevent path traversal patterns
  if (modId.includes('..') || modId.includes('/') || modId.includes('\\')) {
    return { valid: false, error: 'ModId contains invalid path characters' }
  }

  return { valid: true }
}

/**
 * Issue #11: Also validate GameAppId
 */
export function validateGameAppId(gameAppId: string): {
  valid: boolean
  error?: string
} {
  if (!gameAppId || typeof gameAppId !== 'string') {
    return { valid: false, error: 'GameAppId must be a non-empty string' }
  }

  // Similar whitelist as modId
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(gameAppId)) {
    return {
      valid: false,
      error: 'GameAppId must contain only alphanumeric characters, dashes, and underscores (max 100 chars)',
    }
  }

  return { valid: true }
}

/**
 * Issue #12: Symlinks and Circular Symlinks
 * Detect symlinks and prevent circular references
 */
export function detectSymlinks(dirPath: string): {
  valid: boolean
  hasSymlinks: boolean
  symlinks?: string[]
  error?: string
} {
  try {
    const fs = require('fs')
    const path = require('path')
    const symlinks: string[] = []

    const walk = (dir: string, visited = new Set<string>()): boolean => {
      const realPath = fs.realpathSync(dir)

      // Check for circular reference
      if (visited.has(realPath)) {
        return true // Circular
      }

      visited.add(realPath)

      const entries = fs.readdirSync(dir)
      for (const entry of entries) {
        const fullPath = path.join(dir, entry)
        const stat = fs.lstatSync(fullPath)

        if (stat.isSymbolicLink()) {
          symlinks.push(fullPath)
        }

        if (stat.isDirectory() && !stat.isSymbolicLink()) {
          if (walk(fullPath, visited)) {
            return true
          }
        }
      }

      return false
    }

    const hasCircular = walk(dirPath)

    return {
      valid: !hasCircular,
      hasSymlinks: symlinks.length > 0,
      symlinks,
      error: hasCircular ? 'Circular symlinks detected' : undefined,
    }
  } catch (err) {
    return {
      valid: false,
      hasSymlinks: false,
      error: `Failed to check symlinks: ${err instanceof Error ? err.message : 'unknown'}`,
    }
  }
}

/**
 * Issue #13: File Permission Denied
 */
export function testWritePermission(dirPath: string): { valid: boolean; error?: string } {
  try {
    const fs = require('fs')
    const path = require('path')

    const testFile = path.join(dirPath, '.ycore-write-test-' + Date.now())
    fs.writeFileSync(testFile, 'test')
    fs.unlinkSync(testFile)
    return { valid: true }
  } catch (err) {
    return { valid: false, error: `No write permission: ${err instanceof Error ? err.message : 'unknown'}` }
  }
}

/**
 * Issue #15: Disk Space Check
 */
export function checkDiskSpace(
  dirPath: string,
  requiredBytes: number
): { valid: boolean; available?: number; error?: string } {
  try {
    // Using synchronous fs to get basic info
    const fs = require('fs')
    const stat = fs.statfsSync(dirPath)

    // stat.bavail = available blocks, stat.bsize = block size
    const available = stat.bavail * stat.bsize

    if (available < requiredBytes) {
      return {
        valid: false,
        available,
        error: `Insufficient disk space. Required: ${formatBytes(requiredBytes)}, Available: ${formatBytes(available)}`,
      }
    }

    return { valid: true, available }
  } catch (err) {
    return { valid: false, error: `Failed to check disk space: ${err instanceof Error ? err.message : 'unknown'}` }
  }
}

// ============================================================================
// Configuration Validation (Issues #27-31)
// ============================================================================

/**
 * Issue #27: Config File with Invalid JSON
 */
export function parseConfigSafely(
  jsonStr: string,
  fallback: any = {}
): { success: boolean; data: any; error?: string } {
  try {
    const data = JSON.parse(jsonStr)
    return { success: true, data }
  } catch (err) {
    return {
      success: false,
      data: fallback,
      error: `Invalid JSON: ${err instanceof Error ? err.message : 'unknown'}`,
    }
  }
}

/**
 * Issue #28: Config with Missing Required Fields
 */
export function validateConfigShape(
  config: any,
  requiredFields: string[]
): { valid: boolean; error?: string } {
  if (!config || typeof config !== 'object') {
    return { valid: false, error: 'Config must be an object' }
  }

  for (const field of requiredFields) {
    if (!(field in config)) {
      return { valid: false, error: `Config missing required field: ${field}` }
    }
  }

  return { valid: true }
}

/**
 * Issue #29: Config with Null Values Where Not Allowed
 */
export function validateConfigTypes(config: any, typeMap: Record<string, string>): {
  valid: boolean
  error?: string
} {
  for (const [field, expectedType] of Object.entries(typeMap)) {
    if (field in config) {
      const actualType = typeof config[field]
      if (actualType !== expectedType) {
        return {
          valid: false,
          error: `Config field ${field} must be ${expectedType}, got ${actualType}`,
        }
      }

      // Check for empty strings when type is string and value required
      if (expectedType === 'string' && !config[field]) {
        return { valid: false, error: `Config field ${field} must be a non-empty string` }
      }
    }
  }

  return { valid: true }
}

/**
 * Issue #30: Invalid Config Values (0 or Negative Numbers)
 */
export function validateNumericConfig(
  value: any,
  fieldName: string,
  minValue: number = 0,
  maxValue?: number
): { valid: boolean; error?: string } {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    return { valid: false, error: `${fieldName} must be an integer` }
  }

  if (value <= minValue) {
    return { valid: false, error: `${fieldName} must be greater than ${minValue}` }
  }

  if (maxValue !== undefined && value > maxValue) {
    return { valid: false, error: `${fieldName} must not exceed ${maxValue}` }
  }

  return { valid: true }
}

/**
 * Issue #31: Environment Variable with Invalid API Key Format
 */
export function validateApiKeyFormat(apiKey: string | undefined): {
  valid: boolean
  error?: string
} {
  if (!apiKey) {
    return { valid: false, error: 'API_KEY environment variable not set' }
  }

  // Example: must be hex, 32 chars
  if (!/^[0-9a-f]{32}$/i.test(apiKey)) {
    return { valid: false, error: 'API_KEY format invalid (must be 32-char hex)' }
  }

  return { valid: true }
}

// ============================================================================
// Mod Management Validation (Issues #33-40)
// ============================================================================

/**
 * Issue #33: Mod with 0 Bytes Size
 */
export function validateModFileSize(fileSize: any): { valid: boolean; error?: string } {
  if (typeof fileSize !== 'number' || fileSize <= 0) {
    return { valid: false, error: 'Mod file size must be greater than 0 bytes' }
  }

  return { valid: true }
}

/**
 * Issue #34: Mod with 100GB+ Size (warn but don't block)
 */
export function checkUnusuallyLargeFile(fileSize: number): { warning?: string } {
  const MAX_REASONABLE_MOD_SIZE = 50 * 1024 * 1024 * 1024 // 50GB

  if (fileSize > MAX_REASONABLE_MOD_SIZE) {
    return { warning: `Unusually large mod detected: ${formatBytes(fileSize)}` }
  }

  return {}
}

/**
 * Issue #35: Mod with No Name or Empty Name
 * Issue #36: Mod with 1000-Character Name
 */
export function validateModName(name: any): { valid: boolean; error?: string; displayName?: string } {
  if (!name || typeof name !== 'string') {
    return { valid: true, displayName: '(Unnamed Mod)' }
  }

  const trimmed = name.trim()
  if (!trimmed) {
    return { valid: true, displayName: '(Unnamed Mod)' }
  }

  const MAX_NAME_LENGTH = 100
  if (trimmed.length > MAX_NAME_LENGTH) {
    const truncated = trimmed.substring(0, MAX_NAME_LENGTH) + '...'
    return { valid: true, displayName: truncated }
  }

  return { valid: true, displayName: trimmed }
}

/**
 * Issue #38: Circular Mod Dependencies
 */
export function detectCircularDependencies(
  modId: string,
  dependencies: string[],
  allMods: Record<string, any>
): { hasCircular: boolean; path?: string[] } {
  const visited = new Set<string>()
  const recursionStack = new Set<string>()

  const hasCycle = (id: string, path: string[] = []): string[] | null => {
    if (recursionStack.has(id)) {
      return [...path, id] // Found cycle
    }
    if (visited.has(id)) {
      return null
    }

    visited.add(id)
    recursionStack.add(id)

    const mod = allMods[id]
    if (mod && mod.dependencies) {
      for (const depId of mod.dependencies) {
        const cyclePath = hasCycle(depId, [...path, id])
        if (cyclePath) {
          return cyclePath
        }
      }
    }

    recursionStack.delete(id)
    return null
  }

  const cyclePath = hasCycle(modId)
  return {
    hasCircular: cyclePath !== null,
    path: cyclePath || undefined,
  }
}

/**
 * Issue #39: Mod Depends on Non-Existent Mod
 */
export function validateDependencies(
  dependencies: string[],
  availableModIds: Set<string>
): { valid: boolean; missing?: string[] } {
  const missing: string[] = []

  for (const depId of dependencies || []) {
    if (!availableModIds.has(depId)) {
      missing.push(depId)
    }
  }

  return {
    valid: missing.length === 0,
    missing: missing.length > 0 ? missing : undefined,
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i]
}

export interface ValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
  data?: any
}

export function combineValidations(...validations: any[]): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []
  const data: any = {}

  for (const result of validations) {
    if (result.error) errors.push(result.error)
    if (result.errors) errors.push(...result.errors)
    if (result.warning) warnings.push(result.warning)
    if (result.warnings) warnings.push(...result.warnings)
    if (result.data) Object.assign(data, result.data)
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    data: Object.keys(data).length > 0 ? data : undefined,
  }
}
