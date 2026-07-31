# DRM Remover — Phase 4 Fallback Strategies & Implementation Roadmap

## Executive Summary

When DRM can't be removed, Y-CORE provides intelligent fallback strategies that help users access their purchased games through legitimate alternative paths. This document outlines the decision tree, fallback system, and 12-month implementation plan.

---

## 1. When DRM Removal Fails: The Decision Tree

### 1.1 Universal Failure Analysis

```typescript
// electron/modules/drm-framework/fallback-engine.ts

export interface RemovalFailureAnalysis {
  gamePath: string
  appId: string
  drmType: string
  removalAttempted: string[]  // Handlers that failed
  failureReason: FailureReason
  recommendedFallbacks: Fallback[]
}

export type FailureReason =
  | 'drm-not-removable'           // Denuvo, newer schemes
  | 'all-handlers-failed'         // Tried everything
  | 'platform-not-supported'      // macOS DRM
  | 'game-specific-protection'    // Custom DRM
  | 'server-dependent'            // Online-only DRM
  | 'unknown'

export class FallbackEngine {
  /**
   * When removal fails, generate priority-ordered fallbacks
   */
  async analyzeRemovalFailure(
    game: GameDrmProfile,
    failureReason: FailureReason
  ): Promise<RemovalFailureAnalysis> {
    const fallbacks = await this.generateFallbacks(game, failureReason)
    
    // Sort by user preference + practicality
    fallbacks.sort((a, b) => (b.priority - a.priority))

    return {
      gamePath: game.gamePath,
      appId: game.appId,
      drmType: game.detectedDrm[0]?.type || 'unknown',
      removalAttempted: game.detectedDrm[0]?.handlers.map(h => h.id) || [],
      failureReason,
      recommendedFallbacks: fallbacks,
    }
  }
}
```

### 1.2 Decision Tree Flowchart

```
DRM Removal Attempted
    ↓
    ├─ SUCCESS? ────→ [Mark as removed, done]
    │
    └─ FAILURE ────→ Analyze failure reason
                       ↓
                       ├─ SteamStub?
                       │  └─ Try alternate handlers (Goldberg, etc)
                       │
                       ├─ Older Denuvo?
                       │  └─ Check if GOG version exists
                       │
                       ├─ Latest Denuvo (uncrackable)?
                       │  └─ [Move to fallbacks]
                       │
                       ├─ Server-dependent DRM?
                       │  └─ Check if offline patch exists
                       │
                       └─ Unknown DRM?
                          └─ Suggest community research
                          
Fallback Generation ────→ Evaluate options:
                          ├─ GOG purchase
                          ├─ Cloud gaming (Game Pass, etc)
                          ├─ Previous version (if unpatched)
                          ├─ Emulation
                          ├─ Wait for removal (community)
                          └─ Accept loss (game preservation angle)
                          
Show User ────→ Explain why, offer alternatives
```

---

## 2. Fallback Strategy Definitions

### 2.1 Strategy 1: GOG Purchase

#### What It Is
- Purchase DRM-free version of the same game
- GOG maintains old versions that work offline
- Often heavily discounted

#### When to Recommend
- ✅ Game available on GOG
- ✅ Price difference reasonable (<$10 more)
- ✅ User has budget
- ✅ Game preservation value high

#### Implementation

