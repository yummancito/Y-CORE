import { create } from 'zustand'
import type { Movie, HistoryEntry } from '../types/media'

interface HomeData {
  popularMovies: Movie[]
  recentMovies: Movie[]
  popularSeries: Movie[]
  // Anime real vía el sync de AniList conectado en y-cinema-api — puede
  // estar vacío hasta que ese job corra por primera vez en el backend.
  popularAnime: Movie[]
  continueWatching: HistoryEntry[]
}

interface CatalogState extends HomeData {
  homeLoaded: boolean
  homeLoading: boolean
  homeError: string | null
  loadHome: () => Promise<void>
  refreshContinueWatching: () => Promise<void>
}

export const useCatalogStore = create<CatalogState>((set, get) => ({
  popularMovies: [],
  recentMovies: [],
  popularSeries: [],
  popularAnime: [],
  continueWatching: [],
  homeLoaded: false,
  homeLoading: false,
  homeError: null,

  loadHome: async () => {
    if (get().homeLoading) return
    set({ homeLoading: true, homeError: null })
    try {
      const [popularMovies, recentMovies, popularSeries, popularAnime, cw] = await Promise.all([
        window.api.catalogApi.list({ type: 'MOVIE', sort: 'popularity', pageSize: 20 }),
        window.api.catalogApi.list({ type: 'MOVIE', sort: 'recent', pageSize: 20 }),
        window.api.catalogApi.list({ type: 'SERIES', sort: 'popularity', pageSize: 20 }),
        window.api.catalogApi.list({ type: 'ANIME', sort: 'popularity', pageSize: 20 }),
        window.api.history.continueWatching().catch(() => []),
      ])

      set({
        popularMovies: popularMovies?.items || [],
        recentMovies: recentMovies?.items || [],
        popularSeries: popularSeries?.items || [],
        popularAnime: popularAnime?.items || [],
        continueWatching: cw || [],
        homeLoaded: true,
        homeLoading: false,
      })
    } catch (err) {
      console.error('Failed to load home data', err)
      set({ homeLoading: false, homeError: 'No pudimos cargar el catálogo' })
    }
  },

  refreshContinueWatching: async () => {
    try {
      const cw = await window.api.history.continueWatching()
      set({ continueWatching: cw || [] })
    } catch {
      /* silencioso: no bloquea la home */
    }
  },
}))
