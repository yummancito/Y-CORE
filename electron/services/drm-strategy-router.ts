// ============================================================================
// electron/services/drm-strategy-router.ts
// Smart DRM Removal Routing Service
// Chooses optimal removal method based on community data, risk, and DRM type
// ============================================================================

import { logger } from '../logger'
import { communityDbService, type CommunityStats, type CommunityEntry } from './community-db.service'
import { detectDrmStubs, type DetectionResult } from '../modules/drm-plugins/ml-stub-detector'
import { detectAntiCheat, type AntiCheatDetectionResult } from '../modules/drm-plugins/anticheat-plugin'

// ============================================================================
// Types & Interfaces
// ============================================================================

export interface RemovalStrategy {
  method: string
  order: number
  successRate: number
  riskLevel: 'low' | 'medium' | 'high'
  estimatedTime: number // seconds
  notes: string
  communityFeedback?: CommunityEntry[]
}

export interface DrmAssessment {
  appId: string
  exePath: string
  gameVersion: string
  drmDetection: DetectionResult
  antiCheatDetection: AntiCheatDetectionResult
  recommendedStrategy: RemovalStrategy | null
  fallbackStrategies: RemovalStrategy[]
  riskLevel: 'low' | 'medium' | 'high'
  recommendation: string
  communityStats?: CommunityStats
}

type RemovalMethod = 'steamless' | 'custom-stub' | 'api-hook' | 'onlinefix'

// ============================================================================
// Strategy Database
// ============================================================================

const STRATEGY_DATABASE: Record<string, RemovalStrategy[]> = {
  'SteamStub (v1-v3)': [
    {
      method: 'steamless',
      order: 1,
      successRate: 95,
      riskLevel: 'low',
      estimatedTime: 30,
      notes: 'Most reliable method for older SteamStub versions',
    },
    {
      method: 'custom-stub',
      order: 2,
      successRate: 70,
      riskLevel: 'medium',
      estimatedTime: 60,
      notes: 'Fallback if Steamless fails',
    },
  ],

  'SteamStub (v4+)': [
    {
      method: 'steamless',
      order: 1,
      successRate: 85,
      riskLevel: 'low',
      estimatedTime: 45,
      notes: 'Works for most v4+ variants',
    },
    {
      method: 'custom-stub',
      order: 2,
      successRate: 60,
      riskLevel: 'medium',
      estimatedTime: 90,
      notes: 'Manual unpacking for resistant variants',
    },
  ],

  'SecuROM (standard)': [
    {
      method: 'onlinefix',
      order: 1,
      successRate: 80,
      riskLevel: 'medium',
      estimatedTime: 120,
      notes: 'Use OnlineFix compatibility layer',
    },
    {
      method: 'custom-stub',
      order: 2,
      successRate: 50,
      riskLevel: 'high',
      estimatedTime: 180,
      notes: 'Complex manual removal required',
    },
  ],

  'SecuROM (StarForce)': [
    {
      method: 'onlinefix',
      order: 1,
      successRate: 75,
      riskLevel: 'medium',
      estimatedTime: 150,
      notes: 'StarForce requires careful handling',
    },
    {
      method: 'api-hook',
      order: 2,
      successRate: 40,
      riskLevel: 'high',
      estimatedTime: 200,
      notes: 'API interception for license checks',
    },
  ],

  'Tages/SafeDisc (v1)': [
    {
      method: 'onlinefix',
      order: 1,
      successRate: 70,
      riskLevel: 'medium',
      estimatedTime: 100,
      notes: 'OnlineFix layer for legacy DRM',
    },
    {
      method: 'custom-stub',
      order: 2,
      successRate: 45,
      riskLevel: 'high',
      estimatedTime: 150,
      notes: 'Tages v1 requires detailed analysis',
    },
  ],

  'Tages/SafeDisc (v2+)': [
    {
      method: 'custom-stub',
      order: 1,
      successRate: 55,
      riskLevel: 'medium',
      estimatedTime: 120,
      notes: 'Modern Tages is harder to remove',
    },
    {
      method: 'onlinefix',
      order: 2,
      successRate: 60,
      riskLevel: 'medium',
      estimatedTime: 100,
      notes: 'Try OnlineFix compatibility first',
    },
  ],

  'GameGuard': [
    {
      method: 'onlinefix',
      order: 1,
      successRate: 65,
      riskLevel: 'medium',
      estimatedTime: 90,
      notes: 'GameGuard works with compatibility layer',
    },
    {
      method: 'api-hook',
      order: 2,
      successRate: 35,
      riskLevel: 'high',
      estimatedTime: 150,
      notes: 'Intercept game security checks',
    },
  ],

  'VMProtect': [
    {
      method: 'api-hook',
      order: 1,
      successRate: 50,
      riskLevel: 'high',
      estimatedTime: 200,
      notes: 'VMProtect is highly resistant to removal',
    },
    {
      method: 'onlinefix',
      order: 2,
      successRate: 40,
      riskLevel: 'high',
      estimatedTime: 150,
      notes: 'Compatibility layer may help',
    },
  ],

  'Themida/Winlicense': [
    {
      method: 'api-hook',
      order: 1,
      successRate: 45,
      riskLevel: 'high',
      estimatedTime: 180,
      notes: 'Themida is highly obfuscated',
    },
    {
      method: 'onlinefix',
      order: 2,
      successRate: 35,
      riskLevel: 'medium',
      estimatedTime: 120,
      notes: 'May help with license checks',
    },
  ],

  'Generic Packed': [
    {
      method: 'custom-stub',
      order: 1,
      successRate: 60,
      riskLevel: 'medium',
      estimatedTime: 120,
      notes: 'Analyze and unpack packed executable',
    },
    {
      method: 'api-hook',
      order: 2,
      successRate: 50,
      riskLevel: 'high',
      estimatedTime: 150,
      notes: 'Hook API calls to bypass checks',
    },
  ],
}

