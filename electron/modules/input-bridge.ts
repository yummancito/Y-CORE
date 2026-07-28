// ============================================================================
// electron/modules/input-bridge.ts
// ----------------------------------------------------------------------------
// Input bridge — receives binary input frames from a connected mobile client
// over a WebRTC data channel (see src/hooks/useWebRTC.ts) and dispatches
// each one to the Win32 SendInput wrapper in win32-input.ts.
//
// Wire format (all multi-byte fields little-endian):
//
//   0x01 KEY_DOWN     [vk u16]                         key down by VK code
//   0x02 KEY_UP       [vk u16]                         key up by VK code
//   0x03 MOUSE_MOVE   [dx i16, dy i16]                 relative mouse move
//   0x04 MOUSE_CLICK  [button u8, pressed u8]          click ('left'|'right'|'middle'|'x1'|'x2')
//   0x05 GAMEPAD_BTN  [btnId u8, pressed u8]           gamepad button map
//   0x06 GAMEPAD_AXIS [axisId u8, x f32, y f32]        analog stick position
//   0x07 TOUCH        [x f32, y f32, action u8]        absolute touch (sim mouse)
//   0x08 WHEEL        [delta i16]                      scroll wheel (+up/-down)
//   0x09 KEY_TEXT     [utf8 text, NUL-terminated]      type a string
//   0x0a BYE          [no payload]                     session end
//
// Each frame must match the format the renderer sends. Both sides are
// designed to be tiny (<32B per event) so 60Hz input is ~2KB/s — well
// within DataChannel budgets even on LAN.
// ============================================================================

import { ipcMain } from 'electron'
import { logger } from '../logger'
import * as win32 from './win32-input'
import { InputFrameType } from '../common/ipc-contract'

// ── Gamepad button byte → name mapping (matches GAMEPAD_BUTTON_MAP in
//    win32-input.ts so the VK mapping is consistent on the host) ────────

const GAMEPAD_BTN_BY_ID: Record<number, string> = {
  0: 'a',
  1: 'b',
  2: 'x',
  3: 'y',
  4: 'dpad_up',
  5: 'dpad_down',
  6: 'dpad_left',
  7: 'dpad_right',
  8: 'start',
  9: 'back',
  10: 'left_thumb',
  11: 'right_thumb',
  12: 'left_shoulder',
  13: 'right_shoulder',
  14: 'left_trigger',
  15: 'right_trigger',
}

const MOUSE_BTN_BY_ID: Record<number, string> = {
  0: 'left',
  1: 'right',
  2: 'middle',
  3: 'x1',
  4: 'x2',
}

// ── Decoder ──────────────────────────────────────────────────────────────

interface AxisState {
  /** Last x value in [-1, 1] */
  x: number
  /** Last y value in [-1, 1] */
  y: number
}
/**
 * Last-seen analog stick position per axis. Used so that consecutive axis
 * frames produce incremental mouse movement instead of jumps (the renderer
 * sends absolute position at ~30Hz, but the host wants continuous movement).
 */
const lastAxis: Record<number, AxisState> = {}

/**
 * Decode a single input frame and dispatch the corresponding Win32 event.
 * Returns `true` if the frame was understood, `false` on parse error.
 */
