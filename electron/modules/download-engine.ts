// ============================================================================
// electron/modules/download-engine.ts
// ----------------------------------------------------------------------------
// Motor de descargas v2 — Core.
//
// Responsabilidades:
//   1. Gestionar cola de descargas con prioridades
//   2. Control de concurrencia (máximo N descargas simultáneas)
//   3. Pausar/reanudar/cancelar tareas individuales
//   4. Cálculo de velocidad y ETA en tiempo real
//   5. Reintentos con backoff exponencial
//   6. Verificación SHA1 post-descarga
//   7. Persistencia de la cola en disco
//   8. Emisión de eventos IPC para la UI
//
// Arquitectura:
//   - DownloadEngine: clase principal, singleton en main process
//   - InternalTask: estado interno de cada descarga
//   - SpeedTracker: cálculo de velocidad ventaneado
//   - RetryManager: lógica de reintentos
//   - QueuePersister: guarda/carga la cola de disco
// ============================================================================

import path from 'path'
import fs from 'fs'
import crypto from 'crypto'
import { logger } from '../logger'
import { emitToRenderers } from './electron-context'
import {
  DownloadPriority,
  type DownloadSource,
  type DownloadState,
  type DownloadTask,
  type DownloadProgressPayload,
  type CreateTaskOptions,
  type DownloadEngineOptions,
  type EngineStatus,
} from './download-engine-types'

// ============================================================================
// Constantes
// ============================================================================

const DEFAULT_MAX_CONCURRENT = 3
const SPEED_WINDOW_MS = 10_000 // ventana de 10s para promedio de velocidad
const RETRY_BASE_DELAY_MS = 2_000 // 2s base para backoff
const RETRY_MAX_DELAY_MS = 120_000 // máximo 2min entre reintentos
const PROGRESS_EMIT_MIN_DELTA_MS = 250 // mínimo 250ms entre emits
const PROGRESS_EMIT_MIN_DELTA_BYTES = 64 * 1024 // mínimo 64KB para emit
const CONNECTING_TIMEOUT_MS = 30_000 // timeout para estado 'connecting' (30s)
const HEARTBEAT_INTERVAL_MS = 15_000 // clean up cada 15s
const QUEUE_FILE = 'download-queue.json'
const HISTORY_FILE = 'download-history.json'
const MAX_HISTORY = 50

// ============================================================================
// IPC event names
// ============================================================================

export const DOWNLOAD_EVENTS = {
  PROGRESS: 'download:progress',
  COMPLETED: 'download:completed',
  FAILED: 'download:failed',
  QUEUE_CHANGED: 'download:queue-changed',
  ENGINE_STATUS: 'download:engine-status',
} as const

// ============================================================================
// SpeedTracker
// ============================================================================

interface SpeedSample {
  timestamp: number
  bytes: number
}

class SpeedTracker {
  private samples: SpeedSample[] = []

  addSample(bytes: number): void {
    const now = Date.now()
    this.samples.push({ timestamp: now, bytes })
    // Podar muestras fuera de la ventana
    const cutoff = now - SPEED_WINDOW_MS
    while (this.samples.length > 0 && this.samples[0].timestamp < cutoff) {
      this.samples.shift()
    }
  }

  getSpeed(): number {
    if (this.samples.length < 2) return 0
    const first = this.samples[0]
    const last = this.samples[this.samples.length - 1]
    const dtSec = (last.timestamp - first.timestamp) / 1000
    if (dtSec < 0.5) return 0
    const bytes = last.bytes - first.bytes
    return bytes > 0 ? bytes / dtSec : 0
  }

  getPeak(): number {
    if (this.samples.length < 2) return 0
    let peak = 0
    for (let i = 1; i < this.samples.length; i++) {
      const dtSec = (this.samples[i].timestamp - this.samples[i - 1].timestamp) / 1000
      if (dtSec < 0.1) continue
      const bytes = this.samples[i].bytes - this.samples[i - 1].bytes
      const speed = bytes / dtSec
      if (speed > peak) peak = speed
    }
    return peak
  }

  reset(): void {
    this.samples = []
  }
}

// ============================================================================
// RetryManager
// ============================================================================

class RetryManager {
  private attemptCounts = new Map<string, number>()

  getAttempt(taskId: string): number {
    return this.attemptCounts.get(taskId) ?? 0
  }

  increment(taskId: string): number {
    const next = this.getAttempt(taskId) + 1
    this.attemptCounts.set(taskId, next)
    return next
  }

  getDelay(taskId: string): number {
    const attempt = this.getAttempt(taskId)
    // Exponential backoff: 2^attempt * base, capped at max
    const delay = Math.min(
      RETRY_BASE_DELAY_MS * Math.pow(2, attempt),
      RETRY_MAX_DELAY_MS,
    )
    // Add jitter: ±25%
    const jitter = delay * 0.25 * (Math.random() * 2 - 1)
    return Math.round(delay + jitter)
  }

  reset(taskId: string): void {
    this.attemptCounts.delete(taskId)
  }

  clear(): void {
    this.attemptCounts.clear()
  }
}

// ============================================================================
// SHA1 Verifier
// ============================================================================

