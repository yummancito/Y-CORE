# Phase 3 DRM Remover - Quick Start Guide

## Installation

Phase 3 is already integrated into Y-CORE. No additional installation needed.

```bash
# Just build and run
npm run build
npm start
```

---

## Quick API Reference

### 1. Detect DRM Type (ML-based)

```typescript
import { detectDrmStubs } from './ml-stub-detector'

const result = await detectDrmStubs('/path/to/game.exe')

// Result:
// {
//   detected: true,
//   drmType: 'SteamStub (v4+)',
//   confidence: 0.92,  // 0-1 scale
//   signatures: ['SteamStub'],
//   recommendations: [],
//   riskLevel: 'low'
// }
```

### 2. Detect Anti-Cheat

```typescript
import { detectAntiCheat } from './anticheat-plugin'

const result = await detectAntiCheat('/path/to/game/folder')

// Result:
// {
//   detected: false,
//   antiCheatType: 'none',
//   kernelMode: false,
//   confidence: 1.0,
//   evidence: [],
//   warnings: [],
//   disableMethods: [],
//   documentation: ''
// }
```

### 3. Get Community Stats

```typescript
import { communityDbService } from './community-db.service'

await communityDbService.initialize()
const stats = await communityDbService.getStats('570')

// Result:
// {
//   appId: '570',
//   totalReports: 150,
//   successRate: 94,  // percentage
//   preferredMethod: 'steamless',
//   lastRiskLevel: 'low',
//   supportedVersions: ['1.0.0', '1.0.1']
// }
```

### 4. Smart DRM Assessment

```typescript
import { assessGameDRM } from './drm-strategy-router'

const assessment = await assessGameDRM('570', '/game/deus-ex.exe', '1.0.0')

// Result includes:
// {
//   appId: '570',
//   drmDetection: { ... },
//   antiCheatDetection: { ... },
//   recommendedStrategy: {
//     method: 'steamless',
//     order: 1,
//     successRate: 95,
//     riskLevel: 'low',
//     estimatedTime: 45,  // seconds
//     notes: '...'
//   },
//   fallbackStrategies: [ ... ],
//   riskLevel: 'low',
//   recommendation: 'Method: steamless (95% success rate, low risk, ~45s)'
// }
```

### 5. Contribute Result

```typescript
import { communityDbService } from './community-db.service'

await communityDbService.contribute({
  appId: '570',
  gameVersion: '1.0.0',
  drmType: 'SteamStub (v4+)',
  removalMethod: 'steamless',
  successStatus: 'success',  // 'success' | 'partial' | 'failed'
  userNotes: 'Worked perfectly on Windows 10'
})
```

### 6. Through drmService

```typescript
import { drmService } from './drm.service'

// Comprehensive assessment
const result = await drmService.assessGameAdvanced('570')

// Contribute result
await drmService.contributeResult(
  '570',
  'SteamStub (v4+)',
  'steamless',
  'success',
  'Great!'
)

// Get community feedback
const stats = await drmService.getCommunityStats('570')

// Export database
const json = await drmService.exportCommunityDatabase()
```

---

## Common Scenarios

### Scenario 1: User wants to remove DRM from a game

```typescript
// 1. Assess game
const assessment = await drmService.assessGameAdvanced('570')

// 2. Show user the recommendation
console.log(assessment.assessment.recommendation)
// Output: "Method: steamless (95% success rate, low risk, ~45s)"

// 3. User agrees, execute removal
const removal = await drmService.remove('570')

// 4. Report result
if (removal.success) {
  await drmService.contributeResult(
    '570',
    assessment.drmDetection.drmType,
    'steamless',
    'success'
  )
}
```

### Scenario 2: User encounters anti-cheat

```typescript
const assessment = await drmService.assessGameAdvanced('1091500')  // Valorant

if (assessment.antiCheatDetection.detected) {
  console.log('Anti-cheat:', assessment.antiCheatDetection.antiCheatType)
  console.log('Cannot remove:', assessment.antiCheatDetection.kernelMode)
  console.log('Why:', assessment.antiCheatDetection.documentation)
}
```

### Scenario 3: Game removal failed, try fallback

```typescript
const assessment = await assessGameDRM('570', '/game.exe', '1.0.0')

// Try primary
let result = await someRemovalFunction(assessment.recommendedStrategy)

if (!result.success && assessment.fallbackStrategies.length > 0) {
  // Try fallback
  const fallback = assessment.fallbackStrategies[0]
  result = await someRemovalFunction(fallback)
}
```

### Scenario 4: Check community consensus

```typescript
const stats = await communityDbService.getStats('570')

if (stats && stats.successRate > 90) {
  console.log('Community says: This removal works!')
} else if (stats && stats.successRate < 50) {
  console.log('Community says: This is risky, proceed with caution')
} else {
  console.log('Community feedback: Mixed results')
}
```