```typescript
// electron/modules/drm-framework/fallbacks/gog-finder.ts

export interface GogOption {
  title: string
  appId: string
  price: number
  discount?: number
  url: string
  releaseDate: string
  userScore: number
  availability: 'available' | 'delisted' | 'giveaway-eligible'
}

export class GogFallbackFinder {
  /**
   * Find GOG equivalent of Steam game
   * Use Steam API to find Denuvo games → check GOG
   */
  async findGogAlternative(appId: string): Promise<GogOption | null> {
    const steamGame = await this.fetchSteamGameInfo(appId)
    if (!steamGame) return null

    // Search GOG for same game
    const gogResults = await this.searchGog(steamGame.name)
    if (gogResults.length === 0) return null

    const exactMatch = gogResults.find(r => this.isSameGame(r, steamGame))
    if (!exactMatch) return null

    // Check if GOG version is DRM-free (it always is, but verify)
    const gogPage = await this.fetchGogPage(exactMatch.url)
    if (gogPage.isDrmFree !== true) return null

    return {
      title: exactMatch.title,
      appId: exactMatch.appId,
      price: exactMatch.price,
      discount: exactMatch.discount,
      url: exactMatch.url,
      releaseDate: exactMatch.releaseDate,
      userScore: exactMatch.userScore,
      availability: 'available',
    }
  }

  /**
   * Calculate recommendation priority
   */
  calculateGogPriority(game: GameDrmProfile, gogOption: GogOption): number {
    let score = 0

    // Price is major factor
    if (gogOption.price < 10) score += 5
    if (gogOption.price < 5) score += 5
    if (gogOption.discount && gogOption.discount > 50) score += 3

    // User experience
    if (gogOption.userScore > 4.5) score += 3
    if (gogOption.availability === 'available') score += 2

    // Game preservation value
    if (this.isLegacyGame(game)) score += 2
    if (this.isHighValue(game)) score += 1

    return score
  }

  private isLegacyGame(game: GameDrmProfile): boolean {
    // Old games (preservation importance)
    return new Date(game.metadata?.releaseDate || 0).getFullYear() < 2010
  }

  private isHighValue(game: GameDrmProfile): boolean {
    // Highly rated/reviewed games
    return (game.metadata?.protonDbRating || 0) > 4.5
  }
}
```

#### UI/UX Presentation

```typescript
// React component showing GOG option

export interface GogFallbackCardProps {
  gogOption: GogOption
  savings: number
  onClick: () => void
}

export function GogFallbackCard({
  gogOption,
  savings,
  onClick,
}: GogFallbackCardProps) {
  return (
    <Card className="fallback-option gog-card">
      <div className="header">
        <h3>GOG – DRM-Free Version</h3>
        <Badge>${gogOption.price} {savings > 0 && `Save $${savings}`}</Badge>
      </div>

      <div className="content">
        <p>
          The same game, completely DRM-free. Purchase once, play forever offline.
        </p>

        <div className="details">
          <div>Rating: {gogOption.userScore}/5 ⭐</div>
          <div>Released: {gogOption.releaseDate}</div>
          <div>Availability: {gogOption.availability}</div>
        </div>
      </div>

      <Button onClick={onClick} className="cta">
        Open GOG Store
      </Button>

      <small className="note">
        GOG is a legitimate store. Prices vary by region and current sales.
      </small>
    </Card>
  )
}
```

---

### 2.2 Strategy 2: Cloud Gaming / Subscription

#### What It Is
- **Game Pass**: Microsoft subscription service (console + PC)
- **PlayStation Plus Premium**: Sony cloud gaming
- **Xbox Cloud**: Direct cloud streaming
- **GeForce NOW**: NVIDIA cloud streaming
- **Amazon Luna**: Amazon's streaming service

#### When to Recommend
- ✅ Game available on Game Pass (check database)
- ✅ User has stable internet (>5 Mbps)
- ✅ User already has subscription
- ✅ DRM is server-based (online unavoidable)

#### Why It Works

```
Traditional DRM Problem:
  Game requires online verification
  → Server shut down → Game unplayable
  
Cloud Gaming Solution:
  Game runs on server anyway
  → User doesn't care about DRM
  → Server outage = service issue, not DRM issue
  → Feels like legitimate access

Perfect for:
  - Online-dependent games anyway
  - Games with shutdown timers
  - Users with good internet
```

#### Implementation

