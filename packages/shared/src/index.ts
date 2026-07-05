// ============================================
// Auth types
// ============================================

export interface AuthUser {
  id: string
  email: string
  username: string
  is_beta_tester?: boolean
}

export interface AuthSession {
  access_token: string
  refresh_token: string
  user: AuthUser
}

export interface RegisterRequest {
  email: string
  password: string
  username: string
}

export interface LoginRequest {
  email: string
  password: string
}

export interface RefreshRequest {
  refresh_token: string
}

// ============================================
// Game types
// ============================================

export type GameSource = 'y-core' | 'depotbox'

export type GameSort = 'name' | 'downloads' | 'rating' | 'recent'

export interface GameSummary {
  id: string
  app_id: string
  name: string
  description: string | null
  header_image_url: string | null
  library_image_url: string | null
  developer: string | null
  publisher: string | null
  release_date: string | null
  nsfw: boolean
  is_tool: boolean
  is_available: boolean
  download_count: number
  play_count: number
  rating_avg: number
  rating_count: number
  source: GameSource
  category: string | null
  is_dlc?: boolean
}

export interface GameDetail extends GameSummary {
  uploaded_at: string
  created_at: string
  updated_at: string
}

export interface GameListResponse {
  games: GameSummary[]
  total: number
}

export interface GameListQuery {
  search?: string
  category?: string
  sort?: GameSort
  limit?: number
  offset?: number
}

// ============================================
// Manifest types
// ============================================

export interface ManifestFile {
  depot_id: string
  manifest_gid: string
  file_name: string
  file_size: number
}

export interface DepotKey {
  depot_id: string
  decryption_key: string
}

// ============================================
// Install types
// ============================================

export interface InstallResponse {
  status: 'ready' | 'queued'
  game?: InstallGameData
  job_id?: string
}

export interface InstallGameData {
  app_id: string
  name: string
  lua_path: string
  lua_content: string
  manifest_files: ManifestFile[]
  depot_keys: DepotKey[]
}

// ============================================
// Job types
// ============================================

export type JobStatus = 'queued' | 'processing' | 'completed' | 'failed'

export interface JobResponse {
  id: string
  app_id: string
  status: JobStatus
  attempts: number
  error_message: string | null
  result: InstallGameData | null
  created_at: string
  updated_at: string
}

// ============================================
// API error types
// ============================================

export interface ApiError {
  error: string
  code?: string
  details?: unknown
}

// ============================================
// Worker job payload
// ============================================

export interface ImportJobPayload {
  job_id: string
  app_id: string
  user_id: string
}

// ============================================
// Lua parser (shared between Electron and API)
// ============================================

export {
  parseLuaScript,
  findMainLua,
  type ParsedLuaScript,
  type ParsedLuaAppId,
  type ParsedLuaManifest,
  type ExtractedFile,
} from './lua-parser'
