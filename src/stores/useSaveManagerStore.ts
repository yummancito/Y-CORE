import { create } from 'zustand'
import type { SaveEntry, SaveBackup } from '../domain/types'
import { saveManagerService } from '../services/save-manager.service'

interface SaveManagerStore {
  saves: SaveEntry[]
  backups: SaveBackup[]
  totalSize: number
  detecting: boolean
  backingUp: boolean
  restoring: boolean
  error: string | null
  successMessage: string | null
  filter: string
  /** appId of the most recently STARTED detectSaves()/listBackups() call —
   * used to drop a response that resolves after a newer call for a
   * different game (e.g. the user navigated to another game's detail page). */
  _lastRequestedAppId: string | null

  detectSaves: (appId: string, gameName: string, installDir?: string) => Promise<void>
  listBackups: (appId: string) => Promise<void>
  createBackup: (appId: string, name?: string) => Promise<void>
  restoreBackup: (backup: SaveBackup) => Promise<void>
  deleteBackup: (backup: SaveBackup) => Promise<void>
  setFilter: (f: string) => void
  clearMessages: () => void
}

export const useSaveManagerStore = create<SaveManagerStore>((set, get) => ({
  saves: [],
  backups: [],
  totalSize: 0,
  detecting: false,
  backingUp: false,
  restoring: false,
  error: null,
  successMessage: null,
  filter: '',
  _lastRequestedAppId: null,

  detectSaves: async (appId, gameName, installDir) => {
    set({ detecting: true, error: null, _lastRequestedAppId: appId })
    try {
      const result = await saveManagerService.detectSavesWithFallback(appId, gameName, installDir)
      if (get()._lastRequestedAppId !== appId) return
      set({
        saves: result.saves as SaveEntry[],
        totalSize: result.totalSize,
        detecting: false,
      })
    } catch (err: any) {
      if (get()._lastRequestedAppId !== appId) return
      set({ error: err?.message || 'Failed to detect saves', detecting: false })
    }
  },

  listBackups: async (appId) => {
    set({ _lastRequestedAppId: appId })
    try {
      const backups = await saveManagerService.listBackups(appId)
      if (get()._lastRequestedAppId !== appId) return
      set({ backups: backups as SaveBackup[] })
    } catch {
      // Silently fail for initial load
    }
  },

  createBackup: async (appId, name) => {
    const { saves } = get()
    if (saves.length === 0) {
      set({ error: 'No saves to backup' })
      return
    }
    set({ backingUp: true, error: null })
    try {
      const backup = await saveManagerService.createBackup(appId, saves as any[], name)
      set((s) => ({
        backups: [backup as SaveBackup, ...s.backups],
        backingUp: false,
        successMessage: `Backup created: ${saves.length} files`,
      }))
    } catch (err: any) {
      set({ error: err?.message || 'Backup failed', backingUp: false })
    }
  },

  restoreBackup: async (backup) => {
    set({ restoring: true, error: null })
    try {
      const result = await saveManagerService.restoreBackup(backup as any)
      set({
        restoring: false,
        successMessage: `Restored ${result.restored} files`,
      })
    } catch (err: any) {
      set({ error: err?.message || 'Restore failed', restoring: false })
    }
  },

  deleteBackup: async (backup) => {
    try {
      const deleted = await saveManagerService.deleteBackup(backup as any)
      if (deleted) {
        set((s) => ({ backups: s.backups.filter((b) => b.id !== backup.id) }))
      }
    } catch {
      set({ error: 'Failed to delete backup' })
    }
  },

  setFilter: (f) => set({ filter: f }),
  clearMessages: () => set({ error: null, successMessage: null }),
}))
