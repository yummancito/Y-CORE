/**
 * Y-Core Mod Security Module - Integration Example
 * Demonstrates how to integrate the MalwareScanner into Y-Core
 */

import React from 'react';
import { ipcMain, BrowserWindow } from 'electron';
import { MalwareScanner, SeverityLevel, ScanResult } from './index';
import * as path from 'path';
import * as fs from 'fs-extra';

/**
 * Example 1: Initialize malware scanner with IPC handlers
 */
export async function setupModSecurityHandlers() {
  // Create scanner instance with production configuration
  const scanner = new MalwareScanner({
    virusTotalApiKey: process.env.VIRUSTOTAL_API_KEY,
    enableVirusTotal: process.env.ENABLE_VIRUSTOTAL !== 'false',
    enableYara: process.env.ENABLE_YARA !== 'false',
    enablePEAnalysis: true,
    blockDangerousFiles: true,
    blockSuspiciousFiles: false,
    cacheTTL: 24 * 60 * 60 * 1000, // 24 hours
    logLevel: process.env.NODE_ENV === 'production' ? 'warn' : 'debug',
  });

  // Initialize scanner
  try {
    await scanner.initialize();
    console.log('[ModSecurity] Scanner initialized successfully');
  } catch (error) {
    console.error('[ModSecurity] Failed to initialize scanner:', error);
  }

  // ==================== IPC Handlers ====================

  /**
   * Handle single file scan
   */
  ipcMain.handle(
    'mod-security:scan-file',
    async (event, filePath: string): Promise<ScanResult> => {
      console.log(`[ModSecurity] Scanning file: ${filePath}`);
      return await scanner.scanFile(filePath);
    }
  );

  /**
   * Handle directory scan
   */
  ipcMain.handle('mod-security:scan-directory', async (event, dirPath: string) => {
    console.log(`[ModSecurity] Scanning directory: ${dirPath}`);
    return await scanner.scanDirectory(dirPath);
  });

  /**
   * Handle batch file scan with progress
   */
  ipcMain.handle(
    'mod-security:scan-batch',
    async (event, filePaths: string[]) => {
      console.log(`[ModSecurity] Batch scanning ${filePaths.length} files`);

      const results = [];
      for (let i = 0; i < filePaths.length; i++) {
        try {
          const result = await scanner.scanFile(filePaths[i]);
          results.push(result);

          // Send progress to renderer
          event.sender.send('mod-security:batch-progress', {
            current: i + 1,
            total: filePaths.length,
            percentage: Math.round(((i + 1) / filePaths.length) * 100),
          });
        } catch (error) {
          console.error(`Failed to scan ${filePaths[i]}:`, error);
          results.push({
            filePath: filePaths[i],
            error: (error as Error).message,
          });
        }
      }

      return results;
    }
  );

  /**
   * Get cache statistics
   */
  ipcMain.handle('mod-security:cache-stats', () => {
    return scanner.getCacheStats();
  });

  /**
   * Get scan statistics
   */
  ipcMain.handle('mod-security:scan-stats', () => {
    return scanner.getScanStats();
  });

  /**
   * Clear cache
   */
  ipcMain.handle('mod-security:clear-cache', () => {
    scanner.clearCache();
    return { success: true };
  });

  /**
   * Set VirusTotal API key
   */
  ipcMain.handle('mod-security:set-vt-key', (event, apiKey: string) => {
    scanner.setVirusTotalKey(apiKey);
    return { success: true };
  });

  /**
   * Get configuration
   */
  ipcMain.handle('mod-security:get-config', () => {
    return scanner.getConfig();
  });

  /**
   * Update configuration
   */
  ipcMain.handle('mod-security:update-config', (event, config) => {
    scanner.updateConfig(config);
    return { success: true };
  });

  /**
   * Reset statistics
   */
  ipcMain.handle('mod-security:reset-stats', () => {
    scanner.resetStats();
    return { success: true };
  });

  // ==================== Event Listeners ====================

  // Listen to scanner events and relay to renderer
  scanner.on('scan-started', (event) => {
    const windows = BrowserWindow.getAllWindows();
    windows.forEach((win) => {
      win.webContents.send('mod-security:scan-started', event);
    });
  });

  scanner.on('scan-progress', (event) => {
    const windows = BrowserWindow.getAllWindows();
    windows.forEach((win) => {
      win.webContents.send('mod-security:scan-progress', event);
    });
  });

  scanner.on('scan-completed', (event) => {
    const windows = BrowserWindow.getAllWindows();
    windows.forEach((win) => {
      win.webContents.send('mod-security:scan-completed', event);
    });
  });

  scanner.on('file-blocked', (event) => {
    const windows = BrowserWindow.getAllWindows();
    windows.forEach((win) => {
      win.webContents.send('mod-security:file-blocked', event);
    });
  });

  return scanner;
}

