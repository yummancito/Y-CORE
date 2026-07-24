// electron/modules/steamcmd-manager.ts
//
// Lifecycle de jobs SteamCMD. El fork por appId, la concurrency, el detector
// de stalled, y la rasterización de progreso a eventos IPC viven acá.
//
// Cosas que NO viven acá (separación deliberada):
//   - Tipos del dominio → ./steamcmd-types
//   - Helpers puros de parsing → ./steamcmd-parser (testables sin spawn)
//   - Descarga y extracción de SteamCMD → ./steamcmd-fetcher (H1.5)
//
// Responsabilidades de este módulo (únicas):
//   1. Localizar el binario SteamCMD (resources/steamcmd/ en packaged, mismo
//      path en dev). Si no existe, `isSteamCmdAvailable()` devuelve false.
//   2. fork() por appId con concurrency limitada (default 4, configurable por
//      `Y_CORE_MAX_DL_CONCURRENCY`). Cuando se llena, las llamadas pendientes
//      quedan encoladas en `pendingQueue`.
//   3. Parsear stderr/stdout línea a línea con regex estables contra fixtures
//      de SteamCMD reales. Clasifica el estado (preparing / downloading /
//      verifying / committing / allocating / done / failed / stalled).
//   4. Calcular velocidad instantánea con ventana 8 s y emitir progreso con
//      throttling (mínimo 256 KB o 500 ms entre emissions a renderer).
//   5. Detectar stalled (sin cambio de bytes durante >30s) y emitir
//      `steamcmd:stalled` para que la UI muestre el warning.
//      El detector se inicializa LAZY en la primera llamada a startJob
//      (no al import) — usuarios que nunca invocan SteamCMD no pagan el timer.
//   6. Cleanup correcto al SIGTERM (cancel), exit del child o error de spawn.
//      Emite `steamcmd:complete` o `steamcmd:failed` y libera el slot.
//
// IMPORTANTE: usa solo `+login anonymous`. Nunca autenticamos como un usuario
// real (riesgo de ban de cuenta Steam).

import { spawn, type ChildProcessWithoutNullStreams } from 'child_process'
import path from 'path'
import fs from 'fs'
import { logger } from '../logger'
import {
  isElectronContext,
  isElectronPackaged,
  getUserDataDir,
  getAppPath,
  getHome,
  emitToRenderers,
} from './electron-context'
import {
  classifyUpdateState,
  extractErrorMessage,
  buildArgs,
} from './steamcmd-parser'
import type {
  SteamCmdState,
  SteamCmdProgress,
  SteamCmdInstallOptions,
  SteamCmdErrorKey,
  StartResult,
  CancelResult,
} from './steamcmd-types'

// Re-exportar tipos desde ./steamcmd-types para que callers externos
// (preload, useInstallProcessor) sigan importando `'./steamcmd-manager'`.
export type {
  SteamCmdState,
  SteamCmdProgress,
  SteamCmdInstallOptions,
  SteamCmdErrorKey,
  StartResult,
  CancelResult,
}

// electron-context detecta el runtime real (Electron vs CLI Node), pero el
// global `process` de TypeScript no incluye `resourcesPath` porque es una
// extensión que Electron setea al iniciar el main process. Lo opcional-tipeamos
// para reflejar el contrato runtime; en modo CLI nunca se accede porque
// isElectronContext gate la rama que lo usa.
declare const process: NodeJS.Process & {
  /** Electron-only: ruta al directorio resources. Undefined en Node puro. */
  resourcesPath?: string
}

// ============================================================
// Constantes
// ============================================================

const STALLED_TIMEOUT_MS = 30_000
const SPEED_WINDOW_MS = 8_000
const MIN_CONCURRENT = 1
const MAX_CONCURRENT_DEFAULT = 4
const MAX_CONCURRENT_CEILING = 16
const STDERR_TAIL_LIMIT = 30
const PROGRESS_MIN_DELTA_BYTES = 256 * 1024
const PROGRESS_MIN_DELTA_MS = 500

