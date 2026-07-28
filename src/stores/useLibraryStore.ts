import { create } from 'zustand'
import { useMemo } from 'react'
import type { InstalledGame } from '../domain/types'
import Fuse, { type IFuseOptions } from 'fuse.js'
import { getErrorDetails } from '../lib/error-translator'
import { t } from '../lib/i18n'
import { gameService } from '../services/game.service'

type SortOption = 'nameAsc' | 'nameDesc' | 'recentlyPlayed' | 'recentlyInstalled' | 'largest'

const STEAMWORKS_REDIST_APP_ID = '228980'

function isOrphanGame(name: string | undefined, appId: string): boolean {
  const rawName = name?.trim()
  if (!rawName) return true
  if (rawName === appId) return true
  if (/^app\s*\d*$/i.test(rawName)) return true
  if (rawName.toLowerCase() === 'appid' || rawName.toLowerCase() === 'appid_') return true
  if (rawName === 'Unknown' || rawName === 'Desconocido' || rawName === 'Inconnu' || rawName === 'Desconhecido' || rawName === 'Unbekannt' || rawName === '未知' || rawName === 'अज्ञात') return true
  return false
}

const fuseOptions: IFuseOptions<InstalledGame> = {
  keys: ['name', 'appId'],
  threshold: 0.4,
  distance: 100,
}

interface LibraryStore {
  games: InstalledGame[]
  loading: boolean
  error: string | null
  searchQuery: string
  sortBy: SortOption
  selectedGame: InstalledGame | null

  loadGames: () => Promise<void>
  setSearchQuery: (q: string) => void
  setSortBy: (s: SortOption) => void
  setSelectedGame: (g: InstalledGame | null) => void
}

const _attemptedOrphans = new Set<string>()

export const useLibraryStore = create<LibraryStore>((set, get) => ({
  games: [],
  loading: false,
  error: null,
  searchQuery: '',
  sortBy: 'nameAsc',
  selectedGame: null,

  loadGames: async () => {
    if (get().loading) return
    set({ loading: true, error: null })
    try {
      const result = await gameService.listInstalled()
      if (result.success) {
        const allGames = (result.games || []).filter((g: InstalledGame) => g.appId !== STEAMWORKS_REDIST_APP_ID)
        const filtered = allGames.filter((g: InstalledGame) => !isOrphanGame(g.name, g.appId) || _attemptedOrphans.has(g.appId))
        set({ games: filtered, loading: false })

        const orphanGames = allGames
          .filter((g: InstalledGame) => isOrphanGame(g.name, g.appId) && !_attemptedOrphans.has(g.appId))
          .map((g: InstalledGame) => ({ appId: g.appId, installDir: g.installDir }))
        if (orphanGames.length > 0) {
          for (const g of orphanGames) _attemptedOrphans.add(g.appId)
          gameService.resolveOrphanNames(orphanGames).then(({ resolved }) => {
            if (resolved.length > 0) {
              get().loadGames()
            }
          }).catch(() => {})
        }
      } else {
        const errMsg = result.error || 'Failed to load games'
        const { key } = getErrorDetails(errMsg)
        set({ error: key ? t(key) : errMsg, loading: false })
      }
    } catch (err: any) {
      const errMsg = err?.message || 'Failed to load games'
      const { key } = getErrorDetails(errMsg)
      set({ error: key ? t(key) : errMsg, loading: false })
    }
  },

  setSearchQuery: (q) => set({ searchQuery: q }),
  setSortBy: (s) => set({ sortBy: s }),
  setSelectedGame: (g) => set({ selectedGame: g }),
}))

const _fuseCache = new Map<string, Fuse<InstalledGame>>()

export function useFilteredLibraryGames(): InstalledGame[] {
  const { games, searchQuery, sortBy } = useLibraryStore()

  return useMemo(() => {
    // Crear Fuse instance por batch de games, usando hash de referencia
    const cacheKey = games.length + '-' + (games[0]?.appId ?? '')
    let fuse = _fuseCache.get(cacheKey)
    if (!fuse) {
      // Limpiar caché viejo (máximo 3 entradas para evitar memory leak)
      if (_fuseCache.size >= 3) {
        const firstKey = _fuseCache.keys().next().value
        if (firstKey) _fuseCache.delete(firstKey)
      }
      fuse = new Fuse(games, fuseOptions)
      _fuseCache.set(cacheKey, fuse)
    }

    let filtered: InstalledGame[]
    if (searchQuery.trim()) {
      const results = fuse.search(searchQuery.trim())
      filtered = results.map((r) => r.item)
    } else {
      filtered = games
    }

    filtered = [...filtered].sort((a, b) => {
      if (sortBy === 'nameAsc') return (a.name || '').localeCompare(b.name || '')
      if (sortBy === 'nameDesc') return (b.name || '').localeCompare(a.name || '')
      if (sortBy === 'recentlyPlayed') return (b.lastPlayed || 0) - (a.lastPlayed || 0)
      if (sortBy === 'recentlyInstalled') return (b.installedAt || 0) - (a.installedAt || 0)
      if (sortBy === 'largest') return (b.sizeOnDisk || 0) - (a.sizeOnDisk || 0)
      return 0
    })
    return filtered
  }, [games, searchQuery, sortBy])
}
