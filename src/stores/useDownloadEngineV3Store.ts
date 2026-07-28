// ============================================================================
// src/stores/useDownloadEngineV3Store.ts
// ----------------------------------------------------------------------------
// Store principal del Download Engine V3.
// Conecta la UI con downloadService + eventos IPC.
// Maneja tareas activas, cola, historial, filtros, estadísticas.
// ============================================================================

import { create } from 'zustand'
import { downloadService } from '../services/download.service'
import { subscribeToEvent } from '../services/gateway'

// ── Types ──────────────────────────────────────────────────────────────────

export type DownloadSource = 'steamcmd' | 'steampipe' | 'api_proxy' | 'direct' | 'torrent'

export type DownloadState =
  | 'queued' | 'preparing' | 'connecting' | 'downloading'
  | 'verifying' | 'paused' | 'stalled' | 'completed' | 'failed' | 'cancelled'
  | 'blocked-prereq'

export interface DownloadTask {
  id: string
  appId: string
  name: string
  source: DownloadSource
  state: DownloadState
  priority: number
  bytesDownloaded: number
  bytesTotal: number
  speedBytesPerSec: number
  etaSeconds: number | null
  percent: number
  installDir: string
  retryCount: number
  maxRetries: number
  errorMessage?: string
  errorKey?: string
  createdAt: number
  startedAt?: number
  completedAt?: number
  lastUpdatedAt: number
  peakSpeed: number
  elapsedSec: number
  bytesVerified: number
  filesVerified: number
  filesTotal: number
  /** ID de la tarea prerrequisito. La tarea no se descarga hasta que la
   *  tarea referenciada esté en `completed`. Si la tarea referenciada
   *  termina en `failed`/`cancelled`/`timeout`, esta tarea pasa a estado
   *  `blocked-prereq`.  */
  prereqTaskId?: string
  /** Estado derivado del prerrequisito para UI
   *  (lo calcula el motor en cada notifyQueueChanged). */
  prereqState?: 'pending' | 'satisfied' | 'failed'
}

export interface EngineStatus {
  active: number
  queued: number
  completed: number
  failed: number
  totalBytesDownloaded: number
  totalBytesTotal: number
  combinedSpeed: number
  maxConcurrent: number
  isPaused: boolean
}

export interface DownloadFilters {
  search: string
  state: 'all' | 'active' | 'completed' | 'failed'
  source: 'all' | DownloadSource
  sortBy: 'priority' | 'name' | 'progress' | 'speed' | 'eta' | 'created'
  sortOrder: 'asc' | 'desc'
}

interface DownloadEngineStore {
  tasks: DownloadTask[]
  history: DownloadTask[]
  status: EngineStatus | null
  filters: DownloadFilters
  selectedTaskId: string | null
  initialized: boolean

  init: () => Promise<void>
  destroy: () => void

  createTask: (opts: {
    appId: string; name: string; source?: DownloadSource
    priority?: number; installDir?: string
  }) => Promise<DownloadTask | null>
  startTask: (taskId: string) => Promise<boolean>
  pauseTask: (taskId: string) => Promise<boolean>
  cancelTask: (taskId: string) => Promise<boolean>
  setPriority: (taskId: string, priority: number) => Promise<boolean>

  setPaused: (paused: boolean) => Promise<void>
  integrityCheck: (appId: string, installDir: string) => Promise<any>
  repairFiles: (appId: string, installDir: string, corruptedPaths: string[], missingPaths: string[]) => Promise<any>
  getCacheStats: () => Promise<any>
  clearCache: () => Promise<void>
  clearCompleted: () => Promise<void>
  clearHistory: () => Promise<void>

  setFilters: (partial: Partial<DownloadFilters>) => void
  getFilteredTasks: () => DownloadTask[]

  setSelectedTask: (taskId: string | null) => void
  selectedTask: () => DownloadTask | null

  getActiveCount: () => number
  getCompletedToday: () => number
  getTotalBytesDownloaded: () => number
  getAverageSpeed: () => number
}

const DEFAULT_FILTERS: DownloadFilters = {
  search: '',
  state: 'all',
  source: 'all',
  sortBy: 'priority',
  sortOrder: 'desc',
}

// Module-level unsubscribe functions (to survive store recreation)
let _unsubs: (() => void)[] = []