// Nombres de eventos IPC (exportados para que preload.ts los use sin typos).
export const STEAMCMD_EVENTS = {
  PROGRESS: 'steamcmd:progress',
  STALLED: 'steamcmd:stalled',
  COMPLETE: 'steamcmd:complete',
  FAILED: 'steamcmd:failed',
} as const

// Regex contra stderr real de SteamCMD (probados en fixtures de tests/).
const PROGRESS_RE = /Progress:\s+([\d.]+)\s+\/\s+([\d.]+)/i
const STATE_RE = /Update state \(0x(\w+)\)\s+(\w+)/i
const SUCCESS_RE = /Success! App '(\d+)' fully installed/i
const FAIL_RE = /ERROR! Failed to install app '(\d+)'/i
const LOGIN_FAIL_RE = /Logging in: 'anonymous' Failed|E_FAIL/i
const NOT_ANONYMOUS_RE = /requires\s+login|StateFlags.*4$|fully\s+installed\s+only/i

// ============================================================
// Estado interno: jobs en curso + cola de pendientes
// ============================================================

interface InstallJob {
  appId: string
  installDir: string
  betaBranch: string | undefined
  pid: number
  child: ChildProcessWithoutNullStreams
  state: SteamCmdState
  bytesDownloaded: number
  bytesTotal: number
  speedSamples: { t: number; bytes: number }[]
  stderrBuffer: string[]
  startedAt: number
  finishedAt: number | undefined
  lastByteChangeAt: number
  lastEmitAt: number
  errorKey?: SteamCmdErrorKey
  errorMessage: string | undefined
  lastEmittedBytes: number
  lastEmittedState: SteamCmdState
}

interface QueueEntry {
  opts: SteamCmdInstallOptions
  resolve: (result: StartResult) => void
}

const jobs = new Map<string, InstallJob>()
const pendingQueue: QueueEntry[] = []
let maxConcurrent = MAX_CONCURRENT_DEFAULT

// ============================================================
// Concurrency
// ============================================================

function getMaxConcurrent(): number {
  const env = process.env.Y_CORE_MAX_DL_CONCURRENCY
  if (env) {
    const parsed = parseInt(env, 10)
    if (!Number.isNaN(parsed) && parsed > 0 && parsed <= MAX_CONCURRENT_CEILING) {
      return parsed
    }
  }
  return maxConcurrent
}

/** Ajusta el límite superior de downloads simultáneos. Clamp a [1, ceiling]. */
export function setMaxConcurrent(n: number): void {
  const clamped = Math.max(MIN_CONCURRENT, Math.min(MAX_CONCURRENT_CEILING, Math.floor(n)))
  maxConcurrent = clamped
  drainQueue()
}

function drainQueue(): void {
  while (jobs.size < getMaxConcurrent() && pendingQueue.length > 0) {
    const next = pendingQueue.shift()
    if (!next) break
    const result = startJob(next.opts)
    next.resolve(result)
  }
}

// ============================================================
// Localización del binario
// ============================================================

function getSteamCmdBinaryName(): string {
  return process.platform === 'win32' ? 'steamcmd.exe' : 'steamcmd'
}

/**
 * Busca el ejecutable SteamCMD con esta prioridad:
 *   1. resources/steamcmd/<bin> dentro de process.resourcesPath (production).
 *   2. resources/steamcmd/<bin> dentro de app.getAppPath() (dev).
 *   3. %LOCALAPPDATA%/Y-core/steamcmd/ (cache de usuario tras fetch-steamcmd) — flat.
 *   4. %LOCALAPPDATA%/Y-core/steamcmd/steamcmd/ (mismo, layout nested que usa
 *      Valve actualmente por el wrapping dir dentro del zip oficial).
 *   5. Probe recursivo hasta 3 niveles para layouts futuros que Valve no haya publicado aún.
 * En macOS/Linux usa ~/Library/Application Support/Y-core/steamcmd/
 * o ~/.local/share/Y-core/steamcmd/.
 */
