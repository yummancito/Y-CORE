import { useCallback, useEffect, useRef } from 'react'
import path from 'path'
import { useSettingsStore, type InstallFallbackReason } from '../stores/useSettingsStore'
import { t } from '../lib/i18n'
import { useToastStore } from '../stores/useToastStore'
import { useDownloadQueueStore } from '../stores/useDownloadQueueStore'
import { useRecommendationStore } from '../stores/useRecommendationStore'
import { useSteamCmdJobsStore } from '../stores/useSteamCmdJobsStore'
import { installGame, getJobStatus, reportDownloaded } from '../lib/y-core-api'
import { extractMissingDepotIds, buildDepotboxLinks } from '../lib/parse-error'

interface DepotKey {
  depot_id: string
  key: string
}

interface ManifestFile {
  depot_id: string
  manifest_gid: string
}

async function downloadGameWithoutSteam(
  appId: string,
  gameName: string,
  depotKeys: DepotKey[],
  manifestFiles: ManifestFile[]
): Promise<{ success: boolean; error?: string; actions?: string[]; errors?: string[] }> {
  if (!window.steamtools?.downloadDepot) {
    return {
      success: false,
      error: 'steampipe:downloadDepot not available',
      errors: ['steampipe module not available in this build'],
    }
  }

  const actions: string[] = []
  const errors: string[] = []
  const appNum = parseInt(appId, 10)

  try {
    // Solo descargar depots que tenemos manifests para
    const depotsToDownload = depotKeys.filter(dk =>
      manifestFiles.some(m => m.depot_id === dk.depot_id)
    )

    if (depotsToDownload.length === 0) {
      return {
        success: false,
        error: 'No depots with manifests available to download',
        errors: ['No manifest files found for any depot'],
      }
    }

    safeAddLog('INFO', `[Steampipe] Starting download for ${gameName} (appId=${appId}) with ${depotsToDownload.length} depots`)

    // Descargar cada depot que tenemos manifest
    for (const depotKey of depotsToDownload) {
      const manifest = manifestFiles.find(m => m.depot_id === depotKey.depot_id)!
      const depotNum = parseInt(depotKey.depot_id, 10)

      try {
        safeAddLog('INFO', `[Steampipe] Downloading depot ${depotNum} (manifest: ${manifest.manifest_gid})`)

        const downloadResult = await window.steamtools.downloadDepot({
          appId: appNum,
          depotId: depotNum,
          manifestId: manifest.manifest_gid,
          installDir: `C:\\Users\\${process.env.USERNAME || 'User'}\\AppData\\Local\\Y-core\\Games\\${appId}`,
          cellId: 0,
        })

        if (downloadResult.success) {
          const sizeMB = (downloadResult.bytesDownloaded / 1024 / 1024).toFixed(2)
          const durationSec = (downloadResult.durationMs / 1000).toFixed(1)
          actions.push(`Depot ${depotNum}: ${sizeMB} MB in ${durationSec}s`)
          safeAddLog('INFO', `[Steampipe] Depot ${depotNum} downloaded successfully: ${sizeMB} MB`)
        } else {
          const errMsg = `Depot ${depotNum}: ${downloadResult.errorMessage || 'unknown error'}`
          errors.push(errMsg)
          safeAddLog('WARN', `[Steampipe] ${errMsg}`)
        }
      } catch (err: any) {
        const errMsg = `Depot ${depotNum} error: ${err.message}`
        errors.push(errMsg)
        safeAddLog('ERROR', `[Steampipe] ${errMsg}`)
      }
    }

    if (errors.length === 0) {
      const msg = `${gameName} downloaded successfully to C:\\Users\\{user}\\AppData\\Local\\Y-core\\Games\\${appId}\\`
      actions.push(msg)
      safeAddLog('INFO', `[Steampipe] ${gameName} downloaded completely`)
      return { success: true, actions }
    } else {
      safeAddLog('WARN', `[Steampipe] ${gameName} completed with errors: ${errors.join('; ')}`)
      return { success: false, error: errors[0], actions, errors }
    }
  } catch (err: any) {
    const errMsg = err.message || String(err)
    safeAddLog('ERROR', `[Steampipe] Fatal error: ${errMsg}`)
    return {
      success: false,
      error: errMsg,
      errors: [errMsg],
    }
  }
}

