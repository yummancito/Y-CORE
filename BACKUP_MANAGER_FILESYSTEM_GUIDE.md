# Backup Manager: Filesystem Configuration Guide

Comprehensive guide for configuring and troubleshooting hardlink-based backups across different filesystems and platforms.

## Table of Contents

1. [Platform-Specific Setup](#platform-specific-setup)
2. [Filesystem Capability Matrix](#filesystem-capability-matrix)
3. [Troubleshooting](#troubleshooting)
4. [Performance Tuning](#performance-tuning)
5. [Advanced Configuration](#advanced-configuration)
6. [Detection and Validation](#detection-and-validation)

## Platform-Specific Setup

### Windows NTFS

**Hardlink Support**: ✓ Full support

#### Enable Hardlinks

1. Check if NTFS is in use:
```powershell
fsutil fsinfo ntfsinfo C:
```

Expected output:
```
NTFS Volume Serial Number : 0x1a2b3c4d
NTFS Version      : 3.1
...
```

2. Ensure Developer Mode is enabled (Windows 10/11):
   - Settings → Privacy & Security → For developers
   - Toggle "Developer Mode" ON

3. Verify hardlink permissions:
```powershell
# Test hardlink creation
$testFile = "C:\temp\test.txt"
$linkFile = "C:\temp\test-link.txt"
New-Item -Path $testFile -Value "test" -Force | Out-Null
cmd /c mklink /H $linkFile $testFile
```

#### Performance Optimization

```typescript
const backupManager = new BackupManager({
  backupsDir: 'C:\\backups', // Use fast SSD
  maxConcurrentOps: 4, // NTFS handles parallelism well
  operationTimeoutMs: 3600000, // 1 hour
})
```

#### Windows-Specific Issues

**Problem**: `ERROR: You do not have sufficient privilege to perform this operation`

**Solution**:
```powershell
# Run as Administrator
# Verify User Account Control (UAC) is not blocking operations
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Force

# Check NTFS permissions
icacls "C:\path\to\backups" /grant:r "%USERNAME%:F" /T
```

**Problem**: Hardlinks fail on network drives (SMB)

**Solution**: Always backup to local drives
```typescript
// GOOD
const backupManager = new BackupManager({
  backupsDir: 'C:\\backups', // Local drive
})

// BAD (won't work)
const backupManager = new BackupManager({
  backupsDir: '\\\\network-share\\backups', // Network drive
})
```

**Problem**: ReFS filesystem (newer Windows Server)

**Note**: ReFS does support hardlinks, but they have different behavior. Test thoroughly.

### macOS APFS

**Hardlink Support**: ✓ Full support  
**Reflink/Clone Support**: ✓ Supported (faster than hardlinks)

#### Enable Hardlinks and Reflinks

1. Check filesystem type:
```bash
diskutil info / | grep "Type (Bundle)"
```

Expected: `APFS` (AppleFS)

2. Verify reflink support (CoW):
```bash
# Test reflink/clone capability
cp -c source.dat dest.dat
echo $?  # 0 = success, 1 = not supported
```

3. Check available space (required for CoW):
```bash
df -h
```

#### Performance Optimization

```typescript
const backupManager = new BackupManager({
  backupsDir: '/Volumes/Fast-SSD/backups',
  maxConcurrentOps: 3, // macOS APFS is efficient
  operationTimeoutMs: 2 * 60 * 60 * 1000, // 2 hours
  enableCompression: true, // Leverage APFS compression
})
```

#### macOS-Specific Issues

**Problem**: Backups on external drives fail

**Solution**:
```bash
# Check external drive filesystem
diskutil info /Volumes/MyDrive | grep "Type (Bundle)"

# Reformat as APFS if needed (destructive)
diskutil secureErase freespace 0 -secure APFS /Volumes/MyDrive
```

**Problem**: Time Machine interferes with backups

**Solution**:
```bash
# Disable Time Machine during large backups
sudo tmutil disable

# Re-enable after backup
sudo tmutil enable
```

**Problem**: SIP (System Integrity Protection) blocks operations

**Solution**:
```bash
# Check SIP status
csrutil status

# If enabled and causing issues:
# 1. Boot into Recovery Mode (Cmd+R)
# 2. Terminal → csrutil disable
# 3. Restart
# 4. (Re-enable after: csrutil enable)
```

#### Memory-Mapped Files

Leverage macOS's efficient memory mapping:
```typescript
// macOS-specific optimization
const backupManager = new BackupManager({
  backupsDir: process.platform === 'darwin' 
    ? '/Volumes/Fast-SSD/backups'
    : 'C:\\backups',
  maxConcurrentOps: process.platform === 'darwin' ? 2 : 4,
})
```

### Linux (ext4/XFS/Btrfs)

**Hardlink Support**: ✓ Full support  
**CoW/Snapshot Support**: ✓ Varies by filesystem

#### ext4 (Most Common)

1. Verify filesystem type:
```bash
df -T
# Output: ... ext4 ...

# Or detailed check
stat / | grep -i filesystem
```

2. Check filesystem features:
```bash
tune2fs -l /dev/sda1 | grep features
```

3. Enable recommended features:
```bash
# Only do this on unmounted partitions!
sudo e2fsck -n /dev/sda1  # Dry-run check first
sudo tune2fs -O extent,flex_bg,sparse_super2 /dev/sda1
```

#### XFS (Enterprise/High Performance)

```bash
# Check XFS filesystem
xfs_info /

# Recommended for large files
mkfs.xfs -f -d agcount=4 /dev/sdX1
```

#### Btrfs (Advanced)

```bash
# Check Btrfs support and features
btrfs filesystem show

# Create new Btrfs with performance tuning
mkfs.btrfs -L backups /dev/sdX1

# Mount with optimal options
mount -o compress=lz4,noatime /dev/sdX1 /backups
```

#### Performance Optimization

```typescript
// Linux-specific configuration
const backupManager = new BackupManager({
  backupsDir: '/mnt/backups', // Dedicated mount point
  maxConcurrentOps: cpus().length, // Use all cores
  operationTimeoutMs: 3600000, // 1 hour
})
```

#### Linux-Specific Issues

**Problem**: Permission denied on hardlink creation

**Solution**:
```bash
# Check file permissions
ls -li /path/to/backup

# Grant proper permissions
sudo chown -R $USER:$USER /mnt/backups
chmod -R 755 /mnt/backups
```

**Problem**: Hardlinks fail across filesystems

**Solution**:
```bash
# Verify source and backup are on same filesystem
df /path/to/game
df /mnt/backups

# If different, move backup directory to same filesystem
mount | grep /mnt/backups
```

**Problem**: ext4 hardlink limits

**Solution**:
```bash
# ext4 has 65536 hardlink limit per file
# For files with many links:

# Check link count
stat /mnt/backups/backup-1/game.bin | grep Links

# If hitting limit, fall back to copying
# This happens automatically in BackupManager
```

---

## Filesystem Capability Matrix

| Feature | Windows NTFS | macOS APFS | Linux ext4 | Linux XFS | Linux Btrfs |
|---------|--------------|-----------|-----------|-----------|------------|
| **Hardlinks** | ✓ | ✓ | ✓ | ✓ | ✓ |
| **Reflinks** | ✗ | ✓ | ✗ | ✗ | ✓ |
| **Snapshots** | ✗ | ✗ | ✗ | ✗ | ✓ |
| **Compression** | ✓ | ✓ | ✗ | ✗ | ✓ |
| **Max File Size** | 16 TB | 8 EB | 16 TB | 8 EB | 16 EB |
| **Max Hardlinks** | ∞ | ∞ | 65536 | ∞ | ∞ |
| **Latency** | Low | Low | Low | Low | Medium |
| **Throughput** | High | High | High | Very High | High |

**Key Findings:**

- **Windows NTFS**: Excellent for backups, standard on all systems
- **macOS APFS**: Superior with reflinks, very efficient storage
- **Linux ext4**: Solid performer, most common, has hardlink limit
- **Linux XFS**: Enterprise-grade, ideal for large backups
- **Linux Btrfs**: Advanced features, CoW support, higher complexity

---

## Troubleshooting

### Backup Detection Issues

#### Hardlinks Not Detected

```typescript
// Check what BackupManager detects
const backupManager = new BackupManager({
  verbose: true, // Enable detailed logging
})

// Create test backup - will log filesystem capabilities
const backup = await backupManager.createBackup('/test/game', 'test-game')
// Check logs for: "Filesystem capabilities" output
```

#### Manual Filesystem Detection

```typescript
// Test hardlink capability manually
import fs from 'fs'
import path from 'path'

function testHardlinks(testDir: string): boolean {
  const testFile = path.join(testDir, '.hardlink-test')
  const linkFile = path.join(testDir, '.hardlink-test.link')

  try {
    fs.writeFileSync(testFile, 'test')
    fs.linkSync(testFile, linkFile)

    const stat1 = fs.statSync(testFile)
    const stat2 = fs.statSync(linkFile)

    const supported = stat1.ino === stat2.ino

    fs.unlinkSync(testFile)
    fs.unlinkSync(linkFile)

    return supported
  } catch {
    return false
  }
}

// Usage
const supported = testHardlinks('/path/to/test')
console.log(`Hardlinks supported: ${supported}`)
```

### Space Issues

#### Insufficient Space for Backup

```typescript
// Check available space before backup
import { execSync } from 'child_process'

function getAvailableSpace(path: string): number {
  if (process.platform === 'win32') {
    const cmd = `fsutil volume diskfree ${path.split('\\')[0]}`
    const output = execSync(cmd, { encoding: 'utf-8' })
    return parseInt(output.split('\n')[2]) // Available bytes
  } else {
    const cmd = `df -B1 "${path}" | tail -1 | awk '{print $4}'`
    const output = execSync(cmd, { encoding: 'utf-8' })
    return parseInt(output.trim())
  }
}

// Before backup
const available = getAvailableSpace('/mnt/backups')
const required = 50 * 1024 * 1024 * 1024 // 50 GB game
const safe = available > required * 1.5 // Need 1.5x

if (!safe) {
  console.error('Insufficient space for backup')
  // Clean up old backups or free space
}
```

#### Deduplication Not Working

```typescript
// Verify hardlinks are actually being used
const backupDir = '/mnt/backups/game-id/backup-1'
const files = fs.readdirSync(backupDir, { recursive: true })

let hardlinkCount = 0
for (const file of files) {
  const fullPath = path.join(backupDir, file as string)
  if (!fs.statSync(fullPath).isDirectory()) {
    const stat = fs.statSync(fullPath)
    if (stat.nlink > 1) {
      hardlinkCount++
    }
  }
}

console.log(`Hardlinks used: ${hardlinkCount}/${files.length}`)
```

---

## Performance Tuning

### Mount Options (Linux)

```bash
# For ext4 backups - balance speed and reliability
mount -o defaults,noatime,data=ordered /dev/sda1 /mnt/backups

# For maximum performance (warning: risky with power loss)
mount -o noatime,data=writeback,journal_ioprio=3 /dev/sda1 /mnt/backups

# For safety/reliability (slower)
mount -o noatime,data=journal /dev/sda1 /mnt/backups

# For Btrfs with compression
mount -o compress=lz4,noatime,ssd_spread /dev/sda1 /mnt/backups
```

### NTFS Compression (Windows)

```powershell
# Enable NTFS compression on backup directory
compact /c /s:C:\backups

# View compression status
compact /s:C:\backups

# Disable if causing issues
compact /u /s:C:\backups
```

### Linux I/O Scheduling

```bash
# For SSD (use noop or mq-deadline)
echo "noop" > /sys/block/sda/queue/scheduler

# For HDD (use mq-deadline or kyber)
echo "mq-deadline" > /sys/block/sda/queue/scheduler

# Check current scheduler
cat /sys/block/sda/queue/scheduler
```

### Buffer and Cache Tuning

```typescript
// Configure for target filesystem
const backupManager = new BackupManager({
  backupsDir: '/mnt/backups',
  maxConcurrentOps: Math.min(cpus().length, 4),
  // Larger timeout for slow/congested filesystems
  operationTimeoutMs: process.platform === 'win32' ? 2 * 60 * 60 * 1000 : 1 * 60 * 60 * 1000,
})
```

---

## Advanced Configuration

### Cross-Filesystem Backups

```typescript
// If source and backup are on different filesystems
// BackupManager will automatically use full copy

// Detect before creating backup
import { execSync } from 'child_process'

function sameFilesystem(path1: string, path2: string): boolean {
  if (process.platform === 'win32') {
    const drive1 = path1.split(':')[0]
    const drive2 = path2.split(':')[0]
    return drive1.toUpperCase() === drive2.toUpperCase()
  } else {
    const stat1 = fs.statSync(path1)
    const stat2 = fs.statSync(path2)
    return stat1.dev === stat2.dev
  }
}

// Use this to warn user before backup
const isSameFs = sameFilesystem('/game/path', '/mnt/backups')
if (!isSameFs) {
  console.warn('Hardlinks will not work: different filesystems detected')
}
```

### Network Drive Backups

⚠️ **Not Recommended** - Hardlinks typically don't work on network drives (SMB/NFS)

If you must use network storage:

```typescript
// Configure for network drives
const backupManager = new BackupManager({
  backupsDir: '//network-share/backups',
  // Use full copy only
  maxConcurrentOps: 1, // Reduce network load
  operationTimeoutMs: 4 * 60 * 60 * 1000, // 4 hours for slow networks
})

// Expect much slower performance:
// - Hardlink backup: 5-8s on local SSD
// - Network drive: 5-15 minutes
```

### Snapshot-Based Backups (Btrfs/LVM)

For even faster backups, use filesystem snapshots:

```bash
# Btrfs snapshot (< 1 second)
btrfs subvolume snapshot -r /mnt/game /mnt/snapshots/game-backup-1

# LVM snapshot (requires setup)
lvcreate -L10G -s -n game-backup /dev/vg0/game
```

**Note**: BackupManager doesn't implement snapshot support yet, but can be extended for it.

### Automatic Fallback Configuration

```typescript
// Control fallback behavior (advanced)
const backupManager = new BackupManager({
  backupsDir: '/mnt/backups',
  // If hardlinks fail, automatically retry with full copy
  // (happens automatically, no configuration needed)
})

// Monitor which strategy is used
backupManager.on('backup-created', (event) => {
  if (event.data) {
    console.log(`Used hardlinks: ${event.data.usedHardlinks}`)
    console.log(`Hardlink count: ${event.data.hardlinkCount}`)
  }
})
```

---

## Detection and Validation

### Automatic Filesystem Detection

BackupManager automatically detects:

```typescript
const backupManager = getBackupManager()

// Internally runs detection on first backup:
// 1. Queries filesystem type
// 2. Tests hardlink capability
// 3. Tests reflink capability (macOS)
// 4. Checks available space
// 5. Caches results

// Results are cached per drive/mount point
```

### Manual Capability Check

```typescript
import { BackupManager } from 'electron/modules/mod-manager'

async function checkCapabilities(backupPath: string) {
  const backupManager = new BackupManager({
    backupsDir: backupPath,
    verbose: true, // See detailed detection logs
  })

  // Trigger detection
  const testBackup = await backupManager.createBackup(
    process.cwd(),
    'capability-test',
    {
      onProgress: (progress) => {
        console.log(`Progress: ${progress.percentage}%`)
        console.log(`Status: ${progress.status}`)
      },
    }
  )

  console.log('=== Capabilities ===')
  console.log(`Used hardlinks: ${testBackup.usedHardlinks}`)
  console.log(`Hardlink count: ${testBackup.hardlinkCount}`)
  console.log(`Total size: ${testBackup.totalSize} bytes`)
  console.log(`Real data: ${testBackup.realDataSize} bytes`)
  console.log(`Ratio: ${testBackup.totalSize / testBackup.realDataSize}x`)

  // Cleanup
  await backupManager.deleteBackup('capability-test', testBackup.id)
}
```

### Validation Script

```bash
#!/bin/bash
# validate-backup-setup.sh

set -e

echo "=== Backup Setup Validation ==="

# Check filesystem type
echo "1. Filesystem Type:"
if [[ "$OSTYPE" == "darwin"* ]]; then
  diskutil info / | grep "Type (Bundle)"
elif [[ "$OSTYPE" == "linux-gnu" ]]; then
  df -T | grep "/$"
else
  fsutil fsinfo ntfsinfo C:
fi

# Check available space
echo ""
echo "2. Available Space:"
if [[ "$OSTYPE" == "linux-gnu" ]]; then
  df -h /mnt/backups || echo "Backup directory not mounted"
else
  df -h / | tail -1
fi

# Test hardlink creation
echo ""
echo "3. Hardlink Support:"
TEST_DIR="/tmp/backup-test-$$"
mkdir -p "$TEST_DIR"
if ln "$0" "$TEST_DIR/link-test" 2>/dev/null; then
  echo "✓ Hardlinks supported"
  rm -rf "$TEST_DIR"
else
  echo "✗ Hardlinks NOT supported"
  rm -rf "$TEST_DIR"
fi

echo ""
echo "=== Validation Complete ==="
```

---

## Summary Checklist

### Before Setting Up Backups

- [ ] Verify filesystem type
- [ ] Confirm hardlink support
- [ ] Check available space (1.5x game size minimum)
- [ ] Test hardlink creation (manual test)
- [ ] Verify read/write permissions
- [ ] Disable antivirus (temporarily for testing)
- [ ] Enable Developer Mode (Windows 10+)
- [ ] Mount backup drive if using separate storage

### Optimal Setup

| Platform | Filesystem | Mount/Drive | Notes |
|----------|-----------|-----------|-------|
| Windows  | NTFS      | Local SSD  | Developer Mode required |
| macOS    | APFS      | Local SSD  | Reflinks supported |
| Linux    | ext4      | /mnt      | Reliable, standard |
| Linux    | Btrfs     | /mnt      | Advanced, compression |

### Performance Expectations

- **Hardlink**: 8-12s for 50GB (same filesystem)
- **Full Copy**: 2.5-4 min for 50GB
- **Network**: 5-15 min for 50GB (not recommended)

---

**Last Updated**: 2026-01-15  
**Version**: 1.0.0