export function getSteamCmdPath(): string | null {
  const binary = getSteamCmdBinaryName()
  const candidates: string[] = []

  // En Electron: revisar primero recursos empaquetados (production / dev).
  if (isElectronContext) {
    try {
      if (isElectronPackaged()) {
        // isElectronContext === true garantiza que Electron setea
        // process.resourcesPath al iniciar el main process; en CLI nunca
        // llega acá. Non-null assertion refleja el contrato runtime.
        candidates.push(path.join(process.resourcesPath!, 'steamcmd', binary))
      }
      candidates.push(path.join(getAppPath(), 'resources', 'steamcmd', binary))
    } catch {
      // app aún no está en ready state; ignorar y probar cache.
    }
  }

  // Cache de usuario: funciona tanto en Electron como en CLI. El helper
  // getUserDataDir() resuelve la ruta correcta según contexto.
  const cacheRoot = (() => {
    try { return getUserDataDir() } catch { return null }
  })()
  if (cacheRoot) {
    candidates.push(path.join(cacheRoot, 'steamcmd', binary))
    // H1.7.4 — Valve's official steamcmd.zip wraps everything in a `steamcmd/`
    // nested directory. After 7zip-min extraction the bin lands here, not at
    // the cache root. Without this candidate `isSteamCmdAvailable()` would
    // return false even though fetchSteamCmd({force:true}) just succeeded.
    candidates.push(path.join(cacheRoot, 'steamcmd', 'steamcmd', binary))

    // H1.7.4 — Probe recursivo como última red de seguridad. Cubre layouts
    // nuevos que Valve pueda shipped en el futuro sin romper la app.
    try {
      const fs = require('fs') as typeof import('fs')
      const queue: Array<{ dir: string; depth: number }> = [
        { dir: path.join(cacheRoot, 'steamcmd'), depth: 0 },
      ]
      while (queue.length > 0) {
        const { dir, depth } = queue.shift()!
        if (depth > 3) continue
        let entries: import('fs').Dirent[]
        try {
          entries = fs.readdirSync(dir, { withFileTypes: true })
        } catch {
          continue
        }
        for (const entry of entries) {
          const full = path.join(dir, entry.name)
          if (entry.isDirectory()) {
            // Skip noisy subdirs that aren't SteamCMD.
            if (entry.name === 'logs' || entry.name === 'Cache') continue
            queue.push({ dir: full, depth: depth + 1 })
          } else if (entry.name === binary) {
            candidates.push(full)
          }
        }
      }
    } catch { /* best-effort */ }
  }

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) return candidate
    } catch {
      // ignore — acceso denegado o path inválido, probar siguiente
    }
  }
  return null
}

export function isSteamCmdAvailable(): boolean {
  return getSteamCmdPath() !== null
}

// ============================================================
// IPC emit helpers
// ============================================================

function emit(eventName: string, payload: unknown): void {
  // No-op en CLI puro — la CLI consume los streams via escucha directa
  // sobre startSteamCmdInstall (futuro H1.8.b).
  if (!isElectronContext) return
  emitToRenderers(eventName, payload, (err) => {
    logger.warn(
      `[steamcmd] emit falló (ventana destruida): ${(err as Error)?.message ?? err}`,
      'steamcmd',
    )
  })
}

// ============================================================
// Parser línea-a-línea
// ============================================================