/**
 * Example 2: Install mod with security check
 */
export async function installModWithSecurityCheck(
  scanner: MalwareScanner,
  modPath: string,
  installDir: string
): Promise<{ success: boolean; message: string }> {
  try {
    console.log(`[ModSecurity] Scanning mod before installation: ${modPath}`);

    // Scan the mod file/directory
    const isDirectory = (await fs.stat(modPath)).isDirectory();
    const scanResult = isDirectory
      ? await scanner.scanDirectory(modPath)
      : await scanner.scanFile(modPath);

    // Check if any files should be blocked
    const hasBlockedFiles = isDirectory
      ? scanResult.results.some((r) => r.shouldBlock)
      : (scanResult as any).shouldBlock;

    if (hasBlockedFiles) {
      const blockedCount = isDirectory
        ? scanResult.results.filter((r) => r.shouldBlock).length
        : 1;

      return {
        success: false,
        message: `Installation blocked: ${blockedCount} file(s) contain malware`,
      };
    }

    // Check for suspicious files (warn but allow)
    const suspiciousCount = isDirectory
      ? scanResult.results.filter(
          (r) => r.overallSeverity === SeverityLevel.SUSPICIOUS
        ).length
      : (scanResult as any).overallSeverity === SeverityLevel.SUSPICIOUS
        ? 1
        : 0;

    if (suspiciousCount > 0) {
      console.warn(
        `[ModSecurity] ${suspiciousCount} suspicious file(s) detected in mod`
      );
    }

    // Proceed with installation
    console.log(`[ModSecurity] Mod passed security check, proceeding with installation`);

    return {
      success: true,
      message: 'Mod passed security check',
    };
  } catch (error) {
    console.error('[ModSecurity] Security check failed:', error);
    return {
      success: false,
      message: `Security check error: ${(error as Error).message}`,
    };
  }
}

/**
 * Example 3: Preload script API exposure
 */
export function exposeModSecurityToRenderer(
  contextBridge: any,
  ipcRenderer: any
) {
  contextBridge.exposeInMainWorld('modSecurity', {
    // File scanning
    scanFile: (filePath: string) =>
      ipcRenderer.invoke('mod-security:scan-file', filePath),

    scanDirectory: (dirPath: string) =>
      ipcRenderer.invoke('mod-security:scan-directory', dirPath),

    scanBatch: (filePaths: string[]) =>
      ipcRenderer.invoke('mod-security:scan-batch', filePaths),

    // Statistics
    getCacheStats: () =>
      ipcRenderer.invoke('mod-security:cache-stats'),

    getScanStats: () =>
      ipcRenderer.invoke('mod-security:scan-stats'),

    resetStats: () =>
      ipcRenderer.invoke('mod-security:reset-stats'),

    // Cache management
    clearCache: () =>
      ipcRenderer.invoke('mod-security:clear-cache'),

    // Configuration
    getConfig: () =>
      ipcRenderer.invoke('mod-security:get-config'),

    updateConfig: (config: any) =>
      ipcRenderer.invoke('mod-security:update-config', config),

    setVirusTotalKey: (key: string) =>
      ipcRenderer.invoke('mod-security:set-vt-key', key),

    // Event listeners
    onScanStarted: (callback: (event: any) => void) =>
      ipcRenderer.on('mod-security:scan-started', (event: any, data: any) =>
        callback(data)
      ),

    onScanProgress: (callback: (event: any) => void) =>
      ipcRenderer.on('mod-security:scan-progress', (event: any, data: any) =>
        callback(data)
      ),

    onScanCompleted: (callback: (event: any) => void) =>
      ipcRenderer.on('mod-security:scan-completed', (event: any, data: any) =>
        callback(data)
      ),

    onFileBlocked: (callback: (event: any) => void) =>
      ipcRenderer.on('mod-security:file-blocked', (event: any, data: any) =>
        callback(data)
      ),

    onBatchProgress: (callback: (event: any) => void) =>
      ipcRenderer.on('mod-security:batch-progress', (event: any, data: any) =>
        callback(data)
      ),

    // Utility
    removeScanStartedListener: () =>
      ipcRenderer.removeAllListeners('mod-security:scan-started'),

    removeScanProgressListener: () =>
      ipcRenderer.removeAllListeners('mod-security:scan-progress'),

    removeScanCompletedListener: () =>
      ipcRenderer.removeAllListeners('mod-security:scan-completed'),

    removeFileBlockedListener: () =>
      ipcRenderer.removeAllListeners('mod-security:file-blocked'),

    removeBatchProgressListener: () =>
      ipcRenderer.removeAllListeners('mod-security:batch-progress'),
  });
}

/**
 * Example 4: React hook for mod security
 */
