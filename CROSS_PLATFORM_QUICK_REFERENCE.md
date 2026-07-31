# Cross-Platform Development Quick Reference

Quick guide for using the new cross-platform utilities in Y-Core.

## Import Statements

```typescript
// Platform detection and utilities
import { 
  PlatformUtils, 
  ProcessManager, 
  DiskSpaceManager, 
  CommandUtils,
  FileUtils,
  ArchUtils 
} from './platform-abstraction'

// Binary management
import { getBinaryLoader } from './binary-loader'
import { BinaryFormatAnalyzer, BinaryFormat } from './binary-format-analyzer'

// Input injection
import { InputInjectionService } from './input-injection-service'

// Environment setup
import { EnvironmentSetup } from './environment-setup'
```

## Common Tasks

### Detect Current Platform
```typescript
if (PlatformUtils.isWindows()) { /* ... */ }
if (PlatformUtils.isMacOS()) { /* ... */ }
if (PlatformUtils.isLinux()) { /* ... */ }
```

### Kill Process (Cross-Platform)
```typescript
// By name
await ProcessManager.killProcessByName('steam.exe', true)  // force=true

// By PID
await ProcessManager.killProcessByPid(1234, true)

// Check if running
const isRunning = await ProcessManager.isProcessRunning('steam.exe')
```

### Manage Disk Space
```typescript
// Get available space
const { available, total } = await DiskSpaceManager.getSpaceInfo('/path/to/game')

// Check if enough space
const hasSpace = await DiskSpaceManager.hasEnoughSpace('/path', 1024*1024*1024)  // 1GB

// Format for display
const formatted = DiskSpaceManager.formatBytes(available)  // "45.32 GB"
```

### Execute Commands Safely
```typescript
// Safe execution (no shell interpretation)
const { stdout, stderr } = await CommandUtils.execute('command', ['arg1', 'arg2'])

// With shell features (if absolutely needed)
const output = await CommandUtils.executeShell('some | piped | command')
```

### Handle Files with Normalized Line Endings
```typescript
// Write with LF (cross-platform)
FileUtils.writeFileWithNormalizedLineEndings('/path/to/file.txt', content)

// Read with normalization
const content = FileUtils.readFileWithNormalizedLineEndings('/path/to/file.txt')

// Create secure file (restricted permissions)
FileUtils.createSecureFile('/path/to/secret', data, 0o600)
```

### Get Application Data Paths
```typescript
// Windows: C:\Users\User\AppData\Local\Y-Core
// macOS: ~/Library/Application Support/Y-Core
// Linux: ~/.local/share/y-core
const dataDir = PlatformUtils.getUserDataPath('Y-Core')

const cacheDir = PlatformUtils.getCachePath('Y-Core')
const tempDir = PlatformUtils.getTempPath('Y-Core')
```

### Detect Architecture
```typescript
const arch = ArchUtils.getArch()  // 'x64' | 'arm64' | 'ia32' | 'other'
const binaryPath = ArchUtils.getBinaryPath('./binaries', 'myapp')
// Returns: ./binaries/myapp-windows-x64.exe (on Windows x64)
```

### Find and Load Binaries
```typescript
const loader = getBinaryLoader()

// Find YARA binary (bundled or system)
const yaraPath = await loader.getYaraBinaryPath()
if (yaraPath) {
  // Use yaraPath for YARA commands
} else {
  logger.warn('YARA binary not found')
}

// Find 7-Zip binary
const sevenZipPath = loader.getSevenZipPath()

// Check if binary is available
if (loader.isBinaryAvailable('yara')) {
  // Use it
}
```

### Analyze Binary Files
```typescript
// Analyze file on disk
const analysis = await BinaryFormatAnalyzer.analyzeFile('/path/to/binary')
if (analysis) {
  console.log(`Format: ${analysis.format}`)  // PE, MACHO, ELF
  console.log(`64-bit: ${analysis.is64Bit}`)
  console.log(`Packed: ${analysis.isPacked}`)
}

// Analyze buffer
const buffer = fs.readFileSync('/path/to/binary')
const analysis = await BinaryFormatAnalyzer.analyzeBuffer(buffer)
```

### Inject Input (Remote Play)
```typescript
const inputService = new InputInjectionService()
await inputService.initialize()

if (inputService.isSupported()) {
  // Inject keyboard
  await inputService.injectKey(13, true)   // Enter key down
  await inputService.injectKey(13, false)  // Enter key up

  // Inject mouse
  await inputService.injectMouse(100, 100, 'left')  // Move and click
} else {
  console.log('Input injection not supported on this platform')
}
```

### Initialize Environment (On App Startup)
```typescript
// Call once in main.ts during app initialization
EnvironmentSetup.initialize()

// Write/read config with normalized line endings
EnvironmentSetup.writeConfig('./config.json', configData)
const config = EnvironmentSetup.readConfig('./config.json')

// Check platform
if (EnvironmentSetup.isWindows()) { /* ... */ }
if (EnvironmentSetup.isMacOS()) { /* ... */ }
if (EnvironmentSetup.isLinux()) { /* ... */ }
```

---

## Anti-Patterns ❌ (Don't Do This)