```typescript
// electron/modules/drm-framework/fallbacks/cloud-gaming-finder.ts

export interface CloudGamingOption {
  service: 'gamepass' | 'psplus' | 'geforce-now' | 'luna' | 'xcloud'
  title: string
  available: boolean
  subscriptionRequired: boolean
  subscriptionCost: number
  url: string
  networkRequirements: {
    minMbps: number
    recommendedMbps: number
    latencyMs: number
  }
}

export class CloudGamingFallbackFinder {
  private cloudServices = {
    gamepass: {
      api: 'https://api.gamepass.com/games',
      cost: 9.99, // Monthly
      platform: ['windows', 'xbox'],
    },
    psplus: {
      api: 'https://api.playstation.com/games',
      cost: 18.99,
      platform: ['playstation'],
    },
    geforcenow: {
      api: 'https://api.nvidia.com/games',
      cost: 4.99, // Monthly free tier available
      platform: ['windows', 'macos', 'linux', 'phone'],
    },
    luna: {
      api: 'https://api.amazon.com/luna/games',
      cost: 9.99,
      platform: ['windows', 'macos', 'tv', 'phone'],
    },
  }

  async findCloudGamingOptions(appId: string): Promise<CloudGamingOption[]> {
    const results: CloudGamingOption[] = []

    // Check each service
    for (const [service, config] of Object.entries(this.cloudServices)) {
      const isAvailable = await this.checkAvailability(
        appId,
        service as keyof typeof this.cloudServices
      )

      if (isAvailable) {
        results.push({
          service: service as CloudGamingOption['service'],
          title: `Play on ${service.charAt(0).toUpperCase() + service.slice(1)}`,
          available: true,
          subscriptionRequired: true,
          subscriptionCost: config.cost,
          url: this.getServiceUrl(service, appId),
          networkRequirements: {
            minMbps: 5,
            recommendedMbps: 15,
            latencyMs: 100,
          },
        })
      }
    }

    return results
  }

  private async checkAvailability(
    appId: string,
    service: string
  ): Promise<boolean> {
    // Query service API to see if game available
  }

  private getServiceUrl(service: string, appId: string): string {
    const mapping = {
      gamepass: `https://www.xbox.com/en-US/xbox-game-pass/games?appid=${appId}`,
      psplus: `https://www.playstation.com/ps-plus/games/`,
      geforcenow: `https://www.nvidia.com/en-us/geforce/games/`,
      luna: `https://www.amazon.com/luna/`,
    }
    return mapping[service as keyof typeof mapping] || '#'
  }
}
```

#### Recommendation Priority

```typescript
// Score cloud gaming highly if:
// - Game is online multiplayer (DRM irrelevant)
// - Server-dependent DRM (online unavoidable)
// - User has existing subscription
// - Good internet connection

function scoreCloudGaming(game: GameDrmProfile, user: UserProfile): number {
  let score = 0

  // Is it online-focused?
  if (game.metadata?.isMultiplayer) score += 5
  if (game.metadata?.requiresOnline) score += 5

  // Does user have subscription?
  if (user.hasGamePass) score += 3
  if (user.hasPlayStation) score += 2

  // Internet quality?
  if (user.internetSpeedMbps > 15) score += 2
  if (user.internetLatencyMs < 100) score += 1

  return score
}
```

---

### 2.3 Strategy 3: Find Previous Uncracked Version

#### What It Is
- Some games released pre-DRM or with DRM that was cracked
- Older versions might be available (Steam, backups, archives)
- "Version downgrade" to before DRM was added

#### When to Recommend
- ✅ Game had multiple major releases
- ✅ Earlier version is known DRM-free
- ✅ Earlier version still has legitimate community
- ✅ Performance/features not critical

#### Example: Resident Evil 4

```
RE4 Release History:
  - 2005: Original GameCube (no DRM)
  - 2007: PC release (SecuROM)
  - 2014: Remake announced
  - 2023: Remake released (Denuvo)

Y-CORE Solution:
  User can't remove Denuvo remake DRM
  → Y-CORE suggests: "Play 2007 or 2014 version DRM-free"
  → Both available on Steam (if not removed)
  → Or on GOG (original, DRM-free)
```

#### Implementation

```typescript
// electron/modules/drm-framework/fallbacks/version-finder.ts

export interface GameVersion {
  year: number
  version: string
  title: string
  hasDrm: boolean
  drmType?: string
  removable: boolean
  whereToFind: 'steam' | 'gog' | 'archive' | 'community'
  url?: string
  notes?: string
}

export class PreviousVersionFinder {
  /**
   * Find previous uncracked versions of a game
   */
  async findPreviousVersions(appId: string): Promise<GameVersion[]> {
    const gameHistory = await this.fetchGameHistory(appId)
    const versions: GameVersion[] = []

    for (const release of gameHistory.releases) {
      // Check if this version has removable or no DRM
      const drmInfo = await this.analyzeDrm(release)

      if (!drmInfo.hasDrm || drmInfo.removable) {
        versions.push({
          year: new Date(release.date).getFullYear(),
          version: release.version,
          title: release.title,
          hasDrm: drmInfo.hasDrm,
          drmType: drmInfo.type,
          removable: drmInfo.removable,
          whereToFind: release.platform,
          url: release.storeUrl,
          notes: release.notes,
        })
      }
    }

    return versions.sort((a, b) => b.year - a.year)
  }

