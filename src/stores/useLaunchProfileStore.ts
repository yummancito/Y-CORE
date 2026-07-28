import { create } from 'zustand'
import type { LaunchProfile, CompatLayerConfig } from '../domain/types'
import { launchProfileService } from '../services/launch-profile.service'

interface LaunchProfileStore {
  profiles: LaunchProfile[]
  selectedProfile: string | null
  editing: boolean
  error: string | null
  /** gameId of the most recently STARTED loadProfiles() call — used to drop
   * a response that resolves after a newer call for a different game. */
  _lastRequestedGameId: string | null

  loadProfiles: (gameId: string) => Promise<void>
  selectProfile: (name: string | null) => void
  createProfile: (gameId: string, profile: LaunchProfile) => Promise<void>
  updateProfile: (gameId: string, profileName: string, updates: Partial<LaunchProfile>) => Promise<void>
  deleteProfile: (gameId: string, profileName: string) => Promise<void>
  setDefault: (gameId: string, profileName: string) => Promise<void>
  clearError: () => void
}

export const useLaunchProfileStore = create<LaunchProfileStore>((set, get) => ({
  profiles: [],
  selectedProfile: null,
  editing: false,
  error: null,
  _lastRequestedGameId: null,

  loadProfiles: async (gameId: string) => {
    set({ _lastRequestedGameId: gameId })
    try {
      const profiles = await launchProfileService.listProfiles(gameId)
      if (get()._lastRequestedGameId !== gameId) return // superseded by a newer call
      set({
        profiles: profiles as LaunchProfile[],
        selectedProfile: (profiles as LaunchProfile[]).find((p) => p.isDefault)?.name || null,
        error: null,
      })
    } catch (err: any) {
      if (get()._lastRequestedGameId !== gameId) return
      set({ error: err?.message || 'Failed to load profiles' })
    }
  },

  selectProfile: (name) => set({ selectedProfile: name }),

  createProfile: async (gameId, profile) => {
    try {
      const created = await launchProfileService.createProfile(gameId, profile)
      set((s) => ({
        profiles: [...s.profiles, created as LaunchProfile],
        selectedProfile: created.name,
        error: null,
      }))
    } catch (err: any) {
      set({ error: err?.message || 'Failed to create profile' })
    }
  },

  updateProfile: async (gameId, profileName, updates) => {
    try {
      const updated = await launchProfileService.updateProfile(gameId, profileName, updates)
      if (updated) {
        set((s) => ({
          profiles: s.profiles.map((p) => (p.name === profileName ? { ...p, ...updates } : p)),
          error: null,
        }))
      }
    } catch (err: any) {
      set({ error: err?.message || 'Failed to update profile' })
    }
  },

  deleteProfile: async (gameId, profileName) => {
    try {
      const deleted = await launchProfileService.deleteProfile(gameId, profileName)
      if (deleted) {
        set((s) => ({
          profiles: s.profiles.filter((p) => p.name !== profileName),
          selectedProfile:
            s.selectedProfile === profileName
              ? s.profiles.find((p) => p.name !== profileName)?.name || null
              : s.selectedProfile,
          error: null,
        }))
      }
    } catch (err: any) {
      set({ error: err?.message || 'Failed to delete profile' })
    }
  },

  setDefault: async (gameId, profileName) => {
    try {
      await launchProfileService.setDefaultProfile(gameId, profileName)
      set((s) => ({
        profiles: s.profiles.map((p) => ({ ...p, isDefault: p.name === profileName })),
        selectedProfile: profileName,
        error: null,
      }))
    } catch (err: any) {
      set({ error: err?.message || 'Failed to set default profile' })
    }
  },

  clearError: () => set({ error: null }),
}))
