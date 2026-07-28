// ============================================================================
// src/stores/useTaskCenterStore.ts
// ----------------------------------------------------------------------------
// Task Center — lightweight aggregation store that reads from all existing
// stores to provide a unified view of all system operations.
// ============================================================================

import { create } from 'zustand'
import { useDownloadEngineStore } from './useDownloadEngineV3Store'
import { useGameProcessStore } from './useGameProcessStore'
import { useSaveManagerStore } from './useSaveManagerStore'
import { useMaintenanceStore } from './useMaintenanceStore'

export type TaskCategory = 'download' | 'process' | 'backup' | 'maintenance' | 'update'

export interface UnifiedTask {
  id: string
  category: TaskCategory
  title: string
  description: string
  state: 'running' | 'queued' | 'paused' | 'completed' | 'failed' | 'idle'
  progress: number // 0-100
  createdAt: number
  completedAt?: number
  error?: string
  // Actions available
  canCancel: boolean
  canPause: boolean
  canRetry: boolean
  // Source data for action dispatching
  sourceId: string // appId or taskId
  sourceType: 'appId' | 'taskId'
}

interface TaskCenterState {
  activeTasks: UnifiedTask[]
  recentTasks: UnifiedTask[]
  filter: 'all' | 'running' | 'completed' | 'failed'
  category: 'all' | TaskCategory
  search: string

  setFilter: (f: TaskCenterState['filter']) => void
  setCategory: (c: TaskCenterState['category']) => void
  setSearch: (s: string) => void
  cancelTask: (task: UnifiedTask) => Promise<void>
  pauseTask: (task: UnifiedTask) => Promise<void>
  retryTask: (task: UnifiedTask) => Promise<void>
  refresh: () => void
}

function mapDownloadState(state: string): UnifiedTask['state'] {
  switch (state) {
    case 'downloading': case 'preparing': case 'connecting': case 'verifying': return 'running'
    case 'queued': return 'queued'
    case 'paused': return 'paused'
    case 'completed': return 'completed'
    case 'failed': return 'failed'
    default: return 'idle'
  }
}

