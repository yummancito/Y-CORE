# DRM Remover — Phase 4 Architecture (12+ Month Vision)

## Executive Summary

Phase 4 transforms Y-CORE's DRM Remover from a Windows-only Steam-focused tool into a **universal DRM handling framework** capable of:
- Auto-detecting DRM across multiple game platforms
- Auto-removing supported DRM types via pluggable handlers
- Cross-platform support (Windows, macOS, Linux)
- Community-driven game metadata database
- Fallback strategies for unsupported DRM
- Legal/ethical compliance framework

**Vision:** "One unified tool. Any game. Any DRM. Any platform."

---

## 1. Universal DRM Framework Architecture

### 1.1 Current State (Phase 1-3)

```
┌─────────────────────────────────┐
│     Frontend (DrmRemoverPage)    │
└────────────┬────────────────────┘
             │
             ↓
┌─────────────────────────────────┐
│  IPC Handler (drm:remove)       │
└────────────┬────────────────────┘
             │
             ↓
┌─────────────────────────────────┐
│  DRM Service Layer              │
└────────────┬────────────────────┘
             │
             ↓
┌─────────────────────────────────┐
│  DRM Remover Module             │
│  - Windows only                 │
│  - SteamStub only              │
│  - Steamless CLI               │
└─────────────────────────────────┘
```

### 1.2 Phase 4 Proposed Architecture

```
┌──────────────────────────────────────────────────────────┐
│                     DRM Framework Core                    │
├──────────────────────────────────────────────────────────┤
│                                                           │
│  ┌────────────────────────────────────────────────────┐  │
│  │         DRM Detection Pipeline                     │  │
│  │  (Universal auto-detect for all supported DRM)    │  │
│  └────────────────────────────────────────────────────┘  │
│           ↓                          ↓                    │
│  ┌──────────────────┐     ┌──────────────────┐          │
│  │ Executable       │     │ Game Metadata    │          │
│  │ Analysis         │     │ Lookup           │          │
│  │ (Magic bytes,    │     │ (Steam API,      │          │
│  │  sig scanning)   │     │  ProtonDB, etc)  │          │
│  └──────────────────┘     └──────────────────┘          │
│           ↓                          ↓                    │
│  ┌────────────────────────────────────────────────────┐  │
│  │    DRM Type Identification                         │  │
│  │    Returns: { type: string, version?: string }    │  │
│  └────────────────────────────────────────────────────┘  │
│                                                           │
├──────────────────────────────────────────────────────────┤
│                                                           │
│  ┌────────────────────────────────────────────────────┐  │
│  │      Plugin-Based Removal Handler System          │  │
│  ├────────────────────────────────────────────────────┤  │
│  │                                                    │  │
│  │  ┌──────────────┐  ┌──────────────┐              │  │
│  │  │ SteamStub    │  │ Denuvo       │ ...         │  │
│  │  │ Handler      │  │ Handler      │              │  │
│  │  │ (Steamless)  │  │ (future)     │              │  │
│  │  └──────────────┘  └──────────────┘              │  │
│  │                                                    │  │
│  │  ┌──────────────┐  ┌──────────────┐              │  │
│  │  │ CEG Handler  │  │ Custom       │              │  │
│  │  │ (SecuROM)    │  │ Plugins      │              │  │
│  │  └──────────────┘  └──────────────┘              │  │
│  │                                                    │  │
│  └────────────────────────────────────────────────────┘  │
│                                                           │
├──────────────────────────────────────────────────────────┤
│                                                           │
│  ┌────────────────────────────────────────────────────┐  │
│  │      Platform-Specific Execution Layer            │  │
│  ├────────────────────────────────────────────────────┤  │
│  │                                                    │  │
│  │  Windows:     macOS:      Linux:                  │  │
│  │  ├─ Native    ├─ Wine      ├─ Wine               │  │
│  │  ├─ Exec      ├─ Mono      ├─ Proton             │  │
│  │  └─ DLL       └─ Compat    └─ Script             │  │
│  │                                                    │  │
│  └────────────────────────────────────────────────────┘  │
│                                                           │
├──────────────────────────────────────────────────────────┤
│                                                           │
│  ┌────────────────────────────────────────────────────┐  │
│  │      Unified Result & Fallback System             │  │
│  │  • Success: Mark as removed                       │  │
│  │  • Partial: Suggest alternative methods          │  │
│  │  • Failure: Fallback strategies (GOG, Pass, etc) │  │
│  │  • Unsupported: Community feedback loop          │  │
│  └────────────────────────────────────────────────────┘  │
│                                                           │
└──────────────────────────────────────────────────────────┘
```

