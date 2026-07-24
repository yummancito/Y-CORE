import { create } from 'zustand'

export type PlayerStatus = 'idle' | 'searching' | 'connecting' | 'ready' | 'error'

interface PlayerState {
  status: PlayerStatus
  statusMessage: string
  streamUrl: string | null
  infoHash: string | null
  fileName: string | null
  quality: string | null
  error: string | null

  playing: boolean
  currentTime: number
  duration: number
  volume: number
  muted: boolean
  playbackRate: number
  theaterMode: boolean

  setStatus: (status: PlayerStatus, message?: string) => void
  setStream: (s: { streamUrl: string; infoHash: string; fileName: string; quality?: string }) => void
  setError: (error: string) => void
  setPlaying: (playing: boolean) => void
  setProgress: (currentTime: number, duration: number) => void
  setVolume: (volume: number) => void
  setMuted: (muted: boolean) => void
  setPlaybackRate: (rate: number) => void
  toggleTheater: () => void
  reset: () => void
}

const initial = {
  status: 'idle' as PlayerStatus,
  statusMessage: '',
  streamUrl: null,
  infoHash: null,
  fileName: null,
  quality: null,
  error: null,
  playing: false,
  currentTime: 0,
  duration: 0,
  theaterMode: false,
}

export const usePlayerStore = create<PlayerState>((set) => ({
  ...initial,
  volume: 1,
  muted: false,
  playbackRate: 1,

  setStatus: (status, message = '') => set({ status, statusMessage: message }),
  setStream: ({ streamUrl, infoHash, fileName, quality }) =>
    set({ streamUrl, infoHash, fileName, quality: quality || null, status: 'ready', error: null }),
  setError: (error) => set({ error, status: 'error' }),
  setPlaying: (playing) => set({ playing }),
  setProgress: (currentTime, duration) => set({ currentTime, duration }),
  setVolume: (volume) => set({ volume, muted: volume === 0 }),
  setMuted: (muted) => set({ muted }),
  setPlaybackRate: (playbackRate) => set({ playbackRate }),
  toggleTheater: () => set((s) => ({ theaterMode: !s.theaterMode })),
  reset: () => set({ ...initial }),
}))
