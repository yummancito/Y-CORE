# Y-Core Mod Manager: Database State & Crash Error Catalog

**Version:** 1.0  
**Last Updated:** 2026-07-29  
**Severity Levels:** CRITICAL, HIGH, MEDIUM, LOW

---

## Overview

This document catalogs 25+ database corruption, state machine, and crash recovery errors in the Y-Core Mod Manager. Each error includes reproduction scenarios, impact assessment, detection mechanisms, and recovery procedures.

### Architecture Context

- **Database:** SQLite (`mods-database.db`) - installed_mods and backups tables
- **Backup System:** Hardlink-based with filesystem detection and operation locks
- **Mod Installer:** Multi-stage installation with backup, scan, download, extract, database update
- **IPC Layer:** Electron ipcMain handlers bridge renderer and backend services
- **Concurrency:** Limited - operation locks per game, no cross-process file locking

---

## CRITICAL ERRORS

### ERROR #1: Unfinished Transaction Leaves Database Locked

**Severity:** CRITICAL  
**Impact:** App becomes unresponsive; all database queries hang indefinitely  
**Affected Files:**
- `electron/services/mods-database.service.ts` (lines 70-203, migration transaction)
- Individual operations: INSERT/UPDATE/DELETE lack transaction wrapping

**Scenario:**
1. App starts, migration begins: `BEGIN TRANSACTION` (line 72)
2. App crashes during table creation (line 80-114)
3. SQLite holds lock on database
4. App restarts, tries to open database
5. Migration code tries to acquire lock again - **DEADLOCK**
6. User sees frozen UI, database queries time out after `busyTimeout` (5000ms)

**Root Causes:**
- Nested callbacks make transaction incomplete if any step fails
- No error recovery inside transaction - rollback not guaranteed
- Callback chain doesn't catch errors at every step (e.g., index creation failures, lines 146-194)

**Detection:**
```sql
-- Query to detect locked database
PRAGMA database_list;
-- Monitor file locks (Windows): Handle.exe mods-database.db
-- Linux: lsof | grep mods-database.db
```

**Recovery Procedure:**
1. Kill all Y-Core processes holding database handle
2. Delete `mods-database.db` to force fresh migration
3. Restart app
4. Alternative: Back up corrupted database and restore from backup

**Fix Priority:** P0 - Implement transaction wrapper with guaranteed rollback:
```typescript
private async runMigrations(): Promise<void> {
  return new Promise((resolve, reject) => {
    this.db!.serialize(() => {
      this.db!.run('BEGIN TRANSACTION', (beginErr) => {
        if (beginErr) return reject(beginErr);
        
        const cleanup = (err?: Error) => {
          if (err) {
            this.db!.run('ROLLBACK', () => reject(err));
          } else {
            this.db!.run('COMMIT', (commitErr) => {
              commitErr ? reject(commitErr) : resolve();
            });
          }
        };
        
        this.createTables(cleanup); // Flatten callback chain
      });
    });
  });
}
```

---

### ERROR #2: Backup Creation Aborted Mid-Hardlink, Cleanup Incomplete

**Severity:** CRITICAL  
**Impact:** Orphaned hardlinks, zombie backup directory, 10+ GB disk waste per abort  
**Affected Files:**
- `electron/modules/mod-manager/backup-manager.ts` (lines 408-451, 454-491)
- `electron/modules/mod-manager/mod-installer.ts` (lines 49-224)

**Scenario:**
1. User initiates backup creation via `handleInstallMod` (line 138 in mods.handler.ts)
2. Backup creator processes 500 files with hardlinks (line 424)
3. User cancels at 60% progress via UI cancel button
4. `BackupCreator.abort()` sets flag (line 571)
5. Loop exits on next iteration but files already hardlinked remain
6. Backup directory not deleted, metadata not recorded
7. Restart app - backup in zombie state (no metadata, orphaned files)

**Root Causes:**
- `abort()` method only sets flag, doesn't clean up partial backups (line 570-572)
- No cleanup handler if abort called
- Backup metadata only written after creation completes (line 660)
- No transaction boundary for backup creation

**Impact Example:**
- 500 files × 50MB = 25GB backup
- User cancels at 60% = 15GB orphaned hardlinks
- Each hardlink file still takes inode space (Windows NTFS)
- No database record means UI doesn't show it, but disk space wasted

**Detection:**
```typescript
// Find orphaned backup directories without metadata
const backupDirs = fs.readdirSync(backupsDir);
for (const gameDir of backupDirs) {
  const gamePath = path.join(backupsDir, gameDir);
  const backups = fs.readdirSync(gamePath);
  for (const backupId of backups) {
    const metadataFile = path.join(gamePath, backupId, 'backup-metadata.json');
    if (!fs.existsSync(metadataFile)) {
      console.log(`ORPHANED: ${gameDir}/${backupId}`);
    }
  }
}
```

**Recovery Procedure:**
1. Identify orphaned backup directories (no metadata)
2. Delete entire directory: `fs.rmSync(backupDir, { recursive: true, force: true })`
3. Verify cleanup with disk space reclaim
4. Add orphaned backup cleanup task to startup routine

**Fix Priority:** P0 - Implement proper abort/cleanup:
```typescript
async abort(): Promise<void> {
  this.aborted = true;
  
  // Delete partial backup
  try {
    if (fs.existsSync(this.destPath)) {
      fs.rmSync(this.destPath, { recursive: true, force: true });
      logger.info(`Backup aborted and cleaned up: ${this.destPath}`);
    }
  } catch (err) {
    logger.error(`Failed to cleanup aborted backup: ${err}`);
    throw err;
  }
}
```

---

### ERROR #3: Database FK Constraint Violation - Backup References Deleted Mod

**Severity:** CRITICAL  
**Impact:** Orphaned backup records, cascade delete failures, data inconsistency  
**Affected Files:**
- `electron/services/mods-database.service.ts` (line 135, foreign key definition)
- `electron/modules/mod-manager/mod-installer.ts` (line 268, delete operation)

**Scenario:**
1. User has mod A installed with 3 backups in database
2. Mod A files deleted externally (user manually deleted folder)
3. User clicks uninstall for mod A
4. `uninstallMod()` calls `deleteInstalledMod()` (line 268)
5. SQLite attempts to cascade delete backups (FK ON DELETE CASCADE)
6. Backup record deleted but backup files still exist on disk
7. Database state: ✓ mod deleted, ✓ backups deleted
8. Filesystem state: ✗ backup files orphaned, consuming disk space

**Root Causes:**
- Schema has `FOREIGN KEY(modId) REFERENCES installed_mods(id) ON DELETE CASCADE` (line 135)
- But backup file deletion not atomic with database deletion
- No verification that backup files exist before deleting record
- App crashes after FK cascade, before filesystem cleanup completes

**Impact Cascade:**
```
installed_mods (id=mod-123) DELETED
  ↓ (cascade)
backups (modId=mod-123) DELETED from DB
  ↓ (but filesystem operations fail)
/backups/game-999/mod-123/backup-*.zip [ORPHANED]
```

