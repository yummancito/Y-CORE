// ============================================================================
// electron/modules/download-engine-types.ts
// ----------------------------------------------------------------------------
// Tipos compartidos del motor de descargas v2. Separados del engine para
// que stores y UI puedan importarlos sin arrastrar todo el módulo.
// ============================================================================

/** Fuente de origen de la descarga */
export type DownloadSource =
  | 'steam-native' // Steam client nativo (recomendado)
  | 'steamcmd'     // SteamCMD fork
  | 'api_proxy'    // Y-core API proxy
  | 'direct'       // Direct HTTP download
  | 'torrent'      // BitTorrent

/** Estado de una tarea de descarga individual */
export type DownloadState =  | 'queued' | 'preparing' | 'connecting' | 'downloading' | 'verifying' | 'paused' | 'stalled' | 'completed' | 'failed' | 'cancelled' | 'blocked-prereq'

/** Prioridad de descarga */
export enum DownloadPriority {
  LOW = 0,
  NORMAL = 1,
  HIGH = 2,
  CRITICAL = 3,
}

/** Eventos emitidos por el engine */
export type DownloadEngineEvent =
  | 'task:created'
  | 'task:started'
  | 'task:progress'
  | 'task:paused'
  | 'task:resumed'
  | 'task:completed'
  | 'task:failed'
  | 'task:cancelled'
  | 'queue:changed'
  | 'engine:state'

/** Una tarea individual en la cola de descargas */
export interface DownloadTask {
  /** ID único de la tarea */
  id: string
  /** App ID de Steam */
  appId: string
  /** Nombre del juego */
  name: string
  /** Fuente de descarga */
  source: DownloadSource
  /** Estado actual */
  state: DownloadState
  /** Prioridad */
  priority: DownloadPriority

  // ── Progreso ──
  /** Bytes descargados */
  bytesDownloaded: number
  /** Bytes totales */
  bytesTotal: number
  /** Velocidad actual (bytes/seg) */
  speedBytesPerSec: number
  /** ETA en segundos */
  etaSeconds: number | null
  /** Porcentaje 0-100 */
  percent: number

  // ── Metadatos de descarga ──
  /** Directorio de instalación */
  installDir: string
  /** Depot keys para descifrado (si aplica) */
  depotKeys?: { depotId: string; key: string }[]
  /** Manifiesto(s) para steampipe */
  manifestFiles?: { depotId: string; manifestId: string }[]
  /** URL directa (si source = 'direct') */
  directUrl?: string
  /** Archivo/source local (para import) */
  localPath?: string

  // ── Estado interno ──
  /** Número de reintentos */
  retryCount: number
  /** Máximo de reintentos */
  maxRetries: number
  /** Mensaje de error si state = 'failed' */
  errorMessage?: string
  /** Código de error i18n */
  errorKey?: string
  /** Timestamps */
  createdAt: number
  startedAt?: number
  completedAt?: number
  lastUpdatedAt: number

  // ── Estadísticas ──
  /** Velocidad pico observada (bytes/seg) */
  peakSpeed: number
  /** Segundos transcurridos desde el inicio */
  elapsedSec: number
  /** Bytes verificados (SHA1) */
  bytesVerified: number
  /** Archivos verificados vs totales */
  filesVerified: number
  filesTotal: number

  // ── Prerrequisitos ──
  /** ID de la tarea que esta tarea espera (`prereqTaskId`).
   *  Mientras la tarea referenciada no esté `completed`, esta tarea no se
   *  descargará (el motor la deja en estado `queued` aunque haya slots libres). */
  prereqTaskId?: string
  /** Estado derivado del prerrequisito para UI.
   *  Lo calcula el motor en cada notifyQueueChanged.
   *  `pending`   → la tarea prereq está en cola/descargando/pausada/etc.
   *  `satisfied` → la tarea prereq está completed.
   *  `failed`    → la tarea prereq terminó en failed/cancelled/timeout.
   *                Cuando esto ocurre, la tarea dependiente se mueve a
   *                estado `blocked-prereq`. */
  prereqState?: 'pending' | 'satisfied' | 'failed'
}

/** Payload del evento de progreso */
export interface DownloadProgressPayload {
  taskId: string
  appId: string
  name: string
  state: DownloadState
  bytesDownloaded: number
  bytesTotal: number
  speedBytesPerSec: number
  etaSeconds: number | null
  percent: number
  errorMessage?: string
  errorKey?: string
}

/** Opciones para crear una nueva tarea */
export interface CreateTaskOptions {
  appId: string
  name: string
  source?: DownloadSource
  priority?: DownloadPriority
  installDir?: string
  depotKeys?: { depotId: string; key: string }[]
  manifestFiles?: { depotId: string; manifestId: string }[]
  directUrl?: string
  localPath?: string
  maxRetries?: number
  /** ID de la tarea prerrequisito. La tarea no empezará hasta que la
   *  tarea referenciada esté en estado `completed`. Si la tarea referenciada
   *  termina en `failed`/`cancelled`/`timeout`, esta tarea pasa a estado
   *  `blocked-prereq` y la UI muestra el banner explicativo. */
  prereqTaskId?: string
}

/** Opciones de inicialización del engine */
export interface DownloadEngineOptions {
  /** Número máximo de descargas simultáneas */
  maxConcurrent?: number
  /** Directorio donde persiste el estado de la cola */
  dataDir?: string
  /** Intervalo de heartbeat para limpiar tareas huerfanas */
  heartbeatIntervalMs?: number
}

/** Resumen de estado del engine */
export interface EngineStatus {
  active: number
  queued: number
  completed: number
  failed: number
  totalBytesDownloaded: number
  totalBytesTotal: number
  combinedSpeed: number
  maxConcurrent: number
  isPaused: boolean
}