### 1.3 Plugin System Design

#### Abstract Base Handler Interface

```typescript
// electron/modules/drm-framework/handlers/base-handler.ts

export interface DrmRemovalResult {
  success: boolean
  message: string
  errorKey?: string
  method: string
  executionTime: number
  metadata?: Record<string, unknown>
}

export interface DrmDetectionResult {
  detected: boolean
  type: string
  version?: string
  confidence: 'high' | 'medium' | 'low'
  signatures?: string[]
}

export abstract class BaseDrmHandler {
  abstract readonly id: string
  abstract readonly name: string
  abstract readonly supportedPlatforms: Array<'windows' | 'macos' | 'linux'>
  abstract readonly drmType: string
  
  /**
   * Detect if this DRM is present in the executable
   */
  abstract detect(exePath: string): Promise<DrmDetectionResult>
  
  /**
   * Remove the DRM from the executable
   * Must backup original before modification
   */
  abstract remove(exePath: string, options?: RemovalOptions): Promise<DrmRemovalResult>
  
  /**
   * Verify removal was successful
   */
  abstract verify(exePath: string): Promise<boolean>
  
  /**
   * Optional: Support rollback to original
   */
  async rollback(exePath: string): Promise<boolean> {
    return false
  }
  
  /**
   * Get performance metrics (detection, removal time)
   */
  abstract getMetrics(): RemovalMetrics
}

interface RemovalOptions {
  interactive?: boolean
  timeout?: number
  keepBackup?: boolean
  performanceOptimize?: boolean
}

interface RemovalMetrics {
  detectionTimeMs: number
  removalTimeMs: number
  successRate: number
  handledVersions: string[]
}
```

#### Concrete Handler Example: Steamless Handler

```typescript
// electron/modules/drm-framework/handlers/steamless-handler.ts

export class SteamlessHandler extends BaseDrmHandler {
  readonly id = 'steamless'
  readonly name = 'Steamless CLI'
  readonly supportedPlatforms: Array<'windows' | 'macos' | 'linux'> = ['windows']
  readonly drmType = 'SteamStub'
  
  private metrics = {
    detectionTimeMs: 0,
    removalTimeMs: 0,
    successRate: 0.85,
    handledVersions: ['1.0', '2.0', '3.0', '3.1', '3.2'],
  }

  async detect(exePath: string): Promise<DrmDetectionResult> {
    const startTime = Date.now()
    
    // Read PE header and look for SteamStub signatures
    const hasStub = await this.scanPESignatures(exePath)
    const confidence = hasStub ? 'high' : 'low'
    
    return {
      detected: hasStub,
      type: 'SteamStub',
      version: await this.detectStubVersion(exePath),
      confidence,
      signatures: hasStub ? ['.bind', '.stub', '.text$mn'] : [],
    }
  }

  async remove(
    exePath: string,
    options?: RemovalOptions
  ): Promise<DrmRemovalResult> {
    const startTime = Date.now()
    const backupPath = exePath + '.bak'

    try {
      // Backup original
      await this.createBackup(exePath, backupPath)
      
      // Run Steamless
      const result = await this.runSteamless(exePath)
      
      if (!result.success) {
        await this.restoreBackup(exePath, backupPath)
        return {
          success: false,
          message: `Steamless failed: ${result.error}`,
          method: 'steamless',
          executionTime: Date.now() - startTime,
        }
      }

      return {
        success: true,
        message: 'Successfully removed SteamStub DRM',
        method: 'steamless',
        executionTime: Date.now() - startTime,
      }
    } catch (error) {
      await this.restoreBackup(exePath, backupPath)
      throw error
    }
  }

  async verify(exePath: string): Promise<boolean> {
    const result = await this.detect(exePath)
    return !result.detected
  }

  private async runSteamless(exePath: string): Promise<{ success: boolean; error?: string }> {
    // Existing Steamless implementation
  }

  private async scanPESignatures(exePath: string): Promise<boolean> {
    // Scan PE headers for SteamStub signatures
  }

  private async detectStubVersion(exePath: string): Promise<string | undefined> {
    // Detect which version of SteamStub
  }

  private async createBackup(from: string, to: string): Promise<void> {
    // Create backup with manifest
  }

  private async restoreBackup(to: string, from: string): Promise<void> {
    // Restore from backup
  }

  getMetrics(): RemovalMetrics {
    return this.metrics
  }
}
```

