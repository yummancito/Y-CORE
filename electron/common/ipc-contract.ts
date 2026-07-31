// ============================================================================
// electron/common/ipc-contract.ts
// ----------------------------------------------------------------------------
// Shared type contract between renderer and main process.
// Serves as the single source of truth for IPC service definitions.
// Both sides import from this file to ensure type safety at compile time.
// Inspired by Heroic Games Launcher's common/ipc.ts pattern.
// ============================================================================

import type {
  InstalledGame,
  LogEntry,
  LogConfig,
} from '../../src/domain/types'
import type {
  ModInfo,
  ModSearchQuery,
  ModSearchResult,
  ModInstallOptions,
  ModInstallResult,
  ModUninstallOptions,
  ModUninstallResult,
  ModToggleResult,
  ModScanResult,
  BackupInfo,
  ModStatistics,
  ModQueryResult,
  CacheStats,
} from './mod-types'

// ── Config Service ─────────────────────────────────────────────────────────

export interface ConfigServiceContract {
  read(): Promise<Record<string, unknown> | null>
  write(data: object): Promise<{ success: boolean; error?: string }>
  appReady(): Promise<void>
}

// ── Auth Service ──────────────────────────────────────────────────────────

export interface AuthServiceContract {
  setUsername(username: string | null): Promise<void>
  getUsername(): Promise<string | null>
  isAuthenticated(): Promise<boolean>
  loginSuccess(): Promise<void>
  logout(): Promise<void>
}

// ── Game Service ───────────────────────────────────────────────────────────

export interface SteamAppDetails {
  name?: string
  short_description?: string
  about_the_game?: string
  developers?: string[]
  publishers?: string[]
  genres?: { id: string; description: string }[]
  release_date?: { coming_soon: boolean; date: string }
  header_image?: string
  screenshots?: { id: number; path_thumbnail: string; path_full: string }[]
}

export interface GameServiceContract {
  listInstalled(): Promise<{ success: boolean; games: InstalledGame[]; error?: string }>
  resolveOrphanNames(games: { appId: string; installDir: string }[]): Promise<{ resolved: { appId: string; newName: string }[] }>
  launchGame(appId: string): Promise<{ success: boolean; error?: string }>
  uninstallGame(appId: string): Promise<{ success: boolean; error?: string }>
  deleteGame(appId: string, installDir: string): Promise<{ success: boolean; error?: string }>
  openGameLocation(appId: string, installDir: string): Promise<void>
  verifyGame(appId: string): Promise<{ success: boolean; error?: string }>
  getStoreImage(appId: string, steamGridDbApiKey?: string): Promise<string | null>
  searchGames(query: string): Promise<{ appId: string; name: string }[]>
  isFreeToPlay(appId: string): Promise<boolean>
  getSteamPath(): Promise<string | null>
  openSteamFolderDialog(): Promise<string | null>
  getLibraryFolders(): Promise<string[]>
  getSteamDetails(appId: string): Promise<SteamAppDetails | null>
}

// ── Store Service ──────────────────────────────────────────────────────────

export interface StoreServiceContract {
  installGame(game: {
    app_id: string
    name: string
    lua_content: string
    manifest_files: { depot_id: string; manifest_id: string }[]
    depot_keys: { depot_id: string; key: string }[]
  }): Promise<{ success: boolean; error?: string; actions?: string[] }>
  getLocalGameData(appId: string): Promise<{ success: boolean; data?: any; error?: string }>
  getLocalAppIds(): Promise<string[]>
  fetchAppDetails(appId: string, cc?: string, lang?: string): Promise<any>
  checkAppTypes(appIds: string[]): Promise<Record<string, string>>
  downloadDepot(options: {
    appId: number
    depotId: number
    manifestId: string | number
    installDir: string
    cellId?: number
  }): Promise<any>
}

// ── Download Service ───────────────────────────────────────────────────────

