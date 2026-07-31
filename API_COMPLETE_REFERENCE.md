# Y-Core Mod Manager - Complete API Reference

**Version:** 1.0  
**Last Updated:** 2026-07-29  
**Platform:** Electron IPC + Node.js Services

---

## Table of Contents

1. [Overview](#overview)
2. [Communication Protocol](#communication-protocol)
3. [Search & Discovery Channels](#search--discovery-channels)
4. [Installation Channels](#installation-channels)
5. [Security & Backup Channels](#security--backup-channels)
6. [Query & Statistics Channels](#query--statistics-channels)
7. [Cache Management](#cache-management)
8. [Error Handling & Retry](#error-handling--retry)
9. [Rate Limiting & Throttling](#rate-limiting--throttling)
10. [Batch Operations](#batch-operations)
11. [Progress Events](#progress-events)
12. [Complete Examples](#complete-examples)

---

## Overview

### IPC Channel Architecture

Y-Core uses **18 Electron IPC channels** to communicate between:
- **Renderer Process** (React UI)
- **Main Process** (Services, Database, Security)

```
┌─────────────────────┐
│    React UI         │
│  (Renderer Process) │
└──────────┬──────────┘
           │
           │ ipcRenderer.invoke('mods:*')
           ↓
┌──────────────────────────────────────────────┐
│         IPC Message Queue (async)            │
└──────────────────────┬───────────────────────┘
                       │
                       ↓
        ┌──────────────────────────────┐
        │    ipcMain.handle()          │
        │    Handler Functions         │
        └──────────────────┬───────────┘
                          │
        ┌─────────────────┼─────────────────┐
        │                 │                 │
        ↓                 ↓                 ↓
  SteamWorkshop     Mods Database      Mod Installer
   Service          Service             Service
   
   + VirusTotal API, YARA Scanner, Backup Manager
```

### 18 Channels Organized by Function

```
SEARCH & DISCOVERY (3)
  mods:search-catalog         Search Steam Workshop
  mods:get-details            Get single mod details
  mods:list-installed         List mods for game

INSTALLATION (5)
  mods:install                Download & install mod
  mods:uninstall              Remove mod completely
  mods:enable                 Enable mod (load order)
  mods:disable                Disable mod
  mods:cancel-install         Abort ongoing install

SECURITY & BACKUP (4)
  mods:scan-malware           Run security scan
  mods:get-backups            List backups for mod
  mods:restore-backup         Restore from backup
  mods:check-conflicts        Detect mod conflicts

QUERY & STATISTICS (4)
  mods:search-installed       Search local database
  mods:query-mods             Advanced filtering
  mods:get-statistics         Usage statistics
  mods:get-cache-stats        Cache performance metrics

CACHE MANAGEMENT (1)
  mods:clear-cache            Flush Steam API cache

PROGRESS EVENTS (sent, not invoked)
  mods:install-progress       Install progress updates
  mods:backup-progress        Backup progress updates
  mods:scan-progress          Scan progress updates
```

---

## Communication Protocol

### Request-Response Pattern

```typescript
// Renderer process (React component)
const response = await ipcRenderer.invoke('mods:channel-name', param1, param2);

// Response structure
{
  success: boolean,
  data?: any,        // If successful
  error?: string     // If failed
}
```

### Handler Implementation

```typescript
// Main process (electron/handlers/mods.handler.ts)
async function handleChannelName(
  event: any,
  param1: Type1,
  param2: Type2
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    // Call service
    const result = await service.method(param1, param2);
    
    // Return success
    return {
      success: true,
      data: result
    };
  } catch (err: any) {
    // Return error
    logger.error(`Channel failed: ${err.message}`);
    return {
      success: false,
      error: err.message
    };
  }
}

// Register handler
ipcMain.handle('mods:channel-name', handleChannelName);
```

### Timeout Behavior

```typescript
// Default timeout: 30 seconds
const response = await ipcRenderer.invoke('mods:channel', param);

// If handler takes > 30s:
// Error: "ipcRenderer.invoke() timed out"

// Extend timeout (internal, not exposed to renderer)
// Handlers that take long should:
// 1. Return early with progress event
// 2. Use background processing
// 3. Emit progress updates via send()
```

---

## Search & Discovery Channels

### Channel 1: mods:search-catalog

**Purpose:** Search Steam Workshop for mods

**Handler Location:** `electron/handlers/mods.handler.ts:handleSearchCatalog`

**Signature:**
```typescript
// Renderer
const result = await ipcRenderer.invoke('mods:search-catalog', query);

// Type definitions
interface ModSearchQuery {
  gameAppId: string;
  search?: string;
  tags?: string[];
  sort?: 'trending' | 'newest' | 'most_subscribed' | 'top_rated' | 'alphabetical';
  order?: 'asc' | 'desc';
  limit?: number;      // Default: 50, Max: 1000
  offset?: number;     // Default: 0, for pagination
  author?: string;     // Optional filter
  minScore?: number;   // Only mods with score >= minScore
}

interface ModSearchResult {
  query: ModSearchQuery;
  mods: SteamModDetails[];  // Array of mod objects
  total: number;            // Total results available
  hasMore: boolean;         // More results available?
  searchTime: number;       // Query time in milliseconds
}

interface ResponseType {
  success: boolean;
  data?: ModSearchResult;
  error?: string;
}
```

**Parameters:**
| Param | Type | Required | Notes |
|-------|------|----------|-------|
| gameAppId | string | Yes | Steam App ID (e.g., "570" for Dota 2) |
| search | string | No | Keywords to search |
| tags | string[] | No | Filter by tags |
| sort | string | No | Sort order |
| order | string | No | asc or desc |
| limit | number | No | Results per page (1-1000) |
| offset | number | No | Pagination offset |
| author | string | No | Filter by creator |
| minScore | number | No | Minimum rating score |

**Return Type:**
```typescript
{
  success: true,
  data: {
    query: {...},
    mods: [
      {
        id: "123456789",
        fileId: "123456789",
        title: "Anime Heroes Mod Pack",
        description: "Replaces hero portraits...",
        author: "CustomModCreator",
        authorId: "76561198000000000",
        createdAt: 1690000000000,
        updatedAt: 1690500000000,
        fileSize: 524288000,
        fileUrl: "https://steamcdn.com/...",
        previewUrl: "https://steam.com/...",
        tags: ["heroes", "cosmetic", "anime"],
        votesUp: 5234,
        votesDown: 12,
        score: 0.998,
        visibility: "public"
      },
      // ... more mods
    ],
    total: 5234,
    hasMore: true,
    searchTime: 234
  }
}
```

**Error Cases:**
```typescript
// Network error
{ success: false, error: "Network request failed" }

// Invalid game App ID
{ success: false, error: "Game not found" }

// Rate limited
{ success: false, error: "API rate limit exceeded. Wait 1 minute." }

// Invalid sort parameter
{ success: false, error: "Invalid sort parameter: 'invalid_sort'" }
```

**Usage Example:**
```typescript
// React component
async function searchMods(query: string) {
  const result = await ipcRenderer.invoke('mods:search-catalog', {
    gameAppId: '570',  // Dota 2
    search: query,
    limit: 50,
    offset: 0,
    sort: 'top_rated',
    minScore: 0.8
  });
  
  if (result.success) {
    console.log(`Found ${result.data.total} mods in ${result.data.searchTime}ms`);
    return result.data.mods;
  } else {
    throw new Error(result.error);
  }
}
```

**Performance:**
- Cold query: 500-2000ms
- Cached query: <50ms
- Cache TTL: 1 hour

---

### Channel 2: mods:get-details

**Purpose:** Get detailed information about a single mod

**Signature:**
```typescript
const result = await ipcRenderer.invoke('mods:get-details', fileId);

interface Response {
  success: boolean;
  data?: SteamModDetails;
  error?: string;
}
```

**Parameters:**
| Param | Type | Required | Notes |
|-------|------|----------|-------|
| fileId | string | Yes | Steam Workshop file ID |

**Return Type:**
```typescript
{
  success: true,
  data: {
    id: "123456789",
    fileId: "123456789",
    title: "Anime Heroes Mod Pack",
    description: "Full description with HTML tags...",
    author: "CustomModCreator",
    authorId: "76561198000000000",
    createdAt: 1690000000000,
    updatedAt: 1690500000000,
    fileSize: 524288000,
    fileUrl: "https://steamcdn.com/...",
    previewUrl: "https://steam.com/...",
    tags: ["heroes", "cosmetic", "anime"],
    votesUp: 5234,
    votesDown: 12,
    score: 0.998,
    downloadCount: 123456,
    subscriptionCount: 98765,
    favoriteCount: 54321,
    visibility: "public"
  }
}
```

**Error Cases:**
```typescript
// Mod not found
{ success: false, error: "Mod not found" }

// Invalid file ID
{ success: false, error: "Invalid file ID format" }
```

**Usage Example:**
```typescript
// Get details before installation
async function getModInfo(fileId: string) {
  const result = await ipcRenderer.invoke('mods:get-details', fileId);
  
  if (result.success) {
    return result.data;
  } else {
    console.error(result.error);
    return null;
  }
}
```

**Performance:**
- Cache hit: <20ms
- Cache miss: 100-300ms
- Cache duration: 1 hour

---

### Channel 3: mods:list-installed

**Purpose:** List all installed mods for a game

**Signature:**
```typescript
const result = await ipcRenderer.invoke('mods:list-installed', gameAppId);

interface Response {
  success: boolean;
  data?: ModInfo[];
  error?: string;
}
```

**Parameters:**
| Param | Type | Required | Notes |
|-------|------|----------|-------|
| gameAppId | string | Yes | Steam App ID |

**Return Type:**
```typescript
{
  success: true,
  data: [
    {
      id: "mod-1690000000-a1b2c3d4",
      gameAppId: "570",
      gameTitle: "Dota 2",
      title: "Anime Heroes Mod Pack",
      author: "CustomModCreator",
      description: "...",
      version: "2.1.0",
      status: "installed",
      source: "steam_workshop",
      installPath: "/opt/games/dota2/mods/anime-heroes/",
      fileSize: 524288000,
      fileUrl: "https://...",
      previewUrl: "https://...",
      tags: ["heroes", "cosmetic"],
      dependencies: ["mod-core-lib"],
      loadOrder: 10,
      enabled: true,
      installedAt: 1690000000000,
      lastUpdatedAt: 1690500000000,
      lastEnabledAt: 1690500000000,
      compatibleVersions: ["7.32", "7.33"],
      requiredDependencies: ["mod-core-lib"]
    },
    // ... more mods
  ]
}
```

**Performance:**
- Query time: 50-100ms
- Uses index: idx_installed_mods_gameAppId

---

## Installation Channels

### Channel 4: mods:install

**Purpose:** Download, scan, and install a mod

**Signature:**
```typescript
const result = await ipcRenderer.invoke(
  'mods:install',
  modDetails,
  options
);

interface ModInstallOptions {
  modId: string;
  gameAppId: string;
  installDir: string;
  createBackup: boolean;
  scanForMalware: boolean;
  overwrite: boolean;
  priority?: 'low' | 'normal' | 'high';
  enableAfterInstall?: boolean;
}

interface ModInstallResult {
  success: boolean;
  modId: string;
  modInfo?: ModInfo;
  backupId?: string;
  warnings: string[];
  error?: string;
  duration: number;
}

interface Response {
  success: boolean;
  data?: ModInstallResult;
  error?: string;
}
```

**Parameters:**
| Param | Type | Required | Notes |
|-------|------|----------|-------|
| modDetails | SteamModDetails | Yes | From get-details |
| options | ModInstallOptions | Yes | Installation configuration |

**Return Type:**
```typescript
{
  success: true,
  data: {
    success: true,
    modId: "mod-1690000000-a1b2c3d4",
    modInfo: {...},
    backupId: "backup-1690000000-a1b2c3d4",
    warnings: ["Warning: mod requires manual configuration"],
    error: null,
    duration: 45000  // 45 seconds
  }
}
```

**Progress Events:**

During installation, listen for progress events:

```typescript
// In component
ipcRenderer.on('mods:install-progress', (event, progress) => {
  console.log(`${progress.stage}: ${progress.progress}%`);
});

// Progress object
{
  modId: "mod-123",
  stage: "download" | "extract" | "scan" | "install" | "cleanup",
  progress: 0,  // 0-100
  speed: 52428800,  // bytes/second
  eta: 30,  // seconds remaining
  bytesTransferred: 262144000,
  totalBytes: 524288000,
  currentFile: "mod_data.zip",
  status: "in_progress",
  error: null,
  warnings: []
}
```

**Installation Stages:**
1. **backup** (0-20%): Create backup if enabled
2. **download** (20-40%): Download mod from Steam
3. **extract** (40-60%): Extract archive
4. **scan** (60-80%): Run malware scan
5. **install** (80-95%): Copy files to game directory
6. **cleanup** (95-100%): Final cleanup

**Error Cases:**
```typescript
// Insufficient disk space
{
  success: false,
  error: "No space left on device (need 500MB, have 100MB)"
}

// Malware detected
{
  success: false,
  error: "Malware detected: suspicious.exe (DANGEROUS)"
}

// Already installed
{
  success: false,
  error: "Mod already installed (file ID 123 exists)"
}

// Network error
{
  success: false,
  error: "Download failed after 3 retries"
}
```

**Usage Example:**
```typescript
// React component
async function installMod(modDetails) {
  // Set up progress listener
  const unsubscribe = ipcRenderer.on('mods:install-progress', (event, p) => {
    setProgress(p);
  });
  
  // Start installation
  const result = await ipcRenderer.invoke('mods:install', modDetails, {
    modId: modDetails.id,
    gameAppId: '570',
    installDir: '/opt/games/dota2/mods/',
    createBackup: true,
    scanForMalware: true,
    overwrite: false,
    enableAfterInstall: true
  });
  
  // Clean up listener
  unsubscribe();
  
  if (result.success && result.data.success) {
    console.log('Installation complete');
    return result.data;
  } else {
    throw new Error(result.error || result.data.error);
  }
}
```

**Performance:**
- Typical installation: 30-300 seconds
- Variables: mod size, disk speed, network
- Can be cancelled via mods:cancel-install

---

### Channel 5: mods:uninstall

**Purpose:** Remove a mod completely

**Signature:**
```typescript
const result = await ipcRenderer.invoke('mods:uninstall', options);

interface ModUninstallOptions {
  modId: string;
  gameAppId: string;
  keepBackup: boolean;      // Create backup before uninstall
  clearDependents: boolean; // Also uninstall mods that depend on this
}

interface ModUninstallResult {
  success: boolean;
  modId: string;
  backupId?: string;
  affectedMods: string[];   // Mods that were also uninstalled
  error?: string;
  duration: number;
}
```

**Return Type:**
```typescript
{
  success: true,
  data: {
    success: true,
    modId: "mod-123",
    backupId: "backup-1690000000-a1b2c3d4",
    affectedMods: ["mod-456", "mod-789"],  // Dependencies
    error: null,
    duration: 5000
  }
}
```

**Usage Example:**
```typescript
async function uninstallMod(modId: string, gameAppId: string) {
  const result = await ipcRenderer.invoke('mods:uninstall', {
    modId,
    gameAppId,
    keepBackup: true,
    clearDependents: true
  });
  
  if (result.success && result.data.success) {
    console.log(`Uninstalled: ${result.data.modId}`);
    if (result.data.affectedMods.length > 0) {
      console.log(`Also uninstalled dependents: ${result.data.affectedMods}`);
    }
  }
}
```

---

### Channel 6: mods:enable

**Purpose:** Enable a disabled mod

**Signature:**
```typescript
const result = await ipcRenderer.invoke('mods:enable', modId);

interface Response {
  success: boolean;
  error?: string;
}
```

**Return Type:**
```typescript
{ success: true }
```

**Usage Example:**
```typescript
async function enableMod(modId: string) {
  const result = await ipcRenderer.invoke('mods:enable', modId);
  if (result.success) {
    console.log('Mod enabled');
  } else {
    console.error(result.error);
  }
}
```

---

### Channel 7: mods:disable

**Purpose:** Disable an enabled mod

**Signature:**
```typescript
const result = await ipcRenderer.invoke('mods:disable', modId);

interface Response {
  success: boolean;
  error?: string;
}
```

---

### Channel 8: mods:cancel-install

**Purpose:** Cancel an ongoing installation

**Signature:**
```typescript
const result = await ipcRenderer.invoke('mods:cancel-install', modId);

interface Response {
  success: boolean;
  error?: string;
}
```

**Notes:**
- Stops download immediately
- Cleans up temporary files
- Restores backup if available

---

## Security & Backup Channels

### Channel 9: mods:scan-malware

**Purpose:** Run malware scan on mod files

**Signature:**
```typescript
const result = await ipcRenderer.invoke('mods:scan-malware', options);

interface ModScanOptions {
  modId: string;
  filePaths: string[];
  deepScan?: boolean;       // Use all tiers vs. quick check
  updateVirusTotal?: boolean; // Force VirusTotal check
}

interface ModScanResult {
  modId: string;
  timestamp: number;
  overallStatus: MalwareScanStatus;  // clean, suspicious, quarantined
  filesScanned: number;
  filesQuarantined: number;
  duration: number;
  details: {
    filePath: string;
    status: MalwareScanStatus;
    threat?: string;
    confidence?: number;
  }[];
  recommendation: 'safe' | 'quarantine' | 'delete';
}
```

**Return Type:**
```typescript
{
  success: true,
  data: {
    modId: "mod-123",
    timestamp: 1690000000000,
    overallStatus: "clean",
    filesScanned: 4521,
    filesQuarantined: 0,
    duration: 2345,
    details: [
      {
        filePath: "/path/to/mod_data.zip",
        status: "clean",
        threat: null,
        confidence: 1.0
      }
    ],
    recommendation: "safe"
  }
}
```

**4-Tier Scanning:**
```
Tier 1: Extension check (<10ms)
  - Detect .exe, .dll, .sys (blocked extensions)
  - Detect double extensions (.txt.exe)
  
Tier 2: PE header analysis (30-50ms)
  - Check for packed executables
  - Analyze imports for code injection APIs
  - Calculate entropy
  
Tier 3: VirusTotal (500ms or cached <100ms)
  - Query 70+ antivirus engines
  - Cache results (7 days)
  
Tier 4: YARA rules (100-500ms)
  - Match against community malware rules
  - Requires YARA binary installed (optional)
```

**Performance:**
- Quick scan: 100-500ms
- Deep scan: 1000-5000ms
- Cache hits: <100ms

---

### Channel 10: mods:get-backups

**Purpose:** List all backups for a mod

**Signature:**
```typescript
const result = await ipcRenderer.invoke('mods:get-backups', modId);

interface Response {
  success: boolean;
  data?: BackupInfo[];
  error?: string;
}

interface BackupInfo {
  id: string;
  modId: string;
  gameAppId: string;
  timestamp: number;
  status: BackupStatus;
  size: number;              // Apparent size
  path: string;
  createdBy: 'manual' | 'auto' | 'before_update';
  notes?: string;
  integrity: {
    fileCount: number;
    checksumValid: boolean;
    lastVerified?: number;
  };
  expiresAt?: number;
}
```

**Return Type:**
```typescript
{
  success: true,
  data: [
    {
      id: "backup-1690100000-e5f6g7h8",
      modId: "mod-123",
      gameAppId: "570",
      timestamp: 1690100000000,
      status: "completed",
      size: 524288000,
      path: "/backups/backup-id/",
      createdBy: "auto",
      notes: "Before update to v2.1.0",
      integrity: {
        fileCount: 4521,
        checksumValid: true,
        lastVerified: 1690200000000
      },
      expiresAt: 1691000000000
    }
  ]
}
```

---

### Channel 11: mods:restore-backup

**Purpose:** Restore mod from backup

**Signature:**
```typescript
const result = await ipcRenderer.invoke('mods:restore-backup', payload);

interface RestorePayload {
  backupId: string;
  modId: string;
  installPath: string;
}

interface Response {
  success: boolean;
  error?: string;
}
```

**Progress Events:**
```typescript
ipcRenderer.on('mods:backup-progress', (event, progress) => {
  // progress: { stage: 'restoring', percentage: 50, ... }
});
```

---

### Channel 12: mods:check-conflicts

**Purpose:** Detect mod dependency conflicts

**Signature:**
```typescript
const result = await ipcRenderer.invoke('mods:check-conflicts', gameAppId);

interface ConflictCheckResult {
  hasConflicts: boolean;
  conflicts: ModConflict[];
  warnings: string[];
}

interface ModConflict {
  modIds: string[];
  type: 'file_conflict' | 'dependency_conflict' | 'version_conflict';
  severity: 'warning' | 'error';
  description: string;
  resolution?: string;
}

interface Response {
  success: boolean;
  data?: ConflictCheckResult;
  error?: string;
}
```

**Return Type:**
```typescript
{
  success: true,
  data: {
    hasConflicts: true,
    conflicts: [
      {
        modIds: ["mod-123", "mod-456"],
        type: "dependency_conflict",
        severity: "warning",
        description: "Both mods depend on core-lib v1.0",
        resolution: "Ensure core-lib is installed and enabled"
      }
    ],
    warnings: ["Mod mod-789 is marked as incompatible"]
  }
}
```

---

## Query & Statistics Channels

### Channel 13: mods:search-installed

**Purpose:** Search local installed mods

**Signature:**
```typescript
const result = await ipcRenderer.invoke(
  'mods:search-installed',
  query,
  gameAppId
);

interface Response {
  success: boolean;
  data?: ModInfo[];
  error?: string;
}
```

**Parameters:**
| Param | Type | Required | Notes |
|-------|------|----------|-------|
| query | string | Yes | Search keywords |
| gameAppId | string | No | Filter by game |

**Performance:**
- Query time: 50-200ms
- Uses full-text search if available

---

### Channel 14: mods:query-mods

**Purpose:** Advanced mod queries with filters

**Signature:**
```typescript
const result = await ipcRenderer.invoke(
  'mods:query-mods',
  gameAppId,
  filters
);

interface ModFilters {
  status?: ModStatus[];
  enabled?: boolean;
  source?: ModSourceType[];
  minScore?: number;
  maxScore?: number;
  tags?: string[];
  sort?: 'title' | 'installedAt' | 'fileSize' | 'status';
  order?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

interface ModQueryResult {
  mods: ModInfo[];
  total: number;
  hasMore: boolean;
  offset: number;
  limit: number;
}

interface Response {
  success: boolean;
  data?: ModQueryResult;
  error?: string;
}
```

**Example:**
```typescript
const result = await ipcRenderer.invoke('mods:query-mods', '570', {
  status: ['installed', 'enabled'],
  enabled: true,
  sort: 'installedAt',
  order: 'desc',
  limit: 20,
  offset: 0
});
```

---

### Channel 15: mods:get-statistics

**Purpose:** Get mod statistics for a game

**Signature:**
```typescript
const result = await ipcRenderer.invoke('mods:get-statistics', gameAppId);

interface ModStatistics {
  totalMods: number;
  enabledMods: number;
  disabledMods: number;
  totalBackups: number;
  backupSize: number;      // Total bytes
  lastScan: number;        // Timestamp
  scanStatus: MalwareScanStatus;
  conflicts: number;
}

interface Response {
  success: boolean;
  data?: ModStatistics;
  error?: string;
}
```

**Return Type:**
```typescript
{
  success: true,
  data: {
    totalMods: 47,
    enabledMods: 42,
    disabledMods: 5,
    totalBackups: 156,
    backupSize: 78963776000,  // ~80 GB
    lastScan: 1690500000000,
    scanStatus: "clean",
    conflicts: 0
  }
}
```

---

### Channel 16: mods:get-cache-stats

**Purpose:** Get cache performance metrics

**Signature:**
```typescript
const result = await ipcRenderer.invoke('mods:get-cache-stats');

interface CacheStats {
  entriesCount: number;
  cacheSize: number;        // Bytes
  oldestEntryAge: number;   // Milliseconds
  newestEntryAge: number;   // Milliseconds
  hitRate: number;          // 0-1
}

interface Response {
  success: boolean;
  data?: {
    hitRate: number;
    entriesCount: number;
    cacheSize: number;
    oldestEntryAge: number;
    newestEntryAge: number;
  };
  error?: string;
}
```

**Return Type:**
```typescript
{
  success: true,
  data: {
    hitRate: 0.87,
    entriesCount: 234,
    cacheSize: 5242880,    // 5 MB
    oldestEntryAge: 3600000,
    newestEntryAge: 120000
  }
}
```

---

## Cache Management

### Channel 17: mods:clear-cache

**Purpose:** Clear Steam Workshop API cache

**Signature:**
```typescript
const result = await ipcRenderer.invoke('mods:clear-cache');

interface Response {
  success: boolean;
  error?: string;
}
```

**Return Type:**
```typescript
{ success: true }
```

**Usage Example:**
```typescript
async function clearCache() {
  const result = await ipcRenderer.invoke('mods:clear-cache');
  if (result.success) {
    console.log('Cache cleared. Next search will hit API.');
  }
}
```

**Cache Behavior:**
- TTL: 1 hour (default)
- Max size: 50 MB (default)
- Cleared on: user request or app restart
- Includes: search results, mod details, stats

---

## Error Handling & Retry

### Common Error Codes

```typescript
enum ErrorCode {
  NETWORK_ERROR = 'NETWORK_ERROR',
  NOT_FOUND = 'NOT_FOUND',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  DISK_FULL = 'DISK_FULL',
  MALWARE_DETECTED = 'MALWARE_DETECTED',
  INVALID_PARAMS = 'INVALID_PARAMS',
  TIMEOUT = 'TIMEOUT',
  RATE_LIMITED = 'RATE_LIMITED',
  DB_ERROR = 'DB_ERROR',
  UNKNOWN = 'UNKNOWN'
}
```

### Retry Strategy

```typescript
// Exponential backoff retry
async function invokeWithRetry(
  channel: string,
  params: any,
  maxRetries: number = 3
): Promise<any> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await ipcRenderer.invoke(channel, params);
    } catch (error) {
      if (attempt === maxRetries - 1) throw error;
      
      // Wait before retry: 1s, 2s, 4s
      const delay = 1000 * Math.pow(2, attempt);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

// Usage
const result = await invokeWithRetry('mods:search-catalog', {
  gameAppId: '570',
  search: 'hero mod'
});
```

### Error Handling Pattern

```typescript
// React component error handling
try {
  const result = await ipcRenderer.invoke('mods:install', details, options);
  
  if (!result.success) {
    // IPC call succeeded but operation failed
    if (result.error.includes('space')) {
      // Handle disk full
      showDialog('Not enough disk space');
    } else if (result.error.includes('malware')) {
      // Handle malware
      showDialog('Malware detected! Installation blocked.');
    } else {
      // Generic error
      showDialog(result.error);
    }
    return;
  }
  
  // Success
  showDialog(`Installation complete: ${result.data.modId}`);
  
} catch (err) {
  // IPC call failed (timeout, renderer crashed, etc.)
  console.error('IPC error:', err);
  showDialog('Installation failed. Please try again.');
}
```

---

## Rate Limiting & Throttling

### API Rate Limits

```
Steam Workshop API:
  - 4 requests per second (per API key)
  - 100 requests per minute
  - Automatic throttling when exceeded

VirusTotal API (Free Tier):
  - 4 requests per minute
  - 500 per day
  - Cache results to avoid repeated queries

Local Database:
  - No limit (SQLite)
  - Concurrent queries: 3 (default)
  - Timeout: 5 seconds
```

### Request Queuing

```typescript
// Built-in queue for API calls
class RequestQueue {
  private queue: Request[] = [];
  private inFlight = 0;
  private maxConcurrent = 4;
  private interval = 1000;  // 1 second
  
  async add(req: Request): Promise<any> {
    return new Promise((resolve, reject) => {
      this.queue.push({ ...req, resolve, reject });
      this.process();
    });
  }
  
  private process() {
    if (this.inFlight >= this.maxConcurrent || this.queue.length === 0) {
      return;
    }
    
    const req = this.queue.shift();
    this.inFlight++;
    
    setTimeout(() => {
      req.fn()
        .then(req.resolve)
        .catch(req.reject)
        .finally(() => {
          this.inFlight--;
          this.process();
        });
    }, this.interval / this.maxConcurrent);
  }
}
```

---

## Batch Operations

### Batch Install

```typescript
// Install multiple mods sequentially
async function installBatch(
  mods: SteamModDetails[],
  options: ModInstallOptions
): Promise<ModInstallResult[]> {
  const results: ModInstallResult[] = [];
  
  for (const mod of mods) {
    try {
      const result = await ipcRenderer.invoke('mods:install', mod, options);
      
      if (result.success && result.data.success) {
        results.push(result.data);
        console.log(`✓ Installed: ${mod.title}`);
      } else {
        console.error(`✗ Failed: ${mod.title} - ${result.error}`);
        results.push({
          success: false,
          modId: mod.id,
          error: result.error,
          duration: 0
        });
      }
    } catch (err) {
      console.error(`✗ Error: ${mod.title}`, err);
      results.push({
        success: false,
        modId: mod.id,
        error: err.message,
        duration: 0
      });
    }
    
    // Stagger installations
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  return results;
}

// Usage
const mods = await searchMods('hero mod');
const results = await installBatch(mods.slice(0, 3), {
  gameAppId: '570',
  installDir: '/games/dota2/mods/',
  createBackup: true,
  scanForMalware: true
});
```

### Batch Uninstall

```typescript
// Uninstall multiple mods in reverse dependency order
async function uninstallBatch(modIds: string[]): Promise<void> {
  for (const modId of modIds) {
    const result = await ipcRenderer.invoke('mods:uninstall', {
      modId,
      gameAppId: '570',
      keepBackup: true,
      clearDependents: false
    });
    
    if (result.success) {
      console.log(`✓ Uninstalled: ${modId}`);
    } else {
      console.error(`✗ Failed: ${modId} - ${result.error}`);
    }
  }
}
```

---

## Progress Events

### Event Types

```typescript
// Install progress
ipcRenderer.on('mods:install-progress', (event, progress) => {
  interface InstallProgress {
    modId: string;
    stage: 'backup' | 'download' | 'extract' | 'scan' | 'install' | 'cleanup';
    progress: number;        // 0-100
    speed: number;           // bytes/second
    eta: number;             // seconds remaining
    bytesTransferred: number;
    totalBytes: number;
    currentFile?: string;
    status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled';
    error?: string;
    warnings: string[];
  }
});

// Backup progress
ipcRenderer.on('mods:backup-progress', (event, progress) => {
  interface BackupProgress {
    operation: 'creating' | 'restoring' | 'verifying' | 'deleting';
    percentage: number;       // 0-100
    filesProcessed: number;
    totalFiles: number;
    currentFile?: string;
    bytesProcessed: number;
    totalBytes: number;
    estimatedTimeRemaining?: number;
    status: string;
  }
});

// Scan progress
ipcRenderer.on('mods:scan-progress', (event, progress) => {
  interface ScanProgress {
    filePath: string;
    currentTier: 'extension' | 'pe_header' | 'virus_total' | 'yara';
    progress: number;        // 0-100
    filesScanned: number;
    totalFiles: number;
  }
});
```

### Usage Example

```typescript
// React component with progress
function ModInstaller() {
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState('pending');
  
  useEffect(() => {
    const unsubscribe = ipcRenderer.on('mods:install-progress', (event, p) => {
      setProgress(p.progress);
      setStage(p.stage);
    });
    
    return () => unsubscribe();
  }, []);
  
  return (
    <ProgressBar
      value={progress}
      label={`${stage.toUpperCase()}: ${progress}%`}
    />
  );
}
```

---

## Complete Examples

### Example 1: Search and Install Flow

```typescript
// Full workflow: search → get details → install → verify

async function completeInstallFlow() {
  // Step 1: Search for mods
  console.log('🔍 Searching for mods...');
  const searchResult = await ipcRenderer.invoke('mods:search-catalog', {
    gameAppId: '570',
    search: 'hero skins',
    limit: 10,
    sort: 'top_rated'
  });
  
  if (!searchResult.success) {
    throw new Error(searchResult.error);
  }
  
  console.log(`Found ${searchResult.data.total} mods`);
  const firstMod = searchResult.data.mods[0];
  
  // Step 2: Get detailed info
  console.log(`📋 Getting details for "${firstMod.title}"...`);
  const detailsResult = await ipcRenderer.invoke(
    'mods:get-details',
    firstMod.fileId
  );
  
  if (!detailsResult.success) {
    throw new Error(detailsResult.error);
  }
  
  const modDetails = detailsResult.data;
  console.log(`👤 Author: ${modDetails.author}`);
  console.log(`⭐ Score: ${modDetails.score}`);
  console.log(`💾 Size: ${formatBytes(modDetails.fileSize)}`);
  
  // Step 3: Check for conflicts
  console.log('🔗 Checking for conflicts...');
  const conflictResult = await ipcRenderer.invoke('mods:check-conflicts', '570');
  
  if (conflictResult.success && conflictResult.data.hasConflicts) {
    console.warn('⚠️  Conflicts detected:');
    for (const conflict of conflictResult.data.conflicts) {
      console.warn(`  - ${conflict.description}`);
    }
  }
  
  // Step 4: Install mod
  console.log('⬇️  Installing mod...');
  
  return new Promise((resolve, reject) => {
    // Listen for progress
    const unsubscribe = ipcRenderer.on('mods:install-progress', (event, p) => {
      const bar = '█'.repeat(Math.floor(p.progress / 5)) + '░'.repeat(20 - Math.floor(p.progress / 5));
      console.log(`[${bar}] ${p.stage} (${p.progress}%)`);
      
      if (p.eta) {
        console.log(`   ETA: ${p.eta}s remaining`);
      }
    });
    
    // Start installation
    ipcRenderer.invoke('mods:install', modDetails, {
      modId: modDetails.id,
      gameAppId: '570',
      installDir: '/games/dota2/mods/',
      createBackup: true,
      scanForMalware: true,
      overwrite: false,
      enableAfterInstall: true
    }).then(result => {
      unsubscribe();
      
      if (!result.success || !result.data.success) {
        reject(new Error(result.error || result.data.error));
        return;
      }
      
      console.log(`✅ Installation complete in ${result.data.duration}ms`);
      console.log(`📦 Backup ID: ${result.data.backupId}`);
      
      // Step 5: Verify installation
      ipcRenderer.invoke('mods:list-installed', '570').then(listResult => {
        const installed = listResult.data.find(m => m.id === result.data.modId);
        if (installed) {
          console.log(`✓ Verified installed: ${installed.title}`);
          resolve(result.data);
        } else {
          reject(new Error('Verification failed: mod not found in installed list'));
        }
      }).catch(reject);
    }).catch(reject);
  });
}

// Run example
completeInstallFlow()
  .then(result => console.log('🎉 Success!', result))
  .catch(err => console.error('❌ Failed:', err.message));
```

### Example 2: Backup and Restore

```typescript
// Backup mod before update, then restore if needed

async function backupAndUpdate(modId: string) {
  // Step 1: Get current backups
  console.log('📋 Checking existing backups...');
  const backupsResult = await ipcRenderer.invoke('mods:get-backups', modId);
  
  if (!backupsResult.success) {
    throw new Error('Failed to get backups');
  }
  
  console.log(`Found ${backupsResult.data.length} existing backups`);
  
  // Step 2: Trigger backup before update
  console.log('💾 Creating pre-update backup...');
  
  const backupResult = await new Promise((resolve, reject) => {
    const unsubscribe = ipcRenderer.on('mods:backup-progress', (event, p) => {
      console.log(`Backing up: ${p.percentage}% (${p.filesProcessed}/${p.totalFiles})`);
    });
    
    // Note: backup is handled internally during install
    // This is a conceptual example
    resolve({ success: true, backupId: 'backup-123' });
  });
  
  console.log(`✓ Backup created: ${backupResult.backupId}`);
  
  // Step 3: Install update
  console.log('⬇️  Installing update...');
  const updateResult = await ipcRenderer.invoke('mods:install', modDetails, {
    modId,
    gameAppId: '570',
    installDir: '/games/dota2/mods/',
    createBackup: false,  // Already backed up
    overwrite: true
  });
  
  if (!updateResult.success) {
    console.error('❌ Update failed. Rolling back...');
    
    // Step 4: Restore from backup
    const restoreResult = await ipcRenderer.invoke('mods:restore-backup', {
      backupId: backupResult.backupId,
      modId,
      installPath: '/games/dota2/mods/'
    });
    
    if (restoreResult.success) {
      console.log('✓ Restored from backup');
    } else {
      console.error('❌ Restoration failed:', restoreResult.error);
    }
    
    throw new Error('Update failed and rolled back');
  }
  
  console.log('✅ Update successful');
}
```

### Example 3: Security Scan Dashboard

```typescript
// Get and display security status

async function showSecurityDashboard() {
  // Get all games
  const games = ['570', '230410'];  // Dota 2, Baldur's Gate 3
  
  for (const gameAppId of games) {
    console.log(`\n=== ${gameAppId} ===`);
    
    // Get statistics
    const statsResult = await ipcRenderer.invoke(
      'mods:get-statistics',
      gameAppId
    );
    
    if (!statsResult.success) continue;
    
    const stats = statsResult.data;
    console.log(`Total mods: ${stats.totalMods}`);
    console.log(`Enabled: ${stats.enabledMods}`);
    console.log(`Last scan: ${new Date(stats.lastScan).toLocaleString()}`);
    console.log(`Scan status: ${stats.scanStatus}`);
    console.log(`Conflicts: ${stats.conflicts}`);
    
    // Get list of installed mods
    const listResult = await ipcRenderer.invoke(
      'mods:list-installed',
      gameAppId
    );
    
    if (!listResult.success) continue;
    
    // Display security status of each
    console.log('\nMod Security Status:');
    for (const mod of listResult.data) {
      const icon = {
        'clean': '✓',
        'suspicious': '⚠️',
        'quarantined': '✗',
        'not_scanned': '?'
      }[mod.malwareScanStatus] || '?';
      
      console.log(`  ${icon} ${mod.title} [${mod.malwareScanStatus}]`);
    }
  }
  
  // Get cache stats
  const cacheResult = await ipcRenderer.invoke('mods:get-cache-stats');
  
  if (cacheResult.success) {
    const cache = cacheResult.data;
    console.log(`\nCache Performance:`);
    console.log(`  Hit rate: ${(cache.hitRate * 100).toFixed(1)}%`);
    console.log(`  Entries: ${cache.entriesCount}`);
    console.log(`  Size: ${formatBytes(cache.cacheSize)}`);
  }
}
```

---

## Best Practices

1. **Always check `success` flag** before accessing `data`
2. **Use `invokeWithRetry` for network calls** that might fail
3. **Handle progress events** for long-running operations
4. **Batch operations** when installing multiple mods
5. **Cache results locally** in React state to reduce IPC calls
6. **Clean up event listeners** in useEffect cleanup
7. **Log errors for debugging** but don't expose API keys
8. **Test with slow network** to ensure good UX
9. **Use TypeScript types** for type safety
10. **Monitor performance** with cache stats

---

**Document Version:** 1.0  
**Last Updated:** 2026-07-29  
**Status:** Complete API Reference - Ready for Development