### 1.4 Handler Registry & Discovery

```typescript
// electron/modules/drm-framework/handler-registry.ts

export class DrmHandlerRegistry {
  private handlers: Map<string, BaseDrmHandler> = new Map()
  private handlersByDrmType: Map<string, BaseDrmHandler[]> = new Map()

  register(handler: BaseDrmHandler): void {
    this.handlers.set(handler.id, handler)
    
    const existing = this.handlersByDrmType.get(handler.drmType) || []
    existing.push(handler)
    this.handlersByDrmType.set(handler.drmType, existing)
    
    logger.info(`Registered DRM handler: ${handler.name} (${handler.drmType})`)
  }

  getHandlerById(id: string): BaseDrmHandler | undefined {
    return this.handlers.get(id)
  }

  getHandlersForDrm(drmType: string): BaseDrmHandler[] {
    return this.handlersByDrmType.get(drmType) || []
  }

  /**
   * Get all handlers that support a platform
   */
  getHandlersForPlatform(platform: 'windows' | 'macos' | 'linux'): BaseDrmHandler[] {
    return Array.from(this.handlers.values()).filter((h) =>
      h.supportedPlatforms.includes(platform)
    )
  }

  /**
   * Auto-detect DRM and return ordered list of applicable handlers
   */
  async detectAndGetHandlers(
    exePath: string,
    platform: 'windows' | 'macos' | 'linux'
  ): Promise<BaseDrmHandler[]> {
    const platformHandlers = this.getHandlersForPlatform(platform)
    const results: Array<{ handler: BaseDrmHandler; confidence: number }> = []

    for (const handler of platformHandlers) {
      const detection = await handler.detect(exePath)
      if (detection.detected) {
        const confidenceScore = {
          high: 1.0,
          medium: 0.7,
          low: 0.4,
        }[detection.confidence]
        
        results.push({
          handler,
          confidence: confidenceScore,
        })
      }
    }

    // Sort by confidence (highest first)
    return results
      .sort((a, b) => b.confidence - a.confidence)
      .map((r) => r.handler)
  }
}
```

### 1.5 Unified DRM Detection Pipeline

