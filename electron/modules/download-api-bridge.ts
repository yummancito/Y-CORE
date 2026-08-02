// ============================================================================
// electron/modules/download-api-bridge.ts
// ----------------------------------------------------------------------------
// Puente entre la Y-core API y el motor de descargas.
//
// Responsabilidades:
//   1. Recibir datos de instalación desde la API (/install, /depot-keys)
//   2. Crear tareas en el motor con los metadatos correctos
//   3. Proveer workers para cada fuente de descarga
//   4. Coordinar la descarga de múltiples depots por juego
// ============================================================================

import path from 'path'
import { app } from 'electron'
import { logger } from '../logger'
import { getDownloadEngine, DownloadPriority } from './download-engine'
import type { DownloadSource, DownloadTask } from './download-engine-types'

// ============================================================================
// Interfaces de la API
// ============================================================================

export interface InstallGameData {
  app_id: string
  name: string
  lua_content: string
  manifest_files: { depot_id: string; manifest_gid: string }[]
  depot_keys: { depot_id: string; decryption_key: string }[]
}

export interface ApiInstallResponse {
  status: 'ready' | 'queued' | 'error'
  game?: InstallGameData
  job_id?: string
  error_message?: string
}

export interface ApiDepotKey {
  depot_id: string
  decryption_key: string
}

export interface ApiManifestEntry {
  depot_id: string
  manifest_gid: string
}

// ============================================================================
// Opciones para iniciar descarga desde la API
// ============================================================================

export interface StartApiDownloadOptions {
  appId: string
  name: string
  installDir?: string
  manifestFiles: { depotId: string; manifestId: string }[]
  depotKeys: { depotId: string; key: string }[]
  priority?: DownloadPriority
  source?: DownloadSource
}

// ============================================================================
// API Bridge
// ============================================================================

export class DownloadApiBridge {
  /**
   * Inicia la descarga de un juego usando los datos de la API.
   * Crea una tarea en el engine por cada depot.
   */
  async startDownload(opts: StartApiDownloadOptions): Promise<DownloadTask[]> {
    const engine = getDownloadEngine()
    const tasks: DownloadTask[] = []
    const resolvedDir = opts.installDir ?? path.join(
      app.getPath('userData'),
      'Games',
      opts.appId,
    )

    // Si hay manifests, crear una tarea por depot
    if (opts.manifestFiles.length > 0) {
      const task = engine.createTask({
        appId: opts.appId,
        name: opts.name,
        source: opts.source ?? 'steampipe',
        priority: opts.priority ?? DownloadPriority.NORMAL,
        installDir: resolvedDir,
        depotKeys: opts.depotKeys,
        manifestFiles: opts.manifestFiles,
      })
      tasks.push(task)
    } else {
      // Sin manifests, crear tarea genérica
      const task = engine.createTask({
        appId: opts.appId,
        name: opts.name,
        source: opts.source ?? 'direct',
        priority: opts.priority ?? DownloadPriority.NORMAL,
        installDir: resolvedDir,
        depotKeys: opts.depotKeys,
      })
      tasks.push(task)
    }

    logger.info(
      `[download-api-bridge] started download: ${opts.name} (${opts.appId}) — ${tasks.length} task(s)`,
      'download-api-bridge',
    )

    return tasks
  }

  /**
   * Procesa la respuesta de /api/games/{appId}/install
   * y crea las tareas de descarga correspondientes.
   */
  async processInstallResponse(
    appId: string,
    name: string,
    response: ApiInstallResponse,
    extraDepotKeys?: ApiDepotKey[],
  ): Promise<{ tasks: DownloadTask[]; error?: string }> {
    if (response.status !== 'ready' || !response.game) {
      return { tasks: [], error: response.error_message ?? 'API response not ready' }
    }

    const game = response.game

    // Combinar depot keys de /install con extraDepotKeys
    const allKeys = [
      ...game.depot_keys.map(k => ({ depotId: k.depot_id, key: k.decryption_key })),
      ...(extraDepotKeys ?? []).map(k => ({ depotId: k.depot_id, key: k.decryption_key })),
    ]

    // Deducir si el juego requiere steampipe o descarga directa genérica
    const hasManifests = game.manifest_files.length > 0
    const source: DownloadSource = hasManifests ? 'steampipe' : 'direct'

    const tasks = await this.startDownload({
      appId,
      name,
      manifestFiles: game.manifest_files.map(m => ({
        depotId: m.depot_id,
        manifestId: m.manifest_gid,
      })),
      depotKeys: allKeys,
      source,
    })

    return { tasks }
  }
}

// ============================================================================
// Singleton
// ============================================================================

let _bridgeInstance: DownloadApiBridge | null = null

export function getDownloadApiBridge(): DownloadApiBridge {
  if (!_bridgeInstance) {
    _bridgeInstance = new DownloadApiBridge()
  }
  return _bridgeInstance
}
