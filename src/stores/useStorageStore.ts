// ============================================================================
// src/stores/useStorageStore.ts
// ----------------------------------------------------------------------------
// Storage Center Zustand store — manages library scanning, disk space,
// game relocation, and cleanup operations.
// ============================================================================

import { create } from 'zustand'
import { storageService } from '../services/storage.service'

// Module-level (not store state) monotonic counter guarding scan() against
// out-of-order resolution when called again before a previous scan settles
// (e.g. the user clicks "Rescan" twice) — the older response would otherwise
// overwrite the newer one.
let scanRequestSeq = 0

export interface LibraryEntry {
  path: string
  name: string
  totalBytes: number
  freeBytes: number
  usedByGames: number
  gameCount: number
  fsType: string
  isDefault: boolean
}

export interface DiskSpaceInfo {
  success: boolean
  path: string
  totalBytes: number
  freeBytes: number
  usedBytes: number
  freeFormatted: string
  totalFormatted: string
  usedPercent: number
  enoughFor: string[]
  error?: string
}

export interface MoveGameProgress {
  appId: string
  sourceDir: string
  targetLibPath: string
  percent: number
  phase: string
}

interface StorageState {
  libraries: LibraryEntry[]
  diskSpace: DiskSpaceInfo | null
  diagnostics: {
    libraryCount: number
    defaultLibrary: string
    totalGames: number
    totalSizeFormatted: string
    freeSizeFormatted: string
    diskHealth: 'healthy' | 'warning' | 'critical'
    warnings: string[]
  } | null
  largestGames: { appId: string; name: string; sizeOnDisk: number }[]
  moveProgress: MoveGameProgress | null
  loading: boolean
  error: string | null

  scan: (opts?: {
    extraPaths?: string[]
    games?: { appId: string; name: string; installDir: string; sizeOnDisk: number }[]
  }) => Promise<void>
  checkSpace: (targetPath?: string) => Promise<void>
  moveGame: (appId: string, sourceDir: string, targetLibPath: string) => Promise<boolean>
  cleanup: (libraryPaths: string[]) => Promise<{ bytesFreed: number; itemsRemoved: string[] }>
  loadDiagnostics: (games?: { installDir: string; sizeOnDisk: number }[]) => Promise<void>
  resetMoveProgress: () => void
  clearError: () => void
}

export const useStorageStore = create<StorageState>((set, get) => ({
  libraries: [],
  diskSpace: null,
  diagnostics: null,
  largestGames: [],
  moveProgress: null,
  loading: false,
  error: null,

  scan: async (opts) => {
    const requestId = ++scanRequestSeq
    set({ loading: true, error: null })
    try {
      const result: any = await storageService.scanLibraries(opts)
      if (requestId !== scanRequestSeq) return // a newer scan already resolved/is in flight
      if (result) {
        set({
          libraries: result.libraries ?? [],
          largestGames: result.largestGames ?? [],
          loading: false,
        })
      } else {
        set({ loading: false, error: 'Storage service unavailable' })
      }
    } catch (err: any) {
      if (requestId !== scanRequestSeq) return
      set({ loading: false, error: err.message ?? 'Scan failed' })
    }
  },

  checkSpace: async (targetPath) => {
    set({ error: null })
    try {
      const result: any = await storageService.checkDiskSpace(targetPath)
      if (result) {
        set({ diskSpace: result })
      }
    } catch (err: any) {
      set({ error: err.message ?? 'Disk space check failed' })
    }
  },

  moveGame: async (appId, sourceDir, targetLibPath) => {
    set({ moveProgress: { appId, sourceDir, targetLibPath, percent: 0, phase: 'Starting...' }, error: null })
    try {
      const result: any = await storageService.moveGame(appId, sourceDir, targetLibPath)
      if (result?.success) {
        set({ moveProgress: null })
        return true
      } else {
        set({ moveProgress: null, error: result?.error ?? 'Move failed' })
        return false
      }
    } catch (err: any) {
      set({ moveProgress: null, error: err.message ?? 'Move failed' })
      return false
    }
  },

  cleanup: async (libraryPaths) => {
    set({ loading: true, error: null })
    try {
      const result: any = await storageService.cleanGameFolders(libraryPaths)
      set({ loading: false })
      if (result) {
        return { bytesFreed: result.bytesFreed ?? 0, itemsRemoved: result.itemsRemoved ?? [] }
      }
      return { bytesFreed: 0, itemsRemoved: [] }
    } catch (err: any) {
      set({ loading: false, error: err.message ?? 'Cleanup failed' })
      return { bytesFreed: 0, itemsRemoved: [] }
    }
  },

  loadDiagnostics: async (games) => {
    try {
      const result: any = await storageService.getStorageDiagnostics(games)
      if (result) {
        set({ diagnostics: result })
      }
    } catch { /* silent */ }
  },

  resetMoveProgress: () => set({ moveProgress: null }),
  clearError: () => set({ error: null }),
}))