// ============================================================================
// Strategy Selection Logic
// ============================================================================

export async function assessGameDRM(
  appId: string,
  exePath: string,
  gameVersion: string
): Promise<DrmAssessment> {
  try {
    logger.info(`[DRM Router] Assessing DRM for app ${appId}`, 'drm-router')

    // Detect DRM type
    const drmDetection = await detectDrmStubs(exePath)
    logger.info(`[DRM Router] DRM detection: ${drmDetection.drmType} (${Math.round(drmDetection.confidence * 100)}%)`, 'drm-router')

    // Detect anti-cheat
    const gameDir = exePath.replace(/[/\\][^/\\]*\.exe$/i, '')
    const antiCheatDetection = await detectAntiCheat(gameDir)
    if (antiCheatDetection.detected) {
      logger.info(`[DRM Router] Anti-cheat detected: ${antiCheatDetection.antiCheatType}`, 'drm-router')
    }

    // Get community stats
    const communityStats = await communityDbService.getStats(appId)

    // Select strategy
    const strategies = selectStrategy(
      drmDetection,
      antiCheatDetection,
      communityStats,
      gameVersion
    )

    const recommendedStrategy = strategies.length > 0 ? strategies[0] : null
    const fallbackStrategies = strategies.slice(1)

    // Determine overall risk
    const riskLevel = calculateOverallRisk(drmDetection, antiCheatDetection)

    // Generate recommendation
    const recommendation = generateRecommendation(
      drmDetection,
      antiCheatDetection,
      recommendedStrategy,
      communityStats
    )

    return {
      appId,
      exePath,
      gameVersion,
      drmDetection,
      antiCheatDetection,
      recommendedStrategy,
      fallbackStrategies,
      riskLevel,
      recommendation,
      communityStats: communityStats || undefined,
    }
  } catch (err) {
    logger.error(
      `[DRM Router] Assessment failed: ${err instanceof Error ? err.message : 'unknown'}`,
      'drm-router'
    )

    return {
      appId,
      exePath,
      gameVersion,
      drmDetection: {
        detected: false,
        drmType: 'unknown',
        confidence: 0,
        signatures: [],
        recommendations: [],
        riskLevel: 'low',
      },
      antiCheatDetection: {
        detected: false,
        antiCheatType: 'none',
        kernelMode: false,
        confidence: 1.0,
        evidence: [],
        warnings: [],
        disableMethods: [],
        documentation: '',
      },
      recommendedStrategy: null,
      fallbackStrategies: [],
      riskLevel: 'high',
      recommendation: 'Error during assessment. Please try again.',
    }
  }
}

// ============================================================================
// Strategy Selection
// ============================================================================

function selectStrategy(
  drmDetection: DetectionResult,
  antiCheatDetection: AntiCheatDetectionResult,
  communityStats: CommunityStats | null,
  gameVersion: string
): RemovalStrategy[] {
  const strategies: RemovalStrategy[] = []

  // If anti-cheat is kernel-level, can only use OnlineFix
  if (antiCheatDetection.detected && antiCheatDetection.kernelMode) {
    return [
      {
        method: 'onlinefix',
        order: 1,
        successRate: 40,
        riskLevel: 'medium',
        estimatedTime: 60,
        notes: `Cannot remove kernel anti-cheat (${antiCheatDetection.antiCheatType}). Use OnlineFix compatibility layer only.`,
      },
    ]
  }

  // Get base strategies for detected DRM
  const baseStrategies = STRATEGY_DATABASE[drmDetection.drmType] || []

  if (baseStrategies.length === 0) {
    // Unknown DRM, try generic approach
    strategies.push({
      method: 'steamless',
      order: 1,
      successRate: 50,
      riskLevel: 'medium',
      estimatedTime: 60,
      notes: 'Unknown DRM type. Steamless as first attempt.',
    })
  } else {
    strategies.push(...baseStrategies)
  }

  // Enhance with community data if available
  if (communityStats) {
    for (const strategy of strategies) {
      // Try to find community feedback for this method
      logger.debug(`[DRM Router] Looking for community data for ${drmDetection.drmType} via ${strategy.method}`, 'drm-router')
    }

    // Adjust success rates based on community feedback
    const topMethods = communityStats
    if (topMethods && topMethods.preferredMethod) {
      // Reorder strategies based on community preference
      const preferredIndex = strategies.findIndex(
        (s) => s.method === topMethods.preferredMethod
      )
      if (preferredIndex > 0) {
        const preferred = strategies.splice(preferredIndex, 1)[0]
        preferred.order = 1
        strategies.unshift(preferred)
      }
    }
  }

  // Adjust success rates based on confidence
  for (const strategy of strategies) {
    strategy.successRate = Math.round(
      strategy.successRate * drmDetection.confidence * 100
    ) / 100
  }

  return strategies
}