  private async fetchGameHistory(appId: string): Promise<GameHistoryData> {
    // Query Wikipedia, IGDB, Steam database
    // Build timeline of releases
  }

  private async analyzeDrm(release: Release): Promise<DrmAnalysis> {
    // For each release, check:
    // - What DRM was used?
    // - Can Y-CORE remove it?
  }
}
```

#### UI/UX Example

```typescript
export function PreviousVersionFallback({ versions }: { versions: GameVersion[] }) {
  return (
    <Card className="fallback-option versions-card">
      <h3>Play an Earlier Version (DRM-Free)</h3>

      <div className="versions-list">
        {versions.map((v) => (
          <div key={v.version} className="version-option">
            <div className="version-title">
              {v.title} ({v.year})
              {v.removable && <Badge className="success">DRM Removable</Badge>}
              {!v.hasDrm && <Badge className="info">No DRM</Badge>}
            </div>

            <p className="version-notes">{v.notes}</p>

            <Button
              onClick={() => window.open(v.url)}
              className="secondary"
            >
              Find {v.whereToFind === 'gog' ? 'on GOG' : 'on Steam'}
            </Button>
          </div>
        ))}
      </div>

      <small className="info">
        Earlier versions are often cheaper and may have active communities.
      </small>
    </Card>
  )
}
```

---

### 2.4 Strategy 4: Emulation

#### What It Is
- Play console/original version on PC via emulator
- Example: Play PS2 version of RE4 on PC via PCSX2
- Often better than DRM'd PC version

#### When to Recommend
- ✅ Game available on console
- ✅ Good emulator exists (PCSX2, Dolphin, etc)
- ✅ Game is stable in emulator (check ProtonDB-like database)
- ✅ User has original game media or owns it

#### Legitimate Use Case

```
User owns: RE4 on PS2 (physical disc)
Emulation: Play via PCSX2 emulator on PC
Legal?: YES - Fair use for backup of owned media
DRM?: No - Emulation bypasses DRM legally

User owns: RE4 on Steam (Denuvo version)
Question: Can they emulate console version?
Answer: YES - They already own the game, emulation is 
        legitimate backup/archival
```

#### Implementation

```typescript
// electron/modules/drm-framework/fallbacks/emulation-finder.ts

export interface EmulationOption {
  consolePlatform: 'ps1' | 'ps2' | 'ps3' | 'xbox' | 'gamecube' | 'wii'
  emulator: string
  emulatorUrl: string
  compatibility: 'playable' | 'works-with-issues' | 'slow' | 'not-working'
  performanceNotes?: string
  legality: 'legal' | 'gray' | 'check-laws'
  recommendedSpecs: {
    cpuGhz: number
    ramGb: number
    gpuVram: number
  }
}

export class EmulationFallbackFinder {
  /**
   * Find emulation options for console versions
   */
  async findEmulationOptions(gameTitle: string): Promise<EmulationOption[]> {
    const consoleVersions = await this.findConsoleVersions(gameTitle)
    const options: EmulationOption[] = []

    for (const version of consoleVersions) {
      // Find best emulator for this console
      const emulator = this.selectBestEmulator(version.console)
      
      // Check compatibility
      const compat = await this.checkEmulationCompatibility(
        gameTitle,
        version.console,
        emulator
      )

      options.push({
        consolePlatform: version.console,
        emulator: emulator.name,
        emulatorUrl: emulator.url,
        compatibility: compat.status,
        performanceNotes: compat.notes,
        legality: 'legal', // Emulation is legal in most places
        recommendedSpecs: emulator.minSpecs,
      })
    }

    return options
  }

  private selectBestEmulator(
    console: string
  ): { name: string; url: string; minSpecs: Record<string, number> } {
    const emulators: Record<string, any> = {
      ps2: {
        name: 'PCSX2',
        url: 'https://pcsx2.net',
        minSpecs: { cpuGhz: 2, ramGb: 2, gpuVram: 1 },
      },
      gamecube: {
        name: 'Dolphin',
        url: 'https://dolphin-emu.org',
        minSpecs: { cpuGhz: 2, ramGb: 2, gpuVram: 1 },
      },
      ps1: {
        name: 'DuckStation',
        url: 'https://www.duckstation.org',
        minSpecs: { cpuGhz: 1, ramGb: 1, gpuVram: 0.5 },
      },
    }
    return emulators[console]
  }

