/**
 * Cross-Platform Binary Format Analyzer
 * Fixes issue #4: PE Header Analysis Only on Windows
 * Supports: PE (Windows), Mach-O (macOS), ELF (Linux)
 */

import fs from 'fs'
import path from 'path'
import { logger } from '../logger'
import { PlatformUtils } from './platform-abstraction'

export enum BinaryFormat {
  PE = 'PE',
  MACHO = 'Mach-O',
  ELF = 'ELF',
  UNKNOWN = 'UNKNOWN',
}

export interface BinaryAnalysisResult {
  format: BinaryFormat
  is64Bit: boolean
  isExecutable: boolean
  hasDebugInfo: boolean
  entropy: number
  isPacked: boolean
  suspiciousFlags: string[]
  timestamp?: number
}

/**
 * Analyzes PE (Portable Executable) files - Windows format
 */
class PEAnalyzer {
  static async analyze(buffer: Buffer): Promise<BinaryAnalysisResult | null> {
    try {
      // Check PE signature
      if (buffer.length < 64) return null

      // Check MZ signature
      if (buffer[0] !== 0x4d || buffer[1] !== 0x5a) {
        return null
      }

      // Get PE offset from DOS header (at offset 0x3C)
      const peOffset = buffer.readUInt32LE(0x3c)
      if (peOffset > buffer.length - 24) {
        return null
      }

      // Check PE signature
      if (buffer[peOffset] !== 0x50 || buffer[peOffset + 1] !== 0x45) {
        return null
      }

      // Read Machine field (offset 4 in COFF header)
      const machine = buffer.readUInt16LE(peOffset + 4)
      // 0x8664 = x86-64, 0x014c = x86, 0xAA64 = ARM64
      const is64Bit = machine === 0x8664 || machine === 0xaa64

      // Read Characteristics (offset 22 in COFF header)
      const characteristics = buffer.readUInt16LE(peOffset + 22)
      const isExecutable = (characteristics & 0x0002) !== 0

      // Read Optional header size (offset 20 in COFF header)
      const optionalHeaderSize = buffer.readUInt16LE(peOffset + 20)

      // Calculate if likely packed (high entropy sections)
      const isPacked = this.isLikelyPacked(buffer)

      return {
        format: BinaryFormat.PE,
        is64Bit,
        isExecutable,
        hasDebugInfo: false, // Would need to check debug directory
        entropy: 0, // Would need section analysis
        isPacked,
        suspiciousFlags: [],
        timestamp: Date.now(),
      }
    } catch (error) {
      logger.debug(`PE analysis failed: ${error}`)
      return null
    }
  }

  private static isLikelyPacked(buffer: Buffer): boolean {
    // Common packer signatures
    const packerSignatures = [
      /UPX0/,
      /ASPack/,
      /PECompact/,
      /UPX!/,
      /WinZip/,
    ]

    const bufferStr = buffer.toString('binary')
    return packerSignatures.some((sig) => sig.test(bufferStr))
  }
}

/**
 * Analyzes Mach-O files - macOS format
 */
class MachoAnalyzer {
  static async analyze(buffer: Buffer): Promise<BinaryAnalysisResult | null> {
    try {
      if (buffer.length < 32) return null

      // Check for Mach-O magic numbers
      const magic = buffer.readUInt32LE(0)

      // Fat binary: 0xCAFEBABE
      // 32-bit Mach-O: 0xFEEDFACE
      // 64-bit Mach-O: 0xFEEDFACF
      let isMacho = false
      let is64Bit = false

      if (magic === 0xcafebabe) {
        // Fat binary - contains multiple architectures
        isMacho = true
        is64Bit = true
      } else if (magic === 0xfeedface) {
        isMacho = true
        is64Bit = false
      } else if (magic === 0xfeedfacf) {
        isMacho = true
        is64Bit = true
      } else if (magic === 0xbebafeca || magic === 0xcffaedfe || magic === 0xcefaedfe) {
        // Reverse byte order (little-endian)
        isMacho = true
        is64Bit = magic === 0xcefaedfe || magic === 0xcffaedfe
      }

      if (!isMacho) {
        return null
      }

      // Read file type (at offset 12 for 64-bit, 12 for 32-bit)
      const fileType = buffer.readUInt32LE(12)
      // 0x2 = MH_EXECUTE, 0x6 = MH_DYLIB
      const isExecutable = fileType === 0x2

      return {
        format: BinaryFormat.MACHO,
        is64Bit,
        isExecutable,
        hasDebugInfo: false,
        entropy: 0,
        isPacked: false, // Mach-O rarely uses traditional packers
        suspiciousFlags: [],
        timestamp: Date.now(),
      }
    } catch (error) {
      logger.debug(`Mach-O analysis failed: ${error}`)
      return null
    }
  }
}

/**
 * Analyzes ELF files - Linux format
 */
