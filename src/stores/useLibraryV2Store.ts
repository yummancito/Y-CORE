import { create } from 'zustand'
import type { GameCollection, GameTag, GameFavorite, GameNote, LibraryViewMode } from '../domain/types'

interface LibraryV2Store {
  collections: GameCollection[]
  tags: GameTag[]
  favorites: Record<string, GameFavorite>
  notes: Record<string, GameNote>
  gameTagMap: Record<string, string[]>
  viewMode: LibraryViewMode
  selectedCollectionId: string | null
  selectedTagIds: string[]
  showFavoritesOnly: boolean
  hiddenGameIds: string[]

  loadAll: () => void

  toggleHidden: (appId: string) => void
  isHidden: (appId: string) => boolean
  setViewMode: (mode: LibraryViewMode) => void
  setSelectedCollection: (id: string | null) => void
  toggleTag: (tagId: string) => void
  setShowFavoritesOnly: (v: boolean) => void

  addCollection: (name: string, description?: string) => GameCollection
  updateCollection: (id: string, updates: Partial<GameCollection>) => void
  deleteCollection: (id: string) => void
  addToCollection: (collectionId: string, appId: string) => void
  removeFromCollection: (collectionId: string, appId: string) => void
  getCollectionAppIds: (collectionId: string) => string[]

  addTag: (name: string, color?: string) => GameTag
  deleteTag: (id: string) => void
  tagGame: (appId: string, tagId: string) => void
  untagGame: (appId: string, tagId: string) => void
  getTagsForGame: (appId: string) => GameTag[]

  toggleFavorite: (appId: string) => void
  isFavorite: (appId: string) => boolean

  setNote: (appId: string, content: string) => void
  getNote: (appId: string) => GameNote | undefined
  deleteNote: (appId: string) => void

  filterGames: (allAppIds: string[]) => string[]
}

function generateId(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

const DEFAULT_TAGS: GameTag[] = [
  { id: 'tag-completed', name: 'Completed', color: '#22c55e' },
  { id: 'tag-playing', name: 'Playing', color: '#3BB2F7' },
  { id: 'tag-backlog', name: 'Backlog', color: '#f59e0b' },
  { id: 'tag-multiplayer', name: 'Multiplayer', color: '#a78bfa' },
  { id: 'tag-singleplayer', name: 'Singleplayer', color: '#f472b6' },
]

const STORAGE_KEY = 'y-core-library-v2'

function persist(s: LibraryV2StoreState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      collections: s.collections,
      tags: s.tags,
      favorites: s.favorites,
      notes: s.notes,
      gameTagMap: s.gameTagMap,
      viewMode: s.viewMode,
      hiddenGameIds: s.hiddenGameIds ?? [],
    }))
  } catch { /* quota */ }
}

interface LibraryV2StoreState {
  collections: GameCollection[]
  tags: GameTag[]
  favorites: Record<string, GameFavorite>
  notes: Record<string, GameNote>
  gameTagMap: Record<string, string[]>
  viewMode: LibraryViewMode
  hiddenGameIds: string[]
}

function loadPersisted(): LibraryV2StoreState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const p = JSON.parse(raw)
    return {
      collections: p.collections ?? [],
      tags: p.tags ?? DEFAULT_TAGS,
      favorites: p.favorites ?? {},
      notes: p.notes ?? {},
      gameTagMap: p.gameTagMap ?? {},
      viewMode: p.viewMode ?? 'grid',
      hiddenGameIds: p.hiddenGameIds ?? [],
    }
  } catch { return null }
}