export interface VerificationResult {
  success: boolean
  verifiedFiles: number
  totalFiles: number
  failedFiles: { path: string; expected: string; actual: string }[]
}

class Sha1Verifier {
  /**
   * Verifica un archivo contra su hash SHA1 esperado.
   * Retorna true si coincide.
   */
  verifyFile(filePath: string, expectedSha1: Buffer): boolean {
    try {
      if (!fs.existsSync(filePath)) return false
      const data = fs.readFileSync(filePath)
      const actual = crypto.createHash('sha1').update(data).digest()
      return actual.equals(expectedSha1)
    } catch {
      return false
    }
  }

  /**
   * Verifica múltiples archivos. Retorna resumen.
   */
  verifyFiles(
    files: { path: string; sha1: Buffer }[],
    onProgress?: (verified: number, total: number) => void,
  ): VerificationResult {
    const failedFiles: { path: string; expected: string; actual: string }[] = []
    let verified = 0

    for (const file of files) {
      const ok = this.verifyFile(file.path, file.sha1)
      if (!ok) {
        let actualHex = '(not found)'
        try {
          if (fs.existsSync(file.path)) {
            const data = fs.readFileSync(file.path)
            actualHex = crypto.createHash('sha1').update(data).digest('hex')
          }
        } catch { /* ignore */ }
        failedFiles.push({
          path: file.path,
          expected: file.sha1.toString('hex'),
          actual: actualHex,
        })
      }
      verified++
      onProgress?.(verified, files.length)
    }

    return {
      success: failedFiles.length === 0,
      verifiedFiles: verified,
      totalFiles: files.length,
      failedFiles,
    }
  }
}

// ============================================================================
// Queue Persister
// ============================================================================

class QueuePersister {
  private queuePath: string
  private historyPath: string

  constructor(dataDir: string) {
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true })
    }
    this.queuePath = path.join(dataDir, QUEUE_FILE)
    this.historyPath = path.join(dataDir, HISTORY_FILE)
  }

  saveQueue(tasks: DownloadTask[]): void {
    try {
      const serializable = tasks.map(t => ({
        ...t,
        // Excluir campos no serializables (si los hay)
      }))
      fs.writeFileSync(this.queuePath, JSON.stringify(serializable, null, 2), 'utf-8')
    } catch (err) {
      logger.warn(`[download-engine] failed to persist queue: ${(err as Error).message}`, 'download-engine')
    }
  }

  loadQueue(): DownloadTask[] {
    try {
      if (!fs.existsSync(this.queuePath)) return []
      const raw = fs.readFileSync(this.queuePath, 'utf-8')
      return JSON.parse(raw) as DownloadTask[]
    } catch (err) {
      logger.warn(`[download-engine] failed to load queue: ${(err as Error).message}`, 'download-engine')
      return []
    }
  }

  saveHistory(tasks: DownloadTask[]): void {
    try {
      fs.writeFileSync(this.historyPath, JSON.stringify(tasks.slice(0, MAX_HISTORY), null, 2), 'utf-8')
    } catch (err) {
      logger.warn(`[download-engine] failed to persist history: ${(err as Error).message}`, 'download-engine')
    }
  }

  loadHistory(): DownloadTask[] {
    try {
      if (!fs.existsSync(this.historyPath)) return []
      const raw = fs.readFileSync(this.historyPath, 'utf-8')
      return JSON.parse(raw) as DownloadTask[]
    } catch (err) {
      logger.warn(`[download-engine] failed to load history: ${(err as Error).message}`, 'download-engine')
      return []
    }
  }
}

// ============================================================================
// Internal Task
// ============================================================================

interface InternalTask {
  task: DownloadTask
  speedTracker: SpeedTracker
  abortController: AbortController | null
  /** Timestamp del último emit de progreso */
  lastEmitAt: number
  /** Bytes en el último emit */
  lastEmittedBytes: number
  /** Promise actual del worker (si está activo) */
  workerPromise: Promise<void> | null
  /** Función para limpiar recursos del worker */
  cleanup: (() => void) | null
}

// ============================================================================
// DownloadEngine
// ============================================================================

export class DownloadEngine {
  private connectingTimeouts = new Map<string, ReturnType<typeof setTimeout>>()
  private tasks: Map<string, InternalTask> = new Map()
  private queue: DownloadTask[] = [] // persisted queue (no incluye active/completed)
  private history: DownloadTask[] = []
  private maxConcurrent: number
  private persister: QueuePersister
  private retryManager: RetryManager = new RetryManager()
  private sha1Verifier: Sha1Verifier = new Sha1Verifier()
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private _isPaused = false
  private currentTaskId: string | null = null

