# Remaining Edge Case Fixes - Quick Reference Guide

**Status:** 30 of 51 fixes complete  
**Remaining:** 21 targeted fixes ready to apply

---

## Files Ready to Update

### 1. `electron/handlers/mods.handler.ts`
**Issues:** #5, #7, #51  
**Time Est:** 20 minutes

#### Issue #5, #7: Add Input Validation to IPC Handlers
Add at top of file:
```typescript
import {
  validateModSearchQuery,
  validateModId,
  validateGameAppId,
  validateSearchQuery,
  validateSearchLength,
  escapeLikeSpecialChars,
} from '../common/input-validation'
```

Update `handleSearchCatalog()`:
```typescript
async function handleSearchCatalog(
  _event: any,
  query: ModSearchQuery
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    // FIX #7: Validate query structure
    const validation = validateModSearchQuery(query)
    if (!validation.valid) {
      return { success: false, error: validation.error }
    }
    
    // FIX #5: Validate search text
    const queryValidation = validateSearchQuery(query.searchText)
    if (!queryValidation.valid) {
      return { success: false, error: queryValidation.error }
    }
    
    const lengthCheck = validateSearchLength(queryValidation.sanitized!)
    if (!lengthCheck.valid) {
      return { success: false, error: lengthCheck.error }
    }
    
    const result = await steamWorkshopService.searchMods({
      ...query,
      searchText: queryValidation.sanitized!
    })
    return { success: true, data: result }
  } catch (err: any) {
    logger.error(`Search catalog failed: ${err?.message}`, 'mods-ipc')
    return { success: false, error: err?.message || 'Search failed' }
  }
}
```

Update `handleSearchInstalled()`:
```typescript
async function handleSearchInstalled(
  _event: any,
  query: string,
  gameAppId?: string
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    // FIX #5: Validate search query
    const queryValidation = validateSearchQuery(query)
    if (!queryValidation.valid) {
      return { success: false, error: queryValidation.error }
    }
    
    const lengthCheck = validateSearchLength(queryValidation.sanitized!)
    if (!lengthCheck.valid) {
      return { success: false, error: lengthCheck.error }
    }
    
    // FIX #7: Validate gameAppId if provided
    if (gameAppId) {
      const appValidation = validateGameAppId(gameAppId)
      if (!appValidation.valid) {
        return { success: false, error: appValidation.error }
      }
    }
    
    const result = await modsDatabaseService.searchMods(
      queryValidation.sanitized!,
      gameAppId
    )
    return { success: true, data: result }
  } catch (err: any) {
    logger.error(`Search installed failed: ${err?.message}`, 'mods-ipc')
    return { success: false, error: err?.message || 'Search failed' }
  }
}
```

#### Issue #51: Dynamic IPC Timeout
Replace in relevant handlers:
```typescript
// FIX #51: Dynamic timeout based on operation type
const getTimeoutForOperation = (method: string): number => {
  switch (method) {
    case 'mods:install': return 3600000    // 1 hour for large downloads
    case 'mods:download': return 1800000   // 30 minutes
    case 'mods:search-installed': return 60000  // 1 minute
    case 'mods:search-catalog': return 60000    // 1 minute
    default: return 30000  // 30 seconds
  }
}
```

---

### 2. `src/components/mods/ModCard.tsx`
**Issues:** #16, #24, #34, #35, #36  
**Time Est:** 25 minutes

#### Issue #16: Debounce Install Button
```typescript
import { createDebounce } from '../../utils/debounce'

const ModCard: React.FC<ModCardProps> = ({ mod, onInstall, ... }) => {
  const [isInstalling, setIsInstalling] = useState(false)
  
  // FIX #16: Debounce install to prevent double-click
  const handleInstall = async () => {
    if (isInstalling) return // Guard against double-click
    
    setIsInstalling(true)
    try {
      await onInstall?.()
    } finally {
      setIsInstalling(false)
    }
  }
  
  return (
    <button 
      onClick={(e) => { e.stopPropagation(); handleInstall() }} 
      disabled={isInstalling || isLoading}
    >
      {isInstalling ? 'Descargando' : 'Instalar'}
    </button>
  )
}
```

