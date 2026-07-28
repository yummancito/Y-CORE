// ============================================================================
// src/pages/remote-play/StreamPreview.tsx
// ----------------------------------------------------------------------------
// Stream Preview — shows live captured screen content with overlay stats,
// quality controls, and capture state management.
//
// Used in the Host tab when actively streaming.
// ============================================================================

import { useEffect, useRef, useState } from 'react'
import {
  Monitor,
  MonitorUp,
  Square,
  Video,
  VideoOff,
  Volume2,
  VolumeX,
  Maximize2,
  Camera,
} from 'lucide-react'
import type { CaptureState } from '../../hooks/useScreenCapture'

// ── Props ──────────────────────────────────────────────────────────────────

interface StreamPreviewProps {
  captureState: CaptureState
  sessionName: string
  sessionPort: number
  onStopCapture: () => void
  onToggleAudio: () => void
  onReset: () => void
}

// ── FPS Counter ────────────────────────────────────────────────────────────

function useFpsCounter(videoElement: HTMLVideoElement | null): number {
  const [fps, setFps] = useState(0)
  const frameCountRef = useRef(0)
  const lastTimeRef = useRef(performance.now())

  useEffect(() => {
    if (!videoElement) return

    const metadataHandler = () => {
      lastTimeRef.current = performance.now()
    }
    videoElement.addEventListener('loadedmetadata', metadataHandler)

    // Use requestVideoFrameCallback if available, else fallback to timeupdate
    let rafId: number

    function onFrame() {
      frameCountRef.current++
      const now = performance.now()
      const elapsed = now - lastTimeRef.current

      if (elapsed >= 1000) {
        const currentFps = Math.round((frameCountRef.current * 1000) / elapsed)
        setFps(currentFps)
        frameCountRef.current = 0
        lastTimeRef.current = now
      }

      rafId = requestAnimationFrame(onFrame)
    }

    // Delay the start to let the video element stabilize
    const startTimeout = setTimeout(() => {
      rafId = requestAnimationFrame(onFrame)
    }, 500)

    return () => {
      clearTimeout(startTimeout)
      cancelAnimationFrame(rafId)
      videoElement.removeEventListener('loadedmetadata', metadataHandler)
    }
  }, [videoElement])

  return fps
}

// ── Source Icon ────────────────────────────────────────────────────────────

function SourceIcon({ type }: { type: CaptureState['sourceType'] }) {
  switch (type) {
    case 'window':
      return <MonitorUp className="w-3 h-3" />
    case 'tab':
      return <Monitor className="w-3 h-3" />
    default:
      return <Camera className="w-3 h-3" />
  }
}

// ── Component ──────────────────────────────────────────────────────────────

