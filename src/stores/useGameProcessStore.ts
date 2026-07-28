import { create } from 'zustand'
import type { GameProcessStatus, PlayTimeSummary } from '../domain/types'
import { gameProcessService } from '../services/game-process.service'

interface GameProcessStore {
  runningGames: { appId: string; pid: number; elapsedSeconds: number }[]
  monitoredApp: string | null
  processStatus: GameProcessStatus | null
  playTime: PlayTimeSummary | null
  loading: boolean
  error: string | null

  launchGame: (appId: string, executablePath: string, launchCommand: string, env?: any) => Promise<void>
  getStatus: (appId: string) => Promise<void>
  killGame: (appId: string) => Promise<void>
  listRunning: () => Promise<void>
  getPlayTime: (appId: string) => Promise<void>
  monitorProcess: (appId: string | null) => void
  clearError: () => void
}

export const useGameProcessStore = create<GameProcessStore>((set, get) => ({
  runningGames: [],
  monitoredApp: null,
  processStatus: null,
  playTime: null,
  loading: false,
  error: null,

  launchGame: async (appId, executablePath, launchCommand, env) => {
    set({ loading: true, error: null })
    try {
      const result = await gameProcessService.launchGame(appId, executablePath, launchCommand, env)
      set({
        processStatus: result as GameProcessStatus,
        monitoredApp: appId,
        loading: false,
      })
      await get().listRunning()
    } catch (err: any) {
      set({ error: err?.message || 'Failed to launch game', loading: false })
    }
  },

  getStatus: async (appId) => {
    try {
      const status = await gameProcessService.getStatus(appId)
      set({ processStatus: status as GameProcessStatus })
    } catch {
      // Ignore status polling errors
    }
  },

  killGame: async (appId) => {
    try {
      await gameProcessService.killGame(appId)
      if (get().monitoredApp === appId) {
        set({
          processStatus: { pid: null, running: false, startTime: null, elapsedSeconds: 0 },
          monitoredApp: null,
        })
      }
      await get().listRunning()
    } catch (err: any) {
      set({ error: err?.message || 'Failed to kill game' })
    }
  },

  listRunning: async () => {
    try {
      const running = await gameProcessService.listRunning()
      set({ runningGames: running as { appId: string; pid: number; elapsedSeconds: number }[] })
    } catch {
      // Ignore
    }
  },

  getPlayTime: async (appId) => {
    try {
      const pt = await gameProcessService.getPlayTime(appId)
      set({ playTime: pt as PlayTimeSummary })
    } catch {
      // Ignore
    }
  },

  monitorProcess: (appId) => {
    const current = get().monitoredApp
    if (current === appId) {
      // Already monitoring
      return
    }
    set({ monitoredApp: appId, processStatus: null })
    if (appId) {
      get().getStatus(appId)
    }
  },

  clearError: () => set({ error: null }),
}))

// Auto-poll running processes every 5 seconds
let pollInterval: ReturnType<typeof setInterval> | null = null

export function startProcessPolling() {
  if (pollInterval) return
  pollInterval = setInterval(() => {
    useGameProcessStore.getState().listRunning()
  }, 5000)
}

export function stopProcessPolling() {
  if (pollInterval) {
    clearInterval(pollInterval)
    pollInterval = null
  }
}