```typescript
// electron/modules/drm-framework/drm-detector.ts

export interface GameDrmProfile {
  appId?: string
  gamePath: string
  executablePath: string
  platform: 'windows' | 'macos' | 'linux'
  
  detectedDrm: Array<{
    type: string
    version?: string
    handlers: BaseDrmHandler[]
    confidence: 'high' | 'medium' | 'low'
  }>
  
  metadata?: {
    steamAppId?: string
    protonDbRating?: string
    knownBrokenDrm?: string[]
    recommendedHandlers?: string[]
  }
  
  detectionTime: number
}

export class UniversalDrmDetector {
  constructor(private registry: DrmHandlerRegistry) {}

  /**
   * Universal detection: scan executable + metadata
   * Target: <5 seconds per game
   */
  async analyzeGame(
    gamePath: string,
    appId?: string
  ): Promise<GameDrmProfile> {
    const startTime = Date.now()
    const platform = this.getPlatform()
    
    // Find main executable
    const exePath = await this.findGameExecutable(gamePath)
    if (!exePath) {
      throw new Error(`No executable found in ${gamePath}`)
    }

    // Parallel execution for speed
    const [detectedDrm, metadata] = await Promise.all([
      this.detectDrm(exePath, platform),
      appId ? this.fetchMetadata(appId) : Promise.resolve(undefined),
    ])

    return {
      appId,
      gamePath,
      executablePath: exePath,
      platform,
      detectedDrm,
      metadata,
      detectionTime: Date.now() - startTime,
    }
  }

  private async detectDrm(
    exePath: string,
    platform: 'windows' | 'macos' | 'linux'
  ): Promise<GameDrmProfile['detectedDrm']> {
    const handlers = this.registry.getHandlersForPlatform(platform)
    const results: GameDrmProfile['detectedDrm'] = []

    // Parallel detection (up to 5 concurrent)
    const batches = chunk(handlers, 5)
    
    for (const batch of batches) {
      const detections = await Promise.all(
        batch.map((h) => h.detect(exePath))
      )

      for (let i = 0; i < batch.length; i++) {
        const handler = batch[i]
        const detection = detections[i]

        if (detection.detected) {
          results.push({
            type: detection.type,
            version: detection.version,
            handlers: this.registry.getHandlersForDrm(detection.type),
            confidence: detection.confidence,
          })
        }
      }
    }

    return results
  }

  private async fetchMetadata(appId: string): Promise<GameDrmProfile['metadata']> {
    // Fetch from Steam API, ProtonDB, PCGamingWiki, etc.
    // See section 2: Game Metadata Enrichment
  }

  private async findGameExecutable(gamePath: string): Promise<string | null> {
    // Use existing logic or enhance
  }

  private getPlatform(): 'windows' | 'macos' | 'linux' {
    // Existing platform detection
  }
}
```

### 1.6 Performance Targets

| Operation | Target | Current | Gap |
|-----------|--------|---------|-----|
| Detection per game | <5s | N/A | Design goal |
| Removal per game | <30s | ~60s | Optimize |
| Cached detection | <100ms | ~100ms | ✅ |
| Handler registry startup | <1s | N/A | Design goal |
| Parallel handler detection | 5 handlers | N/A | Design goal |

---

## 2. Game Metadata Enrichment Strategy

### 2.1 Data Sources Integration

```
┌──────────────────────────────────────────────────────────┐
│            Game Metadata Aggregation Layer                │
├──────────────────────────────────────────────────────────┤
│                                                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │   Steam      │  │   ProtonDB   │  │  PCGaming    │  │
│  │   API        │  │              │  │  Wiki        │  │
│  │ - App Info   │  │ - Rating     │  │ - DRM Info   │  │
│  │ - DRM Info   │  │ - Compat     │  │ - Known Fix  │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
│          ↓                ↓                  ↓            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │IsThereAnyDeal│  │  Y-CORE      │  │ Community    │  │
│  │              │  │  Community   │  │ Crowdsource  │  │
│  │ - Price      │  │  DB          │  │              │  │
│  │ - Deals      │  │ - Verified   │  │ - Reports    │  │
│  │ - Platforms  │  │   Removals   │  │ - Updates    │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
│          ↓                ↓                  ↓            │
│  ┌────────────────────────────────────────────────────┐  │
│  │        Unified Metadata Cache (Local DB)           │  │
│  │  ┌───────────────────────────────────────────────┐ │  │
│  │  │ appid_12345                                   │ │  │
│  │  │ {                                             │ │  │
│  │  │   title: "Game Name"                          │ │  │
│  │  │   drm: ["SteamStub", "CEG"]                   │ │  │
│  │  │   handlers: ["steamless", "ceg-remover"]      │ │  │
│  │  │   successRate: 0.92                           │ │  │
│  │  │   lastVerified: "2026-07-30"                  │ │  │
│  │  │   platform: "windows"                         │ │  │
│  │  │ }                                             │ │  │
│  │  └───────────────────────────────────────────────┘ │  │
│  └────────────────────────────────────────────────────┘  │
│                                                           │
└──────────────────────────────────────────────────────────┘
```