export interface DownloadServiceContract {
  createTask(opts: any): Promise<{ success: boolean; task?: any; error?: string }>
  startTask(taskId: string): Promise<{ success: boolean; error?: string }>
  pauseTask(taskId: string): Promise<{ success: boolean; error?: string }>
  cancelTask(taskId: string): Promise<{ success: boolean; error?: string }>
  getTasks(): Promise<{ success: boolean; tasks: any[]; queue: any[]; error?: string }>
  getHistory(): Promise<{ success: boolean; history: any[]; error?: string }>
  getStatus(): Promise<{ success: boolean; status?: any; error?: string }>
  setPriority(taskId: string, priority: number): Promise<{ success: boolean; error?: string }>
  reorderTask(taskId: string, newIndex: number): Promise<{ success: boolean; error?: string }>
  setPaused(paused: boolean): Promise<{ success: boolean }>
  clearCompleted(): Promise<{ success: boolean }>
  clearHistory(): Promise<{ success: boolean }>
  startFromApi(opts: any): Promise<{ success: boolean; tasks: any[]; error?: string }>

  // ── Repair / Integrity / Cache (Fase 3) ──
  integrityCheck(appId: string, installDir: string): Promise<{ success: boolean; result?: any; error?: string }>
  repairFiles(appId: string, installDir: string, corruptedPaths: string[], missingPaths: string[]): Promise<{ success: boolean; result?: any; error?: string }>
  diskPreallocate(filePath: string, size: number): Promise<{ success: boolean; error?: string }>
  checkDiskSpace(dirPath: string, requiredBytes: number): Promise<{ success: boolean; available?: number; message?: string; error?: string }>
  getCacheStats(): Promise<{ success: boolean; stats?: any; error?: string }>
  clearCache(): Promise<{ success: boolean; error?: string }>
}

// ── Log Service ────────────────────────────────────────────────────────────

export interface LogServiceContract {
  getEntries(filter?: { level?: string; search?: string; limit?: number; source?: string }): Promise<LogEntry[]>
  add(entry: { level?: string; message: string }): Promise<{ success: boolean }>
  clear(): Promise<{ success: boolean }>
  export(): Promise<{ success: boolean; error?: string; path?: string }>
  getConfig(): Promise<LogConfig>
  setConfig(partial: Partial<LogConfig>): Promise<{ success: boolean }>
}

// ── Steam Service ──────────────────────────────────────────────────────────

export interface SteamServiceContract {
  isRunning(): Promise<boolean>
  restartSteam(): Promise<{ success: boolean; error?: string }>
  verifySteam(): Promise<{ success: boolean; error?: string }>
  checkVerification(): Promise<{ verified: boolean; error?: string }>
  closeSteam(): Promise<{ success: boolean; error?: string }>
  importManifest(options: { manifestPath: string }): Promise<any>
  listManifestFiles(): Promise<any[]>
  deleteManifestFile(fileName: string): Promise<{ success: boolean }>
  listLuaScripts(): Promise<any[]>
  parseLuaScript(options: { luaPath: string }): Promise<any>
  importLuaScript(options: { luaPath: string }): Promise<any>
  deleteLuaScript(fileName: string): Promise<{ success: boolean }>
  importGameFolder(options: { folderPath: string }): Promise<any>
  retrySignatureCheck(): Promise<{ success: boolean; error?: string }>
}

// ── Update Service ─────────────────────────────────────────────────────────

export interface UpdateServiceContract {
  installUpdate(): Promise<void>
  getNativeDiagnostics(): Promise<any>
  manualDownloadUpdate(url: string): Promise<{ path: string }>
  runManualInstaller(installerPath: string): Promise<void>
}

// ── OnlineFix Service ──────────────────────────────────────────────────────

export interface OnlineFixServiceContract {
  enable(appId: string): Promise<{ success: boolean; error?: string }>
  disable(appId: string): Promise<{ success: boolean; error?: string }>
  status(appId: string): Promise<{ enabled: boolean; launchOptions: string }>
  generate(appId: string): Promise<{ success: boolean; error?: string }>
  remove(appId: string): Promise<{ success: boolean; error?: string }>
  detect(appId: string): Promise<{ detected: boolean; error?: string }>
}

// ── Network Config (for Online Fix P2P) ────────────────────────────────────

