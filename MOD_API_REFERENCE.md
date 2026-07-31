# Y-Core Mod Manager - API Reference

## Type Definitions

### Enums

#### ModStatus
Installation and activation status of a mod.

```typescript
enum ModStatus {
  NOT_INSTALLED = 'not_installed',
  INSTALLED = 'installed',
  ENABLED = 'enabled',
  DISABLED = 'disabled',
  UPDATING = 'updating',
  CORRUPTED = 'corrupted',
}
```

#### ModSourceType
Origin of the mod installation.

```typescript
enum ModSourceType {
  STEAM_WORKSHOP = 'steam_workshop',
  NEXUSMODS = 'nexusmods',
  LOCAL = 'local',
}
```

#### BackupStatus
State of a backup.

```typescript
enum BackupStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CORRUPTED = 'corrupted',
}
```

#### MalwareScanStatus
Malware scan result.

```typescript
enum MalwareScanStatus {
  NOT_SCANNED = 'not_scanned',
  SCANNING = 'scanning',
  CLEAN = 'clean',
  QUARANTINED = 'quarantined',
  SUSPICIOUS = 'suspicious',
}
```

---

## Interfaces

### ModInfo
Complete mod information including installation details.

```typescript
interface ModInfo {
  id: string                          // Unique mod identifier
  gameAppId: string                   // Steam app ID
  gameTitle: string                   // Game name
  title: string                       // Mod name
  author: string                      // Mod author
  description: string                 // Full description
  version: string                     // Installed version
  status: ModStatus                   // Installation status
  source: ModSourceType               // Origin (Steam, Nexus, etc)
  installPath: string                 // Full install directory
  fileSize: number                    // Bytes
  fileUrl: string                     // Download URL
  previewUrl: string                  // Screenshot/preview
  tags: string[]                      // Category tags
  dependencies: string[]              // Required mod IDs
  loadOrder: number                   // Priority (0 = first)
  enabled: boolean                    // Is active
  installedAt: number                 // Timestamp
  lastUpdatedAt: number               // Timestamp
  lastEnabledAt?: number              // Timestamp or undefined
  compatibleVersions: string[]        // Supported game versions
  requiredDependencies: string[]      // Critical dependencies
}
```

### SteamModDetails
Mod metadata from Steam Workshop API.

```typescript
interface SteamModDetails {
  id: string                          // Workshop file ID
  fileId: string                      // Same as id
  title: string
  description: string
  author: string                      // Creator name
  authorId: string                    // Creator SteamID
  createdAt: number                   // Unix timestamp
  updatedAt: number                   // Last modified
  fileSize: number                    // Bytes
  fileUrl: string                     // Direct download link
  previewUrl: string                  // Thumbnail image
  tags: string[]                      // Categories
  votesUp: number                     // Positive votes
  votesDown: number                   // Negative votes
  score: number                       // Rating score
  downloadCount?: number              // Total downloads
  subscriptionCount?: number          // Active subscribers
  favoriteCount?: number              // Favorited by users
  visibility: 'public' | 'friends_only' | 'private'
}
```

### BackupInfo
Backup metadata and integrity information.

```typescript
interface BackupInfo {
  id: string                          // Unique backup ID (UUID)
  modId: string                       // Backed up mod ID
  gameAppId: string                   // Game identifier
  timestamp: number                   // Backup creation time
  status: BackupStatus                // Current status
  size: number                        // Bytes
  path: string                        // Storage location
  createdBy: string                   // 'manual' | 'auto' | 'before_update'
  notes?: string                      // User-provided description
  integrity: {
    fileCount: number                 // Files in backup
    checksumValid: boolean            // Verified integrity
    lastVerified?: number             // Last check timestamp
  }
  expiresAt?: number                  // Auto-delete time
}
```

### ModInstallOptions
Configuration for mod installation.

```typescript
interface ModInstallOptions {
  modId: string                       // Mod to install
  gameAppId: string                   // Target game
  installDir: string                  // Installation directory
  createBackup: boolean               // Save current state
  scanForMalware: boolean             // Run security scan
  overwrite: boolean                  // Replace existing
  priority?: 'low' | 'normal' | 'high'  // Queue priority
  enableAfterInstall?: boolean        // Activate immediately
}
```

### ModInstallProgress
Real-time installation progress updates.

```typescript
interface ModInstallProgress {
  modId: string
  stage: 'backup' | 'download' | 'extract' | 'scan' | 'install' | 'cleanup'
  progress: number                    // 0-100 percentage
  speed: number                       // Bytes per second
  eta: number                         // Seconds remaining
  bytesTransferred: number
  totalBytes: number
  currentFile?: string                // Currently processing file
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled'
  error?: string                      // Error message if failed
  warnings: string[]                  // Non-fatal issues
}
```

