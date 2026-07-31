# Y-Core Mod Manager - Database Schema Documentation

**Version:** 1.0  
**Last Updated:** 2026-07-29  
**Database:** SQLite3

---

## Table of Contents

1. [Schema Overview](#schema-overview)
2. [Table Definitions](#table-definitions)
3. [Relationships & Foreign Keys](#relationships--foreign-keys)
4. [Indexes & Performance](#indexes--performance)
5. [Queries & Operations](#queries--operations)
6. [Data Retention Policies](#data-retention-policies)
7. [Backup & Restore](#backup--restore)
8. [Migration Strategy](#migration-strategy)

---

## Schema Overview

### Entity Relationship Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    installed_mods                           │
│  ┌────────────────┬──────────────────────────────────────┐  │
│  │ id (PK)        │ PRIMARY KEY, Unique mod identifier  │  │
│  │ gameAppId      │ Steam game App ID                   │  │
│  │ fileId         │ Steam Workshop file ID              │  │
│  │ title          │ Mod name                            │  │
│  │ author         │ Creator name                        │  │
│  │ description    │ Mod description                     │  │
│  │ version        │ Mod version                         │  │
│  │ source         │ steam_workshop, nexusmods, local   │  │
│  │ installPath    │ Full path on disk                   │  │
│  │ fileSize       │ Total bytes                         │  │
│  │ fileUrl        │ Download URL                        │  │
│  │ previewUrl     │ Preview image URL                   │  │
│  │ tags           │ JSON: ["tag1", "tag2"]             │  │
│  │ dependencies   │ JSON: ["mod-id-1", "mod-id-2"]    │  │
│  │ enabled        │ BOOLEAN: 0 or 1                    │  │
│  │ loadOrder      │ INTEGER: load priority             │  │
│  │ status         │ installed, enabled, disabled, ...  │  │
│  │ malwareScanStatus   │ clean, suspicious, quarantined  │  │
│  │ installedAt    │ UNIX timestamp                      │  │
│  │ lastUpdatedAt  │ UNIX timestamp                      │  │
│  │ lastEnabledAt  │ UNIX timestamp (nullable)           │  │
│  │ checksums      │ JSON: file hashes                   │  │
│  │ metadata       │ JSON: custom fields                 │  │
│  │ createdAt      │ UNIX timestamp                      │  │
│  │ updatedAt      │ UNIX timestamp                      │  │
│  └────────────────┴──────────────────────────────────────┘  │
│  UNIQUE(gameAppId, fileId)                                  │
└─────────────────────────────────────────────────────────────┘
        │
        │ 1:N relationship
        │
        ↓
┌─────────────────────────────────────────────────────────────┐
│                        backups                              │
│  ┌────────────────┬──────────────────────────────────────┐  │
│  │ id (PK)        │ PRIMARY KEY, backup identifier      │  │
│  │ modId (FK)     │ FOREIGN KEY to installed_mods.id   │  │
│  │ gameAppId      │ Steam game App ID                   │  │
│  │ timestamp      │ UNIX timestamp                      │  │
│  │ status         │ pending, in_progress, completed ... │  │
│  │ size           │ Apparent size (with hardlinks)      │  │
│  │ path           │ Backup directory path               │  │
│  │ createdBy      │ manual, auto, before_update         │  │
│  │ notes          │ User notes (nullable)               │  │
│  │ fileCount      │ Total files in backup               │  │
│  │ checksumValid  │ BOOLEAN: integrity check            │  │
│  │ lastVerified   │ UNIX timestamp (nullable)           │  │
│  │ expiresAt      │ UNIX timestamp (nullable)           │  │
│  │ metadata       │ JSON: additional info               │  │
│  │ createdAt      │ UNIX timestamp                      │  │
│  │ updatedAt      │ UNIX timestamp                      │  │
│  └────────────────┴──────────────────────────────────────┘  │
│  FOREIGN KEY(modId) → installed_mods.id ON DELETE CASCADE   │
└─────────────────────────────────────────────────────────────┘
```

### Database Statistics

```
Typical database size:
  - Empty: ~1 MB
  - 100 mods: ~2-3 MB
  - 1000 mods: ~10-15 MB
  - 10,000 mods: ~50-80 MB

Backup metadata storage (separate from actual backups):
  - Per backup: ~1-2 KB
  - 100 backups: ~100-200 KB
  - 1000 backups: ~1-2 MB
```

---

## Table Definitions

### Table 1: installed_mods

The central table tracking all installed mods.

#### DDL (Create Statement)

```sql
CREATE TABLE installed_mods (
  id TEXT PRIMARY KEY,
  gameAppId TEXT NOT NULL,
  fileId TEXT NOT NULL,
  title TEXT NOT NULL,
  author TEXT NOT NULL,
  description TEXT,
  version TEXT,
  source TEXT NOT NULL DEFAULT 'steam_workshop',
  installPath TEXT NOT NULL,
  fileSize INTEGER,
  fileUrl TEXT,
  previewUrl TEXT,
  tags TEXT,
  dependencies TEXT,
  enabled BOOLEAN DEFAULT 1,
  loadOrder INTEGER DEFAULT 0,
  status TEXT DEFAULT 'installed',
  malwareScanStatus TEXT DEFAULT 'not_scanned',
  installedAt INTEGER NOT NULL,
  lastUpdatedAt INTEGER NOT NULL,
  lastEnabledAt INTEGER,
  checksums TEXT,
  metadata TEXT,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  UNIQUE(gameAppId, fileId)
);
```

#### Column Definitions

| Column | Type | Size | Constraints | Description |
|--------|------|------|-------------|-------------|
| **id** | TEXT | 50 | PRIMARY KEY | UUID or `mod-{timestamp}-{random}` |
| **gameAppId** | TEXT | 10 | NOT NULL | Steam App ID (e.g., "570" for Dota 2) |
| **fileId** | TEXT | 20 | NOT NULL | Steam Workshop file ID |
| **title** | TEXT | 255 | NOT NULL | Mod display name |
| **author** | TEXT | 255 | NOT NULL | Creator username |
| **description** | TEXT | 2000 | | Full mod description (sanitized HTML) |
| **version** | TEXT | 50 | | Version string (e.g., "1.2.3") |
| **source** | TEXT | 50 | DEFAULT 'steam_workshop' | `steam_workshop`, `nexusmods`, `local` |
| **installPath** | TEXT | 500 | NOT NULL | Absolute path: `/games/mod-name/` |
| **fileSize** | INTEGER | 4-8 | | Total size in bytes |
| **fileUrl** | TEXT | 500 | | Download URL |
| **previewUrl** | TEXT | 500 | | Preview image URL |
| **tags** | TEXT | 1000 | | JSON array: `["tag1","tag2"]` |
| **dependencies** | TEXT | 1000 | | JSON array of mod IDs |
| **enabled** | BOOLEAN | 1 | DEFAULT 1 | 1=enabled, 0=disabled |
| **loadOrder** | INTEGER | 4 | DEFAULT 0 | Priority (higher = loaded later) |
| **status** | TEXT | 50 | DEFAULT 'installed' | `installed`, `enabled`, `disabled`, `corrupted` |
| **malwareScanStatus** | TEXT | 50 | DEFAULT 'not_scanned' | `clean`, `suspicious`, `quarantined` |
| **installedAt** | INTEGER | 8 | NOT NULL | UNIX ms timestamp |
| **lastUpdatedAt** | INTEGER | 8 | NOT NULL | UNIX ms timestamp |
| **lastEnabledAt** | INTEGER | 8 | | UNIX ms timestamp (nullable) |
| **checksums** | TEXT | 2000 | | JSON: `{"file.exe":"sha256hash"}` |
| **metadata** | TEXT | 5000 | | JSON: custom extensible fields |
| **createdAt** | INTEGER | 8 | NOT NULL | UNIX ms timestamp (record creation) |
| **updatedAt** | INTEGER | 8 | NOT NULL | UNIX ms timestamp (record update) |

#### Constraints

```sql
-- Unique constraint (one mod per game)
UNIQUE(gameAppId, fileId)

-- Example: Can't have duplicate Dota2 + Workshop file 12345
```

#### Sample Records

```json
{
  "id": "mod-1690000000000-a1b2c3d4",
  "gameAppId": "570",
  "fileId": "2891927836",
  "title": "Anime Heroes Mod Pack",
  "author": "CustomModCreator",
  "description": "Replaces hero portraits with anime styles...",
  "version": "2.1.0",
  "source": "steam_workshop",
  "installPath": "/opt/games/dota2/mods/anime-heroes/",
  "fileSize": 524288000,
  "fileUrl": "https://steamcdn.com/files/...",
  "previewUrl": "https://steam.com/preview/...",
  "tags": "[\"heroes\",\"cosmetic\",\"anime\"]",
  "dependencies": "[\"mod-core-lib\"]",
  "enabled": 1,
  "loadOrder": 10,
  "status": "installed",
  "malwareScanStatus": "clean",
  "installedAt": 1690000000000,
  "lastUpdatedAt": 1690500000000,
  "lastEnabledAt": 1690500000000,
  "checksums": "{\"mod.exe\":\"abc123def456...\"}",
  "metadata": "{\"installer_version\":\"1.0.0\",\"custom_config\":{}}",
  "createdAt": 1690000000000,
  "updatedAt": 1690500000000
}
```

### Table 2: backups

Tracks backup history and metadata.

#### DDL (Create Statement)

```sql
CREATE TABLE backups (
  id TEXT PRIMARY KEY,
  modId TEXT NOT NULL,
  gameAppId TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'completed',
  size INTEGER,
  path TEXT NOT NULL,
  createdBy TEXT,
  notes TEXT,
  fileCount INTEGER,
  checksumValid BOOLEAN DEFAULT 1,
  lastVerified INTEGER,
  expiresAt INTEGER,
  metadata TEXT,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  FOREIGN KEY(modId) REFERENCES installed_mods(id) ON DELETE CASCADE
);
```

#### Column Definitions

| Column | Type | Size | Constraints | Description |
|--------|------|------|-------------|-------------|
| **id** | TEXT | 50 | PRIMARY KEY | `backup-{timestamp}-{random}` |
| **modId** | TEXT | 50 | NOT NULL, FK | Links to installed_mods.id |
| **gameAppId** | TEXT | 10 | NOT NULL | Steam App ID (for indexing) |
| **timestamp** | INTEGER | 8 | NOT NULL | Backup creation time (UNIX ms) |
| **status** | TEXT | 50 | NOT NULL, DEFAULT='completed' | `pending`, `in_progress`, `completed`, `failed` |
| **size** | INTEGER | 8 | | Apparent size (with hardlinks) in bytes |
| **path** | TEXT | 500 | NOT NULL | Backup directory: `/backups/game/backup-id/` |
| **createdBy** | TEXT | 50 | | `manual`, `auto`, `before_update` |
| **notes** | TEXT | 500 | | User-added notes |
| **fileCount** | INTEGER | 4 | | Total files in backup |
| **checksumValid** | BOOLEAN | 1 | DEFAULT 1 | Integrity verified (1=yes, 0=failed) |
| **lastVerified** | INTEGER | 8 | | UNIX ms timestamp of last check |
| **expiresAt** | INTEGER | 8 | | Auto-delete time (retention policy) |
| **metadata** | TEXT | 2000 | | JSON: `{"realDataSize":150000000,"hardlinkCount":4521}` |
| **createdAt** | INTEGER | 8 | NOT NULL | UNIX ms timestamp |
| **updatedAt** | INTEGER | 8 | NOT NULL | UNIX ms timestamp |

#### Constraints

```sql
-- Foreign key cascade delete
FOREIGN KEY(modId) REFERENCES installed_mods(id) ON DELETE CASCADE
-- When a mod is deleted, all its backups are also deleted
```

#### Sample Records

```json
{
  "id": "backup-1690100000000-e5f6g7h8",
  "modId": "mod-1690000000000-a1b2c3d4",
  "gameAppId": "570",
  "timestamp": 1690100000000,
  "status": "completed",
  "size": 524288000,
  "path": "/home/user/.config/Y-Core/mod-backups/570/backup-1690100000000-e5f6g7h8/",
  "createdBy": "auto",
  "notes": "Automatic backup before update to v2.1.0",
  "fileCount": 4521,
  "checksumValid": 1,
  "lastVerified": 1690200000000,
  "expiresAt": 1691000000000,
  "metadata": "{\"realDataSize\":157286400,\"hardlinkCount\":4521,\"usedHardlinks\":true,\"deduplicationRatio\":0.3}",
  "createdAt": 1690100000000,
  "updatedAt": 1690100000000
}
```

---

## Relationships & Foreign Keys

### One-to-Many: installed_mods ↔ backups

```
1 installed_mod : Many backups

Example:
  Mod "Anime Heroes" (mod-123)
    ├─ Backup created 2026-07-20 (backup-123-a)
    ├─ Backup created 2026-07-21 (backup-123-b)
    ├─ Backup created 2026-07-22 (backup-123-c)
    └─ Backup created 2026-07-23 (backup-123-d)

SQL Relationship:
  backups.modId → installed_mods.id
  
Delete Behavior:
  If installed_mod deleted → all backups CASCADE deleted
  If backup deleted → mod remains
```

### Indexing for Performance

```sql
-- Foreign key index (automatic)
INDEX (modId)

-- Game-based queries
INDEX idx_installed_mods_gameAppId ON installed_mods(gameAppId)
INDEX idx_backups_gameAppId ON backups(gameAppId)

-- Status queries
INDEX idx_installed_mods_status ON installed_mods(status)
INDEX idx_backups_status ON backups(status)

-- Filtering
INDEX idx_installed_mods_enabled ON installed_mods(enabled)
INDEX idx_installed_mods_source ON installed_mods(source)

-- Sorting
INDEX idx_backups_timestamp ON backups(timestamp DESC)
INDEX idx_installed_mods_createdAt ON installed_mods(createdAt DESC)
```

---

## Indexes & Performance

### Index Definitions

```sql
-- Game lookup (most common query)
CREATE INDEX idx_installed_mods_gameAppId 
  ON installed_mods(gameAppId);
-- Scan time: O(log n)

-- Status filtering
CREATE INDEX idx_installed_mods_status 
  ON installed_mods(status);
-- Scan time: O(log n)

-- Enabled/disabled toggle
CREATE INDEX idx_installed_mods_enabled 
  ON installed_mods(enabled);
-- Scan time: O(log n)

-- Mod source (Steam vs. local)
CREATE INDEX idx_installed_mods_source 
  ON installed_mods(source);
-- Scan time: O(log n)

-- Backup queries by timestamp
CREATE INDEX idx_backups_timestamp 
  ON backups(timestamp DESC);
-- Scan time: O(log n)

-- Backup queries by mod
CREATE INDEX idx_backups_modId 
  ON backups(modId);
-- Scan time: O(log n)

-- Time-range queries (for cleanup)
CREATE INDEX idx_backups_expiresAt 
  ON backups(expiresAt);
-- Scan time: O(log n)

-- Composite indexes for common queries
CREATE INDEX idx_installed_mods_game_enabled 
  ON installed_mods(gameAppId, enabled);
-- Query: Get all enabled mods for game (very fast)
```

### Query Performance Analysis

#### Typical Query Times

```sql
-- Get all mods for a game (with index)
SELECT * FROM installed_mods WHERE gameAppId = '570'
Time: <5ms (indexed)
Without index: ~100ms (full table scan)

-- Get enabled mods
SELECT * FROM installed_mods WHERE enabled = 1
Time: <10ms (indexed)
Without index: ~50ms

-- Get recent backups
SELECT * FROM backups 
WHERE gameAppId = '570' 
ORDER BY timestamp DESC 
LIMIT 10
Time: <3ms (indexed)

-- Complex query (not indexed)
SELECT * FROM installed_mods 
WHERE status = 'installed' 
  AND malwareScanStatus != 'quarantined'
  AND dependencies LIKE '%mod-123%'
Time: ~200ms (full scan, no composite index)
```

#### Index Maintenance

```sql
-- Check index usage
PRAGMA index_list(installed_mods);

-- Rebuild indexes (if corrupted)
REINDEX;

-- Analyze query plans
EXPLAIN QUERY PLAN
  SELECT * FROM installed_mods 
  WHERE gameAppId = '570' AND enabled = 1;

-- Output: Should show "SEARCH installed_mods USING INDEX..."
```

---

## Queries & Operations

### Common Operations

#### 1. List Installed Mods for Game

```sql
-- Get all mods for a specific game
SELECT 
  id, title, author, status, enabled, fileSize, 
  installedAt, lastUpdatedAt
FROM installed_mods
WHERE gameAppId = ?
ORDER BY loadOrder, title
LIMIT 100;

-- Execution: ~5ms
-- Uses: idx_installed_mods_gameAppId
```

#### 2. Find Enabled Mods

```sql
-- Get enabled mods only
SELECT * FROM installed_mods
WHERE gameAppId = ? AND enabled = 1
ORDER BY loadOrder;

-- Execution: <5ms
-- Uses: Composite index (gameAppId, enabled)
```

#### 3. Search Mods by Title

```sql
-- Full-text search (basic)
SELECT * FROM installed_mods
WHERE gameAppId = ?
  AND title LIKE ?
ORDER BY title;

-- For search string "anim", title parameter = '%anim%'
-- Execution: 50-200ms (depends on result count)
-- NOTE: Slow with large table; consider adding COLLATE NOCASE
```

#### 4. Get Backups for Mod

```sql
-- List all backups for a specific mod
SELECT 
  id, timestamp, status, size, createdBy, notes,
  fileCount, checksumValid
FROM backups
WHERE modId = ?
ORDER BY timestamp DESC;

-- Execution: <5ms
-- Uses: idx_backups_modId
```

#### 5. Find Expired Backups

```sql
-- Get backups that expired (for cleanup)
SELECT id, modId, gameAppId, path, size
FROM backups
WHERE expiresAt IS NOT NULL
  AND expiresAt < ?  -- Current timestamp
ORDER BY expiresAt;

-- Execution: <10ms
-- Uses: idx_backups_expiresAt
```

#### 6. Check for Dependency Conflicts

```sql
-- Find mods that depend on mod X
SELECT 
  a.id, a.title, a.dependencies
FROM installed_mods a
WHERE gameAppId = ?
  AND dependencies LIKE ?;  -- '%"mod-id"%'

-- Execution: 100-500ms (JSON parsing is slow)
-- NOTE: Needs JSON library for better performance
```

#### 7. Statistics Query

```sql
-- Get statistics for a game
SELECT 
  COUNT(*) as total_mods,
  SUM(CASE WHEN enabled=1 THEN 1 ELSE 0 END) as enabled_mods,
  SUM(CASE WHEN enabled=0 THEN 1 ELSE 0 END) as disabled_mods,
  SUM(fileSize) as total_size_bytes,
  COUNT(DISTINCT status) as unique_statuses
FROM installed_mods
WHERE gameAppId = ?;

-- Execution: ~50ms (counts all rows)
```

#### 8. Duplicate Check

```sql
-- Check if mod already installed (for uniqueness)
SELECT id, status 
FROM installed_mods
WHERE gameAppId = ? AND fileId = ?;

-- Execution: <5ms
-- Note: UNIQUE constraint enforces this automatically
```

### Insert Operations

#### Add New Mod

```typescript
// TypeScript code in ModsDatabaseService
async addInstalledMod(modInfo: ModInfo): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const now = Date.now();
    
    this.db.run(`
      INSERT OR REPLACE INTO installed_mods (
        id, gameAppId, fileId, title, author, description,
        version, source, installPath, fileSize, fileUrl,
        previewUrl, tags, dependencies, enabled, loadOrder,
        status, malwareScanStatus, installedAt, lastUpdatedAt,
        lastEnabledAt, checksums, metadata, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      modInfo.id,
      modInfo.gameAppId,
      modInfo.id,  // Use modInfo.id as fileId
      modInfo.title,
      modInfo.author,
      modInfo.description,
      modInfo.version,
      modInfo.source,
      modInfo.installPath,
      modInfo.fileSize,
      modInfo.fileUrl,
      modInfo.previewUrl,
      JSON.stringify(modInfo.tags),
      JSON.stringify(modInfo.dependencies),
      modInfo.enabled ? 1 : 0,
      modInfo.loadOrder,
      modInfo.status,
      'not_scanned',
      modInfo.installedAt,
      modInfo.lastUpdatedAt,
      modInfo.lastEnabledAt || null,
      JSON.stringify(modInfo.checksums || {}),
      JSON.stringify(modInfo.metadata || {}),
      now,
      now
    ], function(err) {
      if (err) {
        reject(err);
      } else {
        resolve(true);
      }
    });
  });
}

// SQL Execution: ~20ms
// Note: INSERT OR REPLACE allows upsert pattern
```

#### Add Backup Record

```typescript
async addBackup(backupInfo: BackupInfo): Promise<boolean> {
  const now = Date.now();
  
  return this.db.run(`
    INSERT INTO backups (
      id, modId, gameAppId, timestamp, status, size, path,
      createdBy, notes, fileCount, checksumValid, lastVerified,
      expiresAt, metadata, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    backupInfo.id,
    backupInfo.modId,
    backupInfo.gameAppId,
    backupInfo.timestamp,
    backupInfo.status,
    backupInfo.size,
    backupInfo.path,
    backupInfo.createdBy,
    backupInfo.notes || null,
    backupInfo.fileCount,
    backupInfo.checksumValid ? 1 : 0,
    backupInfo.lastVerified || null,
    backupInfo.expiresAt || null,
    JSON.stringify({
      realDataSize: backupInfo.realDataSize,
      hardlinkCount: backupInfo.hardlinkCount,
      usedHardlinks: backupInfo.usedHardlinks,
      deduplicationRatio: backupInfo.realDataSize / backupInfo.size
    }),
    now,
    now
  ]);
}

// SQL Execution: ~15ms
```

### Update Operations

#### Update Mod Status

```sql
UPDATE installed_mods
SET status = ?, enabled = ?, lastUpdatedAt = ?, updatedAt = ?
WHERE id = ?;

-- Execution: ~5ms
-- Parameters: ('installed', 1, 1690000000, 1690000000, 'mod-123')
```

#### Update Backup Status

```sql
UPDATE backups
SET status = ?, checksumValid = ?, lastVerified = ?, updatedAt = ?
WHERE id = ?;

-- Execution: ~5ms
-- Parameters: ('completed', 1, 1690000000, 1690000000, 'backup-123')
```

#### Disable All Mods (toggle)

```sql
UPDATE installed_mods
SET enabled = 0, lastUpdatedAt = ?, updatedAt = ?
WHERE gameAppId = ? AND status != 'corrupted';

-- Execution: ~20ms (multiple rows)
```

### Delete Operations

#### Delete Mod (cascades to backups)

```sql
DELETE FROM installed_mods WHERE id = ?;

-- Execution: ~10ms
-- Side effect: All backups for this mod also deleted (CASCADE)
```

#### Delete Old Backups (retention cleanup)

```sql
DELETE FROM backups
WHERE expiresAt IS NOT NULL AND expiresAt < ?;

-- Execution: 10-100ms (depends on count)
-- Parameters: (current_timestamp)
```

#### Delete Backup Only (without mod)

```sql
DELETE FROM backups WHERE id = ?;

-- Execution: ~5ms
-- Note: Mod remains (no cascade)
```

---

## Data Retention Policies

### Automatic Cleanup Rules

```typescript
// BackupManager cleanup logic
async cleanupOldBackups(gameId: string, options?: CleanupOptions) {
  const backups = await this.listBackups(gameId);
  const now = Date.now();
  
  const retentionDays = options?.retentionDays || 7;
  const keepLatestCount = options?.keepLatestCount || 3;
  const cutoffTime = now - (retentionDays * 24 * 60 * 60 * 1000);
  
  let deletedCount = 0;
  
  for (let i = 0; i < backups.length; i++) {
    // Rule 1: Always keep N latest backups (regardless of age)
    if (i < keepLatestCount) continue;
    
    // Rule 2: Delete if older than retention period
    if (backups[i].createdAt < cutoffTime) {
      await this.deleteBackup(gameId, backups[i].id);
      deletedCount++;
    }
  }
  
  return deletedCount;
}
```

### Retention Policy Example

```
Configuration:
  defaultRetentionDays: 7
  defaultKeepCount: 3
  maxBackups: 10

Scenario with 8 backups:
  Backup 1: 15 days old  → DELETE (older than 7 days)
  Backup 2: 12 days old  → DELETE (older than 7 days)
  Backup 3: 10 days old  → DELETE (older than 7 days)
  Backup 4:  8 days old  → DELETE (older than 7 days, position 4)
  Backup 5:  6 days old  → KEEP  (not old enough)
  Backup 6:  4 days old  → KEEP  (position 2)
  Backup 7:  2 days old  → KEEP  (position 1 - newest)
  Backup 8:  1 day old   → KEEP  (position 0 - absolute newest)

Result: 4 backups deleted, 4 remaining (all within 7 days)
```

### Query: Find Old Records

```sql
-- Backups older than 30 days
SELECT id, modId, gameAppId, timestamp, size, path
FROM backups
WHERE timestamp < (strftime('%s','now') * 1000) - (30 * 24 * 60 * 60 * 1000)
ORDER BY timestamp;

-- Execution: <20ms
-- Uses: idx_backups_timestamp
```

---

## Backup & Restore

### Database Backup Procedure

```bash
# Backup database (periodic, e.g., daily)
# Windows
xcopy %APPDATA%\YCore\mods-database.db %APPDATA%\YCore\backups\mods-database.db.YYYY-MM-DD /Y

# macOS/Linux
cp ~/.config/Y-Core/mods-database.db ~/.config/Y-Core/backups/mods-database.db.$(date +%Y-%m-%d)

# Compress backup
gzip ~/.config/Y-Core/backups/mods-database.db.2026-07-29

# Resulting size: ~100 KB compressed (from ~2-10 MB uncompressed)
```

### Database Restore Procedure

```bash
# Close application first
killall y-core 2>/dev/null

# Restore from backup
# macOS/Linux
cp ~/.config/Y-Core/backups/mods-database.db.2026-07-29 ~/.config/Y-Core/mods-database.db

# Or decompress if gzipped
gunzip -c ~/.config/Y-Core/backups/mods-database.db.2026-07-29.gz > ~/.config/Y-Core/mods-database.db

# Verify integrity
sqlite3 ~/.config/Y-Core/mods-database.db "PRAGMA integrity_check;"

# Should return "ok" if valid

# Restart application
y-core
```

### Disaster Recovery

```bash
# If database corrupted beyond repair:

# 1. Backup corrupted file for analysis
cp ~/.config/Y-Core/mods-database.db ~/.config/Y-Core/mods-database.db.corrupted

# 2. Delete corrupted file
rm ~/.config/Y-Core/mods-database.db

# 3. Restart application
# Y-Core will auto-create new schema
y-core

# 4. Re-install mods from backup list
# Use backup restore to get mods back
```

---

## Migration Strategy

### Schema Versioning

```sql
-- Version table (optional)
CREATE TABLE schema_version (
  version INTEGER PRIMARY KEY,
  description TEXT,
  installed_at INTEGER
);

INSERT INTO schema_version VALUES (1, 'Initial schema', datetime('now'));
```

### Migration Pattern

```typescript
// ModsDatabaseService
private async runMigrations(): Promise<void> {
  // Migrations array
  const migrations = [
    {
      version: 1,
      name: 'Initial schema',
      up: async (db) => {
        // Create tables
      },
      down: async (db) => {
        // Drop tables (not used in production)
      }
    },
    {
      version: 2,
      name: 'Add scan results table',
      up: async (db) => {
        await db.run(`
          CREATE TABLE IF NOT EXISTS scan_results (
            id TEXT PRIMARY KEY,
            modId TEXT NOT NULL,
            timestamp INTEGER NOT NULL,
            status TEXT NOT NULL,
            threatLevel TEXT,
            details TEXT,
            FOREIGN KEY(modId) REFERENCES installed_mods(id)
          )
        `);
      }
    }
  ];
  
  // Get current version
  const currentVersion = await this.getCurrentSchemaVersion();
  
  // Run pending migrations
  for (const migration of migrations) {
    if (migration.version > currentVersion) {
      await migration.up(this.db);
      await this.recordMigration(migration.version, migration.name);
    }
  }
}
```

### Example Migration: v1 → v2

```typescript
// Add new table for scan results
migration_002: async (db) => {
  // Create new table
  await db.run(`
    CREATE TABLE scan_results (
      id TEXT PRIMARY KEY,
      modId TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      overallStatus TEXT NOT NULL,
      filesScanned INTEGER,
      filesQuarantined INTEGER,
      duration INTEGER,
      details TEXT,
      recommendation TEXT,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL,
      FOREIGN KEY(modId) REFERENCES installed_mods(id) ON DELETE CASCADE
    )
  `);
  
  // Create indexes
  await db.run(`
    CREATE INDEX idx_scan_results_modId ON scan_results(modId)
  `);
  
  await db.run(`
    CREATE INDEX idx_scan_results_timestamp ON scan_results(timestamp DESC)
  `);
  
  // Migrate old scan data if exists (example)
  const oldScans = await db.all(`
    SELECT modId, malwareScanStatus, lastUpdatedAt 
    FROM installed_mods 
    WHERE malwareScanStatus != 'not_scanned'
  `);
  
  for (const scan of oldScans) {
    await db.run(`
      INSERT INTO scan_results 
      (id, modId, timestamp, overallStatus, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [
      `scan-${Date.now()}-${Math.random()}`,
      scan.modId,
      scan.lastUpdatedAt,
      scan.malwareScanStatus,
      Date.now(),
      Date.now()
    ]);
  }
}
```

### Forward Compatibility

```typescript
// Always use PRAGMA statements for compatibility
this.db.run("PRAGMA journal_mode=WAL");      // Write-Ahead Logging
this.db.run("PRAGMA synchronous=NORMAL");    // Balance speed/safety
this.db.run("PRAGMA temp_store=MEMORY");     // Speed up temp operations
this.db.run("PRAGMA cache_size=10000");      // Cache size in pages
this.db.run("PRAGMA foreign_keys=ON");       // Enforce foreign keys
```

---

## Common Queries Reference

### Game-Based Queries

```sql
-- Total stats for a game
SELECT 
  gameAppId,
  COUNT(*) as total_mods,
  SUM(CASE WHEN enabled=1 THEN 1 ELSE 0 END) as enabled,
  SUM(CASE WHEN status='corrupted' THEN 1 ELSE 0 END) as corrupted,
  SUM(fileSize) as total_size
FROM installed_mods
GROUP BY gameAppId;

-- Top 10 largest mods
SELECT title, author, fileSize
FROM installed_mods
WHERE gameAppId = ?
ORDER BY fileSize DESC
LIMIT 10;

-- Mods by update date (for changelog)
SELECT id, title, lastUpdatedAt
FROM installed_mods
WHERE gameAppId = ?
ORDER BY lastUpdatedAt DESC
LIMIT 20;
```

### Backup Analysis

```sql
-- Backup statistics by game
SELECT 
  gameAppId,
  COUNT(*) as total_backups,
  SUM(size) as total_apparent_size,
  SUM(CAST(json_extract(metadata, '$.realDataSize') AS INTEGER)) as total_real_size,
  MAX(timestamp) as latest_backup
FROM backups
GROUP BY gameAppId;

-- Deduplication effectiveness
SELECT 
  modId,
  COUNT(*) as backup_count,
  SUM(size) as apparent_total,
  SUM(CAST(json_extract(metadata, '$.realDataSize') AS INTEGER)) as real_total,
  CAST(SUM(CAST(json_extract(metadata, '$.realDataSize') AS INTEGER)) * 100.0 / 
       SUM(size) AS INTEGER) || '%' as dedup_ratio
FROM backups
GROUP BY modId
ORDER BY backup_count DESC
LIMIT 10;

-- Failed backups
SELECT id, modId, gameAppId, status, notes, timestamp
FROM backups
WHERE status IN ('failed', 'corrupted')
ORDER BY timestamp DESC;
```

### Data Quality Checks

```sql
-- Mods with missing checksums
SELECT id, title, checksums
FROM installed_mods
WHERE checksums IS NULL OR checksums = '{}';

-- Backup integrity issues
SELECT id, modId, checksumValid, lastVerified
FROM backups
WHERE checksumValid = 0 OR lastVerified IS NULL;

-- Orphaned records (shouldn't happen with FK constraints)
SELECT id FROM backups
WHERE modId NOT IN (SELECT id FROM installed_mods);
```

---

## Performance Tips

1. **Always use indexes**: Queries with indexed columns run 10-100x faster
2. **Batch operations**: Use transactions for multiple inserts/updates
3. **Avoid LIKE with wildcards**: Use indexed searches when possible
4. **Monitor query performance**: Use EXPLAIN QUERY PLAN
5. **Periodic maintenance**: Run VACUUM to reclaim space
6. **JSON extraction**: Use json_extract() for efficient JSON queries
7. **Pagination**: Use LIMIT and OFFSET for large result sets
8. **Caching layer**: Cache frequently accessed data in memory

---

**Document Version:** 1.0  
**Last Updated:** 2026-07-29  
**Status:** Complete Schema Reference