export interface NetworkConfig {
  p2pEnabled: boolean
  relayServerUrl: string
  localLanOnly: boolean
  connectionTimeout: number
  maxRetries: number
  connectionPoolSize: number
}

export interface LaunchContext {
  appId: string
  gameName: string
  gameDir: string
  onlineFixEnabled: boolean
  p2pConfig: NetworkConfig
  startTime: number
  dllsPatchedAt: number | null
}

export interface ExitMetrics {
  appId: string
  processId: number | null
  duration: number
  p2pConnectionsEstablished: number
  p2pConnectionsFailed: number
  bytesTransferred: number
  disconnectReason: string | null
  crashDetected: boolean
}

// ── Game Launch Integration Service ────────────────────────────────────────

export interface GameLaunchIntegrationServiceContract {
  'game:prepare-launch': (appId: string, gameName: string) => Promise<{
    success: boolean
    error?: string
    context?: LaunchContext
    warnings: string[]
  }>
  'game:on-exit': (data: { appId: string; processId: number | null; exitCode: number | null; crashed: boolean }) => Promise<{
    success: boolean
    error?: string
    metrics?: ExitMetrics
  }>
  'game:get-launch-context': (appId: string) => Promise<{
    success: boolean
    error?: string
    context?: LaunchContext
  }>
  'game:check-online-fix': (appId: string) => Promise<{
    success: boolean
    error?: string
    detected: boolean
    dllsValid: boolean
    missingDlls: string[]
  }>
  'game:get-exit-metrics': (appId: string) => Promise<{
    success: boolean
    error?: string
    metrics?: ExitMetrics
  }>
}

// ── Connection Error & Recovery ────────────────────────────────────────────

export interface ConnectionError {
  appId: string
  timestamp: number
  type: 'p2p_connect' | 'relay_connect' | 'handshake' | 'peer_discovery' | 'unknown'
  message: string
  retriable: boolean
  attemptCount: number
}

export interface RecoveryState {
  appId: string
  connected: boolean
  connectionMode: 'p2p' | 'relay' | 'lan' | 'offline' | 'disabled'
  lastError: ConnectionError | null
  attemptCount: number
  failureCount: number
  lastSuccessfulConnection: number | null
  degradationLevel: 'healthy' | 'degraded' | 'critical' | 'disabled'
}

export interface RecoveryConfig {
  autoRetryEnabled: boolean
  maxRetries: number
  initialRetryDelay: number
  maxRetryDelay: number
  exponentialBackoffFactor: number
  degradationThreshold: number
  autoDisableThreshold: number
  notifyOnDegradation: boolean
  lanFallbackEnabled: boolean
}

// ── Online Recovery Service ────────────────────────────────────────────────

export interface OnlineRecoveryServiceContract {
  'recovery:report-error': (appId: string, errorMessage: string) => Promise<{
    success: boolean
    error?: string
    action?: any
  }>
  'recovery:report-success': (appId: string, connectionMode: string) => Promise<{
    success: boolean
    error?: string
  }>
  'recovery:get-state': (appId: string) => Promise<{
    success: boolean
    error?: string
    state?: RecoveryState
  }>
  'recovery:get-error-history': (appId: string) => Promise<{
    success: boolean
    error?: string
    errors?: ConnectionError[]
  }>
  'recovery:enable-lan-mode': (appId: string) => Promise<{
    success: boolean
    error?: string
  }>
  'recovery:disable-online-fix': (appId: string, reason: string) => Promise<{
    success: boolean
    error?: string
  }>
  'recovery:reset-state': (appId: string) => Promise<{
    success: boolean
    error?: string
  }>
  'recovery:get-config': () => Promise<{
    success: boolean
    error?: string
    config?: RecoveryConfig
  }>
  'recovery:update-config': (partial: Partial<RecoveryConfig>) => Promise<{
    success: boolean
    error?: string
    config?: RecoveryConfig
  }>
}

// ── DRM Service ────────────────────────────────────────────────────────────

