import { contextBridge, ipcRenderer } from 'electron'

const api = {
  catalogApi: {
    list: (params?: {
      type?: 'MOVIE' | 'SERIES' | 'ANIME'
      genre?: string
      year?: number
      sort?: 'popularity' | 'recent'
      page?: number
      pageSize?: number
    }) => ipcRenderer.invoke('catalogApi:list', params),
    getDetails: (id: string) => ipcRenderer.invoke('catalogApi:getDetails', id),
    search: (q: string, opts?: { type?: string; genre?: string; limit?: number }) =>
      ipcRenderer.invoke('catalogApi:search', q, opts),
    getGenres: () => ipcRenderer.invoke('catalogApi:getGenres'),
  },
  torrent: {
    search: (query: string, year?: number, imdbId?: string, show?: { season: number; episode: number }) =>
      ipcRenderer.invoke('torrent:search', query, year, imdbId, show),
    play: (magnetLink: string) =>
      ipcRenderer.invoke('torrent:play', magnetLink),
    stop: (hash: string) =>
      ipcRenderer.invoke('torrent:stop', hash),
    getProgress: (hash: string) =>
      ipcRenderer.invoke('torrent:progress', hash),
    getStatus: (hash: string) =>
      ipcRenderer.invoke('torrent:status', hash),
  },
  stream: {
    search: (
      tmdbId: string | number,
      title: string,
      year?: number,
      type?: string,
      show?: { season: number; episode: number },
      imdbId?: string
    ) => ipcRenderer.invoke('stream:search', tmdbId, title, year, type, show, imdbId),
    fallbackSearch: (
      title: string,
      year?: number,
      tmdbId?: string | number,
      type?: string,
      show?: { season: number; episode: number },
      imdbId?: string
    ) => ipcRenderer.invoke('stream:fallback', title, year, tmdbId, type, show, imdbId),
    getLogs: (limit?: number) => ipcRenderer.invoke('stream:logs', limit),
    clearLogs: () => ipcRenderer.invoke('stream:clearLogs'),
    testProvider: (
      tmdbId: number | string,
      title: string,
      year?: number,
      type?: string,
      show?: { season: number; episode: number },
      imdbId?: string
    ) => ipcRenderer.invoke('stream:testProvider', tmdbId, title, year, type, show, imdbId),
    resolve: (sourceName: string, detailUrl: string) =>
      ipcRenderer.invoke('stream:resolve', sourceName, detailUrl),
  },
  language: {
    get: () => ipcRenderer.invoke('lang:get'),
    set: (prefs: { audio?: string; subtitles?: string; fallbackAudio?: string }) =>
      ipcRenderer.invoke('lang:set', prefs),
    reset: () => ipcRenderer.invoke('lang:reset'),
    getAudioMatchers: () => ipcRenderer.invoke('lang:audioMatchers'),
  },
  scraper: {
    status: () => ipcRenderer.invoke('scraper:status'),
  },
  cache: {
    clear: () => ipcRenderer.invoke('cache:clear'),
  },
  subtitles: {
    getFromTorrent: (infoHash: string) =>
      ipcRenderer.invoke('subtitles:getTorrent', infoHash),
    find: (
      title: string,
      opts?: {
        year?: number
        season?: number
        episode?: number
        infoHash?: string
        tmdbId?: number
        mediaType?: 'movie' | 'episode'
      }
    ) => ipcRenderer.invoke('subtitles:find', title, opts),
    status: () => ipcRenderer.invoke('subtitles:status'),
  },
  history: {
    save: (entry: any) =>
      ipcRenderer.invoke('history:save', entry),
    get: () =>
      ipcRenderer.invoke('history:get'),
    continueWatching: () =>
      ipcRenderer.invoke('history:continueWatching'),
    clear: () =>
      ipcRenderer.invoke('history:clear'),
  },
  favorites: {
    add: (item: any) =>
      ipcRenderer.invoke('favorites:add', item),
    remove: (id: number | string, mediaType: 'movie' | 'tv') =>
      ipcRenderer.invoke('favorites:remove', id, mediaType),
    get: () =>
      ipcRenderer.invoke('favorites:get'),
    isFavorite: (id: number | string, mediaType: 'movie' | 'tv') =>
      ipcRenderer.invoke('favorites:isFavorite', id, mediaType),
  },
  auth: {
    signIn: (email: string, password: string) => ipcRenderer.invoke('auth:signIn', email, password),
    signUp: (email: string, password: string) => ipcRenderer.invoke('auth:signUp', email, password),
    signOut: () => ipcRenderer.invoke('auth:signOut'),
    getSession: () => ipcRenderer.invoke('auth:getSession'),
  },
}

contextBridge.exposeInMainWorld('api', api)

export type ApiType = typeof api