### 2.2 Metadata Schema

```typescript
// electron/modules/drm-framework/metadata/schema.ts

export interface GameMetadataRecord {
  // Unique identifiers
  appId: string                    // Steam AppID
  title: string
  version?: string                 // Build version if applicable

  // DRM Information
  drm: {
    primary: string                // Main DRM type
    secondary?: string[]           // Additional DRM layers
    version?: string
    lastUpdated: string           // ISO timestamp
  }

  // Removal Methods
  removers: Array<{
    handler: string                // e.g., "steamless", "ceg-remover"
    successRate: number            // 0.0-1.0
    avgTimeMs: number
    minimumVersion?: string
    maximumVersion?: string
    notes?: string
    lastTested: string
  }>

  // Platform Support
  platforms: Array<{
    os: 'windows' | 'macos' | 'linux'
    verified: boolean
    handledDrm: string[]
    lastVerified: string
  }>

  // Community Data
  community: {
    reports: number                // User reports of successful removal
    failures: number               // Failed attempts
    difficulty: 'trivial' | 'easy' | 'medium' | 'hard' | 'unknown'
    workarounds?: string[]
  }

  // Metadata
  sources: Array<'steam' | 'protondb' | 'pcgamingwiki' | 'ycore-community'>
  lastSync: string                 // ISO timestamp
  verified: boolean                // Verified by Y-CORE maintainers
}

export interface GameMetadataDatabase {
  version: string                  // Schema version
  lastUpdated: string
  records: Record<string, GameMetadataRecord>
}
```

### 2.3 Cloud Sync Architecture

