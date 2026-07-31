# Y-Core Mod Manager: User Input & Edge Case Error Analysis

**Generated:** 2025-07-29  
**Scope:** Complete input validation audit across UI, IPC handlers, database, and file operations  
**Priority:** Critical - Affects stability, security, and user experience

---

## Table of Contents

1. [Search & Query Edge Cases](#search--query-edge-cases)
2. [File Path & I/O Edge Cases](#file-path--io-edge-cases)
3. [UI Interaction Edge Cases](#ui-interaction-edge-cases)
4. [Configuration & Data Validation](#configuration--data-validation)
5. [Mod Management Edge Cases](#mod-management-edge-cases)
6. [Backup & Recovery Edge Cases](#backup--recovery-edge-cases)
7. [Database Operation Edge Cases](#database-operation-edge-cases)
8. [Performance & Resource Edge Cases](#performance--resource-edge-cases)

---

## Search & Query Edge Cases

### 1. Empty Search String
**File:** `src/hooks/useModManager.ts:406-429`  
**Issue:** No validation on `query` parameter before sending to IPC  
**Scenario:** User searches with empty string ""
```typescript
// Current: Accepts empty string
searchMods(appId: string, query: string)
```
**Error:** Returns all results or undefined behavior  
**Impact:** UI confusion, unexpected large dataset returned  
**Fix Recommendation:**
```typescript
// Add validation
if (!query || query.trim().length === 0) {
  throw new Error('Search query cannot be empty')
}
// OR return early with empty results
if (!query?.trim()) return []
```
**Test Case:** `searchMods("app123", "")`  
**Expected Behavior:** Either throw error or return empty array consistently

---

### 2. Extremely Long Search String (10,000+ characters)
**File:** `electron/handlers/mods.handler.ts:520-537`  
**Issue:** No max length validation on search query  
**Scenario:** User pastes 100,000 character string as search  
```typescript
handleSearchInstalled(_event: any, query: string, gameAppId?: string)
// No validation on query.length
```
**Error:** SQL query becomes too large, database performance degradation  
**Impact:** App hangs, high memory usage, slow response  
**Fix Recommendation:**
```typescript
const MAX_SEARCH_LENGTH = 500
if (query.length > MAX_SEARCH_LENGTH) {
  throw new Error(`Search query exceeds ${MAX_SEARCH_LENGTH} characters`)
}
```
**Test Case:** `searchMods("app123", "a".repeat(10000))`  
**Expected Behavior:** Reject with clear error message

---

### 3. Regex Special Characters in Search
**File:** `electron/services/mods-database.service.ts:305-326`  
**Issue:** Search uses LIKE with `%` wildcards but no escaping  
**Scenario:** User searches for `[test*]` or `%.exe`  
```typescript
async searchMods(query: string, gameAppId?: string): Promise<ModInfo[]> {
  let sql = 'SELECT * FROM installed_mods WHERE (title LIKE ? OR ...)'
  const params = [`%${query}%`, ...]
  // query is unescaped - could accidentally match unintended strings
}
```
**Error:** Unexpected SQL pattern matching, LIKE injection  
**Impact:** Wrong results returned, potential SQL injection  
**Fix Recommendation:**
```typescript
// Escape special LIKE characters
const escapeLike = (str: string) => str.replace(/[%_]/g, '\\$&')
const escapedQuery = escapeLike(query)
const params = [`%${escapedQuery}%`, ...]
```
**Test Case:** `searchMods("app123", "test%.exe")`  
**Expected Behavior:** Literal string match for "test%.exe"

---

### 4. Non-ASCII Characters in Search (Chinese, Arabic, Emoji)
**File:** `src/hooks/useModManager.ts:406-429`  
**Issue:** No charset/encoding validation  
**Scenario:** User searches: `搜索模组`, `البحث`, or `🔍test`  
```typescript
// Current: No encoding validation
const result = await callService<...>(
  'search',
  appId,
  query,  // Could be UTF-8, UTF-16, or mixed encoding
  options
)
```
**Error:** Database encoding mismatch, corrupted results  
**Impact:** Search fails for non-ASCII content  
**Fix Recommendation:**
```typescript
// Validate UTF-8 encoding
if (!isValidUTF8(query)) {
  throw new Error('Search query must be valid UTF-8')
}
```
**Test Case:** Multiple encoding scenarios  
- `searchMods("app123", "搜索模组")` - Chinese characters
- `searchMods("app123", "🔍test")` - Emoji mixed with ASCII

---

### 5. Null or Undefined Query Parameter
**File:** `electron/handlers/mods.handler.ts:520-537`  
**Issue:** No type checking on query parameter  
**Scenario:** IPC caller passes `null` or `undefined`  
```typescript
async function handleSearchInstalled(_event: any, query: string) {
  // query could be null/undefined at runtime despite TypeScript
  const results = await modsDatabaseService.searchMods(query, gameAppId)
}
```
**Error:** TypeError when calling `query.length` or `.trim()`  
**Impact:** IPC call fails, promise rejected, UI error  
**Fix Recommendation:**
```typescript
if (query === null || query === undefined || typeof query !== 'string') {
  throw new Error('Query must be a non-empty string')
}
```
**Test Case:** `handleSearchInstalled(event, null)`

---

### 6. Query with Only Whitespace
**File:** `src/hooks/useModManager.ts:406-429`  
**Issue:** Accepts whitespace-only strings  
**Scenario:** User enters "     " (spaces only)  
```typescript
// Current: Does not trim before validation
searchMods(appId, "     ")
```
**Error:** Database searches for string "     ", incorrect results  
**Impact:** Misleading results, silent failure  
**Fix Recommendation:**
```typescript
const trimmedQuery = query.trim()
if (!trimmedQuery) {
  return []
}
```
**Test Case:** `searchMods("app123", "   \t\n  ")`

---

### 7. Query Parameter Type Mismatch
**File:** `electron/handlers/mods.handler.ts:60-77`  
**Issue:** Query object structure not validated  
**Scenario:** Caller passes `ModSearchQuery` missing required fields  
```typescript
async function handleSearchCatalog(_event: any, query: ModSearchQuery) {
  // query structure not validated - could be missing fields
  const result = await steamWorkshopService.searchMods(query)
}
```
**Error:** Undefined reference, cannot access property of undefined  
**Impact:** IPC crashes  
**Fix Recommendation:**
```typescript
if (!query || typeof query !== 'object') {
  return { success: false, error: 'Invalid query object' }
}
// Validate required fields
const requiredFields = ['gameAppId', 'searchText']
for (const field of requiredFields) {
  if (!(field in query)) {
    throw new Error(`Missing required field: ${field}`)
  }
}
```
**Test Case:** `handleSearchCatalog(event, {})`  
**Test Case:** `handleSearchCatalog(event, { searchText: 'mod' })`

---

## File Path & I/O Edge Cases

### 8. Path with Spaces in Directories
**File:** `electron/modules/mod-manager/mod-installer.ts:49-224`  
**Issue:** Path handling assumes valid OS paths but doesn't handle all edge cases  
**Scenario:** Install directory: `C:\Program Files (x86)\My Mods\Test Mod`  
```typescript
const extractPath = path.join(options.installDir, options.modId)
// Path with spaces should work but verify edge cases
```
**Error:** Potential issues if paths are unquoted in shell commands  
**Impact:** Installation could fail or install to wrong location  
**Fix Recommendation:**
```typescript
// Ensure path is properly normalized
const normalizedPath = path.normalize(installPath)
if (!fs.existsSync(normalizedPath)) {
  throw new Error(`Path does not exist: ${normalizedPath}`)
}
```
**Test Case:** Install to `C:\Program Files\Y-Core\Test Mod With Spaces`

---

### 9. Path with Unicode Characters (日本語, 한국어)
**File:** `electron/modules/mod-manager/mod-installer.ts:323-394`  
**Issue:** Path normalization might not handle all Unicode  
**Scenario:** Install path contains: `/mods/日本語/テスト`  
```typescript
const normalizedPath = path.normalize(installPath)
// Unicode normalization (NFC vs NFD) could cause issues
```
**Error:** Path comparison fails, file not found  
**Impact:** Backup/restore fails, mod installation fails  
**Fix Recommendation:**
```typescript
const normalizedPath = path.normalize(installPath)
  .normalize('NFC') // Canonical form
if (!fs.existsSync(normalizedPath)) {
  throw new Error(`Path not found: ${normalizedPath}`)
}
```
**Test Case:** Path with Japanese: `/mods/日本語_モッド`  
**Test Case:** Path with Korean: `/mods/한국어_모드`

---

### 10. Extremely Long File Paths (>500 chars)
**File:** `electron/modules/mod-manager/mod-installer.ts:445-454`  
**Issue:** No path length validation  
**Scenario:** Nested deeply: `C:\...\a\b\c\d\e\f\...[500+ chars total]`  
```typescript
const extractPath = path.join(options.installDir, options.modId)
// Windows MAX_PATH is 260 chars, but with UNC paths can be longer
```
**Error:** Windows path length error (260 char limit), cannot extract  
**Impact:** Installation fails silently  
**Fix Recommendation:**
```typescript
const MAX_PATH = 260
if (extractPath.length > MAX_PATH) {
  throw new Error(`Installation path exceeds Windows max path length (${MAX_PATH} chars)`)
}
```
**Test Case:** Very deep directory structure

---

### 11. Path Traversal Attack (../ in modId)
**File:** `electron/modules/mod-manager/mod-installer.ts:323-347`  
**Issue:** ModId validation is present but could be bypassable  
**Scenario:** ModId = `"../../../system32/evil"` or `"..\\..\\windows"`  
```typescript
// FIX #14: Validate modId format
if (!modId || !/^[a-zA-Z0-9_-]{1,100}$/.test(modId)) {
  throw new Error('Invalid modId format')
}
// Good - but verify it's enforced everywhere
```
**Error:** Could write files outside intended backup directory  
**Impact:** Critical security vulnerability  
**Fix Recommendation:**
```typescript
// Whitelist approach is already implemented, verify in:
// 1. installMod() - modId parameter
// 2. createBackup() - modId and gameAppId parameters
// 3. uninstallMod() - modId parameter
const isValidModId = (modId: string): boolean => {
  return /^[a-zA-Z0-9_-]{1,100}$/.test(modId)
}

if (!isValidModId(modId)) {
  throw new Error(`Invalid mod ID: ${modId}`)
}
```
**Test Case:** `installMod("../evil", "app123")`  
**Test Case:** `installMod("../../system32", "app123")`

---

### 12. Symlinks and Circular Symlinks
**File:** `electron/modules/mod-manager/mod-installer.ts:480-497`  
**Issue:** No symlink detection or loop prevention  
**Scenario:** Mod directory contains symlink pointing to itself or parent  
```typescript
private getAllFiles(dirPath: string): string[] {
  const files: string[] = []
  const walk = (dir: string) => {
    const entries = fs.readdirSync(dir)  // No symlink handling
    for (const entry of entries) {
      const fullPath = path.join(dir, entry)
      const stat = fs.statSync(fullPath)  // Follows symlinks!
      if (stat.isDirectory()) {
        walk(fullPath)  // Could infinitely loop
      } else {
        files.push(fullPath)
      }
    }
  }
  walk(dirPath)
  return files
}
```
**Error:** Infinite loop, stack overflow, maximum recursion depth exceeded  
**Impact:** App crashes, backup fails, freeze  
**Fix Recommendation:**
```typescript
private getAllFiles(dirPath: string, maxDepth = 50, visited = new Set<string>()): string[] {
  const files: string[] = []
  
  if (maxDepth <= 0) {
    logger.warn(`Max directory depth reached at: ${dirPath}`)
    return files
  }
  
  const realPath = fs.realpathSync(dirPath)
  if (visited.has(realPath)) {
    logger.warn(`Circular symlink detected: ${dirPath}`)
    return files
  }
  visited.add(realPath)
  
  const walk = (dir: string, depth: number) => {
    if (depth <= 0) return
    
    const entries = fs.readdirSync(dir)
    for (const entry of entries) {
      const fullPath = path.join(dir, entry)
      try {
        const stat = fs.lstatSync(fullPath)  // Don't follow symlinks
        if (stat.isSymbolicLink()) {
          logger.debug(`Skipping symlink: ${fullPath}`)
          continue
        }
        if (stat.isDirectory()) {
          walk(fullPath, depth - 1)
        } else {
          files.push(fullPath)
        }
      } catch (err) {
        logger.warn(`Error accessing ${fullPath}: ${err}`)
      }
    }
  }
  
  walk(realPath, maxDepth)
  return files
}
```
**Test Case:** Create circular symlink: `ln -s . /mods/test/link`

---

### 13. File Permission Denied on Backup Path
**File:** `electron/modules/mod-manager/mod-installer.ts:323-394`  
**Issue:** Checks if path exists but not if it's writable  
**Scenario:** User doesn't have write permission to backup location  
```typescript
const backupDir = path.join(BACKUP_BASE_PATH, gameAppId, modId)
if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir, { recursive: true })  // Could fail if parent not writable
}
```
**Error:** EACCES: permission denied  
**Impact:** Backup creation fails, mod cannot be installed  
**Fix Recommendation:**
```typescript
// Test write permission before creating backup
const testWritePermission = (dirPath: string): boolean => {
  try {
    const testFile = path.join(dirPath, '.ycore-write-test')
    fs.writeFileSync(testFile, 'test')
    fs.unlinkSync(testFile)
    return true
  } catch (err) {
    return false
  }
}

if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir, { recursive: true })
}
if (!testWritePermission(backupDir)) {
  throw new Error('No write permission to backup directory')
}
```
**Test Case:** Set backup dir to read-only, attempt backup

---

### 14. Non-Existent Parent Directory Path
**File:** `electron/modules/mod-manager/mod-installer.ts:120-121`  
**Issue:** `installDir` assumed to exist  
**Scenario:** Install directory path provided but doesn't exist: `/games/NotCreated/Mod`  
```typescript
const extractPath = path.join(options.installDir, options.modId)
await this.extractModFiles(downloadPath, extractPath)
// extractPath parent might not exist
```
**Error:** ENOENT: no such file or directory  
**Impact:** Mod installation fails  
**Fix Recommendation:**
```typescript
if (!fs.existsSync(options.installDir)) {
  try {
    fs.mkdirSync(options.installDir, { recursive: true })
  } catch (err) {
    throw new Error(`Failed to create install directory: ${err.message}`)
  }
}
```
**Test Case:** Install to non-existent path

---

### 15. Disk Space Insufficient During Extraction
**File:** `electron/modules/mod-manager/mod-installer.ts:115-121`  
**Issue:** No disk space check before extraction  
**Scenario:** Free disk space < mod file size  
```typescript
const extractPath = path.join(options.installDir, options.modId)
await this.extractModFiles(downloadPath, extractPath)
// Could fail mid-extraction if disk full
```
**Error:** ENOSPC: no space left on device  
**Impact:** Partial extraction, corrupted mod installation  
**Fix Recommendation:**
```typescript
import diskSpace from 'diskusage'

// Check before extraction
const diskUsage = await diskSpace.check(options.installDir)
if (diskUsage.available < progress.totalBytes) {
  throw new Error(
    `Insufficient disk space. Required: ${progress.totalBytes}, Available: ${diskUsage.available}`
  )
}
```
**Test Case:** Fill disk to capacity, attempt mod installation

---

## UI Interaction Edge Cases

### 16. Double-Click Install Button
**File:** `src/components/mods/ModCard.tsx:341-360`  
**Issue:** No debounce on install button, no race condition handling  
**Scenario:** User double-clicks install button rapidly  
```tsx
<button onClick={(e) => { e.stopPropagation(); onInstall?.() }} disabled={isLoading}>
  {isLoading ? 'Descargando' : 'Instalar'}
</button>
// isLoading might not be set immediately
```
**Error:** Two install IPC calls sent before `isLoading` becomes true  
**Impact:** Mod installed twice or conflicting operations  
**Fix Recommendation:**
```tsx
const [isInstalling, setIsInstalling] = useState(false)

const handleInstall = async () => {
  if (isInstalling) return // Guard against double-click
  
  setIsInstalling(true)
  try {
    await onInstall?.()
  } finally {
    setIsInstalling(false)
  }
}

<button onClick={(e) => { e.stopPropagation(); handleInstall() }} disabled={isInstalling || isLoading}>
```
**Test Case:** Rapidly double-click install button on ModCard

---

### 17. Rapid Enable/Disable Toggle Spam
**File:** `src/components/mods/ModManagerPanel.tsx:181-198`  
**Issue:** No debounce on toggle button  
**Scenario:** User clicks enable/disable 10 times rapidly  
```tsx
<button onClick={() => onToggleMod?.(mod.mod_id)} disabled={loading}>
  {loading ? <Loader2 /> : mod.enabled ? <Eye /> : <EyeOff />}
</button>
// No per-mod loading state, shared loading state
```
**Error:** Multiple toggle requests queued, inconsistent state  
**Impact:** Mod ends up in wrong state, UI doesn't match backend  
**Fix Recommendation:**
```tsx
const [togglingMods, setTogglingMods] = useState<Set<string>>(new Set())

const handleToggle = async (modId: string) => {
  if (togglingMods.has(modId)) return
  
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
<button onClick={() => handleToggle(mod.mod_id)} disabled={isTogglingThisMod}>
```
**Test Case:** Rapidly click enable/disable on single mod 10 times

---

### 18. Click Install, Immediately Click Uninstall
**File:** `src/hooks/useModManager.ts:256-286` and `289-319`  
**Issue:** No operation locking, race condition between install and uninstall  
**Scenario:** User clicks install, then immediately clicks uninstall before install completes  
```typescript
const installMod = useCallback(async (modId, appId) => {
  // No lock on modId
  clearCache(`installed-mods-${appId}`)
  const result = await callService('install', modId, appId)
  // ...
})

const uninstallMod = useCallback(async (modId, appId) => {
  // Could execute while install in progress
  clearCache(`installed-mods-${appId}`)
  const result = await callService('uninstall', modId, appId)
})
```
**Error:** Both operations execute simultaneously, corrupted state  
**Impact:** Mod in unknown state, file system corruption  
**Fix Recommendation:**
```typescript
const operationLocks = useRef<Map<string, Promise<void>>>(new Map())

const aquireOperationLock = async (modId: string) => {
  const existing = operationLocks.current.get(modId)
  if (existing) {
    await existing
  }
}

const installMod = useCallback(async (modId, appId) => {
  await aquireOperationLock(modId)
  
  const lockPromise = (async () => {
    try {
      // ... install logic
    } finally {
      operationLocks.current.delete(modId)
    }
  })()
  
  operationLocks.current.set(modId, lockPromise)
  await lockPromise
})
```
**Test Case:** Click install, wait 100ms, click uninstall

---

### 19. Drag-Drop Same Mod Twice in Load Order
**File:** `src/components/mods/MyModsView.tsx` (assumed component)  
**Issue:** No duplicate checking in load order update  
**Scenario:** User drags mod to position, accidentally drags same mod again  
```typescript
// Assumed drag-drop handler
const handleReorder = async (modIds: string[]) => {
  await updateLoadOrder(appId, modIds)
  // No check for duplicates
}
```
**Error:** Same mod appears twice in load order  
**Impact:** Game load fails, mod disabled  
**Fix Recommendation:**
```typescript
const handleReorder = async (modIds: string[]) => {
  // Remove duplicates, keep first occurrence
  const uniqueModIds = [...new Set(modIds)]
  
  if (uniqueModIds.length !== modIds.length) {
    logger.warn('Duplicate mods detected in load order')
  }
  
  await updateLoadOrder(appId, uniqueModIds)
}
```
**Test Case:** Drag mod to position 1, then drag same mod to position 2

---

### 20. Load Order with 0 Mods
**File:** `src/components/mods/ModManagerPanel.tsx:152-160`  
**Issue:** Progress bar shows 0% but doesn't handle zero mods gracefully  
**Scenario:** Game with no mods installed  
```tsx
{stats.total > 0 && (
  <div className="w-full bg-surface-1 rounded-full h-2 overflow-hidden">
    <div style={{ width: `${(stats.enabled / stats.total) * 100}%` }} />
  </div>
)}
```
**Error:** No visual issue but load order operations might fail  
**Impact:** Attempting operations on empty mod list  
**Fix Recommendation:**
```tsx
const handleReorder = async (modIds: string[]) => {
  if (modIds.length === 0) {
    // No-op or reset
    return
  }
  await updateLoadOrder(appId, modIds)
}
```
**Test Case:** Apply load order update with empty modIds array

---

### 21. Load Order with 1000+ Mods
**File:** `src/components/mods/MyModsView.tsx`  
**Issue:** No pagination or virtualization, UI might freeze  
**Scenario:** User has 5000 mods installed  
```typescript
// Could render all 5000 mods in a list without virtualization
mods.map((mod) => <ModOrderItem key={mod.id} mod={mod} />)
```
**Error:** Massive DOM tree, main thread freezes  
**Impact:** App becomes unresponsive, 5-10 second freeze  
**Fix Recommendation:**
```typescript
// Use virtualized list (react-window)
import { FixedSizeList } from 'react-window'

const ModOrderList = ({ mods }) => {
  return (
    <FixedSizeList
      height={600}
      itemCount={mods.length}
      itemSize={60}
      width="100%"
    >
      {({ index, style }) => (
        <div style={style}>
          <ModOrderItem mod={mods[index]} />
        </div>
      )}
    </FixedSizeList>
  )
}
```
**Test Case:** Create game with 5000 mods, load UI

---

### 22. Enable All, Disable All Rapidly
**File:** `src/components/mods/ModManagerPanel.tsx:89-110`  
**Issue:** No atomic operation for batch enable/disable  
**Scenario:** User clicks "Enable All" then immediately "Disable All"  
```typescript
// No batch operation API
for (const mod of mods) {
  await onToggleMod?.(mod.mod_id)  // Sequential, slow
}
```
**Error:** Race condition, inconsistent state  
**Impact:** Mods in mixed enabled/disabled state  
**Fix Recommendation:**
```typescript
// Add batch operation endpoint
const enableAllMods = useCallback(async (appId: string) => {
  try {
    const result = await callService<{ success: boolean }>(
      'batchEnable',
      appId
    )
    if (!result.success) throw new Error('Batch enable failed')
  } catch (err) {
    setError(String(err))
  }
})

// Or use locks
const [batchOperationInProgress, setBatchOperationInProgress] = useState(false)

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
```
**Test Case:** Click "Enable All", immediately click "Disable All"

---

### 23. Scroll During Download
**File:** `src/components/mods/ModsGrid.tsx` (assumed)  
**Issue:** Progress updates during scroll could cause jank  
**Scenario:** User scrolls through mods while another downloads  
```typescript
// Progress callback updates component state
useIpcEvent('mod:progress', (data: ModProgress) => {
  setProgressUpdates((prev) => {
    // This triggers re-render on every progress update
    const next = new Map(prev)
    next.set(data.mod_id, data)
    return next
  })
})
```
**Error:** 60 progress events/sec × re-renders = main thread blocked  
**Impact:** Janky scrolling, frozen UI  
**Fix Recommendation:**
```typescript
// Already partially fixed in useModManager.ts:
// FIX #6: Debounce progress updates to avoid excessive re-renders
const lastProgressUpdateRef = useRef<number>(0)

useIpcEvent('mod:progress', (data: ModProgress) => {
  const now = Date.now()
  
  // Only update if 16ms+ has passed since last update (60fps max)
  if (now - lastProgressUpdateRef.current >= 16) {
    setProgressUpdates((prev) => {
      const next = new Map(prev)
      next.set(data.mod_id, data)
      return next
    })
    lastProgressUpdateRef.current = now
  }
})
```
**Test Case:** Scroll through grid while mod downloads

---

### 24. Resize Window During Operation
**File:** `src/components/mods/ModCard.tsx:200-410`  
**Issue:** Component doesn't handle resize gracefully during animation  
**Scenario:** User resizes window while install animation playing  
```tsx
style={{
  transform: hovered ? 'translateY(-2px) scale(1.01)' : 'translateY(0) scale(1)',
  transition: 'all duration-300 ease-out'  // Long transition
}}
```
**Error:** Animation interrupted, visual glitch  
**Impact:** Jank, visual inconsistency  
**Fix Recommendation:**
```tsx
useEffect(() => {
  const handleResize = () => {
    // Cancel in-flight animations
    setHovered(false)
  }
  
  window.addEventListener('resize', handleResize)
  return () => window.removeEventListener('resize', handleResize)
}, [])
```
**Test Case:** Drag window edge while mod installing

---

### 25. Switch Game While Mod Installing
**File:** `src/hooks/useModManager.ts:644-647`  
**Issue:** Changing game doesn't cancel in-flight operations  
**Scenario:** User starts installing mod for Game A, switches to Game B  
```typescript
const selectGame = useCallback(async (appId: string): Promise<void> => {
  setSelectedGameId(appId)
  await fetchInstalledMods(appId)
  // Doesn't cancel in-flight operations for previous game
}, [fetchInstalledMods])
```
**Error:** Install completes for Game A but UI shows Game B  
**Impact:** Mod appears in wrong game  
**Fix Recommendation:**
```typescript
const abortControllerRef = useRef<AbortController | null>(null)

const selectGame = useCallback(async (appId: string): Promise<void> => {
  // Cancel previous operations
  if (abortControllerRef.current) {
    abortControllerRef.current.abort()
  }
  
  abortControllerRef.current = new AbortController()
  
  setSelectedGameId(appId)
  try {
    await fetchInstalledMods(appId)
  } catch (err) {
    if (!(err instanceof Error) || err.message !== 'Aborted') {
      throw err
    }
  }
}, [fetchInstalledMods])
```
**Test Case:** Start installing, switch games during install

---

### 26. Close App While Operation In Progress
**File:** `electron/modules/mod-manager/mod-installer.ts:38-224`  
**Issue:** No cleanup on app close  
**Scenario:** User closes app during mod download/extraction  
```typescript
const installMod = async (...) => {
  // No app-close detection
  const downloadPath = path.join(TEMP_DIR, `${installId}.zip`)
  await this.downloadModFile(...)  // Could be interrupted
  await this.extractModFiles(...)  // Could be interrupted
}
```
**Error:** Incomplete download left in temp directory, corrupted state  
**Impact:** Orphaned temp files, disk space wasted, corrupted mods  
**Fix Recommendation:**
```typescript
// Listen for app close event
app.on('before-quit', () => {
  // Cleanup in-progress installations
  modInstaller.cancelAll()
})

async cancelAll(): Promise<void> {
  for (const [installId, progress] of this.installInProgress.entries()) {
    try {
      const tempZipPath = path.join(TEMP_DIR, `${installId}.zip`)
      await this.cleanup(tempZipPath)
    } catch (err) {
      logger.error(`Failed to cleanup ${installId}: ${err}`)
    }
  }
}
```
**Test Case:** Start installing large mod, close app immediately

---

## Configuration & Data Validation

### 27. Config File with Invalid JSON
**File:** `electron/services/config.service.ts` (inferred)  
**Issue:** Potential JSON.parse without try-catch  
**Scenario:** Config file corrupted: `{invalid json`,  
```typescript
// Possible code
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
// Could throw SyntaxError
```
**Error:** Uncaught SyntaxError, app crash  
**Impact:** App fails to start  
**Fix Recommendation:**
```typescript
try {
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
} catch (err) {
  logger.error(`Invalid config JSON: ${err.message}`)
  // Use default config or prompt user
  const defaultConfig = getDefaultConfig()
  fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2))
}
```
**Test Case:** Create invalid JSON in config, restart app

---

### 28. Config with Missing Required Fields
**File:** `electron/services/config.service.ts`  
**Issue:** No validation of required config fields  
**Scenario:** Config missing `gameAppId` or `installPath`  
```typescript
interface ModConfig {
  gameAppId: string
  installPath: string
  backupPath?: string
  maxConcurrentDownloads?: number
}

// Possible code
const config = JSON.parse(fs.readFileSync(configPath))
// config might be missing required fields
```
**Error:** TypeError when accessing undefined properties  
**Impact:** Runtime errors  
**Fix Recommendation:**
```typescript
interface ModConfig {
  gameAppId: string
  installPath: string
  backupPath?: string
  maxConcurrentDownloads?: number
}

const validateConfig = (config: any): config is ModConfig => {
  const required = ['gameAppId', 'installPath']
  return required.every(field => field in config && config[field])
}

if (!validateConfig(config)) {
  throw new Error('Config missing required fields')
}
```
**Test Case:** Remove `installPath` from config, restart app

---

### 29. Config with Null Values Where Not Allowed
**File:** `electron/services/config.service.ts`  
**Issue:** No type checking on config values  
**Scenario:** Config: `{ gameAppId: null, installPath: null }`  
```typescript
const config = JSON.parse(configContent)
// Doesn't validate that values are correct type
```
**Error:** Cannot use null as string  
**Impact:** Runtime errors  
**Fix Recommendation:**
```typescript
const validateConfig = (config: any): boolean => {
  if (typeof config.gameAppId !== 'string' || !config.gameAppId) {
    throw new Error('gameAppId must be non-empty string')
  }
  if (typeof config.installPath !== 'string' || !config.installPath) {
    throw new Error('installPath must be non-empty string')
  }
  return true
}
```
**Test Case:** Set `gameAppId: null` in config

---

### 30. Invalid Config Values (0 or Negative Numbers)
**File:** `electron/services/config.service.ts`  
**Issue:** No range validation on numeric configs  
**Scenario:** `maxConcurrentDownloads: 0` or `timeout: -5000`  
```typescript
interface ModConfig {
  maxConcurrentDownloads?: number  // Could be 0 or negative
  timeout?: number  // Could be 0 or negative
  maxModSize?: number  // Could be 0 or negative
}
```
**Error:** Division by zero, negative timeouts cause infinite waits  
**Impact:** Downloads don't start, timeouts never fire  
**Fix Recommendation:**
```typescript
const validateConfig = (config: ModConfig): boolean => {
  if (config.maxConcurrentDownloads !== undefined) {
    if (config.maxConcurrentDownloads <= 0 || !Number.isInteger(config.maxConcurrentDownloads)) {
      throw new Error('maxConcurrentDownloads must be positive integer')
    }
  }
  
  if (config.timeout !== undefined) {
    if (config.timeout <= 0) {
      throw new Error('timeout must be positive')
    }
  }
  
  return true
}
```
**Test Case:** Set `maxConcurrentDownloads: 0`, start download

---

### 31. Environment Variable with Invalid API Key Format
**File:** Configuration loading  
**Issue:** No validation on env var formats  
**Scenario:** `API_KEY=""` or `API_KEY="invalid-format"`  
```typescript
const apiKey = process.env.API_KEY
// No validation that it's in correct format
```
**Error:** API calls fail silently  
**Impact:** No mods can be downloaded  
**Fix Recommendation:**
```typescript
const validateApiKey = (apiKey: string | undefined): boolean => {
  if (!apiKey) {
    throw new Error('API_KEY environment variable not set')
  }
  
  // Validate format (example: must be hex, specific length)
  if (!/^[0-9a-f]{32}$/.test(apiKey)) {
    throw new Error('API_KEY format invalid')
  }
  
  return true
}

if (!validateApiKey(process.env.API_KEY)) {
  process.exit(1)
}
```
**Test Case:** Set `API_KEY=""` and restart app

---

## Mod Management Edge Cases

### 32. Game with 0 Mods
**File:** `src/components/mods/ModManagerPanel.tsx:164-168`  
**Issue:** Empty state handled but statistics might fail  
**Scenario:** Game selected but no mods installed  
```tsx
{mods.length === 0 ? (
  <div className="flex flex-col items-center justify-center py-8">
    {/* Empty state shown */}
  </div>
) : (
  mods.map(...)
)}
```
**Error:** No error but might not handle batch operations  
**Impact:** Minor UX issue  
**Fix Recommendation:**
Already handled well - no fix needed but ensure batch operations handle empty arrays
**Test Case:** Select game with no mods

---

### 33. Mod with 0 Bytes Size
**File:** `electron/modules/mod-manager/mod-installer.ts:102-103`  
**Issue:** No validation that mod has non-zero size  
**Scenario:** Mod details have `fileSize: 0`  
```typescript
const downloadPath = path.join(TEMP_DIR, `${installId}.zip`)
await this.downloadModFile(details.fileUrl, downloadPath, (stats) => {
  progress.totalBytes = stats.total  // Could be 0
  progress.speed = stats.speed
})
```
**Error:** Division by zero in progress calculation  
**Impact:** Progress NaN, infinite ETA  
**Fix Recommendation:**
```typescript
if (!details.fileSize || details.fileSize <= 0) {
  throw new Error('Mod file size is invalid or zero')
}
```
**Test Case:** Set mod fileSize to 0

---

### 34. Mod with 100GB+ Size
**File:** `src/components/mods/ModCard.tsx:111-118`  
**Issue:** No validation on max reasonable mod size  
**Scenario:** Mod size is 100GB  
```typescript
const formattedSize = useMemo(() => {
  if (!mod.file_size) return null
  const bytes = mod.file_size
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)}GB`
  // Doesn't handle TB+ sizes, doesn't warn if too large
}, [mod.file_size])
```
**Error:** Formatting works but no warning, user might try to install on low-disk system  
**Impact:** Unexpected behavior, installation fails  
**Fix Recommendation:**
```typescript
const MAX_REASONABLE_MOD_SIZE = 50 * 1024 * 1024 * 1024  // 50GB

const formattedSize = useMemo(() => {
  if (!mod.file_size) return null
  
  if (mod.file_size > MAX_REASONABLE_MOD_SIZE) {
    logger.warn(`Unusually large mod detected: ${mod.file_size} bytes`)
  }
  
  const bytes = mod.file_size
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
  if (bytes < 1024 * 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)}GB`
  return `${(bytes / (1024 * 1024 * 1024 * 1024)).toFixed(2)}TB`
}, [mod.file_size])
```
**Test Case:** Create mod entry with fileSize = 100GB

---

### 35. Mod with No Name or Empty Name
**File:** `src/components/mods/ModCard.tsx:371`  
**Issue:** No validation that mod has name  
**Scenario:** Mod details: `{ name: "", author: "Test" }`  
```tsx
<p className="text-sm font-bold text-text-bright line-clamp-2 mb-1">{mod.name}</p>
// Empty name shown as blank
```
**Error:** UI shows blank line  
**Impact:** Visual glitch, confusing UI  
**Fix Recommendation:**
```tsx
<p className="text-sm font-bold text-text-bright line-clamp-2 mb-1">
  {mod.name || '(Unnamed Mod)'}
</p>
```
**Test Case:** Create mod with empty name

---

### 36. Mod with 1000-Character Name
**File:** `src/components/mods/ModCard.tsx:371`  
**Issue:** No max length on mod name, doesn't truncate gracefully  
**Scenario:** Mod name is 1000 characters long  
```tsx
<p className="text-sm font-bold text-text-bright line-clamp-2 mb-1">{mod.name}</p>
// line-clamp-2 will truncate but might cause layout issues
```
**Error:** Truncation might break words badly  
**Impact:** Minor UX issue  
**Fix Recommendation:**
```tsx
const MAX_NAME_LENGTH = 100

const displayName = useMemo(() => {
  if (!mod.name) return '(Unnamed Mod)'
  if (mod.name.length > MAX_NAME_LENGTH) {
    return mod.name.substring(0, MAX_NAME_LENGTH) + '...'
  }
  return mod.name
}, [mod.name])

<p className="text-sm font-bold text-text-bright line-clamp-2 mb-1">
  {displayName}
</p>
```
**Test Case:** Create mod with 1000-char name

---

### 37. Duplicate Mod Names Different IDs
**File:** `electron/modules/mod-manager/mod-installer.ts`  
**Issue:** No uniqueness constraint on mod names  
**Scenario:** Two mods with same name but different IDs  
```typescript
// Possible confusion if searching by name
```
**Error:** Potential user confusion, might uninstall wrong mod  
**Impact:** Data loss if user selects wrong mod  
**Fix Recommendation:**
```typescript
// Ensure mod IDs (fileIds) are unique and use for all operations
// Display both name and ID in UI
<div>
  <p className="font-bold">{mod.name}</p>
  <p className="text-xs text-gray-500">ID: {mod.id}</p>
</div>
```
**Test Case:** Add two mods with same name to database

---

### 38. Circular Mod Dependencies
**File:** `electron/handlers/mods.handler.ts:467-514`  
**Issue:** Conflict detection doesn't detect circular dependencies  
**Scenario:** Mod A depends on Mod B, Mod B depends on Mod A  
```typescript
async function handleCheckConflicts(_event: any, gameAppId: string) {
  const mods = await modsDatabaseService.getGameMods(gameAppId)
  
  for (let i = 0; i < mods.length; i++) {
    for (let j = i + 1; j < mods.length; j++) {
      // Doesn't check for circular dependencies
    }
  }
}
```
**Error:** Circular dependency not detected  
**Impact:** Mod loading fails  
**Fix Recommendation:**
```typescript
const detectCircularDependencies = (mods: ModInfo[]): string[] => {
  const visited = new Set<string>()
  const recursionStack = new Set<string>()
  
  const hasCycle = (modId: string): boolean => {
    if (recursionStack.has(modId)) return true
    if (visited.has(modId)) return false
    
    visited.add(modId)
    recursionStack.add(modId)
    
    const mod = mods.find(m => m.id === modId)
    if (mod) {
      for (const depId of mod.dependencies || []) {
        if (hasCycle(depId)) return true
      }
    }
    
    recursionStack.delete(modId)
    return false
  }
  
  const circular: string[] = []
  for (const mod of mods) {
    if (hasCycle(mod.id)) {
      circular.push(mod.id)
    }
  }
  
  return circular
}
```
**Test Case:** Create mods A→B→A dependencies

---

### 39. Mod Depends on Non-Existent Mod
**File:** `electron/modules/mod-manager/mod-installer.ts`  
**Issue:** No validation that dependencies exist  
**Scenario:** Mod A depends on ModId that doesn't exist  
```typescript
const modInfo: ModInfo = {
  // ...
  dependencies: ['non-existent-mod-id'],  // Not validated
}
```
**Error:** Dependency can't be satisfied  
**Impact:** Mod can't be enabled  
**Fix Recommendation:**
```typescript
const validateDependencies = async (
  modInfo: ModInfo,
  gameMods: ModInfo[]
): Promise<string[]> => {
  const modIds = new Set(gameMods.map(m => m.id))
  const missing: string[] = []
  
  for (const depId of modInfo.dependencies || []) {
    if (!modIds.has(depId)) {
      missing.push(depId)
    }
  }
  
  return missing
}

const missing = await validateDependencies(modInfo, gameMods)
if (missing.length > 0) {
  throw new Error(`Missing dependencies: ${missing.join(', ')}`)
}
```
**Test Case:** Install mod with non-existent dependency

---

### 40. Mod Conflicts with 50+ Other Mods
**File:** `electron/handlers/mods.handler.ts:467-514`  
**Issue:** No limit on conflicts, UI might not display well  
**Scenario:** Single mod conflicts with 50 other mods  
```typescript
conflicts.map((conflict, idx) => (
  <div key={idx}>...</div>
  // Could be 50+ items, UI could be slow
))
```
**Error:** Massive conflict list, UI performance issue  
**Impact:** Janky rendering  
**Fix Recommendation:**
```typescript
// Show top 10 conflicts, collapse rest
const displayConflicts = useMemo(() => {
  const MAX_DISPLAY = 10
  return conflicts.slice(0, MAX_DISPLAY)
}, [conflicts])

const hiddenCount = useMemo(() => {
  return Math.max(0, conflicts.length - 10)
}, [conflicts])

{displayConflicts.map((conflict) => (...))}
{hiddenCount > 0 && (
  <p className="text-sm text-gray-500">
    +{hiddenCount} more conflicts
  </p>
)}
```
**Test Case:** Create mod with 50+ conflicts

---

## Backup & Recovery Edge Cases

### 41. Restore Backup That Was Deleted
**File:** `electron/modules/mod-manager/mod-installer.ts:399-420`  
**Issue:** No check that backup file exists  
**Scenario:** Backup record in database but file deleted from disk  
```typescript
async restoreBackup(backupId: string, modId: string, installPath: string): Promise<boolean> {
  const backup = await modsDatabaseService.getBackup(backupId)
  if (!backup) {
    throw new Error('Backup not found')
  }
  
  // backup.path file might not exist!
  await this.extractModFiles(backup.path, installPath)
}
```
**Error:** ENOENT: no such file or directory  
**Impact:** Restore fails  
**Fix Recommendation:**
```typescript
async restoreBackup(backupId: string, modId: string, installPath: string): Promise<boolean> {
  const backup = await modsDatabaseService.getBackup(backupId)
  if (!backup) {
    throw new Error('Backup not found')
  }
  
  // Verify backup file exists before attempting restore
  if (!fs.existsSync(backup.path)) {
    throw new Error(`Backup file not found: ${backup.path}`)
  }
  
  try {
    // Verify it's a valid zip before extraction
    const zipValid = await this.verifyZipIntegrity(backup.path)
    if (!zipValid) {
      throw new Error('Backup file is corrupted')
    }
    
    await this.extractModFiles(backup.path, installPath)
    return true
  } catch (err: any) {
    logger.error(`Backup restoration failed: ${err?.message}`)
    return false
  }
}
```
**Test Case:** Delete backup file from disk, attempt restore

---

### 42. Restore Backup to Different Path Than Original
**File:** `electron/modules/mod-manager/mod-installer.ts:399-420`  
**Issue:** No validation that restore path is valid  
**Scenario:** Restore mod A's backup to mod B's location  
```typescript
await this.restoreBackup(backupIdA, modIdA, "/path/to/modB/")
// No check that path matches original
```
**Error:** Mod B overwritten with Mod A  
**Impact:** Data loss  
**Fix Recommendation:**
```typescript
async restoreBackup(
  backupId: string,
  modId: string,
  installPath: string
): Promise<boolean> {
  const backup = await modsDatabaseService.getBackup(backupId)
  if (!backup) {
    throw new Error('Backup not found')
  }
  
  // Verify backup is for correct mod
  if (backup.modId !== modId) {
    throw new Error(
      `Backup mismatch: attempting to restore ${backup.modId} to ${modId}`
    )
  }
  
  // (rest of implementation)
}
```
**Test Case:** Restore ModA backup to ModB location

---

### 43. Restore with Insufficient Disk Space
**File:** `electron/modules/mod-manager/mod-installer.ts:399-420`  
**Issue:** No disk space check before restore  
**Scenario:** Backup is 50GB but only 10GB available  
```typescript
// Partial restore could corrupt mod
await this.extractModFiles(backup.path, installPath)
```
**Error:** ENOSPC: no space left on device  
**Impact:** Incomplete restore, corrupted mod  
**Fix Recommendation:**
```typescript
// Check disk space before restore
const diskUsage = await diskSpace.check(installPath)
if (diskUsage.available < backup.size) {
  throw new Error(
    `Insufficient disk space for restore. Required: ${backup.size}, Available: ${diskUsage.available}`
  )
}
```
**Test Case:** Fill disk to capacity, attempt large backup restore

---

### 44. Backup with 0 Files
**File:** `electron/modules/mod-manager/mod-installer.ts:323-394`  
**Issue:** No validation that mod directory has files  
**Scenario:** Mod directory is empty or contains no files  
```typescript
const files = this.getAllFiles(installPath)
// files could be empty array
```
**Error:** Empty backup created, restore would fail  
**Impact:** Wasted backup space, unusable backup  
**Fix Recommendation:**
```typescript
const files = this.getAllFiles(installPath)
if (files.length === 0) {
  throw new Error('Cannot backup mod with no files')
}
```
**Test Case:** Create empty mod directory, attempt backup

---

### 45. Backup with 1,000,000+ Files
**File:** `electron/modules/mod-manager/mod-installer.ts:480-497`  
**Issue:** No limit on backup file count  
**Scenario:** Mod directory has 1 million files  
```typescript
const files = this.getAllFiles(installPath)
// Memory could be exhausted building file array
for (const file of files) {
  const hash = await this.calculateHash(file)  // 1M hashes!
}
```
**Error:** Out of memory, backup hangs  
**Impact:** App crashes or freezes indefinitely  
**Fix Recommendation:**
```typescript
const MAX_FILES_TO_BACKUP = 100000

const files = this.getAllFiles(installPath, 50)  // Max depth
if (files.length > MAX_FILES_TO_BACKUP) {
  throw new Error(
    `Mod has too many files (${files.length}). Max: ${MAX_FILES_TO_BACKUP}`
  )
}
```
**Test Case:** Create mod with 1M files, attempt backup

---

### 46. Corrupt Backup File
**File:** `electron/modules/mod-manager/mod-installer.ts:445-454`  
**Issue:** No integrity check on backup before extraction  
**Scenario:** Backup zip is corrupted or truncated  
```typescript
await this.extractModFiles(backup.path, extractPath)
// Could fail mid-extraction
```
**Error:** Incomplete extraction, corrupted mod  
**Impact:** Mod doesn't work  
**Fix Recommendation:**
```typescript
private async verifyZipIntegrity(zipPath: string): Promise<boolean> {
  return new Promise((resolve) => {
    const zip = new (require('adm-zip'))(zipPath)
    try {
      zip.getEntries()  // Will throw if corrupted
      resolve(true)
    } catch {
      resolve(false)
    }
  })
}

const isValid = await this.verifyZipIntegrity(backup.path)
if (!isValid) {
  throw new Error('Backup file is corrupted')
}
```
**Test Case:** Create partial/corrupted zip file, attempt restore

---

## Database Operation Edge Cases

### 47. JSON.parse Error in Database Row
**File:** `electron/services/mods-database.service.ts:606-631`  
**Issue:** JSON.parse could throw without error handling  
**Scenario:** Database has corrupted JSON in tags or dependencies column  
```typescript
private rowToModInfo(row: any): ModInfo {
  return {
    // ...
    tags: JSON.parse(row.tags || '[]'),
    dependencies: JSON.parse(row.dependencies || '[]'),
  }
}
```
**Error:** SyntaxError: Unexpected token  
**Impact:** Query fails, can't load mods  
**Fix Recommendation:**
```typescript
private rowToModInfo(row: any): ModInfo {
  const parseSafe = (jsonStr: string | null, fallback: any = []) => {
    try {
      return jsonStr ? JSON.parse(jsonStr) : fallback
    } catch (err) {
      logger.warn(`Failed to parse JSON: ${jsonStr}`, 'mods-db')
      return fallback
    }
  }
  
  return {
    // ...
    tags: parseSafe(row.tags),
    dependencies: parseSafe(row.dependencies),
  }
}
```
**Test Case:** Manually corrupt database JSON, query mods

---

### 48. Very Large Cache Key in getLRUCache
**File:** `electron/services/steam-workshop.service.ts:71-80`  
**Issue:** Cache size calculation uses JSON.stringify  
**Scenario:** Cache key is very long, stringified size is huge  
```typescript
sizeCalculation: (item) => {
  return JSON.stringify(item).length  // Could be huge
}
```
**Error:** Single item exceeds maxSize limit  
**Impact:** Item never cached  
**Fix Recommendation:**
```typescript
sizeCalculation: (item) => {
  // More accurate size calculation
  const baseSize = JSON.stringify(item).length
  const MAX_ITEM_SIZE = 10 * 1024 * 1024  // 10MB max per item
  if (baseSize > MAX_ITEM_SIZE) {
    logger.warn(`Item exceeds max cache size: ${baseSize}`)
  }
  return Math.min(baseSize, MAX_ITEM_SIZE)
}
```
**Test Case:** Cache very large mod details object

---

### 49. Database Busy Timeout Exceeded
**File:** `electron/services/mods-database.service.ts:45-62`  
**Issue:** Timeout set to 5 seconds but could still be hit under load  
**Scenario:** Multiple concurrent database operations with high I/O  
```typescript
this.db!.configure('busyTimeout', 5000)  // Only 5 seconds
```
**Error:** SQLITE_BUSY error  
**Impact:** Operations fail intermittently  
**Fix Recommendation:**
```typescript
// Increase timeout and retry logic
this.db!.configure('busyTimeout', 30000)  // 30 seconds

// Add retry wrapper
const executeWithRetry = async <T,>(
  fn: () => Promise<T>,
  maxRetries = 3
): Promise<T> => {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn()
    } catch (err: any) {
      if (err.code === 'SQLITE_BUSY' && i < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, 100 * (i + 1)))
        continue
      }
      throw err
    }
  }
  throw new Error('Max retries exceeded')
}
```
**Test Case:** Run multiple mod operations concurrently

---

### 50. Unvalidated Filter Object in QueryMods
**File:** `electron/services/mods-database.service.ts:331-383`  
**Issue:** Filter object not validated for type/structure  
**Scenario:** Caller passes invalid filter object  
```typescript
async queryMods(gameAppId: string, filters?: any): Promise<ModQueryResult> {
  // filters could have any structure
  if (filters?.enabled !== undefined) {
    sql += ' AND enabled = ?'
    params.push(filters.enabled ? 1 : 0)
  }
}
```
**Error:** Unexpected SQL, injection risk  
**Impact:** Slow query or unexpected results  
**Fix Recommendation:**
```typescript
interface ModFilters {
  enabled?: boolean
  status?: ModStatus
  source?: ModSourceType
  search?: string
}

const validateFilters = (filters: any): filters is ModFilters => {
  if (!filters) return true
  
  if (typeof filters !== 'object') return false
  
  if ('enabled' in filters && typeof filters.enabled !== 'boolean') return false
  if ('status' in filters && typeof filters.status !== 'string') return false
  if ('source' in filters && typeof filters.source !== 'string') return false
  if ('search' in filters && typeof filters.search !== 'string') return false
  
  return true
}

if (!validateFilters(filters)) {
  throw new Error('Invalid query filters')
}
```
**Test Case:** `queryMods("app123", { enabled: "true" })`

---

## Performance & Resource Edge Cases

### 51. IPC Timeout on Slow Network
**File:** `src/hooks/useModManager.ts:89-111`  
**Issue:** Timeout is 30 seconds - could be exceeded on slow networks  
**Scenario:** 500MB mod download on 1Mbps connection (~7000 seconds needed)  
```typescript
const IPC_TIMEOUT = 30000  // 30 seconds
return await Promise.race([
  gateway.call<T>(SERVICE_NAME, method, ...args),
  new Promise<T>((_, reject) =>
    setTimeout(() => reject(new Error(`IPC timeout...`)), IPC_TIMEOUT)
  ),
])
```
**Error:** Timeout error after 30 seconds  
**Impact:** Large downloads always fail  
**Fix Recommendation:**
```typescript
// Use timeout appropriate to operation type
const getTimeoutForOperation = (method: string): number => {
  switch (method) {
    case 'install': return 3600000  // 1 hour for large downloads
    case 'download': return 1800000  // 30 minutes
    case 'search': return 30000  // 30 seconds
    case 'enable': return 10000  // 10 seconds
    default: return 30000
  }
}

const timeout = getTimeoutForOperation(method)
return await Promise.race([
  gateway.call<T>(SERVICE_NAME, method, ...args),
  new Promise<T>((_, reject) =>
    setTimeout(
      () => reject(new Error(`IPC timeout after ${timeout}ms`)),
      timeout
    )
  ),
])
```
**Test Case:** Simulate slow network, attempt large install

---

## Summary Table

| # | Category | Issue | Severity | Fix Effort |
|---|----------|-------|----------|-----------|
| 1 | Search | Empty search string | Medium | Low |
| 2 | Search | Very long search (10K+ chars) | High | Medium |
| 3 | Search | Regex special characters | Medium | Medium |
| 4 | Search | Non-ASCII characters | Medium | Low |
| 5 | Search | Null/undefined query | High | Low |
| 6 | Search | Whitespace-only query | Low | Low |
| 7 | Input | Query type mismatch | High | Medium |
| 8 | Paths | Spaces in directory | Low | Low |
| 9 | Paths | Unicode characters | Medium | Medium |
| 10 | Paths | Path > 500 chars | Medium | Low |
| 11 | Paths | Path traversal attack | Critical | High |
| 12 | Paths | Circular symlinks | Critical | High |
| 13 | Paths | Permission denied | Medium | Medium |
| 14 | Paths | Parent dir not exist | Medium | Low |
| 15 | Paths | Insufficient disk space | High | Low |
| 16 | UI | Double-click install | High | Low |
| 17 | UI | Rapid toggle spam | Medium | Low |
| 18 | UI | Install then uninstall | Critical | High |
| 19 | UI | Drag same mod twice | Medium | Low |
| 20 | UI | Zero mods | Low | Low |
| 21 | UI | 1000+ mods | High | High |
| 22 | UI | Enable/disable spam | Medium | Medium |
| 23 | UI | Scroll during download | Low | Low |
| 24 | UI | Resize during operation | Low | Low |
| 25 | UI | Switch game mid-install | High | Medium |
| 26 | UI | Close app mid-operation | Critical | High |
| 27 | Config | Invalid JSON | Critical | Low |
| 28 | Config | Missing fields | High | Low |
| 29 | Config | Null values | High | Low |
| 30 | Config | Zero/negative numbers | Medium | Low |
| 31 | Config | Invalid API key | Medium | Low |
| 32 | Mods | Zero mods | Low | Low |
| 33 | Mods | Zero byte mod | Medium | Low |
| 34 | Mods | 100GB+ mod | Medium | Low |
| 35 | Mods | Empty mod name | Low | Low |
| 36 | Mods | 1000-char name | Low | Low |
| 37 | Mods | Duplicate names | Medium | Low |
| 38 | Mods | Circular dependencies | High | High |
| 39 | Mods | Missing dependencies | High | Low |
| 40 | Mods | 50+ conflicts | Medium | Low |
| 41 | Backup | Backup file deleted | High | Medium |
| 42 | Backup | Wrong restore path | Critical | Medium |
| 43 | Backup | Insufficient space | High | Low |
| 44 | Backup | Zero file backup | Medium | Low |
| 45 | Backup | 1M file backup | High | Medium |
| 46 | Backup | Corrupt backup | High | Medium |
| 47 | Database | JSON parse error | High | Low |
| 48 | Database | Large cache key | Medium | Low |
| 49 | Database | Busy timeout | Medium | Medium |
| 50 | Database | Invalid filters | Medium | Low |
| 51 | Performance | IPC timeout too short | High | Low |

---

## Prioritized Fix Roadmap

### Critical (Fix Immediately)
1. Path traversal attack validation (#11, #12)
2. Install/uninstall race condition (#18)
3. Close app mid-operation cleanup (#26)
4. Invalid JSON config crash (#27)
5. Restore backup to wrong path (#42)
6. Circular symlink infinite loop (#12)

### High (Fix This Sprint)
1. Extremely long search string (#2)
2. 1000+ mods UI freeze (#21)
3. Game switch mid-install (#25)
4. Backup file deleted (#41)
5. Database busy timeout (#49)
6. Insufficient disk space during restore (#43)

### Medium (Fix Next Sprint)
1. Rapid toggle/double-click debouncing (#16, #17, #22)
2. Unicode path handling (#9)
3. Circular dependencies detection (#38)
4. Corrupt backup verification (#46)
5. Type validation on config values (#28, #29, #30)

### Low (Nice to Have)
1. Path with spaces (#8)
2. Empty state handling (#20, #32)
3. Name truncation (#35, #36)
4. Whitespace-only search (#6)
5. Image loading timeouts on ModCard (#23)

---

## Testing Checklist

- [ ] Search with 10,000+ character strings
- [ ] Search with emoji and various Unicode
- [ ] Install with spaces and Unicode in path
- [ ] Path > 500 characters
- [ ] Symlink and circular symlink handling
- [ ] Double-click install button
- [ ] Rapid enable/disable toggle
- [ ] Install then immediately uninstall
- [ ] 5000 mods in load order
- [ ] Enable all then disable all rapidly
- [ ] Switch games during install
- [ ] Close app during download
- [ ] Invalid JSON config file
- [ ] Config with missing fields
- [ ] 100GB+ mod installation
- [ ] Restore backup with insufficient space
- [ ] Backup 1M file directory
- [ ] Corrupt backup file restoration
- [ ] Circular mod dependencies
- [ ] Missing mod dependencies
- [ ] Very slow network (1Mbps) large download

