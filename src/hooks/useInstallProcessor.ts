// ============================================================================
// src/hooks/useInstallProcessor.ts
// ----------------------------------------------------------------------------
// V2-ONLY install processor. Single linear path:
//
//   queue → dequeue → Y-core API /install →
//     if 'queued'    → poll job until ready → recurse with `game`
//     if 'ready'     → map shape (depot_id↔depotId) → installService.startV2Download →
//                      installService.waitForV2TaskComplete →
//                      consumeGame + reportDownloaded → next item
//     else           → toast error
//
// The processor NEVER tries SteamCMD, NEVER falls back to a Lua store install,
// NEVER opens Steam client. V2 is the only path now.
//
// The `waitForV2TaskComplete` inside this hook is the one-shot completion
// detection. The store-side `useDownloadEngineV3Store` ALSO subscribes to
// download:* IPC events, so concurrent page views (e.g. /downloads open
// while install is running) see live updates regardless.
// ============================================================================

import { useCallback, useEffect, useRef } from 'react'
import { useToastStore } from '../stores/useToastStore'
import { useDownloadQueueStore } from '../stores/useDownloadQueueStore'
import { useRecommendationStore } from '../stores/useRecommendationStore'
import { useLibraryStore } from '../stores/useLibraryStore'
import { installService, enrichErrorsWithDepotLinks, parseErrorMessage } from '../services/install.service'

const GOLDSRC_MOD_APP_IDS = new Set([
  '10', '20', '30', '40', '50', '60', '80', '100', '130',
])
const HALF_LIFE_APP_ID = '70'

export interface RestartPrompt {
  title: string
  message: string
  onConfirm: () => void
  confirmLabel?: string
}

interface V2TaskCompletion {
  reason: 'completed' | 'failed' | 'timeout' | 'not-found' | 'cancelled' | 'blocked-prereq'
  errorMessage?: string
  /** true when completion came from a Steam-native install (setup done,
   *  Steam owns the actual bytes) — the caller needs to prompt "restart
   *  Steam to start downloading" instead of just reporting done. */
  steamNative?: boolean
}

/**
 * Install a single game via the V2 download engine and wait for completion
 * before returning. Throws only on actual `failed`; cancelled/timeout/not-found
 * are returned as V2TaskCompletion so the caller picks the UX.
 *
 * Why this contract: GoldSrc mods need to check the HL1 prerequisite
 * outcome BEFORE proceeding to their own install. If we threw on cancel,
 * the outer .catch would short-circuit the whole queue appropriately — but
 * the cancel-as-return design lets `processQueue` decide whether to abort
 * the queue (GoldSrc prerequisite fail) or just skip (GoldSrc main game
 * cancel) without breaking other flows.
 */
