// ============================================================================
// src/components/remote-play/MobileControls.tsx
// ----------------------------------------------------------------------------
// Touch-optimized virtual gamepad for the mobile client side of Remote Play.
//
// Why custom instead of virtual-gamepad-lib:
//   We only need the basics (dual analog, ABXY, D-pad, shoulders, keyboard).
//   Pulling in a 12KB TS library with multi-touch choreography costs more
//   than building this focused component with the wire-format encode helpers
//   already in src/lib/input-frames.ts. The patterns below ARE the same
//   ones virtual-gamepad-lib uses (named SVG elements, pointer events with
//   touch-action:none, larger invisible tap-zone paths), so we kept the
//   architectural lessons.
//
// Pointer events (instead of touch events) so the same code paths handle
// mouse drags on desktop during testing — `touch-action: none` blocks the
// browser's default scroll/zoom but leaves our handler in charge of state.
//
// Layout note: StreamPlayer.tsx draws its own status badges at top-3 left-3
// (STREAMING/quality) and top-3 right-3 (host info) — every element here
// that lives near the top edge is pushed below those (top-14+) so nothing
// stacks on top of them. This was the root cause of controls being
// "barely visible": three separate absolutely-positioned elements were
// competing for the same top-left corner.
//
// Frame pipeline:
//   pointerdown / pointermove / pointerup on a zone
//     → component-local `onPress/onMove/onRelease` handler
//     → ENCODER (src/lib/input-frames.ts)
//     → props.onFrame(frame)
//     → webrtc.sendInput(frame) → RTCDataChannel → host input-bridge →
//       win32 SendInput
// ============================================================================

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Gamepad2,
  Keyboard,
  Type as TypeIcon,
  X,
} from 'lucide-react'
import {
  buildGamepadAxisFrame,
  buildGamepadButtonFrame,
  buildKeyFrame,
  buildKeyTextFrame,
  buildMouseClickFrame,
  buildWheelFrame,
} from '../../lib/input-frames'

// ── Props ────────────────────────────────────────────────────────────────

export interface MobileControlsProps {
  /**
   * Emit an input frame over the WebRTC data channel. Returns true on
   * successful queue, false if the channel is not yet open. The hook
   * queues nothing silently so frames are never buffered too long.
   */
  onFrame: (frame: Uint8Array) => boolean
  /** Whether the underlying data channel is open. Drives the badge. */
  channelOpen: boolean
  /** Forced visibility override; if undefined, defaults to touch detection. */
  forceVisible?: boolean
  /** Optional callback when the user toggles the keyboard panel. */
  onKeyboardVisibilityChange?: (visible: boolean) => void
}

// ── Design tokens — shared across every control so the overlay reads as
// one system (same language as the Android VirtualGamepad redesign):
// translucent tracks, accent highlight + scale-down on press. ─────────────

const ACCENT = '#6C63FF'
const idleRing = 'border-white/20'
const idleBg = 'bg-white/[0.07]'
const idleText = 'text-white/75'

// ── Touch detection ─────────────────────────────────────────────────────

function detectTouch(): boolean {
  if (typeof window === 'undefined') return false
  return (
    'ontouchstart' in window ||
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (navigator as any).maxTouchPoints > 0 ||
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    window.matchMedia?.('(pointer: coarse)').matches === true
  )
}

// ── Button geometry (visual radii for tap-zone math) ─────────────────────

const STICK_RADIUS = 60
const STICK_DEAD_ZONE = 0.10 // axis values in [-0.10, +0.10] emit 0

// ── Component ───────────────────────────────────────────────────────────

