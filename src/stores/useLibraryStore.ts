import { create } from 'zustand'
import { useMemo } from 'react'
import type { InstalledGame } from '../domain/types'

type SortOption = 'nameAsc' | 'nameDesc' | 'recentlyPlayed' | 'recentlyInstalled' | 'largest'

// Steamworks Common Redistributables — hidden from the library view
const STEAMWORKS_REDIST_APP_ID = '228980'

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
      const result = await window.steamtools.listInstalledGames()
      if (result.success) {
        const filtered = (result.games || []).filter((g) => g.appId !== STEAMWORKS_REDIST_APP_ID)
        set({ games: filtered, loading: false })
      } else {
        set({ error: result.error || 'Failed to load games', loading: false })
      }
    } catch (err: any) {
      set({ error: err?.message || 'Failed to load games', loading: false })
    }
  },

  setSearchQuery: (q) => set({ searchQuery: q }),
  setSortBy: (s) => set({ sortBy: s }),
  setSelectedGame: (g) => set({ selectedGame: g }),
}))

export function useFilteredLibraryGames(): InstalledGame[] {
  const { games, searchQuery, sortBy } = useLibraryStore()
  return useMemo(() => {
    let filtered = games.filter(
      (g) => g.name.toLowerCase().includes(searchQuery.toLowerCase()) || g.appId.includes(searchQuery)
    )
    filtered = [...filtered].sort((a, b) => {
      if (sortBy === 'nameAsc') return a.name.localeCompare(b.name)
      if (sortBy === 'nameDesc') return b.name.localeCompare(a.name)
      if (sortBy === 'recentlyPlayed') return b.lastPlayed - a.lastPlayed
      if (sortBy === 'recentlyInstalled') return b.installedAt - a.installedAt
      if (sortBy === 'largest') return b.sizeOnDisk - a.sizeOnDisk
      return 0
    })
    return filtered
  }, [games, searchQuery, sortBy])
}
