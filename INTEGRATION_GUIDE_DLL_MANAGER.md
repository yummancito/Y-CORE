# DLL Management System Integration Guide

Complete step-by-step guide to integrate the DLL Manager into the Y-Core application.

## Table of Contents

1. [Quick Start](#quick-start)
2. [Main Process Integration](#main-process-integration)
3. [UI Integration](#ui-integration)
4. [Configuration](#configuration)
5. [Monitoring](#monitoring)
6. [Troubleshooting](#troubleshooting)

## Quick Start

The DLL Manager is already integrated into `onlinefix.ts`. For Online Fix to work:

```typescript
// This is already in onlinefix.ts - just needs to work!
const dllManager = getDLLManager({
  onProgress: (msg) => logger.debug(msg, 'onlinefix'),
})

const dllResult = await dllManager.ensureDLLsAvailable()
```

For additional startup initialization and UI features, follow the integration steps below.

## Main Process Integration

### Step 1: Initialize on App Ready (in main.ts or your app startup file)

```typescript
import { initializeDLLManagerOnStartup, registerDLLManagerIPC } from './electron/modules/dll-startup'
import { app } from 'electron'

// In your app.on('ready') handler
async function onAppReady() {
  // ... other initialization ...

  // Initialize DLL Manager
  await initializeDLLManagerOnStartup()

  // Register IPC handlers for UI communication
  registerDLLManagerIPC()

  // Optionally: start periodic integrity checks (every hour)
  import { startPeriodicIntegrityChecks } from './electron/modules/dll-startup'
  startPeriodicIntegrityChecks(3600000) // 1 hour

  // ... rest of startup ...
}
```

### Step 2: Update Your Main Entry Point

Example integration in `electron/main.ts`:

```typescript
import { ipcMain, app, BrowserWindow } from 'electron'
import {
  initializeDLLManagerOnStartup,
  registerDLLManagerIPC,
  preCacheDLLs,
  startPeriodicIntegrityChecks,
  stopPeriodicIntegrityChecks,
} from './modules/dll-startup'

app.on('ready', async () => {
  // Initialize DLL Manager
  await initializeDLLManagerOnStartup()

  // Register IPC handlers
  registerDLLManagerIPC()

  // Start periodic checks
  startPeriodicIntegrityChecks(3600000) // 1 hour

  // Create main window, etc...
})

app.on('before-quit', () => {
  // Clean up periodic checks
  stopPeriodicIntegrityChecks()
})
```

## UI Integration

### Step 1: Get DLL Status from Renderer

In your React/UI component:

```typescript
import { getDLLStatus, verifyDLLs, repairDLL, cleanupDLLCache, preCacheDLLsFromUI } from '../electron/modules/dll-startup'

// Get current DLL status
async function checkDLLStatus() {
  const status = await getDLLStatus()
  if (status.success) {
    console.log('DLL Versions:', status.versions)
    console.log('Cache Stats:', status.cache)
  }
}

// Verify DLL integrity
async function verifyDLLsOnClick() {
  const result = await verifyDLLs()
  if (result.success) {
    alert(`DLL Check: ${result.allValid ? 'All valid' : 'Some corrupted'}`)
  }
}

// Repair specific DLL
async function repairOn64BitClick() {
  const result = await repairDLL('64')
  if (result.success && result.repaired) {
    alert('64-bit DLL repaired successfully')
  }
}

// Clean up cache
async function cleanupCacheOnClick() {
  const result = await cleanupDLLCache()
  if (result.success) {
    alert(`Freed ${result.freedMB} MB`)
  }
}

// Pre-cache DLLs
async function preCacheOnClick() {
  const result = await preCacheDLLsFromUI()
  if (result.success) {
    alert('DLLs pre-cached successfully')
  }
}
```

### Step 2: Add Settings UI

Example settings panel in your app:

```jsx
export function DLLManagerSettings() {
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    loadStatus()
  }, [])

  async function loadStatus() {
    const result = await getDLLStatus()
    setStatus(result)
  }

  async function handleVerify() {
    setLoading(true)
    await verifyDLLs()
    await loadStatus()
    setLoading(false)
  }

  async function handleRepair64() {
    setLoading(true)
    await repairDLL('64')
    await loadStatus()
    setLoading(false)
  }

  async function handleCleanup() {
    setLoading(true)
    await cleanupDLLCache()
    await loadStatus()
    setLoading(false)
  }

  return (
    <div className="dll-settings">
      <h2>DLL Management</h2>

      {status && (
        <>
          <div className="status">
            <h3>Installed Versions</h3>
            <p>64-bit: {status.versions?.dll64 || 'Not installed'}</p>
            <p>32-bit: {status.versions?.dll32 || 'Not installed'}</p>
          </div>

          <div className="cache-stats">
            <h3>Cache Statistics</h3>
            <p>Files: {status.cache?.totalFiles || 0}</p>
            <p>Size: {((status.cache?.totalSizeBytes || 0) / 1024 / 1024).toFixed(2)} MB</p>
          </div>
        </>
      )}

      <div className="actions">
        <button onClick={handleVerify} disabled={loading}>
          {loading ? 'Verifying...' : 'Verify Integrity'}
        </button>
        <button onClick={handleRepair64} disabled={loading}>
          {loading ? 'Repairing...' : 'Repair 64-bit'}
        </button>
        <button onClick={handleCleanup} disabled={loading}>
          {loading ? 'Cleaning...' : 'Clean Cache'}
        </button>
      </div>
    </div>
  )
}
```

## Configuration

### Environment Variables

Set these before starting the app:

```bash
# Custom cache directory (default: ~/.electron/dll-cache)
export YCORE_DLL_CACHE=/custom/cache/path

# Custom resources directory (default: ./resources/native)
export YCORE_DLL_RESOURCES=/custom/resources/path

# Download timeout in ms (default: 300000)
export YCORE_DLL_TIMEOUT=600000

# Enable verbose logging
export DEBUG=*dll*
```

### Programmatic Configuration

Override default settings when creating manager:

```typescript
import { createDLLManager } from './modules/dll-manager'

const manager = createDLLManager({
  cacheDir: process.env.YCORE_DLL_CACHE || defaultCacheDir,
  resourcesDir: process.env.YCORE_DLL_RESOURCES || defaultResourcesDir,
  timeoutMs: parseInt(process.env.YCORE_DLL_TIMEOUT || '300000'),
  onProgress: (message) => {
    // Send progress to UI
    mainWindow?.webContents.send('dll:progress', message)
  },
})
```

## Monitoring

### Progress Reporting

Get real-time progress updates during operations:

```typescript
import { createDLLManager } from './modules/dll-manager'

const manager = createDLLManager({
  onProgress: (message) => {
    // Log to console
    console.log(`[DLL] ${message}`)

    // Send to UI via IPC
    if (mainWindow) {
      mainWindow.webContents.send('dll:progress', message)
    }

    // Send to logging system
    logger.debug(message, 'dll-manager')
  },
})
```

### Listen to Progress in UI

```typescript
import { ipcRenderer } from 'electron'

useEffect(() => {
  const unsubscribe = ipcRenderer.on('dll:progress', (event, message) => {
    console.log(`[DLL Progress] ${message}`)
    setProgressMessage(message)
  })

  return unsubscribe
}, [])
```

### Logging Integration

DLL Manager logs to the same system as the app. Check logs:

```bash
# Show DLL-specific logs
grep "dll-manager" ~/.electron/logs/main.log

# Show Online Fix integration logs
grep "onlinefix" ~/.electron/logs/main.log
```

## Troubleshooting

### DLLs Not Downloading

**Symptoms**: Online Fix fails with "Failed to obtain required DLLs"

**Solution**:
1. Check internet connection
2. Verify GitHub is accessible: `curl https://github.com`
3. Increase timeout:
   ```bash
   export YCORE_DLL_TIMEOUT=600000
   ```
4. Check logs for specific error:
   ```bash
   grep "DLL" ~/.electron/logs/main.log
   ```

### Cache Growing Too Large

**Symptoms**: `~/.electron/dll-cache/` exceeds 50 MB

**Solution**:
1. Run cleanup:
   ```typescript
   const dllManager = getDLLManager()
   await dllManager.cleanupCache()
   ```
2. Or from settings UI, click "Clean Cache"
3. Check what's in cache:
   ```bash
   ls -lh ~/.electron/dll-cache/
   ```

### Hash Mismatches

**Symptoms**: "DLL hash mismatch" errors in logs

**Solution**:
1. This indicates download corruption, should auto-recover
2. If persistent, manually repair:
   ```typescript
   await dllManager.repairCorruptedDLL('64')
   ```
3. Check disk space
4. Try with different network (VPN, etc.)

### IPC Handlers Not Working

**Symptoms**: "IPC not available" from UI

**Solution**:
1. Verify `registerDLLManagerIPC()` is called in main process
2. Check preload script exports ipcRenderer:
   ```typescript
   // In preload.ts
   import { ipcRenderer } from 'electron'
   window.electron = { ipcRenderer }
   ```
3. Verify window is ready before calling IPC:
   ```typescript
   if (typeof window !== 'undefined') {
     await getDLLStatus()
   }
   ```

### Startup Hanging

**Symptoms**: App takes 30+ seconds to start

**Solution**:
1. DLL Manager startup check might be slow on first run
2. This is normal on first run (includes download if needed)
3. Subsequent runs will be fast (<1 second) due to caching
4. To optimize:
   ```typescript
   // Make startup check optional/background
   initializeDLLManagerOnStartup().catch(err => {
     logger.warn(`DLL init failed: ${err}`, 'startup')
     // Continue anyway
   })
   ```

### Testing Integration

Unit tests:

```bash
# Run DLL Manager tests
npm test -- dll-manager.test.ts

# Run with coverage
npm test -- --coverage dll-manager.test.ts
```

Integration test:

```typescript
// In your test file
import { getDLLManager } from './dll-manager'

test('should obtain DLLs', async () => {
  const manager = getDLLManager()
  const result = await manager.ensureDLLsAvailable()

  expect(result.success).toBe(true)
  expect(result.dlls.dll64?.path).toBeDefined()
})
```

## Performance Optimization

### Pre-cache on Install

When app is first installed, pre-cache DLLs:

```typescript
import { preCacheDLLs } from './modules/dll-startup'

async function onFirstRun() {
  logger.info('First run - pre-caching DLLs...')
  const success = await preCacheDLLs()
  if (success) {
    logger.info('DLLs pre-cached successfully')
  }
}
```

### Lazy Load

If startup time is critical, initialize DLL Manager after UI is ready:

```typescript
// Fast startup
const mainWindow = new BrowserWindow(/* ... */)

// Initialize DLLs in background after UI is shown
setImmediate(async () => {
  await initializeDLLManagerOnStartup()
})
```

### Parallel Operations

If handling multiple games:

```typescript
// All games can share cached DLLs
const dllManager = getDLLManager() // Singleton

// Multiple games use same instance, no re-downloads
game1.dll64 = (await dllManager.obtainDLL('64')).path
game2.dll64 = (await dllManager.obtainDLL('64')).path // Instant, from cache
```

## Next Steps

1. **Add to Your App**: Follow the integration steps above
2. **Test**: Run the unit tests and integration tests
3. **Monitor**: Check logs and UI status periodically
4. **Configure**: Adjust timeouts, cache dir, etc. as needed
5. **Communicate**: Keep users informed via UI progress messages

## Support

For issues or questions:

1. Check logs: `~/.electron/logs/main.log`
2. Run verification: `await verifyDLLs()`
3. Try repair: `await repairDLL('64')`
4. Clean cache: `await cleanupDLLCache()`
5. File bug report with logs attached
