// src/stores/useSteamCmdJobsStore.ts
//
// Estado live de jobs SteamCMD, leído por la página /downloads.
//
// Decisión arquitectónica: separado de useDownloadQueueStore porque el flujo
//   SteamCMD emite progress granular (bytes/speed/ETA/state per-segment) que
//   no aplica al cliente Lua (solo "queued" / "imported" / "failed"). Mezclar
//   ambos en una sola store añadiría ramas innecesarias.
//
// Slice propio:
//   - active:         job actualmente corriendo (con state machine).
//   - history:        buffer corto FIFO de los últimos jobs (vista "Recientes").
//
// La cola pre-pendiente (waiting) se lee directamente de useDownloadQueueStore.

import { create } from 'zustand'

export type SteamCmdState =
  | 'queued'
  | 'preparing'
  | 'preallocating'
  | 'allocating'
  | 'downloading'
  | 'verifying'
  | 'stalled'
  | 'failed'
  | 'complete'

export interface SteamCmdLiveJob {
  appId: string
  gameName: string
  state: SteamCmdState
  percent: number
  bytesDownloaded: number
  bytesTotal: number
  /** velocidad instantánea, bytes/seg. 0 cuando está stalled. */
  speed: number
  /** segundos restantes (SteamCMD provee). null si desconocido. */
  eta: number | null
  /** chunk / file que está procesando. undefined cuando se reporta genérico. */
  currentFile: string | null
  /** mensaje crudo de error si state === 'failed'. */
  error: string | null
  /** para ETA/conectividad: 0–100. Se proyecta como reintentos si stalled. */
  retries: number
  /** velocidad pico observada durante este job (bytes/s). */
  peakSpeed: number
  /** tiempo total desde start (seg). Se proyecta al stats grid en completed. */
  elapsedSec: number
  startedAt: number
  lastUpdatedAt: number
}

type HistoryEntry = SteamCmdLiveJob & { endedAt: number; durationSec: number }

interface SteamCmdJobsStore {
  active: SteamCmdLiveJob | null
  history: HistoryEntry[]

  /** Reemplaza el active. Si era null y entra un new job, resetea startedAt. */
  upsertActive: (job: SteamCmdLiveJob) => void
  finalizeActive: (finalState: 'complete' | 'failed', reason?: string) => void
  /** Llamado al shutdown de la app para limpiar historial. */
  reset: () => void
}

const HISTORY_MAX = 8

export const useSteamCmdJobsStore = create<SteamCmdJobsStore>((set) => ({
  active: null,
  history: [],

  upsertActive: (job) =>
    set((state) => {
      const isNew = !state.active || state.active.appId !== job.appId
      const startedAt = isNew ? Date.now() : state.active!.startedAt
      const elapsedSec = Math.floor((Date.now() - startedAt) / 1000)
      const prevPeak = state.active ? state.active.peakSpeed : 0
      const peakSpeed = job.speed > prevPeak ? job.speed : prevPeak
      return {
        active: { ...job, startedAt, lastUpdatedAt: Date.now(), elapsedSec, peakSpeed },
      }
    }),

  finalizeActive: (finalState, reason) =>
    set((state) => {
      if (!state.active) return state
      const endedAt = Date.now()
      const entry: HistoryEntry = {
        ...state.active,
        state: finalState,
        error: reason ?? state.active.error,
        endedAt,
        durationSec: Math.floor((endedAt - state.active.startedAt) / 1000),
        lastUpdatedAt: endedAt,
        // En complete, forzamos 100% para que la UI muestre correctamente.
        percent: finalState === 'complete' ? 100 : state.active.percent,
      }
      return {
        active: null,
        history: [entry, ...state.history].slice(0, HISTORY_MAX),
      }
    }),

  reset: () => set({ active: null, history: [] }),
}))