export const useDownloadEngineStore = create<DownloadEngineStore>((set, get) => ({
  tasks: [],
  history: [],
  status: null,
  filters: { ...DEFAULT_FILTERS },
  selectedTaskId: null,
  initialized: false,

  init: async () => {
    if (get().initialized) return
    set({ initialized: true })

    // Cleanup any previous subscriptions before re-subscribing
    for (const u of _unsubs) u()
    _unsubs = []

    // Load initial state from engine
    try {
      const [tasksRes, historyRes, statusRes] = await Promise.all([
        downloadService.getTasks(),
        downloadService.getHistory(),
        downloadService.getStatus(),
      ])
      set({
        tasks: (tasksRes.tasks ?? []) as DownloadTask[],
        history: (historyRes.history ?? []) as DownloadTask[],
        status: (statusRes.status ?? null) as EngineStatus | null,
      })
    } catch {
      // Engine may not be available (non-Electron context)
    }

    // Subscribe to IPC events
    _unsubs.push(
      subscribeToEvent('download:progress', (payload: any) => {
        const state = get()
        set({
          tasks: state.tasks.map((t) =>
            t.id === payload.taskId
              ? { ...t, ...payload, lastUpdatedAt: Date.now() }
              : t,
          ),
        })
      }),
    )

    _unsubs.push(
      subscribeToEvent('download:completed', () => { refreshFromEngine() }),
    )

    _unsubs.push(
      subscribeToEvent('download:failed', (payload: any) => {
        const st = get()
        set({
          tasks: st.tasks.map((t) =>
            t.id === payload.taskId
              ? { ...t, state: 'failed' as const, errorMessage: payload.errorMessage }
              : t,
          ),
        })
        refreshFromEngine()
      }),
    )

    _unsubs.push(
      subscribeToEvent('download:queue-changed', () => { refreshFromEngine() }),
    )

    _unsubs.push(
      subscribeToEvent('download:engine-status', (payload: any) => {
        set({ status: payload as EngineStatus })
      }),
    )
  },

  destroy: () => {
    for (const u of _unsubs) u()
    _unsubs = []
    set({ initialized: false })
  },

  createTask: async (opts) => {
    try {
      const result = await downloadService.createTask(opts)
      if (result.success && result.task) {
        const task = result.task as DownloadTask
        set((s) => ({ tasks: [...s.tasks, task] }))
        return task
      }
      return null
    } catch {
      return null
    }
  },

  startTask: async (taskId) => {
    try {
      const result = await downloadService.startTask(taskId)
      if (result.success) await refreshFromEngine()
      return result.success
    } catch {
      return false
    }
  },

  pauseTask: async (taskId) => {
    try {
      const result = await downloadService.pauseTask(taskId)
      if (result.success) {
        set((s) => ({
          tasks: s.tasks.map((t) =>
            t.id === taskId ? { ...t, state: 'paused' as const } : t,
          ),
        }))
      }
      return result.success
    } catch {
      return false
    }
  },

  cancelTask: async (taskId) => {
    try {
      const result = await downloadService.cancelTask(taskId)
      if (result.success) {
        set((s) => ({ tasks: s.tasks.filter((t) => t.id !== taskId) }))
      }
      return result.success
    } catch {
      return false
    }
  },

  setPriority: async (taskId, priority) => {
    try {
      return (await downloadService.setPriority(taskId, priority)).success
    } catch {
      return false
    }
  },

  setPaused: async (paused) => {
    try {
      await downloadService.setPaused(paused)
      set((s) => ({
        status: s.status ? { ...s.status, isPaused: paused } : null,
      }))
    } catch {
      // ignore
    }
  },

  integrityCheck: async (appId, installDir) => {
    try {
      return await downloadService.integrityCheck(appId, installDir)
    } catch {
      return { success: false, error: 'Integrity check failed' }
    }
  },

  repairFiles: async (appId, installDir, corruptedPaths, missingPaths) => {
    try {
      return await downloadService.repairFiles(appId, installDir, corruptedPaths, missingPaths)
    } catch {
      return { success: false, error: 'Repair failed' }
    }
  },

  getCacheStats: async () => {
    try {
      return await downloadService.getCacheStats()
    } catch {
      return { success: false, error: 'Failed to get cache stats' }
    }
  },

  clearCache: async () => {
    try {
      await downloadService.clearCache()
    } catch {
      // ignore
    }
  },

  clearCompleted: async () => {
    try {
      await downloadService.clearCompleted()
      set((s) => ({
        tasks: s.tasks.filter(
          (t) => t.state !== 'completed' && t.state !== 'failed' && t.state !== 'cancelled',
        ),
      }))
    } catch {
      // ignore
    }
  },

  clearHistory: async () => {
    try {
      await downloadService.clearHistory()
      set({ history: [] })
    } catch {
      // ignore
    }
  },

  setFilters: (partial) => {
    set((s) => ({ filters: { ...s.filters, ...partial } }))
  },

  getFilteredTasks: () => {
    const { tasks, filters } = get()
    let filtered = [...tasks]

    if (filters.state !== 'all') {
      filtered = filtered.filter((t) => t.state === filters.state)
    }
    if (filters.source !== 'all') {
      filtered = filtered.filter((t) => t.source === filters.source)
    }
    if (filters.search) {
      const q = filters.search.toLowerCase()
      filtered = filtered.filter(
        (t) => t.name.toLowerCase().includes(q) || t.appId.includes(q),
      )
    }

    filtered.sort((a, b) => {
      let cmp = 0
      switch (filters.sortBy) {
        case 'priority': cmp = b.priority - a.priority; break
        case 'name': cmp = a.name.localeCompare(b.name); break
        case 'progress': cmp = a.percent - b.percent; break
        case 'speed': cmp = a.speedBytesPerSec - b.speedBytesPerSec; break
        case 'eta': cmp = (a.etaSeconds ?? Infinity) - (b.etaSeconds ?? Infinity); break
        case 'created': cmp = a.createdAt - b.createdAt; break
      }
      return filters.sortOrder === 'desc' ? -cmp : cmp
    })

    return filtered
  },

  setSelectedTask: (taskId) => set({ selectedTaskId: taskId }),

  selectedTask: () => {
    const { tasks, selectedTaskId } = get()
    return tasks.find((t) => t.id === selectedTaskId) ?? null
  },

  getActiveCount: () => {
    return get().tasks.filter(
      (t) => t.state === 'downloading' || t.state === 'preparing' || t.state === 'connecting' || t.state === 'verifying',
    ).length
  },

  getCompletedToday: () => {
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    return get().history.filter(
      (t) => t.completedAt && t.completedAt >= todayStart.getTime(),
    ).length
  },

  getTotalBytesDownloaded: () => {
    return get().tasks.reduce((sum, t) => sum + t.bytesDownloaded, 0)
  },

  getAverageSpeed: () => {
    const active = get().tasks.filter((t) => t.state === 'downloading')
    if (active.length === 0) return 0
    return active.reduce((sum, t) => sum + t.speedBytesPerSec, 0) / active.length
  },
}))