### ModInstallResult
Result of installation operation.

```typescript
interface ModInstallResult {
  success: boolean
  modId: string
  modInfo?: ModInfo                   // Installed mod details
  backupId?: string                   // Created backup ID
  warnings: string[]                  // Non-fatal issues
  error?: string                      // Error message
  duration: number                    // Milliseconds elapsed
}
```

### ModUninstallOptions
Configuration for mod uninstallation.

```typescript
interface ModUninstallOptions {
  modId: string
  gameAppId: string
  keepBackup: boolean                 // Save before deleting
  clearDependents: boolean            // Remove dependent mods
}
```

### ModUninstallResult
Result of uninstallation operation.

```typescript
interface ModUninstallResult {
  success: boolean
  modId: string
  backupId?: string                   // Created backup (if keepBackup=true)
  affectedMods: string[]              // Removed dependents
  error?: string
  duration: number                    // Milliseconds elapsed
}
```

### ModSearchQuery
Parameters for mod catalog search.

```typescript
interface ModSearchQuery {
  gameAppId: string                   // Required: game to search
  search?: string                     // Search text
  tags?: string[]                     // Filter by tags
  sort?: 'trending' | 'newest' | 'most_subscribed' | 'top_rated' | 'alphabetical'
  order?: 'asc' | 'desc'              // Sort direction
  limit?: number                      // Results per page (default: 100)
  offset?: number                     // Pagination offset (default: 0)
  author?: string                     // Filter by creator
  minScore?: number                   // Minimum rating
}
```

### ModSearchResult
Search results with metadata.

```typescript
interface ModSearchResult {
  query: ModSearchQuery               // Original search parameters
  mods: SteamModDetails[]             // Matching mods
  total: number                       // Total available (not limited by offset/limit)
  hasMore: boolean                    // More results available
  searchTime: number                  // Milliseconds to complete
}
```

### ModStatistics
Aggregate statistics for a game's mods.

```typescript
interface ModStatistics {
  totalMods: number                   // Installed count
  enabledMods: number                 // Active count
  disabledMods: number                // Disabled count
  totalBackups: number                // Backup count
  backupSize: number                  // Total backup size (bytes)
  lastScan: number                    // Last malware scan timestamp
  scanStatus: MalwareScanStatus       // Overall scan result
  conflicts: number                   // Detected conflicts
}
```

### ModConflict
Detected conflict between mods.

```typescript
interface ModConflict {
  modIds: string[]                    // Conflicting mod IDs
  type: 'file_conflict' | 'dependency_conflict' | 'version_conflict'
  severity: 'warning' | 'error'
  description: string                 // Human-readable explanation
  resolution?: string                 // Suggested fix
}
```

### CacheStats
Statistics about API response cache.

```typescript
interface CacheStats {
  entriesCount: number                // Cached items
  cacheSize: number                   // Total size (bytes)
  oldestEntryAge: number              // Age of oldest entry (ms)
  newestEntryAge: number              // Age of newest entry (ms)
  hitRate: number                     // Cache hit rate (0-1)
}
```

---

## IPC Channels

### Search & Discovery

#### `mods:search-catalog`
Search Steam Workshop for mods.

**Request:**
```typescript
const query: ModSearchQuery = {
  gameAppId: '570',
  search: 'custom map',
  tags: ['gameplay'],
  sort: 'top_rated',
  limit: 20,
}
const result = await ipcRenderer.invoke('mods:search-catalog', query)
```

**Response:**
```typescript
{
  success: boolean
  data?: ModSearchResult
  error?: string
}
```

**Example:**
```typescript
const result = await ipcRenderer.invoke('mods:search-catalog', {
  gameAppId: '570',
  search: 'map',
  limit: 50,
  offset: 0,
})

if (result.success) {
  result.data.mods.forEach(mod => {
    console.log(`${mod.title} - ${mod.votesUp} votes`)
  })
  console.log(`Found ${result.data.total} total mods`)
}
```

#### `mods:get-details`
Fetch full details for a specific mod.

**Request:**
```typescript
const result = await ipcRenderer.invoke('mods:get-details', fileId)
```

**Response:**
```typescript
{
  success: boolean
  data?: SteamModDetails
  error?: string
}
```

**Example:**
```typescript
const result = await ipcRenderer.invoke('mods:get-details', '1234567890')
if (result.success) {
  console.log(result.data.title)
  console.log(result.data.description)
}
```

#### `mods:list-installed`
List all installed mods for a game.

**Request:**
```typescript
const result = await ipcRenderer.invoke('mods:list-installed', gameAppId)
```