**Detection:**
```sql
-- Find orphaned backup files (exist in filesystem but not in DB)
SELECT COUNT(*) as orphaned_count 
FROM installed_mods 
WHERE NOT EXISTS (
  SELECT 1 FROM backups WHERE backups.modId = installed_mods.id
) AND id IN (SELECT modId FROM backups);

-- Check for referenced backups whose mod is missing
SELECT b.id, b.modId FROM backups b
WHERE NOT EXISTS (SELECT 1 FROM installed_mods WHERE id = b.modId);
```

**Recovery Procedure:**
1. Find orphaned backup records:
   ```sql
   SELECT * FROM backups WHERE modId NOT IN (SELECT id FROM installed_mods);
   ```
2. Delete records and manually remove backup files
3. Rebuild database indexes: `VACUUM; ANALYZE;`

**Fix Priority:** P0 - Separate cascade delete into two steps:
```typescript
async deleteInstalledMod(modId: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    // Step 1: Get all backup IDs for cleanup
    this.db!.all(
      'SELECT id FROM backups WHERE modId = ?',
      [modId],
      (err, backupIds: any[]) => {
        if (err) return reject(err);
        
        // Step 2: Delete mod record (cascade deletes backups)
        this.db!.run('DELETE FROM installed_mods WHERE id = ?', [modId], (deleteErr) => {
          if (deleteErr) return reject(deleteErr);
          
          // Step 3: Clean up backup files asynchronously
          for (const backup of backupIds) {
            this.deleteBackupFiles(backup.id).catch(err => 
              logger.warn(`Backup file cleanup failed: ${err}`)
            );
          }
          
          resolve(true);
        });
      }
    );
  });
}
```

---

### ERROR #4: Mod Installer Crashes During Extraction, Partial Files Left Behind

**Severity:** CRITICAL  
**Impact:** Corrupted mod installation, game crashes when loading mod, disk space wasted  
**Affected Files:**
- `electron/modules/mod-manager/mod-installer.ts` (lines 115-121, 445-454)
- `electron/handlers/mods.handler.ts` (lines 128-195)

**Scenario:**
1. Install workflow in progress (backup created, scan passed, download complete)
2. Extract stage begins: `extractModFiles(downloadPath, extractPath)` (line 121)
3. Extract writes files to `installPath/modId/` directory
4. 500 files extracted, then app crashes on file #501 due to:
   - Disk full mid-extraction
   - Permission denied on extracted file
   - Path length exceeds Windows MAX_PATH (260 chars)
   - Antivirus quarantines extracted file
5. App restarts with incomplete mod installation
6. Database says mod "installed" (line 152, `status: 'installed'`)
7. But actual mod files are partial/corrupt
8. Game attempts to load mod → crash with missing dependencies

**Root Causes:**
- `extract()` from cross-zip library doesn't support resume/verify (line 447)
- No checksum verification after extraction (line 121)
- Database updated AFTER extraction but rollback happens DURING extraction failure
- Installation progress marked complete even if extraction fails silently
- Temporary download file cleaned up even if extraction fails (line 159)

**Impact Severity:**
- Player starts game, mod loads partially, game crashes
- Mod disabled but files corrupted - uninstall also fails
- Database state: `installed=1`, Filesystem state: `corrupted=1`
- Mod stuck in "corrupted" state requiring manual file deletion

**Detection:**
```typescript
// Check installed mods for missing files
async detectCorruptedMods(gameAppId: string): Promise<string[]> {
  const mods = await modsDatabaseService.getGameMods(gameAppId);
  const corrupted: string[] = [];
  
  for (const mod of mods) {
    if (!fs.existsSync(mod.installPath)) {
      corrupted.push(mod.id);
    } else {
      // Verify expected files exist
      const files = fs.readdirSync(mod.installPath);
      if (files.length === 0) corrupted.push(mod.id);
    }
  }
  
  return corrupted;
}
```

**Recovery Procedure:**
1. Identify corrupted mods:
   - `SELECT * FROM installed_mods WHERE installPath NOT IN (SELECT path WHERE fs.existsSync(path))`
2. Mark as "corrupted": `UPDATE installed_mods SET status = 'corrupted' WHERE id = ?`
3. Delete corrupted directory: `fs.rmSync(installPath, { recursive: true, force: true })`
4. Delete database record: `DELETE FROM installed_mods WHERE id = ?`
5. User can reinstall

**Fix Priority:** P0 - Verify installation integrity:
```typescript
// Step 1: Verify extraction succeeded
const extractPath = path.join(options.installDir, options.modId);
const extractedFiles = fs.readdirSync(extractPath);
if (extractedFiles.length === 0) {
  throw new Error('Extraction produced no files - possible corruption');
}

// Step 2: Calculate checksum of extracted files
const extractChecksum = await this.calculateDirectoryChecksum(extractPath);

// Step 3: Store checksum in database for later verification
modInfo.metadata = JSON.stringify({
  extractionChecksum: extractChecksum,
  extractedAt: Date.now(),
  extractedFileCount: extractedFiles.length,
});

// Step 4: Only update DB after verification succeeds
await modsDatabaseService.addInstalledMod(modInfo);
```

---

### ERROR #5: Restore Backup Overwrites Current Mod Without Backup

**Severity:** CRITICAL  
**Impact:** User loses current mod installation, no way to recover  
**Affected Files:**
- `electron/modules/mod-manager/mod-installer.ts` (lines 399-420)
- `electron/modules/mod-manager/backup-manager.ts` (lines 693-778)

**Scenario:**
1. User has mod A v2 installed (latest version)
2. User restores backup of mod A v1 from 2 weeks ago
3. `restoreBackup()` called (line 399)
4. Current installation directory cleared: `fs.rmSync(installPath, { recursive: true, force: true })` (line 408)
5. Backup extracted to directory (line 412)
6. Extract fails midway (disk full)
7. Directory is now empty - mod v2 GONE, mod v1 INCOMPLETE
8. User loses 2 weeks of mod updates, plus current version

**Root Causes:**
- No snapshot/backup of current state before restore begins (line 407)
- Destructive delete before restore: deletes current THEN restores (wrong order)
- No atomic restore operation - multiple steps not wrapped in transaction
- No rollback mechanism if restore fails

**Impact:**
```
BEFORE: /mods/mod-A/ -> [mod-A v2 complete]
DELETE: /mods/mod-A/ -> [EMPTY]
EXTRACT: /mods/mod-A/ -> [mod-A v1 PARTIAL - extraction failed]
RESULT: [DATA LOSS]
```

**Detection:**
```typescript
// Check for partial mod installations
async findPartialMods(installDir: string): Promise<string[]> {
  const partial: string[] = [];
  const mods = fs.readdirSync(installDir);
  
  for (const modId of mods) {
    const modPath = path.join(installDir, modId);
    const stats = fs.statSync(modPath);
    
    // If directory is suspiciously small, might be partial
    if (stats.size < 1024 * 1024) { // < 1MB
      const files = fs.readdirSync(modPath);
      if (files.length === 0 || files.length === 1) {
        partial.push(modId);
      }
    }
  }
  
  return partial;
}
```

