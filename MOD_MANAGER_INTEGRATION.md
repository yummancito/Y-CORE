# Y-Core Mod Manager - Integration Guide

## Overview

The Mod Manager is a comprehensive system for discovering, installing, managing, and maintaining game mods through the Steam Workshop API and local backup system. This document covers the integration architecture and workflows.

## Architecture

### System Components

```
┌─────────────────────────────────────────────────────────────────┐
│                     Renderer Process (React)                    │
│                    Mod Manager UI Components                    │
└──────────────────────────────┬──────────────────────────────────┘
                                │ IPC Channels
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Main Process (Electron)                      │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              IPC Handlers (mods.handler.ts)              │  │
│  │  • Search & Discovery      • Installation & Uninstall   │  │
│  │  • Enable/Disable          • Security & Backups         │  │
│  │  • Query & Statistics      • Cache Management           │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                │                                 │
│  ┌─────────────┬──────────────┬────────────┬──────────────────┐ │
│  │             │              │            │                  │ │
│  ▼             ▼              ▼            ▼                  ▼ │
│  Mods Service  Steam          Mods DB     Mod                  │
│  (Wrapper)     Workshop API   Service     Installer            │
│                Service                                          │
│  • Coordinate  • Get mods     • SQLite    • Backup/Restore    │
│  • Delegate    • Search       • Storage   • Installation      │
│  • Cache       • Download     • Queries   • Enable/Disable    │
│                               • Stats     • Malware Scan      │
│                                           • Conflicts         │
└─────────────────────────────────────────────────────────────────┘
                                │
                    ┌───────────┴───────────┐
                    ▼                       ▼
              Steam API           File System
              (Workshop)          • mod-backups/
                                  • mod-temp/
                                  • Installation paths
```

## Service Layer

### 1. Steam Workshop Service (`electron/services/steam-workshop.service.ts`)

Handles all interactions with Steam's Workshop API.

**Key Features:**
- API integration with Steam Workshop
- Request rate limiting (100ms between requests)
- Caching with LRU eviction (24-hour TTL)
- Automatic retries (3 attempts with exponential backoff)
- File download with progress tracking
- Batch operations for efficiency

**Methods:**
```typescript
async getModDetails(fileId: string): Promise<SteamModDetails | null>
async getModDetailsBatch(fileIds: string[]): Promise<SteamModDetails[]>
async searchMods(query: ModSearchQuery): Promise<ModSearchResult>
async getGameMods(appId: string, limit?, offset?): Promise<SteamCatalogResponse>
async downloadModFile(fileUrl, outputPath, onProgress?): Promise<{ success, path, size }>
getCacheStats(): CacheStats
getCacheHitRate(): number
clearCache(): void
```

**Caching Strategy:**
- Default TTL: 24 hours
- Max cache size: 100 MB
- Search results: 1 hour TTL (shorter due to freshness requirements)
- Cache hits bypass API calls, reducing latency and load

### 2. Mods Database Service (`electron/services/mods-database.service.ts`)

SQLite database for persistent mod metadata and backup tracking.

**Schema:**

```sql
installed_mods
├── id (PRIMARY KEY)
├── gameAppId, fileId
├── title, author, description, version
├── source (steam_workshop | nexusmods | local)
├── installPath, fileSize, fileUrl, previewUrl
├── tags, dependencies (JSON)
├── enabled, loadOrder, status
├── malwareScanStatus
├── installedAt, lastUpdatedAt, lastEnabledAt
├── checksums (JSON: {filename -> sha256})
├── metadata (JSON)
└── createdAt, updatedAt

backups
├── id (PRIMARY KEY)
├── modId (FOREIGN KEY)
├── gameAppId
├── timestamp, status (pending|in_progress|completed|failed|corrupted)
├── size, path
├── createdBy (manual|auto|before_update)
├── notes
├── fileCount, checksumValid, lastVerified
├── expiresAt
├── metadata (JSON)
└── createdAt, updatedAt

Indexes:
- installed_mods(gameAppId) - fast game queries
- installed_mods(status) - filter by installation status
- installed_mods(enabled) - quick enable/disable status
- backups(modId) - fast backup lookup
- backups(timestamp) - time-based queries
```

