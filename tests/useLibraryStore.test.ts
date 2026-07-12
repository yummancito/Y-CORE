import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useLibraryStore, useFilteredLibraryGames } from '../src/stores/useLibraryStore'
import type { InstalledGame } from '../src/domain/types'

function makeGame(overrides: Partial<InstalledGame> & { appId: string }): InstalledGame {
  return {
    name: '',
    installDir: '',
    universe: '1',
    stateFlags: '4',
    sizeOnDisk: 0,
    lastUpdated: 0,
    lastPlayed: 0,
    installedAt: 0,
    buildid: '0',
    bytesToDownload: 0,
    bytesDownloaded: 0,
    autoUpdateBehavior: '0',
    manifestFile: `appmanifest_${overrides.appId}.acf`,
    ...overrides,
  }
}

describe('useLibraryStore actions', () => {
  beforeEach(() => {
    useLibraryStore.setState({ games: [], searchQuery: '', sortBy: 'nameAsc', loading: false, error: null, selectedGame: null })
  })

  it('starts with empty games', () => {
    const state = useLibraryStore.getState()
    expect(state.games).toHaveLength(0)
    expect(state.searchQuery).toBe('')
    expect(state.sortBy).toBe('nameAsc')
  })

  it('sets search query', () => {
    useLibraryStore.getState().setSearchQuery('half-life')
    expect(useLibraryStore.getState().searchQuery).toBe('half-life')
  })

  it('sets sort option', () => {
    useLibraryStore.getState().setSortBy('recentlyPlayed')
    expect(useLibraryStore.getState().sortBy).toBe('recentlyPlayed')
  })

  it('sets selected game', () => {
    const game = makeGame({ appId: '100', name: 'Test' })
    useLibraryStore.getState().setSelectedGame(game)
    expect(useLibraryStore.getState().selectedGame?.appId).toBe('100')
  })
})

describe('useFilteredLibraryGames', () => {
  const games = [
    makeGame({ appId: '100', name: 'Half-Life' }),
    makeGame({ appId: '200', name: 'Portal 2' }),
    makeGame({ appId: '300', name: 'Team Fortress 2' }),
    makeGame({ appId: '400', name: 'Left 4 Dead 2' }),
  ]

  beforeEach(() => {
    useLibraryStore.setState({ games, searchQuery: '', sortBy: 'nameAsc', loading: false, error: null, selectedGame: null })
  })

  it('returns all games when no search query', () => {
    const { result } = renderHook(() => useFilteredLibraryGames())
    expect(result.current).toHaveLength(4)
  })

  it('filters games by name with fuse fuzzy search', () => {
    useLibraryStore.setState({ searchQuery: 'portal' })
    const { result } = renderHook(() => useFilteredLibraryGames())
    expect(result.current).toHaveLength(1)
    expect(result.current[0].appId).toBe('200')
  })

  it('filters games by appId fuzzy match', () => {
    useLibraryStore.setState({ searchQuery: '400' })
    const { result } = renderHook(() => useFilteredLibraryGames())
    expect(result.current.length).toBeGreaterThanOrEqual(1)
    expect(result.current.some((g: any) => g.appId === '400')).toBe(true)
  })

  it('returns empty array when no match', () => {
    useLibraryStore.setState({ searchQuery: 'zzznonexistent' })
    const { result } = renderHook(() => useFilteredLibraryGames())
    expect(result.current).toHaveLength(0)
  })

  it('sorts alphabetically A-Z by default', () => {
    const { result } = renderHook(() => useFilteredLibraryGames())
    expect(result.current[0].name).toBe('Half-Life')
    expect(result.current[result.current.length - 1].name).toBe('Team Fortress 2')
  })

  it('sorts Z-A when nameDesc', () => {
    useLibraryStore.setState({ sortBy: 'nameDesc' })
    const { result } = renderHook(() => useFilteredLibraryGames())
    expect(result.current[0].name).toBe('Team Fortress 2')
    expect(result.current[result.current.length - 1].name).toBe('Half-Life')
  })

  it('sorts by recently played', () => {
    const playedGames = [
      makeGame({ appId: '100', name: 'Half-Life', lastPlayed: 100 }),
      makeGame({ appId: '200', name: 'Portal 2', lastPlayed: 300 }),
      makeGame({ appId: '300', name: 'Team Fortress 2', lastPlayed: 200 }),
    ]
    useLibraryStore.setState({ games: playedGames, sortBy: 'recentlyPlayed' })
    const { result } = renderHook(() => useFilteredLibraryGames())
    expect(result.current[0].appId).toBe('200')
    expect(result.current[2].appId).toBe('100')
  })

  it('sorts by recently installed', () => {
    const installedGames = [
      makeGame({ appId: '100', name: 'Half-Life', installedAt: 1000 }),
      makeGame({ appId: '200', name: 'Portal 2', installedAt: 3000 }),
      makeGame({ appId: '300', name: 'Team Fortress 2', installedAt: 2000 }),
    ]
    useLibraryStore.setState({ games: installedGames, sortBy: 'recentlyInstalled' })
    const { result } = renderHook(() => useFilteredLibraryGames())
    expect(result.current[0].appId).toBe('200')
    expect(result.current[2].appId).toBe('100')
  })

  it('sorts by largest', () => {
    const sizedGames = [
      makeGame({ appId: '100', name: 'Half-Life', sizeOnDisk: 500 }),
      makeGame({ appId: '200', name: 'Portal 2', sizeOnDisk: 1500 }),
      makeGame({ appId: '300', name: 'Team Fortress 2', sizeOnDisk: 1000 }),
    ]
    useLibraryStore.setState({ games: sizedGames, sortBy: 'largest' })
    const { result } = renderHook(() => useFilteredLibraryGames())
    expect(result.current[0].appId).toBe('200')
    expect(result.current[2].appId).toBe('100')
  })

  it('handles fuzzy search with typos', () => {
    useLibraryStore.setState({ searchQuery: 'halflife' })
    const { result } = renderHook(() => useFilteredLibraryGames())
    expect(result.current.length).toBeGreaterThanOrEqual(1)
    expect(result.current[0].appId).toBe('100')
  })

  it('handles case insensitive search', () => {
    useLibraryStore.setState({ searchQuery: 'HALF-LIFE' })
    const { result } = renderHook(() => useFilteredLibraryGames())
    expect(result.current).toHaveLength(1)
    expect(result.current[0].appId).toBe('100')
  })
})