export default function MobileControls({
  onFrame,
  channelOpen,
  forceVisible,
  onKeyboardVisibilityChange,
}: MobileControlsProps) {
  // Default to visible on touch devices (auto-show the overlay); on
  // non-touch (desktop testing, mouse/keyboard) the overlay starts
  // collapsed but the toggle button below is always rendered so it can
  // still be opened manually — see the removed render gate below.
  const [visible, setVisible] = useState<boolean>(() => forceVisible ?? detectTouch())
  useEffect(() => {
    if (forceVisible !== undefined) setVisible(forceVisible)
  }, [forceVisible])
  const [showKeyboard, setShowKeyboard] = useState(false)

  const openKeyboard = useCallback(() => {
    setShowKeyboard(true)
    onKeyboardVisibilityChange?.(true)
  }, [onKeyboardVisibilityChange])
  const closeKeyboard = useCallback(() => {
    setShowKeyboard(false)
    onKeyboardVisibilityChange?.(false)
  }, [onKeyboardVisibilityChange])

  // Toggle button (always visible once the component renders, even if main
  // overlay is collapsed — gives desktop users a way in without typing).
  // Bottom-center so it never contends with StreamPlayer's top-corner
  // status badges.
  if (!visible) {
    return (
      <button
        type="button"
        onClick={() => setVisible(true)}
        className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 px-4 py-2.5 rounded-full bg-black/70 text-white border border-white/20 backdrop-blur-md hover:bg-black/85 shadow-lg shadow-black/40 transition-colors"
      >
        <Gamepad2 className="w-4 h-4" style={{ color: ACCENT }} />
        <span className="text-xs font-semibold">Mostrar controles</span>
      </button>
    )
  }

  return (
    <>
      <div
        className="absolute inset-0 z-30 select-none"
        // CRITICAL: blocks browser scroll/zoom/pinch on touch surfaces so
        // our pointer events stay authoritative over the gamepad area.
        style={{ touchAction: 'none' }}
        role="region"
        aria-label="Mobile gamepad controls"
      >
        {/* Hide-controls toggle — bottom-center, well clear of every other
            cluster and of StreamPlayer's top badges. */}
        <button
          type="button"
          onClick={() => setVisible(false)}
          className="absolute bottom-3 left-1/2 -translate-x-1/2 z-40 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/70 text-white border border-white/20 backdrop-blur-md hover:bg-black/85 text-[10px] font-semibold"
          aria-label="Hide mobile controls"
        >
          <span className={`w-1.5 h-1.5 rounded-full ${channelOpen ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`} />
          Controles
          <X className="w-3 h-3 opacity-70 ml-0.5" />
        </button>

        {/* Left analog stick */}
        <AnalogStick onChange={(x, y) => onFrame(buildGamepadAxisFrame(0, x, y))} />

        {/* D-Pad cluster, right next to the left stick */}
        <DPad
          onPress={(dir) => {
            const vk = dirToVk(dir)
            if (vk !== null) onFrame(buildKeyFrame(vk, true))
          }}
          onRelease={(dir) => {
            const vk = dirToVk(dir)
            if (vk !== null) onFrame(buildKeyFrame(vk, false))
          }}
        />

        {/* ABXY cluster on the right side */}
        <ButtonCluster
          onPress={(id) => onFrame(buildGamepadButtonFrame(id, true))}
          onRelease={(id) => onFrame(buildGamepadButtonFrame(id, false))}
        />

        {/* L1/R1 shoulder buttons — pushed below StreamPlayer's top badges */}
        <ShoulderButtons
          onPress={(id) => onFrame(buildGamepadButtonFrame(id, true))}
          onRelease={(id) => onFrame(buildGamepadButtonFrame(id, false))}
        />

        {/* Start / Select cluster — upper-center, clear of every side cluster */}
        <SystemButtons onTrigger={(vk, down) => onFrame(buildKeyFrame(vk, down))} />

        {/* Keyboard toggle — below the R1 shoulder button (top-14, h-11) so
            it doesn't stack on top of it. */}
        <button
          type="button"
          onClick={openKeyboard}
          className={`absolute top-28 right-3 z-40 flex items-center gap-1.5 px-3 py-2 rounded-xl ${idleBg} text-white border ${idleRing} backdrop-blur-md hover:bg-white/[0.12] active:scale-95 transition-all`}
          aria-label="Open on-screen keyboard"
        >
          <Keyboard className="w-4 h-4" />
          <span className="text-[11px] font-semibold">Teclado</span>
        </button>

        {/* Mouse wheel — vertical edge buttons, mid-right, clear of ABXY */}
        <WheelStrip onDelta={(delta) => onFrame(buildWheelFrame(delta))} />
      </div>

      {showKeyboard && (
        <KeyboardPanel
          onSubmit={(text) => {
            if (text.length > 0) onFrame(buildKeyTextFrame(text))
            closeKeyboard()
          }}
          onClose={closeKeyboard}
          onBackspace={() => onFrame(buildKeyFrame(0x08, true))}
        />
      )}
    </>
  )
}

