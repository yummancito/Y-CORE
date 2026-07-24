/// <reference types="vite/client" />

type AudioLanguage = 'latino' | 'castellano' | 'english' | 'japanese'
type SubtitleLanguage = 'es' | 'en' | 'none'
interface LanguagePrefs {
  audio: AudioLanguage
  subtitles: SubtitleLanguage
  fallbackAudio: AudioLanguage
  autoSubtitles: boolean
  remember: boolean
}

interface Window {
  api: {
    catalogApi: {
      list: (params?: {
        type?: 'MOVIE' | 'SERIES' | 'ANIME'
        genre?: string
        year?: number
        sort?: 'popularity' | 'recent'
        page?: number
        pageSize?: number
      }) => Promise<{ items: any[]; total: number; page: number; pageSize: number; totalPages: number }>
      getDetails: (id: string) => Promise<any | null>
      search: (
        q: string,
        opts?: { type?: string; genre?: string; limit?: number }
      ) => Promise<{ items: any[]; estimatedTotalHits: number; processingTimeMs: number }>
      getGenres: () => Promise<any[]>
    }
    torrent: {
      search: (
        query: string,
        year?: number,
        imdbId?: string,
        show?: { season: number; episode: number }
      ) => Promise<any>
      play: (magnetLink: string) => Promise<{
        streamUrl: string
        infoHash: string
        fileName: string
        fileSize: number
        duration: number
        needsTranscode: boolean
        audioTracks: Array<{ index: number; codec: string; language: string; title?: string }>
      }>
      stop: (hash: string) => Promise<void>
      getProgress: (hash: string) => Promise<number>
      getStatus: (hash: string) => Promise<{ peers: number; downloadSpeed: number; progress: number; downloaded: number }>
    }
    stream: {
      search: (
        tmdbId: string | number,
        title: string,
        year?: number,
        type?: string,
        show?: { season: number; episode: number },
        imdbId?: string
      ) => Promise<{
        streamUrl: string
        type: 'hls' | 'file'
        subtitles: Array<{ url: string; lang: string }>
        source: string
        quality: string
        headers?: Record<string, string>
      } | null>
      fallbackSearch: (
        title: string,
        year?: number,
        tmdbId?: string | number,
        type?: string,
        show?: { season: number; episode: number },
        imdbId?: string
      ) => Promise<{
        streamUrl: string
        type: 'hls' | 'file'
        subtitles: Array<{ url: string; lang: string }>
        source: string
        quality: string
        headers?: Record<string, string>
      } | null>
      getLogs: (limit?: number) => Promise<Array<{
        time: number
        level: 'info' | 'warn' | 'error'
        message: string
        meta?: Record<string, unknown>
      }>>
      clearLogs: () => Promise<void>
      testProvider: (
        tmdbId: number | string,
        title: string,
        year?: number,
        type?: string,
        show?: { season: number; episode: number },
        imdbId?: string
      ) => Promise<Array<{
        providerId: string
        name: string
        success: boolean
        error?: string
        timing: number
        streamUrl?: string
      }>>
      resolve: (sourceName: string, detailUrl: string) => Promise<{
        streamUrl: string
        needsTranscode: boolean
        audioTracks: Array<{ index: number; codec: string; language: string; title?: string }>
        duration: number
        infoHash: string
        fileName: string
        fileSize: number
      }>
    }
    language: {
      get: () => Promise<LanguagePrefs>
      set: (prefs: Partial<LanguagePrefs>) => Promise<LanguagePrefs>
      reset: () => Promise<LanguagePrefs>
      getAudioMatchers: () => Promise<{ preferred: string[]; fallback: string[] }>
    }
    scraper: {
      status: () => Promise<{ available: boolean }>
    }
    cache: {
      clear: () => Promise<void>
    }
    subtitles: {
      getFromTorrent: (infoHash: string) => Promise<any>
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
      ) => Promise<{
        tracks: Array<{
          name: string
          url: string
          lang: string
          format: string
          preferred: boolean
          origin: 'local' | 'opensubtitles'
        }>
        autoIndex: number | null
        preferredLang: string
        autoEnabled: boolean
      }>
      status: () => Promise<{ apiKeyDetected: boolean; endpoint: string }>
    }
    history: {
      save: (entry: any) => Promise<void>
      get: () => Promise<any[]>
      continueWatching: () => Promise<any[]>
      clear: () => Promise<void>
    }
    favorites: {
      add: (item: any) => Promise<void>
      remove: (id: number | string, mediaType: 'movie' | 'tv') => Promise<void>
      get: () => Promise<any[]>
      isFavorite: (id: number | string, mediaType: 'movie' | 'tv') => Promise<boolean>
    }
    auth: {
      signIn: (email: string, password: string) => Promise<AuthResult>
      signUp: (email: string, password: string) => Promise<AuthResult>
      signOut: () => Promise<void>
      getSession: () => Promise<AuthSession | null>
    }
  }
}

interface AuthResult {
  user: { id: string; email: string | null } | null
  session: AuthSession | null
}

interface AuthSession {
  access_token: string
  refresh_token: string
  expires_at?: number
  user: { id: string; email?: string }
}
