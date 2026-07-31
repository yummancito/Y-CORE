# Y-Core Mod Security Integration Guide

Complete integration guide for the Malware Scanner Module in Y-Core Mod Manager.

## Overview

The Malware Scanner Module provides production-ready malware detection for mod installations with a multi-tier approach:

1. **Tier 1**: Extension Whitelist/Blacklist (< 10ms)
2. **Tier 2**: PE Header Analysis (30-50ms)
3. **Tier 3**: VirusTotal API Integration (500ms, cached < 100ms)
4. **Tier 4**: YARA Rules Scanning (100-500ms)

## Architecture

### File Structure

```
electron/modules/mod-security/
├── types.ts              # TypeScript interfaces and types
├── malware-scanner.ts    # Main scanner implementation
└── index.ts             # Module exports
```

### Module Dependencies

```typescript
// Core dependencies
import { EventEmitter } from 'events';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as crypto from 'crypto';
import fetch from 'node-fetch';
import { execAsync } from 'util';
```

## Installation

### 1. Basic Setup

```typescript
import { MalwareScanner } from 'electron/modules/mod-security';

// Create scanner instance
const scanner = new MalwareScanner({
  enableVirusTotal: true,
  enableYara: true,
  enablePEAnalysis: true,
  blockDangerousFiles: true,
  virusTotalApiKey: process.env.VIRUSTOTAL_API_KEY,
});

// Initialize
await scanner.initialize();
```

### 2. VirusTotal API Key Setup

```typescript
// Method 1: Configuration
const scanner = new MalwareScanner({
  virusTotalApiKey: 'your-api-key-here',
});

// Method 2: Runtime update
scanner.setVirusTotalKey('your-api-key-here');

// Method 3: Environment variable
process.env.VIRUSTOTAL_API_KEY = 'your-api-key-here';
```

**Get API Key:**
- Visit https://www.virustotal.com/gui/home/upload
- Sign up for free account
- Generate API key from settings

### 3. YARA Rules Setup

```typescript
// Download open-source YARA rules
// Option 1: Yara Community Rules
// https://github.com/Yara-Rules/rules

const scanner = new MalwareScanner({
  yaraRulesPath: '/path/to/yara/rules',
  enableYara: true,
});
```

**Install YARA:**
```bash
# Windows (via Chocolatey)
choco install yara

# macOS (via Homebrew)
brew install yara

# Linux (Ubuntu/Debian)
sudo apt-get install yara
```

## Usage Examples

### Example 1: Scan Single File

```typescript
import { MalwareScanner, SeverityLevel } from 'electron/modules/mod-security';

const scanner = new MalwareScanner({
  virusTotalApiKey: process.env.VIRUSTOTAL_API_KEY,
});

await scanner.initialize();

try {
  const result = await scanner.scanFile('/path/to/mod.exe');

  console.log(`File: ${result.fileName}`);
  console.log(`Severity: ${result.overallSeverity}`);
  console.log(`Should Block: ${result.shouldBlock}`);
  console.log(`Recommendation: ${result.recommendation}`);

  if (result.shouldBlock) {
    console.log('ALERT: Malware detected!');
  }
} catch (error) {
  console.error('Scan failed:', error);
}
```

### Example 2: Scan Directory

```typescript
const result = await scanner.scanDirectory('/path/to/mods');

console.log(`Total Files: ${result.totalFiles}`);
console.log(`Scanned: ${result.scannedFiles}`);
console.log(`Blocked: ${result.blockedFiles}`);
console.log(`Summary:`, result.summary);

// Filter dangerous files
const dangerousFiles = result.results.filter(
  (r) => r.overallSeverity === SeverityLevel.DANGEROUS
);

console.log('Dangerous files:', dangerousFiles);
```

### Example 3: Event Monitoring

```typescript
// Listen to scan events
scanner.on('scan-started', (event) => {
  console.log(`Scanning: ${event.filePath}`);
});

scanner.on('scan-progress', (event) => {
  console.log(`Progress: ${event.currentTier} - ${event.progress}%`);
});

scanner.on('scan-completed', (event) => {
  console.log(`Result: ${event.result.overallSeverity}`);
});

scanner.on('file-blocked', (event) => {
  console.error(`BLOCKED: ${event.filePath}`);
  console.error(`Reason: ${event.reason}`);
});

// Perform scan
await scanner.scanFile('/path/to/file.exe');
```

