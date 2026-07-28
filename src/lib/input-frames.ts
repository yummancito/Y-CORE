// ============================================================================
// src/lib/input-frames.ts
// ----------------------------------------------------------------------------
// Shared encoder/decoder helpers for the binary input frames exchanged
// between the mobile client (renderer) and the host (main process via IPC).
//
// Encoding is shared by:
//   - src/components/remote-play/MobileControls.tsx (sender)
//   - src/pages/RemotePlayPage.tsx (consumer)
//
// The wire format is duplicated in:
//   - electron/common/ipc-contract.ts (InputFrameType enum)
//   - electron/modules/input-bridge.ts (decoder + dispatcher)
//
// Both sides MUST stay in sync. If you add a new frame type, add the
// constant here AND in the contract, plus a decoder case in input-bridge.
// ============================================================================

import { InputFrameType } from '../../electron/common/ipc-contract'

// ── Constants (mirror VK codes from electron/modules/win32-input.ts) ──────

/** Subset of VK codes the gamepad UI may emit. */
export const GAMEPAD_BTN_BY_ID: Array<{ id: number; vk: number }> = [
  { id: 0, vk: 0x5A }, // a     → Z
  { id: 1, vk: 0x58 }, // b     → X
  { id: 2, vk: 0x41 }, // x     → A
  { id: 3, vk: 0x53 }, // y     → S
  { id: 4, vk: 0x26 }, // up
  { id: 5, vk: 0x28 }, // down
  { id: 6, vk: 0x25 }, // left
  { id: 7, vk: 0x27 }, // right
  { id: 8, vk: 0x0D }, // start → Enter
  { id: 9, vk: 0x1B }, // back  → Esc
  { id: 10, vk: 0x10 }, // left_thumb  → Shift
  { id: 11, vk: 0x11 }, // right_thumb → Ctrl
  { id: 12, vk: 0x51 }, // left_shoulder  → Q
  { id: 13, vk: 0x45 }, // right_shoulder → E
  { id: 14, vk: 0x31 }, // left_trigger  → 1
  { id: 15, vk: 0x32 }, // right_trigger → 2
]

// ── Encoders ─────────────────────────────────────────────────────────────

/** Allocate a Uint8Array of given size and return a DataView over it. */
function makeFrame(size: number): { buf: Uint8Array; view: DataView } {
  const buf = new Uint8Array(size)
  return { buf, view: new DataView(buf.buffer) }
}

/** KEY_DOWN / KEY_UP frame: type(1) + vk(u16 LE) */
export function buildKeyFrame(vk: number, down: boolean): Uint8Array {
  const { buf, view } = makeFrame(3)
  buf[0] = down ? InputFrameType.KEY_DOWN : InputFrameType.KEY_UP
  view.setUint16(1, vk, true)
  return buf
}

/** MOUSE_CLICK frame: type(1) + button(u8) + pressed(u8) */
export function buildMouseClickFrame(button: number, pressed: boolean): Uint8Array {
  const { buf, view } = makeFrame(3)
  buf[0] = InputFrameType.MOUSE_CLICK
  view.setUint8(1, button & 0xff)
  view.setUint8(2, pressed ? 1 : 0)
  return buf
}

/** GAMEPAD_BTN frame: type(1) + btnId(u8) + pressed(u8) */
export function buildGamepadButtonFrame(btnId: number, pressed: boolean): Uint8Array {
  const { buf, view } = makeFrame(3)
  buf[0] = InputFrameType.GAMEPAD_BTN
  view.setUint8(1, btnId & 0xff)
  view.setUint8(2, pressed ? 1 : 0)
  return buf
}

/** GAMEPAD_AXIS frame: type(1) + axisId(u8) + x(f32 LE) + y(f32 LE)*/
export function buildGamepadAxisFrame(axisId: number, x: number, y: number): Uint8Array {
  const { buf, view } = makeFrame(10)
  buf[0] = InputFrameType.GAMEPAD_AXIS
  view.setUint8(1, axisId & 0xff)
  view.setFloat32(2, clampF32(x), true)
  view.setFloat32(6, clampF32(y), true)
  return buf
}

/** WHEEL frame: type(1) + delta(i16 LE) */
export function buildWheelFrame(delta: number): Uint8Array {
  const { buf, view } = makeFrame(3)
  buf[0] = InputFrameType.WHEEL
  view.setInt16(1, clampI16(delta), true)
  return buf
}

/** KEY_TEXT frame: type(1) + utf8 text + NUL terminator */
export function buildKeyTextFrame(text: string): Uint8Array {
  const enc = new TextEncoder()
  const textBytes = enc.encode(text)
  const buf = new Uint8Array(1 + textBytes.length + 1)
  buf[0] = InputFrameType.KEY_TEXT
  buf.set(textBytes, 1)
  // NUL terminator already 0 from Uint8Array allocation
  return buf
}

// ── Helpers ──────────────────────────────────────────────────────────────

function clampI16(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.max(-32768, Math.min(32767, Math.round(n)))
}

function clampF32(n: number): number {
  if (!Number.isFinite(n)) return 0
  // Float32 range but values should be [-1, 1] for axes.
  return Math.max(-3.4e38, Math.min(3.4e38, n))
}