**Response:**
```typescript
{
  success: boolean
  data?: ModInfo[]
  error?: string
}
```

#### `mods:search-installed`
Search installed mods locally.

**Request:**
```typescript
const result = await ipcRenderer.invoke('mods:search-installed', searchQuery, gameAppId?)
```

**Response:**
```typescript
{
  success: boolean
  data?: ModInfo[]
  error?: string
}
```

---

### Installation & Management

#### `mods:install`
Install a mod from Steam Workshop.

**Request:**
```typescript
const details = await ipcRenderer.invoke('mods:get-details', fileId)
const options: ModInstallOptions = {
  modId: fileId,
  gameAppId: '570',
  installDir: '/path/to/install',
  createBackup: true,
  scanForMalware: true,
}
const result = await ipcRenderer.invoke('mods:install', details, options)
```

**Response:**
```typescript
{
  success: boolean
  data?: ModInstallResult
  error?: string
}
```

**Progress Events:**
```typescript
ipcRenderer.on('mods:install-progress', (progress: ModInstallProgress) => {
  console.log(`${progress.stage}: ${progress.progress}%`)
  if (progress.eta > 0) {
    console.log(`ETA: ${Math.floor(progress.eta)}s`)
  }
})
```

#### `mods:uninstall`
Remove a mod completely.

**Request:**
```typescript
const options: ModUninstallOptions = {
  modId: 'mod-id-123',
  gameAppId: '570',
  keepBackup: true,
  clearDependents: false,
}
const result = await ipcRenderer.invoke('mods:uninstall', options)
```

**Response:**
```typescript
{
  success: boolean
  data?: ModUninstallResult
  error?: string
}
```

#### `mods:enable`
Activate a mod (make it load).

**Request:**
```typescript
const result = await ipcRenderer.invoke('mods:enable', modId)
```

**Response:**
```typescript
{
  success: boolean
  error?: string
}
```

#### `mods:disable`
Deactivate a mod (prevent loading).

**Request:**
```typescript
const result = await ipcRenderer.invoke('mods:disable', modId)
```

**Response:**
```typescript
{
  success: boolean
  error?: string
}
```

#### `mods:cancel-install`
Cancel an ongoing installation.

**Request:**
```typescript
const result = await ipcRenderer.invoke('mods:cancel-install', modId)
```

**Response:**
```typescript
{
  success: boolean
  error?: string
}
```

---

### Security & Backups

#### `mods:scan-malware`
Scan mod files for malware.

**Request:**
```typescript
const options = {
  modId: 'mod-id-123',
  filePaths: ['/path/to/file1', '/path/to/file2'],
  deepScan: true,
  updateVirusTotal: true,
}
const result = await ipcRenderer.invoke('mods:scan-malware', options)
```

**Response:**
```typescript
{
  success: boolean
  data?: {
    modId: string
    timestamp: number
    overallStatus: MalwareScanStatus
    filesScanned: number
    filesQuarantined: number
    duration: number
    details: [{ filePath: string, status: string, threat?: string }]
    recommendation: 'safe' | 'quarantine' | 'delete'
  }
  error?: string
}
```

#### `mods:get-backups`
List all backups for a mod.

**Request:**
```typescript
const result = await ipcRenderer.invoke('mods:get-backups', modId)
```

**Response:**
```typescript
{
  success: boolean
  data?: BackupInfo[]
  error?: string
}
```

**Example:**
```typescript
const result = await ipcRenderer.invoke('mods:get-backups', 'mod-123')
if (result.success) {
  result.data.forEach(backup => {
    console.log(`${new Date(backup.timestamp).toLocaleString()} - ${backup.size} bytes`)
  })
}
```

#### `mods:restore-backup`
Restore mod from a backup.

**Request:**
```typescript
const result = await ipcRenderer.invoke('mods:restore-backup', {
  backupId: 'backup-uuid',
  modId: 'mod-123',
  installPath: '/path/to/install',
})
```

**Response:**
```typescript
{
  success: boolean
  error?: string
}
```

#### `mods:check-conflicts`
Detect incompatibilities between installed mods.

**Request:**
```typescript
const result = await ipcRenderer.invoke('mods:check-conflicts', gameAppId)
```

**Response:**
```typescript
{
  success: boolean
  data?: {
    hasConflicts: boolean
    conflicts: ModConflict[]
    warnings: string[]
  }
  error?: string
}
```

---

### Query & Statistics

#### `mods:query-mods`
Query installed mods with filters.

**Request:**
```typescript
const result = await ipcRenderer.invoke('mods:query-mods', gameAppId, {
  enabled: true,
  status: 'installed',
  search: 'map',
})
```