export interface DrmServiceContract {
  remove(appId: string): Promise<{ success: boolean; message: string; hadDrm: boolean }>
  status(appId: string): Promise<{ status: string; exePath?: string; message: string }>
}

// ── SteamCMD Service ────────────────────────────────────────────────────────

export interface SteamCmdServiceContract {
  start(opts: any): Promise<{ success: boolean; error?: string }>
  cancel(appId: string): Promise<{ success: boolean; error?: string }>
  isAvailable(): Promise<boolean>
  fetch(): Promise<{ success: boolean; binPath?: string; error?: string }>
  list(): Promise<any[]>
}

// ── Storage Service ────────────────────────────────────────────────────────

export interface StorageServiceContract {
  scanLibraries(opts?: {
    extraPaths?: string[]
    games?: { appId: string; name: string; installDir: string; sizeOnDisk: number }[]
  }): Promise<{
    libraries: { path: string; name: string; totalBytes: number; freeBytes: number; usedByGames: number; gameCount: number; fsType: string; isDefault: boolean }[]
    totalBytes: number
    totalFreeBytes: number
    totalUsedByGames: number
    totalGames: number
    largestFiles: { path: string; size: number; gameName: string }[]
    fileTypes: Record<string, { count: number; totalSize: number }>
    largestGames: { appId: string; name: string; sizeOnDisk: number }[]
  }>
  checkDiskSpace(targetPath?: string): Promise<{
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
  }>
  moveGame(appId: string, sourceDir: string, targetLibPath: string): Promise<{
    success: boolean
    error?: string
    bytesMoved?: number
    newInstallDir?: string
    durationMs?: number
  }>
  cleanGameFolders(libraryPaths: string[]): Promise<{
    success: boolean
    bytesFreed: number
    itemsRemoved: string[]
    errors: string[]
  }>
  getStorageDiagnostics(games?: { installDir: string; sizeOnDisk: number }[]): Promise<{
    libraryCount: number
    defaultLibrary: string
    totalGames: number
    totalSizeFormatted: string
    freeSizeFormatted: string
    diskHealth: 'healthy' | 'warning' | 'critical'
    warnings: string[]
  }>
}

// ── GRE (Game Runtime Environment) Service Contracts ──────────────────────

export interface RuntimeDetectServiceContract {
  detectAll(): Promise<{ runtimes: any[]; directX: string }>
  detectRuntime(type: string): Promise<any>
  checkRequirements(): Promise<{ met: boolean; checks: any[]; missing: any[] }>
  installRuntime(type: string): Promise<{ success: boolean; message: string }>
  detectDirectX(): Promise<string>
}

export interface LaunchProfileServiceContract {
  listProfiles(gameId: string): Promise<any[]>
  getDefaultProfile(gameId: string): Promise<any>
  getProfile(gameId: string, profileName: string): Promise<any | null>
  createProfile(gameId: string, profile: any): Promise<any>
  updateProfile(gameId: string, profileName: string, updates: any): Promise<any | null>
  deleteProfile(gameId: string, profileName: string): Promise<boolean>
  setDefaultProfile(gameId: string, profileName: string): Promise<boolean>
  createDefaultProfile(): Promise<any>
  findCompatLayerPath(config: any): Promise<string | null>
}

export interface SaveManagerServiceContract {
  detectSaves(appId: string, gameName: string): Promise<any>
  detectSavesWithFallback(appId: string, gameName: string, installDir?: string): Promise<any>
  createBackup(appId: string, saves: any[], name?: string): Promise<any>
  restoreBackup(backup: any): Promise<any>
  listBackups(appId: string): Promise<any[]>
  deleteBackup(backup: any): Promise<boolean>
}

export interface GameProcessServiceContract {
  launchGame(appId: string, executablePath: string, launchCommand: string, env: any): Promise<any>
  getStatus(appId: string): Promise<any>
  killGame(appId: string, timeoutMs?: number): Promise<boolean>
  listRunning(): Promise<any[]>
  getPlayTime(appId: string): Promise<any>
  formatPlayTime(totalSeconds: number): Promise<string>
  syncPendingSessions(): Promise<{ success: boolean }>
}

