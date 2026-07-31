/**
 * Cross-Platform Abstraction Layer
 * Centralizes platform-specific code and provides consistent APIs
 * Fixes issues: #1, #6, #7, #8, #10, #16, #20
 */

import { promisify } from 'util'
import { execFile } from 'child_process'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { platform } from 'os'
import { statfs } from 'fs'

const execFileAsync = promisify(execFile)

/**
 * Platform detection utilities
 */
export const PlatformUtils = {
  isWindows: () => process.platform === 'win32',
  isMacOS: () => process.platform === 'darwin',
  isLinux: () => process.platform === 'linux',

  /**
   * Get the appropriate PATH separator for current platform
   * Fix #10: Handles both Windows (;) and Unix (:)
   */
  getPathSeparator: (): string => {
    return process.platform === 'win32' ? ';' : ':'
  },

  /**
   * Get appropriate user data directory
   * Fix #16: LOCALAPPDATA fallback with XDG support
   */
  getUserDataPath: (appName: string): string => {
    if (process.platform === 'win32') {
      return path.join(process.env.LOCALAPPDATA || os.homedir(), appName)
    } else if (process.platform === 'darwin') {
      return path.join(os.homedir(), 'Library', 'Application Support', appName)
    } else {
      // Linux: follow XDG Base Directory spec
      const xdgDataHome = process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share')
      return path.join(xdgDataHome, appName)
    }
  },

  /**
   * Get appropriate cache directory
   */
  getCachePath: (appName: string): string => {
    if (process.platform === 'win32') {
      return path.join(process.env.LOCALAPPDATA || os.homedir(), appName, 'Cache')
    } else if (process.platform === 'darwin') {
      return path.join(os.homedir(), 'Library', 'Caches', appName)
    } else {
      const xdgCacheHome = process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache')
      return path.join(xdgCacheHome, appName)
    }
  },

  /**
   * Get appropriate temp directory
   * Uses OS tmpdir with app-specific subdirectory
   */
  getTempPath: (appName: string): string => {
    return path.join(os.tmpdir(), `${appName}-temp`)
  },
}

/**
 * Process management - platform-specific
 * Fix #6: Abstracts process killing across platforms
 */