  private async checkEmulationCompatibility(
    gameTitle: string,
    console: string,
    emulator: any
  ): Promise<{ status: string; notes?: string }> {
    // Query emulator compatibility database
    // e.g., PCSX2 has game database with compatibility info
  }
}
```

#### Legal Disclaimer

```
Y-CORE Emulation Statement:

✅ Legal:
  • You own the physical game media
  • Using emulator to play your own copy
  • Fair use for backup/archival

❌ Illegal:
  • Downloading games you don't own
  • Sharing emulated game files
  • Commercial use of emulation

⚠️  Y-CORE's Role:
  • Provides information about emulation options
  • Does NOT distribute games or emulators
  • Users responsible for legality in their region
  • Users must own original game before emulating
```

---

### 2.5 Strategy 5: Wait for Community Removal

#### What It Is
- Game will eventually be cracked/removed by community
- Y-CORE tracks progress and notifies user
- Realistic timeline: months to years

#### When to Recommend
- ✅ Popular game (high-value target)
- ✅ DRM is known to be crackable
- ✅ Community active (Discord, forums)
- ✅ User willing to wait

#### Implementation

```typescript
// electron/modules/drm-framework/fallbacks/community-tracker.ts

export interface CommunityRemovalTracker {
  gameTitle: string
  appId: string
  drmType: string
  
  crackStatus: 'uncracked' | 'in-progress' | 'near-complete' | 'available'
  timelineEstimate?: {
    min: number    // Months
    max: number
    basis: string  // "based on similar games"
  }
  
  activeResearch: {
    researchers: number
    primaryForum: string
    lastUpdate: string
    progressPercent: number
  }
  
  historicalPatterns: {
    similarGamesCrackTime: number // Median days
    drmTypeCrackTime: number
    trendingUp: boolean
  }
}

export class CommunityRemovalTracker {
  /**
   * Track progress of community crack efforts
   * Source: reddit, GitHub, forums, ProtonDB discussions
   */
  async trackRemovalProgress(
    appId: string
  ): Promise<CommunityRemovalTracker> {
    const game = await this.fetchGameInfo(appId)
    const drmType = game.detectedDrm[0]?.type
    
    // Monitor multiple sources
    const sources = await Promise.all([
      this.monitorReddit(`${game.title} crack`),
      this.monitorGitHub(drmType),
      this.monitorSpecializedForums(drmType),
      this.checkHistoricalPatterns(drmType),
    ])

    // Aggregate data
    const progress = this.aggregateProgress(sources)

    return {
      gameTitle: game.title,
      appId,
      drmType,
      crackStatus: progress.status,
      timelineEstimate: progress.estimate,
      activeResearch: progress.activity,
      historicalPatterns: progress.patterns,
    }
  }

  private async monitorReddit(query: string): Promise<any> {
    // Search r/crackwatch, r/CrackSupport, etc
  }

  private async monitorGitHub(drmType: string): Promise<any> {
    // Search for active DRM cracking projects
  }

  private async monitorSpecializedForums(drmType: string): Promise<any> {
    // Monitor crack forums (for research only)
  }