// ============================================================================
// Risk Assessment
// ============================================================================

function calculateOverallRisk(
  drmDetection: DetectionResult,
  antiCheatDetection: AntiCheatDetectionResult
): 'low' | 'medium' | 'high' {
  let riskLevel: 'low' | 'medium' | 'high' = drmDetection.riskLevel

  // Escalate if anti-cheat is kernel-level
  if (antiCheatDetection.detected && antiCheatDetection.kernelMode) {
    if (riskLevel === 'low' || riskLevel === 'medium') {
      riskLevel = 'high'
    }
  }

  // Escalate if anti-cheat is present (even if user-level)
  if (antiCheatDetection.detected) {
    if (riskLevel === 'low') riskLevel = 'medium'
  }

  return riskLevel
}

// ============================================================================
// Recommendation Generation
// ============================================================================

function generateRecommendation(
  drmDetection: DetectionResult,
  antiCheatDetection: AntiCheatDetectionResult,
  strategy: RemovalStrategy | null,
  communityStats: CommunityStats | null
): string {
  const parts: string[] = []

  // DRM status
  if (!drmDetection.detected) {
    parts.push(
      'No DRM detected. Game may already be DRM-free or detection was inconclusive.'
    )
    return parts.join(' ')
  }

  // DRM confidence
  const confidence = Math.round(drmDetection.confidence * 100)
  parts.push(
    `DRM Detected: ${drmDetection.drmType} (${confidence}% confidence).`
  )

  // Anti-cheat warning
  if (antiCheatDetection.detected) {
    if (antiCheatDetection.kernelMode) {
      parts.push(
        `WARNING: Kernel-level anti-cheat (${antiCheatDetection.antiCheatType}) detected. Cannot be removed. Game cannot play online without it.`
      )
    } else {
      parts.push(
        `Anti-cheat detected: ${antiCheatDetection.antiCheatType}. May prevent offline play.`
      )
    }
  }

  // Strategy recommendation
  if (strategy) {
    const timeMinutes = strategy.estimatedTime
    const timeStr = timeMinutes < 60 ? `${timeMinutes}s` : `${Math.ceil(timeMinutes / 60)}m`
    parts.push(
      `Method: ${strategy.method} (${Math.round(strategy.successRate)}% success rate, ${strategy.riskLevel} risk, ~${timeStr}).`
    )
  } else {
    parts.push(
      'Unable to determine optimal removal strategy. Manual intervention required.'
    )
  }

  // Community feedback
  if (communityStats) {
    parts.push(
      `Community: ${communityStats.totalReports} reports, ${communityStats.successRate}% average success.`
    )
  }

  // Safety notes
  if (drmDetection.recommendations.length > 0) {
    parts.push(`Notes: ${drmDetection.recommendations.join(' ')}`)
  }

  return parts.join(' ')
}

// ============================================================================
// Batch Assessment
// ============================================================================

export async function assessGameBatch(
  games: Array<{ appId: string; exePath: string; version: string }>
): Promise<DrmAssessment[]> {
  const results: DrmAssessment[] = []

  for (const game of games) {
    const assessment = await assessGameDRM(game.appId, game.exePath, game.version)
    results.push(assessment)
  }

  return results
}

// ============================================================================
// Fallback Strategy Resolver
// ============================================================================

export async function executeStrategyFallback(
  appId: string,
  strategies: RemovalStrategy[],
  currentStrategyFailed: RemovalStrategy
): Promise<RemovalStrategy | null> {
  const nextStrategy = strategies.find((s) => s.order > currentStrategyFailed.order)

  if (nextStrategy) {
    logger.info(
      `[DRM Router] Fallback: ${currentStrategyFailed.method} failed, trying ${nextStrategy.method}`,
      'drm-router'
    )
  }

  return nextStrategy || null
}
