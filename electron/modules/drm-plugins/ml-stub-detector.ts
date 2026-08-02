// ============================================================================
// electron/modules/drm-plugins/ml-stub-detector.ts
// Machine Learning-based stub signature detector
// Analyzes PE sections (.text, .rsrc, packed sections) and extracts DRM signatures
// ============================================================================

import fs from 'fs'
import path from 'path'
import { logger } from '../../logger'

// ============================================================================
// Types & Interfaces
// ============================================================================

export interface StubSignature {
  name: string
  patterns: RegExp[]
  sections: string[]
  entropy: { min: number; max: number }
  confidence: number
}

export interface DetectionResult {
  detected: boolean
  drmType: string
  confidence: number
  signatures: string[]
  recommendations: string[]
  riskLevel: 'low' | 'medium' | 'high'
}

export interface PeAnalysis {
  sections: PeSection[]
  entropy: Map<string, number>
  signatures: FoundSignature[]
  packed: boolean
}

interface PeSection {
  name: string
  offset: number
  size: number
  entropy: number
}

interface FoundSignature {
  name: string
  offset: number
  confidence: number
}

// ============================================================================
// DRM Signature Database
// ============================================================================

const DRM_SIGNATURES: StubSignature[] = [
  // SteamStub variants
  {
    name: 'SteamStub (v1-v3)',
    patterns: [
      /This program cannot be run in DOS mode/i,
      /Steam\x00/,
      /SteamStub/i,
    ],
    sections: ['.text', '.stub'],
    entropy: { min: 6.5, max: 7.9 },
    confidence: 0.95,
  },
  {
    name: 'SteamStub (v4+)',
    patterns: [
      /Steam App ID/i,
      /SteamStub/,
      /\.packed/,
    ],
    sections: ['.text', '.rsrc'],
    entropy: { min: 7.0, max: 7.95 },
    confidence: 0.92,
  },

  // SecuROM variants
  {
    name: 'SecuROM (standard)',
    patterns: [
      /SecuROM/,
      /\x00SecuROM\x00/,
      /Macrovision/,
    ],
    sections: ['.text', '.data'],
    entropy: { min: 6.8, max: 7.8 },
    confidence: 0.90,
  },
  {
    name: 'SecuROM (StarForce)',
    patterns: [
      /StarForce/,
      /\x00SF\x00/,
      /stf_sf/,
    ],
    sections: ['.text', '.rsrc'],
    entropy: { min: 7.0, max: 7.9 },
    confidence: 0.88,
  },

  // Tages/SafeDisc variants
  {
    name: 'Tages/SafeDisc (v1)',
    patterns: [
      /SafeDisc/,
      /Tages/,
      /Lasers\x00/,
    ],
    sections: ['.text', '.data'],
    entropy: { min: 6.5, max: 7.7 },
    confidence: 0.85,
  },
  {
    name: 'Tages/SafeDisc (v2+)',
    patterns: [
      /Tages\x00/,
      /TagesKernel/,
      /\.protect/,
    ],
    sections: ['.text', '.rsrc', '.protect'],
    entropy: { min: 7.1, max: 7.95 },
    confidence: 0.87,
  },

  // CEG (Custom Executable Generation)
  {
    name: 'CEG (Unreal)',
    patterns: [
      /CEG\x00/,
      /UE4Game/,
      /Engine/,
    ],
    sections: ['.text'],
    entropy: { min: 6.0, max: 7.5 },
    confidence: 0.80,
  },

  // GameGuard variants
  {
    name: 'GameGuard',
    patterns: [
      /GameGuard/,
      /Inca Internet/,
      /NPGG/,
    ],
    sections: ['.text', '.data'],
    entropy: { min: 6.9, max: 7.8 },
    confidence: 0.82,
  },

  // VMProtect
  {
    name: 'VMProtect',
    patterns: [
      /VMProtect/,
      /\.vmp/,
      /\x00VMP\x00/,
    ],
    sections: ['.vmp0', '.vmp1', '.text'],
    entropy: { min: 7.2, max: 7.95 },
    confidence: 0.91,
  },

  // Themida/WL
  {
    name: 'Themida/Winlicense',
    patterns: [
      /Themida/,
      /WinLicense/,
      /\.themida/,
    ],
    sections: ['.themida', '.text'],
    entropy: { min: 7.0, max: 7.9 },
    confidence: 0.88,
  },

  // Packed/Compressed markers
  {
    name: 'Generic Packed',
    patterns: [
      /UPX\x00/,
      /PEiD/,
      /\.UPX/,
    ],
    sections: ['.UPX', '.packed'],
    entropy: { min: 7.3, max: 7.99 },
    confidence: 0.70,
  },
]

// ============================================================================
// Entropy Calculation
// ============================================================================

