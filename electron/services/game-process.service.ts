import {
  launchGame, getProcessStatus, killGame, listRunningProcesses,
  getPlayTimeSummary, formatPlayTime, syncAllPendingSessions,
} from '../modules/game-process'

export const gameProcessService = {
  async launchGame(appId: string, executablePath: string, launchCommand: string, env: any) {
    return launchGame(appId, executablePath, launchCommand, env)
  },
  async getStatus(appId: string) {
    return getProcessStatus(appId)
  },
  async killGame(appId: string, timeoutMs?: number) {
    return killGame(appId, timeoutMs)
  },
  async listRunning() {
    return listRunningProcesses()
  },
  async getPlayTime(appId: string) {
    return getPlayTimeSummary(appId)
  },
  async formatPlayTime(totalSeconds: number) {
    return formatPlayTime(totalSeconds)
  },
  async syncPendingSessions() {
    syncAllPendingSessions()
    return { success: true }
  },
}
