// ============================================================================
// src/services/install.service.ts
// ----------------------------------------------------------------------------
// Renderer-side V2-only install service.
//
// DECISION (V2-only): all game installs route through the V2 download engine.
// Single source of truth: `startV2Download` + `waitForV2TaskComplete`.
// SteamCMD, Steam Client Lua store install, and the old `downloadGameWithoutSteam`
// sequential path are gone — there is no back-compat shim because there are no
// V1 callers in the renderer anymore. Every install is one V2 task containing
// all depots of the game; the V2 engine owns queue, priority, retry,
// persistence, IPC events.
// ============================================================================

import { extractMissingDepotIds, buildDepotboxLinks } from '../lib/parse-error'
import { t } from '../lib/i18n'
import { downloadService } from './download.service'
import {
  installGame,
  reportDownloaded,
  getJobStatus,
  fetchDepotKeysFromApi,
} from '../lib/y-core-api'

// ── Utility: render error strings with depotbox deep-links ────────────────

export function enrichErrorsWithDepotLinks(errors: string[] | undefined): string[] {
  if (!errors || errors.length === 0) return []
  return errors.map((err) => {
    const missing = extractMissingDepotIds(err)
    if (missing.length === 0) return err
    const links = buildDepotboxLinks(missing)
    return `${err}\n${t('errors.missingDepots')}\n${links}`
  })
}

export function parseErrorMessage(errorMsg: string): string {
  let displayMsg = errorMsg
  try {
    const parsed = JSON.parse(errorMsg)
    if (parsed.t) displayMsg = parsed.t
    if (parsed.p?.details) displayMsg = parsed.p.details + ' (' + parsed.t + ')'
  } catch { /* not JSON */ }

  if (displayMsg.includes('429') || displayMsg.includes('rate limit')) {
    return displayMsg + ' — ' + t('errors.api.rateLimited')
  } else if (displayMsg.includes('403') || displayMsg.includes('Forbidden')) {
    return displayMsg + ' — ' + t('errors.api.forbidden')
  } else if (displayMsg.includes('404') || displayMsg.includes('Not Found')) {
    return displayMsg + ' — ' + t('errors.api.notFound')
  } else if (displayMsg.includes('subscription') || displayMsg.includes('suscripción') || displayMsg.includes('Subscription') || displayMsg.includes('requires login')) {
    return 'BACKEND ERROR - Depot Keys: ' + displayMsg + '\n\nEste juego requiere keys de depot que el servidor no pudo obtener.'
  } else if (displayMsg.includes('timeout')) {
    return displayMsg + ' — ' + t('errors.api.timeout')
  }
  return displayMsg
}

// ── V2 engine thin wrappers ───────────────────────────────────────────────
//
// Primary install API for the renderer. The hook `useInstallProcessor` calls
// them; any UI that wants to start an outside-of-queue install can too.

/**
 * Start a V2 download task. Returns `{ success, taskId, error }`.
 * The task is created AND its worker starts immediately; callers don't need to
 * separately call `downloadService.startTask(taskId)`.
 */
async function startV2Download(opts: {
  appId: string
  name: string
  manifestFiles: { depotId: string; manifestId: string }[]
  depotKeys: { depotId: string; key: string }[]
  priority?: number
  source?: 'steam-native' | 'direct' | 'api_proxy' | 'torrent'
}): Promise<{ success: boolean; taskId?: string; alreadyComplete?: boolean; error?: string }> {
  try {
    const result = await downloadService.startFromApi({
      appId: opts.appId,
      name: opts.name,
      manifestFiles: opts.manifestFiles,
      depotKeys: opts.depotKeys,
      priority: opts.priority,
      source: opts.source ?? 'steam-native',
    })
    if (!result.success) {
      return { success: false, error: result.error ?? 'engine refused startFromApi' }
    }
    // V2 IPC returns the created DownloadTask; pick the matching one by appId.
    const tasks = (result as any).tasks ?? []
    const task = tasks.find((t: any) => String(t.appId) === String(opts.appId)) ?? tasks[0]
    if (!task?.id) {
      return { success: false, error: 'engine did not return a task id' }
    }
    // Steam-native installs never enter the download-engine's own task table —
    // download.service.ts's startFromApi does the depot-key/ACF/Lua setup and
    // hands off to Steam itself for the actual bytes, returning state:'ready'
    // as a marker that its job is done. waitForV2TaskComplete polls the
    // engine's getTasks()/getHistory() for this id, which never happens for
    // Steam-native — every install silently "failed" after a few retries even
    // though Steam was correctly downloading it. Short-circuit here instead
    // of handing a task id to the poller that can never resolve it.
    if (task.state === 'ready') {
      return { success: true, taskId: task.id, alreadyComplete: true }
    }
    return { success: true, taskId: task.id }
  } catch (err: any) {
    return { success: false, error: err?.message ?? String(err) }
  }
}