  constructor(opts: DownloadEngineOptions = {}) {
    this.maxConcurrent = opts.maxConcurrent ?? DEFAULT_MAX_CONCURRENT
    const dataDir = opts.dataDir ?? path.join(
      (typeof process !== 'undefined' && process.env.LOCALAPPDATA) || '.',
      'Y-core',
    )
    this.persister = new QueuePersister(dataDir)

    // Cargar estado persistido
    this.queue = this.persister.loadQueue()
    this.history = this.persister.loadHistory()

    // ── Reconstruir `this.tasks` Map desde las dos fuentes persistidas ──
    // Este Map es el lookup primario que `evaluatePrereqs` y los métodos
    // públicos (`getAllTasks`, `getActiveTasks`, `getStatus`) consultan.
    // Sin este repopulado, la cola persistida quedaría INVISIBLE al motor
    // tras un reinicio de la app — p. ej. tareas GoldSrc esperando HL1
    // quedarían huérfanas en `this.queue` sin que nadie las procese.
    //
    // Decisión: las tareas en `this.queue` (no completadas/fallidas) se
    // reconstruyen como `InternalTask` mínimo sin AbortController ni worker
    // (la app acaba de arrancar — no hay worker en vuelo). Las tareas en
    // `this.history` también se reconstruyen para que `lookupPrereqSnapshot`
    // pueda encontrarlas en el snapshot fallback (Fix #1).
    for (const task of this.queue) {
      if (task.state === 'queued' || task.state === 'paused') {
        // Mantener estado
      } else {
        task.state = 'queued'
      }
      task.lastUpdatedAt = Date.now()
      this.tasks.set(task.id, {
        task,
        speedTracker: new SpeedTracker(),
        abortController: null,
        lastEmitAt: 0,
        lastEmittedBytes: 0,
        workerPromise: null,
        cleanup: null,
      })
    }
    // También reconstruir el historial en el Map (sin worker/cleanup, solo
    // como snapshot para que `lookupPrereqSnapshot` lo lea directo).
    // Usamos la misma entrada pero con `cleanup: () => unregister()` no
    // necesario aquí. El Map guarda referencias, no snapshots.
    for (const task of this.history) {
      // No sobreescribir si por algún motivo ya estaba en this.tasks
      if (!this.tasks.has(task.id)) {
        this.tasks.set(task.id, {
          task,
          speedTracker: new SpeedTracker(),
          abortController: null,
          lastEmitAt: 0,
          lastEmittedBytes: 0,
          workerPromise: null,
          cleanup: null,
        })
      }
    }

    // Re-evaluar prerrequisitos inmediatamente: si el motor acaba de arrancar
    // y hay tareas en cola con `prereqTaskId` apuntando a entries de history
    // (HL1 ya completado antes del crash), esto las desbloquea para que
    // `tryProcessQueue` las procese en el siguiente tick.
    this.evaluatePrereqs()

    // Arrancar la cola. Sin esto, una tarea persistente con `prereqState:
    // 'satisfied'` (desbloqueada por el evaluatePrereqs de arriba) o cualquier
    // tarea `queued` tras un reinicio de la app queda inerte hasta que algo
    // externo llame `startTask` / `setPriority` / etc. Llamar aquí mantiene
    // la promesa de "el motor sigue trabajando al reiniciar la app".
    this.tryProcessQueue()

    // Iniciar heartbeat
    this.heartbeatTimer = setInterval(() => this.heartbeat(), HEARTBEAT_INTERVAL_MS)
    if (typeof this.heartbeatTimer.unref === 'function') {
      this.heartbeatTimer.unref()
    }

    logger.info(
      `[download-engine] initialized: maxConcurrent=${this.maxConcurrent}, queued=${this.queue.length}, history=${this.history.length}`,
      'download-engine',
    )
  }

  // ========================================================================
  // Public API
  // ========================================================================