/**
 * H1.7 (missing-depots UX fix) — toma una lista de mensajes de error del
 * backend y los enriquece con URLs de depotbox.org si detectamos el patrón
 * "Missing depot keys for: ...". Steam nos prohíbe scrape nosotros mismos;
 * mostramos al usuario exactamente qué depot necesita clave externa y un
 * enlace directo al proveedor comunitario que sí las ofrece.
 */
function enrichErrorsWithDepotLinks(errors: string[] | undefined): string[] {
  if (!errors || errors.length === 0) return []
  return errors.map((err) => {
    const missing = extractMissingDepotIds(err)
    if (missing.length === 0) return err
    const links = buildDepotboxLinks(missing)
    const extra = t('errors.missingDepots')
    return `${err}\n${extra}\n${links}`
  })
}

interface InstallResult { type: 'success' | 'error' | 'info'; message: string }

const GOLDSRC_MOD_APP_IDS = new Set([
  '10', '20', '30', '40', '50', '60', '80', '100', '130',
])

export interface RestartPrompt {
  title: string
  message: string
  onConfirm: () => void
  confirmLabel?: string
}

/**
 * H1.4 — clasifica el errorKey de SteamCMD hacia una razón de fallback
 * humanamente visible en SettingsPage. Si llega un errorKey no clasificado,
 * logueamos warning para que devs lo agreguen al switch sin pasar
 * desapercibido.
 */
function reasonFromSteamCmdErrorKey(errorKey?: string): InstallFallbackReason {
  switch (errorKey) {
    case 'errors.steamcmd.notFound':
    case 'errors.steamcmd.installDirCreateFailed':
    case 'errors.steamcmd.alreadyRunning':
      return 'steamcmd-not-available'
    case 'errors.steamcmd.notAnonymous':
      return 'notAnonymous'
    case 'errors.steamcmd.spawnFailed':
      return 'spawn-failed'
    default:
      if (errorKey) {
        // Visible: nuevo errorKey sin clasificar — agregar al switch.
        try {
          const fn = window.steamtools?.addLog
          if (fn) fn({ level: 'WARN', message: `[Install] unknown SteamCMD errorKey="${errorKey}", defaulting to 'stalled'` }).catch(() => {})
        } catch { /* non-Electron */ }
      }
      return 'stalled'
  }
}

/**
 * H1.4 — wrapper robusto para window.steamtools.addLog que sobrevive en
 * contextos no-Electron (tests, CLI). El patrón `?.addLog?.(...)?.catch?.()`
 * evita TypeError si addLog está undefined (el `.catch` no es opcional).
 */
function safeAddLog(level: 'INFO' | 'WARN' | 'ERROR', message: string): void {
  const fn = window.steamtools?.addLog
  if (fn) fn({ level, message }).catch(() => { /* swallow */ })
}

/**
 * H1.4 — flujo de install vía SteamCMD cuando esté disponible.
 *
 * Retorna:
 *   { success: true }            → install manager aceptó la request.
 *   { success: false, reason }   → la request falló; caller debe hacer fallback a cliente.
 *
 * IMPORTANTE: NO pasamos installDir desde renderer — main side lo computa
 * como ${userData}/Library/${appId} (ver H1.2 IPC handler en electron/main.ts).
 * El renderer no tiene acceso a userData absoluto, así que cualquier path
 * calculado acá fallaría el sanitization check del gatekeeper.
 */
async function trySteamCmdInstallFlow(
  appId: string,
  gameName: string,
): Promise<{ success: boolean; reason?: InstallFallbackReason }> {
  // 1. Steam debe estar cerrado antes del fork (SteamCMD toma el lock).
  const closeResult = await window.steamtools?.closeSteam?.()
  if (closeResult && !closeResult.success) {
    return { success: false, reason: 'spawn-failed' }
  }

  try {
    const result = await window.steamtools?.startSteamCmdInstall?.({ appId })
    if (!result?.success) {
      return {
        success: false,
        reason: reasonFromSteamCmdErrorKey(result?.errorKey) || 'stalled',
      }
    }
    if (result.queued) {
      // Concurrency llena; el manager arrancará cuando libere slot. Para el
      // processor esto cuenta como "success" eventual salvo polled FAILED.
    }
    return { success: true }
  } catch {
    return { success: false, reason: 'spawn-failed' }
  }
}

