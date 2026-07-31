/**
 * Cross-Platform Environment Setup
 * Fixes issues: #9 (line endings), #10 (PATH separator), #16 (user data paths)
 * Provides normalized configuration across all platforms
 */

import fs from 'fs'
import path from 'path'
import { PlatformUtils, FileUtils } from './platform-abstraction'
import { logger } from '../logger'

/**
 * Environment setup and configuration normalization
 */
export class EnvironmentSetup {
  /**
   * Initialize platform-specific environment
   * Call once at app startup
   */
  static initialize(): void {
    this.setupPathEnvironment()
    this.setupFileHandling()
  }

  /**
   * Fix #10: Setup PATH environment variable with correct separator
   */
  private static setupPathEnvironment(): void {
    try {
      const currentPath = process.env.PATH ?? ''
      const separator = PlatformUtils.getPathSeparator()

      // Verify PATH has correct separator
      if (currentPath && !currentPath.includes(separator)) {
        // Convert to correct separator
        const paths = currentPath.split(process.platform === 'win32' ? ':' : ';')
        process.env.PATH = paths.join(separator)
        logger.debug(`Updated PATH with correct separator for ${process.platform}`, 'setup')
      }
    } catch (error) {
      logger.warn(`Failed to setup PATH: ${error}`, 'setup')
    }
  }

  /**
   * Fix #9: Setup file handling with normalized line endings
   */
  private static setupFileHandling(): void {
    try {
      // All text files should use LF internally, even on Windows
      // Line ending conversion handled by FileUtils functions
      logger.debug('File handling initialized with LF normalization', 'setup')
    } catch (error) {
      logger.warn(`Failed to setup file handling: ${error}`, 'setup')
    }
  }

  /**
   * Get application data directory with platform-specific path
   */
  static getAppDataDir(appName: string): string {
    return PlatformUtils.getUserDataPath(appName)
  }

  /**
   * Get application cache directory with platform-specific path
   */
  static getCacheDir(appName: string): string {
    return PlatformUtils.getCachePath(appName)
  }

  /**
   * Get application temp directory
   */
  static getTempDir(appName: string): string {
    return PlatformUtils.getTempPath(appName)
  }

  /**
   * Ensure directory exists with proper structure
   */
  static ensureDir(dirPath: string): void {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true })
    }
  }

  /**
   * Write configuration file with normalized line endings
   * Fix #9: Always use LF, never CRLF
   */
  static writeConfig(filePath: string, data: any): void {
    try {
      const content = JSON.stringify(data, null, 2)
      FileUtils.writeFileWithNormalizedLineEndings(filePath, content)
      logger.debug(`Config written to ${filePath}`, 'setup')
    } catch (error) {
      logger.error(`Failed to write config: ${error}`, 'setup')
      throw error
    }
  }

  /**
   * Read configuration file with normalized line endings
   */
  static readConfig(filePath: string): any {
    try {
      const content = FileUtils.readFileWithNormalizedLineEndings(filePath)
      return JSON.parse(content)
    } catch (error) {
      logger.error(`Failed to read config: ${error}`, 'setup')
      throw error
    }
  }

  /**
   * Write secure file with restricted permissions
   * Fix #20: Cross-platform permission handling
   */
  static writeSecureFile(filePath: string, data: string): void {
    try {
      FileUtils.createSecureFile(filePath, data, 0o600)
      logger.debug(`Secure file written to ${filePath}`, 'setup')
    } catch (error) {
      logger.error(`Failed to write secure file: ${error}`, 'setup')
      throw error
    }
  }

  /**
   * Check if running on Windows
   */
  static isWindows(): boolean {
    return PlatformUtils.isWindows()
  }

  /**
   * Check if running on macOS
   */
  static isMacOS(): boolean {
    return PlatformUtils.isMacOS()
  }

  /**
   * Check if running on Linux
   */
  static isLinux(): boolean {
    return PlatformUtils.isLinux()
  }

  /**
   * Get platform name for logging
   */
  static getPlatformName(): string {
    if (this.isWindows()) return 'Windows'
    if (this.isMacOS()) return 'macOS'
    if (this.isLinux()) return 'Linux'
    return process.platform
  }
}

/**
 * Configuration file normalizer
 * Ensures all config files use consistent line endings
 */
export class ConfigNormalizer {
  /**
   * Normalize all JSON config files in directory
   * Fix #9: Convert CRLF to LF across all platforms
   */
  static async normalizeDirectory(dirPath: string): Promise<void> {
    try {
      const files = fs.readdirSync(dirPath)

      for (const file of files) {
        if (file.endsWith('.json') || file.endsWith('.yaml') || file.endsWith('.yml')) {
          const filePath = path.join(dirPath, file)
          await this.normalizeFile(filePath)
        }
      }
    } catch (error) {
      logger.warn(`Failed to normalize config directory: ${error}`, 'setup')
    }
  }

  /**
   * Normalize single config file
   */
  static async normalizeFile(filePath: string): Promise<void> {
    try {
      const content = FileUtils.readFileWithNormalizedLineEndings(filePath)
      FileUtils.writeFileWithNormalizedLineEndings(filePath, content)
      logger.debug(`Normalized line endings in ${filePath}`, 'setup')
    } catch (error) {
      logger.warn(`Failed to normalize file ${filePath}: ${error}`, 'setup')
    }
  }
}

export default EnvironmentSetup