### Example 4: Cache Management

```typescript
// Get cache statistics
const stats = scanner.getCacheStats();
console.log(`Cache entries: ${stats.entriesCount}`);
console.log(`Cache size: ${stats.cacheSize} bytes`);

// Clear cache
scanner.clearCache();

// Get scan statistics
const scanStats = scanner.getScanStats();
console.log(`Total scans: ${scanStats.totalScans}`);
console.log(`Avg time: ${scanStats.averageScanTime}ms`);
console.log(`Cache hit rate: ${scanStats.cacheHitRate * 100}%`);
```

### Example 5: Configuration Management

```typescript
// Get current config
const config = scanner.getConfig();
console.log(config);

// Update configuration
scanner.updateConfig({
  blockSuspiciousFiles: true,
  maxFileSizeForVT: 50 * 1024 * 1024,
});

// Verify update
console.log(scanner.getConfig());
```

## Integration with Game Service

### IPC Handler Example

```typescript
// electron/handlers/mod-security.ts
import { ipcMain } from 'electron';
import { MalwareScanner } from '../modules/mod-security';

const scanner = new MalwareScanner({
  virusTotalApiKey: process.env.VIRUSTOTAL_API_KEY,
});

export function registerModSecurityHandlers() {
  // Scan file
  ipcMain.handle('mod-security:scan-file', async (event, filePath) => {
    return scanner.scanFile(filePath);
  });

  // Scan directory
  ipcMain.handle('mod-security:scan-directory', async (event, dirPath) => {
    return scanner.scanDirectory(dirPath);
  });

  // Get cache stats
  ipcMain.handle('mod-security:cache-stats', () => {
    return scanner.getCacheStats();
  });

  // Clear cache
  ipcMain.handle('mod-security:clear-cache', () => {
    scanner.clearCache();
    return true;
  });

  // Get scan stats
  ipcMain.handle('mod-security:scan-stats', () => {
    return scanner.getScanStats();
  });

  // Set VT key
  ipcMain.handle('mod-security:set-vt-key', (event, key) => {
    scanner.setVirusTotalKey(key);
    return true;
  });
}
```

### Preload Script Example

```typescript
// electron/preload.ts
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('modSecurity', {
  scanFile: (filePath: string) =>
    ipcRenderer.invoke('mod-security:scan-file', filePath),

  scanDirectory: (dirPath: string) =>
    ipcRenderer.invoke('mod-security:scan-directory', dirPath),

  getCacheStats: () =>
    ipcRenderer.invoke('mod-security:cache-stats'),

  clearCache: () =>
    ipcRenderer.invoke('mod-security:clear-cache'),

  getScanStats: () =>
    ipcRenderer.invoke('mod-security:scan-stats'),

  setVirusTotalKey: (key: string) =>
    ipcRenderer.invoke('mod-security:set-vt-key', key),
});
```

### React Component Example

```typescript
// src/components/ModSecurityScanner.tsx
import React, { useState } from 'react';
import { ScanResult, SeverityLevel } from '@/electron/modules/mod-security';

interface Props {
  filePath: string;
}

export const ModSecurityScanner: React.FC<Props> = ({ filePath }) => {
  const [result, setResult] = useState<ScanResult | null>(null);
  const [loading, setLoading] = useState(false);

  const handleScan = async () => {
    setLoading(true);
    try {
      const scanResult = await window.modSecurity.scanFile(filePath);
      setResult(scanResult);
    } catch (error) {
      console.error('Scan failed:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mod-security-scanner">
      <button onClick={handleScan} disabled={loading}>
        {loading ? 'Scanning...' : 'Scan File'}
      </button>

      {result && (
        <div className={`severity-${result.overallSeverity}`}>
          <h3>Scan Result</h3>
          <p>File: {result.fileName}</p>
          <p>Severity: {result.overallSeverity}</p>
          <p>Recommendation: {result.recommendation}</p>

          {result.shouldBlock && (
            <div className="alert alert-danger">
              This file has been blocked due to security concerns.
            </div>
          )}

          <details>
            <summary>Detailed Scan Report</summary>
            <pre>{JSON.stringify(result, null, 2)}</pre>
          </details>
        </div>
      )}
    </div>
  );
};
```

## Configuration Reference