```typescript
// electron/modules/drm-framework/metadata/cloud-sync.ts

export class GameMetadataSync {
  private cloudUrl = 'https://api.y-core.dev/metadata'
  private localDb: GameMetadataDatabase
  private syncInterval = 24 * 60 * 60 * 1000 // 24 hours

  async initializeSync(): Promise<void> {
    // Load local cache
    await this.loadLocalCache()
    
    // Check if sync needed
    if (this.needsSync()) {
      await this.syncWithCloud()
    }

    // Start periodic sync
    setInterval(() => this.syncWithCloud(), this.syncInterval)
  }

  /**
   * Fetch metadata for a specific game
   * Uses local cache with cloud fallback
   */
  async getGameMetadata(appId: string): Promise<GameMetadataRecord | null> {
    // Try local cache first (instant)
    if (this.localDb.records[appId]) {
      return this.localDb.records[appId]
    }

    // Fall back to cloud (with retry)
    try {
      const record = await this.fetchFromCloud(appId)
      if (record) {
        this.cacheLocally(appId, record)
      }
      return record
    } catch {
      logger.warn(`Failed to fetch metadata for app ${appId}`)
      return null
    }
  }

  /**
   * Report successful removal to community database
   */
  async reportSuccess(
    appId: string,
    handler: string,
    metadata: { platform: string; version?: string }
  ): Promise<void> {
    try {
      await fetch(`${this.cloudUrl}/${appId}/report`, {
        method: 'POST',
        body: JSON.stringify({
          handler,
          platform: metadata.platform,
          version: metadata.version,
          timestamp: new Date().toISOString(),
          // Include anonymous system info for stats
          nodeVersion: process.version,
        }),
      })

      // Update local cache with success
      if (this.localDb.records[appId]) {
        this.localDb.records[appId].community.reports++
      }
    } catch {
      logger.warn(`Failed to report success for app ${appId}`)
    }
  }

  /**
   * Bulk sync entire database
   */
  async syncWithCloud(): Promise<void> {
    try {
      const response = await fetch(`${this.cloudUrl}/full-sync`, {
        headers: {
          'Content-Type': 'application/json',
          'X-Client-Version': '4.0.0',
          'X-Client-Platform': process.platform,
        },
      })

      if (!response.ok) {
        throw new Error(`Sync failed: ${response.status}`)
      }

      const newDb: GameMetadataDatabase = await response.json()
      this.localDb = newDb

      // Save to disk
      await this.saveLocalCache()
      logger.info(`Synced ${Object.keys(newDb.records).length} game records`)
    } catch (err) {
      logger.error(`Metadata sync failed: ${err instanceof Error ? err.message : 'unknown'}`)
    }
  }

  private needsSync(): boolean {
    const lastSync = this.localDb.lastUpdated
    const now = Date.now()
    const lastSyncTime = new Date(lastSync).getTime()
    return now - lastSyncTime > this.syncInterval
  }

  private async loadLocalCache(): Promise<void> {
    // Load from ~/.y-core/metadata.json
  }

  private async saveLocalCache(): Promise<void> {
    // Save to ~/.y-core/metadata.json
  }

  private async fetchFromCloud(appId: string): Promise<GameMetadataRecord | null> {
    // Fetch single record from cloud
  }

  private cacheLocally(appId: string, record: GameMetadataRecord): void {
    // Add to local cache
  }
}
```

---

## 3. Standalone Remover Tool Design

### 3.1 CLI Tool Architecture

```
Y-Core DRM Remover CLI
├── Online Mode (with cloud sync)
├── Offline Mode (bundled database)
└── Shell Integration (explorer context menu)

y-core-drm-remover --scan "C:\Games\GameName"
y-core-drm-remover --remove 12345 --handler steamless
y-core-drm-remover --status all
y-core-drm-remover --sync
y-core-drm-remover --integrate-explorer
```

### 3.2 Bundled Database Strategy

```typescript
// electron/modules/drm-framework/bundled-db.ts

export class BundledGameDatabase {
  /**
   * For offline operation: embed JSON of popular games
   * Updated with each release
   */
  private static readonly BUNDLED_GAMES = {
    '12345': {
      title: 'Popular Game 1',
      drm: { primary: 'SteamStub', lastUpdated: '2026-07' },
      removers: [
        {
          handler: 'steamless',
          successRate: 0.95,
          avgTimeMs: 45000,
        },
      ],
      platforms: [
        {
          os: 'windows',
          verified: true,
          handledDrm: ['SteamStub'],
          lastVerified: '2026-07',
        },
      ],
    },
    // ... 1000+ more games
  }

  /**
   * Size: ~2-3 MB gzipped
   * Covers: Top 1000 Steam games + community favorites
   * Updated: Every release (monthly)
   */
  static getBundledDatabase(): GameMetadataDatabase {
    return {
      version: '1.0',
      lastUpdated: '2026-07-31',
      records: this.BUNDLED_GAMES,
    }
  }
}
```

### 3.3 Shell Integration (Windows)