  private async checkHistoricalPatterns(drmType: string): Promise<any> {
    // How long did similar DRM take to crack?
    // Is cracking community getting faster?
  }
}
```

#### UI/UX Presentation

```typescript
export function CommunityRemovalTracker({
  tracker,
  onNotifyMe,
}: {
  tracker: CommunityRemovalTracker
  onNotifyMe: () => void
}) {
  const status = {
    uncracked: { emoji: '🔒', label: 'Not yet cracked', color: 'red' },
    'in-progress': {
      emoji: '🔓',
      label: 'Community working on it',
      color: 'yellow',
    },
    'near-complete': { emoji: '⚡', label: 'Almost there!', color: 'orange' },
    available: { emoji: '✅', label: 'Successfully cracked', color: 'green' },
  }[tracker.crackStatus]

  return (
    <Card className="fallback-option community-card">
      <h3>
        {status.emoji} {status.label}
      </h3>

      {tracker.timelineEstimate && (
        <p className="timeline">
          Estimated timeline: {tracker.timelineEstimate.min}-
          {tracker.timelineEstimate.max} months
          <br />
          <small>{tracker.timelineEstimate.basis}</small>
        </p>
      )}

      <div className="research-info">
        <div>Researchers active: {tracker.activeResearch.researchers}</div>
        <div>
          Last update:{' '}
          {formatDate(tracker.activeResearch.lastUpdate)}
        </div>
        <div>
          Progress: {tracker.activeResearch.progressPercent}%
        </div>
      </div>

      <Button onClick={onNotifyMe} className="secondary">
        Notify me when cracked
      </Button>

      <small className="info">
        Join the research on{' '}
        <a href={tracker.activeResearch.primaryForum} target="_blank">
          {tracker.activeResearch.primaryForum}
        </a>
      </small>
    </Card>
  )
}
```

---

### 2.6 Strategy 6: Accept & Archive (Preservation)

#### What It Is
- Accept that removal isn't possible for now
- Archive the game for future restoration
- Focus on cultural preservation angle

#### When to Recommend
- ❌ Game has uncrackable DRM (Denuvo)
- ✅ Preservation value is high (classic game)
- ✅ No alternatives available
- ✅ User interested in archival

#### Implementation

```typescript
// electron/modules/drm-framework/fallbacks/preservation-archiver.ts

export interface PreservationArchive {
  gameTitle: string
  appId: string
  archiveReason: 'uncrackable-drm' | 'server-shutdown' | 'delisted'
  
  archivedContent: {
    gameFiles: string        // Backup path
    metadata: GameMetadata
    screenshots: string[]
    documentation: string[]
  }
  
  preservationMetadata: {
    archivedDate: string
    culturalValue: 'high' | 'medium' | 'low'
    communityValue: string   // Why this game matters
    restorationPotential: string // When might we restore it?
  }
}

export class PreservationArchiver {
  /**
   * Archive games that can't be cracked for future restoration
   * Participate in game preservation movement
   */
  async archiveGameForPreservation(
    game: GameDrmProfile,
    reason: string
  ): Promise<PreservationArchive> {
    // 1. Create backup
    const archivePath = await this.createSecureBackup(game.gamePath)

    // 2. Collect metadata
    const metadata = await this.gatherMetadata(game.appId)

    // 3. Document why it matters
    const preservationMeta = await this.assessPreservationValue(game)

    // 4. Register with preservation networks
    await this.registerWithArchives(game, archivePath)

    return {
      gameTitle: game.title,
      appId: game.appId,
      archiveReason: reason as any,
      archivedContent: {
        gameFiles: archivePath,
        metadata,
        screenshots: await this.captureScreenshots(game),
        documentation: await this.gatherDocumentation(game),
      },
      preservationMetadata: preservationMeta,
    }
  }

  private async createSecureBackup(gamePath: string): Promise<string> {
    // Create compressed, checksummed backup
    // Store in Y-CORE's preservation vault
  }

  private async registerWithArchives(
    game: GameDrmProfile,
    archivePath: string
  ): Promise<void> {
    // Register with:
    // - Video Game History Foundation
    // - Internet Archive
    // - Stanford Digital Repository
  }

  private async assessPreservationValue(
    game: GameDrmProfile
  ): Promise<object> {
    return {
      culturalValue: await this.assessCulturalImpact(game),
      communityValue: await this.assessCommunityValue(game),
      restorationPotential: await this.estimateRestorationTimeline(game),
    }
  }
}
```

#### Preservation Impact Statement

```markdown
# Game Preservation Value

This game has been archived for digital preservation.

**Why It Matters:**
- [Cultural significance]
- [Community value]
- [Historical importance]

**When We Might Restore It:**
- Denuvo servers shut down
- DMCA exemptions updated
- Community cracking tools emerge
- Copyright holder releases DRM-free version

**Preservation Partners:**
- Video Game History Foundation
- Internet Archive
- Your Local Library

You're contributing to game preservation.
```

---

## 3. Fallback Engine: Priority Scoring

### 3.1 Scoring Algorithm

```typescript
// Rank fallbacks by user preference + practicality

