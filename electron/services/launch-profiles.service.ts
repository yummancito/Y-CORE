import { app } from 'electron'
import {
  listProfiles, getDefaultProfile, getProfile, createProfile,
  updateProfile, deleteProfile, setDefaultProfile, createDefaultProfile,
  buildLaunchCommand, buildLaunchEnv, findCompatLayerPath,
} from '../modules/launch-profiles'
import type { LaunchProfile, CompatLayerConfig } from '../modules/launch-profiles'

export const launchProfilesService = {
  async listProfiles(gameId: string) {
    return listProfiles(gameId)
  },
  async getDefaultProfile(gameId: string) {
    return getDefaultProfile(gameId)
  },
  async getProfile(gameId: string, profileName: string) {
    return getProfile(gameId, profileName)
  },
  async createProfile(gameId: string, profile: LaunchProfile) {
    return createProfile(gameId, profile)
  },
  async updateProfile(gameId: string, profileName: string, updates: any) {
    return updateProfile(gameId, profileName, updates)
  },
  async deleteProfile(gameId: string, profileName: string) {
    return deleteProfile(gameId, profileName)
  },
  async setDefaultProfile(gameId: string, profileName: string) {
    return setDefaultProfile(gameId, profileName)
  },
  async createDefaultProfile() {
    return createDefaultProfile()
  },
  async buildLaunchCommand(gamePath: string, profile: LaunchProfile) {
    return buildLaunchCommand(gamePath, profile)
  },
  async findCompatLayerPath(config: CompatLayerConfig) {
    return findCompatLayerPath(config)
  },
}
