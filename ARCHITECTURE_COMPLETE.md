# Y-Core Mod Manager - Complete Architecture Documentation

**Version:** 1.0  
**Last Updated:** 2026-07-29  
**Status:** Complete Reference  

---

## Table of Contents

1. [System Overview](#system-overview)
2. [5-Layer Architecture](#5-layer-architecture)
3. [Component Breakdown](#component-breakdown)
4. [Data Flow Diagrams](#data-flow-diagrams)
5. [Design Patterns](#design-patterns)
6. [Concurrency & Thread Safety](#concurrency--thread-safety)
7. [Scaling Considerations](#scaling-considerations)
8. [Performance Characteristics](#performance-characteristics)

---

## System Overview

### What is Y-Core Mod Manager?

Y-Core Mod Manager is a comprehensive mod management system for games integrated with Steam Workshop. It provides:

- **Mod Discovery**: Search Steam Workshop for mods with advanced filtering
- **Installation Management**: Download, install, enable/disable mods with automatic backups
- **Security Scanning**: 4-tier malware detection system (Extensions, PE Headers, VirusTotal, YARA)
- **Backup System**: Hardlink-based deduplication for fast backups and rollback
- **Conflict Detection**: Identify mod dependency conflicts
- **Performance Monitoring**: Track cache hit rates, storage usage, and scan statistics

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     PRESENTATION LAYER (React UI)                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐  │
│  │  ModsPage    │  │  ModCard     │  │  MyModsView  │  │ModManagerPnl│  │
│  │  (Main View) │  │  (Catalog)   │  │ (Installed)  │  │(Dashboard)  │  │
│  └────────┬─────┘  └──────┬───────┘  └──────┬───────┘  └──────┬──────┘  │
│           │                │                 │                 │         │
└───────────┼────────────────┼─────────────────┼─────────────────┼─────────┘
            │                │                 │                 │
┌───────────┼────────────────┼─────────────────┼─────────────────┼─────────┐
│           ↓                ↓                 ↓                 ↓         │
│  IPC BRIDGE LAYER (18 Channels via Electron IPC)                        │
│                                                                          │
│  Search:  mods:search-catalog  mods:get-details  mods:list-installed   │
│  Install: mods:install  mods:uninstall  mods:enable  mods:disable      │
│  Security: mods:scan-malware  mods:get-backups  mods:restore-backup    │
│  Query:   mods:search-installed  mods:query-mods  mods:get-statistics  │
│  Cache:   mods:clear-cache  mods:get-cache-stats                       │
└──────────────────────────────────────┬───────────────────────────────────┘
                                       │
                    ┌──────────────────┼──────────────────┐
                    │                  │                  │
┌───────────────────▼──────────────────▼──────────────────▼──────────────┐
│              SERVICE LAYER (Business Logic)                             │
│  ┌────────────────────┐  ┌─────────────────┐  ┌──────────────────────┐ │
│  │Steam Workshop      │  │Mods Database    │  │Mod Installer Service │ │
│  │Service             │  │Service          │  │(Controller)          │ │
│  │- Search            │  │- CRUD ops       │  │- Install workflow    │ │
│  │- Get details       │  │- Queries        │  │- Uninstall workflow  │ │
│  │- Cache mgmt        │  │- Transactions   │  │- Enable/disable      │ │
│  └────────────────────┘  └─────────────────┘  └──────────────────────┘ │
│         ↓                        ↓                        ↓              │
└─────────┼────────────────────────┼────────────────────────┼──────────────┘
          │                        │                        │
┌─────────▼────────────┐  ┌────────▼────────────┐  ┌───────▼─────────────┐
│  SECURITY LAYER      │  │  BACKUP LAYER       │  │  STORAGE LAYER      │
├──────────────────────┤  ├─────────────────────┤  ├─────────────────────┤
│ Malware Scanner      │  │ Backup Manager      │  │ File System         │
│ ┌──────────────────┐ │  │ ┌─────────────────┐ │  │ ┌─────────────────┐ │
│ │Tier 1: Ext Check │ │  │ │FilesystemDetect │ │  │ │Mod installation │ │
│ │(<10ms)           │ │  │ │& Hardlink Tests │ │  │ │directories      │ │
│ ├──────────────────┤ │  │ ├─────────────────┤ │  │ ├─────────────────┤ │
│ │Tier 2: PE Header │ │  │ │BackupCreator    │ │  │ │Backup storage   │ │
│ │(30-50ms)         │ │  │ │- Hardlinks      │ │  │ │(hardlinks)      │ │
│ ├──────────────────┤ │  │ │- Full copy      │ │  │ ├─────────────────┤ │
│ │Tier 3: VirusTotal│ │  │ └─────────────────┘ │  │ │SQLite Database  │ │
│ │(500ms, cached)   │ │  │ BackupRestorer  │  │  │ │- Metadata       │ │
│ ├──────────────────┤ │  │ BackupCleaner   │  │  │ │- Backups info   │ │
│ │Tier 4: YARA Rules│ │  │ StorageStats    │  │  │ ├─────────────────┤ │
│ │(100-500ms)       │ │  │                 │  │  │ │Scanlog storage  │ │
│ └──────────────────┘ │  │ Features:       │  │  │ │& cache          │ │
│                      │  │ - Cross-platform│  │  │ └─────────────────┘ │
│ VirusTotal API       │  │ - Deduplication │  │  │                     │
│ YARA Rules binary    │  │ - Event streams │  │  │                     │
│ Event emission       │  │ - Retention mgmt│  │  │                     │
│                      │  └─────────────────┘  │  │                     │
└──────────────────────┘  └──────────────────────┘  └─────────────────────┘
```

---

## 5-Layer Architecture

### Layer 1: Presentation Layer (React UI)

**Location:** `src/components/mods/`, `src/pages/ModsPage.tsx`

**Responsibilities:**
- Render mod catalog and search results
- Display installed mods with enable/disable toggles
- Show backup history and restore options
- Progress indicators for installations
- Modal dialogs for mod details and security warnings

**Key Components:**

| Component | Purpose | State Management |
|-----------|---------|------------------|
| `ModsPage.tsx` | Main entry point for mod management | Zustand stores |
| `ModCard.tsx` | Individual mod card (catalog view) | Props + callbacks |
| `MyModsView.tsx` | Installed mods list | Local state + DB queries |
| `ModDetailsModal.tsx` | Mod details and installation | Modal state + API calls |
| `ModManagerPanel.tsx` | Dashboard with statistics | Real-time subscriptions |
| `ModsGrid.tsx` | Grid layout for mod cards | List state |

**State Management:**
```typescript
// Zustand stores (if used)
- useModStore: mod listings, filters, search
- useInstallQueueStore: active installations
- useBackupStore: backup history
- useSecurityStore: scan results
```

**Styling:**
- Tailwind CSS for responsive design
- Dark mode support via `@media (prefers-color-scheme: dark)`
- Loading states and error boundaries

---

### Layer 2: IPC Bridge Layer (Electron IPC)

**Location:** `electron/handlers/mods.handler.ts`

**18 IPC Channels** organized by feature:

#### Search & Discovery (3 channels)
```typescript
'mods:search-catalog'     // Query Steam Workshop
'mods:get-details'        // Get single mod details
'mods:list-installed'     // List mods for a game
```

#### Installation (5 channels)
```typescript
'mods:install'            // Download and install
'mods:uninstall'          // Remove mod completely
'mods:enable'             // Enable mod (load order)
'mods:disable'            // Disable mod
'mods:cancel-install'     // Abort ongoing install
```

#### Security & Backup (4 channels)
```typescript
'mods:scan-malware'       // Run security scan
'mods:get-backups'        // List backups for mod
'mods:restore-backup'     // Restore from backup
'mods:check-conflicts'    // Detect mod conflicts
```

#### Query & Statistics (4 channels)
```typescript
'mods:search-installed'   // Search local database
'mods:query-mods'         // Advanced filtering
'mods:get-statistics'     // Usage statistics
'mods:get-cache-stats'    // Cache performance metrics
```

#### Cache Management (1 channel)
```typescript
'mods:clear-cache'        // Flush Steam API cache
```

#### Progress Events (sent, not handlers)
```typescript
'mods:install-progress'   // Real-time install progress
```

**Handler Pattern:**
```typescript
async function handler(_event: any, param1: Type1, param2: Type2) {
  try {
    const result = await service.method(param1, param2)
    return { success: true, data: result }
  } catch (err) {
    return { success: false, error: err.message }
  }
}
```

---

### Layer 3: Service Layer (Business Logic)

**Location:** `electron/services/`

#### 3.1 Steam Workshop Service
**File:** `steam-workshop.service.ts`

```typescript
class SteamWorkshopService {
  // Search with pagination and filtering
  searchMods(query: ModSearchQuery): Promise<ModSearchResult>
  
  // Get single mod details (cached)
  getModDetails(fileId: string): Promise<SteamModDetails>
  
  // Cache management
  clearCache(): void
  getCacheStats(): CacheStats
  getCacheHitRate(): number
}
```

**Features:**
- LRU cache with TTL (default 1 hour)
- Rate limiting for API calls (4 req/sec)
- Fallback to cached data on network error
- Automatic cache expiration

#### 3.2 Mods Database Service
**File:** `mods-database.service.ts`

```typescript
class ModsDatabaseService {
  // CRUD operations
  addInstalledMod(modInfo: ModInfo): Promise<boolean>
  removeInstalledMod(modId: string): Promise<boolean>
  updateModStatus(modId: string, status: ModStatus): Promise<boolean>
  
  // Query operations
  getGameMods(gameAppId: string): Promise<ModInfo[]>
  getModById(modId: string): Promise<ModInfo | null>
  searchMods(query: string, gameAppId?: string): Promise<ModInfo[]>
  queryMods(gameAppId: string, filters: any): Promise<ModQueryResult>
  
  // Statistics
  getStatistics(gameAppId: string): Promise<ModStatistics>
  getModBackups(modId: string): Promise<BackupInfo[]>
  
  // Transactions
  beginTransaction(): Promise<void>
  commit(): Promise<void>
  rollback(): Promise<void>
}
```

**Database Connection Pool:**
- Busy timeout: 5 seconds
- WAL mode enabled for concurrent access
- Connection pooling via electron-sqlite3

#### 3.3 Mod Installer Service
**File:** `mod-installer.ts`

```typescript
class ModInstallerService {
  // Installation workflow
  async installMod(
    modDetails: SteamModDetails,
    options: ModInstallOptions,
    onProgress: ProgressCallback
  ): Promise<ModInstallResult>
  
  async uninstallMod(options: ModUninstallOptions): Promise<ModUninstallResult>
  
  // State management
  async enableMod(modId: string): Promise<boolean>
  async disableMod(modId: string): Promise<boolean>
  async restoreBackup(backupId: string, modId: string, installPath: string): Promise<boolean>
}
```

**Installation Workflow** (see Data Flow section below)

---

### Layer 4: Security Layer (Malware Scanner)

**Location:** `electron/modules/mod-security/malware-scanner.ts`

```typescript
export class MalwareScanner extends EventEmitter {
  constructor(config: Partial<MalwareScannerConfig>, logger?: any)
  
  // Scanning
  async scanFile(filePath: string): Promise<ScanResult>
  async scanDirectory(dirPath: string): Promise<DirectoryScans>
  
  // Configuration
  setVirusTotalKey(key: string): void
  updateConfig(config: Partial<MalwareScannerConfig>): void
  getConfig(): MalwareScannerConfig
  
  // Statistics & cache
  getScanStats(): ScanStatistics
  getCacheStats(): CacheStats
  clearCache(): void
  resetStats(): void
}
```

#### 4-Tier Scanning Strategy

**Tier 1: Extension Whitelist** (<10ms)
```
Input: File path
├─ Extract extension (.exe, .dll, .sys, .txt, etc.)
├─ Check against blacklist (dangerous: .exe, .dll, .sys, .bat, .scr)
├─ Check against whitelist (safe: .png, .jpg, .json, .lua)
├─ Detect double extensions (.txt.exe → BLOCKED)
└─ Output: severity (CLEAN, WARNING, BLOCKED)

Performance: < 10ms per file
Accuracy: Prevents obvious masquerading
Cost: Negligible
```

**Tier 2: PE Header Analysis** (30-50ms)
```
Input: File path (PE files only: .exe, .dll, .sys, .drv)
├─ Read file header
├─ Validate MZ signature (0x4D5A)
├─ Parse PE structure
├─ Detect packing:
│  ├─ Check for UPX sections
│  ├─ Calculate entropy of sections
│  └─ Flag high-entropy sections (>7.5)
├─ Analyze imports:
│  ├─ Check for code injection APIs
│  │  (CreateRemoteThread, WriteProcessMemory, VirtualAllocEx, etc.)
│  └─ Flag suspicious imports
└─ Output: severity (CLEAN, SUSPICIOUS, DANGEROUS)

Performance: 30-50ms per PE file
Accuracy: Detects packed/injected code
Cost: Moderate (binary parsing)
```

**Tier 3: VirusTotal API Integration** (500ms, cached <100ms)
```
Input: File path
├─ Compute SHA256 hash
├─ Check local cache (TTL: 7 days)
│  └─ Cache HIT: return cached result (<100ms)
├─ Cache MISS: Query VirusTotal API
│  ├─ GET /api/v3/files/{sha256}
│  ├─ Parse detection results
│  │  ├─ Count detections (engines)
│  │  ├─ Extract malware names
│  │  └─ Determine severity:
│  │     ├─ 5+ detections: DANGEROUS
│  │     ├─ 3-4 detections: SUSPICIOUS
│  │     ├─ 1-2 detections: WARNING
│  │     └─ 0 detections: CLEAN
│  └─ Cache result
└─ Output: detection count, malware names, severity

Performance: 
  - Cache hit: <100ms
  - Cache miss: 500-2000ms (rate limited)
Accuracy: Industry-standard (70+ AV engines)
Cost: API calls (free tier: 4 req/min)
Limitations:
  - File size limit: 650 MB
  - Rate limiting: 4 requests/minute (free)
```

**Tier 4: YARA Rules Scanning** (100-500ms)
```
Input: File path
├─ Check if YARA binary available
├─ Load YARA rules from file
├─ Execute: yara -r <rules> <file>
├─ Parse output:
│  ├─ Rule name
│  ├─ Categorize by type:
│  │  ├─ ransomware: DANGEROUS
│  │  ├─ trojan, loader, infostealer: SUSPICIOUS
│  │  ├─ dropper, worm: WARNING
│  │  └─ other: WARNING
│  └─ Assign severity
└─ Output: matched rules, malware types, severity

Performance: 100-500ms per file
Accuracy: High (custom/community rules)
Cost: None (local execution)
Requirement: YARA binary installed (optional)
```

#### Scanner Configuration
```typescript
interface MalwareScannerConfig {
  // Tier 1
  fileExtensionBlacklist: string[]  // .exe, .dll, .sys, .bat, .scr, .msi
  fileExtensionWhitelist: string[]  // .png, .jpg, .json, .lua, .txt, .md
  
  // Tier 2
  enablePEAnalysis: boolean
  blockDangerousFiles: boolean
  blockSuspiciousFiles: boolean
  
  // Tier 3
  enableVirusTotal: boolean
  virusTotalApiKey: string
  maxFileSizeForVT: number  // 650 MB
  cacheTTL: number  // 7 days
  
  // Tier 4
  enableYara: boolean
  yaraRulesPath: string
  
  // Logging
  logLevel: 'debug' | 'info' | 'warn' | 'error'
}
```

#### Example Scan Events
```typescript
scanner.on('scan-started', (event: ScanStartedEvent) => {
  console.log(`Scanning ${event.filePath} (${event.fileSize} bytes)`)
})

scanner.on('scan-progress', (event: ScanProgressEvent) => {
  console.log(`Tier ${event.currentTier}: ${event.progress}%`)
})

scanner.on('file-blocked', (event: FileBlockedEvent) => {
  console.error(`BLOCKED: ${event.filePath} - ${event.reason}`)
})

scanner.on('scan-completed', (event: ScanCompletedEvent) => {
  console.log(`Result: ${event.result.overallSeverity}`)
})
```

---

### Layer 5: Storage Layer (Backup System & Filesystem)

**Location:** `electron/modules/mod-manager/backup-manager.ts`

```typescript
export class BackupManager extends EventEmitter {
  async createBackup(
    gamePath: string,
    gameId: string,
    options?: CreateBackupOptions
  ): Promise<BackupInfo>
  
  async restoreBackup(
    gameId: string,
    backupId: string,
    options?: RestoreBackupOptions
  ): Promise<void>
  
  async listBackups(gameId: string): Promise<BackupInfo[]>
  async deleteBackup(gameId: string, backupId: string): Promise<void>
  async cleanupOldBackups(gameId: string, options?: CleanupOptions): Promise<number>
  
  async validateBackup(gameId: string, backupId: string): Promise<BackupValidationResult>
  async getStorageStats(gameId: string): Promise<GameStorageStats>
  async getGlobalStatistics(): Promise<BackupStatistics>
}
```

#### 5.1 Backup Strategy

**Hardlink-Based Deduplication**
```
BEFORE: Game install 500 MB
        └─ Install backup = 500 MB disk usage (apparent) + 500 MB (real)
        └─ Install backup2 = 500 MB disk usage (apparent) + 500 MB (real)
        └─ Total: 1500 MB apparent, 1500 MB real

WITH HARDLINKS:
├─ Game files: 500 MB (real data)
├─ Backup 1: 500 MB hardlinks → same inodes as game (0 additional)
├─ Backup 2: 500 MB hardlinks → same inodes as game (0 additional)
└─ Total: 1500 MB apparent, 500 MB real (67% savings!)

Deduplication Ratio = real_data / apparent_size
  - Typical: 0.3 - 0.5 (50-70% savings)
  - Best case: ~0.1 (90% savings)
```

**Filesystem Support:**

| Platform | Filesystem | Hardlink Support | Reflink/Clone |
|----------|-----------|------------------|---------------|
| Windows  | NTFS      | Yes (3+)         | No            |
| Windows  | ReFS      | Yes              | Yes (Copy-on-Write) |
| Windows  | FAT32     | No               | No            |
| macOS    | APFS      | Yes              | Yes           |
| macOS    | HFS+      | Yes              | No            |
| Linux    | ext4      | Yes              | No            |
| Linux    | Btrfs     | Yes              | Yes           |
| Linux    | XFS       | Yes              | No            |

**Fallback Strategy:**
```
1. Test hardlink support for target filesystem
2. If supported: use hardlinks (instant, efficient)
3. If not supported: use reflink/clone (macOS APFS, Linux Btrfs)
4. If neither: full copy (slow, complete duplication)
```

#### 5.2 Backup Directory Structure

```
~/.config/Y-Core/mod-backups/
├── game-appid-1/
│   ├── backup-1690000000-a1b2c3d4/
│   │   ├── backup-metadata.json
│   │   ├── backup.sha256
│   │   ├── [game files with hardlinks]
│   │   └── mod-files/
│   │       └── [mod structure preserved]
│   └── backup-1690100000-e5f6g7h8/
│       └── [similar structure]
└── game-appid-2/
    └── [game-specific backups]

Metadata Example:
{
  "id": "backup-1690000000-a1b2c3d4",
  "gameId": "1234567",
  "name": "Backup 2023-07-22",
  "createdAt": 1690000000000,
  "path": "~/.config/Y-Core/mod-backups/...",
  "fileCount": 4521,
  "totalSize": 524288000,
  "realDataSize": 157286400,
  "hardlinkCount": 4521,
  "usedHardlinks": true,
  "checksum": "abc123def456...",
  "progress": {
    "operation": "creating",
    "percentage": 100,
    "filesProcessed": 4521,
    "totalFiles": 4521,
    "estimatedTimeRemaining": 0,
    "status": "Backup complete"
  }
}
```

#### 5.3 SQLite Database Schema

**Tables:**

1. **installed_mods** - Track all installed mods
2. **backups** - Backup history and metadata
3. Indexes on gameAppId, status, enabled, timestamp

See DATABASE_SCHEMA.md for detailed schema.

#### 5.4 Cross-Platform Paths

```typescript
// Backup directory
Windows:  %APPDATA%\YCore\mod-backups\
macOS:    ~/Library/Application Support/Y-Core/mod-backups/
Linux:    ~/.config/Y-Core/mod-backups/

// Database
Windows:  %APPDATA%\YCore\mods-database.db
macOS:    ~/Library/Application Support/Y-Core/mods-database.db
Linux:    ~/.config/Y-Core/mods-database.db
```

---

## Component Dependency Graph

```
ModsPage
├── ModsGrid
│   ├── ModCard
│   │   ├── ModDetailsModal
│   │   │   ├── InstallButton
│   │   │   ├── BackupHistory
│   │   │   └── SecurityStatus
│   │   └── ModRating
│   └── ModFilters
├── ModManagerPanel
│   ├── InstalledModsList
│   │   ├── ModToggle (enable/disable)
│   │   ├── UninstallButton
│   │   └── BackupButton
│   ├── StorageStats
│   ├── ScanResults
│   └── ConflictWarnings
└── MyModsView
    ├── InstalledMods
    ├── BackupHistory
    │   ├── BackupRestore
    │   └── BackupDelete
    └── SecurityDashboard

Service Dependencies:
SteamWorkshopService
├── HTTP client
├── Cache (LRU)
└── Logger

ModsDatabaseService
├── SQLite connection
├── Connection pool
└── Logger

ModInstallerService
├── MalwareScanner
├── BackupManager
├── SteamWorkshopService
├── ModsDatabaseService
└── Logger

BackupManager
├── FilesystemDetector
├── BackupCreator
├── BackupRestorer
├── BackupCleaner
└── Logger

MalwareScanner
├── VirusTotal API
├── YARA binary
└── Logger
```

---

## Data Flow Diagrams

### Install Workflow

```
USER CLICKS "INSTALL"
        ↓
    ModDetailsModal
        ↓
  ipcRenderer.invoke('mods:install')
        ↓
    IPC HANDLER (mods.handler.ts)
        ↓
  ModInstaller.installMod()
        │
        ├─ STEP 1: Create Backup (if enabled)
        │   ├─ BackupManager.createBackup(gamePath, gameId)
        │   │   ├─ FilesystemDetector.detect(gamePath)
        │   │   ├─ BackupCreator.create()
        │   │   │   ├─ Collect files recursively
        │   │   │   ├─ Try hardlinks (or fall back to copy)
        │   │   │   ├─ Calculate checksum
        │   │   │   └─ Emit progress events
        │   │   └─ Save backup metadata
        │   └─ event.sender.send('mods:backup-progress')
        │
        ├─ STEP 2: Download Mod
        │   ├─ SteamWorkshopService.downloadMod()
        │   ├─ Check cache first
        │   ├─ Download from Steam if not cached
        │   └─ event.sender.send('mods:install-progress', {stage: 'download'})
        │
        ├─ STEP 3: Extract Archive
        │   ├─ Decompress .zip or .7z
        │   ├─ Validate directory structure
        │   └─ event.sender.send('mods:install-progress', {stage: 'extract'})
        │
        ├─ STEP 4: Security Scan
        │   ├─ MalwareScanner.scanDirectory(extractedPath)
        │   │   ├─ Tier 1: Extension check (all files)
        │   │   ├─ Tier 2: PE header analysis (executables)
        │   │   ├─ Tier 3: VirusTotal scan (if enabled)
        │   │   └─ Tier 4: YARA rules (if enabled)
        │   ├─ If DANGEROUS/QUARANTINED: ABORT
        │   └─ event.sender.send('mods:install-progress', {stage: 'scan'})
        │
        ├─ STEP 5: Copy to Game Directory
        │   ├─ Copy files to mod install path
        │   ├─ Preserve directory structure
        │   └─ event.sender.send('mods:install-progress', {stage: 'install'})
        │
        ├─ STEP 6: Update Database
        │   ├─ ModsDatabaseService.addInstalledMod()
        │   ├─ Insert/update mod record
        │   ├─ Set status to 'installed'
        │   └─ Record installation metadata
        │
        └─ STEP 7: Cleanup & Return
            ├─ Remove temporary files
            ├─ Update UI state
            └─ return ModInstallResult
                    ↓
  IPC HANDLER returns {success: true, data: result}
        ↓
  ModDetailsModal updates state
        ↓
  INSTALLED MOD APPEARS IN MyModsView

Progress Events (sent during installation):
  event.sender.send('mods:install-progress', {
    modId: string,
    stage: 'backup' | 'download' | 'extract' | 'scan' | 'install' | 'cleanup',
    progress: number,  // 0-100
    speed: number,  // bytes/sec
    eta: number,  // seconds
    status: 'pending' | 'in_progress' | 'completed' | 'failed'
  })
```

### Search Workflow

```
USER TYPES SEARCH QUERY
        ↓
  ModsPage.onSearch()
        ↓
  ipcRenderer.invoke('mods:search-catalog', query)
        ↓
  IPC HANDLER (mods.handler.ts)
        ↓
  SteamWorkshopService.searchMods()
        │
        ├─ Parse ModSearchQuery
        │   ├─ gameAppId
        │   ├─ search text
        │   ├─ tags filter
        │   ├─ sort (trending, newest, top_rated, alphabetical)
        │   ├─ limit (default 50)
        │   └─ offset (pagination)
        │
        ├─ Check query cache
        │   └─ If HIT: return cached results
        │
        ├─ Call Steam Workshop API
        │   ├─ GET https://steamcommunity.com/gid/api/PublishedFiles/QueryFiles/v2/
        │   ├─ Authenticate with app credentials
        │   └─ Parse response
        │
        ├─ Process Results
        │   ├─ Extract mod details from response
        │   ├─ Map to SteamModDetails objects
        │   ├─ Convert raw Steam format:
        │   │   publishedfileid → id
        │   │   title → title
        │   │   description → description (sanitized)
        │   │   creator → author
        │   │   file_size → fileSize
        │   │   time_created → createdAt (ms)
        │   │   time_updated → updatedAt (ms)
        │   │   vote_data.votes_up → votesUp
        │   │   vote_data.votes_down → votesDown
        │   │   vote_data.score → score
        │   └── tags → tags array
        │
        ├─ Cache Results (TTL 1 hour)
        │   ├─ Key = hash(query)
        │   ├─ Value = {results, timestamp, ttl}
        │   └─ Evict if cache size > max
        │
        └─ return ModSearchResult
                ├─ mods[]
                ├─ total (estimate)
                ├─ hasMore
                ├─ offset
                └─ searchTime (ms)
                    ↓
  IPC HANDLER returns {success: true, data: result}
        ↓
  ModsPage updates grid state
        ↓
  ModCards rendered for each result
        ↓
  USER SEES SEARCH RESULTS
```

### Backup Restoration Workflow

```
USER CLICKS "RESTORE BACKUP"
        ↓
  BackupHistory component
        ↓
  ipcRenderer.invoke('mods:restore-backup', {backupId, modId, installPath})
        ↓
  IPC HANDLER
        ↓
  BackupManager.restoreBackup()
        │
        ├─ STEP 1: Verify Backup
        │   ├─ Load backup metadata
        │   ├─ Validate backup integrity
        │   ├─ Check checksums
        │   └─ Abort if corrupted
        │
        ├─ STEP 2: Create Snapshot (if requested)
        │   ├─ Create backup of current state
        │   ├─ This allows "undo restore"
        │   └─ Emit 'snapshot-created' event
        │
        ├─ STEP 3: Clear Installation
        │   ├─ Remove existing mod files
        │   ├─ Keep directory structure
        │   └─ Emit 'cleanup-progress' events
        │
        ├─ STEP 4: Restore Files
        │   ├─ Copy/link files from backup
        │   ├─ Preserve file permissions
        │   ├─ Recreate directory structure
        │   └─ Emit 'restore-progress' events
        │
        ├─ STEP 5: Verify Restoration
        │   ├─ Calculate checksum of restored files
        │   ├─ Compare with backup checksum
        │   └─ Abort if mismatch
        │
        ├─ STEP 6: Update Database
        │   ├─ Update mod status to 'installed'
        │   ├─ Record restoration in mod history
        │   └─ Update metadata timestamps
        │
        └─ STEP 7: Return Result
                ↓
  IPC HANDLER returns {success: true}
        ↓
  BackupHistory component closes
        ↓
  MyModsView refreshes
        ↓
  USER SEES RESTORED MOD
```

### Malware Scan Workflow

```
MalwareScanner.scanDirectory(modPath)
        ↓
  Emit: scan-started
        ↓
  Get all files recursively
        ↓
  FOR EACH FILE:
        │
        ├─ TIER 1: Extension Check (<10ms)
        │   ├─ Emit: scan-progress (20%)
        │   ├─ Extract extension
        │   ├─ Check blacklist (.exe, .dll, .sys)
        │   ├─ Check whitelist (.png, .lua, .json)
        │   ├─ Detect double extensions
        │   ├─ Severity = CLEAN | WARNING | BLOCKED
        │   └─ If BLOCKED: emit file-blocked event
        │
        ├─ TIER 2: PE Header Analysis (30-50ms)
        │   ├─ Emit: scan-progress (40%)
        │   ├─ Only if .exe, .dll, .sys, .drv
        │   ├─ Read and parse PE structure
        │   ├─ Detect packing (UPX, entropy)
        │   ├─ Analyze imports (code injection)
        │   ├─ Severity = CLEAN | SUSPICIOUS | DANGEROUS
        │   └─ Update overall severity if worse
        │
        ├─ TIER 3: VirusTotal API (500ms or <100ms cached)
        │   ├─ Emit: scan-progress (60%)
        │   ├─ Compute SHA256 hash
        │   ├─ Check local cache
        │   ├─ If miss: Query API (rate limited)
        │   ├─ Parse engine detections
        │   ├─ Severity based on detection count:
        │   │   ├─ 5+ detected: DANGEROUS
        │   │   ├─ 3-4 detected: SUSPICIOUS
        │   │   ├─ 1-2 detected: WARNING
        │   │   └─ 0 detected: CLEAN
        │   └─ Cache result (7 days TTL)
        │
        └─ TIER 4: YARA Rules (100-500ms)
            ├─ Emit: scan-progress (80%)
            ├─ Only if yara binary available
            ├─ Execute: yara -r <rules> <file>
            ├─ Parse matched rules
            ├─ Categorize malware type
            └─ Update overall severity if worse
                    ↓
  Overall Severity = MAX(tier1, tier2, tier3, tier4)
        ↓
  Determine if should block:
    ├─ if BLOCKED level: always block
    ├─ if blockDangerousFiles && DANGEROUS: block
    ├─ if blockSuspiciousFiles && SUSPICIOUS: block
    └─ else: allow (with warnings)
        ↓
  Emit: scan-completed {result}
        ↓
  Update database with scan results
        ↓
  Return DirectoryScans summary:
    ├─ totalFiles
    ├─ scannedFiles
    ├─ cleanFiles
    ├─ warningFiles
    ├─ suspiciousFiles
    ├─ dangerousFiles
    ├─ blockedFiles
    └─ overallSeverity
```

---

## Design Patterns

### 1. Singleton Pattern

Used for service instances:

```typescript
// Steam Workshop Service
let steamWorkshopInstance: SteamWorkshopService | null = null
export function getSteamWorkshopService(): SteamWorkshopService {
  if (!steamWorkshopInstance) {
    steamWorkshopInstance = new SteamWorkshopService()
  }
  return steamWorkshopInstance
}

// Backup Manager
let backupManagerInstance: BackupManager | null = null
export function getBackupManager(config?: Config): BackupManager {
  if (!backupManagerInstance) {
    backupManagerInstance = new BackupManager(config)
  }
  return backupManagerInstance
}
```

**Benefits:**
- Single source of truth for each service
- Consistent state across components
- Reduces memory usage
- Enables caching at service level

### 2. Factory Pattern

Used in mod installer for workflow creation:

```typescript
class ModInstallerService {
  async installMod(modDetails, options, onProgress) {
    // Factory determines workflow based on options
    const workflow = this.createInstallWorkflow({
      createBackup: options.createBackup,
      scanForMalware: options.scanForMalware,
      enableAfterInstall: options.enableAfterInstall
    })
    
    return await workflow.execute()
  }
  
  private createInstallWorkflow(options): InstallWorkflow {
    const steps: WorkflowStep[] = []
    
    if (options.createBackup) {
      steps.push(new BackupStep())
    }
    steps.push(new DownloadStep())
    steps.push(new ExtractStep())
    
    if (options.scanForMalware) {
      steps.push(new SecurityScanStep())
    }
    
    steps.push(new InstallStep())
    steps.push(new DatabaseStep())
    
    return new InstallWorkflow(steps)
  }
}
```

### 3. Observer Pattern

Used for progress events and state changes:

```typescript
// Backup Manager emits events
class BackupManager extends EventEmitter {
  async createBackup(gamePath, gameId, options) {
    // Emit when started
    this.emit('backup-started', {gameId, backupId})
    
    // Emit progress periodically
    creator.on('progress', (progress) => {
      this.emit('backup-progress', {gameId, ...progress})
    })
    
    // Emit when complete
    this.emit('backup-created', {gameId, backupId, data})
  }
}

// UI subscribes to events
scanner.on('scan-started', (event) => {
  setStatus('scanning')
})

scanner.on('scan-progress', (event) => {
  setProgress(event.progress)
})

scanner.on('scan-completed', (event) => {
  setScanResult(event.result)
})
```

### 4. Strategy Pattern

Used for filesystem backup strategies:

```typescript
interface BackupStrategy {
  create(source, dest, files): Promise<void>
  getDeduplicationRatio(): number
}

class HardlinkStrategy implements BackupStrategy {
  async create(source, dest, files) {
    // Fast hardlink creation
    for (const file of files) {
      fs.linkSync(source, dest)  // Same inode
    }
  }
  
  getDeduplicationRatio() { return 0.1 }  // 90% savings
}

class ReflinksStrategy implements BackupStrategy {
  async create(source, dest, files) {
    // Copy-on-write (macOS APFS, Linux Btrfs)
    execSync(`cp -c "${source}" "${dest}"`)
  }
  
  getDeduplicationRatio() { return 0.15 }  // 85% savings
}

class FullCopyStrategy implements BackupStrategy {
  async create(source, dest, files) {
    // Complete duplication
    for (const file of files) {
      fs.copyFileSync(file.source, file.dest)
    }
  }
  
  getDeduplicationRatio() { return 1.0 }  // 0% savings
}

// Choose strategy based on filesystem
const capabilities = await FilesystemDetector.detect(targetPath)
let strategy: BackupStrategy
if (capabilities.reflinksSupported) {
  strategy = new ReflinksStrategy()
} else if (capabilities.hardlinksSupported) {
  strategy = new HardlinkStrategy()
} else {
  strategy = new FullCopyStrategy()
}
```

### 5. Template Method Pattern

Used in backup workflows:

```typescript
abstract class BackupWorkflow {
  async execute() {
    await this.preValidate()
    await this.collectFiles()
    await this.selectStrategy()
    await this.createBackup()
    await this.validateChecksum()
    await this.saveMetadata()
    await this.cleanup()
  }
  
  protected abstract selectStrategy(): Promise<BackupStrategy>
}

class HardlinkBackupWorkflow extends BackupWorkflow {
  protected async selectStrategy(): Promise<BackupStrategy> {
    const caps = await FilesystemDetector.detect(this.path)
    return new HardlinkStrategy(caps)
  }
}
```

---

## Concurrency & Thread Safety

### 1. Electron Main Process (Single-threaded)

The main process runs on a single thread in Electron. All IPC handlers run sequentially (unless explicitly async).

```typescript
// Safe: IPC handlers serialize naturally
ipcMain.handle('mods:install', async (event, options) => {
  // Only one handler executes at a time
  // IPC message queue ensures serial processing
})

// Safe: Database operations serialize via SQLite locks
modsDatabaseService.addInstalledMod(mod)  // Queued by SQLite

// Thread pool: Native modules can use thread pools
MalwareScanner.scanDirectory()  // May use worker threads
```

**Key Points:**
- IPC message queue ensures serial processing
- SQLite uses file-level locks (PRAGMA journal_mode=WAL)
- Main process remains responsive due to async/await
- Heavy operations (scanning, backup) yield control

### 2. Database Concurrency

SQLite handles concurrent access with WAL (Write-Ahead Logging):

```typescript
// Connection configuration
this.db.configure('busyTimeout', 5000)  // Wait 5s on lock

// Transactions provide isolation
async beginTransaction() {
  return new Promise((resolve, reject) => {
    this.db.run('BEGIN TRANSACTION', (err) => {
      if (err) reject(err)
      else resolve()
    })
  })
}

async commit() {
  return new Promise((resolve, reject) => {
    this.db.run('COMMIT', (err) => {
      if (err) reject(err)
      else resolve()
    })
  })
}

// Usage: Atomic operation
async installModAtomic(modInfo, backup) {
  try {
    await this.beginTransaction()
    await this.addInstalledMod(modInfo)
    await this.addBackup(backup)
    await this.commit()
  } catch (err) {
    await this.rollback()
    throw err
  }
}
```

**WAL Benefits:**
- Readers don't block writers
- Writers don't block readers (in WAL mode)
- Multiple simultaneous queries possible
- Crash recovery easier

### 3. Backup Concurrency

Multiple backups can run in parallel, controlled by config:

```typescript
const DEFAULT_CONFIG = {
  maxConcurrentOps: 3,  // At most 3 concurrent operations
  operationTimeoutMs: 3600000,  // 1 hour timeout
}

class BackupManager {
  private activeOperations: Map<string, boolean> = new Map()
  
  async createBackup(gamePath, gameId, options) {
    const opKey = `create-${gameId}-${Date.now()}`
    
    // Check concurrency limit
    if (this.activeOperations.size >= this.config.maxConcurrentOps) {
      throw new Error('Too many concurrent operations')
    }
    
    this.activeOperations.set(opKey, true)
    try {
      // Perform backup
      const result = await this.executeBackup()
      return result
    } finally {
      this.activeOperations.delete(opKey)
    }
  }
}
```

### 4. Malware Scanner Concurrency

Scanner can process multiple files concurrently:

```typescript
async scanDirectory(dirPath) {
  const files = await this.getFilesRecursive(dirPath)
  const results: ScanResult[] = []
  
  // Sequential (default, safe):
  for (const file of files) {
    results.push(await this.scanFile(file))
  }
  
  // Or parallel with limit (if implemented):
  const concurrency = 3
  const batches = chunk(files, concurrency)
  for (const batch of batches) {
    const batchResults = await Promise.all(
      batch.map(file => this.scanFile(file))
    )
    results.push(...batchResults)
  }
}
```

### 5. Race Conditions & Prevention

**Potential races:**

1. **Install during backup cleanup**
   ```
   Thread A: Start backup (lock backup dir)
   Thread B: Delete old backup (delete dir)
   Thread A: Try to move backup (race!)
   
   Solution: Backup IDs include timestamp + random suffix
   backup-1690000000-a1b2c3d4 is unique, unlikely collision
   ```

2. **Enable/disable during scan**
   ```
   Thread A: Disable mod (update DB)
   Thread B: Scan mod files (read from disk)
   
   Solution: DB transaction provides isolation
   Scans read snapshot of mod status
   ```

3. **Multiple installs of same mod**
   ```
   Thread A: Install mod X (UNIQUE constraint)
   Thread B: Install mod X (same fileId)
   
   Solution: DB schema has UNIQUE(gameAppId, fileId)
   Only one can succeed, other gets constraint error
   ```

---

## Scaling Considerations

### What if 1,000 mods?

**Current Limitations:**

| Component | Current | Bottleneck | Solution |
|-----------|---------|-----------|----------|
| **Database** | 10K mods | Sequential queries | Add indexes on gameAppId, enabled |
| **UI rendering** | 50 mods/page | DOM nodes | Virtualization (windowed list) |
| **Memory** | ~100 MB | Loaded state | Pagination, lazy loading |
| **Search** | Linear scan | O(n) queries | Full-text search, Lucene |
| **Backups** | 10/mod | Storage growth | Compression, automatic cleanup |

**Scaling Strategy:**

```typescript
// 1. Database optimization
CREATE INDEX idx_installed_mods_gameAppId ON installed_mods(gameAppId)
CREATE INDEX idx_installed_mods_enabled ON installed_mods(enabled)
CREATE INDEX idx_installed_mods_status ON installed_mods(status)

// Query optimization: paginate results
async getGameMods(gameAppId: string, limit = 100, offset = 0) {
  return this.db.all(
    'SELECT * FROM installed_mods WHERE gameAppId = ? LIMIT ? OFFSET ?',
    [gameAppId, limit, offset]
  )
}

// 2. UI virtualization
<ModsList>
  <VirtualList
    height={800}
    itemCount={1000}
    itemSize={100}
    renderItem={renderModCard}
  >
</ModsList>

// 3. Lazy loading details
async getModDetails(modId) {
  // Return cached summary first
  const summary = cache.get(modId)
  if (summary) return summary
  
  // Load full details on demand
  const details = await db.get('SELECT * FROM ...')
  cache.set(modId, details)
  return details
}

// 4. Batch operations
async installBatch(modIds: string[]) {
  for (const modId of modIds) {
    // Queue for sequential install with backoff
    await this.installQueue.push(modId)
  }
}
```

### What if 100 backups?

**Storage Analysis:**

```
Scenario: 5 backups × 500 MB mods

WITHOUT deduplication:
  Backup 1: 500 MB
  Backup 2: 500 MB
  Backup 3: 500 MB
  Backup 4: 500 MB
  Backup 5: 500 MB
  Total: 2500 MB (2.5 GB)

WITH hardlinks (deduplication):
  Game files: 500 MB (original)
  Backup 1: hardlinks (0 additional)
  Backup 2: hardlinks + 50 MB changed files
  Backup 3: hardlinks + 20 MB changed files
  Backup 4: hardlinks + 100 MB changed files
  Backup 5: hardlinks + 30 MB changed files
  Total: 500 + 50 + 20 + 100 + 30 = 700 MB (72% savings!)
```

**Retention Policy:**

```typescript
const DEFAULT_CONFIG = {
  defaultRetentionDays: 7,    // Keep 7 days old
  defaultKeepCount: 3,         // Always keep 3 latest
  enableCompression: false,    // Compress old backups?
  compressionRetentionDays: 30, // Compress after 30 days
  maxBackups: 10,              // Hard limit per game
}

async cleanupOldBackups(gameId, options) {
  const backups = await this.listBackups(gameId)
  const now = Date.now()
  const cutoffTime = now - (options.retentionDays * 24 * 60 * 60 * 1000)
  
  for (let i = 0; i < backups.length; i++) {
    // Rule 1: Always keep N latest
    if (i < options.keepLatestCount) continue
    
    // Rule 2: Delete if older than retention
    if (backups[i].createdAt < cutoffTime) {
      await this.deleteBackup(gameId, backups[i].id)
    }
    
    // Rule 3: Hard limit on count
    if (backups.length > options.maxBackups) {
      await this.deleteBackup(gameId, backups[i].id)
    }
  }
}
```

**Monitoring Storage:**

```typescript
async getGlobalStatistics(): Promise<BackupStatistics> {
  return {
    totalBackups: 100,
    totalStorage: 15 * 1024 * 1024 * 1024,  // 15 GB apparent
    totalRealData: 3 * 1024 * 1024 * 1024,  // 3 GB actual
    deduplicationRatio: 0.2,  // 80% savings
    hardlinkBackupCount: 95,
    fullCopyBackupCount: 5,
    averageBackupSize: 150 * 1024 * 1024,  // 150 MB
    largestBackupSize: 2 * 1024 * 1024 * 1024,  // 2 GB
    spacesSavedByDeduplication: 12 * 1024 * 1024 * 1024,  // 12 GB
  }
}
```

---

## Performance Characteristics

### Typical Response Times

| Operation | Time | Variance | Notes |
|-----------|------|----------|-------|
| **Search** | 200-500ms | ±100ms | Depends on network, cached queries <50ms |
| **Get details** | 100-300ms | ±50ms | Cache hit <10ms, miss calls API |
| **List installed** | 50-100ms | ±20ms | DB query, indexed by gameAppId |
| **Install** | 30-300s | ±60s | Depends on mod size, backup, scan |
| **Backup (hardlinks)** | 1-10s | ±2s | Mostly metadata, fast for 500MB |
| **Backup (full copy)** | 30-120s | ±20s | Writes full 500MB |
| **Malware scan** | 100-2000ms | ±500ms | Tier 1:<10ms, Tier 2:30-50ms, Tier 3:500ms |
| **VirusTotal cache hit** | 50-100ms | ±10ms | Local cache lookup + DB query |
| **VirusTotal cache miss** | 500-2000ms | ±300ms | API rate limited |

### Storage Usage Patterns

```
Mod Metadata Database:
  Per mod: ~2-5 KB (title, author, tags, dependencies)
  1000 mods: ~5 MB database file

Cache (Steam Workshop API):
  Per entry: ~10-50 KB (full mod details)
  100 cached entries: ~2-5 MB

Backups:
  With hardlinks: 10-30% of original mod size
  Without hardlinks: 100% of original mod size
  100 backups: 5-50 GB depending on strategy

Logs:
  Per scan: ~1-2 KB
  Per operation: ~1-5 KB
  Daily logs: ~50-100 MB
```

### Memory Usage Patterns

```
UI State:
  Mod listings: ~10 KB per 100 mods
  Modal open: +5-10 MB
  Search results: ~20 KB per 50 results

Service Instances:
  SteamWorkshopService: ~2-5 MB (cache)
  ModsDatabaseService: ~1-2 MB (connection)
  MalwareScanner: ~5-10 MB (stats, cache)
  BackupManager: <1 MB

Total baseline: ~20-40 MB
Peak (during operations): ~50-100 MB
```

---

## Error Handling & Recovery

### Common Error Scenarios

```typescript
// 1. Installation fails due to disk space
try {
  await backupManager.createBackup()
} catch (err) {
  if (err.code === 'ENOSPC') {
    // Disk full: offer to cleanup old backups
    const freed = await backupManager.cleanupOldBackups()
    // Retry or abort
  }
}

// 2. Network timeout during download
try {
  const mod = await steamWorkshop.downloadMod(fileId)
} catch (err) {
  if (err.code === 'ETIMEDOUT') {
    // Retry with exponential backoff
    await sleep(1000 * Math.pow(2, retryCount))
    return this.downloadWithRetry(fileId, retryCount + 1)
  }
}

// 3. Corrupted backup
try {
  await backupManager.validateBackup(gameId, backupId)
} catch (err) {
  if (!result.valid) {
    // Mark backup as corrupted
    // Prevent restore
    // Offer to delete
  }
}

// 4. Malware detected
try {
  const scanResult = await scanner.scanDirectory(modPath)
} catch (err) {
  if (scanResult.shouldBlock) {
    // Move to quarantine
    // Prevent installation
    // Notify user
  }
}
```

### Rollback Strategies

**Installation Rollback:**
```
If installation fails at:
  - Backup step: no rollback needed
  - Download step: delete downloaded file
  - Extract step: delete extracted directory
  - Scan step: delete extracted directory
  - Install step: restore backup
  - Database step: undo DB record, restore backup

User can also manually restore backup from UI
```

**Backup Rollback:**
```
If backup creation fails:
  - Partial backup detected
  - Mark as 'corrupted'
  - Clean up temp directory
  - Log error for manual recovery
```

---

## Testing Strategy Overview

### Unit Tests

```typescript
// MalwareScanner tests
describe('MalwareScanner', () => {
  test('Tier 1: detects blacklisted extensions', () => {
    const result = scanner.performExtensionCheck('malware.exe')
    expect(result.isBlacklisted).toBe(true)
    expect(result.severity).toBe(SeverityLevel.BLOCKED)
  })
  
  test('Tier 1: detects double extensions', () => {
    const result = scanner.performExtensionCheck('document.txt.exe')
    expect(result.isBlacklisted).toBe(true)
    expect(result.reason).toContain('Double extension')
  })
  
  test('Tier 2: detects packed executables', async () => {
    const result = await scanner.performPEHeaderAnalysis(packedExePath)
    expect(result.detectionFlags.isPackedExecutable).toBe(true)
  })
  
  test('Tier 3: caches VirusTotal results', async () => {
    const result1 = await scanner.scanFile(testFile)
    const result2 = await scanner.scanFile(testFile)
    // Second should be from cache
    expect(result2.scanTime).toBeLessThan(result1.scanTime)
  })
})

// BackupManager tests
describe('BackupManager', () => {
  test('creates hardlink backup when supported', async () => {
    const backup = await manager.createBackup(gamePath, gameId)
    expect(backup.usedHardlinks).toBe(true)
    expect(backup.realDataSize).toBeLessThan(backup.totalSize)
  })
  
  test('falls back to full copy when hardlinks unavailable', async () => {
    const backup = await manager.createBackup(gamePath, gameId)
    expect(backup.usedHardlinks).toBe(false)
    expect(backup.realDataSize).toBe(backup.totalSize)
  })
  
  test('cleans up old backups by retention policy', async () => {
    await manager.createBackup(gameId, path)  // 3 days old
    await manager.createBackup(gameId, path)  // 2 days old
    await manager.createBackup(gameId, path)  // 1 day old
    
    const deleted = await manager.cleanupOldBackups(gameId, {
      retentionDays: 2,
      keepLatestCount: 2
    })
    expect(deleted).toBe(1)  // Oldest one deleted
  })
})
```

### Integration Tests

```typescript
// Full install workflow
test('InstallMod workflow: backup → download → scan → install → db', async () => {
  const modDetails = getMockModDetails()
  const result = await installer.installMod(
    modDetails,
    {
      modId: 'test-mod',
      gameAppId: '123456',
      installDir: tempDir,
      createBackup: true,
      scanForMalware: true,
      overwrite: false
    },
    () => {} // progress
  )
  
  expect(result.success).toBe(true)
  
  // Verify backup created
  const backups = await backupManager.listBackups('test-mod')
  expect(backups.length).toBeGreaterThan(0)
  
  // Verify DB updated
  const installed = await database.getInstalledMod('test-mod')
  expect(installed).toBeDefined()
  expect(installed.status).toBe(ModStatus.INSTALLED)
})
```

### E2E Tests

```typescript
// Full user journey
test('User install → enable → scan → restore workflow', async () => {
  // 1. Search for mod
  const searchResult = await ipcMain.handle('mods:search-catalog', {
    gameAppId: '123456',
    search: 'test mod'
  })
  expect(searchResult.success).toBe(true)
  
  // 2. Install mod
  const installResult = await ipcMain.handle('mods:install', modDetails, options)
  expect(installResult.success).toBe(true)
  
  // 3. Verify in installed list
  const installed = await ipcMain.handle('mods:list-installed', '123456')
  expect(installed.data).toContainEqual(expect.objectContaining({id: modId}))
  
  // 4. Run security scan
  const scanResult = await ipcMain.handle('mods:scan-malware', {
    modId,
    filePaths: [modPath]
  })
  expect(scanResult.data.overallStatus).toBe(MalwareScanStatus.CLEAN)
  
  // 5. Restore backup
  const backups = await ipcMain.handle('mods:get-backups', modId)
  const backup = backups.data[0]
  const restoreResult = await ipcMain.handle('mods:restore-backup', {
    backupId: backup.id,
    modId,
    installPath: modPath
  })
  expect(restoreResult.success).toBe(true)
})
```

---

## Security Considerations

### What Data is Private?

```
Private (never shared):
  - User's mod installation paths
  - Local database of mods
  - Backup locations and contents
  - Scan results and detections
  - VirusTotal API key (encrypted)
  - User preferences and settings

Shared (with Steam):
  - Game App IDs for mod queries
  - Mod search queries
  - Mod download requests
  - Steam Workshop API calls

Analysis only (never stored):
  - Scan progress events
  - Performance metrics
  - Cache hit rates
  - Telemetry (if enabled)
```

### API Key Security

```typescript
// VirusTotal API key handling
class MalwareScanner {
  setVirusTotalKey(key: string) {
    // Store encrypted in config file
    const encrypted = encryptKey(key, systemUserPassword)
    config.virusTotalApiKey = encrypted
  }
  
  getVirusTotalKey(): string {
    // Decrypt on use
    const encrypted = config.virusTotalApiKey
    return decryptKey(encrypted, systemUserPassword)
  }
}

// Never log API keys
logger.info('Scanning file...')  // OK
logger.info(`API key: ${key}`)    // NEVER
```

---

## Logging Architecture

### Log Locations

```
Windows:  %APPDATA%\YCore\logs\
macOS:    ~/Library/Logs/Y-Core/
Linux:    ~/.local/share/Y-Core/logs/

Log Files:
  - app.log (main application)
  - mods-ipc.log (IPC operations)
  - mods-db.log (database)
  - malware-scanner.log (scans)
  - backup-manager.log (backups)
  - steam-workshop.log (API calls)
```

### Important Log Entries

```
[INFO] Mod installation started: mod-123
[INFO] Creating backup for game 123456
[DEBUG] Tier 1: Extension check passed
[DEBUG] Tier 2: PE header analysis...
[WARN] VirusTotal API rate limited, retrying...
[ERROR] Installation failed: insufficient disk space
[INFO] Backup complete: backup-1690000000-a1b2c3d4
[INFO] Malware scanner initialized with 12 YARA rules
```

---

## Troubleshooting Guide for Developers

### Installation Fails with "Disk Full"

**Check:**
```bash
# Linux/macOS
df -h ~/.config/Y-Core/

# Windows
dir %APPDATA%\YCore
```

**Solution:**
1. Run backup cleanup: `backupManager.cleanupOldBackups(gameId)`
2. Remove old backups manually
3. Increase disk space
4. Retry installation

### Backup Creation Very Slow

**Likely cause:** Filesystem doesn't support hardlinks

**Check:**
```typescript
const caps = await FilesystemDetector.detect(gamePath)
console.log(caps.hardlinksSupported)  // false?
console.log(caps.filesystemType)  // FAT32? (fallback to copy)
```

**Solution:**
1. Reformat drive to NTFS (Windows) or ext4 (Linux)
2. Use macOS APFS (automatic)
3. Accept slow full-copy backups

### Malware Scan Always Returns "SUSPICIOUS"

**Likely cause:** YARA rules missing or VirusTotal offline

**Check:**
```typescript
const config = scanner.getConfig()
console.log(config.enableYara)  // false?
console.log(config.enableVirusTotal)  // false?
console.log(config.blockSuspiciousFiles)  // true?
```

**Solution:**
1. Install YARA binary: `brew install yara` (macOS) or download (Windows)
2. Set VirusTotal API key: `scanner.setVirusTotalKey(apiKey)`
3. Adjust sensitivity: `scanner.updateConfig({blockSuspiciousFiles: false})`

### Database Corruption

**Symptoms:**
- "database is locked" errors
- Database queries timeout
- Mods list won't load

**Solution:**
```bash
# Backup corrupted database
cp mods-database.db mods-database.db.backup

# Let service recreate schema
rm mods-database.db
# Restart app → auto-migration runs

# Or manually reset
sqlite3 mods-database.db "VACUUM; PRAGMA integrity_check;"
```

---

## Conclusion

The Y-Core Mod Manager is a sophisticated system handling mod lifecycle management with enterprise-grade security and reliability. Its 5-layer architecture separates concerns effectively:

- **Presentation** handles UI
- **IPC** provides safe renderer-main communication
- **Services** implement business logic
- **Security** ensures malware detection
- **Storage** manages data durability

The system scales well to 1000+ mods and 100+ backups through intelligent database design and hardlink deduplication. Developers can refer to this architecture when extending functionality or debugging issues.

---

**Document Version:** 1.0  
**Last Updated:** 2026-07-29  
**Status:** Complete & Ready for Reference