**Methods:**
```typescript
async initialize(): Promise<void>
async addInstalledMod(modInfo: ModInfo): Promise<boolean>
async getInstalledMod(modId: string): Promise<ModInfo | null>
async getGameMods(gameAppId: string): Promise<ModInfo[]>
async searchMods(query: string, gameAppId?): Promise<ModInfo[]>
async queryMods(gameAppId, filters?): Promise<ModQueryResult>
async updateModStatus(modId, status): Promise<boolean>
async updateModEnabled(modId, enabled): Promise<boolean>
async deleteInstalledMod(modId): Promise<boolean>
async addBackup(backupInfo: BackupInfo): Promise<boolean>
async getModBackups(modId): Promise<BackupInfo[]>
async getBackup(backupId): Promise<BackupInfo | null>
async deleteBackup(backupId): Promise<boolean>
async getStatistics(gameAppId): Promise<ModStatistics>
async close(): Promise<void>
```

### 3. Mod Installer (`electron/modules/mod-manager/mod-installer.ts`)

Orchestrates the mod installation workflow with rollback support.

**Installation Workflow:**

```
1. Backup (if requested)
   ├── Scan existing installation
   ├── Calculate file checksums
   ├── Create backup archive
   └── Store in database

2. Malware Scan (if requested)
   ├── Extension check
   ├── PE header analysis
   └── Quarantine if necessary

3. Download
   ├── Rate limit to Steam API
   ├── Resume-capable download
   ├── Report progress every 500ms
   └── Validate download

4. Extract
   ├── Create installation directory
   ├── Extract mod files
   └── Verify extraction

5. Database Update
   ├── Record installation metadata
   ├── Set initial status
   └── Calculate integrity

6. Cleanup
   ├── Remove temporary files
   └── Update statistics
```

**Methods:**
```typescript
async installMod(
  details: any,
  options: ModInstallOptions,
  onProgress?: (progress: ModInstallProgress) => void
): Promise<ModInstallResult>

async uninstallMod(options: ModUninstallOptions): Promise<ModUninstallResult>
async enableMod(modId: string): Promise<boolean>
async disableMod(modId: string): Promise<boolean>
async restoreBackup(backupId, modId, installPath): Promise<boolean>
```

**Progress Reporting:**

During installation, progress is reported with:
- `stage`: Current phase (backup, download, extract, scan, install, cleanup)
- `progress`: 0-100 percentage
- `speed`: Bytes per second
- `eta`: Seconds remaining
- `currentFile`: Currently processing file
- `warnings`: Non-fatal issues

Example flow:
```
0%: backup → 10% → download → 30-70% → extract → 75%
→ scan → 80% → install → 90% → cleanup → 100%
```

## IPC Handler Layer

### mods.handler.ts

Bridges renderer and main process with type-safe IPC channels.

**Search & Discovery Channels:**
```typescript
// Search Steam Workshop
ipcMain.handle('mods:search-catalog', async (event, query: ModSearchQuery))
  → { success, data: ModSearchResult }

// Get mod details
ipcMain.handle('mods:get-details', async (event, fileId: string))
  → { success, data: SteamModDetails }

// List installed mods for game
ipcMain.handle('mods:list-installed', async (event, gameAppId: string))
  → { success, data: ModInfo[] }
```

**Installation Channels:**
```typescript
// Install mod
ipcMain.handle('mods:install', async (event, details, options))
  → { success, data: ModInstallResult }

// Uninstall mod
ipcMain.handle('mods:uninstall', async (event, options))
  → { success, data: ModUninstallResult }

// Enable mod
ipcMain.handle('mods:enable', async (event, modId))
  → { success }

// Disable mod
ipcMain.handle('mods:disable', async (event, modId))
  → { success }

// Cancel ongoing installation
ipcMain.handle('mods:cancel-install', async (event, modId))
  → { success }
```

