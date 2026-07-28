import { create } from 'zustand'
import type { RuntimeCheckResult, RuntimeType } from '../domain/types'
import { runtimeDetectService } from '../services/runtime-detect.service'

interface RuntimeStore {
  runtimes: RuntimeCheckResult[]
  directX: string
  checking: boolean
  installing: string | null
  installResult: { success: boolean; message: string } | null
  error: string | null

  detectAll: () => Promise<void>
  detectRuntime: (type: string) => Promise<RuntimeCheckResult | null>
  checkRequirements: () => Promise<void>
  installRuntime: (type: string) => Promise<void>
  clearInstallResult: () => void
}

export const useRuntimeStore = create<RuntimeStore>((set, get) => ({
  runtimes: [],
  directX: 'unknown',
  checking: false,
  installing: null,
  installResult: null,
  error: null,

  detectAll: async () => {
    if (get().checking) return
    set({ checking: true, error: null })
    try {
      const result = await runtimeDetectService.detectAll()
      set({
        runtimes: result.runtimes as RuntimeCheckResult[],
        directX: result.directX,
        checking: false,
      })
    } catch (err: any) {
      set({ error: err?.message || 'Failed to detect runtimes', checking: false })
    }
  },

  detectRuntime: async (type: string) => {
    try {
      const result = await runtimeDetectService.detectRuntime(type)
      return result as RuntimeCheckResult
    } catch {
      return null
    }
  },

  checkRequirements: async () => {
    set({ checking: true, error: null })
    try {
      const result = await runtimeDetectService.checkRequirements()
      if (!result.met) {
        set({ error: `Missing ${result.missing.length} runtime(s)` })
      }
      set({ checking: false })
    } catch (err: any) {
      set({ error: err?.message || 'Requirements check failed', checking: false })
    }
  },

  installRuntime: async (type: string) => {
    if (get().installing) return
    set({ installing: type, installResult: null })
    try {
      const result = await runtimeDetectService.installRuntime(type)
      set({ installing: null, installResult: result })
      // Refresh runtime list
      await get().detectAll()
    } catch (err: any) {
      set({
        installing: null,
        installResult: { success: false, message: err?.message || 'Install failed' },
      })
    }
  },

  clearInstallResult: () => set({ installResult: null }),
}))
