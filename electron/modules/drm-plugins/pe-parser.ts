// ============================================================================
// electron/modules/drm-plugins/pe-parser.ts
// Portable Executable (PE) format parser for DRM detection
// Reads PE headers to identify DRM signatures
// ============================================================================

import fs from 'fs'
import { logger } from '../../logger'

/**
 * PE Header structures
 */
interface PeHeader {
  signature: string
  machine: number
  numberOfSections: number
  sections: PeSection[]
}

interface PeSection {
  name: string
  virtualSize: number
  virtualAddress: number
  rawSize: number
  rawPointer: number
  characteristics: number
}

/**
 * Read PE header from executable file
 */
export function readPeHeader(exePath: string): PeHeader | null {
  try {
    const buffer = Buffer.alloc(512)
    const fd = fs.openSync(exePath, 'r')
    fs.readSync(fd, buffer, 0, 512, 0)
    fs.closeSync(fd)

    // Check for MZ signature (DOS header)
    if (buffer[0] !== 0x4d || buffer[1] !== 0x5a) {
      return null
    }

    // Read PE offset from DOS header (offset 0x3C)
    const peOffset = buffer.readUInt32LE(0x3c)
    if (peOffset > 1024 || peOffset < 64) {
      return null
    }

    // Read PE signature + COFF header
    const peBuffer = Buffer.alloc(Math.min(512, 512 - peOffset))
    const fd2 = fs.openSync(exePath, 'r')
    fs.readSync(fd2, peBuffer, 0, peBuffer.length, peOffset)
    fs.closeSync(fd2)

    // Check PE signature
    if (peBuffer[0] !== 0x50 || peBuffer[1] !== 0x45 || peBuffer[2] !== 0x00 || peBuffer[3] !== 0x00) {
      return null
    }

    const machine = peBuffer.readUInt16LE(4)
    const numberOfSections = peBuffer.readUInt16LE(6)

    // Parse section headers
    const sections: PeSection[] = []
    const sectionHeaderOffset = 20 // After COFF header
    for (let i = 0; i < numberOfSections && i < 32; i++) {
      const offset = sectionHeaderOffset + i * 40
      if (offset + 40 > peBuffer.length) break

      const name = peBuffer.slice(offset, offset + 8).toString('utf8').replace(/\0+$/, '')
      const virtualSize = peBuffer.readUInt32LE(offset + 8)
      const virtualAddress = peBuffer.readUInt32LE(offset + 12)
      const rawSize = peBuffer.readUInt32LE(offset + 16)
      const rawPointer = peBuffer.readUInt32LE(offset + 20)
      const characteristics = peBuffer.readUInt32LE(offset + 36)

      sections.push({
        name,
        virtualSize,
        virtualAddress,
        rawSize,
        rawPointer,
        characteristics,
      })
    }

    return {
      signature: 'PE',
      machine,
      numberOfSections,
      sections,
    }
  } catch (err) {
    logger.warn(`[PE Parser] Failed to parse PE header for ${exePath}: ${err instanceof Error ? err.message : 'unknown'}`, 'drm')
    return null
  }
}

/**
 * Extract section data for analysis
 */
export function extractSectionData(exePath: string, sectionName: string, maxBytes: number = 4096): Buffer | null {
  try {
    const peHeader = readPeHeader(exePath)
    if (!peHeader) return null

    const section = peHeader.sections.find((s) => s.name === sectionName)
    if (!section) return null

    const buffer = Buffer.alloc(Math.min(section.rawSize, maxBytes))
    const fd = fs.openSync(exePath, 'r')
    fs.readSync(fd, buffer, 0, buffer.length, section.rawPointer)
    fs.closeSync(fd)

    return buffer
  } catch (err) {
    logger.warn(`[PE Parser] Failed to extract section data: ${err instanceof Error ? err.message : 'unknown'}`, 'drm')
    return null
  }
}

/**
 * Check for section existence in PE file
 */
export function hasPeSection(exePath: string, sectionName: string): boolean {
  const peHeader = readPeHeader(exePath)
  if (!peHeader) return false
  return peHeader.sections.some((s) => s.name === sectionName)
}

/**
 * Get all section names from PE file
 */
export function getPeSections(exePath: string): string[] {
  const peHeader = readPeHeader(exePath)
  if (!peHeader) return []
  return peHeader.sections.map((s) => s.name)
}

/**
 * Search for byte pattern in PE section
 */
export function searchPatternInSection(
  exePath: string,
  sectionName: string,
  pattern: Buffer
): boolean {
  try {
    const data = extractSectionData(exePath, sectionName, 1024 * 1024) // Max 1MB
    if (!data) return false

    for (let i = 0; i < data.length - pattern.length; i++) {
      if (data.slice(i, i + pattern.length).equals(pattern)) {
        return true
      }
    }
    return false
  } catch {
    return false
  }
}

/**
 * Common PE signatures used by various DRMs
 */
export const PE_SIGNATURES = {
  SECUROM: {
    // SecuROM typically signs executables and resource sections
    patterns: [Buffer.from('SecuROM', 'utf8'), Buffer.from('PECompact', 'utf8')],
    sections: ['.rsrc', '.reloc'],
  },
  TAGES: {
    // Tages uses specific marker in resources
    patterns: [Buffer.from('Tages', 'utf8'), Buffer.from('SafeDisc', 'utf8')],
    sections: ['.rsrc'],
  },
  DENUVO: {
    // Denuvo signatures
    patterns: [Buffer.from('Denuvo', 'utf8'), Buffer.from('protection', 'utf8')],
    sections: ['.text', '.vmp'],
  },
}
