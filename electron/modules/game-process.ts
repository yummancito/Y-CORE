// ============================================================================
// electron/modules/game-process.ts
// ----------------------------------------------------------------------------
// Game Process Manager — spawn, monitor, kill game processes with time tracking.
// Supports: process spawning with launch profiles, PID tracking, play sessions,
// graceful kill, and elapsed time calculation.
//
// Inspired by: Heroic's game launcher process management, Lutris' process monitor.
// ============================================================================

import { spawn, type ChildProcess } from 'child_process'
import path from 'path'
import fs from 'fs'
import { app, BrowserWindow } from 'electron'
import { logger } from '../logger'
import { integrateExitCleanup, getLaunchContext } from './game-launch-integration'

// ── Types ──────────────────────────────────────────────────────────────────

export interface GameProcessStatus {
  pid: number | null
  running: boolean
  startTime: number | null
  elapsedSeconds: number
}

export interface PlaySession {
  id: string
  appId: string
  startTime: number
  endTime: number | null
  durationSeconds: number
}

export interface PlayTimeSummary {
  appId: string
  totalSeconds: number
  sessions: PlaySession[]
  lastPlayed: number | null
}

// ── State ──────────────────────────────────────────────────────────────────

interface ManagedProcess {
  appId: string
  process: ChildProcess
  startTime: number
  onExit: (code: number | null) => void
}

const managedProcesses = new Map<string, ManagedProcess>()
const SESSIONS_DIR = 'play-sessions'

function getSessionsDir(): string {
  return path.join(app.getPath('userData'), SESSIONS_DIR)
}

function getSessionsFile(appId: string): string {
  return path.join(getSessionsDir(), `${appId}.json`)
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

function readSessions(appId: string): PlaySession[] {
  const filePath = getSessionsFile(appId)
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
    }
  } catch (err: any) {
    logger.warn(`[GameProcess] Failed to read sessions for ${appId}: ${err.message}`, 'gameproc')
  }
  return []
}

function writeSessions(appId: string, sessions: PlaySession[]): void {
  const dir = getSessionsDir()
  ensureDir(dir)
  const filePath = getSessionsFile(appId)
  const tmpPath = filePath + '.tmp'
  fs.writeFileSync(tmpPath, JSON.stringify(sessions, null, 2), 'utf-8')
  fs.renameSync(tmpPath, filePath)
}

// ── Process Management ─────────────────────────────────────────────────────

/**
 * Find the game executable in the install directory.
 * Returns the path to the first valid .exe found, or null.
 */
export function findGameExecutable(installDir: string): string | null {
  if (!fs.existsSync(installDir)) return null

  try {
    const entries = fs.readdirSync(installDir)
    // Priority 1: exe matching folder name (most common pattern)
    const dirName = path.basename(installDir)
    const exactMatch = entries.find(e => e.toLowerCase() === `${dirName.toLowerCase()}.exe`)
    if (exactMatch) return path.join(installDir, exactMatch)

    // Priority 2: exe matching folder name with 'launcher' suffix
    const launcherMatch = entries.find(e => {
      const lower = e.toLowerCase()
      return lower.startsWith(dirName.toLowerCase()) && lower.endsWith('.exe')
        && (lower.includes('launcher') || lower.includes('_64') || lower.includes('x64'))
    })
    if (launcherMatch) return path.join(installDir, launcherMatch)

    // Priority 3: any .exe that doesn't contain 'redist', 'vcredist', 'dxsetup', 'unins'
    const exeCandidates = entries.filter(e => {
      const lower = e.toLowerCase()
      return lower.endsWith('.exe')
        && !lower.includes('redist')
        && !lower.includes('dxsetup')
        && !lower.includes('unins')
        && !lower.includes('vcredit')
        && !lower.includes('dotnet')
        && fs.statSync(path.join(installDir, e)).size > 100000 // > 100KB = real exe
    })
    if (exeCandidates.length > 0) return path.join(installDir, exeCandidates[0])

    // Priority 4: first .exe in subdirectories (Binaries, bin, etc.)
    for (const entry of entries) {
      const fullPath = path.join(installDir, entry)
      if (fs.statSync(fullPath).isDirectory()) {
        const subExe = findGameExecutable(fullPath)
        if (subExe) return subExe
      }
    }
  } catch {
    // ignore errors
  }

  return null
}

/**
 * Launch a game directly (without Steam) by finding and spawning its executable.
 * Returns the process status or throws if the game can't be found/launched.
 */