/** Procesa una línea de stderr/stdout del proceso SteamCMD. Mutates job. */
function processLine(job: InstallJob, line: string): void {
  // Guardar siempre la línea cruda para diagnóstico (ventana deslizante).
  job.stderrBuffer.push(line)
  if (job.stderrBuffer.length > STDERR_TAIL_LIMIT) job.stderrBuffer.shift()

  const trimmed = line.trim()
  if (!trimmed) return

  const progressMatch = PROGRESS_RE.exec(trimmed)
  if (progressMatch) {
    const downloaded = Math.floor(parseFloat(progressMatch[1]))
    const total = Math.floor(parseFloat(progressMatch[2]))
    const delta = downloaded - job.bytesDownloaded
    if (delta > 0) {
      job.lastByteChangeAt = Date.now()
    }
    job.bytesDownloaded = downloaded
    job.bytesTotal = total
    job.speedSamples.push({ t: Date.now(), bytes: downloaded })
    const cutoff = Date.now() - SPEED_WINDOW_MS
    while (job.speedSamples.length > 0 && job.speedSamples[0].t < cutoff) {
      job.speedSamples.shift()
    }
    maybeEmit(job)
    return
  }

  const stateMatch = STATE_RE.exec(trimmed)
  if (stateMatch) {
    const newState = classifyUpdateState(stateMatch[2], job.state)
    if (newState !== job.state) {
      job.state = newState
      maybeEmit(job, true)
    }
    return
  }

  if (SUCCESS_RE.test(trimmed)) {
    finalizeJob(job, 'done')
    return
  }

  const failMatch = FAIL_RE.exec(trimmed)
  if (failMatch) {
    finalizeJob(job, 'failed', extractErrorMessage(trimmed))
    return
  }

  if (LOGIN_FAIL_RE.test(trimmed)) {
    finalizeJob(job, 'failed', 'Login anónimo rechazado por Steam')
    return
  }

  if (NOT_ANONYMOUS_RE.test(trimmed)) {
    // Setear errorKey ANTES de finalizeJob para que el consumer lo reciba
    // en el evento FAILED y pueda decidir fallback a installMethod='steamclient'.
    job.errorKey = 'errors.steamcmd.notAnonymous'
    finalizeJob(job, 'failed', 'Este juego no se puede descargar de forma anónima')
    return
  }
}

function computeSpeed(job: InstallJob): number {
  if (job.speedSamples.length < 2) return 0
  const first = job.speedSamples[0]
  const last = job.speedSamples[job.speedSamples.length - 1]
  const dtSec = (last.t - first.t) / 1000
  if (dtSec <= 0.1) return 0
  const speed = (last.bytes - first.bytes) / dtSec
  return speed > 0 ? speed : 0
}

function computeEta(job: InstallJob, speed: number): number {
  if (speed <= 0) return 0
  const remaining = job.bytesTotal - job.bytesDownloaded
  if (remaining <= 0) return 0
  return remaining / speed
}

function computePercent(job: InstallJob): number {
  if (job.bytesTotal <= 0) return 0
  return Math.min(100, (job.bytesDownloaded / job.bytesTotal) * 100)
}

function shouldEmit(job: InstallJob, forceOnStateChange = false): boolean {
  const now = Date.now()
  if (forceOnStateChange) return true
  if (now - job.lastEmitAt >= PROGRESS_MIN_DELTA_MS) return true
  if (Math.abs(job.bytesDownloaded - job.lastEmittedBytes) >= PROGRESS_MIN_DELTA_BYTES) return true
  return false
}

function maybeEmit(job: InstallJob, forceOnStateChange = false): void {
  if (!shouldEmit(job, forceOnStateChange)) return
  emitProgress(job)
}

function emitProgress(job: InstallJob): void {
  const speed = computeSpeed(job)
  const payload: SteamCmdProgress = {
    appId: job.appId,
    state: job.state,
    bytesDownloaded: job.bytesDownloaded,
    bytesTotal: job.bytesTotal,
    percent: computePercent(job),
    speedBytesPerSec: speed,
    etaSeconds: computeEta(job, speed),
    stderrTail: job.stderrBuffer.slice(),
    pid: job.pid,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    errorMessage: job.errorMessage,
    errorKey: job.errorKey,
  }
  job.lastEmittedBytes = job.bytesDownloaded
  job.lastEmittedState = job.state
  job.lastEmitAt = Date.now()
  emit(STEAMCMD_EVENTS.PROGRESS, payload)
}

