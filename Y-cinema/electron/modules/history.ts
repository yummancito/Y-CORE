import Store from 'electron-store'

interface HistoryEntry {
  // number | string: instalaciones existentes tienen ids numéricos de
  // TMDB guardados; y-cinema-api usa UUIDs string. Ambos deben poder
  // convivir en el mismo store sin migración de datos.
  id: number | string
  mediaType: 'movie' | 'tv'
  /** temporada/episodio — sin esto, ver un episodio distinto de la misma
   * serie sobreescribía el progreso guardado del anterior */
  season?: number
  episode?: number
  title: string
  posterPath: string | null
  backdropPath: string | null
  progress: number
  currentTime: number
  duration: number
  watchedAt: number
}

interface FavoriteItem {
  id: number | string
  mediaType: 'movie' | 'tv'
  title: string
  posterPath: string | null
  backdropPath: string | null
  voteAverage: number
  addedAt: number
}

interface StoreData {
  history: HistoryEntry[]
  favorites: FavoriteItem[]
}

export class HistoryStore {
  private store: Store<StoreData>

  constructor() {
    this.store = new Store<StoreData>({
      name: 'y-cinema-data',
      defaults: {
        history: [],
        favorites: [],
      },
    })
  }

  // ─── History ──────────────────────────────────────────────────

  async saveProgress(entry: Omit<HistoryEntry, 'watchedAt'>): Promise<void> {
    const history = this.store.get('history')
    // Para series, identificar por (id, season, episode) — sin esto, ver el
    // episodio 2 sobreescribía el registro de progreso del episodio 1.
    const existing = history.findIndex(
      (h) =>
        h.id === entry.id &&
        h.mediaType === entry.mediaType &&
        h.season === entry.season &&
        h.episode === entry.episode
    )

    const newEntry: HistoryEntry = {
      ...entry,
      watchedAt: Date.now(),
    }

    if (existing >= 0) {
      history[existing] = newEntry
    } else {
      history.unshift(newEntry)
    }

    // Mantener máximo 100 items
    this.store.set('history', history.slice(0, 100))
  }

  async getHistory(): Promise<HistoryEntry[]> {
    return this.store.get('history')
  }

  async getContinueWatching(): Promise<HistoryEntry[]> {
    const history = this.store.get('history')
    // Items con progreso entre 5% y 90%
    return history.filter((h) => h.progress > 0.05 && h.progress < 0.9)
  }

  async clearHistory(): Promise<void> {
    this.store.set('history', [])
  }

  // ─── Favorites ────────────────────────────────────────────────

  async addFavorite(item: Omit<FavoriteItem, 'addedAt'>): Promise<void> {
    const favorites = this.store.get('favorites')
    const exists = favorites.some((f) => f.id === item.id && f.mediaType === item.mediaType)

    if (!exists) {
      favorites.unshift({
        ...item,
        addedAt: Date.now(),
      })
      this.store.set('favorites', favorites)
    }
  }

  async removeFavorite(id: number | string, mediaType: 'movie' | 'tv'): Promise<void> {
    // TMDB reusa ids numéricos entre namespaces de movie/tv — sin mediaType,
    // una película y una serie con el mismo id se confunden y se puede
    // borrar el favorito equivocado.
    const favorites = this.store.get('favorites')
    this.store.set(
      'favorites',
      favorites.filter((f) => !(f.id === id && f.mediaType === mediaType))
    )
  }

  async getFavorites(): Promise<FavoriteItem[]> {
    return this.store.get('favorites')
  }

  async isFavorite(id: number | string, mediaType: 'movie' | 'tv'): Promise<boolean> {
    const favorites = this.store.get('favorites')
    return favorites.some((f) => f.id === id && f.mediaType === mediaType)
  }
}