async function installOneGameV2(opts: {
  appId: string
  name: string
}): Promise<V2TaskCompletion> {
  installService.addLog('INFO', `[V2] installing ${opts.name} (appId=${opts.appId})`)

  // 1. Resolve install data via Y-core API.
  const resp = await installService.installGameFromApi(opts.appId)

  if (resp.status === 'queued' && resp.job_id) {
    // API server-side queue (e.g. DepotBox import in progress). Polling happens
    // OUTSIDE this function because GoldSrc prerequisites may need to chain
    // queued-to-ready responses — main processQueue handles that loop.
    throw new Error('API_RESPONSE_QUEUED:' + resp.job_id)
  }
  if (resp.status !== 'ready' || !resp.game) {
    throw new Error(`API returned unexpected response: status=${resp.status}, error=${resp.error_message ?? '—'}`)
  }
  const game = resp.game

  // 2. Map shape: API returns { depot_id, manifest_gid, decryption_key } but the
  // V2 engine wants { depotId, manifestId, key }. Translate here so the engine
  // call uses its native shape exactly.
  const manifestFiles = (game.manifest_files ?? []).map((m: any) => ({
    depotId: m.depot_id,
    manifestId: m.manifest_gid,
  }))
  let depotKeys = (game.depot_keys ?? []).map((k: any) => ({
    depotId: k.depot_id,
    key: k.decryption_key,
  }))

  // 3. Defensive: if /install didn't return keys (server glitch), try /depot-keys
  // before giving up. V2's steampipe worker rejects upfront with a clear error
  // on missing keys, so this is the difference between "failed" and "skip".
  if (depotKeys.length === 0) {
    installService.addLog('INFO', `[V2] depot_keys empty from /install, fetching from /depot-keys endpoint`)
    try {
      const fetched = await installService.fetchDepotKeysFromApi(String(game.app_id))
      depotKeys = fetched.map((k) => ({ depotId: k.depot_id, key: k.key }))
      installService.addLog('INFO', `[V2] fetched ${depotKeys.length} depot keys for appId=${game.app_id}`)
    } catch (keyErr: any) {
      throw new Error(`Cannot download: no depot keys returned by Y-core API (${keyErr.message})`)
    }
  }

  installService.addLog(
    'INFO',
    `[V2] dispatching ${opts.name} (appId=${game.app_id}) — depots=${manifestFiles.length}, keys=${depotKeys.length}`,
  )

  // 4. Start the V2 task. Returns taskId on success.
  const started = await installService.startV2Download({
    appId: String(game.app_id),
    name: game.name,
    manifestFiles,
    depotKeys,
    priority: 1, // NORMAL — engine constant; keyed by DownloadPriority enum on the
                  // other side.
  })
  if (!started.success || !started.taskId) {
    throw new Error(started.error ?? 'V2 engine refused to enqueue task')
  }
  installService.addLog('INFO', `[V2] task ${started.taskId} enqueued for ${game.name}`)

  // Steam-native installs finish their work (depot keys + ACF + Lua) inside
  // startFromApi itself and hand the actual download off to Steam — they
  // never register in the download-engine's task table, so polling for them
  // there can never succeed. Treat the 'ready' marker as completion directly.
  if (started.alreadyComplete) {
    installService.addLog('INFO', `[V2] ${game.name} setup complete — Steam will handle the download`)
    return { reason: 'completed', steamNative: true }
  }

  // 5. Block on completion (success OR failure).
  const completion = await installService.waitForV2TaskComplete(started.taskId)
  if (!completion.success) {
    // Only real 'failed' bubbles as a thrown Error — that path is caught by
    // processQueue's outer try/catch and surfaces to the user as an error
    // toast with depot-link enrichment. The non-failure outcomes cancel/timeout/
    // not-found are returned as V2TaskCompletion so the caller decides UX:
    //   • GoldSrc prerequisite: abort the rest of the queue (HL1 must succeed)
    //   • Main game cancel:    skip the game and continue the queue
    //   • Timeout:             same as cancel
    //   • Not-found:           same as cancel (engine memory rotation; safe)
    if (completion.reason === 'cancelled' || completion.reason === 'timeout' || completion.reason === 'not-found') {
      return completion
    }
    throw new Error(completion.errorMessage ?? `V2 task ${started.taskId} ended in ${completion.reason}`)
  }
  installService.addLog('INFO', `[V2] ${game.name} complete via V2 task ${started.taskId}`)
  return completion
}