// ── Remote Play Service ────────────────────────────────────────────────────

export interface RemotePlaySession {
  id: string
  name: string
  host: string
  port: number
  status: 'idle' | 'hosting' | 'connecting' | 'connected' | 'disconnected' | 'error'
  startedAt: number
  clients: number
  quality: string
  fps: number
}

export interface RemotePlaySettings {
  maxBitrate: number
  resolution: string
  fps: number
  enableAudio: boolean
  enableGamepad: boolean
  discoveryPort: number
  streamPort: number
  autoAccept: boolean
}

/**
 * WebRTC signaling message exchanged between host and client
 * via the UDP signaling channel (backend relay).
 */
export interface SignalPayload {
  type: 'request' | 'offer' | 'answer' | 'ice' | 'accept' | 'reject' | 'bye'
  /** SDP for offer/answer, ICE candidate for ice */
  data?: any
  /** Session identifier to correlate messages */
  sessionId?: string
}

/**
 * Sentinel `from` value used by `broadcastSignal` (host-side fanout) when
 * piping an envelope to every BrowserWindow. Renderer-side `onSignal`
 * handlers MUST drop envelopes with this tag — they are IPC echoes of the
 * renderer's own outbound signal, not a real peer. Exported as a const
 * (rather than a magic string) so the emitter and the filter cannot drift.
 *
 * Important: the OTHER `from` source — `setOnSignalCallback` in
 * `electron/main.ts` — tags envelopes with the actual signalingServer
 * remoteAddress (e.g. `::ffff:192.168.0.16:61752`). Do NOT replace that
 * tag with this sentinel; the LAN/desktop-to-desktop flow relies on the
 * real remoteAddress to disambiguate peers.
 */
export const HOST_RENDERER_FROM = 'host-renderer' as const

// ============================================================================
// Mobile input bridge — client (mobile browser) → host (this Windows PC)
// Sends binary frames over a WebRTC data channel; the host's renderer
// forwards each frame to the main process via the `inputBridge.dispatch`
// IPC handler, which decodes and dispatches to win32-input (SendInput).
// ============================================================================

/**
 * Wire format for input frames (little-endian).
 * Wire layout kept identical between the renderer (sender) and input-bridge.ts
 * (decoder) so updates stay in sync.
 */
export const InputFrameType = {
  KEY_DOWN: 0x01,
  KEY_UP: 0x02,
  MOUSE_MOVE: 0x03,
  MOUSE_CLICK: 0x04,
  GAMEPAD_BTN: 0x05,
  GAMEPAD_AXIS: 0x06,
  TOUCH: 0x07,
  WHEEL: 0x08,
  KEY_TEXT: 0x09,
  BYE: 0x0a,
} as const

export interface InputBridgeServiceContract {
  /** Receive a binary input frame from the renderer (sent via data channel) */
  dispatch: (frame: Uint8Array) => Promise<{ ok: boolean; reason?: string }>
  /** Reports whether the Win32 SendInput injector is loaded and ready */
  isReady: () => Promise<{ available: boolean; error: string | null; platform: NodeJS.Platform }>
}

export interface RemotePlayServiceContract {
  startHosting(name: string, port?: number): Promise<RemotePlaySession>
  stopHosting(): Promise<void>
  discoverHosts(timeoutMs?: number): Promise<RemotePlaySession[]>
  connectToHost(host: string, port: number): Promise<RemotePlaySession>
  disconnect(): Promise<void>
  getStatus(): Promise<{ status: string; session: RemotePlaySession | null }>
  getSettings(): Promise<RemotePlaySettings>
  updateSettings(settings: Partial<RemotePlaySettings>): Promise<void>

  // ── WebRTC Signaling ──
  sendSignal(host: string, port: number, signal: SignalPayload): Promise<void>
  startSignalingListener(): Promise<void>
  stopSignalingListener(): Promise<void>