export default function StreamPreview({
  captureState,
  sessionName,
  sessionPort,
  onStopCapture,
  onToggleAudio,
  onReset,
}: StreamPreviewProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)

  const fps = useFpsCounter(videoRef.current)

  // ── Attach stream to video element ─────────────────────────────────────
  useEffect(() => {
    const video = videoRef.current
    if (!video || !captureState.stream) return

    // Store previous stream to compare
    const prevSrcObject = video.srcObject

    if (captureState.stream !== prevSrcObject) {
      video.srcObject = captureState.stream
    }

    return () => {
      // Cleanup: revoke object URL if we ever used one
      if (video.srcObject === captureState.stream) {
        video.srcObject = null
      }
    }
  }, [captureState.stream])

  // ── Fullscreen toggle ──────────────────────────────────────────────────
  const toggleFullscreen = async () => {
    if (!containerRef.current) return
    try {
      if (!document.fullscreenElement) {
        await containerRef.current.requestFullscreen()
        setIsFullscreen(true)
      } else {
        await document.exitFullscreen()
        setIsFullscreen(false)
      }
    } catch {
      // Fullscreen may not be available
    }
  }

  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement)
    }
    document.addEventListener('fullscreenchange', handleFsChange)
    return () => document.removeEventListener('fullscreenchange', handleFsChange)
  }, [])

  // ── Error state ────────────────────────────────────────────────────────
  if (captureState.error && !captureState.active) {
    return (
      <div className="rounded-2xl border border-red-500/20 bg-red-500/[0.04] p-6 text-center">
        <VideoOff className="w-8 h-8 text-red-400 mx-auto mb-3" />
        <p className="text-sm font-semibold text-red-400">Capture Error</p>
        <p className="text-xs text-text-dim mt-1 mb-4">{captureState.error}</p>
        <button
          onClick={onReset}
          className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-accent hover:brightness-110 transition-all"
        >
          Try Again
        </button>
      </div>
    )
  }

  // ── Loading / Not started ──────────────────────────────────────────────
  if (!captureState.active || !captureState.stream) {
    return null // Parent handles the "not streaming" state
  }

  // ── Live preview ───────────────────────────────────────────────────────
  return (
    <div
      ref={containerRef}
      className="relative rounded-2xl overflow-hidden border border-white/[0.08] bg-black group"
      style={{ aspectRatio: '16/9' }}
    >
      {/* Video element */}
      <video
        ref={videoRef}
        autoPlay
        muted={!captureState.hasAudio}
        playsInline
        className="w-full h-full object-contain"
      />

      {/* Gradient overlay at bottom for readability */}
      <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/60 to-transparent pointer-events-none" />

      {/* Top-left: session info */}
      <div className="absolute top-3 left-3 flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-semibold bg-black/50 text-white backdrop-blur-sm border border-white/[0.1]">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
          LIVE
        </span>
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium bg-black/40 text-text-dim backdrop-blur-sm">
          <SourceIcon type={captureState.sourceType} />
          {captureState.matchedGameName
            ? `Transmitiendo: ${captureState.matchedGameName}`
            : 'Transmitiendo: escritorio completo'}
        </span>
      </div>

      {/* Top-right: connection info */}
      <div className="absolute top-3 right-3 flex items-center gap-1.5">
        <span className="px-2 py-1 rounded-lg text-[10px] font-mono bg-black/40 text-text-dim backdrop-blur-sm">
          {sessionName}
        </span>
        <span className="px-2 py-1 rounded-lg text-[10px] font-mono bg-black/40 text-text-dim backdrop-blur-sm">
          :{sessionPort}
        </span>
      </div>

      {/* Bottom-left: stats overlay */}
      <div className="absolute bottom-3 left-3 flex items-center gap-3">
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-mono bg-black/40 text-text-dim backdrop-blur-sm">
          <Video className="w-3 h-3" />
          {fps} FPS
        </div>
        {captureState.dimensions && (
          <span className="px-2 py-1 rounded-lg text-[10px] font-mono bg-black/40 text-text-dim backdrop-blur-sm">
            {captureState.dimensions.width}×{captureState.dimensions.height}
          </span>
        )}
      </div>

      {/* Bottom-right: controls — visible on hover */}
      <div className="absolute bottom-3 right-3 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
        {/* Audio toggle */}
        <button
          onClick={onToggleAudio}
          className="p-2 rounded-lg bg-black/50 text-white hover:bg-black/70 backdrop-blur-sm transition-all"
          title={captureState.hasAudio ? 'Mute audio' : 'Audio not available'}
        >
          {captureState.hasAudio ? (
            <Volume2 className="w-3.5 h-3.5" />
          ) : (
            <VolumeX className="w-3.5 h-3.5 opacity-50" />
          )}
        </button>

        {/* Fullscreen */}
        <button
          onClick={toggleFullscreen}
          className="p-2 rounded-lg bg-black/50 text-white hover:bg-black/70 backdrop-blur-sm transition-all"
          title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>

        {/* Stop capture */}
        <button
          onClick={onStopCapture}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-bold text-white bg-red-500/80 hover:bg-red-500 backdrop-blur-sm transition-all"
        >
          <Square className="w-3 h-3" />
          Stop
        </button>
      </div>
    </div>
  )
}
