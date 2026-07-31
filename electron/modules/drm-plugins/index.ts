// ============================================================================
// electron/modules/drm-plugins/index.ts
// DRM Plugin System - Main Export
// ============================================================================

export { type DrmPlugin, type DrmDetectionResult, type DrmRemovalResult } from './types'
export { type DrmInfo, type DrmCacheEntry, type VersionSpecificData } from './types'
export type { Platform, RiskLevel, RemovalMethod } from './types'

export { securomPlugin } from './securom-plugin'
export { tagesPlugin } from './tages-plugin'
export { denuvoPlugin, type DenuvoWhitelistEntry } from './denuvo-plugin'
export { steamstubPlugin } from './steamstub-wrapper'

export { drmPluginRegistry } from './registry'

export { readPeHeader, extractSectionData, hasPeSection, getPeSections, searchPatternInSection } from './pe-parser'

export { versionManager, type DrmVersionInstruction } from './version-manager'

export {
  getPlatform,
  isPlatformSupported,
  getPlatformDetector,
  runCrossPlatformDetection,
  getPlatformCapabilities,
  type PlatformDrmDetector,
  type CrossPlatformDrmResult,
  type PlatformCapabilities,
} from './cross-platform'