### MalwareScannerConfig

```typescript
interface MalwareScannerConfig {
  // VirusTotal settings
  virusTotalApiKey?: string;           // API key for VirusTotal
  enableVirusTotal: boolean;            // Enable/disable VT scanning
  maxFileSizeForVT: number;             // Max file size for VT (default: 40MB)

  // YARA settings
  enableYara: boolean;                  // Enable/disable YARA scanning
  yaraRulesPath?: string;               // Path to YARA rules directory

  // PE Analysis settings
  enablePEAnalysis: boolean;            // Enable/disable PE header analysis

  // Blocking settings
  blockDangerousFiles: boolean;         // Auto-block dangerous files
  blockSuspiciousFiles: boolean;        // Auto-block suspicious files

  // Cache settings
  cacheTTL: number;                     // Cache TTL in milliseconds (default: 24h)

  // File list settings
  fileExtensionWhitelist: string[];     // Safe extensions
  fileExtensionBlacklist: string[];     // Dangerous extensions

  // Logging
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}
```

### Default Configuration

```typescript
const DEFAULT_SCANNER_CONFIG = {
  enableVirusTotal: true,
  enableYara: true,
  enablePEAnalysis: true,
  cacheTTL: 24 * 60 * 60 * 1000,        // 24 hours
  maxFileSizeForVT: 40 * 1024 * 1024,   // 40 MB
  blockDangerousFiles: true,
  blockSuspiciousFiles: false,
  fileExtensionWhitelist: [
    '.pak', '.vpk', '.bsp', '.mdl', '.cfg', '.lua',
    '.ini', '.json', '.xml', '.txt', '.png', '.jpg',
    '.wav', '.mp3', '.ogg', '.ttf', '.fnt', '.vdf',
  ],
  fileExtensionBlacklist: [
    '.exe', '.bat', '.ps1', '.vbs', '.com', '.scr',
    '.dll', '.sys', '.drv', '.msi', '.jar',
  ],
  logLevel: 'info',
};
```

## Severity Levels

```typescript
enum SeverityLevel {
  CLEAN = 'clean',           // File is safe
  WARNING = 'warning',       // File has minor concerns
  SUSPICIOUS = 'suspicious', // File shows suspicious patterns
  DANGEROUS = 'dangerous',   // File likely contains malware
  BLOCKED = 'blocked',       // File extension is blacklisted
}
```

## Performance Characteristics

### Scan Times (Typical)

| Tier | File Type | Time | Cache | Notes |
|------|-----------|------|-------|-------|
| Extension | Any | < 10ms | N/A | Always runs first |
| PE Header | .exe/.dll | 30-50ms | N/A | SHA256 computation included |
| VirusTotal | Any | 500ms | 100ms | Depends on API response |
| YARA | Any | 100-500ms | N/A | Requires YARA binary |

### Scaling Metrics

- **Directory Scan**: ~100ms per file average
- **Cache Hit Rate**: ~60-70% for repeated files
- **Memory Usage**: ~50MB base + cache
- **Parallel Scans**: Supports concurrent scans

## Best Practices

### 1. API Key Management

```typescript
// DO: Use environment variables
const scanner = new MalwareScanner({
  virusTotalApiKey: process.env.VIRUSTOTAL_API_KEY,
});

// DON'T: Hardcode API keys
const scanner = new MalwareScanner({
  virusTotalApiKey: 'put_your_api_key_here',
});
```

### 2. Error Handling

```typescript
try {
  const result = await scanner.scanFile(filePath);
  if (result.shouldBlock) {
    // Handle blocked file
  }
} catch (error) {
  // Scanner failed - decide on fallback behavior
  console.error('Scan failed:', error);
  // Option 1: Block installation (safe)
  // Option 2: Warn user and continue (risky)
  // Option 3: Allow installation (unsafe)
}
```

### 3. Performance Optimization

```typescript
// Use extension check as first filter
const ext = path.extname(filePath);
if (DANGEROUS_EXTENSIONS.includes(ext)) {
  // Block immediately
  return false;
}

// Only perform expensive scans for unknown extensions
const result = await scanner.scanFile(filePath);
```

### 4. Cache Management

```typescript
// Periodically clear cache to save memory
const stats = scanner.getCacheStats();
if (stats.cacheSize > 100 * 1024 * 1024) {
  scanner.clearCache();
}

// Or auto-clear every 24 hours
setInterval(() => {
  scanner.clearCache();
}, 24 * 60 * 60 * 1000);
```