```typescript
// ❌ Platform-specific commands
exec('taskkill /IM steam.exe /F')  // Only works on Windows!
execSync(`fsutil volume diskfree C:`)  // Windows-specific

// ❌ Hardcoded path separators
process.env.PATH = `${dir};${process.env.PATH}`  // Wrong on macOS/Linux!

// ❌ Assuming file extensions
const isExe = filePath.endsWith('.exe')  // Not all Windows binaries!

// ❌ No platform check for features
if (fs.constants.COPYFILE_FICLONE) {  // May not exist on older Node
  fs.copyFileSync(src, dst, fs.constants.COPYFILE_FICLONE)
}

// ❌ CRLF in config files
fs.writeFileSync(file, JSON.stringify(data))  // May have \r\n on Windows!

// ❌ Shell injection via exec()
exec(`command ${userInput}`)  // User input can break the command!
```

---

## Good Patterns ✅ (Do This)

```typescript
// ✅ Use cross-platform utilities
await ProcessManager.killProcessByName('steam.exe')  // Works everywhere

// ✅ Use dynamic separators
const sep = PlatformUtils.getPathSeparator()
process.env.PATH = `${dir}${sep}${process.env.PATH}`

// ✅ Support multiple binary formats
const analysis = await BinaryFormatAnalyzer.analyzeFile(filePath)
if (analysis?.isPacked) { /* ... */ }

// ✅ Handle async file operations
const space = await DiskSpaceManager.getSpaceInfo(path)
if (space.available < requiredBytes) { throw new Error('No space') }

// ✅ Normalize line endings
FileUtils.writeFileWithNormalizedLineEndings(file, content)

// ✅ Use execFile for safety
const { stdout } = await CommandUtils.execute('command', ['arg1', 'arg2'])
```

---

## Error Handling

### Graceful Degradation Pattern
```typescript
try {
  // Try primary method
  await ProcessManager.killProcessByName('steam.exe')
} catch (error) {
  // Graceful fallback
  logger.warn(`Could not kill Steam: ${error}`, 'steam')
  // Continue execution, don't crash
}
```

### Binary Not Found Pattern
```typescript
const binaryPath = await binaryLoader.getYaraBinaryPath()
if (!binaryPath) {
  logger.warn('YARA binary not found, skipping this tier')
  return []  // Empty results instead of crash
}

try {
  const result = await executeWithBinary(binaryPath)
  return result
} catch (error) {
  logger.error(`Binary execution failed: ${error}`)
  return []  // Graceful fallback
}
```

### Platform Feature Detection
```typescript
const inputService = new InputInjectionService()
await inputService.initialize()

if (!inputService.isSupported()) {
  // Disable feature in UI
  ui.showDisabledBanner('Input injection not available on this platform')
  return
}

// Feature is available
await inputService.injectKey(keyCode)
```

---

## Testing

### Unit Test Template
```typescript
describe('Cross-platform features', () => {
  it('should work on Windows', () => {
    if (!PlatformUtils.isWindows()) this.skip()
    // Windows-specific tests
  })

  it('should work on macOS', () => {
    if (!PlatformUtils.isMacOS()) this.skip()
    // macOS-specific tests
  })

  it('should work on Linux', () => {
    if (!PlatformUtils.isLinux()) this.skip()
    // Linux-specific tests
  })

  it('should work on all platforms', async () => {
    // Generic tests
    const space = await DiskSpaceManager.getSpaceInfo('.')
    expect(space.available).toBeGreaterThan(0)
  })
})
```

### Manual Testing Checklist
```
[ ] Windows: Run all cross-platform code paths
[ ] macOS: Test on Intel and ARM64
[ ] Linux: Test on common distros (Ubuntu, Fedora)
[ ] Verify fallbacks when binary not found
[ ] Check disk space detection accuracy
[ ] Verify hardlink/reflink detection
[ ] Test with spaces and special chars in paths
```

---

## Platform-Specific Behaviors

| Feature | Windows | macOS | Linux |
|---------|---------|-------|-------|
| Process kill | taskkill | killall | pkill |
| Disk space | statfs() | statfs() | statfs() |
| Hardlinks | NTFS only | Yes | Yes |
| Reflinks | No | APFS | btrfs/xfs |
| Input inject | SendInput | Quartz | xdotool |
| User data | LOCALAPPDATA | ~/Library | XDG_DATA_HOME |
| Line endings | CRLF→LF | LF | LF |
| Path separator | ; | : | : |

---

## Troubleshooting

### YARA Binary Not Found
```typescript
// Check if bundled binary exists
const loader = getBinaryLoader()
const path = await loader.getYaraBinaryPath()
console.log('YARA path:', path)

// If null, try installing:
// Windows: choco install yara
// macOS: brew install yara
// Linux: apt-get install yara
```

### Disk Space Always 0
```typescript
// statfs might fail if path is inaccessible
const space = await DiskSpaceManager.getSpaceInfo('/valid/path')
// Ensure path exists and is readable
```

### Hardlinks Not Working
```typescript
// Check filesystem type
const caps = await BackupManager.getFilesystemCapabilities(gamePath)
console.log('Filesystem:', caps.filesystemType)
console.log('Hardlinks supported:', caps.hardlinksSupported)

// Windows: Ensure NTFS (not FAT32)
// macOS: Ensure not using case-sensitive APFS
// Linux: Ensure ext4+ (not FAT)
```

---

**Last Updated**: 2026-07-30  
**Status**: ✅ Complete and tested
