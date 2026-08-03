// ============================================================================
// src/hooks/useFixInstaller.ts
// ============================================================================
// Hook para descargar e instalar game fixes desde botón [Reparar] en biblioteca
// ============================================================================

import { useState, useCallback } from 'react'

export interface FixInstallerState {
  installing: boolean
  progress: string
  error: string | null
  success: boolean
}

export function useFixInstaller() {
  const [state, setState] = useState<FixInstallerState>({
    installing: false,
    progress: '',
    error: null,
    success: false,
  })

  /**
   * Descarga e instala un fix directamente en la carpeta del juego
   */
  const installFix = useCallback(
    async (fixId: string, gameInstallDir: string, fixType: 'online' | 'bypass' | 'hypervisor' = 'online') => {
      setState({
        installing: true,
        progress: 'Downloading fix from DepotBox...',
        error: null,
        success: false,
      })

      try {
        setState(s => ({ ...s, progress: `Downloading ${fixType} fix...` }))

        const result = (await window.steamtools?.gateway?.call(
          'fix-installer:downloadAndApply',
          fixId,
          gameInstallDir,
          fixType
        )) as any

        if (!result?.success) {
          setState({
            installing: false,
            progress: '',
            error: result?.error || 'Installation failed',
            success: false,
          })
          return {
            success: false,
            error: result?.error || 'Installation failed',
          }
        }

        setState({
          installing: false,
          progress: '',
          error: null,
          success: true,
        })

        console.info(`[useFixInstaller] Success: ${result.message}`)
        console.info(`[useFixInstaller] Applied files: ${result.filesApplied?.join(', ')}`)

        return {
          success: true,
          message: result.message,
          filesApplied: result.filesApplied,
        }
      } catch (err: any) {
        const errorMsg = err.message || 'Unknown error'
        setState({
          installing: false,
          progress: '',
          error: errorMsg,
          success: false,
        })
        console.error(`[useFixInstaller] Error: ${errorMsg}`)
        return {
          success: false,
          error: errorMsg,
        }
      }
    },
    []
  )

  /**
   * Solo descargar (sin aplicar automáticamente)
   */
  const downloadFix = useCallback(async (fixId: string) => {
    try {
      setState(s => ({ ...s, progress: 'Downloading fix...' }))

      const result = (await window.steamtools?.gateway?.call('fix-installer:downloadFix', fixId)) as any

      if (!result?.success) {
        setState(s => ({ ...s, error: result?.error, progress: '' }))
        return {
          success: false,
          error: result?.error,
        }
      }

      setState(s => ({ ...s, progress: '', success: true }))
      return {
        success: true,
        filePath: result.filePath,
      }
    } catch (err: any) {
      setState(s => ({ ...s, error: err.message, progress: '' }))
      return {
        success: false,
        error: err.message,
      }
    }
  }, [])

  /**
   * Resetear estado
   */
  const reset = useCallback(() => {
    setState({
      installing: false,
      progress: '',
      error: null,
      success: false,
    })
  }, [])

  return {
    ...state,
    installFix,
    downloadFix,
    reset,
  }
}