#### Issue #34, #35, #36: Name & Size Formatting
```typescript
import { validateModName } from '../../common/input-validation'

// FIX #35, #36: Validate and format mod name
const displayName = useMemo(() => {
  if (!mod.name) return '(Unnamed Mod)'
  const truncated = mod.name.length > 100 
    ? mod.name.substring(0, 100) + '...'
    : mod.name
  return truncated
}, [mod.name])

// FIX #34: Handle large file sizes (TB support)
const formattedSize = useMemo(() => {
  if (!mod.file_size) return null
  const bytes = mod.file_size
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
  if (bytes < 1024 * 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)}GB`
  return `${(bytes / (1024 * 1024 * 1024 * 1024)).toFixed(2)}TB`
}, [mod.file_size])

return (
  <>
    <p className="text-sm font-bold text-text-bright line-clamp-2 mb-1">
      {displayName}
    </p>
    {formattedSize && <p className="text-xs text-gray-500">{formattedSize}</p>}
  </>
)
```

---

### 3. `src/components/mods/ModManagerPanel.tsx`
**Issues:** #17, #22  
**Time Est:** 20 minutes

#### Issue #17: Per-Mod Toggle Locking
```typescript
const [togglingMods, setTogglingMods] = useState<Set<string>>(new Set())

// FIX #17: Prevent rapid toggle spam per mod
const handleToggle = async (modId: string) => {
  if (togglingMods.has(modId)) return // Already toggling
  
  const newSet = new Set(togglingMods)
  newSet.add(modId)
  setTogglingMods(newSet)
  
  try {
    await onToggleMod?.(modId)
  } finally {
    newSet.delete(modId)
    setTogglingMods(newSet)
  }
}

const isTogglingThisMod = togglingMods.has(mod.mod_id)

return (
  <button 
    onClick={() => handleToggle(mod.mod_id)} 
    disabled={isTogglingThisMod}
  >
    {isTogglingThisMod ? <Loader2 /> : mod.enabled ? <Eye /> : <EyeOff />}
  </button>
)
```

#### Issue #22: Batch Enable/Disable with Locking
```typescript
const [batchOperationInProgress, setBatchOperationInProgress] = useState(false)

// FIX #22: Batch operations with locking
const handleEnableAll = async () => {
  if (batchOperationInProgress) return
  setBatchOperationInProgress(true)
  try {
    for (const mod of mods) {
      await onToggleMod?.(mod.mod_id)
    }
  } finally {
    setBatchOperationInProgress(false)
  }
}

const handleDisableAll = async () => {
  if (batchOperationInProgress) return
  setBatchOperationInProgress(true)
  try {
    for (const mod of mods) {
      if (mod.enabled) {
        await onToggleMod?.(mod.mod_id)
      }
    }
  } finally {
    setBatchOperationInProgress(false)
  }
}

return (
  <>
    <button onClick={handleEnableAll} disabled={batchOperationInProgress}>
      Enable All
    </button>
    <button onClick={handleDisableAll} disabled={batchOperationInProgress}>
      Disable All
    </button>
  </>
)
```

---

### 4. `src/components/mods/MyModsView.tsx`
**Issues:** #19, #20, #21  
**Time Est:** 30 minutes

#### Issue #19, #20: Drag-Drop & Empty State
```typescript
// FIX #19: Prevent duplicates in load order
const handleReorder = async (modIds: string[]) => {
  const uniqueModIds = [...new Set(modIds)]
  
  if (uniqueModIds.length !== modIds.length) {
    console.warn('Duplicate mods detected, removing duplicates')
  }
  
  // FIX #20: Handle zero mods
  if (uniqueModIds.length === 0) {
    return // No-op
  }
  
  await updateLoadOrder(appId, uniqueModIds)
}
```

#### Issue #21: Virtualization for 1000+ Mods
```typescript
import { FixedSizeList } from 'react-window'

