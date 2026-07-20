import { create } from 'zustand'
import { useMemo, useRef } from 'react'
import type { InstalledGame } from '../domain/types'
import Fuse, { type IFuseOptions } from 'fuse.js'
import { getErrorDetails } from '../lib/error-translator'
import { t } from '../lib/i18n'

type SortOption = 'nameAsc' | 'nameDesc' | 'recentlyPlayed' | 'recentlyInstalled' | 'largest'

// Steamworks Common Redistributables — hidden from the library view
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

// Tracks orphan appIds we've already attempted to resolve, so a partial or
// no-op resolution can never trigger an endless loadGames() → resolve → reload
// loop. Only genuinely new orphans ever trigger a reload.
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
      const result = await window.steamtools.listInstalledGames()
      if (result.success) {
        const allGames = (result.games || []).filter((g) => g.appId !== STEAMWORKS_REDIST_APP_ID)
        // Show all games: non-orphans + previously attempted orphans (even if resolution failed)
        const filtered = allGames.filter((g) => !isOrphanGame(g.name, g.appId) || _attemptedOrphans.has(g.appId))
        set({ games: filtered, loading: false })

        // Background: re-resolve NEW orphan games with generic names.
        // Skip any orphan we've already tried — this prevents an infinite
        // reload loop when resolution keeps reporting "resolved" for names
        // that still read as orphans on the next listing.
        const orphanGames = allGames
          .filter((g) => isOrphanGame(g.name, g.appId) && !_attemptedOrphans.has(g.appId))
          .map((g) => ({ appId: g.appId, installDir: g.installDir }))
        if (orphanGames.length > 0) {
          for (const g of orphanGames) _attemptedOrphans.add(g.appId)
          window.steamtools.resolveOrphanNames(orphanGames).then(({ resolved }: { resolved: { appId: string; newName: string }[] }) => {
            if (resolved.length > 0) {
              // Reload library with resolved names
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

let _fuse: Fuse<InstalledGame> | null = null
let _fuseGamesLength = 0

export function useFilteredLibraryGames(): InstalledGame[] {
  const { games, searchQuery, sortBy } = useLibraryStore()
  const prevGamesRef = useRef(games)

  return useMemo(() => {
    if (_fuse === null || prevGamesRef.current !== games) {
      prevGamesRef.current = games
      _fuse = new Fuse(games, fuseOptions)
      _fuseGamesLength = games.length
    }

    let filtered: InstalledGame[]
    if (searchQuery.trim()) {
      const results = _fuse.search(searchQuery.trim())
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