  // ── Presence & WAN Signaling ──
  /** Register this PC as a remote play host on the backend server */
  registerHost(name: string): Promise<HostRegistration>
  /** Unregister this PC from the backend server */
  unregisterHost(): Promise<void>
  /** Send heartbeat to keep the host alive */
  sendHeartbeat(): Promise<void>
  /** Connect to WebSocket signaling channel for WAN remote play */
  connectWsSignaling(token: string): Promise<void>
  /** Disconnect WebSocket signaling */
  disconnectWsSignaling(): Promise<void>
  /** Send a signaling message via WebSocket relay */
  sendWsSignal(signal: WsSignalPayload): Promise<void>
  /** Accept a pending connection request */
  acceptConnectionRequest(requestId: string): Promise<void>
  /** Reject a pending connection request */
  rejectConnectionRequest(requestId: string): Promise<void>

  /**
   * Host-side fan-out of a WebRTC signal (offer / answer / ice / request /
   * bye) to every reachable peer transport in parallel:
   *
   *   1. The live LAN TCP signalingClientSocket (peer desktop on the same
   *      network, opened its own persistent connection to this host's
   *      streamPort+1).
   *   2. Every mobile browser subscribed via the BrowserBridge WS on
   *      :42863 (an iPhone / iPad that scanned the QR).
   *   3. Every Electron BrowserWindow (second desktop renderer, login
   *      screen, splash, devtools, multi-window layouts).
   *
   * Replaces the renderer-facing `sendSignal(host, port)` helper, which
   * always opens a fresh throwaway TCP socket per call and `socket.destroy()`s
   * it after `socket.write` returns. That throwaway could deliver ONE signal
   * in either direction but had no return path, so the host's OFFER in a
   * mobile-launched flow was being delivered to the host's own signalingServer
   * (closing the mobile's bridge-side TCP leg in the process) and never
   * reached the phone. Broadcasting to all transports means whoever the
   * actual peer is gets the frame.
   */
  broadcastSignal(signal: SignalPayload): Promise<void>
}

// ── Input Injection Service ────────────────────────────────────────────────

export interface InputInjectionServiceContract {
  isAvailable(): boolean
  getError(): string | null
  injectKeyboard(key: string, pressed: boolean): boolean
  injectMouse(action: 'move' | 'button' | 'wheel' | 'absolute', opts: {
    dx?: number; dy?: number; button?: string; pressed?: boolean; delta?: number
  }): boolean
  injectGamepadButton(button: string, pressed: boolean): boolean
  injectTouch(x: number, y: number, action: 'down' | 'move' | 'up'): boolean
  injectText(text: string): void
  processCommand(command: {
    type: 'keyboard' | 'mouse' | 'gamepad' | 'touch' | 'text'
    data: Record<string, unknown>
  }): boolean
}

// ── Presence Service ────────────────────────────────────────────────────────

export interface HostRegistration {
  hostId: string
  name: string
  os: string
  publicIp: string
  version: string
  status: 'online' | 'offline'
  capabilities: string[]
  registeredAt: number
}

export interface DeviceInfo {
  deviceId: string
  name: string
  platform: 'android' | 'ios' | 'windows' | 'mac' | 'linux'
  trusted: boolean
  lastConnectedAt?: number
}

export interface ConnectionRequest {
  id: string
  device: DeviceInfo
  hostId: string
  status: 'pending' | 'accepted' | 'rejected' | 'expired'
  createdAt: number
}

/** Signaling message sent via WebSocket relay (WAN) instead of LAN TCP */
export interface WsSignalPayload {
  type: 'request' | 'offer' | 'answer' | 'ice' | 'accept' | 'reject' | 'bye' | 'connection_request' | 'connection_response'
  data?: any
  sessionId?: string
  /** Target device ID (for routing on the server) */
  targetDeviceId?: string
  /** Source device ID */
  sourceDeviceId?: string
}

// ── Plugin Service ─────────────────────────────────────────────────────────

export interface PluginInstance {
  id: string
  name: string
  version: string
  author: string
  description: string
  apiVersion: string
  enabled: boolean
  loaded: boolean
  installPath: string
  installedAt: number
  entryPoint: string
  hasCommands: boolean
  hasMenuItems: boolean
  commands: { id: string; label: string }[]
  menuItems: { id: string; label: string; route?: string }[]
}