**Response:**
```typescript
{
  success: boolean
  data?: {
    mods: ModInfo[]
    total: number
    hasMore: boolean
    offset: number
    limit: number
  }
  error?: string
}
```

#### `mods:get-statistics`
Get aggregate statistics for a game.

**Request:**
```typescript
const result = await ipcRenderer.invoke('mods:get-statistics', gameAppId)
```

**Response:**
```typescript
{
  success: boolean
  data?: ModStatistics
  error?: string
}
```

**Example:**
```typescript
const result = await ipcRenderer.invoke('mods:get-statistics', '570')
if (result.success) {
  const stats = result.data
  console.log(`Installed: ${stats.totalMods}`)
  console.log(`Enabled: ${stats.enabledMods}`)
  console.log(`Backup size: ${(stats.backupSize / 1024 / 1024).toFixed(2)} MB`)
}
```

#### `mods:get-cache-stats`
Get API cache statistics.

**Request:**
```typescript
const result = await ipcRenderer.invoke('mods:get-cache-stats')
```

**Response:**
```typescript
{
  success: boolean
  data?: CacheStats & { hitRate: number }
  error?: string
}
```

---

### Cache Management

#### `mods:clear-cache`
Clear the API response cache.

**Request:**
```typescript
const result = await ipcRenderer.invoke('mods:clear-cache')
```

**Response:**
```typescript
{
  success: boolean
  error?: string
}
```

---

## Error Codes & Messages

Common error scenarios and their handling:

| Error | Cause | Resolution |
|-------|-------|-----------|
| `"Mod not found"` | Invalid fileId | Verify fileId with Steam Workshop |
| `"Network timeout"` | API unavailable | Retry with exponential backoff |
| `"Insufficient disk space"` | Not enough free space | Free up storage before install |
| `"Installation path does not exist"` | Invalid installDir | Create directory or change path |
| `"Backup creation failed"` | Disk write error | Check file permissions |
| `"Mod contains malware"` | Scan detected threat | Quarantine or delete |
| `"Checksum mismatch"` | File corruption | Restore backup |
| `"Dependency not installed"` | Missing required mod | Install dependency first |
| `"Database error"` | SQLite issue | Check userData permissions |
| `"Download interrupted"` | Network issue | Retry installation |

---

## Example: Full Installation Flow

```typescript
async function installModWithUI(fileId: string, gameAppId: string) {
  try {
    // 1. Fetch mod details
    const details = await ipcRenderer.invoke('mods:get-details', fileId)
    if (!details.success) {
      throw new Error(details.error)
    }

    console.log(`Installing: ${details.data.title}`)
    console.log(`Size: ${(details.data.fileSize / 1024 / 1024).toFixed(2)} MB`)

    // 2. Check for conflicts
    const conflicts = await ipcRenderer.invoke('mods:check-conflicts', gameAppId)
    if (conflicts.success && conflicts.data.hasConflicts) {
      console.warn('Conflicts detected:', conflicts.data.conflicts)
    }

    // 3. Get current backups
    const backups = await ipcRenderer.invoke('mods:get-backups', fileId)
    console.log(`Existing backups: ${backups.data?.length || 0}`)

    // 4. Install with progress
    const options: ModInstallOptions = {
      modId: fileId,
      gameAppId,
      installDir: '/path/to/game/mods',
      createBackup: true,
      scanForMalware: true,
      enableAfterInstall: false,
    }

    // Subscribe to progress
    const unsubscribe = ipcRenderer.on('mods:install-progress', (progress) => {
      const percent = Math.round(progress.progress)
      const stage = progress.stage.toUpperCase()
      const speed = (progress.speed / 1024 / 1024).toFixed(2)
      console.log(`[${stage}] ${percent}% | ${speed} MB/s | ETA: ${Math.floor(progress.eta)}s`)
    })

    // Perform installation
    const result = await ipcRenderer.invoke('mods:install', details.data, options)
    unsubscribe()

    if (result.success) {
      console.log(`✓ Installed successfully in ${result.duration / 1000}s`)
      console.log(`Backup ID: ${result.data.backupId}`)
      return result.data
    } else {
      throw new Error(result.error)
    }
  } catch (err) {
    console.error('Installation failed:', err.message)
  }
}
```

---

## Version History

- **v1.0** (Initial Release)
  - Steam Workshop API integration
  - Local mod database
  - Install/uninstall workflows
  - Backup and restore
  - Malware scanning framework
  - Conflict detection
  - Cache management

---

## Support

For issues or questions:
1. Check `userData/logs/` for detailed error logs
2. Review `MOD_MANAGER_INTEGRATION.md` for architecture details
3. Check `STEAM_WORKSHOP_API.md` for API limits and best practices