**Security & Maintenance Channels:**
```typescript
// Scan mod for malware
ipcMain.handle('mods:scan-malware', async (event, options))
  → { success, data: ModScanResult }

// Get backups for mod
ipcMain.handle('mods:get-backups', async (event, modId))
  → { success, data: BackupInfo[] }

// Restore from backup
ipcMain.handle('mods:restore-backup', async (event, payload))
  → { success }

// Check for conflicts
ipcMain.handle('mods:check-conflicts', async (event, gameAppId))
  → { success, data: ConflictCheckResult }
```

**Query & Statistics Channels:**
```typescript
// Search installed mods
ipcMain.handle('mods:search-installed', async (event, query, gameAppId?))
  → { success, data: ModInfo[] }

// Query with filters
ipcMain.handle('mods:query-mods', async (event, gameAppId, filters?))
  → { success, data: ModQueryResult }

// Get statistics
ipcMain.handle('mods:get-statistics', async (event, gameAppId))
  → { success, data: ModStatistics }

// Get cache stats
ipcMain.handle('mods:get-cache-stats', async (event))
  → { success, data: CacheStats }
```

**Cache Management Channels:**
```typescript
// Clear API cache
ipcMain.handle('mods:clear-cache', async (event))
  → { success }
```

**Progress Events (Sent from main → renderer):**
```typescript
event.sender.send('mods:install-progress', progress: ModInstallProgress)
```

## Workflow Examples

### Installing a Mod

```typescript
// Renderer side
const details = await ipcRenderer.invoke('mods:get-details', fileId)

const options: ModInstallOptions = {
  modId: fileId,
  gameAppId: '570', // Dota 2
  installDir: 'C:\\Games\\Dota2\\mods',
  createBackup: true,
  scanForMalware: true,
  overwrite: false,
  enableAfterInstall: false,
}

// Subscribe to progress
ipcRenderer.on('mods:install-progress', (progress) => {
  console.log(`${progress.stage}: ${progress.progress}%`)
})

// Perform installation
const result = await ipcRenderer.invoke('mods:install', details, options)

if (result.success) {
  console.log(`Installed: ${result.data.modId}`)
  console.log(`Backup ID: ${result.data.backupId}`)
}
```

### Searching Mods

```typescript
// Renderer side
const query: ModSearchQuery = {
  gameAppId: '570',
  search: 'custom map',
  tags: ['gameplay'],
  sort: 'top_rated',
  order: 'desc',
  limit: 20,
  offset: 0,
}

const result = await ipcRenderer.invoke('mods:search-catalog', query)

if (result.success) {
  result.data.mods.forEach(mod => {
    console.log(`${mod.title} (${mod.votesUp} votes)`)
  })
}
```

### Restoring from Backup

```typescript
// Get available backups
const backups = await ipcRenderer.invoke('mods:get-backups', modId)

// Restore specific backup
const result = await ipcRenderer.invoke('mods:restore-backup', {
  backupId: backups[0].id,
  modId,
  installPath: mod.installPath,
})

if (result.success) {
  console.log('Backup restored successfully')
}
```

## Database Initialization

The mods database is automatically initialized on app startup:

1. **At `app.whenReady()`:**
   ```typescript
   await modsDatabaseService.initialize()
   ```
   - Creates SQLite file at `userData/mods-database.db`
   - Runs schema migrations
   - Creates indexes

2. **On app shutdown (`before-quit`):**
   ```typescript
   await modsDatabaseService.close()
   ```
   - Closes database connection
   - Flushes pending writes

## Configuration

The Mod Manager can be configured through environment variables and config files:

