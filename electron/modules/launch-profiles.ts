// ============================================================================
// electron/modules/launch-profiles.ts
// ----------------------------------------------------------------------------
// Launch Profiles — per-game launch configuration management.
// Supports: command-line args, environment variables, resolution, compat
// layers (Proton/Wine/DXVK/VKD3D), and pre/post launch hooks.
//
// Inspired by: Lutris runner configuration, Heroic per-game settings.
// ============================================================================

import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import { logger } from '../logger'

// ── Types ──────────────────────────────────────────────────────────────────

export interface CompatLayerConfig {
  type: 'proton' | 'wine' | 'dxvk' | 'vkd3d' | 'none'
  version?: string
  path?: string
}

export interface LaunchProfile {
  name: string
  args: string
  envVars: Record<string, string>
  resolution: { width: number; height: number; fullscreen: boolean } | null
  compatLayer: CompatLayerConfig | null
  preLaunch: string[]
  postLaunch: string[]
  isDefault: boolean
}

// ── Constants ──────────────────────────────────────────────────────────────

const PROFILES_DIR = 'profiles'
const PROFILES_FILE = 'profiles.json'
const DEFAULT_PROFILE_NAME = 'Default'

function getGameProfilesDir(gameId: string): string {
  return path.join(app.getPath('userData'), 'Library', gameId, PROFILES_DIR)
}

function getProfilesFilePath(gameId: string): string {
  return path.join(getGameProfilesDir(gameId), PROFILES_FILE)
}

// ── Helpers ────────────────────────────────────────────────────────────────

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

function readProfiles(gameId: string): LaunchProfile[] {
  const filePath = getProfilesFilePath(gameId)
  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf-8')
      return JSON.parse(raw)
    }
  } catch (err: any) {
    logger.warn(`[LaunchProfiles] Failed to read profiles for ${gameId}: ${err.message}`, 'profiles')
  }
  return []
}

function writeProfiles(gameId: string, profiles: LaunchProfile[]): void {
  const dir = getGameProfilesDir(gameId)
  ensureDir(dir)
  const filePath = getProfilesFilePath(gameId)
  // Atomic write: write to temp file, then rename
  const tmpPath = filePath + '.tmp'
  fs.writeFileSync(tmpPath, JSON.stringify(profiles, null, 2), 'utf-8')
  fs.renameSync(tmpPath, filePath)
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * List all profiles for a game.
 */
export function listProfiles(gameId: string): LaunchProfile[] {
  return readProfiles(gameId)
}

/**
 * Get the default profile for a game, or create one if none exist.
 */
export function getDefaultProfile(gameId: string): LaunchProfile {
  const profiles = readProfiles(gameId)
  const defaultProfile = profiles.find((p) => p.isDefault)
  if (defaultProfile) return defaultProfile

  // Create default profile
  const newProfile = createDefaultProfile()
  profiles.push(newProfile)
  writeProfiles(gameId, profiles)
  return newProfile
}

/**
 * Get a profile by name.
 */
export function getProfile(gameId: string, profileName: string): LaunchProfile | null {
  const profiles = readProfiles(gameId)
  return profiles.find((p) => p.name === profileName) || null
}

/**
 * Create a new profile.
 */
export function createProfile(gameId: string, profile: LaunchProfile): LaunchProfile {
  const profiles = readProfiles(gameId)

  // If this is the first profile, make it default
  if (profiles.length === 0) {
    profile.isDefault = true
  }

  // If setting as default, unset others
  if (profile.isDefault) {
    for (const p of profiles) p.isDefault = false
  }

  profiles.push(profile)
  writeProfiles(gameId, profiles)
  return profile
}

/**
 * Update an existing profile.
 */
export function updateProfile(gameId: string, profileName: string, updates: Partial<LaunchProfile>): LaunchProfile | null {
  const profiles = readProfiles(gameId)
  const index = profiles.findIndex((p) => p.name === profileName)
  if (index === -1) return null

  if (updates.isDefault) {
    for (const p of profiles) p.isDefault = false
  }

  profiles[index] = { ...profiles[index], ...updates }
  writeProfiles(gameId, profiles)
  return profiles[index]
}

/**
 * Delete a profile. Cannot delete the last profile.
 */
export function deleteProfile(gameId: string, profileName: string): boolean {
  const profiles = readProfiles(gameId)
  if (profiles.length <= 1) return false

  const index = profiles.findIndex((p) => p.name === profileName)
  if (index === -1) return false

  const wasDefault = profiles[index].isDefault
  profiles.splice(index, 1)

  // If we deleted the default, make the first one default
  if (wasDefault && profiles.length > 0) {
    profiles[0].isDefault = true
  }

  writeProfiles(gameId, profiles)
  return true
}

/**
 * Set a profile as the default.
 */
export function setDefaultProfile(gameId: string, profileName: string): boolean {
  const profiles = readProfiles(gameId)
  const profile = profiles.find((p) => p.name === profileName)
  if (!profile) return false

  for (const p of profiles) p.isDefault = false
  profile.isDefault = true
  writeProfiles(gameId, profiles)
  return true
}

/**
 * Create a default profile with sensible defaults.
 */
export function createDefaultProfile(): LaunchProfile {
  return {
    name: DEFAULT_PROFILE_NAME,
    args: '',
    envVars: {},
    resolution: null,
    compatLayer: null,
    preLaunch: [],
    postLaunch: [],
    isDefault: true,
  }
}

/**
 * Build the full command-line string from a profile, appending to base args.
 */
export function buildLaunchCommand(gamePath: string, profile: LaunchProfile): string {
  let cmd = `"${gamePath}"`
  if (profile.args) cmd += ` ${profile.args}`

  if (profile.resolution) {
    const { width, height, fullscreen } = profile.resolution
    const screenMode = fullscreen ? 'fullscreen' : 'windowed'
    cmd += ` -screen-width ${width} -screen-height ${height} -screen-mode ${screenMode}`
  }

  return cmd
}

/**
 * Build environment variables from a profile, merging with current env.
 */
export function buildLaunchEnv(profile: LaunchProfile): NodeJS.ProcessEnv {
  return { ...process.env, ...profile.envVars }
}

/**
 * Find the compat layer executable path for a given configuration.
 */
export function findCompatLayerPath(config: CompatLayerConfig): string | null {
  if (config.type === 'none' || !config.path) return null

  const expandedPath = config.path.replace(
    /%LOCALAPPDATA%/g,
    process.env.LOCALAPPDATA || '',
  )

  if (fs.existsSync(expandedPath)) return expandedPath

  // Search common locations
  const steamCompatDir = path.join(
    process.env.PROGRAMFILES?.[0] === 'C' ? 'C:\\Program Files (x86)\\Steam' : process.env.PROGRAMFILES || '',
    'Steam',
    'compatibilitytools.d',
  )

  if (config.type === 'proton') {
    if (config.version) {
      const protonPath = path.join(steamCompatDir, config.version, 'proton')
      if (fs.existsSync(protonPath)) return protonPath
    }
  }

  return null
}
