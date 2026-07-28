import { create } from 'zustand'

interface DllStatusItem {
  path: string
  name: string
  exists: boolean
  isEmpty: boolean
  mtime: string | null
  size: number | null
}

interface DefenderCheckResult {
  hasMissingCritical: boolean
  hasMissingExpected: boolean
  hasEmptyDlls: boolean
  dlls: DllStatusItem[]
  hasDefenderArtifacts: boolean
  suggestions: string[]
}

interface DefenderFixResult {
  success: boolean
  message: string
  detail: string
  elevated: boolean
  restored: boolean
  error?: string
}

interface DefenderFixState {
  /** Último resultado del escaneo de DLLs. */
  scanResult: DefenderCheckResult | null
  /** true mientras se está escaneando. */
  isScanning: boolean
  /** Resultado de la última reparación (o null si no se ejecutó). */
  lastFixResult: DefenderFixResult | null
  /** true mientras se está ejecutando el fix. */
  isFixing: boolean

  // Acciones
  /** Escanea el estado actual de los DLLs. */
  scan: () => Promise<DefenderCheckResult>
  /** Ejecuta la reparación de Windows Defender (auto-elevada). */
  runFix: () => Promise<DefenderFixResult>
  /** Resetea el estado de la última reparación. */
  clearFixResult: () => void
}

export const useDefenderFixStore = create<DefenderFixState>((set) => ({
  scanResult: null,
  isScanning: false,
  lastFixResult: null,
  isFixing: false,

  scan: async () => {
    set({ isScanning: true })
    try {
      if (typeof window.steamtools?.getDefenderStatus !== 'function') {
        const fallback: DefenderCheckResult = {
          hasMissingCritical: false,
          hasMissingExpected: false,
          hasEmptyDlls: false,
          dlls: [],
          hasDefenderArtifacts: false,
          suggestions: ['No disponible fuera de Electron.'],
        }
        set({ scanResult: fallback, isScanning: false })
        return fallback
      }
      const result = await window.steamtools.getDefenderStatus()
      set({ scanResult: result, isScanning: false })
      return result
    } catch (err) {
      set({ isScanning: false })
      throw err
    }
  },

  runFix: async () => {
    set({ isFixing: true, lastFixResult: null })
    try {
      if (typeof window.steamtools?.runDefenderFix !== 'function') {
        const fallback: DefenderFixResult = {
          success: false,
          message: 'No disponible fuera de Electron.',
          detail: 'runDefenderFix no está disponible en el navegador.',
          elevated: false,
          restored: false,
          error: 'No disponible',
        }
        set({ lastFixResult: fallback, isFixing: false })
        return fallback
      }
      const result = await window.steamtools.runDefenderFix()
      set({ lastFixResult: result, isFixing: false })

      // Re-escanear automáticamente después del fix
      try {
        if (typeof window.steamtools?.getDefenderStatus === 'function') {
          const rescan = await window.steamtools.getDefenderStatus()
          set({ scanResult: rescan })
        }
      } catch {}

      return result
    } catch (err) {
      const errorResult: DefenderFixResult = {
        success: false,
        message: 'Error inesperado.',
        detail: String(err),
        elevated: false,
        restored: false,
        error: String(err),
      }
      set({ lastFixResult: errorResult, isFixing: false })
      return errorResult
    }
  },

  clearFixResult: () => {
    set({ lastFixResult: null })
  },
}))