// ── helpers ─────────────────────────────────────────────────────────────

function dirToVk(dir: 'up' | 'down' | 'left' | 'right'): number | null {
  switch (dir) {
    case 'up': return 0x26 // VK_UP
    case 'down': return 0x28 // VK_DOWN
    case 'left': return 0x25 // VK_LEFT
    case 'right': return 0x27 // VK_RIGHT
  }
}

// ── Analog Stick ────────────────────────────────────────────────────────

interface AnalogStickProps {
  /** Emit normalized (-1..1, -1..1) position while dragging */
  onChange: (x: number, y: number) => void
}

function AnalogStick({ onChange }: AnalogStickProps) {
  // Geometry is read on each pointer move so the dead-zone math adapts to
  // any future size changes.
  const baseRef = useRef<HTMLDivElement | null>(null)
  const stickRef = useRef<HTMLDivElement | null>(null)
  const [dragging, setDragging] = useState(false)

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault()
      setDragging(true)
      ;(e.target as Element).setPointerCapture?.(e.pointerId)
    },
    [],
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging) return // ignore hover/move with no active drag (pointerdown never fired)
      const base = baseRef.current
      if (!base) return
      const rect = base.getBoundingClientRect()
      const cx = rect.left + rect.width / 2
      const cy = rect.top + rect.height / 2
      let nx = (e.clientX - cx) / (rect.width / 2)
      let ny = (e.clientY - cy) / (rect.height / 2)
      // Clamp to unit circle
      const mag = Math.hypot(nx, ny)
      if (mag > 1) {
        nx /= mag
        ny /= mag
      }
      // Apply dead zone (so a slightly-off center doesn't drift)
      if (mag < STICK_DEAD_ZONE) {
        nx = 0
        ny = 0
      }
      const stick = stickRef.current
      if (stick) {
        stick.style.transform = `translate(${nx * STICK_RADIUS}px, ${ny * STICK_RADIUS}px)`
      }
      onChange(nx, ny)
    },
    [dragging, onChange],
  )

  const releaseStick = useCallback(() => {
    setDragging(false)
    const stick = stickRef.current
    if (stick) stick.style.transform = ''
    onChange(0, 0)
  }, [onChange])

  return (
    <div className="absolute bottom-16 left-4 z-30">
      <div
        ref={baseRef}
        className={`relative w-36 h-36 rounded-full bg-white/[0.05] border-[1.5px] backdrop-blur-md flex items-center justify-center transition-colors ${
          dragging ? 'border-[#6C63FF]/60' : idleRing
        }`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={releaseStick}
        onPointerCancel={releaseStick}
        onPointerLeave={(e) => {
          if ((e.buttons & 1) === 0) releaseStick()
        }}
      >
        <div
          ref={stickRef}
          className="w-16 h-16 rounded-full border transition-[transform,background-color,border-color] duration-75 ease-out"
          style={{
            background: dragging ? `${ACCENT}B8` : 'rgba(255,255,255,0.14)',
            borderColor: dragging ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.22)',
          }}
          aria-label="Analog stick"
        />
      </div>
    </div>
  )
}

// ── D-Pad ───────────────────────────────────────────────────────────────

interface DPadProps {
  onPress: (dir: 'up' | 'down' | 'left' | 'right') => void
  onRelease: (dir: 'up' | 'down' | 'left' | 'right') => void
}