// FIX #21: Use virtualization for large lists
const ModOrderList = ({ mods }: { mods: ModInfo[] }) => {
  if (!mods || mods.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8">
        <p className="text-gray-500">No mods to manage</p>
      </div>
    )
  }
  
  // Use virtualization for 100+ items
  if (mods.length > 100) {
    return (
      <FixedSizeList
        height={600}
        itemCount={mods.length}
        itemSize={60}
        width="100%"
      >
        {({ index, style }) => (
          <div style={style}>
            <ModOrderItem mod={mods[index]} onReorder={handleReorder} />
          </div>
        )}
      </FixedSizeList>
    )
  }
  
  // Regular rendering for small lists
  return (
    <div>
      {mods.map((mod) => (
        <ModOrderItem key={mod.id} mod={mod} onReorder={handleReorder} />
      ))}
    </div>
  )
}
```

**Install dependency:**
```bash
npm install react-window
npm install --save-dev @types/react-window
```

---

### 5. `electron/services/config.service.ts`
**Issues:** #27-31  
**Time Est:** 20 minutes

Add imports:
```typescript
import {
  parseConfigSafely,
  validateConfigShape,
  validateConfigTypes,
  validateNumericConfig,
  validateApiKeyFormat,
} from '../common/input-validation'
```

Update `loadConfig()`:
```typescript
loadConfig() {
  try {
    const content = fs.readFileSync(configPath, 'utf8')
    
    // FIX #27: Safe JSON parsing
    const result = parseConfigSafely(content)
    if (!result.success) {
      logger.error(result.error, 'config-service')
      return this.getDefaultConfig()
    }
    
    // FIX #28: Validate required fields
    const shapeValidation = validateConfigShape(result.data, [
      'gameAppId',
      'installPath'
    ])
    if (!shapeValidation.valid) {
      logger.error(shapeValidation.error, 'config-service')
      return this.getDefaultConfig()
    }
    
    // FIX #29: Validate field types
    const typeValidation = validateConfigTypes(result.data, {
      gameAppId: 'string',
      installPath: 'string',
      maxConcurrentDownloads: 'number',
      timeout: 'number',
    })
    if (!typeValidation.valid) {
      logger.error(typeValidation.error, 'config-service')
      return this.getDefaultConfig()
    }
    
    // FIX #30: Validate numeric ranges
    if (result.data.maxConcurrentDownloads) {
      const numValidation = validateNumericConfig(
        result.data.maxConcurrentDownloads,
        'maxConcurrentDownloads',
        1,
        128
      )
      if (!numValidation.valid) {
        logger.error(numValidation.error, 'config-service')
        result.data.maxConcurrentDownloads = 4  // Default
      }
    }
    
    return result.data
  } catch (err) {
    logger.error(`Failed to load config: ${err}`, 'config-service')
    return this.getDefaultConfig()
  }
}

validateEnv() {
  // FIX #31: Validate API key format
  const apiKeyValidation = validateApiKeyFormat(process.env.API_KEY)
  if (!apiKeyValidation.valid) {
    logger.error(apiKeyValidation.error, 'config-service')
    process.exit(1)
  }
}
```

---

### 6. `electron/services/mods-database.service.ts` (Additional Fixes)
**Issues:** #48, #49, #50  
**Time Est:** 25 minutes

#### Issue #49: Database Busy Timeout Retry Logic
Find `initialize()` and update:
```typescript
// Increase timeout from 5s to 30s
this.db!.configure('busyTimeout', 30000)
```

Add retry wrapper:
```typescript
private async executeWithRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3
): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn()
    } catch (err: any) {
      if (err.code === 'SQLITE_BUSY' && i < maxRetries - 1) {
        // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, 100 * Math.pow(2, i)))
        continue
      }
      throw err
    }
  }
  throw new Error('Max retries exceeded')
}
```

Use in critical operations:
```typescript
async addInstalledMod(mod: ModInfo): Promise<void> {
  return this.executeWithRetry(async () => {
    // ... add mod logic ...
  })
}
```

#### Issue #50: Filter Validation
```typescript
// FIX #50: Validate filter objects
private validateFilters(filters: any): boolean {
  if (!filters || typeof filters !== 'object') return false
  
  // Check each optional filter field
  const validFields = ['enabled', 'status', 'source', 'search']
  const fieldTypes: Record<string, string> = {
    enabled: 'boolean',
    status: 'string',
    source: 'string',
    search: 'string'
  }
  
  for (const [field, type] of Object.entries(fieldTypes)) {
    if (field in filters && typeof filters[field] !== type) {
      return false
    }
  }
  
  return true
}

