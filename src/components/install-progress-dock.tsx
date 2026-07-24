// src/components/install-progress-dock.tsx
//
// Bridge de eventos SteamCMD → useSteamCmdJobsStore. NO renderiza ningún
// modal — la única superficie de progreso de descargas es la página
// /downloads (ver src/pages/DownloadsPage.tsx). Antes este archivo también
// definía un modal flotante ("dock") que se abría encima de cualquier
// pantalla; se eliminó porque el usuario quiere ser llevado a /downloads,
// no interrumpido por una ventana emergente.
//
// Responsabilidad única: escuchar `window.steamtools.onSteamCmdProgress` y
// mantener el store (`active` / `history`) al día para que DownloadsPage lo
// lea reactivamente.

import { useEffect } from 'react'
import {
  useSteamCmdJobsStore,
  type SteamCmdState,
} from '../stores/useSteamCmdJobsStore'
import { useToastStore } from '../stores/useToastStore'
import { tf } from '../lib/i18n'

// El backend (electron/modules/steamcmd-types.ts) usa un set de estados
// distinto al del store del frontend: 'done' en vez de 'complete', y
// 'committing' no existe del lado del frontend (se trata como 'verifying').
// Sin este mapeo, `next.state === 'complete'` nunca matcheaba (el backend
// nunca manda 'complete') y finalizeActive() no se disparaba desde progress.
function mapBackendState(raw: string): SteamCmdState {
  if (raw === 'done') return 'complete'
  if (raw === 'committing') return 'verifying'
  return raw as SteamCmdState
}

export function useSteamCmdBridge() {
  const upsertActive = useSteamCmdJobsStore((s) => s.upsertActive)
  const finalizeActive = useSteamCmdJobsStore((s) => s.finalizeActive)
  const showToast = useToastStore((s) => s.showToast)
  useEffect(() => {
    const unsub = window.steamtools?.onSteamCmdProgress?.((payload) => {
      const next = {
        appId: String(payload.appId),
        gameName: (payload as { gameName?: string }).gameName ?? String(payload.appId),
        state: mapBackendState(payload.state),
        percent: Number(payload.percent ?? 0),
        bytesDownloaded: Number(payload.bytesDownloaded ?? 0),
        bytesTotal: Number(payload.bytesTotal ?? 0),
        speed: Number(payload.speedBytesPerSec ?? 0),
        eta: payload.etaSeconds && payload.etaSeconds > 0 ? payload.etaSeconds : null,
        currentFile: (payload as { currentFile?: string | null }).currentFile ?? null,
        error: (payload as { error?: string | null }).error ?? payload.errorMessage ?? null,
        retries: Number((payload as { retries?: number }).retries ?? 0),
        peakSpeed: 0,
        elapsedSec: 0,
        // Campo requerido por la interfaz SteamCmdLiveJob. El store lo
        // sobrescribe en upsertActive() cuando detecta cambio de appId; si
        // es la misma appId (caso normal), conserva el startedAt anterior
        // para que el acumulado elapsedSec no se rompa.
        startedAt: Date.now(),
        lastUpdatedAt: Date.now(),
      }
      if (next.state === 'complete') {
        upsertActive(next)
        finalizeActive('complete')
      } else if (next.state === 'failed') {
        upsertActive(next)
        finalizeActive('failed', next.error ?? 'unknown')
        // Sin este toast, un job que muere sin que el usuario esté mirando
        // /downloads (p.ej. el proceso SteamCMD terminado abruptamente por
        // un SIGTERM externo) desaparece del estado 'active' silenciosamente
        // — el usuario nunca se entera de que la descarga falló.
        showToast(
          'error',
          tf('downloads.jobFailed', {
            name: next.gameName,
            reason: next.error ?? 'unknown',
          }),
        )
      } else {
        upsertActive(next)
      }
    })
    return () => {
      if (typeof unsub === 'function') unsub()
    }
  }, [upsertActive, finalizeActive, showToast])
}

// Mount único para App.tsx — solo conecta el listener IPC al store, sin UI.
export function InstallProgressDockMount() {
  useSteamCmdBridge()
  return null
}
