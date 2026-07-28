import { create } from 'zustand'
import type { SteamState, SteamResult } from '../domain/types'

interface SteamStore extends SteamState {
  loading: boolean
  loadSteamPath: () => Promise<void>
  loadSteamRunning: () => Promise<void>
  loadLibraryFolders: () => Promise<void>
  restartSteam: () => Promise<SteamResult>
  verifySteam: () => Promise<SteamResult>
  init: () => Promise<void>
}

export const useSteamStore = create<SteamStore>((set, get) => ({
  path: null,
  running: false,
  libraryFolders: [],
  loading: false,

  loadSteamPath: async () => {
    const result = await window.steamtools.getSteamPath()
    if (result.success) {
      set({ path: result.path || null })
    }
  },

  loadSteamRunning: async () => {
    const result = await window.steamtools.isSteamRunning()
    set({ running: result.running })
  },

  loadLibraryFolders: async () => {
    const result = await window.steamtools.getLibraryFolders()
    if (result.success) {
      set({ libraryFolders: result.folders })
    }
  },

  restartSteam: async () => {
    return await window.steamtools.restartSteam()
  },

  verifySteam: async () => {
    return await window.steamtools.verifySteam()
  },

  init: async () => {
    set({ loading: true })
    try {
      const [pathResult, runningResult, foldersResult] = await Promise.allSettled([
        window.steamtools?.getSteamPath()?.catch(() => ({ success: false })) ?? Promise.resolve({ success: false }),
        window.steamtools?.isSteamRunning()?.catch(() => ({ running: false })) ?? Promise.resolve({ running: false }),
        window.steamtools?.getLibraryFolders()?.catch(() => ({ success: false, folders: [] })) ?? Promise.resolve({ success: false, folders: [] }),
      ])

      if (pathResult.status === 'fulfilled' && pathResult.value.success) {
        const val = pathResult.value as { path?: string | null }
        set({ path: val.path || null })
      }
      if (runningResult.status === 'fulfilled') {
        set({ running: runningResult.value.running })
      }
      if (foldersResult.status === 'fulfilled' && foldersResult.value.success) {
        set({ libraryFolders: foldersResult.value.folders })
      }
    } catch {
      // Si todo falla, el estado por defecto (null/false/[]) es aceptable
    } finally {
      set({ loading: false })
    }
  },
}))