---

## Data Flow Diagram

```
User wants to remove DRM
          ↓
┌─────────────────────────────┐
│  ML Stub Detector           │
│  → Identify DRM type        │
│  → Confidence scoring       │
│  → Entropy analysis         │
└────────┬────────────────────┘
         ↓
┌─────────────────────────────┐
│  Anti-Cheat Detector        │
│  → Check for AC             │
│  → Kernel-level?            │
│  → Display warnings         │
└────────┬────────────────────┘
         ↓
┌─────────────────────────────┐
│  Community Database         │
│  → Get success stats        │
│  → Preferred method         │
│  → Known issues             │
└────────┬────────────────────┘
         ↓
┌─────────────────────────────┐
│  Smart Router               │
│  → Select best method       │
│  → Generate fallbacks       │
│  → Assess overall risk      │
└────────┬────────────────────┘
         ↓
       Show recommendation to user
         ↓
   User proceeds or cancels
         ↓
  Execute removal strategy
         ↓
Report result to community DB
```

---

## Debugging

### Enable detailed logging

```typescript
import { logger } from '../../logger'

logger.debug('[ML Stub] Analyzing game...', 'drm-ml')
logger.info('[DRM Router] Selected steamless method', 'drm-router')
logger.warn('[AntiCheat] Kernel AC detected!', 'drm-anticheat')
```

### Check what's being detected

```typescript
const result = await detectDrmStubs('/game.exe')
console.log('DRM Detected:', result.detected)
console.log('Type:', result.drmType)
console.log('Confidence:', result.confidence)
console.log('Signatures:', result.signatures)
console.log('Recommendations:', result.recommendations)
```

### Verify community data

```typescript
await communityDbService.initialize()
const entries = await communityDbService.getEntries('570')
console.log(`Total reports: ${entries.length}`)
entries.forEach(e => {
  console.log(`  - ${e.removalMethod}: ${e.successRate}% (${e.reportCount} reports)`)
})
```

---

## Performance Tips

1. **Batch operations**: Process multiple games at once
   ```typescript
   const assessments = await assessGameBatch(games)
   ```

2. **Cache community data**: Stats don't change frequently
   ```typescript
   const stats = await communityDbService.getStats('570')
   // Can reuse this data for a while
   ```

3. **Lazy load Phase 3**: Use optional chaining
   ```typescript
   const assessment = await drmService.assessGameAdvanced?.('570')
   ```

---

## Error Handling

### Always wrap in try-catch

```typescript
try {
  const result = await detectDrmStubs('/game.exe')
} catch (err) {
  console.error('Detection failed:', err.message)
  // Fall back to plugin-based detection
}
```

### Check if modules are available

```typescript
try {
  const result = await drmService.assessGameAdvanced('570')
  if (result.success) {
    // Use Phase 3 result
  } else {
    // Fall back to Phase 1/2
  }
} catch (err) {
  // Phase 3 not available, use legacy method
}
```

---

## Testing

### Run tests
```bash
npm run test -- drm-phase3-integration.test.ts
```

### Test a specific scenario
```bash
npm run test -- drm-phase3-integration.test.ts -t "Scenario 1"
```

---

## Troubleshooting

### "Module not found" error
- Ensure TypeScript is compiled: `npm run build`
- Check file paths are correct

### Detection returns `false` for known DRM games
- File might be packed differently
- Entropy threshold might need adjustment
- Check against signature database: `getSignatureDatabase()`

### Community stats not available
- Database file corrupted? Delete `~/.ycore/ycore-community-db.json`
- Initialize database: `await communityDbService.initialize()`

### Performance issues
- Reduce batch size (process fewer games at once)
- Community DB getting large? Export and archive old data
- Cache results between calls

---

## File Reference

| File | Purpose | Key Exports |
|------|---------|------------|
| `ml-stub-detector.ts` | DRM detection | `detectDrmStubs`, `analyzePeFile` |
| `anticheat-plugin.ts` | Anti-cheat detection | `detectAntiCheat` |
| `community-db.service.ts` | Community feedback | `communityDbService` |
| `drm-strategy-router.ts` | Strategy selection | `assessGameDRM` |
| `api-hook-remover.ts` | Experimental hooking | `attemptApiHooking` |
| `drm.service.ts` | Main service | `drmService` |

---

## Support

- **Full documentation**: See `PHASE3_README.md`
- **Implementation details**: See `PHASE3_IMPLEMENTATION_STATUS.md`
- **Tests**: See `tests/drm-phase3-integration.test.ts`
- **Issues**: Check inline code comments

---

**Last Updated**: 2025-07-31