```typescript
// electron/modules/drm-framework/shell-integration.ts

export class ShellIntegration {
  /**
   * Windows: Add "Y-Core: Remove DRM" to Explorer context menu
   */
  async registerExplorerContextMenu(): Promise<void> {
    const registry = require('winreg')

    // Register .exe context menu
    const reg = new registry({
      hive: registry.HKCR,
      key: '\\.exe\\shell\\ycore-drm',
    })

    await reg.create()
    await reg.set('', registry.REG_SZ, 'Y-Core: Remove DRM')

    const cmdReg = new registry({
      hive: registry.HKCR,
      key: '\\.exe\\shell\\ycore-drm\\command',
    })

    const drmToolPath = path.join(app.getAppPath(), 'y-core-drm-remover.exe')
    await cmdReg.set('', registry.REG_SZ, `"${drmToolPath}" --remove "%1"`)
  }

  /**
   * macOS: Use Finder Quick Actions
   * (Requires sandboxing approval)
   */
  async registerFinderQuickAction(): Promise<void> {
    // Create .workflow in ~/Library/QuickMacros/
  }

  /**
   * Linux: Nautilus integration
   */
  async registerNautilusAction(): Promise<void> {
    // Create .desktop file
  }
}
```

---

## 4. Cross-Platform Support Strategy

### 4.1 Platform-Specific Capabilities

| Feature | Windows | macOS | Linux |
|---------|---------|-------|-------|
| **DRM Detection** | ✅ (PE headers) | ✅ (Mach-O) | ✅ (ELF) |
| **SteamStub Removal** | ✅ (Steamless) | ⚠️ (Wine) | ⚠️ (Wine+Proton) |
| **Denuvo Detection** | ✅ | ❌ | ❌ |
| **CEG Removal** | ✅ | ❌ | ❌ |
| **macOS Native DRM** | — | ❌ (rare) | — |
| **Wine DLL Bypass** | N/A | ✅ | ✅ |
| **Proton DLL Override** | N/A | ❌ | ✅ |

### 4.2 macOS DRM Landscape Research

```
Most macOS Games: No DRM (30%)
├─ Indie developers skip macOS DRM
├─ porting from Linux

Some Games Use:
├─ Gatekeeper (OS-level, can't bypass)
├─ Custom hardcoded checks
├─ License key validation (per game)
└─ Rarely Denuvo (almost none)

Wine/Porting Layer:
├─ Many "macOS" games are Windows via Wine
├─ These inherit Windows DRM
├─ Require Wine DLL override techniques
```

### 4.3 Linux/Proton Strategy

```typescript
// electron/modules/drm-framework/handlers/proton-handler.ts

export class ProtonDrmHandler extends BaseDrmHandler {
  readonly id = 'proton-dll-override'
  readonly name = 'Proton DLL Override'
  readonly supportedPlatforms: Array<'windows' | 'macos' | 'linux'> = ['linux']
  readonly drmType = 'SteamStub' // Works for Windows games via Proton

  async detect(exePath: string): Promise<DrmDetectionResult> {
    // Check if running under Proton
    const isProton = process.env.PROTON_VERSION !== undefined
    if (!isProton) {
      return { detected: false, type: '', confidence: 'low' }
    }

    // Check Windows PE headers in the game executable
    const hasStub = await this.scanWindowsPE(exePath)
    
    return {
      detected: hasStub,
      type: 'SteamStub',
      confidence: 'high',
      signatures: hasStub ? ['.bind', '.stub'] : [],
    }
  }

  async remove(exePath: string): Promise<DrmRemovalResult> {
    // Strategy: Override steam_api64.dll with stub that bypasses DRM
    const prefixPath = this.getProtonPrefix()
    const system32 = path.join(prefixPath, 'drive_c', 'Windows', 'System32')

    try {
      // Backup original
      await this.backupDll(system32, 'steam_api64.dll')

      // Copy bypass DLL
      await this.copyBypassDll(system32, 'steam_api64.dll')

      return {
        success: true,
        message: 'DLL override applied (Proton)',
        method: 'proton-dll-override',
        executionTime: 100,
      }
    } catch (error) {
      return {
        success: false,
        message: `Proton DLL override failed: ${error instanceof Error ? error.message : 'unknown'}`,
        method: 'proton-dll-override',
        executionTime: 0,
      }
    }
  }

  async verify(exePath: string): Promise<boolean> {
    const system32 = path.join(this.getProtonPrefix(), 'drive_c', 'Windows', 'System32')
    // Check if bypass DLL is in place
    return fs.existsSync(path.join(system32, 'steam_api64.dll.ycore-bypass'))
  }

  private getProtonPrefix(): string {
    // Typically ~/.steam/steamapps/compatdata/<appid>/pfx
  }

  private async scanWindowsPE(exePath: string): Promise<boolean> {
    // Even on Linux, can detect Windows PE headers
  }

  private async backupDll(system32: string, dllName: string): Promise<void> {
    const source = path.join(system32, dllName)
    const backup = source + '.ycore-backup'
    if (!fs.existsSync(backup)) {
      await fs.promises.copyFile(source, backup)
    }
  }

  private async copyBypassDll(system32: string, dllName: string): Promise<void> {
    // Copy pre-built bypass DLL
  }

  getMetrics() {
    return {
      detectionTimeMs: 50,
      removalTimeMs: 100,
      successRate: 0.80,
      handledVersions: ['Proton 7.0+'],
    }
  }
}
```