// ── Helpers ────────────────────────────────────────────────────────────────

async function refreshFromEngine(): Promise<void> {
  try {
    const [tasksRes, historyRes, statusRes] = await Promise.all([
      downloadService.getTasks(),
      downloadService.getHistory(),
      downloadService.getStatus(),
    ])
    useDownloadEngineStore.setState({
      tasks: (tasksRes.tasks ?? []) as DownloadTask[],
      history: (historyRes.history ?? []) as DownloadTask[],
      status: (statusRes.status ?? null) as EngineStatus | null,
    })
  } catch {
    // ignore
  }
}

// ── Format helpers ─────────────────────────────────────────────────────────

export function formatBytes(bytes: number | undefined): string {
  if (!bytes || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

export function formatSpeed(bps: number): string {
  return `${formatBytes(bps)}/s`
}

export function formatEta(seconds: number | null | undefined): string {
  if (seconds == null || seconds < 0) return '—'
  if (seconds < 60) return `${Math.round(seconds)}s`
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return `${m}m ${s}s`
}

export function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

export function getStateColor(state: DownloadState): string {
  switch (state) {
    case 'downloading':
    case 'preparing':
    case 'connecting':
      return 'var(--accent)'
    case 'verifying':
      return 'var(--amber)'
    case 'paused':
    case 'stalled':
      return 'var(--text-dim)'
    case 'completed':
      return 'var(--green)'
    case 'failed':
      return 'var(--red)'
    case 'cancelled':
      return 'var(--text-muted)'
    case 'blocked-prereq':
      return 'var(--amber)'
    default:
      return 'var(--text-dim)'
  }
}
