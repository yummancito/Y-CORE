// ============================================================================
// src/hooks/useScreenCapture.ts
// ----------------------------------------------------------------------------
// React hook for screen capture via navigator.mediaDevices.getDisplayMedia().
// Manages stream lifecycle: acquire, share, stop, with error handling.
//
// Used by Remote Play (Host tab) to capture and broadcast screen content.
// ============================================================================

import { useRef, useState, useCallback, useEffect } from 'react'
import { gameProcessService } from '../services/game-process.service'
import { useLibraryStore } from '../stores/useLibraryStore'
import { useRemotePlayStore } from '../stores/useRemotePlayStore'

export interface CaptureState {
  /** Whether a capture is currently active */
  active: boolean
  /** The captured MediaStream (null when not capturing) */
  stream: MediaStream | null
  /** Error message if capture failed */
  error: string | null
  /** Source type info */
  sourceType: 'screen' | 'window' | 'tab' | null
  /** Display surface info from the track */
  displaySurface: string | null
  /** Whether audio is included */
  hasAudio: boolean
  /** Video track dimensions */
  dimensions: { width: number; height: number } | null
  /**
   * Name of the running game whose window we matched and captured, or null
   * if we fell back to capturing the whole desktop (no game running, no
   * confident window match). Drives the "Transmitiendo: X" indicator in
   * RemotePlayPage's HostTab.
   */
  matchedGameName: string | null
}

export interface ScreenCaptureControls {
  state: CaptureState
  /** Start capturing a screen/window/tab. Shows the system picker. */
  startCapture: (opts?: { preferAudio?: boolean }) => Promise<void>
  /** Stop the current capture and release the stream */
  stopCapture: () => void
  /** Toggle audio capture on/off (if available) */
  toggleAudio: () => void
  /** Get current stats about the capture */
  getStats: () => MediaStreamTrackVideoStats | null
}

/** Stats we can extract from a video track */
export interface MediaStreamTrackVideoStats {
  frameRate: number | null
  width: number | null
  height: number | null
}

/**
 * Hook for screen capture using getDisplayMedia.
 * Returns controls and reactive state for the capture lifecycle.
 */