function calculateEntropy(buffer: Buffer): number {
  const frequencies = new Array(256).fill(0)
  for (const byte of buffer) {
    frequencies[byte]++
  }

  let entropy = 0
  const length = buffer.length

  for (const freq of frequencies) {
    if (freq === 0) continue
    const probability = freq / length
    entropy -= probability * Math.log2(probability)
  }

  return entropy
}

// ============================================================================
// PE File Analysis
// ============================================================================

export async function analyzePeFile(filePath: string): Promise<PeAnalysis | null> {
  try {
    const buffer = await fs.promises.readFile(filePath)

    // Check for DOS header
    if (!buffer.toString('utf8', 0, 2).startsWith('MZ')) {
      return null
    }

    // Parse PE header offset (stored at 0x3C)
    if (buffer.length < 0x3C + 4) {
      return null
    }

    const peOffset = buffer.readUInt32LE(0x3C)
    if (peOffset < 0 || peOffset > buffer.length - 4) {
      return null
    }

    // Check for PE signature
    const peSignature = buffer.toString('utf8', peOffset, peOffset + 4)
    if (peSignature !== 'PE\x00\x00') {
      return null
    }

    const sections: PeSection[] = []
    const entropy = new Map<string, number>()

    // Parse section headers. COFF header starts at peOffset + 4 (right after
    // the 4-byte "PE\0\0" signature); numberOfSections is at COFF+2,
    // sizeOfOptionalHeader is at COFF+16. Sections start right after the
    // Optional Header, whose actual size (96 for PE32, 112 for PE32+, or
    // anything else a linker chose) is authoritatively given by that COFF
    // field — reading it beats hardcoding 96 or guessing from the magic
    // number, which broke 64-bit (PE32+) executables entirely.
    const coffOffset = peOffset + 4
    const numSections = buffer.readUInt16LE(coffOffset + 2)
    const sizeOfOptionalHeader = buffer.readUInt16LE(coffOffset + 16)
    const optionalHeaderOffset = coffOffset + 20
    let sectionOffset = optionalHeaderOffset + sizeOfOptionalHeader

    for (let i = 0; i < Math.min(numSections, 30); i++) {
      if (sectionOffset + 40 > buffer.length) break

      const sectionName = buffer.toString('utf8', sectionOffset, sectionOffset + 8).replace(/\x00/g, '')
      const sectionSize = buffer.readUInt32LE(sectionOffset + 16)
      const sectionFileOffset = buffer.readUInt32LE(sectionOffset + 20)

      if (sectionFileOffset > 0 && sectionFileOffset < buffer.length) {
        const endOffset = Math.min(sectionFileOffset + sectionSize, buffer.length)
        const sectionData = buffer.subarray(sectionFileOffset, endOffset)
        const sectionEntropy = calculateEntropy(sectionData)

        sections.push({
          name: sectionName,
          offset: sectionFileOffset,
          size: endOffset - sectionFileOffset,
          entropy: sectionEntropy,
        })

        entropy.set(sectionName, sectionEntropy)
      }

      sectionOffset += 40
    }

    const signatures = detectSignaturesInBuffer(buffer)
    const isPacked = entropy.get('.text')! > 7.5 || sections.some((s) => s.entropy > 7.8)

    return {
      sections,
      entropy,
      signatures,
      packed: isPacked,
    }
  } catch (err) {
    logger.error(`[ML Stub Detector] PE analysis failed: ${err instanceof Error ? err.message : 'unknown'}`, 'drm')
    return null
  }
}

// ============================================================================
// Signature Detection
// ============================================================================

function detectSignaturesInBuffer(buffer: Buffer): FoundSignature[] {
  const found: FoundSignature[] = []
  // Convert once — the previous version re-stringified the remaining
  // buffer on every iteration (O(n) allocation per match, O(n^2) overall
  // for files with many hits).
  const text = buffer.toString('binary')

  for (const sig of DRM_SIGNATURES) {
    for (const pattern of sig.patterns) {
      // Force a global, non-sticky-index-reset regex so matchAll can walk
      // every occurrence, including one at index 0 (the previous
      // `!match.index` check treated a match at offset 0 as "no match"
      // and silently dropped it).
      const globalPattern = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g')
      for (const match of text.matchAll(globalPattern)) {
        if (match.index === undefined) continue
        found.push({
          name: sig.name,
          offset: match.index,
          confidence: sig.confidence,
        })
      }
    }
  }

  return found
}

// ============================================================================
// Fuzzy Matching & ML Logic
// ============================================================================

function calculateStringSimilarity(a: string, b: string): number {
  const longer = a.length > b.length ? a : b
  const shorter = a.length > b.length ? b : a

  if (longer.length === 0) return 1.0
  if (shorter.length === 0) return 0.0

  const editDistance = levenshteinDistance(longer, shorter)
  return (longer.length - editDistance) / longer.length
}

function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = []

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i]
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b[i - 1] === a[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1]
      } else {
        matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1)
      }
    }
  }

  return matrix[b.length][a.length]
}

// ============================================================================
// Main Detection Function
// ============================================================================