export function dispatchFrame(frame: Uint8Array, platform: NodeJS.Platform): boolean {
  if (frame.length < 1) return false
  const type = frame[0]
  // DataView gives us well-defined endianness instead of Buffer confusion.
  const dv = new DataView(frame.buffer, frame.byteOffset, frame.byteLength)

  try {
    switch (type) {
      case InputFrameType.KEY_DOWN: {
        if (frame.length < 3) return false
        const vk = dv.getUint16(1, true)
        win32.keyDown(vk)
        return true
      }
      case InputFrameType.KEY_UP: {
        if (frame.length < 3) return false
        const vk = dv.getUint16(1, true)
        win32.keyUp(vk)
        return true
      }
      case InputFrameType.MOUSE_MOVE: {
        if (frame.length < 5) return false
        const dx = dv.getInt16(1, true)
        const dy = dv.getInt16(3, true)
        win32.injectMouseMove(dx, dy)
        return true
      }
      case InputFrameType.MOUSE_CLICK: {
        if (frame.length < 3) return false
        const btnId = dv.getUint8(1)
        const pressed = dv.getUint8(2) !== 0
        const name = MOUSE_BTN_BY_ID[btnId]
        if (!name) return false
        win32.injectMouseButton(name, pressed)
        return true
      }
      case InputFrameType.GAMEPAD_BTN: {
        if (frame.length < 3) return false
        const btnId = dv.getUint8(1)
        const pressed = dv.getUint8(2) !== 0
        const name = GAMEPAD_BTN_BY_ID[btnId]
        if (!name) return false
        win32.injectGamepadButton(name, pressed)
        return true
      }
      case InputFrameType.GAMEPAD_AXIS: {
        // Layout (10 bytes, matches buildGamepadAxisFrame in src/lib/input-frames.ts):
        // type(1) + axisId(1) + x:f32 LE(offset 2..5) + y:f32 LE(offset 6..9)
        if (frame.length < 10) return false
        const axisId = dv.getUint8(1)
        const x = dv.getFloat32(2, true)
        const y = dv.getFloat32(6, true)
        // We received axis 0 (left stick) → drive mouse for aim-style games.
        // Renderer sends absolute position; we convert to incremental
        // mouse moves bounded by a reasonable sensitivity.
        const dx = x * 12 // px per unit per frame
        const dy = y * 12
        if (dx !== 0 || dy !== 0) {
          win32.injectMouseMove(Math.round(dx), Math.round(dy))
        }
        lastAxis[axisId] = { x, y }
        return true
      }
      case InputFrameType.TOUCH: {
        if (frame.length < 10) return false
        const x = dv.getFloat32(1, true)
        const y = dv.getFloat32(5, true)
        const action = dv.getUint8(9)
        // Fractional 0..1 coords + screen dimensions would be ideal but we
        // accept fractional 0..1 + the win32 helper normalizes to 65535.
        const act = action === 0 ? 'down' : action === 2 ? 'up' : 'move'
        const { screen } = require('electron') as typeof import('electron')
        const display = screen.getPrimaryDisplay()
        win32.injectMouseAbsolute(x, y, display.bounds.width, display.bounds.height)
        if (act === 'down') win32.injectMouseButton('left', true)
        else if (act === 'up') win32.injectMouseButton('left', false)
        return true
      }
      case InputFrameType.WHEEL: {
        if (frame.length < 3) return false
        const delta = dv.getInt16(1, true)
        win32.injectMouseWheel(delta)
        return true
      }
      case InputFrameType.KEY_TEXT: {
        const text = bytesToUtf8(frame, 1) // skip type byte
        if (text) win32.injectText(text)
        return true
      }
      case InputFrameType.BYE: {
        // No actual dispatch — just informational. Could flush key states.
        logger.info('[InputBridge] Client sent BYE — ending input session', 'remote-play')
        return true
      }
      default:
        return false
    }
  } catch (err: any) {
    logger.warn(`[InputBridge] dispatch failed (type=0x${type.toString(16)}): ${err.message}`, 'remote-play')
    return false
  }
}

/**
 * Decode NUL-terminated UTF-8 text starting at `from` in `frame`. Returns
 * the decoded string up to (but not including) the NUL byte, or empty
 * if no NUL is found.
 */
function bytesToUtf8(frame: Uint8Array, from: number): string {
  let end = frame.length
  for (let i = from; i < frame.length; i++) {
    if (frame[i] === 0) { end = i; break }
  }
  return new TextDecoder('utf-8').decode(frame.subarray(from, end))
}

// ── IPC wiring ───────────────────────────────────────────────────────────

let registered = false

/**
 * Register the `inputBridge:dispatch` and `inputBridge:isReady` IPC channels.
 * Safe to call multiple times — only registers once.
 */
export function registerInputBridgeIpc(): void {
  if (registered) return
  registered = true

  ipcMain.handle('inputBridge:dispatch', async (_evt, frame: unknown) => {
    if (!win32.isAvailable()) {
      return { ok: false, reason: win32.getError() || 'Win32 input injector unavailable' }
    }
    if (!(frame instanceof Uint8Array) && !Array.isArray(frame) && !(frame instanceof ArrayBuffer)) {
      return { ok: false, reason: 'frame must be Uint8Array, ArrayBuffer, or number[]' }
    }
    let bytes: Uint8Array
    if (frame instanceof Uint8Array) bytes = frame
    else if (frame instanceof ArrayBuffer) bytes = new Uint8Array(frame)
    else bytes = new Uint8Array(frame as number[])

    const ok = dispatchFrame(bytes, process.platform)
    return ok
      ? { ok: true }
      : { ok: false, reason: 'frame could not be decoded' }
  })

  ipcMain.handle('inputBridge:isReady', async () => {
    return {
      available: win32.isAvailable(),
      error: win32.getError(),
      platform: process.platform,
    }
  })

  logger.info('[InputBridge] IPC handlers registered (dispatch, isReady)', 'remote-play')
}

// ── Self-register on import ──────────────────────────────────────────────
// The module is loaded once during app startup, which is when ipcMain is
// available. If `registerInputBridgeIpc()` has already been called by
// another importer the call is a no-op (guarded by the `registered` flag).
registerInputBridgeIpc()

// Fix PDF escape: ensure the previous replacement produced this content.