// Processes the global download queue. Mounted once at the app shell level so
// installs keep progressing regardless of which page the user navigates to —
// previously this lived inside StorePage and silently stalled ("queued forever")
// whenever an install was started from a page other than the store (e.g. GameDetailPage).
export function useInstallProcessor(onRestartPrompt: (prompt: RestartPrompt) => void) {
  const { showToast } = useToastStore()
  const consumeGame = useRecommendationStore((s) => s.consumeGame)
  const pollAbortRef = useRef<AbortController | null>(null)
  const pollJobRef = useRef<((jobId: string, appId: string, gameName?: string) => Promise<void>) | null>(null)

  const pollJob = useCallback(async (jobId: string, appId: string, _gameName?: string) => {
    pollAbortRef.current?.abort()
    const abortController = new AbortController()
    pollAbortRef.current = abortController

    const { setImportProgress } = useDownloadQueueStore.getState()
    setImportProgress({ appId, status: 'queued' })

    let attempts = 0
    const maxAttempts = 200
    while (attempts < maxAttempts) {
      if (abortController.signal.aborted) return
      await new Promise(resolve => setTimeout(resolve, 3000))
      if (abortController.signal.aborted) return
      attempts++

      let job
      try {
        job = await getJobStatus(jobId)
      } catch (err: any) {
        window.steamtools?.addLog?.({ level: 'WARN', message: `[Install] pollJob: getJobStatus error (attempt ${attempts}): ${err.message}` })?.catch?.(() => {})
        continue
      }

      if (job.status === 'completed' && job.result) {
        setImportProgress(null)
        const result = await window.steamtools.storeInstallGame({
          app_id: job.result.app_id,
          name: job.result.name,
          lua_content: job.result.lua_content,
          manifest_files: job.result.manifest_files.map(m => ({ depot_id: m.depot_id, manifest_id: m.manifest_gid })),
          depot_keys: job.result.depot_keys.map(k => ({ depot_id: k.depot_id, key: k.decryption_key })),
        })
        if (result.success) {
          try { await reportDownloaded(appId) } catch {}
          consumeGame(appId)
        } else {
          showToast('error', result.errors?.[0] || result.error || `${t('store.installFailed')} after import`)
        }
        return
      }

      if (job.status === 'failed') {
        setImportProgress(null)
        showToast('error', job.error_message || t('store.importFailed'))
        return
      }

      setImportProgress({ appId, status: job.status })
    }

    if (abortController.signal.aborted) return
    setImportProgress(null)
    showToast('error', t('store.importTimeout'))
  }, [consumeGame, showToast])

  pollJobRef.current = pollJob

  const processQueue = useCallback(async () => {
    const { processing, dequeue, setProcessing, setCurrent, setImportProgress } = useDownloadQueueStore.getState()
    if (processing) return
    const item = dequeue()
    if (!item) return

    setProcessing(true)
    setCurrent(item)
    try {
      const closeResult = await window.steamtools.closeSteam()
      if (closeResult && !closeResult.success) {
        showToast('error', closeResult.error || t('store.failedCloseSteam'))
        return
      }

      if (GOLDSRC_MOD_APP_IDS.has(item.appId)) {
        const baseResp = await installGame('70')
        if (baseResp.status === 'ready' && baseResp.game) {
          const result = await window.steamtools.storeInstallGame({
            app_id: '70',
            name: 'Half-Life',
            lua_content: baseResp.game.lua_content,
            manifest_files: baseResp.game.manifest_files.map(m => ({ depot_id: m.depot_id, manifest_id: m.manifest_gid })),
            depot_keys: baseResp.game.depot_keys.map(k => ({ depot_id: k.depot_id, key: k.decryption_key })),
          })
          if (!result.success) {
            showToast('error', result.errors?.[0] || result.error || t('store.failedInstallBase'))
            return
          }
          try { await reportDownloaded('70') } catch {}
        } else if (baseResp.status === 'queued') {
          await pollJobRef.current!(baseResp.job_id!, '70')
        }
      }

      const resp = await installGame(item.appId)

      if (resp.status === 'ready' && resp.game) {
        // Reflejar el job como 'preparing' de inmediato en el store para que
        // /downloads lo muestre en cuanto el install es despachable. El
        // bridge de SteamCMD va a sobrescribir upsertActive con el primer
        // progress event real (típicamente ~50-200 ms más tarde). Para el
        // camino Lua (sin eventos SteamCMD) el estado queda en 'preparing'
        // hasta que el dispatch termina — no abrimos ningún modal, la
        // página /downloads es la única superficie de progreso.
        const { upsertActive } = useSteamCmdJobsStore.getState()
        upsertActive({
          appId: String(resp.game.app_id),
          gameName: resp.game.name,
          state: 'preparing',
          percent: 0,
          bytesDownloaded: 0,
          bytesTotal: 0,
          speed: 0,
          eta: null,
          currentFile: null,
          error: null,
          retries: 0,
          peakSpeed: 0,
          elapsedSec: 0,
          startedAt: Date.now(),
          lastUpdatedAt: Date.now(),
        })

        // H1.4 — dispatch entre SteamCMD, steampipe y cliente Lua.
        const { installMethod } = useSettingsStore.getState()
        const wantsSteamCmd = installMethod === 'steamcmd' || installMethod === 'auto'
        const wantsSteampipe = installMethod === 'steampipe'
        let usedSteamCmd = false
        let usedSteampipe = false
        let aborted = false
        let fallbackReason: InstallFallbackReason | null = null

        // Try steampipe first if user explicitly chose it
        if (wantsSteampipe && resp.game.depot_keys.length > 0) {
          safeAddLog('INFO', `[Install] Using steampipe (direct CDN download) for ${item.name}`)
          showToast('info', 'Descargando con steampipe (sin Steam)...')
          try {
            const steampipeResult = await downloadGameWithoutSteam(
              String(resp.game.app_id),
              resp.game.name,
              resp.game.depot_keys.map(k => ({ depot_id: k.depot_id, key: k.decryption_key })),
              resp.game.manifest_files
            )
            if (steampipeResult.success) {
              usedSteampipe = true
              try { await reportDownloaded(item.appId) } catch {}
              consumeGame(item.appId)
              safeAddLog('INFO', `[Install] ${item.name} downloaded via steampipe (appId=${resp.game.app_id})`)
            } else {
              fallbackReason = 'spawn-failed'
              await useSettingsStore.getState().setInstallFallbackReason(fallbackReason)
              showToast('error', steampipeResult.error || 'Steampipe download failed')
              safeAddLog('WARN', `[Install] Steampipe failed: ${steampipeResult.error}`)
            }
          } catch (err: any) {
            fallbackReason = 'spawn-failed'
            await useSettingsStore.getState().setInstallFallbackReason(fallbackReason)
            showToast('error', err.message || 'Steampipe error')
            safeAddLog('WARN', `[Install] Steampipe error: ${err.message}`)
          }
        }

        if (!usedSteampipe && wantsSteamCmd) {
          let available = await window.steamtools?.isSteamCmdAvailable?.()
          // H1.7.3 — SteamCMD no está descargado pero el usuario quiere
          // SteamCMD (o auto). Descargamos en background con toast visible
          // y reintentamos. Sin esto el dispatcher caía silenciosamente a
          // cliente Lua y el usuario quedaba sin saber por qué SteamCMD
          // "no funciona".
          if (!available && window.steamtools?.fetchSteamCmd) {
            showToast(
              'info',
              t('install.fetchingSteamCmd') ||
                'Descargando SteamCMD por primera vez (~10 MB)...',
            )
            safeAddLog('INFO', `[Install] SteamCMD no disponible, disparando fetch on-demand`)
            const fetchResult = await window.steamtools.fetchSteamCmd()
            if (fetchResult?.success) {
              available = await window.steamtools?.isSteamCmdAvailable?.()
              if (available) {
                showToast('success', t('install.steamCmdReady') || 'SteamCMD listo.')
                safeAddLog('INFO', `[Install] SteamCMD descargado y disponible`)
              }
            } else {
              safeAddLog(
                'WARN',
                `[Install] SteamCMD on-demand failed: ${fetchResult?.error ?? 'unknown'}`,
              )
            }
          }
          if (available) {
            const steamResult = await trySteamCmdInstallFlow(
              String(resp.game.app_id),
              resp.game.name,
            )
            if (steamResult.success) {
              usedSteamCmd = true
              try { await reportDownloaded(item.appId) } catch {}
              consumeGame(item.appId)
              safeAddLog('INFO', `[Install] ${item.name} started via SteamCMD (appId=${resp.game.app_id})`)
            } else {
              fallbackReason = steamResult.reason ?? 'stalled'
              await useSettingsStore.getState().setInstallFallbackReason(fallbackReason)
              // H1.7.5 — sanity log para devs: si reason es spawn-failed
              // cuando solo estaba el binario ausente, lvl=WARN.
              if (fallbackReason === 'spawn-failed') {
                safeAddLog(
                  'WARN',
                  `[Install] SteamCMD returned reason='spawn-failed' \u2014 \u00bffue el binario ausente o un spawn real? Ver electron/modules/steamcmd-manager.ts.`,
                )
              }
              showToast('info', t('install.fallbackToClient') || `SteamCMD no se pudo (${fallbackReason}), usando cliente Steam.`)
              safeAddLog('WARN', `[Install] SteamCMD fallback a cliente: ${fallbackReason}`)
            }
          } else {
            // H1.7.4 — fix de "el cmd no funciona": el comportamiento correcto
            // depende de qué método eligió el usuario.
            if (installMethod === 'steamcmd') {
              // Usuario FORZÓ SteamCMD. Respetamos su decisión: NO caemos al
              // cliente Lua. Eso era exactamente el bug original. ABORTAMOS
              // el install y dejamos que vaya a Configuración → SteamCMD.
              // NO persistimos `lastInstallFallbackReason` porque NO ocurrió
              // un fallback — sería misleading: el banner amber diría
              // "cayó al cliente Steam" cuando en realidad abortamos.
              showToast(
                'error',
                t('install.steamCmdRequired') ||
                  'SteamCMD no está disponible y elegiste SteamCMD. Abrí Configuración → SteamCMD o cambiá a Steam Client / Auto.',
                8000,
              )
              safeAddLog('WARN', `[Install] SteamCMD forzado pero no disponible; install ABORTADO (no fallback). appId=${item.appId}`)
              aborted = true
            } else {
              // 'auto' o 'steamclient': ambos son consentimientos explícitos o
              // implícitos de caer al cliente Lua. Persistimos la razón para
              // que SettingsPage muestre el banner amber con el motivo.
              fallbackReason = 'steamcmd-not-available'
              await useSettingsStore.getState().setInstallFallbackReason(fallbackReason)
              if (installMethod === 'auto') {
                showToast(
                  'info',
                  t('install.fallbackToClient') ||
                    'SteamCMD no disponible, usando cliente Steam como alternativa.',
                )
              }
              // 'steamclient' es silent (es el método elegido, no es fallback).
            }
          }
        }

        if (!usedSteamCmd && !usedSteampipe && !aborted) {
          // First, try with Steam if installed
          const canUseSteam = await window.steamtools?.getSteamPath?.().then((r) => r.success).catch(() => false)

          let result: any = null

          if (canUseSteam) {
            result = await window.steamtools.storeInstallGame({
              app_id: resp.game.app_id,
              name: resp.game.name,
              lua_content: resp.game.lua_content,
              manifest_files: resp.game.manifest_files.map(m => ({ depot_id: m.depot_id, manifest_id: m.manifest_gid })),
              depot_keys: resp.game.depot_keys.map(k => ({ depot_id: k.depot_id, key: k.decryption_key })),
            })
          }

          // Fallback: si Steam no está disponible O storeInstallGame falló, usa steampipe
          if (!result?.success && resp.game.depot_keys.length > 0) {
            if (!canUseSteam) {
              safeAddLog('INFO', `[Install] Steam not found, downloading without Steam for ${item.name}`)
              showToast('info', 'Steam no encontrado, descargando sin Steam...')
            } else {
              safeAddLog('INFO', `[Install] storeInstallGame failed, trying steampipe fallback for ${item.name}`)
              showToast('info', 'Usando fallback: steampipe...')
            }
            try {
              result = await downloadGameWithoutSteam(
                resp.game.app_id,
                resp.game.name,
                resp.game.depot_keys.map(k => ({ depot_id: k.depot_id, key: k.decryption_key })),
                resp.game.manifest_files
              )
            } catch (fallbackErr: any) {
              result = {
                success: false,
                error: `Steampipe fallback failed: ${fallbackErr.message}`,
                actions: [],
                errors: [`Steampipe fallback failed: ${fallbackErr.message}`],
              }
            }
          }

          if (!result) {
            result = {
              success: false,
              error: 'No installation method available',
              actions: [],
              errors: ['Steam is not installed and steampipe is not available'],
            }
          }

          const actions: InstallResult[] = []
          if (result.actions) for (const a of result.actions) actions.push({ type: 'info', message: a })
          if (result.errors) for (const e of result.errors) actions.push({ type: 'error', message: e })
          if (result.success) {
            actions.push({ type: 'success', message: `${item.name} installed` })
            try { await reportDownloaded(item.appId) } catch {}
            consumeGame(item.appId)
          }
          for (const action of actions) {
            window.steamtools.addLog({
              level: action.type === 'error' ? 'ERROR' : 'INFO',
              message: `[Install] ${action.message}`,
            }).catch((e) => console.warn('[Install] addLog failed:', e))
          }
          if (!result.success) {
            const enriched = enrichErrorsWithDepotLinks(result.errors)
            showToast('error', enriched[0] || result.error || t('store.installFailed'))
          }
        }
      } else if (resp.status === 'queued' && resp.job_id) {
        await pollJobRef.current!(resp.job_id, item.appId, item.name)
      } else {
        showToast('error', t('store.unexpectedResponse'))
      }
    } catch (err: any) {
      const errorMsg = err.message || 'Unknown error'
      const fullDetails = err.fullResponse ? JSON.stringify(err.fullResponse) : ''
      window.steamtools.addLog({
        level: 'ERROR',
        message: `[Install] Install failed for appId=${item.appId}: ${errorMsg}${fullDetails ? ' | Details: ' + fullDetails : ''}`
      }).catch((e) => console.warn('[Install] addLog failed:', e))

      let displayMsg = errorMsg

      // Try to extract backend error details from JSON
      try {
        const parsed = JSON.parse(errorMsg)
        if (parsed.t) displayMsg = parsed.t
        if (parsed.p?.details) displayMsg = parsed.p.details + ' (' + parsed.t + ')'
      } catch {}

      if (displayMsg.includes('429') || displayMsg.includes('rate limit')) {
        displayMsg = displayMsg + ' — ' + t('errors.api.rateLimited')
      } else if (displayMsg.includes('403') || displayMsg.includes('Forbidden')) {
        displayMsg = displayMsg + ' — ' + t('errors.api.forbidden')
      } else if (displayMsg.includes('404') || displayMsg.includes('Not Found')) {
        displayMsg = displayMsg + ' — ' + t('errors.api.notFound')
      } else if (displayMsg.includes('subscription') || displayMsg.includes('suscripción') || displayMsg.includes('Subscription') || displayMsg.includes('requires login')) {
        displayMsg = 'BACKEND ERROR - Depot Keys: ' + displayMsg + '\n\nEste juego requiere keys de depot que el servidor no pudo obtener. Motivos posibles: (1) Juego de pago sin keys públicas, (2) Server de depot keys caído, (3) Juego removido de Steam.'
      } else if (displayMsg.includes('timeout')) {
        displayMsg = displayMsg + ' — ' + t('errors.api.timeout')
      }
      showToast('error', displayMsg)
    } finally {
      setImportProgress(null)
      setCurrent(null)
      setProcessing(false)
      // If queue is empty, offer restart
      if (useDownloadQueueStore.getState().queue.length === 0) {
        onRestartPrompt({
          title: t('store.installComplete'),
          message: t('store.restartPrompt'),
          confirmLabel: 'Reiniciar',
          onConfirm: async () => {
            const r = await window.steamtools.restartSteam()
            if (!r?.success) showToast('error', r?.error || t('store.restartFailed'))
          },
        })
      }
      processQueue()
    }
  }, [showToast, consumeGame, onRestartPrompt])

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