export function useScreenCapture(): ScreenCaptureControls {
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const videoTrackRef = useRef<MediaStreamTrack | null>(null)
  const audioTrackRef = useRef<MediaStreamTrack | null>(null)

  const [state, setState] = useState<CaptureState>({
    active: false,
    stream: null,
    error: null,
    sourceType: null,
    displaySurface: null,
    hasAudio: false,
    dimensions: null,
    matchedGameName: null,
  })

  // ── Track ended handler ──────────────────────────────────────────────
  // Handle cases where user stops sharing via browser UI (the "Stop Sharing"
  // button in the tab bar or the screen picker).
  const handleTrackEnded = useCallback(() => {
    stopCaptureInternal()
  }, [])

  // ── Internal stop (no state guard) ───────────────────────────────────
  function stopCaptureInternal() {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop())
      mediaStreamRef.current = null
    }
    videoTrackRef.current = null
    audioTrackRef.current = null
    setState({
      active: false,
      stream: null,
      error: null,
      sourceType: null,
      displaySurface: null,
      hasAudio: false,
      dimensions: null,
      matchedGameName: null,
    })
  }

  // ── Match the running game to a desktopCapturer window source ────────
  // Steam-style game auto-detection: Y-core already tracks running game
  // processes (electron/modules/game-process.ts). There is no native
  // PID→HWND lookup in this repo, so the match is done by name — the
  // window source's title vs. the installed game's display name — with
  // no match falling back to full-desktop capture (never throws).
  function normalizeForMatch(s: string): string {
    return s
      .normalize('NFD').replace(/[̀-ͯ]/g, '') // strip accents
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
  }

  async function findRunningGameWindowSource(
    sources: Array<{ id: string; name: string }>,
  ): Promise<{ source: { id: string; name: string }; gameName: string } | null> {
    try {
      const running = await gameProcessService.listRunning()
      if (!running || running.length !== 1) return null // 0 or ambiguous >1: fall back

      const appId = running[0].appId
      const game = useLibraryStore.getState().games.find((g) => g.appId === appId)
      if (!game?.name) return null

      const needle = normalizeForMatch(game.name)
      if (!needle) return null

      const windowSources = sources.filter((s) => s.id.startsWith('window:'))
      const match = windowSources.find((s) => {
        const hay = normalizeForMatch(s.name)
        return hay.includes(needle) || needle.includes(hay)
      })

      return match ? { source: match, gameName: game.name } : null
    } catch {
      return null // any failure (service unavailable, etc.) → fall back to full desktop
    }
  }

  // ── Internal helper: desktopCapturer + chromeMediaSourceId ───────────
  // Extracted from the try/catch so both the Electron-direct path and the
  // browser fallback path can reuse the same logic.
  // Note: desktopCapturer on Windows cannot capture system audio, so audio
  // is always disabled regardless of the preferAudio option.
  async function acquireViaDesktopCapturer(): Promise<{ stream: MediaStream; matchedGameName: string | null }> {
    const bridge = (window as any)?.steamtools?.getDesktopSources
    if (typeof bridge !== 'function') {
      throw new Error('desktopCapturer IPC bridge unavailable')
    }

    const sources: Array<{ id: string; name: string }> = await bridge(['window', 'screen'])
    const gameMatch = await findRunningGameWindowSource(sources)

    const chosen = gameMatch?.source
      ?? sources.find((s) => s.id.startsWith('screen:'))
      ?? sources[0]
    if (!chosen) {
      throw new Error('No screen/window sources available from desktopCapturer')
    }

    const { width: constraintWidth, height: constraintHeight, frameRate } = resolveCaptureConstraints()

    const stream: MediaStream = await navigator.mediaDevices.getUserMedia({
      video: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: chosen.id,
          minWidth: 640,
          maxWidth: constraintWidth,
          minHeight: 360,
          maxHeight: constraintHeight,
          minFrameRate: 15,
          maxFrameRate: frameRate,
        },
      },
      audio: false,
    } as any)

    if (!stream.getVideoTracks().length) {
      stream.getTracks().forEach((t) => t.stop())
      throw new Error('No video track in desktopCapturer stream')
    }

    // eslint-disable-next-line no-console
    console.info('[useScreenCapture] desktopCapturer acquired stream:', {
      sourceId: chosen.id,
      sourceName: chosen.name,
      matchedGame: gameMatch?.gameName ?? null,
    })
    return { stream, matchedGameName: gameMatch?.gameName ?? null }
  }

  // ── Internal helper: wire a MediaStream into refs + state ─────────────
  function applyStream(
    stream: MediaStream,
    opts?: { sourceType?: CaptureState['sourceType']; displaySurface?: string | null; matchedGameName?: string | null },
  ): void {
    const videoTrack = stream.getVideoTracks()[0]
    const audioTrack = stream.getAudioTracks()[0] || null

    let displaySurface: string | null = opts?.displaySurface ?? null
    let dimensions: { width: number; height: number } | null = null
    try {
      const settings = videoTrack.getSettings()
      displaySurface = settings.displaySurface || displaySurface
      if (settings.width && settings.height) {
        dimensions = { width: settings.width, height: settings.height }
      }
    } catch {
      // Settings may not be available
    }

    videoTrack.addEventListener('ended', handleTrackEnded)
    if (audioTrack) audioTrack.addEventListener('ended', handleTrackEnded)

    let sourceType: CaptureState['sourceType'] = opts?.sourceType ?? 'screen'
    if (displaySurface === 'window') sourceType = 'window'
    else if (displaySurface === 'browser') sourceType = 'tab'

    mediaStreamRef.current = stream
    videoTrackRef.current = videoTrack
    audioTrackRef.current = audioTrack

    setState({
      active: true,
      stream,
      error: null,
      sourceType,
      displaySurface,
      hasAudio: !!audioTrack,
      dimensions,
      matchedGameName: opts?.matchedGameName ?? null,
    })
  }

  // ── Resolve desired width/height/frameRate from Remote Play settings ──
  // Reads `useRemotePlayStore` directly (no subscription — capture is only
  // (re)started explicitly via startCapture, so a stale read is fine and
  // avoids re-running this hook's callbacks on every settings change).
  function resolveCaptureConstraints(): { width: number; height: number; frameRate: number } {
    const { resolution, fps } = useRemotePlayStore.getState().settings
    const [wStr, hStr] = (resolution || '1920x1080').split('x')
    const width = Number(wStr) || 1920
    const height = Number(hStr) || 1080
    const frameRate = Number(fps) || 60
    return { width, height, frameRate }
  }

  // ── Start capture ────────────────────────────────────────────────────
  const startCapture = useCallback(
    async (opts?: { preferAudio?: boolean }) => {
      // If already capturing, stop first
      if (mediaStreamRef.current) {
        stopCaptureInternal()
      }

      const isElectron = typeof navigator !== 'undefined' &&
        navigator.userAgent?.includes('Electron')

      if (isElectron) {
        // ── ELECTRON DIRECT PATH ────────────────────────────────────────
        // navigator.mediaDevices.getDisplayMedia exists in Electron 31 /
        // Chromium 126 but throws NotSupportedError when called. Skip it
        // entirely and go straight to the desktopCapturer + chromeMediaSource
        // trick. No system picker shown — auto-captures the primary monitor.
        try {
          const { stream, matchedGameName } = await acquireViaDesktopCapturer()
          applyStream(stream, { matchedGameName })
          return
        } catch (err: any) {
          // eslint-disable-next-line no-console
          console.error('[useScreenCapture] Electron desktopCapturer failed:', {
            name: err?.name, message: err?.message,
          })
          setState((prev) => ({
            ...prev,
            error: 'Screen capture unavailable — ensure Y-Core has permission to capture your screen.',
          }))
          return
        }
      }

      // ── STANDARD BROWSER PATH ─────────────────────────────────────────
      // Browser in secure context: try getDisplayMedia (shows system picker),
      // fall back to desktopCapturer + chromeMediaSource if it fails.
      try {
        // Diagnostic probe
        // eslint-disable-next-line no-console
        console.info('[useScreenCapture] env probe:', {
          hasMediaDevices: typeof navigator.mediaDevices !== 'undefined',
          hasGetDisplayMedia:
            typeof navigator.mediaDevices?.getDisplayMedia === 'function',
          isSecureContext:
            typeof window !== 'undefined' ? window.isSecureContext : null,
          ua: typeof navigator !== 'undefined' ? navigator.userAgent : null,
        })

        if (!navigator.mediaDevices?.getDisplayMedia) {
          throw new Error(
            'Screen capture is not supported in this environment. ' +
            'getDisplayMedia requires a secure context (HTTPS or localhost).',
          )
        }

        const { width, height, frameRate } = resolveCaptureConstraints()
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            // @ts-ignore – cursor is a valid constraint
            cursor: 'always',
            displaySurface: 'monitor',
            width: { ideal: width },
            height: { ideal: height },
            frameRate: { ideal: frameRate, max: frameRate },
          } as MediaTrackConstraints,
          audio: opts?.preferAudio !== false
            ? { echoCancellation: true, noiseSuppression: true }
            : false,
          // @ts-ignore – selfBrowserSurface hides current tab from picker
          selfBrowserSurface: 'exclude',
        } as DisplayMediaStreamOptions)

        if (!stream) {
          throw new Error('User cancelled the screen picker')
        }

        if (stream.getVideoTracks().length === 0) {
          stream.getTracks().forEach((t) => t.stop())
          throw new Error('No video track in captured stream')
        }

        applyStream(stream)
      } catch (primaryErr: any) {
        // eslint-disable-next-line no-console
        console.error('[useScreenCapture] getDisplayMedia failed, desktopCapturer fallback:', {
          name: primaryErr?.name,
          message: primaryErr?.message,
        })

        if (
          primaryErr.name === 'NotAllowedError' ||
          primaryErr.name === 'AbortError' ||
          primaryErr.message?.includes('cancelled') ||
          primaryErr.message?.includes('canceled')
        ) {
          // User cancelled — reset state silently
          setState((prev) => ({ ...prev, error: null }))
          return
        }

        // Fallback to desktopCapturer for non-Electron environments
        // where getDisplayMedia failed for other reasons.
        try {
          const { stream, matchedGameName } = await acquireViaDesktopCapturer()
          applyStream(stream, { matchedGameName })
        } catch (fallbackErr: any) {
          // eslint-disable-next-line no-console
          console.error('[useScreenCapture] desktopCapturer fallback also failed:', {
            name: fallbackErr?.name,
            message: fallbackErr?.message,
          })
          setState((prev) => ({
            ...prev,
            error: primaryErr?.message || 'Failed to start screen capture',
          }))
        }
      }
    },
    [handleTrackEnded],
  )

  // ── Stop capture ─────────────────────────────────────────────────────
  const stopCapture = useCallback(() => {
    stopCaptureInternal()
  }, [])

  // ── Toggle audio ─────────────────────────────────────────────────────
  const toggleAudio = useCallback(() => {
    if (audioTrackRef.current) {
      const enabled = !audioTrackRef.current.enabled
      audioTrackRef.current.enabled = enabled
      setState((prev) => ({ ...prev, hasAudio: enabled }))
    }
  }, [])

  // ── Get video stats ──────────────────────────────────────────────────
  const getStats = useCallback((): MediaStreamTrackVideoStats | null => {
    if (!videoTrackRef.current) return null
    try {
      const settings = videoTrackRef.current.getSettings()
      return {
        frameRate: settings.frameRate ?? null,
        width: settings.width ?? null,
        height: settings.height ?? null,
      }
    } catch {
      return null
    }
  }, [])

  // ── Cleanup on unmount ──────────────────────────────────────────────
  useEffect(() => {
    return () => {
      stopCaptureInternal()
    }
  }, [])

  return {
    state,
    startCapture,
    stopCapture,
    toggleAudio,
    getStats,
  }
}