export interface PluginServiceContract {
  listPlugins(): Promise<PluginInstance[]>
  loadPlugin(pluginId: string): Promise<{ success: boolean; error?: string }>
  unloadPlugin(pluginId: string): Promise<{ success: boolean }>
  enablePlugin(pluginId: string): Promise<{ success: boolean; error?: string }>
  disablePlugin(pluginId: string): Promise<{ success: boolean; error?: string }>
  installPlugin(pluginPath: string): Promise<{ success: boolean; plugin?: PluginInstance; error?: string }>
  removePlugin(pluginId: string): Promise<{ success: boolean; error?: string }>
  scanPlugins(): Promise<PluginInstance[]>
  loadAllPlugins(): Promise<{ success: boolean; loaded: number; errors: string[] }>
  unloadAllPlugins(): Promise<void>
  executePluginCommand(pluginId: string, commandId: string, args?: unknown[]): Promise<unknown>
}

// ── Mods Service ──────────────────────────────────────────────────────────

export interface ModsServiceContract {
  // Search & Discovery
  searchCatalog(query: ModSearchQuery): Promise<{ success: boolean; data?: ModSearchResult; error?: string }>
  getDetails(fileId: string): Promise<{ success: boolean; data?: ModInfo; error?: string }>
  listInstalled(gameAppId: string): Promise<{ success: boolean; data?: ModInfo[]; error?: string }>

  // Installation
  install(modDetails: any, options: ModInstallOptions): Promise<{ success: boolean; data?: ModInstallResult; error?: string }>
  uninstall(options: ModUninstallOptions): Promise<{ success: boolean; data?: ModUninstallResult; error?: string }>
  enable(modId: string): Promise<{ success: boolean; error?: string }>
  disable(modId: string): Promise<{ success: boolean; error?: string }>
  cancelInstall(modId: string): Promise<{ success: boolean; error?: string }>

  // Security & Maintenance
  scanMalware(options: any): Promise<{ success: boolean; data?: ModScanResult; error?: string }>
  getBackups(modId: string): Promise<{ success: boolean; data?: BackupInfo[]; error?: string }>
  restoreBackup(payload: { backupId: string; modId: string; installPath: string }): Promise<{ success: boolean; error?: string }>
  checkConflicts(gameAppId: string): Promise<{ success: boolean; data?: any; error?: string }>

  // Query & Statistics
  searchInstalled(query: string, gameAppId?: string): Promise<{ success: boolean; data?: ModInfo[]; error?: string }>
  queryMods(gameAppId: string, filters?: any): Promise<{ success: boolean; data?: ModQueryResult; error?: string }>
  getStatistics(gameAppId: string): Promise<{ success: boolean; data?: ModStatistics; error?: string }>
  getCacheStats(): Promise<{ success: boolean; data?: CacheStats; error?: string }>

  // Cache Management
  clearCache(): Promise<{ success: boolean; error?: string }>
}

// ── Maintenance Service ────────────────────────────────────────────────────

export interface MaintenanceServiceContract {
  runFullHealthCheck(): Promise<FullHealthReport>
  checkRuntimeHealth(): Promise<RuntimeHealthReport>
  checkSaveHealth(): Promise<SaveHealthReport>
  runLibraryScan(): Promise<LibraryScanReport>
  getMaintenanceDiagnostics(): Promise<FullDiagnostics>
  clearAllCaches(): Promise<{ success: boolean; error?: string; bytesFreed?: number }>
}

export interface RuntimeHealthReport {
  healthy: boolean
  runtimes: { name: string; installed: boolean; version?: string }[]
  directX: string
  missing: { name: string; severity: 'required' | 'recommended' }[]
  warnings: string[]
}

export interface SaveHealthReport {
  healthy: boolean
  totalBackups: number
  totalSaves: number
  totalSizeBytes: number
  gamesWithBackups: number
  gamesWithoutBackups: number
  gamesWithoutDetection: number
  oldestBackupAge: number
  warnings: string[]
}