/**
 * Block until the V2 task reaches 'completed' or 'failed'. Returns the final
 * state. Polls `downloadService.getTasks()` because the V3 store's event
 * subscription is only active while the page is mounted; a one-shot renderer
 * context (as in `useInstallProcessor`) wants deterministic completion.
 *
 * Reasons returned:
 *   • 'completed'  → bytes on disk, verified, ready to launch
 *   • 'failed'     → engine error (network, CDN, sha1 mismatch) — caller throws
 *   • 'cancelled'  → user pressed Cancel in /downloads — caller toasts neutral
 *   • 'timeout'    → 30-min wall-clock limit hit — caller toasts warning
 *   • 'not-found'  → engine rotated task without a history entry — caller skips
 *   • 'blocked-prereq' → prerequisite (Half-Life etc.) failed — caller toasts warning
 *
 * Timeout default: 30 min. Big F2P games on a slow link can hit that easily.
 */
async function waitForV2TaskComplete(
  taskId: string,
  timeoutMs = 30 * 60 * 1000,
): Promise<{ success: boolean; reason: 'completed' | 'failed' | 'timeout' | 'not-found' | 'cancelled' | 'blocked-prereq'; errorMessage?: string }> {
  const deadline = Date.now() + timeoutMs
  // A task can legitimately be absent from both getTasks() and getHistory()
  // for the first poll or two right after creation — the engine hasn't
  // finished registering it yet. Treating that as terminal 'not-found' on
  // the very first miss silently abandoned real downloads (the caller just
  // returns without any toast). Requiring a few consecutive misses before
  // giving up distinguishes the startup race from an actual rotated task.
  let consecutiveMisses = 0
  const MAX_CONSECUTIVE_MISSES = 5
  while (Date.now() < deadline) {
    try {
      const r = await downloadService.getTasks()
      const task = (r.tasks ?? []).find((t: any) => t.id === taskId)
      if (!task) {
        // Engine may rotate completed tasks out of memory; the persisted queue
        // file would still have it. We fall back to history so the caller can
        // distinguish completed-success from rotation.
        const hist = await downloadService.getHistory()
        const histTask = (hist.history ?? []).find((t: any) => t.id === taskId)
        if (histTask) {
          if (histTask.state === 'completed') return { success: true, reason: 'completed' }
          if (histTask.state === 'cancelled') return { success: false, reason: 'cancelled', errorMessage: histTask.errorMessage ?? 'Cancelado por el usuario' }
          if (histTask.state === 'failed') return { success: false, reason: 'failed', errorMessage: histTask.errorMessage }
        }
        consecutiveMisses++
        if (consecutiveMisses < MAX_CONSECUTIVE_MISSES) {
          await new Promise((resolve) => setTimeout(resolve, 2000))
          continue
        }
        return { success: false, reason: 'not-found' }
      }
      consecutiveMisses = 0
      if (task.state === 'completed') return { success: true, reason: 'completed' }
      // Distinguish cancel from failure so the UI can show "cancelled" instead
      // of the misleading "Descarga sin Steam falló" toast when the user hits
      // Cancel in /downloads.
      if (task.state === 'cancelled') {
        return { success: false, reason: 'cancelled', errorMessage: task.errorMessage ?? 'Cancelado por el usuario' }
      }
      if (task.state === 'failed') {
        return { success: false, reason: 'failed', errorMessage: task.errorMessage }
      }
      // Estado terminal de bloqueo por prerrequisito (HL1 prerequisite falló
      // etc.). Es un fallo NO recuperable por reintento — el usuario debe
      // resolver el prereq manualmente. Lo retornamos como razón propia para
      // que el hook muestre un toast específico.
      if (task.state === 'blocked-prereq') {
        return {
          success: false,
          reason: 'blocked-prereq',
          errorMessage: task.errorMessage ?? 'El prerrequisito de este juego no se completó (Half-Life ausente / falló).',
        }
      }
    } catch {
      // engine call transient failure — keep polling
    }
    await new Promise((resolve) => setTimeout(resolve, 2000))
  }
  return { success: false, reason: 'timeout' }
}

/**
 * Create a GoldSrc mod install with Half-Life as a prerequisite.
 *
 * Flow:
 *   1. (Optional) check if HL1 is already installed via `isPrereqInstalled`.
 *      If so, creates a single task with `prereqTaskId` pointing at the
 *      already-completed HL1 install — effectively skipping the prereq
 *      enqueue but keeping the linkage in queue.json for traceability.
 *   2. Otherwise, resolves HL1 manifest/keys via Y-core API /install, creates
 *      a HIGH-priority V2 task for HL1, then creates the mod's task with
 *      NORMAL priority and `prereqTaskId` pointing to the HL1 task.
 *
 * Returns `{ success, prereqTaskId, dependentTaskId }`. The renderer waits on
 * `dependentTaskId` — if HL1 fails, the dependent task transitions to
 * `blocked-prereq` and `waitForV2TaskComplete(dependentTaskId)` returns
 * `reason: 'blocked-prereq'`.
 */
