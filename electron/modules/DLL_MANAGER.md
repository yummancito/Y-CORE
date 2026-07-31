# DLL Management System for Y-Core Online Fix

Complete, self-contained DLL management system for the Online Fix feature. Handles sourcing, integrity verification, caching, and automatic repair of Steam API emulator DLLs with zero external dependencies.

## Features

- **Internal DLL Sourcing**: Download from Goldberg gbe_fork and alternative open-source emulators
- **SHA256 Integrity Verification**: Automatic corruption detection with hash validation
- **Smart Caching**: Local caching prevents repeated downloads
- **Version Tracking**: Manifest system tracks DLL versions and sources
- **Auto-Repair**: Detects corrupted DLLs and re-downloads automatically
- **Fallback Chain**: Graceful degradation through multiple download sources
- **Progress Reporting**: Real-time callbacks for UI feedback
- **NO External Dependencies**: Uses only Node.js built-in modules (https, crypto, fs)

## Architecture

### Core Components

```
dll-manager.ts
├── DLLManager class (main API)
├── Download system (https-based)
├── Hash verification (SHA256)
├── Manifest system (JSON-based)
├── Cache management
└── Integrity checking
```

### File Structure

```
resources/native/
├── steam_api64.dll         (prepackaged 64-bit, if available)
├── steam_api.dll           (prepackaged 32-bit, if available)
└── dlls/
    └── manifest.json       (integrity tracking)

~/.electron/dll-cache/      (user cache directory)
├── manifest.json           (cached DLL metadata)
├── steam_api64_*.dll       (cached 64-bit DLLs)
└── steam_api_*.dll         (cached 32-bit DLLs)
```

## Usage

### Basic Usage

```typescript
import { getDLLManager } from './dll-manager'

// Get singleton instance
const dllManager = getDLLManager()

// Ensure both 32 and 64-bit DLLs are available
const result = await dllManager.ensureDLLsAvailable()
if (result.success) {
  const dll64Path = result.dlls.dll64?.path
  const dll32Path = result.dlls.dll32?.path
  // Use DLLs...
} else {
  console.error('Failed to obtain DLLs:', result.errors)
}
```

### Advanced Usage

```typescript
import { createDLLManager } from './dll-manager'

// Create custom instance with options
const manager = createDLLManager({
  cacheDir: '/custom/cache/path',
  resourcesDir: '/custom/resources/path',
  onProgress: (message) => console.log(`[DLL] ${message}`),
  timeoutMs: 300000, // 5 minute timeout
})

// Obtain specific architecture
const dll64Info = await manager.obtainDLL('64')
if (dll64Info) {
  console.log(`DLL at: ${dll64Info.path}`)
  console.log(`Hash: ${dll64Info.sha256}`)
  console.log(`Size: ${dll64Info.size} bytes`)
}

// Verify integrity
const isValid = await manager.verifyDLLIntegrity(dllPath, expectedHash)

// Repair corrupted DLL
if (!isValid) {
  const repaired = await manager.repairCorruptedDLL('64')
  if (repaired) console.log('DLL repaired successfully')
}

// Check cache stats
const stats = manager.getCacheStats()
console.log(`Cache: ${stats.totalFiles} files, ${stats.totalSizeBytes} bytes`)

// Clean up old cached files
const cleanup = await manager.cleanupCache()
console.log(`Cleaned up: ${cleanup.removed} files, freed ${cleanup.freedBytes} bytes`)
```

## DLL Sources

The system tries sources in this order until one succeeds:

### 1. **Goldberg gbe_fork** (Primary)
   - **URL**: https://github.com/Detanup01/gbe_fork/releases/download/latest/
   - **DLLs**: steam_api64.dll, steam_api.dll
   - **Version**: 1.2.0+
   - **Status**: Actively maintained, reliable

### 2. **GSE (Game Server Emulator)** (Fallback)
   - **URL**: https://github.com/Rats-and-Cats/GSE/releases/download/latest/
   - **DLLs**: GSE_64.dll, GSE_32.dll
   - **Version**: 0.1.0+
   - **Status**: Alternative emulator

## Integration with Online Fix

The `onlinefix.ts` module uses the DLL Manager automatically:

```typescript
// In onlinefix:generate handler
const dllManager = getDLLManager({
  onProgress: (msg) => logger.debug(msg, 'onlinefix'),
})

const dllResult = await dllManager.ensureDLLsAvailable()
if (!dllResult.success) {
  return {
    success: false,
    error: `Failed to obtain required DLLs: ${dllResult.errors.join(', ')}`,
  }
}

// DLLs now ready for use
const goldbergDll64 = dllResult.dlls.dll64?.path
const goldbergDll32 = dllResult.dlls.dll32?.path
```

## Manifest Format

The DLL manifest tracks integrity and source information:

```json
{
  "steam_api64.dll": {
    "name": "steam_api64.dll",
    "arch": "64",
    "version": "1.2.0",
    "sha256": "a1b2c3d4e5f6...",
    "size": 1446400,
    "downloadedAt": "2026-07-30T12:34:56.000Z",
    "sourceUrl": "https://github.com/Detanup01/gbe_fork/releases/download/latest/steam_api64.dll"
  }
}
```

### Manifest Entries

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | DLL filename |
| `arch` | "32" \| "64" | Architecture |
| `version` | string | DLL version |
| `sha256` | string | SHA256 hash for integrity |
| `size` | number | File size in bytes |
| `downloadedAt` | ISO string | Download timestamp |
| `sourceUrl` | string | Download source URL |

## Configuration

### Environment Variables