**Recovery Procedure:**
1. If backup of current version exists, restore it
2. If not, notify user of data loss
3. Delete corrupted partial restore
4. Reinstall from catalog

**Fix Priority:** P0 - Snapshot current before restore:
```typescript
async restoreBackup(
  gameId: string,
  backupId: string,
  options?: RestoreBackupOptions
): Promise<void> {
  const unlock = await this.acquireLock(gameId);
  
  try {
    const backupInfo = await this.getBackupInfo(gameId, backupId);
    if (!backupInfo) throw new Error(`Backup not found: ${gameId}/${backupId}`);
    
    // CRITICAL: Step 1 - Create snapshot of CURRENT state BEFORE restore
    const snapshotBackupId = await this.createBackup(backupInfo.path, gameId, {
      skipCleanup: true,
      description: `Pre-restore snapshot before restoring ${backupId}`
    });
    
    try {
      // Step 2 - NOW proceed with restore
      const backupDir = path.join(this.config.backupsDir!, gameId, backupId);
      const gameInstallDir = backupInfo.path; // Stored in backup metadata
      
      // Step 3 - Clear destination ATOMICALLY (move to temp, not delete)
      const tempDir = path.join(this.config.backupsDir!, gameId, `.tmp-${backupId}`);
      if (fs.existsSync(gameInstallDir)) {
        fs.renameSync(gameInstallDir, tempDir);
      }
      
      try {
        // Step 4 - Restore
        fs.cpSync(backupDir, gameInstallDir, { recursive: true, force: true });
        
        // Step 5 - Verify restore succeeded
        const restoredFiles = fs.readdirSync(gameInstallDir);
        if (restoredFiles.length === 0) {
          throw new Error('Restore produced empty directory');
        }
        
        // Step 6 - Clean up temp (old installation)
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch (err) {
        // Restore failed - recover from temp
        fs.rmSync(gameInstallDir, { recursive: true, force: true });
        fs.renameSync(tempDir, gameInstallDir);
        throw err;
      }
    } catch (restoreErr) {
      logger.error(`Restore failed, snapshot created at ${snapshotBackupId}`);
      throw restoreErr;
    }
  } finally {
    unlock();
  }
}
```

---

## HIGH SEVERITY ERRORS

### ERROR #6: Database Locked by Another Process, Query Hangs

**Severity:** HIGH  
**Impact:** Application freeze, UI becomes unresponsive, 5-second hang minimum  
**Affected Files:**
- `electron/services/mods-database.service.ts` (line 52, busyTimeout config)
- All query methods: `getGameMods`, `queryMods`, `getStatistics`, etc.

**Scenario:**
1. App opens database with default `busyTimeout(5000)` (line 52)
2. User opens file explorer, copies database file for backup
3. File copy operation holds exclusive lock on database
4. UI clicks "List Mods" → `getGameMods()` query issued
5. SQLite tries to acquire read lock, fails (exclusive lock held)
6. Query waits for 5 seconds (busyTimeout)
7. UI frozen for 5 seconds before either query succeeds or times out

**Root Causes:**
- SQLite has exclusive locks during VACUUM, PRAGMA statements, backups
- No check for database accessibility before open
- busyTimeout only delays - doesn't solve underlying lock contention
- Multiple database handles can be open (one per import)

**Frequency:**
- High if user backs up database while app running
- High if antivirus scanning database file
- High if system restore point creation locks database

**Detection:**
```sql
-- Check database lock status
PRAGMA query_only; -- Try read-only test
-- If fails: database is locked
```

**Recovery Procedure:**
1. Close file explorer/backup tool holding lock
2. Restart app if frozen longer than 5 seconds
3. Implement database connection pool to detect locks early

**Fix Priority:** P1 - Add preemptive lock detection:
```typescript
async initialize(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (this.initialized) return resolve();
    
    // Test database accessibility BEFORE opening
    if (fs.existsSync(this.dbPath)) {
      try {
        // Try to open file exclusively to detect locks
        const handle = fs.openSync(this.dbPath, 'r');
        fs.closeSync(handle);
      } catch (err) {
        return reject(new Error(`Database file locked or inaccessible: ${err.message}`));
      }
    }
    
    this.db = new sqlite3.Database(this.dbPath, (err) => {
      if (err) return reject(err);
      
      this.db!.configure('busyTimeout', 10000); // Increase to 10s
      this.runMigrations()
        .then(() => {
          this.initialized = true;
          resolve();
        })
        .catch(reject);
    });
  });
}
```

---

### ERROR #7: Backup Metadata Corrupted, JSON Parse Fails

**Severity:** HIGH  
**Impact:** Cannot restore any backups for affected mod, restore feature breaks  
**Affected Files:**
- `electron/modules/mod-manager/backup-manager.ts` (lines 918-932, metadata parsing)
- `electron/modules/mod-manager/backup-manager.ts` (lines 937-940, metadata save)

**Scenario:**
1. Create backup - metadata written to `backup-metadata.json` (line 939)
2. App crashes while writing metadata (file handle not flushed)
3. Metadata file contains partial JSON (e.g., `{"id":"backup-123","gameId":`)
4. User restarts, tries to list backups: `listBackups()` (line 810)
5. Code tries to parse corrupted JSON: `JSON.parse(fs.readFileSync(metadataFile, 'utf-8'))` (line 926)
6. Throws SyntaxError, backup skipped with warning
7. User cannot see backup exists, cannot restore it

**Root Causes:**
- No fsync/flush guarantee before metadata write completes (line 939)
- JSON.parse wrapped in try-catch that silently continues (line 926)
- No backup copy of metadata (write-once file)
- No CRC/checksum verification of metadata file

**Impact:**
```json
// Valid metadata
{"id":"backup-123","gameId":"game-999","path":"/backups/...","createdAt":1234567890}

// Corrupted metadata (partial write)
{"id":"backup-123","gameId":"game-999","path":"/backups/...",
```

**Detection:**
```typescript
// Find corrupted metadata files
const backupDirs = fs.readdirSync(backupsDir, { recursive: true });
for (const file of backupDirs) {
  if (file.endsWith('backup-metadata.json')) {
    try {
      const content = fs.readFileSync(file, 'utf-8');
      JSON.parse(content);
    } catch (err) {
      console.log(`CORRUPTED: ${file}`);
    }
  }
}
```

**Recovery Procedure:**
1. Identify corrupted metadata files (see detection above)
2. If backup files intact, manually recreate metadata
3. Delete backup if cannot be recovered
4. Implement weekly metadata integrity checks