export class FallbackPriorityScoringEngine {
  scoreAllFallbacks(
    game: GameDrmProfile,
    userPreferences: UserPreferences,
    availableFallbacks: Fallback[]
  ): ScoredFallback[] {
    return availableFallbacks
      .map((fb) => ({
        fallback: fb,
        score: this.calculateScore(fb, game, userPreferences),
      }))
      .sort((a, b) => b.score - a.score)
  }

  private calculateScore(
    fallback: Fallback,
    game: GameDrmProfile,
    prefs: UserPreferences
  ): number {
    let score = 0

    // Availability: most important
    if (fallback.available) score += 50
    else return -1000 // Not available, score lowest

    // Cost factor
    if (fallback.type === 'gog-purchase') {
      const price = fallback.data.price
      if (price < 5) score += 30
      else if (price < 10) score += 20
      else if (price < 20) score += 10
      else score -= 10
    }

    // Convenience
    if (fallback.type === 'gamepass') {
      if (prefs.hasGamePass) score += 40
      if (prefs.internetSpeed > 15) score += 15
    }

    if (fallback.type === 'previous-version') score += 25

    if (fallback.type === 'emulation') {
      if (prefs.canEmulate) score += 20
      if (prefs.ownsConsoleVersion) score += 25
    }

    // Preservation value
    if (fallback.type === 'preservation-archive') {
      if (game.metadata?.culturalValue === 'high') score += 15
    }

    // Community sentiment
    if (fallback.type === 'wait-for-crack') {
      if (game.metadata?.communityInterest === 'high') score += 20
      if (fallback.data.timelineMonths < 6) score += 25
    }

    return score
  }
}
```

### 3.2 Example Scoring

```
Game: "Resident Evil 4" (Remake with Denuvo)
User: Moderate budget, has Game Pass, reasonable internet

Fallback Scores:
  1. GOG DRM-Free Version          [Score: 75]
     └─ Cheap, best option, widely available
  
  2. Game Pass Streaming            [Score: 60]
     └─ User has subscription, works well
  
  3. Wait for Community Crack      [Score: 45]
     └─ Popular game, will likely be cracked
  
  4. Emulate PS2 Version            [Score: 25]
     └─ Possible but more complex
  
  5. Archive for Preservation       [Score: 10]
     └─ Last resort only

Recommended: "Purchase GOG version" (user-friendly, available now)
```

---

## 4. 12-Month Implementation Roadmap

### Phase 4.1 (Months 1-3): Foundation

```
[ ] Research fallback strategies (30h)
    └─ GOG API integration
    └─ Game Pass database structure
    └─ Cloud gaming service APIs

[ ] Design fallback architecture (20h)
    └─ Fallback engine interface
    └─ Priority scoring system
    └─ UI/UX components

[ ] Implement GOG finder (40h)
    └─ Steam → GOG matching
    └─ Price comparison
    └─ Direct links

Target: GOG fallback fully functional
```

### Phase 4.2 (Months 4-6): Expansion

```
[ ] Implement cloud gaming finder (30h)
    └─ Game Pass integration
    └─ GeForce NOW integration
    └─ Subscription detection

[ ] Build version finder (35h)
    └─ Game history research
    └─ DRM analysis by version
    └─ Community database

[ ] Create emulation interface (25h)
    └─ Console version detection
    └─ Emulator recommendations
    └─ Legality disclaimers

Target: 4/6 fallback strategies implemented
```

### Phase 4.3 (Months 7-9): Intelligence

```
[ ] Community tracker integration (40h)
    └─ Reddit/Forum monitoring
    └─ Crack progress tracking
    └─ Timeline estimation

[ ] Preservation archiver (30h)
    └─ Backup system
    └─ Metadata collection
    └─ Archive registration

[ ] Priority scoring engine (25h)
    └─ Algorithm refinement
    └─ User preference learning
    └─ Testing & tuning

Target: All 6 fallback strategies live
```

### Phase 4.4 (Months 10-12): Polish & Launch

```
[ ] UI/UX refinement (30h)
    └─ Fallback cards
    └─ Decision flow
    └─ Mobile responsiveness

[ ] Testing & QA (25h)
    └─ Fallback accuracy
    └─ Price comparison verification
    └─ User testing

[ ] Documentation (20h)
    └─ User guides
    └─ FAQ for each fallback
    └─ Legal disclaimers