function DPad({ onPress, onRelease }: DPadProps) {
  const btn = (
    dir: 'up' | 'down' | 'left' | 'right',
    classes: string,
    icon: React.ReactNode,
  ) => (
    <button
      type="button"
      // Pointer events alone cover touch, mouse, and pen — adding touch
      // handlers on top double-fires press/release on real touchscreens
      // (both event families dispatch independently for the same tap).
      onPointerDown={(e) => { e.preventDefault(); onPress(dir) }}
      onPointerUp={() => onRelease(dir)}
      onPointerLeave={() => onRelease(dir)}
      className={`absolute ${classes} w-12 h-12 rounded-xl
        ${idleBg} border ${idleRing} backdrop-blur-md
        ${idleText} flex items-center justify-center
        active:scale-90 active:border-white/50 transition-all
        text-sm font-bold
      `}
      aria-label={`D-pad ${dir}`}
    >
      {icon}
    </button>
  )

  return (
    <div className="absolute bottom-16 left-44 z-30 w-32 h-32 pointer-events-auto">
      {btn('up', 'top-0 left-1/2 -translate-x-1/2', '▲')}
      {btn('down', 'bottom-0 left-1/2 -translate-x-1/2', '▼')}
      {btn('left', 'left-0 top-1/2 -translate-y-1/2', '◀')}
      {btn('right', 'right-0 top-1/2 -translate-y-1/2', '▶')}
    </div>
  )
}

// ── ABXY Cluster ────────────────────────────────────────────────────────

interface ButtonClusterProps {
  onPress: (id: number) => void
  onRelease: (id: number) => void
}

function ButtonCluster({ onPress, onRelease }: ButtonClusterProps) {
  // ids from GAMEPAD_BTN_BY_ID order: 0=a (bottom), 1=b (right), 2=x (left), 3=y (top)
  const btn = (id: number, label: string, classes: string, color: string) => (
    <button
      type="button"
      onPointerDown={(e) => { e.preventDefault(); onPress(id) }}
      onPointerUp={() => onRelease(id)}
      onPointerLeave={() => onRelease(id)}
      style={{ color }}
      className={`absolute ${classes} w-16 h-16 rounded-full ${idleBg} border ${idleRing} backdrop-blur-md flex items-center justify-center text-lg font-bold active:scale-90 active:border-white/50 transition-all`}
      aria-label={label}
    >
      {label}
    </button>
  )

  return (
    <div className="absolute bottom-16 right-4 z-30 w-36 h-36 pointer-events-auto">
      {btn(3, 'Y', 'top-0 left-1/2 -translate-x-1/2', '#fbbf24')}
      {btn(1, 'B', 'right-0 top-1/2 -translate-y-1/2', '#f87171')}
      {btn(0, 'A', 'bottom-0 left-1/2 -translate-x-1/2', '#60a5fa')}
      {btn(2, 'X', 'left-0 top-1/2 -translate-y-1/2', '#34d399')}
    </div>
  )
}

// ── Shoulder Buttons (L1 / R1) ──────────────────────────────────────────
// Positioned below StreamPlayer's own top-3 status badges (top-14 clears
// their ~24px pill height + the 12px top offset).

function ShoulderButtons({
  onPress,
  onRelease,
}: {
  onPress: (id: number) => void
  onRelease: (id: number) => void
}) {
  const btn = (id: number, label: string, position: 'left' | 'right') => (
    <button
      type="button"
      onPointerDown={(e) => { e.preventDefault(); onPress(id) }}
      onPointerUp={() => onRelease(id)}
      onPointerLeave={() => onRelease(id)}
      className={`absolute top-14 ${position === 'left' ? 'left-3' : 'right-3'}
        w-16 h-11 rounded-t-2xl rounded-b-lg ${idleBg} border ${idleRing}
        backdrop-blur-md ${idleText} flex items-center justify-center
        text-xs font-bold active:scale-95 active:border-white/50 transition-all
      `}
      aria-label={label}
    >
      {label}
    </button>
  )
  return (
    <>
      {btn(12, 'L1', 'left')}
      {btn(13, 'R1', 'right')}
    </>
  )
}

// ── System Buttons (Start / Select) ─────────────────────────────────────
// Upper-center, between the two shoulder buttons — never overlaps a
// side cluster.