// ============================================================
// Stalled detector — LAZY: solo se inicializa en el primer startJob.
// Beneficio: usuarios que no usan SteamCMD (installMethod='steamclient' o
// STEAMCMD no disponible) no pagan los wakeups cada 5s durante toda la sesión.
// ============================================================

let _stallInterval: NodeJS.Timeout | null = null

function getOrInitStallDetector(): NodeJS.Timeout {
  if (_stallInterval) return _stallInterval
  _stallInterval = setInterval(() => {
    const now = Date.now()
    for (const job of Array.from(jobs.values())) {
      if (job.state === 'done' || job.state === 'failed' || job.state === 'stalled') continue
      if (now - job.lastByteChangeAt < STALLED_TIMEOUT_MS) continue
      // verifying y committing son estados donde SteamCMD puede pausar bytes
      // momentáneamente sin estar realmente stalled. Permitimos ahí margen extra.
      if (job.state === 'verifying' || job.state === 'committing') continue
      job.state = 'stalled'
      emitProgress(job)
      emit(STEAMCMD_EVENTS.STALLED, {
        appId: job.appId,
        sinceMs: now - job.lastByteChangeAt,
      })
    }
  }, 5_000)
  // Importante: que el detector no mantenga el proceso vivo solo.
  if (typeof _stallInterval.unref === 'function') {
    _stallInterval.unref()
  }
  return _stallInterval
}

// ============================================================
// Job lifecycle
// ============================================================