```bash
# Custom DLL cache directory
YCORE_DLL_CACHE=/path/to/cache

# Custom resources directory
YCORE_DLL_RESOURCES=/path/to/resources

# Download timeout in milliseconds (default: 300000)
YCORE_DLL_TIMEOUT=600000
```

### Programmatic Configuration

```typescript
const manager = createDLLManager({
  cacheDir: process.env.YCORE_DLL_CACHE,
  resourcesDir: process.env.YCORE_DLL_RESOURCES,
  timeoutMs: parseInt(process.env.YCORE_DLL_TIMEOUT || '300000'),
  onProgress: (msg) => {
    // Send to UI via IPC, logger, etc.
  },
})
```

## Error Handling

### Common Errors

```typescript
// Network errors
// Downloads will fail if internet is unavailable
// Falls back to cached or prepackaged versions

// Hash mismatches
// Indicates download corruption, automatically re-downloads

// Timeout errors
// Downloads taking too long, adjust YCORE_DLL_TIMEOUT

// Disk space errors
// Cannot write to cache, check available disk space
```

### Error Recovery

```typescript
const result = await manager.ensureDLLsAvailable()

if (result.errors.length > 0) {
  logger.error(`DLL errors: ${result.errors.join(', ')}`)
}

if (result.warnings.length > 0) {
  logger.warn(`DLL warnings: ${result.warnings.join(', ')}`)
  // Warnings don't prevent success, e.g., missing 32-bit when game is 64-bit
}
```

## Integrity System

### Corruption Detection

```typescript
// Automatic detection happens in two ways:

// 1. On startup
const { allValid, dlls } = await manager.performStartupCheck()
if (!allValid) {
  logger.warn('Corrupted DLLs detected, repairs in progress')
}

// 2. Before use
const isValid = await manager.verifyDLLIntegrity(dllPath, expectedHash)
if (!isValid) {
  const repaired = await manager.repairCorruptedDLL('64')
}
```

### Manual Verification

```typescript
// Calculate hash of a file
import crypto from 'crypto'

function hashFile(filePath) {
  const content = fs.readFileSync(filePath)
  return crypto.createHash('sha256').update(content).digest('hex')
}

const actualHash = hashFile('/path/to/steam_api64.dll')
const isValid = await manager.verifyDLLIntegrity(dllPath, actualHash)
```

## Performance Considerations

### Caching Strategy

- **First run**: Downloads from source (~1-2MB), takes 5-30 seconds depending on connection
- **Subsequent runs**: Loads from cache (<100ms)
- **Corrupted DLL**: Re-download triggered automatically

### Bandwidth Usage

- **steam_api64.dll**: ~1.4 MB
- **steam_api.dll**: ~0.2 MB
- **Total**: ~1.6 MB per initial download

### Cache Size

Typical cache grows to:
- Multiple versions: 3-5 MB
- Single version: 1.6 MB
- Cleanup removes unused versions automatically

## Testing

Unit tests are included in `dll-manager.test.ts`:

```bash
# Run tests
npm test electron/modules/dll-manager.test.ts

# Test coverage includes:
# - DLL validation
# - Hash calculation and verification
# - Cache management
# - Version tracking
# - Corruption detection
# - Error handling
# - Progress reporting
```

## Troubleshooting

### DLLs not downloading

1. Check internet connection
2. Verify GitHub URLs are accessible
3. Check firewall/proxy settings
4. Increase timeout: `YCORE_DLL_TIMEOUT=600000`

### Hash mismatches

1. Downloaded file may be corrupted
2. System will automatically re-download
3. Check disk space
4. Try manual cleanup: `await manager.cleanupCache()`

### Cache growing too large

1. Run cleanup: `await manager.cleanupCache()`
2. Check cache directory: `~/.electron/dll-cache/`
3. Manual cleanup: Delete old files keeping manifest.json

### DLL not working in game

1. Verify DLL architecture matches game (32 vs 64-bit)
2. Check that DLL is valid: `await manager.verifyDLLIntegrity(path)`
3. Try repair: `await manager.repairCorruptedDLL('64')`
4. Check game logs for DLL load errors

## Future Enhancements

- [ ] Parallel DLL downloads for faster setup
- [ ] Delta downloads for version upgrades
- [ ] Signed DLL verification (once community keys available)
- [ ] Automatic DLL updates in background
- [ ] DLL version preference configuration
- [ ] Archive.org fallback source

## API Reference

### `DLLManager` Class

#### Methods

##### `async ensureDLLsAvailable(): Promise<EnsureDLLsResult>`
Ensures both 32 and 64-bit DLLs are available from any source.

##### `async obtainDLL(arch: '32' | '64'): Promise<DLLInfo | null>`
Obtains a single DLL of specified architecture.

##### `async downloadDLL(url, arch, sourceName, expectedHash?): Promise<object | null>`
Downloads a DLL from a specific URL.

##### `async verifyDLLIntegrity(dllPath, expectedHash?): Promise<boolean>`
Verifies DLL file integrity using SHA256.

##### `async repairCorruptedDLL(arch): Promise<boolean>`
Re-downloads and repairs a corrupted DLL.

##### `async performStartupCheck(): Promise<object>`
Runs integrity check on all cached DLLs at startup.

##### `async cleanupCache(): Promise<{ removed, freedBytes }>`
Removes unused cached DLLs, keeps manifest.

##### `getCacheStats(): object`
Returns cache statistics without I/O.

##### `async getInstalledVersions(): Promise<{ dll32?, dll64? }>`
Returns versions of installed DLLs.

##### `async getLatestVersion(arch): Promise<string>`
Returns latest available version for architecture.

## License

Part of Y-Core project. Same license as parent project.