function SystemButtons({ onTrigger }: { onTrigger: (vk: number, down: boolean) => void }) {
  const btn = (label: string, vk: number) => (
    <button
      type="button"
      onPointerDown={(e) => { e.preventDefault(); onTrigger(vk, true) }}
      onPointerUp={() => onTrigger(vk, false)}
      onPointerLeave={() => onTrigger(vk, false)}
      className={`px-4 py-1.5 rounded-full ${idleBg} border ${idleRing}
        backdrop-blur-md ${idleText} text-[10px] font-bold tracking-wide
        active:scale-95 active:border-white/50 transition-all
      `}
      aria-label={label}
    >
      {label}
    </button>
  )
  return (
    <div className="absolute top-14 left-1/2 -translate-x-1/2 z-30 flex gap-2">
      {btn('SELECT', 0x1B)}
      {btn('START', 0x0D)}
    </div>
  )
}

// ── Wheel Strip (vertical right-edge buttons → scroll) ──────────────────
// Mid-right, clear of the ABXY cluster (which occupies bottom-16 right-4).

function WheelStrip({ onDelta }: { onDelta: (delta: number) => void }) {
  const handlePress = (delta: number) => onDelta(delta)

  return (
    <div className="absolute right-3 top-1/2 -translate-y-1/2 z-30 flex flex-col gap-1.5">
      <button
        type="button"
        onClick={() => handlePress(120)}
        className={`w-9 h-10 rounded-xl ${idleBg} border ${idleRing} backdrop-blur-md ${idleText} flex items-center justify-center text-xs font-bold active:scale-90 active:border-white/50 transition-all`}
        aria-label="Scroll up"
      >
        ▲
      </button>
      <button
        type="button"
        onClick={() => handlePress(-120)}
        className={`w-9 h-10 rounded-xl ${idleBg} border ${idleRing} backdrop-blur-md ${idleText} flex items-center justify-center text-xs font-bold active:scale-90 active:border-white/50 transition-all`}
        aria-label="Scroll down"
      >
        ▼
      </button>
    </div>
  )
}

// ── Keyboard Panel ──────────────────────────────────────────────────────

interface KeyboardPanelProps {
  onSubmit: (text: string) => void
  onClose: () => void
  onBackspace: () => void
}

/**
 * Simple text-input panel — feeds the text into the host via KEY_TEXT frames
 * (which the input-bridge decoder turns into individual keypresses). We
 * intentionally avoid drawing a full QWERTY on screen because most phones
 * already show their native soft keyboard when an `<input>` gets focus.
 */
function KeyboardPanel({ onSubmit, onClose, onBackspace }: KeyboardPanelProps) {
  const [value, setValue] = useState('')
  return (
    <div
      className="absolute inset-x-0 bottom-0 z-40 bg-black/90 backdrop-blur-md border-t border-white/10 p-3"
      role="dialog"
      aria-label="On-screen keyboard"
      style={{ touchAction: 'auto' }}
    >
      <div className="flex items-center gap-2 max-w-3xl mx-auto">
        <TypeIcon className="w-4 h-4 text-text-dim flex-shrink-0" />
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { onSubmit(value); setValue('') }
          }}
          placeholder="Type and press Submit..."
          className="flex-1 px-3 py-2 rounded-lg bg-white/[0.06] border border-white/[0.1] text-text-bright text-sm outline-none focus:border-accent/50"
        />
        <button
          type="button"
          onClick={onBackspace}
          className="px-3 py-2 rounded-lg bg-white/[0.06] border border-white/[0.1] text-text-dim text-xs font-bold active:bg-white/[0.1]"
        >
          ⌫ Back
        </button>
        <button
          type="button"
          onClick={() => { onSubmit(value); setValue('') }}
          className="px-4 py-2 rounded-lg text-white text-xs font-bold"
          style={{ background: 'var(--accent)' }}
        >
          Submit
        </button>
        <button
          type="button"
          onClick={onClose}
          className="px-3 py-2 rounded-lg bg-white/[0.06] border border-white/[0.1] text-text-dim text-xs font-semibold"
        >
          Close
        </button>
      </div>
    </div>
  )
}

// Re-export helpers so the parent can construct frames for desktop-style
// click targets as well (e.g. tapping the stream canvas sends a TOUCH frame).
export { buildMouseClickFrame }