function startJob(opts: SteamCmdInstallOptions): StartResult {
  // Inicializa el detector lazy (si todavía no). this point no-op si ya estaba vivo.
  getOrInitStallDetector()

  if (jobs.has(opts.appId)) {
    return {
      success: false,
      error: `Ya hay un job activo para ${opts.appId}`,
      errorKey: 'errors.steamcmd.alreadyRunning',
    }
  }

  const binary = getSteamCmdPath()
  if (!binary) {
    return {
      success: false,
      error: 'Binario SteamCMD no encontrado',
      errorKey: 'errors.steamcmd.notFound',
    }
  }

  // Default installDir: ${userDataDir}/Library/${appId}. El main process (H1.2
  // IPC) ya computa este default antes de llegar acá; client-side / tests
  // también caen acá sin necesidad de pasar installDir explícito.
  const resolvedInstallDir = opts.installDir ?? path.join(getUserDataDir(), 'Library', opts.appId)

  // Crear installDir si no existe — SteamCMD requiere que la carpeta exista.
  try {
    if (!fs.existsSync(resolvedInstallDir)) {
      fs.mkdirSync(resolvedInstallDir, { recursive: true })
    }
  } catch (err) {
    const msg = (err as Error).message
    logger.warn(`[steamcmd] no pude crear installDir ${resolvedInstallDir}: ${msg}`, 'steamcmd')
    return {
      success: false,
      error: msg,
      errorKey: 'errors.steamcmd.installDirCreateFailed',
    }
  }

  // buildArgs (parser module) throws si installDir vacío. startJob ya
  // resolvió acá (resolvedInstallDir nunca es vacío), así que este throws
  // solo dispara si getUserDataDir() devolvió '' vacío — error de setup
  // extremo que queremos ver stack.
  const args = buildArgs({
    appId: opts.appId,
    installDir: resolvedInstallDir,
    betaBranch: opts.betaBranch,
    validate: opts.validate,
  })
  logger.info(`[steamcmd] fork para ${opts.appId} → installDir=${resolvedInstallDir} args=${args.join(' ')}`, 'steamcmd')

  let child: ChildProcessWithoutNullStreams
  try {
    child = spawn(binary, args, {
      cwd: resolvedInstallDir,
      env: {
        ...process.env,
        HOME: getHome(),
      },
      windowsHide: true,
      detached: false,
    })
    if (typeof child.unref === 'function') {
      child.unref()
    }
  } catch (err) {
    const msg = (err as Error).message
    logger.warn(`[steamcmd] spawn falló: ${msg}`, 'steamcmd')
    return {
      success: false,
      error: msg,
      errorKey: 'errors.steamcmd.spawnFailed',
    }
  }

  const job: InstallJob = {
    appId: opts.appId,
    installDir: resolvedInstallDir,
    betaBranch: opts.betaBranch,
    pid: child.pid ?? -1,
    child,
    state: 'preparing',
    bytesDownloaded: 0,
    bytesTotal: 0,
    speedSamples: [],
    stderrBuffer: [],
    startedAt: Date.now(),
    finishedAt: undefined,
    lastByteChangeAt: Date.now(),
    lastEmitAt: 0,
    errorMessage: undefined,
    lastEmittedBytes: 0,
    lastEmittedState: 'preparing',
  }
  jobs.set(opts.appId, job)

  // Parseo streaming: cada chunk rompe por líneas y procesa. Buffer residual
  // para líneas que cruzan chunks (SteamCMD a veces manda líneas enormes).
  let stderrChunkBuffer = ''
  child.stderr.setEncoding('utf-8')
  child.stderr.on('data', (chunk: string) => {
    stderrChunkBuffer += chunk
    const lines = stderrChunkBuffer.split(/\r?\n/)
    stderrChunkBuffer = lines.pop() ?? ''
    for (const line of lines) processLine(job, line)
  })

  let stdoutChunkBuffer = ''
  child.stdout.setEncoding('utf-8')
  child.stdout.on('data', (chunk: string) => {
    stdoutChunkBuffer += chunk
    const lines = stdoutChunkBuffer.split(/\r?\n/)
    stdoutChunkBuffer = lines.pop() ?? ''
    for (const line of lines) processLine(job, line)
  })

  let exited = false
  child.on('exit', (code, signal) => {
    if (exited) return
    exited = true
    logger.info(`[steamcmd] ${opts.appId} salió code=${code} signal=${signal ?? 'none'}`, 'steamcmd')
    // Flush residuos de buffer (líneas sin newline final).
    if (stderrChunkBuffer.trim()) processLine(job, stderrChunkBuffer)
    if (stdoutChunkBuffer.trim()) processLine(job, stdoutChunkBuffer)
    stderrChunkBuffer = ''
    stdoutChunkBuffer = ''

    if (job.state === 'done' || job.state === 'failed') {
      emitProgress(job) // Asegurar emit final con finishedAt.
      return
    }
    // SteamCMD a veces termina con todos los bytes OK pero sin imprimir
    // "Success!" (caso conocido con apps grandes). Inferimos:
    if (job.bytesTotal > 0 && job.bytesDownloaded >= job.bytesTotal) {
      finalizeJob(job, 'done')
    } else {
      finalizeJob(
        job,
        'failed',
        `Salida abrupta (code=${code ?? 'null'} signal=${signal ?? 'none'})`,
      )
    }
  })

  child.on('error', (err) => {
    if (exited) return
    exited = true
    logger.warn(`[steamcmd] ${opts.appId} error de proceso: ${err.message}`, 'steamcmd')
    finalizeJob(job, 'failed', err.message)
  })

  emitProgress(job)
  return { success: true, appId: opts.appId, pid: child.pid ?? -1, queued: false }
}

function finalizeJob(
  job: InstallJob,
  finalState: 'done' | 'failed',
  errorMessage?: string,
): void {
  if (job.state === 'done' || job.state === 'failed') return
  job.state = finalState
  job.finishedAt = Date.now()
  if (errorMessage) job.errorMessage = errorMessage
  emitProgress(job)
  emit(
    finalState === 'done' ? STEAMCMD_EVENTS.COMPLETE : STEAMCMD_EVENTS.FAILED,
    {
      appId: job.appId,
      errorMessage: job.errorMessage,
      errorKey: job.errorKey,
      finishedAt: job.finishedAt,
    },
  )
  // Cleanup best-effort.
  try { job.child.kill('SIGTERM') } catch { /* ya salió */ }
  jobs.delete(job.appId)
  drainQueue()
}