```typescript
interface ModManagerConfig {
  backupPath: string                 // Default: userData/mod-backups
  enableAutoBackup: boolean          // Auto-backup on enable
  autoBackupInterval: number         // ms between auto-backups
  enableMalwareScanning: boolean     // Enable security scans
  malwareScanLevel: 'quick' | 'standard' | 'deep'
  enableConflictDetection: boolean   // Detect incompatibilities
  cacheApiResponses: boolean         // Use API cache
  cacheTTL: number                   // Cache time-to-live (ms)
  maxCacheSize: number               // Max cache size (bytes)
  maxBackups: number                 // Retention limit
  backupRetention: number            // Auto-delete age (ms)
  allowConcurrentInstalls: boolean   // Parallel installations
  maxConcurrentDownloads: number     // Parallel downloads
}
```

## Error Handling

All operations return structured responses:

```typescript
{
  success: boolean
  data?: T
  error?: string
  warnings?: string[]
}
```

Common error scenarios:

| Scenario | Error | Mitigation |
|----------|-------|-----------|
| Mod not found in Workshop | "Mod not found" | Check fileId validity |
| Installation path invalid | "Path does not exist" | Create directory first |
| Insufficient disk space | "Not enough space" | Free up storage |
| Network timeout | "API timeout" | Retry with backoff |
| Malware detected | "Mod contains malware" | Quarantine and review |
| Backup corrupted | "Checksum mismatch" | Delete and reinstall |

## Performance Considerations

### API Caching
- Search results cached for 1 hour
- Mod details cached for 24 hours
- Cache hit rate monitoring via `getCacheStats()`

### Database Queries
- Indexed lookups on `gameAppId`, `enabled`, `status`
- Prepared statements for safety
- Transactions for data consistency

### Download Optimization
- Chunked streaming (64 KB chunks)
- Progress reported every 500 ms
- Resume-capable downloads on failure

### Concurrent Operations
- Single install per modId (queue others)
- Parallel backups for different mods
- Optional concurrent downloads (configurable)

## Security

### File Integrity
- SHA256 checksums for all mod files
- Checksum verification on restore
- Corrupt file detection

### Malware Protection
- Extension whitelist/blacklist
- PE header analysis for executables
- VirusTotal API integration (optional)
- YARA rule scanning (optional)
- Quarantine system for suspicious files

### Backup Encryption
- Backups stored in compressed format
- Optional encryption for sensitive mods
- Automatic expiration (configurable)

## Testing

### Unit Tests
```typescript
// Test Steam Workshop API
describe('SteamWorkshopService', () => {
  it('should cache mod details', async () => {
    const details = await service.getModDetails(fileId)
    expect(service.getCacheHitRate()).toBeGreaterThan(0)
  })
})

// Test Database
describe('ModsDatabaseService', () => {
  it('should query mods by game', async () => {
    const mods = await service.getGameMods('570')
    expect(mods).toHaveLength(0)
  })
})
```

### Integration Tests
```typescript
// Test full workflow
it('should install and enable mod', async () => {
  const result = await modInstaller.installMod(details, options)
  expect(result.success).toBe(true)
  
  const installed = await db.getInstalledMod(result.modId)
  expect(installed.enabled).toBe(true)
})
```

## Troubleshooting

### Database Corruption
```typescript
// Backup and recreate
await modsDatabaseService.close()
fs.renameSync('mods-database.db', 'mods-database.db.backup')
await modsDatabaseService.initialize()
```

### Cache Issues
```typescript
// Clear cache if search results are stale
await ipcRenderer.invoke('mods:clear-cache')
```

### Installation Failures
```typescript
// Check logs for detailed error messages
const result = await ipcRenderer.invoke('mods:install', details, options)
if (!result.success) {
  console.error(result.error)
  // Check electron logs in userData/logs/
}
```

## Future Enhancements

1. **Nexus Mods Integration** - Support for Nexus Mods API
2. **Load Order Management** - LOOT integration for automatic ordering
3. **Mod Dependencies** - Automatic dependency resolution
4. **Update Checking** - Auto-check for mod updates
5. **Conflict Resolution** - Automated conflict detection and suggestions
6. **Multi-Threading** - Parallel operations for large installations
7. **Cloud Sync** - Sync mods across devices
8. **Modpack Support** - Bundle and share mod collections
