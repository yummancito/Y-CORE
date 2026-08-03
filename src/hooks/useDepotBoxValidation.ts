// ============================================================================
// src/hooks/useDepotBoxValidation.ts
// ============================================================================
// Hook para validar fixes de juegos usando DepotBox API
// ============================================================================

import { useState, useCallback } from 'react'

interface GameFix {
  type: 'onlinefix' | 'betafix' | 'nosteam'
  provider: string
  verified: boolean
  url?: string
}

interface GameDepotInfo {
  app_id: number
  name: string
  depots: number
  icon?: string
}

export function useDepotBoxValidation() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const getGameInfo = useCallback(async (appId: string): Promise<GameDepotInfo | null> => {
    setLoading(true)
    setError(null)
    try {
      const result = (await window.steamtools?.gateway?.call('depotbox:getGameInfo', appId)) as any
      if (!result?.success || !result.game) {
        setError(result?.error || 'Could not fetch game info')
        return null
      }
      return {
        app_id: result.game.app_id,
        name: result.game.name,
        depots: result.game.depots?.length || 0,
        icon: result.game.icon,
      }
    } catch (err: any) {
      setError(err.message || 'Unknown error')
      console.error(`[DepotBox] getGameInfo failed: ${err.message}`)
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  const checkGameFixes = useCallback(async (appId: string): Promise<GameFix[] | null> => {
    setLoading(true)
    setError(null)
    try {
      const result = (await window.steamtools?.gateway?.call('depotbox:getGameFixes', appId)) as any
      if (!result?.success) {
        setError(result?.error || 'Could not fetch fixes')
        return null
      }
      return (result.fixes || []) as GameFix[]
    } catch (err: any) {
      setError(err.message || 'Unknown error')
      console.error(`[DepotBox] checkGameFixes failed: ${err.message}`)
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  const validateGameDepots = useCallback(
    async (appId: string, depotIds: string[]): Promise<{ valid: boolean; missing: string[] } | null> => {
      setLoading(true)
      setError(null)
      try {
        const result = (await window.steamtools?.gateway?.call('depotbox:validateGameDepots', appId, depotIds)) as any
        if (!result?.success) {
          setError(result?.error || 'Validation failed')
          return null
        }
        return {
          valid: result.validated,
          missing: result.missing || [],
        }
      } catch (err: any) {
        setError(err.message || 'Unknown error')
        console.error(`[DepotBox] validateGameDepots failed: ${err.message}`)
        return null
      } finally {
        setLoading(false)
      }
    },
    []
  )

  const findBestFix = useCallback(async (appId: string): Promise<GameFix | null> => {
    setLoading(true)
    setError(null)
    try {
      const result = (await window.steamtools?.gateway?.call('depotbox:findBestFix', appId)) as any
      if (!result?.success) {
        setError(result?.error || 'Could not find fixes')
        return null
      }
      return (result.fix || null) as GameFix | null
    } catch (err: any) {
      setError(err.message || 'Unknown error')
      console.error(`[DepotBox] findBestFix failed: ${err.message}`)
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  return {
    loading,
    error,
    getGameInfo,
    checkGameFixes,
    validateGameDepots,
    findBestFix,
  }
}
