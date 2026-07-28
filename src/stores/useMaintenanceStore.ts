// ============================================================================
// src/stores/useMaintenanceStore.ts
// ----------------------------------------------------------------------------
// Zustand store for the Maintenance Center.
// Coordinates between frontend components and the MaintenanceService.
// ============================================================================

import { create } from 'zustand'
import { maintenanceService } from '../services/maintenance.service'
import type {
  FullHealthReport,
  RuntimeHealthReport,
  SaveHealthReport,
  LibraryScanReport,
  FullDiagnostics,
} from '../../electron/common/ipc-contract'

interface MaintenanceState {
  // Health Check
  fullReport: FullHealthReport | null
  runtimeReport: RuntimeHealthReport | null
  saveReport: SaveHealthReport | null
  libraryReport: LibraryScanReport | null
  diagnostics: FullDiagnostics | null

  // UI State
  checkingHealth: boolean
  scanning: boolean
  clearingCache: boolean
  diagnosticsLoading: boolean
  error: string | null
  successMessage: string | null
  lastRunTimestamp: number | null

  // Active tab
  activeTab: 'overview' | 'runtime' | 'saves' | 'library' | 'cache' | 'diagnostics'

  // Actions
  setActiveTab: (tab: MaintenanceState['activeTab']) => void
  runFullHealthCheck: () => Promise<void>
  checkRuntimeHealth: () => Promise<void>
  checkSaveHealth: () => Promise<void>
  runLibraryScan: () => Promise<void>
  clearAllCaches: () => Promise<void>
  loadDiagnostics: () => Promise<void>
  clearMessages: () => void
}

export const useMaintenanceStore = create<MaintenanceState>((set, get) => ({
  fullReport: null,
  runtimeReport: null,
  saveReport: null,
  libraryReport: null,
  diagnostics: null,

  checkingHealth: false,
  scanning: false,
  clearingCache: false,
  diagnosticsLoading: false,
  error: null,
  successMessage: null,
  lastRunTimestamp: null,

  activeTab: 'overview',

  setActiveTab: (tab) => set({ activeTab: tab }),

  runFullHealthCheck: async () => {
    set({ checkingHealth: true, error: null, successMessage: null })
    try {
      const report = await maintenanceService.runFullHealthCheck()
      set({
        fullReport: report,
        runtimeReport: report.runtime,
        saveReport: report.saves,
        libraryReport: report.library,
        checkingHealth: false,
        lastRunTimestamp: Date.now(),
        successMessage: report.healthy
          ? 'All systems healthy'
          : `${report.overallIssues} issue(s) found`,
      })
    } catch (err: any) {
      set({
        checkingHealth: false,
        error: err?.message || 'Health check failed',
      })
    }
  },

  checkRuntimeHealth: async () => {
    set({ checkingHealth: true, error: null, successMessage: null })
    try {
      const report = await maintenanceService.checkRuntimeHealth()
      set({ runtimeReport: report, checkingHealth: false, lastRunTimestamp: Date.now() })
    } catch (err: any) {
      set({ checkingHealth: false, error: err?.message || 'Runtime check failed' })
    }
  },

  checkSaveHealth: async () => {
    set({ checkingHealth: true, error: null, successMessage: null })
    try {
      const report = await maintenanceService.checkSaveHealth()
      set({ saveReport: report, checkingHealth: false, lastRunTimestamp: Date.now() })
    } catch (err: any) {
      set({ checkingHealth: false, error: err?.message || 'Save health check failed' })
    }
  },

  runLibraryScan: async () => {
    set({ scanning: true, error: null, successMessage: null })
    try {
      const report = await maintenanceService.runLibraryScan()
      set({ libraryReport: report, scanning: false, lastRunTimestamp: Date.now() })
    } catch (err: any) {
      set({ scanning: false, error: err?.message || 'Library scan failed' })
    }
  },

  clearAllCaches: async () => {
    set({ clearingCache: true, error: null, successMessage: null })
    try {
      const result = await maintenanceService.clearAllCaches()
      if (result.success) {
        set({
          clearingCache: false,
          successMessage: result.bytesFreed
            ? `Cache cleared (${(result.bytesFreed / 1024 / 1024).toFixed(1)} MB freed)`
            : 'Cache cleared successfully',
        })
      } else {
        set({ clearingCache: false, error: result.error || 'Failed to clear caches' })
      }
    } catch (err: any) {
      set({ clearingCache: false, error: err?.message || 'Failed to clear caches' })
    }
  },

  loadDiagnostics: async () => {
    set({ diagnosticsLoading: true, error: null })
    try {
      const diagnostics = await maintenanceService.getMaintenanceDiagnostics()
      set({ diagnostics, diagnosticsLoading: false })
    } catch (err: any) {
      set({ diagnosticsLoading: false, error: err?.message || 'Failed to load diagnostics' })
    }
  },

  clearMessages: () => set({ error: null, successMessage: null }),
}))