export function useInstallProcessor(onRestartPrompt: (prompt: RestartPrompt) => void) {
  const { showToast } = useToastStore()
  const consumeGame = useRecommendationStore((s) => s.consumeGame)
  // Subscribed so GoldSrc installs check the LATEST installed list —
  // pulling from `getState()` would miss the in-flight state when comparing
  // against an HL1 install that just completed.
  const installedGames = useLibraryStore((s) => s.games)
  const pollAbortRef = useRef<AbortController | null>(null)

  /**
   * Poll a Y-core API `queued` response until it becomes `ready` or `failed`.
   * Returns the ready response on success, or null on failure/timeout.
   */
  const pollJob = useCallback(async (jobId: string, appId: string): Promise<any> => {
    pollAbortRef.current?.abort()
    const abortController = new AbortController()
    pollAbortRef.current = abortController

    const maxAttempts = 200
    for (let i = 0; i < maxAttempts; i++) {
      if (abortController.signal.aborted) return null
      await new Promise((resolve) => setTimeout(resolve, 3000))
      if (abortController.signal.aborted) return null

      let job: any
      try {
        job = await installService.getJobStatus(jobId)
      } catch {
        continue
      }
      if (job.status === 'completed') return job
      if (job.status === 'failed') return null
    }
    return null
  }, [])

  const processQueue = useCallback(async () => {
    const { processing, dequeue, setProcessing, setCurrent, setImportProgress } = useDownloadQueueStore.getState()
    if (processing) return
    const item = dequeue()
    if (!item) return

    setProcessing(true)
    setCurrent(item)
    try {
      // ── GoldSrc mods: install Half-Life (appId 70) as a prerequisite first.
      //
      // Strategy:
      //   • If HL1 is ALREADY in the library (i.e. the user has Half-Life
      //     installed from before), we skip the prereq enqueue and a single
      //     V2 task is enough. installOneGameV2 handles this case below.
      //   • Otherwise, we use the NEW `createGoldSrcInstall` flow:
      //     1) Creates HL1 V2 task with priority HIGH (downloads first via
      //        concurrency slot)
      //     2) Creates the mod's V2 task with priority NORMAL and
      //        `prereqTaskId` pointing at the HL1 task
      //     3) The V2 engine blocks the mod task until HL1 is `completed`.
      //     4) If HL1 fails, the mod task transitions to `blocked-prereq`
      //        and the UI shows the banner explaining the prerequisite.
      //
      // The previous flow did an in-process install of HL1 before the mod
      // (which serialized the two downloads). The new flow uses the engine
      // itself, so HL1 and other concurrent downloads share slots, pause,
      // and persistence uniformly.
      let dependentTaskId: string | undefined
      if (GOLDSRC_MOD_APP_IDS.has(item.appId)) {
        const hl1AlreadyInstalled = installedGames.some((g) => g.appId === HALF_LIFE_APP_ID)
        installService.addLog(
          'INFO',
          `[V2] GoldSrc ${item.name} (appId=${item.appId}) — HL1 installed=${hl1AlreadyInstalled}`,
        )

        // Resolver el mod vía API primero (necesitamos manifest/depot keys
        // para crear la tarea dependiente).
        let modResp = await installService.installGameFromApi(item.appId)
        if (modResp.status === 'queued' && modResp.job_id) {
          const polled = await pollJob(modResp.job_id, item.appId)
          if (!polled) {
            setImportProgress(null)
            showToast('error', 'Y-core API never produced manifest for this game (job timed out).')
            return
          }
          modResp = polled
        }
        if (modResp.status !== 'ready' || !modResp.game) {
          throw new Error(`Y-core API returned unexpected response for ${item.name} (status=${modResp.status})`)
        }

        const manifestFiles = (modResp.game.manifest_files ?? []).map((m: any) => ({
          depotId: m.depot_id,
          manifestId: m.manifest_gid,
        }))
        let depotKeys = (modResp.game.depot_keys ?? []).map((k: any) => ({
          depotId: k.depot_id,
          key: k.decryption_key,
        }))
        if (depotKeys.length === 0) {
          installService.addLog('INFO', `[V2] mod depot_keys empty from /install, fetching from /depot-keys endpoint`)
          try {
            const fetched = await installService.fetchDepotKeysFromApi(String(modResp.game.app_id))
            depotKeys = fetched.map((k) => ({ depotId: k.depot_id, key: k.key }))
          } catch (keyErr: any) {
            throw new Error(`Cannot download: no depot keys returned by Y-core API (${keyErr.message})`)
          }
        }

        // Crear las tareas vía la nueva ruta de prerrequisito.
        const goldSrc = await installService.createGoldSrcInstall({
          appId: String(modResp.game.app_id),
          name: item.name,
          manifestFiles,
          depotKeys,
          isPrereqInstalled: hl1AlreadyInstalled,
        })
        if (!goldSrc.success || !goldSrc.dependentTaskId) {
          throw new Error(goldSrc.error ?? 'createGoldSrcInstall failed without error')
        }
        // Si HL1 no estaba instalado, también esperarlo para reportarlo al
        // backend (cumplir cuota diaria) — `consumeGame('70')` se hace si
        // completó.
        dependentTaskId = goldSrc.dependentTaskId
        installService.addLog(
          'INFO',
          `[V2] GoldSrc ${item.name} task ${dependentTaskId} enqueued (skippedPrereq=${goldSrc.skippedPrereq}, prereqTaskId=${goldSrc.prereqTaskId ?? 'n/a'})`,
        )

        // Esperar al mod (que internamente esperará a HL1 vía engine).
        const completion = await installService.waitForV2TaskComplete(dependentTaskId)
        if (completion.reason !== 'completed') {
          if (completion.reason === 'cancelled') {
            showToast('info', `Descarga cancelada: ${item.name}`, 5000)
            installService.addLog('INFO', `[V2] ${item.name} cancelled by user`)
            return
          }
          if (completion.reason === 'timeout') {
            showToast('warning', `Descarga agotó el tiempo de espera: ${item.name}`, 8000)
            installService.addLog('WARN', `[V2] ${item.name} timed out`)
            return
          }
          if (completion.reason === 'not-found') {
            showToast('error', `No se pudo confirmar la descarga de ${item.name}. Intentá de nuevo.`, 8000)
            installService.addLog('WARN', `[V2] ${item.name} engine rotated task without history entry — skipping`)
            return
          }
          if (completion.reason === 'blocked-prereq') {
            // HL1 (u otro prereq) falló — explicamos al usuario y lo dejamos
            // saber qué necesita resolver. NO hacemos `consumeGame` ni
            // reportamos el mod como instalado.
            showToast(
              'warning',
              `${item.name} requiere Half-Life (u otro prerrequisito) para funcionar. Instálalo primero y vuelve a añadir ${item.name}.`,
              10000,
            )
            installService.addLog('WARN', `[V2] ${item.name} blocked by prereq: ${completion.errorMessage}`)
            return
          }
          // falló
          const detail = completion.errorMessage ?? completion.reason
          showToast('error', `Descarga sin Steam falló: ${detail}`, 8000)
          installService.addLog('WARN', `[V2] ${item.name} failed: ${detail}`)
          const enriched = enrichErrorsWithDepotLinks([detail])
          throw new Error(enriched[0] ?? detail)
        }

        // Si llegamos aquí con HL1 también encolo, lo reportamos/consumimos
        // para que el recomendador lo descuente.
        if (goldSrc.prereqTaskId && !goldSrc.skippedPrereq) {
          try { await installService.reportDownloaded(HALF_LIFE_APP_ID) } catch { /* ok */ }
          consumeGame(HALF_LIFE_APP_ID)
        }
        try { await installService.reportDownloaded(item.appId) } catch { /* ok */ }
        consumeGame(item.appId)
        installService.addLog('INFO', `[V2] ${item.name} complete and reported`)
        return
      }

      // ── Non-GoldSrc path: install the actual game via V2.
      const completion = await installOneGameV2({
        appId: item.appId,
        name: item.name,
        // Use the API-returned app_id (the user clicked on the "store" id but
        // /install resolves to the canonical Steam app_id, which the engine
      // actually downloads).
      }).catch((err) => {
        // installOneGameV2 may throw if the API queued — handle polling
        if (err.message?.startsWith('API_RESPONSE_QUEUED:')) {
          // shouldn't reach here because we polled above, but log defensively
          installService.addLog('WARN', `[V2] unexpected queued response after polling: ${err.message}`)
          return { reason: 'failed', errorMessage: 'API re-queued mid-install' } as V2TaskCompletion
        }
        throw err
      })

      if (completion.reason !== 'completed') {
        // Each non-success reason gets its own UX — NEVER lump them into
        // "falló" because that triggers the auto-retry / depotbox-enrichment
        // path which is wrong for user/system signals.
        if (completion.reason === 'cancelled') {
          showToast('info', `Descarga cancelada: ${item.name}`, 5000)
          installService.addLog('INFO', `[V2] ${item.name} cancelled by user`)
          return
        }
        if (completion.reason === 'timeout') {
          showToast('warning', `Descarga agotó el tiempo de espera: ${item.name}`, 8000)
          installService.addLog('WARN', `[V2] ${item.name} timed out`)
          return
        }
        if (completion.reason === 'not-found') {
          showToast('error', `No se pudo confirmar la descarga de ${item.name}. Intentá de nuevo.`, 8000)
          installService.addLog('WARN', `[V2] ${item.name} engine rotated task without history entry — skipping`)
          return
        }
        // Only `failed` reaches here.
        const detail = completion.errorMessage ?? completion.reason
        showToast('error', `Descarga sin Steam falló: ${detail}`, 8000)
        installService.addLog('WARN', `[V2] ${item.name} failed: ${detail}`)
        const enriched = enrichErrorsWithDepotLinks([detail])
        throw new Error(enriched[0] ?? detail)
      }

      try { await installService.reportDownloaded(item.appId) } catch { /* ok */ }
      consumeGame(item.appId)
      installService.addLog('INFO', `[V2] ${item.name} complete and reported`)
      if (completion.steamNative) {
        // Steam already restarted itself server-side (download.service.ts)
        // so it can see the new appmanifest and start pulling bytes — this
        // is just a status confirmation. The button stays as a manual
        // retry in case that automatic restart silently failed.
        onRestartPrompt({
          title: 'Descarga en curso :3',
          message: `${item.name} está configurado y Steam se reinició para empezar a descargarlo. Si no ves progreso en Steam, tocá reiniciar de nuevo.`,
          confirmLabel: 'Reiniciar Steam',
          onConfirm: () => {
            window.steamtools?.restartSteam?.().catch(() => {})
          },
        })
      }
    } catch (err: any) {
      const errorMsg = err.message || 'Unknown error'
      installService.addLog('ERROR', `[V2] install failed for appId=${item.appId}: ${errorMsg}`)
      const displayMsg = parseErrorMessage(errorMsg)
      showToast('error', displayMsg)
    } finally {
      setImportProgress(null)
      setCurrent(null)
      setProcessing(false)
      // Sin prompts de reinicio — Steam se lanza automáticamente en background
      // processQueue is recursive: kick the next item
      processQueue()
    }
  }, [consumeGame, showToast, onRestartPrompt, pollJob])

  const queue = useDownloadQueueStore((s) => s.queue)
  const processing = useDownloadQueueStore((s) => s.processing)
  useEffect(() => {
    if (!processing && queue.length > 0) {
      processQueue()
    }
  }, [queue, processing, processQueue])

  useEffect(() => {
    return () => {
      pollAbortRef.current?.abort()
    }
  }, [])
}
