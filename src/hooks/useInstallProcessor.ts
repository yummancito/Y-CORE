import { useCallback, useEffect, useRef } from 'react'
import { t } from '../lib/i18n'
import { useToastStore } from '../stores/useToastStore'
import { useDownloadQueueStore } from '../stores/useDownloadQueueStore'
import { useRecommendationStore } from '../stores/useRecommendationStore'
import { installGame, getJobStatus, reportDownloaded } from '../lib/y-core-api'

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
        const result = await window.steamtools.storeInstallGame({
          app_id: resp.game.app_id,
          name: resp.game.name,
          lua_content: resp.game.lua_content,
          manifest_files: resp.game.manifest_files.map(m => ({ depot_id: m.depot_id, manifest_id: m.manifest_gid })),
          depot_keys: resp.game.depot_keys.map(k => ({ depot_id: k.depot_id, key: k.decryption_key })),
        })

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
          showToast('error', result.errors?.[0] || result.error || t('store.installFailed'))
        }
      } else if (resp.status === 'queued' && resp.job_id) {
        await pollJobRef.current!(resp.job_id, item.appId, item.name)
      } else {
        showToast('error', t('store.unexpectedResponse'))
      }
    } catch (err: any) {
      window.steamtools.addLog({ level: 'ERROR', message: `[Install] Install failed: ${err.message}` }).catch((e) => console.warn('[Install] addLog failed:', e))
      showToast('error', err.message)
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