export const useLibraryV2Store = create<LibraryV2Store>((set, get) => {
  const p = loadPersisted()
  return {
    collections: p?.collections ?? [],
    tags: p?.tags ?? DEFAULT_TAGS,
    favorites: p?.favorites ?? {},
    notes: p?.notes ?? {},
    gameTagMap: p?.gameTagMap ?? {},
    viewMode: p?.viewMode ?? 'grid',
    selectedCollectionId: null,
    selectedTagIds: [],
    showFavoritesOnly: false,
    hiddenGameIds: p?.hiddenGameIds ?? [],

    loadAll: () => {
      const p2 = loadPersisted()
      if (p2) set({ ...p2 })
    },

    setViewMode: (viewMode) => { set({ viewMode }); persist(get() as any) },
    setSelectedCollection: (selectedCollectionId) => set({ selectedCollectionId }),
    toggleTag: (tagId) => set((s) => ({
      selectedTagIds: s.selectedTagIds.includes(tagId) ? s.selectedTagIds.filter((id) => id !== tagId) : [...s.selectedTagIds, tagId],
    })),
    setShowFavoritesOnly: (showFavoritesOnly) => set({ showFavoritesOnly }),

    toggleHidden: (appId) => {
      set((s) => {
        const hidden = s.hiddenGameIds.includes(appId)
          ? s.hiddenGameIds.filter((id) => id !== appId)
          : [...s.hiddenGameIds, appId]
        return { hiddenGameIds: hidden }
      })
      persist(get() as any)
    },
    isHidden: (appId) => get().hiddenGameIds.includes(appId),

    addCollection: (name, description = '') => {
      const c: GameCollection = { id: generateId(), name, description, appIds: [], createdAt: Date.now(), updatedAt: Date.now(), isDynamic: false, sortOrder: get().collections.length }
      set((s) => ({ collections: [...s.collections, c] }))
      persist(get() as any); return c
    },
    updateCollection: (id, updates) => { set((s) => ({ collections: s.collections.map((c) => c.id === id ? { ...c, ...updates, updatedAt: Date.now() } : c) })); persist(get() as any) },
    deleteCollection: (id) => { set((s) => ({ collections: s.collections.filter((c) => c.id !== id) })); persist(get() as any) },
    addToCollection: (collectionId, appId) => { set((s) => ({ collections: s.collections.map((c) => c.id === collectionId && !c.appIds.includes(appId) ? { ...c, appIds: [...c.appIds, appId], updatedAt: Date.now() } : c) })); persist(get() as any) },
    removeFromCollection: (collectionId, appId) => { set((s) => ({ collections: s.collections.map((c) => c.id === collectionId ? { ...c, appIds: c.appIds.filter((a) => a !== appId), updatedAt: Date.now() } : c) })); persist(get() as any) },
    getCollectionAppIds: (collectionId) => get().collections.find((c) => c.id === collectionId)?.appIds ?? [],

    addTag: (name, color = '#3BB2F7') => { const t: GameTag = { id: `tag-${generateId()}`, name, color }; set((s) => ({ tags: [...s.tags, t] })); persist(get() as any); return t },
    deleteTag: (id) => { set((s) => ({ tags: s.tags.filter((t) => t.id !== id) })); persist(get() as any) },
    tagGame: (appId, tagId) => {
      set((s) => {
        const map = { ...s.gameTagMap }
        const existing = map[appId] ? [...map[appId]] : []
        if (!existing.includes(tagId)) { existing.push(tagId); map[appId] = existing }
        return { gameTagMap: map }
      })
      persist(get() as any)
    },
    untagGame: (appId, tagId) => {
      set((s) => {
        const map = { ...s.gameTagMap }
        if (map[appId]) map[appId] = map[appId].filter((id) => id !== tagId)
        return { gameTagMap: map }
      })
      persist(get() as any)
    },
    getTagsForGame: (appId) => {
      const { tags, gameTagMap } = get()
      const tagIds = gameTagMap[appId] || []
      return tags.filter((t) => tagIds.includes(t.id))
    },

    toggleFavorite: (appId) => {
      const favs = { ...get().favorites }
      if (favs[appId]) delete favs[appId]
      else favs[appId] = { appId, favoritedAt: Date.now() }
      set({ favorites: favs })
      persist(get() as any)
    },
    isFavorite: (appId) => !!get().favorites[appId],

    setNote: (appId, content) => { const notes = { ...get().notes, [appId]: { appId, content, updatedAt: Date.now() } }; set({ notes }); persist(get() as any) },
    getNote: (appId) => get().notes[appId],
    deleteNote: (appId) => { const notes = { ...get().notes }; delete notes[appId]; set({ notes }); persist(get() as any) },

    filterGames: (allAppIds: string[]) => {
      const { selectedCollectionId, showFavoritesOnly, favorites, collections, selectedTagIds, gameTagMap, hiddenGameIds } = get()
      let filtered = [...allAppIds]

      filtered = filtered.filter((id) => !hiddenGameIds.includes(id))

      if (selectedCollectionId) {
        const col = collections.find((c) => c.id === selectedCollectionId)
        if (col) filtered = filtered.filter((id) => col.appIds.includes(id))
      }
      if (showFavoritesOnly) {
        filtered = filtered.filter((id) => !!favorites[id])
      }
      if (selectedTagIds.length > 0) {
        filtered = filtered.filter((id) => {
          const tags = gameTagMap[id] || []
          return selectedTagIds.some((tId) => tags.includes(tId))
        })
      }
      return filtered
    },
  }
})