[ ] Launch & monitoring (20h)
    └─ Gradual rollout
    └─ User feedback collection
    └─ Metrics & analytics

Target: Production-ready fallback system
```

---

## 5. Fallback Metrics & Success Criteria

### 5.1 Key Metrics

```
Effectiveness Metrics:
  └─ % of users finding suitable fallback: Target >80%
  └─ Avg. satisfaction with fallback: Target >4/5
  └─ Time to find fallback: Target <30s

Business Metrics:
  └─ GOG referral earnings: $X/month
  └─ Game Pass sign-ups: Y users
  └─ Preservation partnerships: Z initiatives

Quality Metrics:
  └─ Fallback availability: 95%+
  └─ Price accuracy: ±5%
  └─ Link validity: 99%+
```

### 5.2 Success Scenarios

```
Scenario A: User can't remove DRM (Denuvo)
  Y-CORE: Suggests GOG version ($15)
  User: "Oh, I didn't know GOG had it. Let me check"
  Result: ✅ User satisfied, potential GOG sale

Scenario B: User has limited time
  Y-CORE: Suggests Game Pass (user has subscription)
  User: "Perfect, I can play it now"
  Result: ✅ User happy, Microsoft happy

Scenario C: Popular indie game
  Y-CORE: Suggests "Wait for crack (5-10 months)"
  User: "Okay, let me bookmark this"
  Result: ✅ User engaged, community aware

Scenario D: Legacy game
  Y-CORE: Suggests "Archive for preservation"
  User: "I want my game preserved"
  Result: ✅ Cultural preservation, foundation partnership
```

---

## 6. Community & Partner Integration

### 6.1 GOG Partnership

```
Proposal to GOG:
  "Y-CORE can be GOG's primary recommendation"
  
Benefits for GOG:
  - Direct sales from removal failures
  - Marketing in game mod community
  - Alternative to piracy

Benefits for Y-CORE:
  - Affiliate commissions
  - Positive brand alignment
  - Revenue for sustainability

Contact: business@gog.com
```

### 6.2 Game Pass Integration

```
Proposal to Microsoft:
  "Y-CORE fallback engine drives Game Pass adoption"
  
Benefits for Microsoft:
  - New customer acquisition
  - Positive brand for Game Pass
  - DRM-removal market capture

Benefits for Y-CORE:
  - API access
  - Co-marketing
  - Potential funding

Contact: partnerships@xbox.com
```

### 6.3 Preservation Partnerships

```
Proposal to Video Game History Foundation:
  "Y-CORE provides technical infrastructure"
  
Benefits for Foundation:
  - Removal tools for preservation
  - Technical expertise
  - Community involvement

Benefits for Y-CORE:
  - Legal backing
  - Preservation mission
  - Grant funding

Contact: hello@gvhf.org
```

---

## 7. Final Recommendations

### When Removal Fails: Show These Options

1. ✅ **Best**: GOG version (if available, affordable)
2. ✅ **Good**: Game Pass (if user has subscription)
3. ✅ **Good**: Previous DRM-free version
4. ⚠️ **Alternative**: Emulation (if legal & feasible)
5. ⏳ **Future**: Wait for community crack
6. 📚 **Preservation**: Archive for future restoration

### User Experience

```
User: "I want to play this game"
Y-CORE: "Found DRM... attempting removal"
        ↓
        "Removal failed (Denuvo)"
        ↓
[Show Priority-Ranked Fallbacks]
        ↓
User selects best option
        ↓
Y-CORE: "Opening GOG store..." 
        (or "Streaming via Game Pass...")
        ↓
User: ✅ Happy (game is playable)
```

---

## Summary

The fallback strategy transforms Y-CORE from a pure removal tool into a **holistic game access enabler**. Instead of just telling users "DRM can't be removed," we say "Here's how you CAN play it."

This approach:
- ✅ Serves users better
- ✅ Aligns with legal boundaries
- ✅ Creates revenue opportunities
- ✅ Supports game preservation
- ✅ Builds partnerships
- ✅ Ensures long-term sustainability

---

**Last Updated:** 2026-07-31  
**Status:** Roadmap Ready  
**Estimated Implementation:** 12 months  
**Next Phase:** Architecture refinement & partnership outreach