**Fix Priority:** P1 - Add metadata integrity verification:
```typescript
private async saveBackupMetadata(backupInfo: BackupInfo): Promise<void> {
  const metadataFile = path.join(backupInfo.path, METADATA_FILENAME);
  const tempFile = path.join(backupInfo.path, `${METADATA_FILENAME}.tmp`);
  
  // Write to temp file first
  fs.writeFileSync(tempFile, JSON.stringify(backupInfo, null, 2));
  
  // Verify temp file is valid JSON
  try {
    JSON.parse(fs.readFileSync(tempFile, 'utf-8'));
  } catch (err) {
    fs.unlinkSync(tempFile);
    throw new Error(`Metadata verification failed: ${err.message}`);
  }
  
  // Atomic rename (Windows: replace old with new)
  if (fs.existsSync(metadataFile)) {
    const backupFile = `${metadataFile}.backup`;
    fs.renameSync(metadataFile, backupFile);
    try {
      fs.renameSync(tempFile, metadataFile);
      fs.unlinkSync(backupFile);
    } catch (err) {
      fs.renameSync(backupFile, metadataFile); // Restore
      throw err;
    }
  } else {
    fs.renameSync(tempFile, metadataFile);
  }
}
```

---

### ERROR #8: Operation Lock Released Early, Concurrent Backup + Restore

**Severity:** HIGH  
**Impact:** Two backup operations on same game overlap, corrupted backup created  
**Affected Files:**
- `electron/modules/mod-manager/backup-manager.ts` (lines 597-622, lock acquire/release)
- `electron/modules/mod-manager/backup-manager.ts` (lines 628-687, createBackup with lock)