export function useModSecurity() {
  const [isScanning, setIsScanning] = React.useState(false);
  const [scanResult, setScanResult] = React.useState(null);
  const [progress, setProgress] = React.useState(0);
  const [error, setError] = React.useState<string | null>(null);

  const scanFile = React.useCallback(async (filePath: string) => {
    setIsScanning(true);
    setError(null);

    try {
      const result = await window.modSecurity.scanFile(filePath);
      setScanResult(result);
      return result;
    } catch (err) {
      const errorMsg = (err as Error).message;
      setError(errorMsg);
      throw err;
    } finally {
      setIsScanning(false);
    }
  }, []);

  const scanDirectory = React.useCallback(async (dirPath: string) => {
    setIsScanning(true);
    setError(null);

    try {
      const result = await window.modSecurity.scanDirectory(dirPath);
      setScanResult(result);
      return result;
    } catch (err) {
      const errorMsg = (err as Error).message;
      setError(errorMsg);
      throw err;
    } finally {
      setIsScanning(false);
    }
  }, []);

  const scanBatch = React.useCallback(async (filePaths: string[]) => {
    setIsScanning(true);
    setError(null);
    setProgress(0);

    try {
      // Subscribe to progress
      window.modSecurity.onBatchProgress((event) => {
        setProgress(event.percentage);
      });

      const result = await window.modSecurity.scanBatch(filePaths);
      setScanResult(result);
      return result;
    } catch (err) {
      const errorMsg = (err as Error).message;
      setError(errorMsg);
      throw err;
    } finally {
      setIsScanning(false);
      window.modSecurity.removeBatchProgressListener();
    }
  }, []);

  return {
    isScanning,
    scanResult,
    progress,
    error,
    scanFile,
    scanDirectory,
    scanBatch,
  };
}

/**
 * Example 5: Game Service Integration
 */
export class GameServiceWithSecurity {
  private scanner: MalwareScanner;

  constructor(scanner: MalwareScanner) {
    this.scanner = scanner;
  }

  /**
   * Install mod with security verification
   */
  async installMod(
    modPath: string,
    installDir: string
  ): Promise<{ success: boolean; message: string }> {
    // Step 1: Security check
    const securityCheck = await installModWithSecurityCheck(
      this.scanner,
      modPath,
      installDir
    );

    if (!securityCheck.success) {
      return securityCheck;
    }

    // Step 2: Proceed with installation
    try {
      const stats = await fs.stat(modPath);

      if (stats.isDirectory()) {
        await fs.copy(modPath, installDir);
      } else {
        // Handle archive extraction, etc.
        await fs.copy(modPath, path.join(installDir, path.basename(modPath)));
      }

      return {
        success: true,
        message: 'Mod installed successfully',
      };
    } catch (error) {
      return {
        success: false,
        message: `Installation failed: ${(error as Error).message}`,
      };
    }
  }

  /**
   * Verify installed mods
   */
  async verifyInstalledMods(modsDir: string) {
    console.log(`[GameService] Verifying installed mods in ${modsDir}`);

    const scanResult = await this.scanner.scanDirectory(modsDir);

    const report = {
      totalMods: scanResult.totalFiles,
      verified: scanResult.scannedFiles,
      blocked: scanResult.blockedFiles,
      suspicious: scanResult.results.filter(
        (r) => r.overallSeverity === SeverityLevel.SUSPICIOUS
      ).length,
      dangerous: scanResult.results.filter(
        (r) => r.overallSeverity === SeverityLevel.DANGEROUS
      ).length,
      results: scanResult,
    };

    return report;
  }
}

/**
 * Example 6: React Component
 */
export function ModSecurityScanner() {
  const { isScanning, scanResult, progress, error, scanFile } = useModSecurity();

  const handleFilePick = async () => {
    // This would use electron file dialog in real app
    const filePath = '/path/to/mod/file.exe';
    await scanFile(filePath);
  };

  return (
    <div className="mod-security-scanner">
      <h2>Mod Security Scanner</h2>

      <button onClick={handleFilePick} disabled={isScanning}>
        {isScanning ? 'Scanning...' : 'Scan Mod'}
      </button>

      {isScanning && (
        <div className="progress">
          <div className="progress-bar" style={{ width: `${progress}%` }}>
            {progress}%
          </div>
        </div>
      )}

      {error && <div className="alert alert-danger">{error}</div>}

      {scanResult && (
        <div className={`scan-result severity-${scanResult.overallSeverity}`}>
          <h3>Scan Result</h3>
          <p>File: {scanResult.fileName}</p>
          <p>Severity: {scanResult.overallSeverity}</p>
          <p>Status: {scanResult.shouldBlock ? 'BLOCKED' : 'ALLOWED'}</p>
          <p>{scanResult.recommendation}</p>

          {scanResult.shouldBlock && (
            <div className="alert alert-danger">
              This mod has been blocked due to security concerns
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Export scanner initialization for use in main.ts
export { setupModSecurityHandlers, installModWithSecurityCheck };