function buildUnifiedTasks(): { active: UnifiedTask[]; recent: UnifiedTask[] } {
  const active: UnifiedTask[] = []
  const recent: UnifiedTask[] = []

  // 1. Download tasks from Download Engine V3
  const dlStore = useDownloadEngineStore.getState()
  const dlTasks = dlStore.tasks || []
  const dlHistory = dlStore.history || []
  const now = Date.now()

  for (const task of dlTasks) {
    const state = mapDownloadState(task.state)
    const u: UnifiedTask = {
      id: `dl-${task.id}`,
      category: 'download',
      title: task.name || `App ${task.appId}`,
      description: task.state === 'downloading'
        ? `${(task.bytesDownloaded / 1024 / 1024).toFixed(1)} MB / ${(task.bytesTotal / 1024 / 1024).toFixed(1)} MB`
        : task.state === 'failed' ? task.errorMessage || 'Download failed'
        : task.state,
      state,
      progress: task.percent || 0,
      createdAt: task.createdAt || now,
      completedAt: task.completedAt,
      error: task.errorMessage,
      canCancel: state === 'running' || state === 'queued' || state === 'paused',
      canPause: state === 'running',
      canRetry: state === 'failed',
      sourceId: task.id,
      sourceType: 'taskId',
    }
    if (state === 'completed' || state === 'failed') {
      recent.push(u)
    } else {
      active.push(u)
    }
  }

  for (const task of dlHistory) {
    const state = mapDownloadState(task.state)
    recent.push({
      id: `dl-hist-${task.id}`,
      category: 'download',
      title: task.name || `App ${task.appId}`,
      description: state === 'completed' ? `Completed` : task.errorMessage || state,
      state,
      progress: task.percent || 100,
      createdAt: task.createdAt || now,
      completedAt: task.completedAt,
      error: task.errorMessage,
      canCancel: false,
      canPause: false,
      canRetry: state === 'failed',
      sourceId: task.id,
      sourceType: 'taskId',
    })
  }

  // 2. Running games from GameProcessStore
  const gpStore = useGameProcessStore.getState()
  for (const game of gpStore.runningGames || []) {
    active.push({
      id: `gp-${game.appId}`,
      category: 'process',
      title: `App ${game.appId}`,
      description: `PID ${game.pid} · Running for ${game.elapsedSeconds}s`,
      state: 'running',
      progress: -1, // indeterminate
      createdAt: now,
      canCancel: true,
      canPause: false,
      canRetry: false,
      sourceId: game.appId,
      sourceType: 'appId',
    })
  }

  // 3. Backup operations from SaveManagerStore
  const smStore = useSaveManagerStore.getState()
  if (smStore.backingUp) {
    active.push({
      id: `backup-${now}`,
      category: 'backup',
      title: 'Creating backup',
      description: 'Save backup in progress...',
      state: 'running',
      progress: -1,
      createdAt: now,
      canCancel: false,
      canPause: false,
      canRetry: false,
      sourceId: '',
      sourceType: 'taskId',
    })
  }
  if (smStore.restoring) {
    active.push({
      id: `restore-${now}`,
      category: 'backup',
      title: 'Restoring backup',
      description: 'Save restore in progress...',
      state: 'running',
      progress: -1,
      createdAt: now,
      canCancel: false,
      canPause: false,
      canRetry: false,
      sourceId: '',
      sourceType: 'taskId',
    })
  }

  // 4. Maintenance operations
  const mtStore = useMaintenanceStore.getState()
  if (mtStore.checkingHealth) {
    active.push({
      id: `health-check-${now}`,
      category: 'maintenance',
      title: 'Health check',
      description: 'Running system health check...',
      state: 'running',
      progress: -1,
      createdAt: now,
      canCancel: false,
      canPause: false,
      canRetry: true,
      sourceId: '',
      sourceType: 'taskId',
    })
  }
  if (mtStore.scanning) {
    active.push({
      id: `library-scan-${now}`,
      category: 'maintenance',
      title: 'Library scan',
      description: 'Scanning library...',
      state: 'running',
      progress: -1,
      createdAt: now,
      canCancel: false,
      canPause: false,
      canRetry: true,
      sourceId: '',
      sourceType: 'taskId',
    })
  }
  if (mtStore.clearingCache) {
    active.push({
      id: `clear-cache-${now}`,
      category: 'maintenance',
      title: 'Clearing cache',
      description: 'Clearing system caches...',
      state: 'running',
      progress: -1,
      createdAt: now,
      canCancel: false,
      canPause: false,
      canRetry: true,
      sourceId: '',
      sourceType: 'taskId',
    })
  }
  if (mtStore.diagnosticsLoading) {
    active.push({
      id: `diagnostics-${now}`,
      category: 'maintenance',
      title: 'Loading diagnostics',
      description: 'Gathering system diagnostics...',
      state: 'running',
      progress: -1,
      createdAt: now,
      canCancel: false,
      canPause: false,
      canRetry: true,
      sourceId: '',
      sourceType: 'taskId',
    })
  }

  // Deduplicate recent by ID
  const seen = new Set<string>()
  const dedupedRecent = recent.filter((t) => {
    if (seen.has(t.id)) return false
    seen.add(t.id)
    return true
  })

  // Sort recent by createdAt desc, limit to 50
  dedupedRecent.sort((a, b) => b.createdAt - a.createdAt)
  dedupedRecent.splice(50)

  return { active, recent: dedupedRecent }
}

export const useTaskCenterStore = create<TaskCenterState>((set, get) => ({
  activeTasks: [],
  recentTasks: [],
  filter: 'all',
  category: 'all',
  search: '',

  setFilter: (filter) => set({ filter }),
  setCategory: (category) => set({ category }),
  setSearch: (search) => set({ search }),

  cancelTask: async (task) => {
    if (task.category === 'download') {
      await useDownloadEngineStore.getState().cancelTask(task.sourceId)
    } else if (task.category === 'process') {
      await useGameProcessStore.getState().killGame(task.sourceId)
    }
    get().refresh()
  },

  pauseTask: async (task) => {
    if (task.category === 'download') {
      await useDownloadEngineStore.getState().pauseTask(task.sourceId)
    }
    get().refresh()
  },

  retryTask: async (task) => {
    if (task.category === 'download') {
      // Attempt restart
      await useDownloadEngineStore.getState().startTask(task.sourceId)
    } else if (task.category === 'maintenance') {
      const mt = useMaintenanceStore.getState()
      if (task.id.includes('health-check')) mt.runFullHealthCheck()
      else if (task.id.includes('library-scan')) mt.runLibraryScan()
    }
    get().refresh()
  },

  refresh: () => {
    const { active, recent } = buildUnifiedTasks()
    set({ activeTasks: active, recentTasks: recent })
  },
}))
