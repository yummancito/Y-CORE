/**
 * Cross-Platform Binary Loader
 * Fixes issues: #1 (DLL loading), #2 (YARA binary), #21 (7-Zip binary)
 */

import path from 'path'
import fs from 'fs'
import { logger } from '../logger'
import { ProcessManager, CommandUtils, ArchUtils, PlatformUtils } from './platform-abstraction'

/**
 * Loads platform-specific binaries with fallback chains
 */
export class BinaryLoader {
  private binariesDir: string
  private loadedBinaries: Map<string, string | null> = new Map()
  private loadErrors: Map<string, Error> = new Map()

  constructor(binariesDir: string = path.join(__dirname, 'binaries')) {
    this.binariesDir = binariesDir
  }

  /**
   * Try to load DLL/native bindings (Windows only)
   * Fix #1: Gracefully disable on non-Windows, with proper error handling
   */
  async loadOpenSteamToolDLL(): Promise<boolean> {
    if (!PlatformUtils.isWindows()) {
      logger.info('OpenSteamTool DLL loading skipped on non-Windows platform', 'dll')
      return false
    }

    const dllPath = path.join(this.binariesDir, 'OpenSteamTool.dll')
    const nodePath = path.join(this.binariesDir, 'OpenSteamTool.node')

    if (!fs.existsSync(dllPath)) {
      logger.warn('OpenSteamTool.dll not found in binaries directory', 'dll')
      return false
    }

    try {
      // Add DLL directory to PATH for child processes
      const currentPath = process.env.PATH ?? ''
      const separator = PlatformUtils.getPathSeparator()
      process.env.PATH = `${this.binariesDir}${separator}${currentPath}`

      // Try to load .node binding if available
      if (fs.existsSync(nodePath)) {
        try {
          require(nodePath)
          logger.info('OpenSteamTool native bindings loaded successfully', 'dll')
          return true
        } catch (nodeErr: any) {
          logger.debug(`OpenSteamTool.node binding failed: ${nodeErr.message}`, 'dll')
          // Fallback to DLL in PATH is OK
        }
      }

      logger.info('OpenSteamTool DLLs available in PATH for child processes', 'dll')
      return true
    } catch (error: any) {
      logger.warn(`Failed to load OpenSteamTool: ${error.message}`, 'dll')
      this.loadErrors.set('OpenSteamTool', error)
      return false
    }
  }

  /**
   * Find or fallback YARA binary
   * Fix #2: Search bundled binary first, then system PATH
   */
  async getYaraBinaryPath(): Promise<string | null> {
    const cacheKey = 'yara'
    if (this.loadedBinaries.has(cacheKey)) {
      return this.loadedBinaries.get(cacheKey) ?? null
    }

    // Try bundled binary first
    const bundledPath = this.getBinaryPath('yara', 'yara')
    if (bundledPath && fs.existsSync(bundledPath)) {
      logger.debug(`Using bundled YARA binary: ${bundledPath}`, 'malware')
      this.loadedBinaries.set(cacheKey, bundledPath)
      return bundledPath
    }

    // Fallback to system PATH
    try {
      const { stdout } = await CommandUtils.execute(
        PlatformUtils.isWindows() ? 'where' : 'which',
        PlatformUtils.isWindows() ? ['yara.exe'] : ['yara']
      )
      const systemYara = stdout.trim().split('\n')[0]
      if (systemYara) {
        logger.debug(`Using system YARA binary: ${systemYara}`, 'malware')
        this.loadedBinaries.set(cacheKey, systemYara)
        return systemYara
      }
    } catch (error) {
      logger.debug(`System YARA not found: ${error}`, 'malware')
    }

    logger.warn('YARA binary not found - malware scanning will be skipped', 'malware')
    this.loadedBinaries.set(cacheKey, null)
    return null
  }

  /**
   * Get 7-Zip binary path with architecture support
   * Fix #21: Support both x64 and ARM64
   */
  getSevenZipPath(): string | null {
    const cacheKey = '7zip'
    if (this.loadedBinaries.has(cacheKey)) {
      return this.loadedBinaries.get(cacheKey) ?? null
    }

    try {
      const arch = ArchUtils.getArch()
      const platformName = PlatformUtils.isWindows() ? 'windows' : PlatformUtils.isMacOS() ? 'macos' : 'linux'

      // Build path: 7zip-windows-x64, 7zip-macos-arm64, etc.
      const binaryName = `7zip-${platformName}-${arch}`
      const extension = PlatformUtils.isWindows() ? '.exe' : ''
      const binaryPath = path.join(this.binariesDir, binaryName, PlatformUtils.isWindows() ? '7z.exe' : '7z')

      if (fs.existsSync(binaryPath)) {
        logger.debug(`Using 7-Zip binary: ${binaryPath}`, 'archive')
        this.loadedBinaries.set(cacheKey, binaryPath)
        return binaryPath
      }

      // Fallback: check if system has 7z
      logger.warn(`7-Zip binary not found for ${platformName}-${arch}`, 'archive')
      this.loadedBinaries.set(cacheKey, null)
      return null
    } catch (error: any) {
      logger.warn(`7-Zip lookup failed: ${error.message}`, 'archive')
      this.loadedBinaries.set(cacheKey, null)
      return null
    }
  }

  /**
   * Get binary path with platform and arch support
   */
  private getBinaryPath(binaryName: string, fileBaseName: string): string | null {
    try {
      const arch = ArchUtils.getArch()
      const platformName = PlatformUtils.isWindows() ? 'windows' : PlatformUtils.isMacOS() ? 'macos' : 'linux'

      const dirName = `${binaryName}-${platformName}-${arch}`
      const extension = PlatformUtils.isWindows() ? '.exe' : ''

      const fullPath = path.join(this.binariesDir, dirName, `${fileBaseName}${extension}`)
      return fullPath
    } catch (error) {
      return null
    }
  }

  /**
   * Register a custom binary
   */
  registerBinary(name: string, path: string): void {
    this.loadedBinaries.set(name, path)
  }

  /**
   * Get registered binary
   */
  getBinary(name: string): string | null {
    return this.loadedBinaries.get(name) ?? null
  }

  /**
   * Get all load errors
   */
  getLoadErrors(): Map<string, Error> {
    return this.loadErrors
  }

  /**
   * Check if binary is available
   */
  isBinaryAvailable(name: string): boolean {
    return this.loadedBinaries.has(name) && this.loadedBinaries.get(name) !== null
  }
}

// Singleton instance
let binaryLoaderInstance: BinaryLoader | null = null

export function getBinaryLoader(): BinaryLoader {
  if (!binaryLoaderInstance) {
    binaryLoaderInstance = new BinaryLoader()
  }
  return binaryLoaderInstance
}

export default BinaryLoader
