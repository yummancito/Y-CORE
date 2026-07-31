// ============================================================================
// electron/modules/download-ipc.ts
// ----------------------------------------------------------------------------
// Registro de handlers IPC para el motor de descargas v2.
//
// Expone al renderer:
//   download:createTask       — crear nueva tarea
//   download:startTask        — iniciar/reanudar tarea
//   download:pauseTask        — pausar tarea
//   download:cancelTask       — cancelar tarea
//   download:getTasks         — obtener todas las tareas
//   download:getHistory       — obtener historial
//   download:getStatus        — obtener estado del engine
//   download:setPriority      — cambiar prioridad
//   download:reorderTask      — reordenar cola
//   download:setPaused        — pausar/reanudar engine
//   download:clearCompleted   — limpiar completadas
//   download:clearHistory     — limpiar historial
//   download:startFromApi     — iniciar desde datos de API
// ============================================================================

import { ipcMain } from 'electron'
import { logger } from '../logger'
import { getDownloadEngine, DownloadPriority } from './download-engine'
import { getDownloadApiBridge } from './download-api-bridge'
import type { DownloadSource } from './download-engine-types'
import { steamDownloadService } from '../services/steam-download.service'

/**
 * Registra workers para cada fuente de descarga.
 *
 * Steam-native es manejado directamente en startFromApi, no usa el download engine
 */
function registerWorkers(_engine: ReturnType<typeof getDownloadEngine>): void {
  // Steam-native se maneja en download:startFromApi directamente
  // No es necesario registrar workers aquí
}

/**
 * Registra todos los handlers IPC del motor de descargas.
 */