---

## 5. Future Framework Extensibility

### 5.1 Third-Party Handler Support

```typescript
// Allow community to create handlers

export interface ThirdPartyHandlerManifest {
  id: string
  name: string
  version: string
  author: string
  license: 'GPL-3.0' | 'MIT' | 'Apache-2.0'
  
  handler: {
    path: string           // Path to compiled handler module
    class: string          // Export name of handler class
    dependencies: string[] // Required external binaries
  }

  supported: {
    drm: string[]
    platforms: Array<'windows' | 'macos' | 'linux'>
  }

  security: {
    sandboxed: boolean
    requiresApproval: boolean
    trustedAuthors: string[]
  }
}
```

### 5.2 Plugin Loading System

```typescript
// electron/modules/drm-framework/plugin-loader.ts

export class PluginLoader {
  async loadPluginsFromDirectory(pluginDir: string): Promise<void> {
    const manifests = await fs.promises.readdir(pluginDir)

    for (const manifestFile of manifests.filter((f) => f.endsWith('.manifest.json'))) {
      try {
        const manifest = JSON.parse(
          await fs.promises.readFile(path.join(pluginDir, manifestFile), 'utf-8')
        ) as ThirdPartyHandlerManifest

        // Verify manifest
        this.validateManifest(manifest)

        // Load module
        const handlerModule = await import(manifest.handler.path)
        const Handler = handlerModule[manifest.handler.class]

        // Instantiate and register
        const handler = new Handler()
        this.registry.register(handler)

        logger.info(`Loaded plugin: ${manifest.name} (${manifest.id})`)
      } catch (err) {
        logger.error(`Failed to load plugin ${manifestFile}: ${err instanceof Error ? err.message : 'unknown'}`)
      }
    }
  }

  private validateManifest(manifest: ThirdPartyHandlerManifest): void {
    // Security checks
    if (!manifest.security.sandboxed) {
      logger.warn(`Plugin ${manifest.id} is not sandboxed`)
    }

    // Verify signature if requiredgation
    if (manifest.security.requiresApproval) {
      // Check if approved by maintainers
    }
  }
}
```

---

## 6. Architecture Summary

| Component | Status | Complexity | Priority |
|-----------|--------|-----------|----------|
| Plugin system | Design | Medium | High |
| Universal detector | Design | Medium | High |
| Metadata enrichment | Design | High | Medium |
| Standalone CLI | Design | Medium | Medium |
| Cross-platform | Research | High | Low |
| Third-party plugins | Design | High | Low |

This architecture provides the foundation for a truly universal, extensible DRM handling framework that can evolve with new DRM schemes and community contributions.
