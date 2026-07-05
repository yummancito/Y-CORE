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
    await Promise.all([
      get().loadSteamPath(),
      get().loadSteamRunning(),
      get().loadLibraryFolders(),
    ])
    set({ loading: false })
  },
}))