export function launchGameFromDir(
  appId: string,
  installDir: string,
  gameName: string,
): GameProcessStatus {
  const exePath = findGameExecutable(installDir)
  if (!exePath) {
    throw new Error(`No se encontró un ejecutable en: ${installDir}`)
  }

  // Kill existing process for this app if running
  if (managedProcesses.has(appId)) {
    try { managedProcesses.get(appId)!.process.kill() } catch {}
    managedProcesses.delete(appId)
  }

  // ── Steam env vars para juegos que sondeán el entorno ──────────────────────
  // La copia de ycore_steam.dll como steam_api64.dll en la carpeta del juego
  // (hecha por `patchGameFolder` desde game.service.ts) intercepta las llamadas
  // a SteamAPI, pero juegos viejos o paranoicos también leen variables de
  // entorno para validar su estado. Inyectarlas evita fallos antes incluso de
  // que el DLL sea tocado. Sin esto, juegos como Half-Life pre-Source SDK 2013
  // fallan con "could not connect to Steam client".
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    SteamAppId: String(appId),
    SteamGameId: String(appId),
    SteamClientLaunch: '1',
  }

  const proc = spawn(`"${exePath}"`, [], {
    cwd: path.dirname(exePath),
    env,
    windowsHide: false,
    detached: true,
    stdio: 'ignore',
  })
  proc.unref()

  const startTime = Date.now()
  const managed: ManagedProcess = {
    appId,
    process: proc,
    startTime,
    onExit: (code) => {
      const endTime = Date.now()
      const duration = Math.round((endTime - startTime) / 1000)
      const session: PlaySession = {
        id: `${appId}-${startTime}`,
        appId,
        startTime,
        endTime,
        durationSeconds: duration,
      }
      addSession(appId, session)
      managedProcesses.delete(appId)
      logger.info(`[GameProcess] ${gameName} (${appId}) exited with code ${code} (played ${duration}s)`, 'gameproc')
    },
  }

  proc.on('exit', (code) => {
    // Call Online Fix cleanup if applicable
    const launchContext = getLaunchContext(appId)
    if (launchContext) {
      const metrics = integrateExitCleanup(appId, proc.pid ?? null, code ?? null, false)
      logger.info(
        `[GameProcess] Online Fix cleanup completed for ${appId}: ` +
        `p2p_conns=${metrics.p2pConnectionsEstablished}, bytes=${metrics.bytesTransferred}`,
        'gameproc'
      )

      // Notify renderer about game exit with metrics
      const windows = BrowserWindow.getAllWindows()
      for (const win of windows) {
        win.webContents.send('game:exit-event', {
          appId,
          processId: proc.pid,
          exitCode: code,
          metrics,
        })
      }
    }
    managed.onExit(code)
  })

  proc.on('error', (err) => {
    logger.error(`[GameProcess] ${gameName} (${appId}) error: ${err.message}`, 'gameproc')
    // Call exit cleanup with crash flag
    const launchContext = getLaunchContext(appId)
    if (launchContext) {
      integrateExitCleanup(appId, proc.pid ?? null, null, true)
    }
    managed.onExit(null)
  })

  managedProcesses.set(appId, managed)
  logger.info(`[GameProcess] Launched ${gameName} (${appId}) directly (PID: ${proc.pid}): ${exePath}`, 'gameproc')

  return {
    pid: proc.pid ?? null,
    running: true,
    startTime,
    elapsedSeconds: 0,
  }
}

/**
 * Launch a game with the given executable path and launch command.
 * Returns the process status.
 */
export function launchGame(
  appId: string,
  executablePath: string,
  launchCommand: string,
  env: NodeJS.ProcessEnv,
): GameProcessStatus {
  // Kill existing process for this app if running
  if (managedProcesses.has(appId)) {
    try {
      managedProcesses.get(appId)!.process.kill()
    } catch { /* ignore */ }
    managedProcesses.delete(appId)
  }

  if (!fs.existsSync(executablePath)) {
    throw new Error(`Executable not found: ${executablePath}`)
  }

  const proc = spawn(launchCommand, [], {
    cwd: path.dirname(executablePath),
    env,
    windowsHide: false,
    detached: false,
    stdio: 'ignore',
  })

  const startTime = Date.now()
  const managed: ManagedProcess = {
    appId,
    process: proc,
    startTime,
    onExit: (code) => {
      const endTime = Date.now()
      const duration = Math.round((endTime - startTime) / 1000)

      // Record play session
      const session: PlaySession = {
        id: `${appId}-${startTime}`,
        appId,
        startTime,
        endTime,
        durationSeconds: duration,
      }
      addSession(appId, session)

      managedProcesses.delete(appId)
      logger.info(`[GameProcess] ${appId} exited with code ${code} (played ${duration}s)`, 'gameproc')
    },
  }

  proc.on('exit', (code) => {
    // Call Online Fix cleanup if applicable
    const launchContext = getLaunchContext(appId)
    if (launchContext) {
      const metrics = integrateExitCleanup(appId, proc.pid ?? null, code ?? null, false)
      logger.info(
        `[GameProcess] Online Fix cleanup completed for ${appId}: ` +
        `p2p_conns=${metrics.p2pConnectionsEstablished}, bytes=${metrics.bytesTransferred}`,
        'gameproc'
      )

      // Notify renderer about game exit
      const windows = BrowserWindow.getAllWindows()
      for (const win of windows) {
        win.webContents.send('game:exit-event', {
          appId,
          processId: proc.pid,
          exitCode: code,
          metrics,
        })
      }
    }
    managed.onExit(code)
  })

  proc.on('error', (err) => {
    logger.error(`[GameProcess] ${appId} error: ${err.message}`, 'gameproc')
    // Call exit cleanup with crash flag
    const launchContext = getLaunchContext(appId)
    if (launchContext) {
      integrateExitCleanup(appId, proc.pid ?? null, null, true)
    }
    managed.onExit(null)
  })

  managedProcesses.set(appId, managed)

  logger.info(`[GameProcess] Launched ${appId} (PID: ${proc.pid}): ${launchCommand}`, 'gameproc')
  return {
    pid: proc.pid ?? null,
    running: true,
    startTime,
    elapsedSeconds: 0,
  }
}