export async function detectDrmStubs(exePath: string): Promise<DetectionResult> {
  try {
    if (!fs.existsSync(exePath)) {
      return {
        detected: false,
        drmType: 'unknown',
        confidence: 0,
        signatures: [],
        recommendations: [],
        riskLevel: 'low',
      }
    }

    const analysis = await analyzePeFile(exePath)
    if (!analysis) {
      return {
        detected: false,
        drmType: 'unknown',
        confidence: 0,
        signatures: [],
        recommendations: [],
        riskLevel: 'low',
      }
    }

    // Score each DRM type based on matched signatures and entropy
    const scores = new Map<string, { score: number; matches: FoundSignature[] }>()

    for (const sig of DRM_SIGNATURES) {
      const matches = analysis.signatures.filter(
        (found) => calculateStringSimilarity(found.name, sig.name) > 0.7
      )

      if (matches.length === 0) continue

      let score = matches.reduce((sum, m) => sum + m.confidence, 0) / matches.length

      // Boost score if section entropy matches expected range
      for (const section of sig.sections) {
        const sectionEntropy = analysis.entropy.get(section)
        if (sectionEntropy !== undefined) {
          if (sectionEntropy >= sig.entropy.min && sectionEntropy <= sig.entropy.max) {
            score *= 1.1
          }
        }
      }

      // Boost if packed
      if (analysis.packed && sig.entropy.max > 7.5) {
        score *= 1.05
      }

      scores.set(sig.name, { score: Math.min(score, 1.0), matches })
    }

    // Find best match
    let bestMatch: { name: string; score: number; matches: FoundSignature[] } | null = null
    for (const [name, { score, matches }] of scores) {
      if (!bestMatch || score > bestMatch.score) {
        bestMatch = { name, score, matches }
      }
    }

    if (!bestMatch || bestMatch.score < 0.6) {
      return {
        detected: false,
        drmType: 'unknown',
        confidence: bestMatch?.score || 0,
        signatures: bestMatch?.matches.map((m) => m.name) || [],
        recommendations: analysis.packed ? ['File appears packed but no DRM signature matched'] : [],
        riskLevel: 'low',
      }
    }

    // Determine risk level
    let riskLevel: 'low' | 'medium' | 'high' = 'low'
    if (bestMatch.name.includes('VMProtect') || bestMatch.name.includes('Themida')) {
      riskLevel = 'high'
    } else if (bestMatch.name.includes('SecuROM') || bestMatch.name.includes('StarForce')) {
      riskLevel = 'high'
    } else if (bestMatch.name.includes('SteamStub')) {
      riskLevel = 'low'
    } else if (bestMatch.name.includes('GameGuard')) {
      riskLevel = 'medium'
    }

    // Recommendations
    const recommendations: string[] = []
    if (riskLevel === 'high') {
      recommendations.push('High-risk DRM detected. Backup before removal.')
    }
    if (analysis.packed) {
      recommendations.push('File appears packed. Removal may require multiple strategies.')
    }
    if (bestMatch.score < 0.75) {
      recommendations.push('Low confidence detection. Manual verification recommended.')
    }

    return {
      detected: true,
      drmType: bestMatch.name,
      confidence: bestMatch.score,
      signatures: bestMatch.matches.map((m) => m.name),
      recommendations,
      riskLevel,
    }
  } catch (err) {
    logger.error(
      `[ML Stub Detector] Detection failed: ${err instanceof Error ? err.message : 'unknown'}`,
      'drm'
    )
    return {
      detected: false,
      drmType: 'unknown',
      confidence: 0,
      signatures: [],
      recommendations: [`Error during detection: ${err instanceof Error ? err.message : 'unknown'}`],
      riskLevel: 'low',
    }
  }
}

// ============================================================================
// Batch Analysis (for community database building)
// ============================================================================

export async function analyzeGameBatch(gamePaths: string[]): Promise<Map<string, DetectionResult>> {
  const results = new Map<string, DetectionResult>()

  for (const gamePath of gamePaths) {
    try {
      const result = await detectDrmStubs(gamePath)
      results.set(gamePath, result)
    } catch (err) {
      logger.error(`[ML Stub Detector] Batch analysis failed for ${gamePath}: ${err}`, 'drm')
    }
  }

  return results
}

// ============================================================================
// Export signature database for analysis
// ============================================================================

export function getSignatureDatabase(): StubSignature[] {
  return [...DRM_SIGNATURES]
}

export function exportSignatureCatalog(): string {
  return JSON.stringify(
    {
      version: 1,
      timestamp: new Date().toISOString(),
      count: DRM_SIGNATURES.length,
      signatures: DRM_SIGNATURES.map((sig) => ({
        name: sig.name,
        entropy_min: sig.entropy.min,
        entropy_max: sig.entropy.max,
        confidence: sig.confidence,
        sections: sig.sections,
        pattern_count: sig.patterns.length,
      })),
    },
    null,
    2
  )
}