class ELFAnalyzer {
  static async analyze(buffer: Buffer): Promise<BinaryAnalysisResult | null> {
    try {
      if (buffer.length < 20) return null

      // Check ELF magic (0x7f 'E' 'L' 'F')
      if (buffer[0] !== 0x7f || buffer[1] !== 0x45 || buffer[2] !== 0x4c || buffer[3] !== 0x46) {
        return null
      }

      // Check EI_CLASS (at offset 4): 1 = 32-bit, 2 = 64-bit
      const elfClass = buffer[4]
      const is64Bit = elfClass === 2

      // Check EI_DATA (at offset 5): 1 = little-endian, 2 = big-endian
      const endianness = buffer[5]
      const isLittleEndian = endianness === 1

      // Read e_type (at offset 16, 2 bytes)
      const offset = isLittleEndian ? 16 : 18
      const eType = isLittleEndian ? buffer.readUInt16LE(16) : buffer.readUInt16BE(16)

      // e_type: 2 = ET_EXEC (executable), 3 = ET_DYN (shared object)
      const isExecutable = eType === 2

      return {
        format: BinaryFormat.ELF,
        is64Bit,
        isExecutable,
        hasDebugInfo: this.hasDebugInfo(buffer),
        entropy: this.calculateEntropy(buffer),
        isPacked: this.isLikelyPacked(buffer),
        suspiciousFlags: [],
        timestamp: Date.now(),
      }
    } catch (error) {
      logger.debug(`ELF analysis failed: ${error}`)
      return null
    }
  }

  private static hasDebugInfo(buffer: Buffer): boolean {
    // Check for .debug section header names (simplified check)
    const bufferStr = buffer.toString('binary')
    return bufferStr.includes('.debug') || bufferStr.includes('.gnu_debuglink')
  }

  private static calculateEntropy(buffer: Buffer): number {
    const frequencies = new Map<number, number>()

    // Count byte frequencies in first 4KB
    const sampleSize = Math.min(4096, buffer.length)
    for (let i = 0; i < sampleSize; i++) {
      const byte = buffer[i]
      frequencies.set(byte, (frequencies.get(byte) || 0) + 1)
    }

    // Calculate Shannon entropy
    let entropy = 0
    for (const count of frequencies.values()) {
      const probability = count / sampleSize
      entropy -= probability * Math.log2(probability)
    }

    return entropy
  }

  private static isLikelyPacked(buffer: Buffer): boolean {
    // High entropy sections often indicate packing
    const entropy = this.calculateEntropy(buffer)
    return entropy > 7.5 // Typical threshold for packed binaries
  }
}

/**
 * Main binary format analyzer
 */
export class BinaryFormatAnalyzer {
  /**
   * Detect and analyze binary file format
   */
  static async analyzeFile(filePath: string): Promise<BinaryAnalysisResult | null> {
    try {
      // Check file exists and is readable
      if (!fs.existsSync(filePath)) {
        logger.warn(`Binary file not found: ${filePath}`)
        return null
      }

      const stat = fs.statSync(filePath)
      if (stat.size < 20) {
        return null // File too small to be valid binary
      }

      // Read header (first 4KB is enough for analysis)
      const headersSize = Math.min(4096, stat.size)
      const buffer = Buffer.alloc(headersSize)

      const fd = fs.openSync(filePath, 'r')
      try {
        fs.readSync(fd, buffer, 0, headersSize, null)
      } finally {
        fs.closeSync(fd)
      }

      return await this.analyzeBuffer(buffer)
    } catch (error) {
      logger.warn(`Failed to analyze binary: ${error}`)
      return null
    }
  }

  /**
   * Analyze binary buffer
   */
  static async analyzeBuffer(buffer: Buffer): Promise<BinaryAnalysisResult | null> {
    // Try each format analyzer in order
    let result: BinaryAnalysisResult | null = null

    // Platform-specific analysis
    if (PlatformUtils.isWindows()) {
      result = await PEAnalyzer.analyze(buffer)
      if (result) return result
    }

    if (PlatformUtils.isMacOS()) {
      result = await MachoAnalyzer.analyze(buffer)
      if (result) return result
    }

    if (PlatformUtils.isLinux()) {
      result = await ELFAnalyzer.analyze(buffer)
      if (result) return result
    }

    // Try all formats regardless of platform (file might be cross-platform)
    result = await PEAnalyzer.analyze(buffer)
    if (result) return result

    result = await MachoAnalyzer.analyze(buffer)
    if (result) return result

    result = await ELFAnalyzer.analyze(buffer)
    if (result) return result

    return null
  }

  /**
   * Detect binary format from file extension
   */
  static detectFormatFromExtension(filePath: string): BinaryFormat {
    const ext = path.extname(filePath).toLowerCase()

    // Windows executables
    if (['.exe', '.dll', '.sys', '.drv', '.scr', '.msi'].includes(ext)) {
      return BinaryFormat.PE
    }

    // macOS executables
    if (['.app', '.dylib', '.framework'].includes(ext)) {
      return BinaryFormat.MACHO
    }

    // Linux executables (no extension typically)
    if (ext === '' || ext === '.so' || ext === '.a') {
      return BinaryFormat.ELF
    }

    return BinaryFormat.UNKNOWN
  }
}

export default BinaryFormatAnalyzer