/**
 * Get the current status of a game process.
 */
export function getProcessStatus(appId: string): GameProcessStatus {
  const managed = managedProcesses.get(appId)
  if (!managed) {
    return { pid: null, running: false, startTime: null, elapsedSeconds: 0 }
  }

  // Check if process is still alive
  const isRunning = managed.process.exitCode === null && managed.process.killed === false
  const elapsed = isRunning ? Math.round((Date.now() - managed.startTime) / 1000) : 0

  return {
    pid: managed.process.pid ?? null,
    running: isRunning,
    startTime: managed.startTime,
    elapsedSeconds: elapsed,
  }
}

/**
 * Kill a game process gracefully (SIGTERM), then force after timeout.
 */
export function killGame(appId: string, timeoutMs: number = 5000): boolean {
  const managed = managedProcesses.get(appId)
  if (!managed) return false

  try {
    managed.process.kill('SIGTERM')
    // Force kill after timeout
    const forceKillTimer = setTimeout(() => {
      try {
        managed.process.kill('SIGKILL')
      } catch { /* already dead */ }
    }, timeoutMs)

    managed.process.on('close', () => {
      clearTimeout(forceKillTimer)
    })

    return true
  } catch (err: any) {
    logger.warn(`[GameProcess] Failed to kill ${appId}: ${err.message}`, 'gameproc')
    return false
  }
}

/**
 * List all currently running game processes.
 */
export function listRunningProcesses(): { appId: string; pid: number; elapsedSeconds: number }[] {
  const result: { appId: string; pid: number; elapsedSeconds: number }[] = []
  for (const [appId, managed] of managedProcesses) {
    if (managed.process.pid && managed.process.exitCode === null) {
      result.push({
        appId,
        pid: managed.process.pid,
        elapsedSeconds: Math.round((Date.now() - managed.startTime) / 1000),
      })
    }
  }
  return result
}

/**
 * Kill all managed game processes (call on app quit).
 */
export function killAllProcesses(): void {
  for (const [appId, managed] of managedProcesses) {
    try {
      managed.process.kill('SIGTERM')
    } catch { /* ignore */ }
  }
  managedProcesses.clear()
}

// ── Play Time Tracking ─────────────────────────────────────────────────────

/**
 * Record a play session.
 */
export function addSession(appId: string, session: PlaySession): void {
  const sessions = readSessions(appId)
  sessions.push(session)

  // Keep only last 100 sessions
  if (sessions.length > 100) {
    sessions.splice(0, sessions.length - 100)
  }

  writeSessions(appId, sessions)
}

/**
 * Get play time summary for a game.
 */
export function getPlayTimeSummary(appId: string): PlayTimeSummary {
  const sessions = readSessions(appId)
  const totalSeconds = sessions.reduce((sum, s) => sum + s.durationSeconds, 0)
  const lastPlayed = sessions.length > 0
    ? sessions[sessions.length - 1].endTime
    : null

  return { appId, totalSeconds, sessions, lastPlayed }
}

/**
 * Format seconds into a human-readable string (e.g., "2h 30m").
 */
export function formatPlayTime(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  if (hours > 0) return `${hours}h ${minutes}m`
  if (minutes > 0) return `${minutes}m`
  return `${totalSeconds}s`
}

/**
 * Sync an incomplete play session (for when the app crashes).
 * If a session exists without an endTime, close it.
 */
export function syncPendingSessions(appId: string): void {
  const sessions = readSessions(appId)
  let changed = false
  for (const session of sessions) {
    if (session.endTime === null) {
      session.endTime = Date.now()
      session.durationSeconds = Math.round((session.endTime - session.startTime) / 1000)
      changed = true
    }
  }
  if (changed) writeSessions(appId, sessions)
}

/**
 * Sync all pending sessions for all games.
 */
export function syncAllPendingSessions(): void {
  const sessionsDir = getSessionsDir()
  if (!fs.existsSync(sessionsDir)) return
  try {
    const entries = fs.readdirSync(sessionsDir)
    for (const entry of entries) {
      if (entry.endsWith('.json')) {
        const appId = path.basename(entry, '.json')
        syncPendingSessions(appId)
      }
    }
  } catch { /* ignore */ }
}