export function cancelSteamCmdInstall(appId: string): CancelResult {
  const job = jobs.get(appId)
  if (!job) {
    return { success: false, appId, error: 'No hay un job activo para este appId' }
  }
  finalizeJob(job, 'failed', 'Cancelado por el usuario')
  return { success: true, appId }
}

// ============================================================
// Public API
// ============================================================

/**
 * Inicia una descarga SteamCMD. Si la concurrency está al máximo, encola la
 * llamada y devuelve `{ success: true, queued: true, pid: null }`. La promesa
 * se resuelve cuando realmente arranca (o falla).
 *
 * Para `installDir`, usar un path absoluto bajo control del usuario
 * (e.g. `${LOCALAPPDATA}/Y-core/Library/<installdir>`).
 */
export async function startSteamCmdInstall(opts: SteamCmdInstallOptions): Promise<StartResult> {
  if (!opts.appId || !opts.installDir) {
    logger.warn('[steamcmd] startSteamCmdInstall sin appId o installDir', 'steamcmd')
    return {
      success: false,
      error: 'appId e installDir son requeridos',
      errorKey: 'errors.steamcmd.spawnFailed',
    }
  }

  if (jobs.size >= getMaxConcurrent()) {
    logger.info(
      `[steamcmd] concurrency llena (${jobs.size}/${maxConcurrent}); encolando ${opts.appId}`,
      'steamcmd',
    )
    return new Promise<StartResult>((resolve) => {
      pendingQueue.push({ opts, resolve })
    })
  }
  return startJob(opts)
}

export function getActiveJobs(): SteamCmdProgress[] {
  return Array.from(jobs.values()).map(jobToProgress)
}

export function getActiveJobFor(appId: string): SteamCmdProgress | null {
  const job = jobs.get(appId)
  return job ? jobToProgress(job) : null
}

function jobToProgress(job: InstallJob): SteamCmdProgress {
  const speed = computeSpeed(job)
  return {
    appId: job.appId,
    state: job.state,
    bytesDownloaded: job.bytesDownloaded,
    bytesTotal: job.bytesTotal,
    percent: computePercent(job),
    speedBytesPerSec: speed,
    etaSeconds: computeEta(job, speed),
    stderrTail: job.stderrBuffer.slice(),
    pid: job.pid,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    errorMessage: job.errorMessage,
    errorKey: job.errorKey,
  }
}

/** Total acumulado de bytes descargados por todos los jobs activos. Útil para el dock. */
export function getTotalActiveBytes(): { downloaded: number; total: number; concurrent: number; ceiling: number } {
  let downloaded = 0
  let total = 0
  for (const job of Array.from(jobs.values())) {
    downloaded += job.bytesDownloaded
    total += job.bytesTotal
  }
  return { downloaded, total, concurrent: jobs.size, ceiling: getMaxConcurrent() }
}

/** Limpia todos los jobs activos. Llamado en `app.on('will-quit')` desde main.ts (Hito 2). */
export function shutdownAllSteamCmdJobs(reason: string): void {
  // Bug fix (rev H1.x): limpiar pendingQueue ANTES de iterar jobs. Antes este
  // clear estaba al final, pero finalizeJob() llama a drainQueue() en su tail,
  // y drainQueue promueve entradas del pendingQueue → jobs Map. Resultado:
  // jobs nuevos arrancaban DURANTE el shutdown, generando eventos FAILED
  // espurios y consumiendo ciclos. Limpiamos primero para que drainQueue no
  // tenga nada que drenar.
  pendingQueue.length = 0
  for (const job of Array.from(jobs.values())) {
    finalizeJob(job, 'failed', reason)
  }
  if (_stallInterval) {
    clearInterval(_stallInterval)
    _stallInterval = null
  }
}