async function createGoldSrcInstall(opts: {
  appId: string
  name: string
  /** Pre-resolved mod manifest files (same shape as API `manifest_files`). */
  manifestFiles: { depotId: string; manifestId: string }[]
  depotKeys: { depotId: string; key: string }[]
  /** Half-Life appId. Default '70'. */
  hl1AppId?: string
  /** Pass an external check if HL1 is already installed. Defaults to
   *  `false` (we always enqueue HL1 — the engine dedupes when the same
   *  appId is already running, and this avoids races with the library
   *  loader). */
  isPrereqInstalled?: boolean
  installDir?: string
}): Promise<{ success: boolean; prereqTaskId?: string; dependentTaskId?: string; skippedPrereq?: boolean; error?: string }> {
  const hl1AppId = opts.hl1AppId ?? '70'
  try {
    let prereqTaskId: string | undefined
    let skippedPrereq = false

    if (!opts.isPrereqInstalled) {
      // 1. Resolver HL1 manifest/keys vía Y-core API /install (NO descarga).
      const hl1Install = await installGame(hl1AppId)
      if (hl1Install.status !== 'ready' || !hl1Install.game) {
        return { success: false, error: `Half-Life prerequisite (appId=${hl1AppId}) could not be resolved: status=${hl1Install.status}` }
      }
      const hl1Mf = (hl1Install.game.manifest_files ?? []).map((m: any) => ({
        depotId: m.depot_id,
        manifestId: m.manifest_gid,
      }))
      const hl1Dk = (hl1Install.game.depot_keys ?? []).map((k: any) => ({
        depotId: k.depot_id,
        key: k.decryption_key,
      }))
      if (hl1Dk.length === 0) {
        return { success: false, error: `Half-Life prerequisite missing depot keys (depot_keys empty from /install)` }
      }

      // 2. Crear la tarea HL1 con prioridad HIGH. El motor la descargará
      // antes que el mod (prioridad más alta que NORMAL).
      const hl1Create = await downloadService.createTask({
        appId: hl1AppId,
        name: 'Half-Life',
        source: 'steampipe',
        priority: 2, // HIGH
        depotKeys: hl1Dk,
        manifestFiles: hl1Mf,
        installDir: opts.installDir,
      })
      if (!hl1Create.success || !hl1Create.task?.id) {
        return { success: false, error: hl1Create.error ?? 'engine refused HL1 prereq task' }
      }
      prereqTaskId = hl1Create.task.id
    } else {
      skippedPrereq = true
    }

    // 3. Crear la tarea del mod con prioridad NORMAL y prereqTaskId apuntando
    // a HL1. Si HL1 ya estaba instalado, prereqTaskId queda undefined
    // (engine.startInternalTask aceptará esto sin bloquear).
    const modCreate = await downloadService.createTask({
      appId: opts.appId,
      name: opts.name,
      source: 'steampipe',
      priority: 1, // NORMAL
      prereqTaskId,
      depotKeys: opts.depotKeys,
      manifestFiles: opts.manifestFiles,
      installDir: opts.installDir,
    })
    if (!modCreate.success || !modCreate.task?.id) {
      return { success: false, error: modCreate.error ?? 'engine refused mod task', prereqTaskId }
    }
    return { success: true, prereqTaskId, dependentTaskId: modCreate.task.id, skippedPrereq }
  } catch (err: any) {
    return { success: false, error: err?.message ?? String(err) }
  }
}

// ── Public service object ─────────────────────────────────────────────────

export const installService = {
  // ── Logging (general purpose — used by hook) ─────────────────────────
  async addLog(level: 'INFO' | 'WARN' | 'ERROR', message: string): Promise<void> {
    try {
      const gw = (window as any).steamtools?.gateway
      if (gw) {
        await gw.call('log', 'add', { level, message })
      }
    } catch { /* survive non-Electron / bridge failures */ }
  },

  // ── V2 engine: primary path ─────────────────────────────────────────
  // (startV2Download / waitForV2TaskComplete / createGoldSrcInstall are
  // declared above as plain async functions; the method-shorthand property
  // form is the V2 surface.)
  startV2Download,
  waitForV2TaskComplete,
  createGoldSrcInstall,

  // ── V2 API surface ──────────────────────────────────────────────────
  async reportDownloaded(appId: string): Promise<void> {
    try {
      await reportDownloaded(appId)
    } catch { /* silent */ }
  },

  async getJobStatus(jobId: string): Promise<any> {
    return getJobStatus(jobId)
  },

  async installGameFromApi(appId: string): Promise<any> {
    return installGame(appId)
  },

  async fetchDepotKeysFromApi(appId: string): Promise<{ depot_id: string; key: string }[]> {
    return fetchDepotKeysFromApi(appId)
  },
}

export type InstallService = typeof installService