export function registerDownloadHandlers(): void {
  const engine = getDownloadEngine()
  const bridge = getDownloadApiBridge()

  // Registrar workers para cada fuente
  registerWorkers(engine)

  // ── Crear tarea ──
  ipcMain.handle('download:createTask', async (_event, opts?: any) => {
    try {
      // ERROR #7 FIX: Validate inputs upfront (synchronously) before any async
      if (!opts || typeof opts !== 'object') {
        return { success: false, error: 'opts must be a non-null object' }
      }
      if (typeof opts.appId !== 'string' || !opts.appId.trim()) {
        return { success: false, error: 'appId is required and must be a non-empty string' }
      }
      if (typeof opts.name !== 'string' || !opts.name.trim()) {
        return { success: false, error: 'name is required and must be a non-empty string' }
      }

      const task = engine.createTask({
        appId: opts.appId.trim(),
        name: opts.name.trim(),
        source: opts.source,
        priority: typeof opts.priority === 'number' ? opts.priority : DownloadPriority.NORMAL,
        installDir: opts.installDir,
        depotKeys: Array.isArray(opts.depotKeys) ? opts.depotKeys : undefined,
        manifestFiles: Array.isArray(opts.manifestFiles) ? opts.manifestFiles : undefined,
        directUrl: typeof opts.directUrl === 'string' ? opts.directUrl : undefined,
        localPath: typeof opts.localPath === 'string' ? opts.localPath : undefined,
        maxRetries: typeof opts.maxRetries === 'number' ? opts.maxRetries : undefined,
        prereqTaskId: typeof opts.prereqTaskId === 'string' ? opts.prereqTaskId : undefined,
      })
      return { success: true, task }
    } catch (err: any) {
      logger.error(`[download-ipc] createTask failed: ${err.message}`, 'download-ipc')
      return { success: false, error: err.message || 'Unknown error', code: err.code }
    }
  })

  // ── Iniciar tarea ──
  ipcMain.handle('download:startTask', async (_event, taskId?: any) => {
    try {
      // ERROR #7 FIX: Validate inputs upfront
      if (typeof taskId !== 'string' || !taskId.trim()) {
        return { success: false, error: 'taskId is required and must be a non-empty string' }
      }
      const ok = await engine.startTask(taskId.trim())
      return { success: ok }
    } catch (err: any) {
      return { success: false, error: err.message || 'Unknown error' }
    }
  })

  // ── Pausar tarea ──
  ipcMain.handle('download:pauseTask', async (_event, taskId?: any) => {
    try {
      // ERROR #7 FIX: Validate inputs upfront
      if (typeof taskId !== 'string' || !taskId.trim()) {
        return { success: false, error: 'taskId is required and must be a non-empty string' }
      }
      const ok = engine.pauseTask(taskId.trim())
      return { success: ok }
    } catch (err: any) {
      return { success: false, error: err.message || 'Unknown error' }
    }
  })

  // ── Cancelar tarea ──
  ipcMain.handle('download:cancelTask', async (_event, taskId?: any) => {
    try {
      // ERROR #7 FIX: Validate inputs upfront
      if (typeof taskId !== 'string' || !taskId.trim()) {
        return { success: false, error: 'taskId is required and must be a non-empty string' }
      }
      const ok = engine.cancelTask(taskId.trim())
      return { success: ok }
    } catch (err: any) {
      return { success: false, error: err.message || 'Unknown error' }
    }
  })

  // ── Obtener todas las tareas ──
  ipcMain.handle('download:getTasks', async () => {
    try {
      return { success: true, tasks: engine.getAllTasks(), queue: engine.getActiveTasks() }
    } catch (err: any) {
      return { success: false, error: err.message, tasks: [], queue: [] }
    }
  })

  // ── Obtener una tarea por ID ──
  ipcMain.handle('download:getTask', async (_event, taskId: string) => {
    try {
      const task = engine.getTask(taskId)
      return { success: true, task: task ?? null }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  // ── Obtener historial ──
  ipcMain.handle('download:getHistory', async () => {
    try {
      return { success: true, history: engine.getHistory() }
    } catch (err: any) {
      return { success: false, error: err.message, history: [] }
    }
  })

  // ── Obtener estado del engine ──
  ipcMain.handle('download:getStatus', async () => {
    try {
      return { success: true, status: engine.getStatus() }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  // ── Cambiar prioridad ──
  ipcMain.handle('download:setPriority', async (_event, taskId: string, priority: number) => {
    try {
      const ok = engine.setPriority(taskId, priority as DownloadPriority)
      return { success: ok }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  // ── Reordenar cola ──
  ipcMain.handle('download:reorderTask', async (_event, taskId: string, newIndex: number) => {
    try {
      const ok = engine.reorderTask(taskId, newIndex)
      return { success: ok }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  // ── Pausar/reanudar engine ──
  ipcMain.handle('download:setPaused', async (_event, paused: boolean) => {
    try {
      engine.setPaused(paused)
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  // ── Limpiar completadas ──
  ipcMain.handle('download:clearCompleted', async () => {
    try {
      engine.clearCompleted()
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  // ── Limpiar historial ──
  ipcMain.handle('download:clearHistory', async () => {
    try {
      engine.clearHistory()
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  // ── Iniciar desde datos de API ──
  ipcMain.handle('download:startFromApi', async (_event, opts: {
    appId: string
    name: string
    installDir?: string
    manifestFiles: { depotId: string; manifestId: string }[]
    depotKeys: { depotId: string; key: string }[]
    priority?: number
    source?: DownloadSource
  }) => {
    try {
      logger.info(`[download-ipc] startFromApi called with source=${opts.source}`, 'download-ipc')
      // Si es steam-native, maneja directamente sin usar download engine
      if (opts.source === 'steam-native') {
        logger.info(`[download-ipc] Using steam-native for ${opts.name}`, 'download-ipc')
        const success = await steamDownloadService.startDownload(opts.appId, opts.name)
        if (!success) {
          return { success: false, error: 'Failed to start Steam download', tasks: [] }
        }
        // Retornar un task dummy para compatibilidad
        return { success: true, tasks: [{
          id: opts.appId,
          appId: opts.appId,
          name: opts.name,
          source: 'steam-native',
          state: 'downloading',
        }] }
      }

      // Para otras fuentes, usar el download engine
      const tasks = await bridge.startDownload({
        appId: opts.appId,
        name: opts.name,
        installDir: opts.installDir,
        manifestFiles: opts.manifestFiles,
        depotKeys: opts.depotKeys,
        priority: opts.priority ?? DownloadPriority.NORMAL,
        source: opts.source,
      })
      return { success: true, tasks }
    } catch (err: any) {
      logger.error(`[download-ipc] startFromApi failed: ${err.message}`, 'download-ipc')
      return { success: false, error: err.message, tasks: [] }
    }
  })

  logger.info('[download-ipc] handlers registered', 'download-ipc')
}