**Scenario:**
1. User creates backup for game A (acquires lock, line 638)
2. Backup operation in progress...
3. Lock resolver called incorrectly / Promise chain broken
4. Lock released before backup actually completes
5. User starts another backup (acquires lock again - shouldn't be available)
6. Two backup operations run simultaneously:
   - Backup 1: Hardlinking files (50% done)
   - Backup 2: Creating backup directory and starting hardlinks
7. Both try to hardlink same file → failure on second
8. Backup directory corruption, hardlink inode conflicts

**Root Causes:**
- Lock resolver created but not properly awaited (line 608-609)
- If `BackupCreator.create()` takes longer than expected, lock appears released
- No timeout on lock acquisition
- No verification lock actually held before operations begin

**Concurrency Issue:**
```typescript
// Current code - PROBLEMATIC
private async acquireLock(gameId: string): Promise<() => void> {
  const lockKey = `lock-${gameId}`;
  const existingLock = this.operationLocks.get(lockKey);
  
  if (existingLock) {
    await existingLock; // Wait for previous lock
  }
  
  let resolver: () => void;
  const newLock = new Promise<void>(resolve => {
    resolver = resolve; // Promise created but resolver not immediately stored
  });
  
  this.operationLocks.set(lockKey, newLock);
  this.lockResolvers.set(lockKey, resolver!); // !! Might be called before operation completes
  
  return () => {
    this.operationLocks.delete(lockKey);
    const unlock = this.lockResolvers.get(lockKey);
    this.lockResolvers.delete(lockKey);
    if (unlock) unlock();
  };
}
```

**Detection:**
```typescript
// Check for concurrent operations on same game
const activeOps = new Map();
for (const [key, value] of backupManager.activeOperations) {
  const gameId = key.split('-')[1]; // Extract game ID from key
  if (!activeOps.has(gameId)) activeOps.set(gameId, []);
  activeOps.get(gameId).push(key);
}

for (const [gameId, ops] of activeOps) {
  if (ops.length > 1) {
    console.log(`CONCURRENT OPS on ${gameId}:`, ops);
  }
}
```

**Recovery Procedure:**
1. Stop all backup operations
2. Delete corrupted backup directories
3. Verify all locks released before restart
4. Re-implement lock with guaranteed timeout

**Fix Priority:** P1 - Use timeout-based locks:
```typescript
private async acquireLock(gameId: string, timeoutMs = 300000): Promise<() => void> {
  const lockKey = `lock-${gameId}`;
  let resolver: (() => void) | null = null;
  let timeoutHandle: NodeJS.Timeout | null = null;
  
  return new Promise<() => void>((lockResolve, lockReject) => {
    const checkLock = () => {
      const existingLock = this.operationLocks.get(lockKey);
      if (existingLock) {
        // Wait for previous lock with timeout
        setTimeout(checkLock, 100);
        return;
      }
      
      // Lock acquired!
      const lockPromise = new Promise<void>(resolve => {
        resolver = resolve;
      });
      
      this.operationLocks.set(lockKey, lockPromise);
      
      // Set timeout to force unlock
      timeoutHandle = setTimeout(() => {
        logger.warn(`Lock timeout for ${gameId}, forcing unlock`);
        if (resolver) resolver();
      }, timeoutMs);
      
      // Return unlock function
      lockResolve(() => {
        if (timeoutHandle) clearTimeout(timeoutHandle);
        if (resolver) resolver();
        this.operationLocks.delete(lockKey);
      });
    };
    
    checkLock();
  });
}
```

---

### ERROR #9: Hardlink Count Mismatch, Storage Stats Wrong

**Severity:** HIGH  
**Impact:** Incorrect deduplication reporting, user makes wrong storage decisions  
**Affected Files:**
- `electron/modules/mod-manager/backup-manager.ts` (lines 297, 425, 493-515)
- `electron/modules/mod-manager/backup-manager.ts` (lines 1005-1028, storage stats)

**Scenario:**
1. Backup created with hardlinks (line 339)
2. `hardlinkCount` tracked during creation: incremented when link succeeds (line 425)
3. Some hardlinks fail silently (line 426-434 catches error, continues)
4. Failed hardlinks fall back to copy (line 429)
5. `hardlinkCount` reports 450 hardlinks, but only 300 actual hardlinks
6. `realDataSize` calculated incorrectly (line 493-515)
7. Deduplication ratio shown as 50%, actual is 35%
8. User thinks they're saving space but actually wasting it

**Root Causes:**
- `hardlinkCount` incremented ONLY when fs.linkSync succeeds
- Fallback to copy doesn't decrement counter
- `calculateRealDataSize()` assumes `hardlinkCount` is accurate
- No actual verification of hardlink creation (doesn't check `stat.nlink`)

**Impact:**
```
Reported: 1000 files, 100 hardlinked = 90% real data = 1TB backup
Actual:   1000 files, 50 hardlinked = 95% real data = 1.8TB backup
```

**Detection:**
```typescript
// Verify hardlink count
async function verifyBackupHardlinks(backupPath: string): Promise<{actual: number, reported: number}> {
  let actualHardlinks = 0;
  
  const walk = (dir: string) => {
    const entries = fs.readdirSync(dir);
    for (const entry of entries) {
      const fullPath = path.join(dir, entry);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        walk(fullPath);
      } else if (stat.nlink > 1) {
        actualHardlinks++;
      }
    }
  };
  
  walk(backupPath);
  
  // Compare with reported
  const metadata = JSON.parse(fs.readFileSync(path.join(backupPath, 'backup-metadata.json'), 'utf-8'));
  return {
    actual: actualHardlinks,
    reported: metadata.hardlinkCount
  };
}
```

**Recovery Procedure:**
1. Recalculate actual hardlink count
2. Update backup metadata with correct values
3. Rebuild storage statistics cache

**Fix Priority:** P1 - Verify hardlinks post-creation:
```typescript
private async createHardlinkBackup(files: FileEntry[]): Promise<void> {
  // ... existing hardlink creation code ...
  
  // AFTER creation, verify hardlinks
  let verifiedHardlinks = 0;
  const walk = (dir: string) => {
    const entries = fs.readdirSync(dir);
    for (const entry of entries) {
      const fullPath = path.join(dir, entry);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        walk(fullPath);
      } else if (stat.nlink > 1) {
        verifiedHardlinks++;
      }
    }
  };
  
  walk(this.destPath);
  
  // If mismatch, log warning
  if (verifiedHardlinks !== this.hardlinkCount) {
    logger.warn(
      `Hardlink count mismatch: reported=${this.hardlinkCount}, actual=${verifiedHardlinks}`
    );
    this.hardlinkCount = verifiedHardlinks; // Correct the counter
  }
}
```

---

### ERROR #10: Disk Full During Backup, Partial Corrupted Backup Created

**Severity:** HIGH  
**Impact:** Backup fails but space consumed, backup unusable, disk space lost  
**Affected Files:**
- `electron/modules/mod-manager/backup-manager.ts` (lines 318-367, no disk space check)
- `electron/modules/mod-manager/backup-manager.ts` (lines 408-451, hardlink loop)

**Scenario:**
1. Game folder: 50GB, Backup directory has 10GB free
2. User initiates backup
3. File scanning completes (line 329)
4. Hardlink creation starts (line 339)
5. 45GB created successfully, 5GB remains free
6. Next file (2GB) fails to hardlink → copy fallback
7. Copy writes 2GB → "No space left on device" error (line 429 swallows error)
8. Backup continues but 2GB file not written
9. Backup "completed" but corrupted
10. Database records backup as valid but incomplete

**Root Causes:**
- No pre-flight disk space check before starting
- Errors swallowed in try-catch (line 426-434)
- No verification of file write success
- Backup marked "completed" even if some files failed

**Impact:**
```
Goal: 50GB backup
Created: 48GB (2GB missing)
Status: Marked as "completed" in DB
Result: Cannot restore - corrupted backup
```

**Detection:**
```typescript
// Verify backup integrity - compare file counts
async function verifyBackupIntegrity(backupPath: string, sourceFiles: number): Promise<boolean> {
  let backupFileCount = 0;
  const walk = (dir: string) => {
    const entries = fs.readdirSync(dir);
    for (const entry of entries) {
      if (entry === 'backup-metadata.json' || entry === 'backup.sha256') continue;
      const fullPath = path.join(dir, entry);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        walk(fullPath);
      } else {
        backupFileCount++;
      }
    }
  };
  
  walk(backupPath);
  
  if (backupFileCount !== sourceFiles) {
    logger.error(`Backup integrity check failed: expected ${sourceFiles}, found ${backupFileCount}`);
    return false;
  }
  return true;
}
```

**Recovery Procedure:**
1. Identify corrupted backups (file count mismatch)
2. Delete backup directory
3. Free up disk space
4. Retry backup

**Fix Priority:** P1 - Pre-flight disk space check:
```typescript
async createBackup(
  gamePath: string,
  gameId: string,
  options?: CreateBackupOptions
): Promise<BackupInfo> {
  if (!fs.existsSync(gamePath)) {
    throw new Error(`Game path does not exist: ${gamePath}`);
  }
  
  // FIX: Check disk space BEFORE starting
  const capabilities = await this.getFilesystemCapabilities(this.config.backupsDir!);
  const gameSize = this.calculateDirSize(gamePath);
  
  if (capabilities.availableSpace < gameSize * 1.2) { // Need 120% of game size
    throw new Error(
      `Insufficient disk space: need ${Math.round(gameSize * 1.2 / 1e9)}GB, ` +
      `available ${Math.round(capabilities.availableSpace / 1e9)}GB`
    );
  }
  
  // FIX: Verify backup integrity after creation
  const creator = new BackupCreator(gamePath, backupDir, capabilities, options);
  const backupInfo = await creator.create();
  
  // Verify all files were backed up
  const backupFileCount = await this.countFilesInBackup(backupInfo.path);
  if (backupFileCount === 0) {
    fs.rmSync(backupDir, { recursive: true, force: true });
    throw new Error('Backup created but contains no files - possible disk full');
  }
  
  return backupInfo;
}
```

---

## MEDIUM SEVERITY ERRORS

### ERROR #11: Mod Status Stuck in "installing", App Never Recovers

**Severity:** MEDIUM  
**Impact:** Cannot install same mod again, UI shows perpetual progress, manual DB edit required  
**Affected Files:**
- `electron/services/mods-database.service.ts` (line 98, status field)
- `electron/modules/mod-manager/mod-installer.ts` (lines 39, 136)
- `electron/handlers/mods.handler.ts` (lines 138-147)

**Scenario:**
1. Start mod installation
2. Mod status updated to "installing"
3. App crashes mid-installation (download fails, extraction fails)
4. Status remains "installing" in database
5. App restarts
6. User tries to install same mod again
7. App checks mod status → already installing
8. Blocks new installation attempt
9. User sees perpetual progress bar, cannot recover

**Root Causes:**
- Mod status changed to "installing" but no rollback on crash
- No "zombie installation" detection on app startup
- Status only updated back on successful completion (not on failure)
- No timeout mechanism to auto-recover stale status

**Detection:**
```sql
-- Find mods stuck in installing status
SELECT id, title, status FROM installed_mods WHERE status = 'installing';

-- Check if installation actually running
-- If app restarted but mod still installing -> zombie installation
```

**Recovery Procedure:**
1. Find mods with stuck status: `SELECT * FROM installed_mods WHERE status = 'installing'`
2. Reset status: `UPDATE installed_mods SET status = 'installed' WHERE status = 'installing'`
3. Verify mod files exist - if not, delete record

**Fix Priority:** P2 - Add zombie installation detection:
```typescript
async initialize(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (this.initialized) return resolve();
    
    // ... existing initialization code ...
    
    this.db!.configure('busyTimeout', 5000);
    this.runMigrations()
      .then(async () => {
        // NEW: Detect and recover zombie installations
        await this.recoverZombieInstallations();
        this.initialized = true;
        resolve();
      })
      .catch(reject);
  });
}

private async recoverZombieInstallations(): Promise<void> {
  return new Promise((resolve, reject) => {
    this.db!.all(
      `SELECT id, installPath FROM installed_mods WHERE status = 'installing' OR status = 'uninstalling'`,
      (err, rows: any[]) => {
        if (err) return reject(err);
        if (!rows || rows.length === 0) return resolve();
        
        // Recover each zombie
        let recovered = 0;
        for (const row of rows) {
          // Check if mod files actually exist
          const exists = fs.existsSync(row.installPath);
          const newStatus = exists ? 'installed' : 'unknown';
          
          this.db!.run(
            'UPDATE installed_mods SET status = ? WHERE id = ?',
            [newStatus, row.id],
            (updateErr) => {
              if (!updateErr) {
                recovered++;
                logger.info(`Recovered zombie installation: ${row.id} -> ${newStatus}`);
              }
              if (recovered === rows.length) resolve();
            }
          );
        }
      }
    );
  });
}
```

---

### ERROR #12: Backup Cleanup Task Deletes Wrong Backup

**Severity:** MEDIUM  
**Impact:** User loses wanted backup, cannot restore  
**Affected Files:**
- `electron/modules/mod-manager/backup-manager.ts` (lines 877-913, cleanup logic)

**Scenario:**
1. User has 5 backups, retention = 7 days, keepCount = 3
2. Cleanup task runs: `cleanupOldBackups()` (line 877)
3. Backups sorted by timestamp: [B1(now), B2(5d ago), B3(8d ago), B4(10d ago), B5(12d ago)]
4. Logic: keep latest 3 → delete B4, B5 (lines 893-906)
5. Delete B4 succeeds, deletes from DB and filesystem
6. Delete B5 fails (files locked by antivirus)
7. B5 record deleted from DB but files still exist
8. User can't see B5 in UI (no DB record) but files waste space
9. Worse: if clockskew causes timestamp confusion, wrong backup deleted

**Root Causes:**
- Retention policy mixing: both `keepLatestCount` AND `retentionDays` applied
- No transaction wrapping cleanup deletions
- No verification of file deletion before DB deletion
- Timestamp-based sorting vulnerable to clock skew

**Impact:**
- Backup metadata deleted but files orphaned (error #7 pattern)
- User loses backup they intended to keep
- Disk space wasted on zombie backup files

**Detection:**
```sql
-- Find orphaned backup files (cleanup deleted DB record but not files)
-- Manually scan backup directories and compare with DB
SELECT COUNT(*) FROM backups; -- Check DB record count
-- Compare with actual directory count
```

**Recovery Procedure:**
1. Restore database from backup if available
2. Manually delete orphaned backup files
3. Recalculate backup counts

**Fix Priority:** P2 - Atomic cleanup with verification:
```typescript
async cleanupOldBackups(
  gameId: string,
  options?: Partial<BackupManagerConfig> | CleanupOptions
): Promise<number> {
  const backups = await this.listBackups(gameId);
  if (backups.length === 0) return 0;
  
  const retentionDays = (options as any)?.defaultRetentionDays || this.config.defaultRetentionDays;
  const keepLatestCount = (options as any)?.defaultKeepCount || this.config.defaultKeepCount;
  
  const now = Date.now();
  const cutoffTime = now - retentionDays! * 24 * 60 * 60 * 1000;
  let deletedCount = 0;
  
  // Sort by creation time (newest first)
  const sortedBackups = backups.sort((a, b) => b.createdAt - a.createdAt);
  
  for (let i = 0; i < sortedBackups.length; i++) {
    const backup = sortedBackups[i];
    
    // Always keep the latest N backups
    if (i < keepLatestCount!) continue;
    
    // Delete if older than retention period
    if (backup.createdAt < cutoffTime) {
      try {
        // Step 1: Verify backup directory exists
        const backupDir = path.join(this.config.backupsDir!, gameId, backup.id);
        if (!fs.existsSync(backupDir)) {
          // Directory already gone - just delete DB record
          await this.modsDatabaseService.deleteBackup(backup.id);
          deletedCount++;
          continue;
        }
        
        // Step 2: Delete files first
        fs.rmSync(backupDir, { recursive: true, force: true });
        
        // Step 3: Verify deletion
        if (fs.existsSync(backupDir)) {
          throw new Error(`Failed to delete directory: ${backupDir}`);
        }
        
        // Step 4: Delete DB record ONLY after file deletion succeeds
        await this.modsDatabaseService.deleteBackup(backup.id);
        deletedCount++;
      } catch (error) {
        logger.warn(
          `Failed to cleanup backup ${backup.id}: ${error instanceof Error ? error.message : 'unknown'}`,
          'backup-cleanup'
        );
        // Do NOT delete DB record if file deletion fails
      }
    }
  }
  
  return deletedCount;
}
```

---

### ERROR #13: Load Order Array Out of Sync with Database

**Severity:** MEDIUM  
**Impact:** Mods load in wrong order, game crashes or behaves unexpectedly  
**Affected Files:**
- `electron/services/mods-database.service.ts` (line 288, loadOrder query)
- `electron/modules/mod-manager/mod-installer.ts` (no load order enforcement)

**Scenario:**
1. 10 mods installed with loadOrder: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
2. User reorders mods in UI: moves mod5 to position 0
3. Frontend sends updated loadOrder array to backend
4. IPC handler updates each mod: UPDATE loadOrder = ? WHERE id = ?
5. Network interruption between 3rd and 4th update
6. 3 mods updated, 7 mods not updated
7. Database has: [0, 1, 0, 3, 4, 5, 6, 7, 8, 9] (duplicate 0, hole at 2)
8. Game loads mods in order but encounters duplicates/missing
9. Game may crash or load wrong dependencies

**Root Causes:**
- Load order updates not wrapped in transaction
- No validation of loadOrder uniqueness
- No rebuild after partial update failure
- No UI validation of complete reorder before persisting

**Impact:**
```
Expected loadOrder: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
After failure:     [0, 1, 0, 3, 4, 5, 6, 7, 8, 9]
Result: Mods 0 and 2 both at position 0 - undefined behavior
```

**Detection:**
```sql
-- Find duplicate or invalid load orders
SELECT loadOrder, COUNT(*) as count FROM installed_mods 
WHERE gameAppId = ? GROUP BY loadOrder HAVING count > 1;

-- Find gaps in load order
SELECT DISTINCT loadOrder FROM installed_mods WHERE gameAppId = ?
ORDER BY loadOrder;
```

**Recovery Procedure:**
1. Find game with invalid load orders
2. Rebuild load order: assign sequential 0, 1, 2, ... based on installedAt
3. Persist corrected order

**Fix Priority:** P2 - Transaction-based load order update:
```typescript
async updateLoadOrder(gameAppId: string, modIds: string[]): Promise<boolean> {
  return new Promise((resolve, reject) => {
    this.db!.serialize(() => {
      // Wrap entire reorder in transaction
      this.db!.run('BEGIN TRANSACTION', (beginErr) => {
        if (beginErr) return reject(beginErr);
        
        let completed = 0;
        let hasError = false;
        
        for (let i = 0; i < modIds.length; i++) {
          this.db!.run(
            'UPDATE installed_mods SET loadOrder = ?, updatedAt = ? WHERE id = ? AND gameAppId = ?',
            [i, Date.now(), modIds[i], gameAppId],
            (err) => {
              if (err && !hasError) {
                hasError = true;
                this.db!.run('ROLLBACK', () => reject(err));
                return;
              }
              
              completed++;
              if (completed === modIds.length) {
                // All updates done - commit
                this.db!.run('COMMIT', (commitErr) => {
                  commitErr ? reject(commitErr) : resolve(true);
                });
              }
            }
          );
        }
        
        // Validate no duplicate load orders exist
        this.db!.get(
          `SELECT COUNT(*) as dupes FROM installed_mods WHERE gameAppId = ? 
           GROUP BY loadOrder HAVING COUNT(*) > 1`,
          [gameAppId],
          (err, row: any) => {
            if (row && row.dupes > 0) {
              hasError = true;
              this.db!.run('ROLLBACK', () => 
                reject(new Error('Load order has duplicates after update'))
              );
            }
          }
        );
      });
    });
  });
}
```

---

## LOW SEVERITY ERRORS

### ERROR #14: Checksum Calculation Never Completes, Large Backup Files

**Severity:** LOW  
**Impact:** Backup appears to hang, UI progress stalls, user unsure if operation ongoing  
**Affected Files:**
- `electron/modules/mod-manager/backup-manager.ts` (lines 517-538, checksum calculation)

**Scenario:**
1. Large backup: 1000+ files, 100GB+
2. Create backup initiated
3. Hardlink/copy completes successfully
4. Checksum calculation starts (line 517)
5. Iterates through 1000+ files, hashing each
6. On slow disk or with antivirus scanning: takes 5+ minutes
7. UI progress bar appears stuck at "Backup complete"
8. User doesn't know if operation still running

**Root Causes:**
- Checksum calculation not reported to UI progress
- No progress events during checksum phase
- No timeout on checksum operation
- File I/O blocked if antivirus scanning

**Impact:**
- User thinks operation failed
- User might restart app mid-checksum
- Checksum incomplete if app killed

**Detection:**
- Monitor UI progress events - should include checksum stage
- Check logs for checksum calculation duration

**Recovery Procedure:**
- Restart app, retry operation
- If checksum keeps timing out, disable checksum verification

**Fix Priority:** P3 - Report checksum progress:
```typescript
private async calculateChecksum(): Promise<string> {
  const hash = crypto.createHash('sha256');
  const files: string[] = [];
  
  // First pass: collect all files
  const walk = (currentPath: string) => {
    const entries = fs.readdirSync(currentPath).sort();
    for (const entry of entries) {
      const absolutePath = path.join(currentPath, entry);
      const stat = fs.statSync(absolutePath);
      if (stat.isDirectory()) {
        walk(absolutePath);
      } else if (stat.isFile()) {
        files.push(absolutePath);
      }
    }
  };
  
  walk(this.destPath);
  
  // Second pass: hash with progress updates
  let lastProgress = Date.now();
  for (let i = 0; i < files.length; i++) {
    const content = fs.readFileSync(files[i]);
    hash.update(content);
    
    // Report progress every 500ms
    const now = Date.now();
    if (now - lastProgress >= 500) {
      this.emitProgress(
        'verifying',
        `Calculating checksum: ${i + 1}/${files.length}`,
        (i / files.length) * 100
      );
      lastProgress = now;
    }
  }
  
  return hash.digest('hex');
}
```

---

### ERROR #15: Malware Scanner Timeout, Install Blocked Forever

**Severity:** LOW  
**Impact:** Installation blocked indefinitely by scan timeout, mod not installed  
**Affected Files:**
- `electron/handlers/mods.handler.ts` (lines 286-425, scan handler)
- Timeout set at line 318: 60000ms

**Scenario:**
1. User installs mod, malware scan enabled
2. Mod files scanned by antivirus service
3. Large mod: 500+ files, 500MB
4. Scan takes 75 seconds (exceeds 60s timeout)
5. Scan handler times out
6. Installation fails with "Scan failed"
7. Mod not installed, backup wasted, user confused

**Root Causes:**
- Fixed 60-second timeout for ALL mods
- Large mods naturally take longer
- No adaptive timeout based on mod size
- No "skip scan" option if scan fails

**Detection:**
- Check install logs for "Scan failed" messages
- Monitor scan timeout frequency for large mods

**Recovery Procedure:**
- Retry installation with increased timeout
- Or disable malware scan

**Fix Priority:** P3 - Adaptive timeout:
```typescript
async handleScanMalware(
  _event: any,
  options: ModScanOptions
): Promise<{ success: boolean; data?: ModScanResult; error?: string }> {
  // Calculate adaptive timeout based on file count/size
  let timeoutMs = 60000; // 60s base
  if (options.filePaths.length > 100) {
    timeoutMs = 120000; // 2 min for 100+ files
  }
  if (options.filePaths.length > 500) {
    timeoutMs = 300000; // 5 min for 500+ files
  }
  
  // ... rest of scan logic with dynamic timeout ...
}
```

---

## State Machine Error Patterns

### ERROR #16: Incomplete Rollback After Failed Installation

**Severity:** MEDIUM  
**Impact:** Backup partially restored, mod in corrupted state  
**Affected Files:**
- `electron/modules/mod-manager/mod-installer.ts` (lines 186-203, rollback logic)

**Scenario:**
1. Installation fails at extraction stage
2. Error handler attempts rollback (line 189-211)
3. Calls `restoreBackup()` but backup restoration also fails
4. Incomplete error handling leaves mod in half-installed state:
   - Database: `status = 'installed'`
   - Filesystem: `incomplete files`
   - Backup: `partially restored`

**Root Cause:**
- Nested try-catch doesn't properly unwrap error state
- No atomic rollback operation

**Fix Priority:** P2 - Implement atomic rollback:
```typescript
async installMod(...): Promise<ModInstallResult> {
  const backupId = await this.createBackup(...);
  
  try {
    // Install steps...
    await this.downloadModFile(...);
    await this.extractModFiles(...);
    await modsDatabaseService.addInstalledMod(modInfo);
  } catch (err) {
    // ATOMIC rollback
    const rollbackSuccess = await this.atomicRollback(backupId, options);
    if (!rollbackSuccess) {
      throw new Error(`Installation failed and rollback also failed. Manual recovery required. Backup available at: ${backupId}`);
    }
  }
}

private async atomicRollback(backupId: string, options: ModInstallOptions): Promise<boolean> {
  try {
    // Step 1: Mark all database records as "rolling_back"
    await modsDatabaseService.updateModStatus(options.modId, 'rolling_back');
    
    // Step 2: Restore backup atomically
    await this.restoreBackup(backupId, options.modId, options.installDir);
    
    // Step 3: Verify restoration
    const modFiles = fs.readdirSync(options.installDir);
    if (modFiles.length === 0) throw new Error('Restoration produced no files');
    
    // Step 4: Only update status after verification
    await modsDatabaseService.updateModStatus(options.modId, 'installed');
    
    return true;
  } catch (err) {
    logger.error(`Atomic rollback failed: ${err}`);
    // Leave database in "rolling_back" state so user can see something went wrong
    return false;
  }
}
```

---

## Recovery & Prevention Strategies

### AUTO-RECOVERY ON STARTUP

**Implement comprehensive startup checks:**

```typescript
async function startupRecovery() {
  logger.info('Running startup recovery checks...');
  
  // 1. Detect and recover zombie installations
  await modsDatabaseService.recoverZombieInstallations();
  
  // 2. Verify orphaned backups don't exist
  await backupManager.verifyOrphanedBackups();
  
  // 3. Check for interrupted transactions
  const dbHealth = await modsDatabaseService.checkDatabaseHealth();
  if (!dbHealth.healthy) {
    logger.error('Database corruption detected, rebuilding...');
    await modsDatabaseService.rebuildDatabase();
  }
  
  // 4. Recover partial installations
  await modsDatabaseService.recoverPartialInstallations();
  
  // 5. Clean up temp files
  await cleanupTemporaryFiles();
  
  logger.info('Startup recovery completed');
}
```

### TRANSACTION-WRAPPED OPERATIONS

**Critical operations must use transactions:**

```typescript
// Template for transaction-wrapped operations
async function atomicOperation<T>(
  operation: () => Promise<T>,
  cleanup?: () => Promise<void>
): Promise<T> {
  return new Promise((resolve, reject) => {
    this.db!.run('BEGIN TRANSACTION', (err) => {
      if (err) return reject(err);
      
      operation()
        .then((result) => {
          this.db!.run('COMMIT', (commitErr) => {
            commitErr ? reject(commitErr) : resolve(result);
          });
        })
        .catch((err) => {
          this.db!.run('ROLLBACK', (rollbackErr) => {
            if (cleanup) cleanup().catch(e => logger.error(`Cleanup failed: ${e}`));
            reject(rollbackErr || err);
          });
        });
    });
  });
}
```

### CHECKSUM VERIFICATION

**All critical files should have checksums:**

```typescript
interface FileWithChecksum {
  path: string;
  checksum: string;
  size: number;
  timestamp: number;
}

async function verifyBackupIntegrity(backupId: string): Promise<boolean> {
  const manifestFile = path.join(backupPath, 'checksum-manifest.json');
  const manifest: FileWithChecksum[] = JSON.parse(fs.readFileSync(manifestFile, 'utf-8'));
  
  for (const file of manifest) {
    const actualChecksum = await calculateFileChecksum(file.path);
    if (actualChecksum !== file.checksum) {
      logger.error(`Checksum mismatch for ${file.path}`);
      return false;
    }
  }
  
  return true;
}
```

---

## Detection Mechanisms

### DATABASE INTEGRITY CHECKER

```typescript
async function checkDatabaseIntegrity(): Promise<{
  healthy: boolean;
  errors: string[];
}> {
  const errors: string[] = [];
  
  // 1. Check foreign key constraints
  const fkResult = await db.all(`PRAGMA foreign_key_check`);
  if (fkResult.length > 0) {
    errors.push(`Foreign key violations: ${fkResult.length}`);
  }
  
  // 2. Check for duplicate loadOrders
  const duplicates = await db.all(
    `SELECT loadOrder, COUNT(*) as count FROM installed_mods 
     GROUP BY loadOrder HAVING count > 1`
  );
  if (duplicates.length > 0) {
    errors.push(`Duplicate load orders: ${duplicates.length}`);
  }
  
  // 3. Check for orphaned backups
  const orphaned = await db.all(
    `SELECT * FROM backups WHERE modId NOT IN (SELECT id FROM installed_mods)`
  );
  if (orphaned.length > 0) {
    errors.push(`Orphaned backups: ${orphaned.length}`);
  }
  
  // 4. Verify filesystem consistency
  const mods = await modsDatabaseService.getGameMods('all-games');
  for (const mod of mods) {
    if (!fs.existsSync(mod.installPath)) {
      errors.push(`Missing mod directory: ${mod.id}`);
    }
  }
  
  return {
    healthy: errors.length === 0,
    errors
  };
}
```

### CRASH RECOVERY LOG ANALYZER

```typescript
function analyzeCrashRecovery(): {
  lastCrashTime: number;
  crashCount: number;
  affectedModIds: string[];
} {
  const crashLog = fs.readFileSync(path.join(userData, 'crash-recovery.log'), 'utf-8');
  const lines = crashLog.split('\n');
  
  const crashes: { timestamp: number; modId: string }[] = [];
  for (const line of lines) {
    const match = line.match(/CRASH (\d+) - ModID: (.*)/);
    if (match) {
      crashes.push({
        timestamp: parseInt(match[1]),
        modId: match[2]
      });
    }
  }
  
  return {
    lastCrashTime: crashes[crashes.length - 1]?.timestamp || 0,
    crashCount: crashes.length,
    affectedModIds: [...new Set(crashes.map(c => c.modId))]
  };
}
```

---

## Testing Scenarios

### Simulate Errors for Testing

```typescript
// ERROR #1: Unfinished transaction
function testTransactionCrash() {
  // Start migration, kill app during table creation
  // Restart, verify recovery
}

// ERROR #2: Aborted backup
function testAbortedBackup() {
  // Start backup, call abort() at 60%
  // Verify orphaned directory cleanup
}

// ERROR #5: Restore without snapshot
function testRestoreDataLoss() {
  // Create mod v2, restore v1 backup
  // Simulate extraction failure mid-restore
  // Verify v2 recoverable
}

// ERROR #10: Disk full
function testDiskFullRecovery() {
  // Fill disk to 95% capacity
  // Start backup, verify pre-flight check catches it
  // Alternatively, simulate ENOSPC error during hardlink
}
```

---

## Summary Table

| Error # | Severity | Title | Root Cause | Impact |
|---------|----------|-------|-----------|--------|
| 1 | CRITICAL | Unfinished Transaction | Callback chain crash during migration | App freeze, DB lock |
| 2 | CRITICAL | Backup Abort Cleanup | No cleanup on abort | 10+ GB orphaned |
| 3 | CRITICAL | FK Violation | Cascade delete + FS mismatch | Orphaned backups |
| 4 | CRITICAL | Extract Crash | Partial extraction, DB updated | Mod corruption |
| 5 | CRITICAL | Restore Data Loss | No snapshot before restore | User data loss |
| 6 | HIGH | DB Locked | File copy/scan locks database | 5s UI freeze |
| 7 | HIGH | Metadata Corruption | Partial JSON write, no fsync | Cannot restore |
| 8 | HIGH | Lock Released Early | Promise chain broken | Concurrent ops |
| 9 | HIGH | Hardlink Count Mismatch | Fallback not tracked | Wrong storage reporting |
| 10 | HIGH | Disk Full During Backup | No pre-flight check | Corrupted backup |
| 11 | MEDIUM | Status Stuck | No zombie detection | Cannot reinstall |
| 12 | MEDIUM | Cleanup Deletes Wrong Backup | Partial update failure | User loses backup |
| 13 | MEDIUM | Load Order Out of Sync | Non-atomic update | Mods load wrong order |
| 14 | LOW | Checksum Hang | Large files, no progress | UI appears stuck |
| 15 | LOW | Scan Timeout | Fixed timeout for all mods | Install blocked |
| 16 | MEDIUM | Incomplete Rollback | Nested try-catch | Corrupted state |

---

## Recommendations

1. **Immediate (P0):** Implement transaction wrapper for all database operations
2. **Immediate (P0):** Add backup cleanup for aborted operations
3. **Week 1 (P1):** Implement atomic restore with snapshots
4. **Week 1 (P1):** Add pre-flight disk space checks
5. **Week 2 (P2):** Implement startup recovery checks
6. **Week 2 (P2):** Add transaction-based operations for installation
7. **Ongoing (P3):** Improve progress reporting and error messages
8. **Documentation:** Maintain recovery playbooks for each error scenario

---

**Document End**