export const ProcessManager = {
  /**
   * Kill process by name (cross-platform)
   */
  async killProcessByName(processName: string, force = true): Promise<boolean> {
    try {
      if (process.platform === 'win32') {
        const forceFlag = force ? '/F' : ''
        await execFileAsync('taskkill', ['/IM', processName, forceFlag].filter(Boolean), {
          timeout: 5000,
        })
        return true
      } else if (process.platform === 'darwin') {
        // macOS: use killall
        const signal = force ? '-9' : '-TERM'
        await execFileAsync('killall', [signal, processName], { timeout: 5000 })
        return true
      } else if (process.platform === 'linux') {
        // Linux: use pkill
        const signal = force ? '-9' : '-TERM'
        await execFileAsync('pkill', [signal, processName], { timeout: 5000 })
        return true
      }
      return false
    } catch (error: any) {
      if (error.message?.includes('ENOENT')) {
        // Process doesn't exist - not an error
        return false
      }
      throw error
    }
  },

  /**
   * Kill process by PID (cross-platform)
   */
  async killProcessByPid(pid: number, force = true): Promise<boolean> {
    try {
      if (process.platform === 'win32') {
        const forceFlag = force ? '/F' : ''
        await execFileAsync('taskkill', ['/PID', String(pid), forceFlag].filter(Boolean), {
          timeout: 5000,
        })
        return true
      } else {
        // Unix: use kill
        const signal = force ? '-9' : '-TERM'
        await execFileAsync('kill', [signal, String(pid)], { timeout: 5000 })
        return true
      }
      return false
    } catch (error: any) {
      if (error.message?.includes('ENOENT')) {
        return false
      }
      throw error
    }
  },

  /**
   * Check if process is running by name
   */
  async isProcessRunning(processName: string): Promise<boolean> {
    try {
      if (process.platform === 'win32') {
        const { stdout } = await execFileAsync('tasklist', ['/FI', `IMAGENAME eq ${processName}`], {
          timeout: 5000,
        })
        return stdout.includes(processName)
      } else if (process.platform === 'darwin') {
        const { stdout } = await execFileAsync('pgrep', ['-l', processName], { timeout: 5000 })
        return stdout.trim().length > 0
      } else if (process.platform === 'linux') {
        const { stdout } = await execFileAsync('pgrep', [processName], { timeout: 5000 })
        return stdout.trim().length > 0
      }
      return false
    } catch {
      return false
    }
  },

  /**
   * Get process PID by name
   */
  async getProcessPid(processName: string): Promise<number | null> {
    try {
      if (process.platform === 'win32') {
        const { stdout } = await execFileAsync('tasklist', ['/FI', `IMAGENAME eq ${processName}`, '/FO', 'CSV'], {
          timeout: 5000,
        })
        const lines = stdout.split('\n')
        if (lines.length > 1) {
          const parts = lines[1].split(',')
          const pid = parseInt(parts[1]?.replace(/"/g, ''))
          return !isNaN(pid) ? pid : null
        }
      } else if (process.platform === 'darwin' || process.platform === 'linux') {
        const { stdout } = await execFileAsync('pgrep', ['-f', processName], { timeout: 5000 })
        const pid = parseInt(stdout.split('\n')[0])
        return !isNaN(pid) ? pid : null
      }
      return null
    } catch {
      return null
    }
  },
}

/**
 * Disk space management - platform-independent
 * Fix #7: Uses statfs instead of fsutil
 */
export const DiskSpaceManager = {
  /**
   * Get disk space info for a path
   * Returns available and total space in bytes
   */
  async getSpaceInfo(targetPath: string): Promise<{ available: number; total: number }> {
    return new Promise((resolve, reject) => {
      if (!fs.existsSync(targetPath)) {
        fs.mkdirSync(targetPath, { recursive: true })
      }

      statfs(targetPath, (err, stats) => {
        if (err) {
          console.warn(`statfs failed for ${targetPath}: ${err.message}`)
          return resolve({ available: 0, total: 0 })
        }

        try {
          // Both Windows and Unix return blocks/bavail
          const blockSize = stats.bsize || 4096
          const total = stats.blocks * blockSize
          const available = stats.bavail * blockSize

          resolve({ available, total })
        } catch (error) {
          console.warn(`Error calculating disk space: ${error}`)
          resolve({ available: 0, total: 0 })
        }
      })
    })
  },

  /**
   * Check if enough space is available
   */
  async hasEnoughSpace(targetPath: string, requiredBytes: number): Promise<boolean> {
    const space = await this.getSpaceInfo(targetPath)
    return space.available >= requiredBytes
  },

  /**
   * Get human-readable space string
   */
  formatBytes(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB', 'TB']
    let size = bytes
    let unitIndex = 0

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024
      unitIndex++
    }

    return `${size.toFixed(2)} ${units[unitIndex]}`
  },
}

/**
 * Command execution utilities
 * Fix #8: Always use execFile instead of exec for safety
 */
export const CommandUtils = {
  /**
   * Execute command safely without shell interpretation
   */
  async execute(command: string, args: string[] = []): Promise<{ stdout: string; stderr: string }> {
    try {
      const { stdout, stderr } = await execFileAsync(command, args, { timeout: 30000 })
      return { stdout, stderr }
    } catch (error: any) {
      throw new Error(`Command failed: ${command} ${args.join(' ')} - ${error.message}`)
    }
  },

  /**
   * Execute shell command with proper platform handling
   * Use only when shell features are absolutely necessary
   */
  async executeShell(command: string): Promise<string> {
    const shell = process.platform === 'win32' ? 'cmd.exe' : '/bin/sh'
    const args = process.platform === 'win32' ? ['/c', command] : ['-c', command]

    const { stdout } = await execFileAsync(shell, args, { timeout: 30000 })
    return stdout
  },
}

/**
 * File utilities with cross-platform support
 */
export const FileUtils = {
  /**
   * Normalize path separators to forward slashes (safe for all platforms)
   */
  normalizePath(filePath: string): string {
    return filePath.replace(/\\/g, '/')
  },

  /**
   * Write file with normalized line endings (LF)
   * Fix #9: Consistent line endings across platforms
   */
  writeFileWithNormalizedLineEndings(filePath: string, content: string): void {
    const normalized = content.replace(/\r\n/g, '\n')
    fs.writeFileSync(filePath, normalized, 'utf-8')
  },

  /**
   * Read file with normalized line endings
   */
  readFileWithNormalizedLineEndings(filePath: string): string {
    const content = fs.readFileSync(filePath, 'utf-8')
    return content.replace(/\r\n/g, '\n')
  },

  /**
   * Set file permissions (Unix-style on Unix, no-op on Windows)
   * Fix #20: Handle platform differences in chmod
   */
  setPermissions(filePath: string, mode: number): void {
    if (process.platform !== 'win32') {
      try {
        fs.chmodSync(filePath, mode)
      } catch (error) {
        console.warn(`Failed to set permissions on ${filePath}: ${error}`)
      }
    }
  },

  /**
   * Create file with restricted permissions
   * Fix #20: Secure file creation across platforms
   */
  createSecureFile(filePath: string, content: string, mode = 0o600): void {
    fs.writeFileSync(filePath, content, { encoding: 'utf-8', mode: process.platform === 'win32' ? undefined : mode })
    this.setPermissions(filePath, mode)
  },
}

/**
 * Architecture detection
 */
export const ArchUtils = {
  /**
   * Get current architecture
   */
  getArch(): 'x64' | 'arm64' | 'ia32' | 'other' {
    const arch = process.arch
    switch (arch) {
      case 'x64':
        return 'x64'
      case 'arm64':
        return 'arm64'
      case 'ia32':
        return 'ia32'
      default:
        return 'other'
    }
  },

  /**
   * Get binary path for current platform and arch
   */
  getBinaryPath(binariesDir: string, binaryName: string, includeExtension = true): string {
    const platformName = process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'macos' : 'linux'
    const arch = this.getArch()
    const extension = process.platform === 'win32' ? '.exe' : ''

    return path.join(binariesDir, `${binaryName}-${platformName}-${arch}${includeExtension ? extension : ''}`)
  },

  /**
   * Check if binary is available
   */
  isBinaryAvailable(binariesDir: string, binaryName: string): boolean {
    const binaryPath = this.getBinaryPath(binariesDir, binaryName)
    return fs.existsSync(binaryPath)
  },
}

export default {
  PlatformUtils,
  ProcessManager,
  DiskSpaceManager,
  CommandUtils,
  FileUtils,
  ArchUtils,
}