  /** Crea una nueva tarea y la agrega a la cola */
  createTask(opts: CreateTaskOptions): DownloadTask {
    const id = `${opts.appId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const now = Date.now()

    const task: DownloadTask = {
      id,
      appId: opts.appId,
      name: opts.name,
      source: opts.source ?? 'steamcmd',
      state: opts.prereqTaskId ? 'queued' : 'queued',
      priority: opts.priority ?? DownloadPriority.NORMAL,
      bytesDownloaded: 0,
      bytesTotal: 0,
      speedBytesPerSec: 0,
      etaSeconds: null,
      percent: 0,
      installDir: opts.installDir ?? '',
      depotKeys: opts.depotKeys,
      manifestFiles: opts.manifestFiles,
      directUrl: opts.directUrl,
      localPath: opts.localPath,
      retryCount: 0,
      maxRetries: opts.maxRetries ?? 3,
      createdAt: now,
      lastUpdatedAt: now,
      peakSpeed: 0,
      elapsedSec: 0,
      bytesVerified: 0,
      filesVerified: 0,
      filesTotal: 0,
      prereqTaskId: opts.prereqTaskId,
      // Estado derivado del prerrequisito. Se recalcula en `evaluatePrereqs`
      // cada vez que cambia la cola. Si el prereqTaskId apunta a una tarea
      // inexistente aún, queda como 'pending' (caso normal de creación
      // simultánea de prereq + dependiente en una sola llamada IPC).
      prereqState: opts.prereqTaskId ? 'pending' : undefined,
    }

    const internal: InternalTask = {
      task,
      speedTracker: new SpeedTracker(),
      abortController: null,
      lastEmitAt: 0,
      lastEmittedBytes: 0,
      workerPromise: null,
      cleanup: null,
    }

    this.tasks.set(id, internal)
    this.queue.push(task)
    this.persister.saveQueue(this.queue)
    this.emitProgress(task)
    this.notifyQueueChanged()
    // Re-evaluar prerrequisitos: si esta tarea es el prereq de otras tareas
    // pendientes, el cambio desbloquea o bloquea a las dependientes. También
    // se actualiza el estado de los dependientes de esta tarea si los tiene.
    this.evaluatePrereqs()
    this.tryProcessQueue()

    logger.info(
      `[download-engine] task created: ${task.name} (${task.appId}) [${task.source}]${task.prereqTaskId ? ' (prereq-pending)' : ''}`,
      'download-engine',
    )

    return task
  }

  /**
   * Recalcula el estado de prerrequisito de cada tarea pendiente y propaga
   * el bloqueo cuando un prereq termina en estado terminal fallido.
   *
   * Llamado después de cada cambio en la cola (createTask / failTask /
   * completeTask / cancelTask). Recorre todas las tareas con prereqTaskId,
   * mira el estado de la tarea referenciada, y:
   *   • prereq `completed`  → task.prereqState = 'satisfied' (la desbloquea)
   *   • prereq en cola/working → task.prereqState = 'pending'
   *   • prereq `failed`/`cancelled`/`blocked-prereq` → task.prereqState =
   *     'failed' y si está en `queued` se mueve a `blocked-prereq` (state
   *     terminal de bloqueo, no se reintenta).
   *
   * Lookup exhaustivo: si el prereq no está en `this.tasks` Map (caso normal
   * tras `clearCompleted` o tras reinicio de la app, donde el prereq ya está
   * en `this.history`), se busca en el historial:
   *   • prereq en historial con state `completed` → `satisfied`
   *   • prereq en historial con state `failed`/`cancelled` → `failed`
   *   • prereq en historial como `blocked-prereq` → `failed`
   * Si no está en ninguno, se trata como `pending` (corrupto / cola ilegible).
   *
   * No emite por cada cambio: los afectados se emiten via notifyQueueChanged.
   */
  private evaluatePrereqs(): void {
    let changed = false
    for (const internal of this.tasks.values()) {
      const task = internal.task
      if (!task.prereqTaskId) continue

      // ── Lookup del prereq: tasks Map primero, luego history ───────────
      const prereqSnapshot = this.lookupPrereqSnapshot(task.prereqTaskId)
      if (!prereqSnapshot) {
        // Prereq desconocido (no está en tasks ni en history). Marcar como
        // pending; el usuario debería limpiar la cola si la referencia es
        // huérfana o reinstalar.
        if (task.prereqState !== 'pending') {
          task.prereqState = 'pending'
          changed = true
        }
        continue
      }

      let next: 'pending' | 'satisfied' | 'failed'
      if (prereqSnapshot.state === 'completed') next = 'satisfied'
      else if (prereqSnapshot.state === 'failed' || prereqSnapshot.state === 'cancelled' || prereqSnapshot.state === 'blocked-prereq') next = 'failed'
      else next = 'pending'

      if (task.prereqState !== next) {
        task.prereqState = next
        changed = true
      }

      // Si el prereq falló y la tarea todavía está en 'queued', la marcamos
      // como 'blocked-prereq' — un estado terminal que no se reintenta.
      // Si ya está 'blocked-prereq' o completed/failed/etc., no tocamos.
      if (next === 'failed' && task.state === 'queued') {
        task.state = 'blocked-prereq'
        task.errorMessage = `Prerequisite appId=${prereqSnapshot.appId} terminó en estado '${prereqSnapshot.state}'`
        task.errorKey = 'prereq.failed'
        task.lastUpdatedAt = Date.now()
        this.persister.saveQueue(this.queue)
        this.emitProgress(task)
        changed = true
        logger.warn(
          `[download-engine] task ${task.name} (${task.appId}) blocked by failed prereq ${prereqSnapshot.appId} (state=${prereqSnapshot.state})`,
          'download-engine',
        )
      } else if (next === 'satisfied' && task.state === 'blocked-prereq') {
        // El prereq volvió a satisfacerse (ej. usuario reinstala HL1).
        // Desbloqueamos para que pueda procesarse.
        task.state = 'queued'
        task.errorMessage = undefined
        task.errorKey = undefined
        task.lastUpdatedAt = Date.now()
        this.persister.saveQueue(this.queue)
        this.emitProgress(task)
        changed = true
        logger.info(
          `[download-engine] task ${task.name} (${task.appId}) unblocked — prereq satisfied again`,
          'download-engine',
        )
      }
    }
    if (changed) {
      this.notifyQueueChanged()
    }
  }

  /**
   * Snapshot-like view of a task for prereq evaluation — does NOT keep a
   * reference to InternalTask so it's safe to call after the task has been
   * removed from `this.tasks` (e.g. moved to history or deleted).
   */
  private lookupPrereqSnapshot(prereqTaskId: string): { state: DownloadState; appId: string } | null {
    const live = this.tasks.get(prereqTaskId)?.task
    if (live) return { state: live.state, appId: live.appId }
    const hist = this.history.find((t) => t.id === prereqTaskId)
    if (hist) return { state: hist.state, appId: hist.appId }
    return null
  }

  /** Obtiene una tarea por ID */
  getTask(taskId: string): DownloadTask | undefined {
    return this.tasks.get(taskId)?.task
  }

  /** Obtiene todas las tareas activas (no completed/failed/cancelled) */
  getActiveTasks(): DownloadTask[] {
    const active: DownloadTask[] = []
    for (const internal of this.tasks.values()) {
      if (internal.task.state !== 'completed' && internal.task.state !== 'failed' && internal.task.state !== 'cancelled') {
        active.push(internal.task)
      }
    }
    return active
  }

  /** Obtiene la cola completa (incluye activas + en cola) */
  getAllTasks(): DownloadTask[] {
    return Array.from(this.tasks.values()).map(i => i.task)
  }

  /** Obtiene el historial */
  getHistory(): DownloadTask[] {
    return [...this.history]
  }

  /** Obtiene estado resumido del engine */
  getStatus(): EngineStatus {
    let active = 0
    let queued = 0
    let completed = 0
    let failed = 0
    let totalBytesDownloaded = 0
    let totalBytesTotal = 0
    let combinedSpeed = 0

    for (const internal of this.tasks.values()) {
      const t = internal.task
      if (t.state === 'downloading' || t.state === 'verifying' || t.state === 'preparing' || t.state === 'connecting') {
        active++
        combinedSpeed += t.speedBytesPerSec
      } else if (t.state === 'queued' || t.state === 'paused') {
        queued++
      } else if (t.state === 'completed') {
        completed++
      } else if (t.state === 'failed') {
        failed++
      }
      totalBytesDownloaded += t.bytesDownloaded
      totalBytesTotal += t.bytesTotal
    }

    return {
      active,
      queued,
      completed,
      failed,
      totalBytesDownloaded,
      totalBytesTotal,
      combinedSpeed,
      maxConcurrent: this.maxConcurrent,
      isPaused: this._isPaused,
    }
  }

  /** Inicia/Reanuda una tarea */
  async startTask(taskId: string): Promise<boolean> {
    const internal = this.tasks.get(taskId)
    if (!internal) return false
    if (internal.task.state === 'downloading' || internal.task.state === 'verifying') return false

    internal.task.state = 'queued'
    internal.task.lastUpdatedAt = Date.now()
    internal.speedTracker.reset()
    this.persister.saveQueue(this.queue)
    this.emitProgress(internal.task)
    this.notifyQueueChanged()
    this.tryProcessQueue()
    return true
  }

  /** Pausa una tarea */
  pauseTask(taskId: string): boolean {
    const internal = this.tasks.get(taskId)
    if (!internal) return false
    if (internal.task.state !== 'downloading' && internal.task.state !== 'queued' && internal.task.state !== 'preparing') return false

    // Cancelar worker si está activo
    if (internal.abortController) {
      internal.abortController.abort()
      internal.abortController = null
    }

    internal.task.state = 'paused'
    internal.task.lastUpdatedAt = Date.now()
    internal.cleanup?.()
    internal.cleanup = null
    internal.workerPromise = null
    this.persister.saveQueue(this.queue)
    this.emitProgress(internal.task)
    this.notifyQueueChanged()

    logger.info(`[download-engine] task paused: ${internal.task.name} (${internal.task.appId})`, 'download-engine')
    return true
  }

  /** Cancela una tarea */
  cancelTask(taskId: string): boolean {
    const internal = this.tasks.get(taskId)
    if (!internal) return false
    if (internal.task.state === 'completed' || internal.task.state === 'cancelled') return false

    if (internal.abortController) {
      internal.abortController.abort()
      internal.abortController = null
    }
    internal.cleanup?.()
    internal.cleanup = null
    internal.workerPromise = null

    internal.task.state = 'cancelled'
    internal.task.lastUpdatedAt = Date.now()
    this.queue = this.queue.filter(t => t.id !== taskId)
    this.moveToHistory(internal.task)
    this.persister.saveQueue(this.queue)
    this.emitProgress(internal.task)
    // Cancelar una tarea prereq es equivalente a que falle — propagar a
    // las tareas dependientes para que pasen a `blocked-prereq`.
    this.evaluatePrereqs()
    this.notifyQueueChanged()

    logger.info(`[download-engine] task cancelled: ${internal.task.name} (${internal.task.appId})`, 'download-engine')
    return true
  }

  /** Reordena la cola: mueve una tarea a una posición */
  reorderTask(taskId: string, newIndex: number): boolean {
    const idx = this.queue.findIndex(t => t.id === taskId)
    if (idx === -1) return false
    const [task] = this.queue.splice(idx, 1)
    const insertAt = Math.max(0, Math.min(newIndex, this.queue.length))
    this.queue.splice(insertAt, 0, task)
    this.persister.saveQueue(this.queue)
    this.notifyQueueChanged()
    return true
  }

  /** Cambia la prioridad de una tarea */
  setPriority(taskId: string, priority: DownloadPriority): boolean {
    const internal = this.tasks.get(taskId)
    if (!internal) return false
    internal.task.priority = priority
    internal.task.lastUpdatedAt = Date.now()
    this.persister.saveQueue(this.queue)
    this.notifyQueueChanged()
    this.tryProcessQueue()
    return true
  }

  /** Pausa/reanuda todo el engine */
  setPaused(paused: boolean): void {
    this._isPaused = paused
    if (paused) {
      // Pausar todas las tareas activas
      for (const internal of this.tasks.values()) {
        if (internal.task.state === 'downloading' || internal.task.state === 'preparing' || internal.task.state === 'connecting') {
          this.pauseTask(internal.task.id)
        }
      }
    } else {
      this.tryProcessQueue()
    }
    this.emitEngineStatus()
  }

  isPaused(): boolean {
    return this._isPaused
  }

  /** Limpia el historial */
  clearHistory(): void {
    this.history = []
    this.persister.saveHistory([])
  }

  /** Limpia tareas completadas/fallidas/canceladas de la memoria */
  clearCompleted(): void {
    for (const internal of Array.from(this.tasks.values())) {
      if (internal.task.state === 'completed' || internal.task.state === 'failed' || internal.task.state === 'cancelled') {
        this.tasks.delete(internal.task.id)
      }
    }
    this.queue = this.queue.filter(t =>
      t.state !== 'completed' && t.state !== 'failed' && t.state !== 'cancelled',
    )
    this.persister.saveQueue(this.queue)
    this.notifyQueueChanged()
  }

  /** Limpia todo y cierra el engine */
  shutdown(): void {
    for (const internal of this.tasks.values()) {
      if (internal.abortController) {
        internal.abortController.abort()
      }
      internal.cleanup?.()
    }
    // Limpiar todos los timeouts de conexión pendientes
    for (const [, timer] of this.connectingTimeouts) {
      clearTimeout(timer)
    }
    this.connectingTimeouts.clear()

    this.tasks.clear()
    this.queue = []
    this.retryManager.clear()
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
    this.persister.saveQueue([])
    logger.info('[download-engine] shutdown complete', 'download-engine')
  }

  /** Actualiza progreso de una tarea (llamado por los workers) */
  updateProgress(
    taskId: string,
    update: Partial<Pick<DownloadTask,
      | 'bytesDownloaded'
      | 'bytesTotal'
      | 'state'
      | 'errorMessage'
      | 'errorKey'
      | 'filesVerified'
      | 'filesTotal'
      | 'bytesVerified'
    >>,
  ): void {
    const internal = this.tasks.get(taskId)
    if (!internal) return

    const task = internal.task
    const prevBytes = task.bytesDownloaded

    if (update.bytesDownloaded !== undefined) task.bytesDownloaded = update.bytesDownloaded
    if (update.bytesTotal !== undefined) task.bytesTotal = update.bytesTotal
    if (update.state !== undefined) task.state = update.state
    if (update.errorMessage !== undefined) task.errorMessage = update.errorMessage
    if (update.errorKey !== undefined) task.errorKey = update.errorKey
    if (update.filesVerified !== undefined) task.filesVerified = update.filesVerified
    if (update.filesTotal !== undefined) task.filesTotal = update.filesTotal
    if (update.bytesVerified !== undefined) task.bytesVerified = update.bytesVerified

    task.lastUpdatedAt = Date.now()

    // Track velocidad
    if (task.bytesDownloaded > prevBytes) {
      internal.speedTracker.addSample(task.bytesDownloaded)
      task.speedBytesPerSec = internal.speedTracker.getSpeed()
      const peak = internal.speedTracker.getPeak()
      if (peak > task.peakSpeed) task.peakSpeed = peak
    }

    // Calcular ETA
    if (task.speedBytesPerSec > 0 && task.bytesTotal > 0) {
      const remaining = task.bytesTotal - task.bytesDownloaded
      task.etaSeconds = remaining > 0 ? remaining / task.speedBytesPerSec : 0
    } else {
      task.etaSeconds = null
    }

    // Calcular porcentaje
    if (task.bytesTotal > 0) {
      task.percent = Math.min(100, (task.bytesDownloaded / task.bytesTotal) * 100)
    }

    // Calcular elapsed
    if (task.startedAt) {
      task.elapsedSec = Math.floor((Date.now() - task.startedAt) / 1000)
    }

    // Emit si hay cambio significativo
    if (this.shouldEmit(internal)) {
      internal.lastEmitAt = Date.now()
      internal.lastEmittedBytes = task.bytesDownloaded
      this.emitProgress(task)

      // Si cambió de estado, emitir evento específico
      if (update.state === 'completed') {
        this.emitCompleted(task)
        this.moveToHistory(task)
        this.queue = this.queue.filter(t => t.id !== taskId)
        this.persister.saveQueue(this.queue)
        // Esta tarea podría ser el prerrequisito de otras — propagar.
        this.evaluatePrereqs()
        this.tryProcessQueue()
      } else if (update.state === 'failed') {
        this.emitFailed(task)
        this.moveToHistory(task)
        this.queue = this.queue.filter(t => t.id !== taskId)
        this.persister.saveQueue(this.queue)
        this.evaluatePrereqs()
        this.tryProcessQueue()
      }
    }
  }

  /** Marca una tarea como completada */
  completeTask(taskId: string, shaResult?: VerificationResult): void {
    const internal = this.tasks.get(taskId)
    if (!internal) return

    internal.task.state = 'completed'
    internal.task.completedAt = Date.now()
    internal.task.lastUpdatedAt = Date.now()
    internal.task.percent = 100
    internal.task.bytesVerified = shaResult?.verifiedFiles ?? 0
    internal.task.filesVerified = shaResult?.verifiedFiles ?? 0
    internal.task.filesTotal = shaResult?.totalFiles ?? 0

    this.emitProgress(internal.task)
    this.emitCompleted(internal.task)
    this.moveToHistory(internal.task)
    this.queue = this.queue.filter(t => t.id !== taskId)
    this.persister.saveQueue(this.queue)
    // Esta tarea podría ser el prerrequisito de otras tareas pendientes —
    // re-evaluar antes de intentar procesar la siguiente tanda para que las
    // dependientes se desbloqueen si corresponde.
    this.evaluatePrereqs()
    this.tryProcessQueue()
    this.notifyQueueChanged()

    logger.info(
      `[download-engine] task completed: ${internal.task.name} (${internal.task.appId}) — ${internal.task.bytesDownloaded} bytes in ${internal.task.elapsedSec}s`,
      'download-engine',
    )
  }

  /** Marca una tarea como fallida */
  failTask(taskId: string, error: string, errorKey?: string): void {
    const internal = this.tasks.get(taskId)
    if (!internal) return

    internal.task.state = 'failed'
    internal.task.errorMessage = error
    internal.task.errorKey = errorKey
    internal.task.lastUpdatedAt = Date.now()

    this.emitProgress(internal.task)
    this.emitFailed(internal.task)
    this.moveToHistory(internal.task)
    this.queue = this.queue.filter(t => t.id !== taskId)
    this.persister.saveQueue(this.queue)
    // Esta tarea podría ser el prerrequisito de otras tareas pendientes —
    // propagar el estado (sus dependientes deben pasar a `blocked-prereq`).
    this.evaluatePrereqs()
    this.tryProcessQueue()
    this.notifyQueueChanged()

    logger.warn(
      `[download-engine] task failed: ${internal.task.name} (${internal.task.appId}) — ${error}`,
      'download-engine',
    )
  }

  // ========================================================================
  // Workers (simulados por ahora - la integración real viene después)
  // ========================================================================

  /** Registra un worker para un tipo de fuente */
  private workerFactories = new Map<DownloadSource, (task: DownloadTask, signal: AbortSignal) => Promise<void>>()

  registerWorker(
    source: DownloadSource,
    factory: (task: DownloadTask, signal: AbortSignal) => Promise<void>,
  ): void {
    this.workerFactories.set(source, factory)
  }

  // ========================================================================
  // Internals
  // ========================================================================

  private tryProcessQueue(): void {
    if (this._isPaused) return

    // Contar descargas activas
    let activeCount = 0
    for (const internal of this.tasks.values()) {
      if (internal.task.state === 'downloading' || internal.task.state === 'verifying' || internal.task.state === 'preparing' || internal.task.state === 'connecting') {
        activeCount++
      }
    }

    if (activeCount >= this.maxConcurrent) return

    // Ordenar cola por prioridad (mayor primero) y luego por creación
    const sorted = [...this.queue]
      .filter(t => t.state === 'queued')
      .sort((a, b) => {
        if (b.priority !== a.priority) return b.priority - a.priority
        return a.createdAt - b.createdAt
      })

    for (const task of sorted) {
      if (activeCount >= this.maxConcurrent) break

      const internal = this.tasks.get(task.id)
      if (!internal) continue

      // Saltar tareas con prereq no satisfecho. El evaluador de prereqs
      // mantiene `task.prereqState` actualizado — si está en 'pending',
      // la tarea espera. Si está en 'failed', la tarea ya estaría en
      // estado 'blocked-prereq' y filtrada arriba.
      if (task.prereqTaskId && task.prereqState !== 'satisfied') {
        continue
      }

      // Iniciar la tarea
      this.startInternalTask(internal)
      activeCount++
    }
  }

  private async startInternalTask(internal: InternalTask): Promise<void> {
    const task = internal.task
    task.state = 'preparing'
    task.startedAt = Date.now()
    task.lastUpdatedAt = Date.now()
    internal.lastEmitAt = 0
    internal.lastEmittedBytes = 0
    internal.abortController = new AbortController()

    this.emitProgress(task)
    this.notifyQueueChanged()

    const workerFactory = this.workerFactories.get(task.source)
    if (!workerFactory) {
      this.failTask(task.id, `No worker registered for source: ${task.source}`)
      return
    }

    internal.workerPromise = (async () => {
      let connectTimer: ReturnType<typeof setTimeout> | undefined

      try {
        task.state = 'connecting'
        this.emitProgress(task)

        // ── Timeout para 'connecting' ──────────────────────────────────────
        // Si el worker no sale del estado 'connecting' dentro del timeout,
        // se rechaza automáticamente para que la tarea no quede colgada para
        // siempre. Esto resuelve: "esta conectando hace rato pero no pasa nada".
        const connectingTimeout = new Promise<void>((_, reject) => {
          connectTimer = setTimeout(() => {
            reject(new Error(`Connection timed out after ${CONNECTING_TIMEOUT_MS / 1000}s`))
          }, CONNECTING_TIMEOUT_MS)
        })

        // Race: el worker tiene CONNECTING_TIMEOUT_MS para salir de 'connecting'
        await Promise.race([
          workerFactory(task, internal.abortController!.signal),
          connectingTimeout,
        ])

        // Limpiar timeout si el worker progresó
        if (connectTimer) {
          clearTimeout(connectTimer)
        }
      } catch (err: any) {
        // Limpiar timeout
        if (connectTimer) {
          clearTimeout(connectTimer)
        }

        if (err.name === 'AbortError') {
          // Cancelación voluntaria, no error
          return
        }
        // Reintentar si corresponde
        const attempt = this.retryManager.increment(task.id)
        if (attempt < task.maxRetries && !internal.abortController?.signal.aborted) {
          const delay = this.retryManager.getDelay(task.id)
          task.state = 'queued'
          task.retryCount = attempt
          task.errorMessage = `Retry ${attempt}/${task.maxRetries}: ${err.message}`
          task.lastUpdatedAt = Date.now()
          this.emitProgress(task)
          this.notifyQueueChanged()

          logger.warn(
            `[download-engine] task ${task.name} failed, retry ${attempt}/${task.maxRetries} in ${delay}ms: ${err.message}`,
            'download-engine',
          )

          await new Promise(resolve => setTimeout(resolve, delay))
          if (!internal.abortController?.signal.aborted) {
            this.startInternalTask(internal)
          }
        } else {
          this.failTask(task.id, err.message)
        }
      }
    })()

    await internal.workerPromise
  }

  private shouldEmit(internal: InternalTask): boolean {
    const now = Date.now()
    if (now - internal.lastEmitAt >= PROGRESS_EMIT_MIN_DELTA_MS) return true
    if (Math.abs(internal.task.bytesDownloaded - internal.lastEmittedBytes) >= PROGRESS_EMIT_MIN_DELTA_BYTES) return true
    return false
  }

  private emitProgress(task: DownloadTask): void {
    const payload: DownloadProgressPayload = {
      taskId: task.id,
      appId: task.appId,
      name: task.name,
      state: task.state,
      bytesDownloaded: task.bytesDownloaded,
      bytesTotal: task.bytesTotal,
      speedBytesPerSec: task.speedBytesPerSec,
      etaSeconds: task.etaSeconds,
      percent: task.percent,
      errorMessage: task.errorMessage,
      errorKey: task.errorKey,
    }
    emitToRenderers(DOWNLOAD_EVENTS.PROGRESS, payload)
  }

  private emitCompleted(task: DownloadTask): void {
    emitToRenderers(DOWNLOAD_EVENTS.COMPLETED, {
      taskId: task.id,
      appId: task.appId,
      name: task.name,
      bytesDownloaded: task.bytesDownloaded,
      elapsedSec: task.elapsedSec,
    })
  }

  private emitFailed(task: DownloadTask): void {
    emitToRenderers(DOWNLOAD_EVENTS.FAILED, {
      taskId: task.id,
      appId: task.appId,
      name: task.name,
      errorMessage: task.errorMessage,
      errorKey: task.errorKey,
    })
  }

  private notifyQueueChanged(): void {
    emitToRenderers(DOWNLOAD_EVENTS.QUEUE_CHANGED, {
      queueLength: this.queue.length,
      activeCount: this.getActiveTasks().length,
    })
  }

  private emitEngineStatus(): void {
    emitToRenderers(DOWNLOAD_EVENTS.ENGINE_STATUS, this.getStatus())
  }

  private moveToHistory(task: DownloadTask): void {
    this.history.unshift({ ...task })
    if (this.history.length > MAX_HISTORY) {
      this.history = this.history.slice(0, MAX_HISTORY)
    }
    this.persister.saveHistory(this.history)
  }

  private heartbeat(): void {
    // Detectar tareas huerfanas: workerPromise resuelto pero estado no avanzó
    const now = Date.now()
    for (const internal of this.tasks.values()) {
      if (internal.task.state === 'downloading' || internal.task.state === 'preparing') {
        // Si lleva más de 2 minutos sin cambio de bytes y no hay worker activo
        const stalledMs = now - internal.task.lastUpdatedAt
        if (stalledMs > 120_000 && !internal.workerPromise) {
          logger.warn(
            `[download-engine] heartbeat: task ${internal.task.name} stalled for ${Math.floor(stalledMs / 1000)}s, no active worker`,
            'download-engine',
          )
          internal.task.state = 'stalled'
          this.emitProgress(internal.task)
        }
      }
    }
    // Emitir estado periódicamente
    this.emitEngineStatus()
  }
}

// ============================================================================
// Singleton
// ============================================================================

let _instance: DownloadEngine | null = null

export function getDownloadEngine(): DownloadEngine {
  if (!_instance) {
    _instance = new DownloadEngine({
      dataDir: path.join(
        (typeof process !== 'undefined' && process.env.LOCALAPPDATA) || '.',
        'Y-core',
      ),
    })
  }
  return _instance
}

export function resetDownloadEngine(): void {
  if (_instance) {
    _instance.shutdown()
    _instance = null
  }
}

// Re-exportar tipos desde types file
export type { DownloadTask, DownloadProgressPayload, EngineStatus }
export { DownloadPriority, type DownloadSource, type DownloadState }