async queryMods(gameAppId: string, filters?: any) {
  if (filters && !this.validateFilters(filters)) {
    throw new Error('Invalid query filters')
  }
  // Continue with query
}
```

#### Issue #48: Cache Size Validation
Find cache initialization:
```typescript
// Update LRUCache sizeCalculation
const cache = new LRUCache<string, any>({
  max: 500,
  maxSize: 100 * 1024 * 1024,  // 100MB total cache
  sizeCalculation: (item) => {
    const baseSize = JSON.stringify(item).length
    const MAX_ITEM_SIZE = 10 * 1024 * 1024  // 10MB per item max
    
    if (baseSize > MAX_ITEM_SIZE) {
      logger.warn(`Cache item exceeds max size: ${baseSize} bytes`, 'mods-db')
      return MAX_ITEM_SIZE  // Cap at max
    }
    
    return baseSize
  }
})
```

---

### 7. `electron/services/steam-workshop.service.ts`
**Issue:** #48  
**Time Est:** 10 minutes

Update cache initialization to include size limits (same as config.service approach above).

---

### 8. `electron/modules/mod-manager/mod-installer.ts` (Additional Fixes)
**Issues:** #26 (App close cleanup)  
**Time Est:** 15 minutes

Add at end of file:
```typescript
// FIX #26: Register cleanup on app close
import { app } from 'electron'

export function registerModInstallerCleanup(): void {
  app.on('before-quit', async () => {
    logger.info('App closing, cleaning up installations', 'mod-installer')
    await modInstaller.cancelAll()
  })
}

// In ModInstaller class, add:
async cancelAll(): Promise<void> {
  for (const [installId, progress] of this.installInProgress.entries()) {
    try {
      progress.status = 'cancelled'
      this.reportProgress(installId, progress)
      
      const tempZipPath = path.join(TEMP_DIR, `${installId}.zip`)
      const cleanupResult = safeRemoveFile(tempZipPath)
      
      if (!cleanupResult.success) {
        logger.warn(`Failed to cleanup ${installId}: ${cleanupResult.error}`, 'mod-installer')
      }
    } catch (err) {
      logger.error(`Cleanup failed: ${err}`, 'mod-installer')
    }
  }
  
  this.installInProgress.clear()
  this.progressCallbacks.clear()
}
```

Call in main process initialization:
```typescript
// In electron/main.ts or app initialization
import { registerModInstallerCleanup } from './modules/mod-manager/mod-installer'

app.on('ready', () => {
  registerModInstallerCleanup()
  // ... rest of initialization
})
```

---

## Quick Application Order (Fastest to Complete)

1. **mods.handler.ts** - 20 min (validation only)
2. **config.service.ts** - 20 min (validation + safe parsing)
3. **ModCard.tsx** - 25 min (debounce + formatting)
4. **ModManagerPanel.tsx** - 20 min (toggle locking)
5. **mods-database.service.ts** - 25 min (retry logic + validation)
6. **MyModsView.tsx** - 30 min (dedup + virtualization)
7. **mod-installer.ts** - 15 min (cleanup)

**Total Time:** ~2.5 hours for all remaining fixes

---

## Testing Each Fix

### After each file update, test:

**mods.handler.ts**
- [ ] Search with empty string → Should return empty results
- [ ] Search with 10K+ chars → Should error gracefully
- [ ] Search with special chars → Should escape properly

**config.service.ts**
- [ ] Config with invalid JSON → Should use default config
- [ ] Config with missing fields → Should error or use defaults
- [ ] Config with negative maxConcurrentDownloads → Should default to 4

**ModCard.tsx**
- [ ] Rapid double-click install → Should only trigger once
- [ ] Mod name > 100 chars → Should truncate with "..."
- [ ] 100GB+ mod file → Should format as TB

**ModManagerPanel.tsx**
- [ ] Rapid toggle same mod 10x → Should only toggle once
- [ ] Enable all + disable all rapidly → Should complete without errors

**MyModsView.tsx**
- [ ] Drag same mod twice → Should remove duplicate
- [ ] Load order with 0 mods → Should handle gracefully
- [ ] Load order with 5000 mods → Should virtualize (smooth scrolling)

**mods-database.service.ts**
- [ ] Corrupted JSON in database → Should not crash
- [ ] High concurrency database access → Should retry
- [ ] Invalid filter object → Should error gracefully

**mod-installer.ts**
- [ ] Close app during download → Temp files should be cleaned up

---

## Verification Commands

```bash
# After applying fixes, run:
npm run lint          # Check for TypeScript errors
npm run type-check   # Verify type safety
npm test             # Run test suite
npm run build        # Build project

# Test specific edge cases:
# Add to test suite:
# - Search with 10K+ chars
# - Install + uninstall rapidly
# - Toggle same mod 10 times
# - Drag-drop duplicates
# - etc.
```

---

## Summary

✅ **30/51 fixes complete (utility files + core hooks)**  
🔄 **21/51 fixes ready to apply** (code patterns documented)  
⏱️ **~2.5 hours** to complete all remaining fixes  
✨ **100% coverage** achievable with focused effort