export interface LibraryScanReport {
  healthy: boolean
  totalGames: number
  verified: number
  corrupted: number
  missingFiles: number
  orphanedEntries: number
  duplicateEntries: number
  totalSizeBytes: number
  warnings: string[]
  scannedPaths: string[]
  scanDurationMs: number
}

export interface FullHealthReport {
  healthy: boolean
  runtime: RuntimeHealthReport
  saves: SaveHealthReport
  library: LibraryScanReport
  overallWarnings: string[]
  overallIssues: number
  timestamp: number
}

export interface FullDiagnostics {
  services: { name: string; methods: number; status: 'registered' | 'error' }[]
  modules: { name: string; version: string; loaded: boolean }[]
  system: {
    platform: string
    arch: string
    electronVersion: string
    userData: string
  }
  warnings: string[]
}

// ── Registry of all service contracts ──────────────────────────────────────

export interface ServiceContracts {
  config: ConfigServiceContract
  auth: AuthServiceContract
  game: GameServiceContract
  store: StoreServiceContract
  download: DownloadServiceContract
  log: LogServiceContract
  steam: SteamServiceContract
  update: UpdateServiceContract
  onlinefix: OnlineFixServiceContract
  drm: DrmServiceContract
  storage: StorageServiceContract
  steamcmd: SteamCmdServiceContract
  runtimeDetect: RuntimeDetectServiceContract
  launchProfiles: LaunchProfileServiceContract
  saveManager: SaveManagerServiceContract
  gameProcess: GameProcessServiceContract
  maintenance: MaintenanceServiceContract
  mods: ModsServiceContract
  plugin: PluginServiceContract
  remotePlay: RemotePlayServiceContract
  inputInjection: InputInjectionServiceContract
}

// ── Events ─────────────────────────────────────────────────────────────────

export type ServiceEvents = {
  'log:entry': LogEntry
  'steam:error': { type: string; message: string; solution: string; rawLine: string }
  'download:progress': any
  'download:completed': any
  'download:failed': any
  'download:queue-changed': any
  'download:engine-status': any
  'update-available': { version?: string }
  'update-progress': { percent: number; transferred: number; total: number; bytesPerSecond: number }
  'update-downloaded': { version?: string }
  'update-error': { message: string }
  'steamcmd:progress': any
  'mods:install-progress': any
  'mods:installed': ModInstallResult
  'mods:uninstalled': ModUninstallResult
  'mods:enabled': ModToggleResult
  'mods:disabled': ModToggleResult
  'mods:scan-complete': ModScanResult
  'mods:conflict-detected': any
  /** WebRTC signaling message received from remote host/client (LAN) */
  'remotePlay:signal': SignalPayload & { from: string; port: number }
  /** WebSocket signaling message received via server relay (WAN) */
  'remotePlay:wsSignal': WsSignalPayload
  /** Connection request from a remote device */
  'remotePlay:connectionRequest': ConnectionRequest
  /**
   * Mobile-launched game broadcast. The main process emits this to every
   * BrowserWindow right after `remotePlay.launchFromMobile` succeeds at
   * launching the requested appId via Steam. The renderer-side
   * `HostRemotePlayAuto` (mounted in AppShell) listens for it to start
   * screen capture + TCP signaling + WebRTC host peer so the phone's
   * stream arrives without the desktop user opening Remote Play first.
   */
  'remotePlay:mobileLaunch': { appId: string; sessionId: string }
  /** Game exit event with metrics and cleanup */
  'game:exit-event': { appId: string; processId: number | null; exitCode: number | null; metrics: ExitMetrics }
  /** Online Fix recovery action recommended */
  'recovery:action-recommended': { appId: string; action: string; message?: string }
  /** Recovery retry ready */
  'recovery:retry-ready': { appId: string }
  /** Connection mode changed */
  'recovery:mode-changed': { appId: string; mode: 'p2p' | 'relay' | 'lan' | 'disabled'; message: string }
  /** Online Fix disabled due to repeated failures */
  'recovery:disabled': { appId: string; reason: string; message: string }
}