### 5. Logging

```typescript
// Configure appropriate log level
const scanner = new MalwareScanner({
  logLevel: process.env.NODE_ENV === 'production' ? 'warn' : 'debug',
});
```

## Troubleshooting

### VirusTotal API Issues

**Problem**: "Invalid VirusTotal API key"
```
Solution: Verify API key is correct and has quota remaining
Check: https://www.virustotal.com/gui/home/api-key
```

**Problem**: Rate limiting (429 errors)
```
Solution: Implement retry logic with exponential backoff
Use cache more aggressively (increase cacheTTL)
Consider API tier upgrade
```

### YARA Scanning Issues

**Problem**: "YARA not available"
```
Solution: Install YARA binary on system
choco install yara  (Windows)
brew install yara   (macOS)
apt-get install yara (Linux)
```

**Problem**: Rule matching is slow
```
Solution: Use compiled YARA rules (.yrc files)
Reduce rule set to critical rules only
Run YARA async to avoid blocking UI
```

### PE Header Analysis Issues

**Problem**: Entropy calculation too aggressive
```
Solution: Adjust HIGH_ENTROPY_THRESHOLD in types.ts
Most packed executables: > 7.5
Encrypted executables: > 7.8
Normal executables: < 5.0
```

## Event Types

```typescript
// Emitted when scan starts
scanner.on('scan-started', (event: ScanStartedEvent) => {
  // event: { filePath, fileSize }
});

// Emitted during scan progress
scanner.on('scan-progress', (event: ScanProgressEvent) => {
  // event: { filePath, currentTier, progress: 0-100 }
});

// Emitted when scan completes
scanner.on('scan-completed', (event: ScanCompletedEvent) => {
  // event: { filePath, result: ScanResult }
});

// Emitted when file is blocked
scanner.on('file-blocked', (event: FileBlockedEvent) => {
  // event: { filePath, reason, severity }
});
```

## Testing

### Unit Test Example

```typescript
import { MalwareScanner, SeverityLevel } from './mod-security';

describe('MalwareScanner', () => {
  let scanner: MalwareScanner;

  beforeEach(() => {
    scanner = new MalwareScanner({
      enableVirusTotal: false, // Disable for tests
      enableYara: false,
    });
  });

  test('should block .exe files', async () => {
    const result = await scanner.scanFile('/path/to/file.exe');
    expect(result.overallSeverity).toBe(SeverityLevel.BLOCKED);
    expect(result.shouldBlock).toBe(true);
  });

  test('should allow .pak files', async () => {
    const result = await scanner.scanFile('/path/to/file.pak');
    expect(result.overallSeverity).not.toBe(SeverityLevel.BLOCKED);
  });

  test('should detect double extensions', async () => {
    const result = await scanner.scanFile('/path/to/file.txt.exe');
    expect(result.shouldBlock).toBe(true);
  });
});
```

## Security Considerations

1. **API Key Storage**: Never commit API keys. Use environment variables or secure vaults.

2. **File Upload**: Only upload unknown files to VirusTotal if user has consented.

3. **Cache Privacy**: Cache contains file hashes and detection results. Secure appropriately.

4. **Fallback Behavior**: Decide behavior when security checks fail:
   - Production: Block (safe but may block legitimate files)
   - Development: Warn only (useful for testing)

5. **YARA Rules**: Ensure rules are from trusted sources:
   - Official YARA project: https://github.com/Yara-Rules/rules
   - Malware Bazaar: https://www.malwarebazaar.org/
   - Verify rule signatures if available

## Performance Tips

1. **Parallel Scanning**: Use Promise.all for directory scans
2. **Tier Optimization**: Skip expensive tiers for whitelisted extensions
3. **Cache Warming**: Pre-populate cache with known-good files
4. **Async Operations**: Always run scans async to avoid UI blocking
5. **Batch Processing**: Scan multiple files concurrently with worker pool

## License

Y-Core Mod Manager - Malware Security Module
Copyright (c) 2024

## Support

For issues, feature requests, or security concerns:
1. Check this guide's Troubleshooting section
2. Review integration examples
3. Enable debug logging: `logLevel: 'debug'`
4. Check scanner events for detailed information
