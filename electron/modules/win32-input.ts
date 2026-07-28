// ============================================================================
// electron/modules/win32-input.ts
// ----------------------------------------------------------------------------
// Win32 Input Injection — wraps user32!SendInput via koffi (FFI).
//
// Sends synthetic keyboard, mouse, and gamepad events to the foreground
// window using the Windows INPUT structure. Designed for Remote Play input
// forwarding from Android/mobile clients.
//
// ARCHITECTURE:
//   koffi.load('user32.dll')
//     └── SendInput(cInputs, pInputs, cbSize)
//           ├── INPUT_KEYBOARD (type=1) + KEYBDINPUT
//           ├── INPUT_MOUSE (type=0) + MOUSEINPUT
//           └── INPUT_HARDWARE (type=2) — gamepad mapped to keyboard
//
// REFERENCES:
//   - https://docs.microsoft.com/en-us/windows/win32/api/winuser/ns-winuser-input
//   - https://docs.microsoft.com/en-us/windows/win32/api/winuser/ns-winuser-keybdinput
//   - https://docs.microsoft.com/en-us/windows/win32/api/winuser/ns-winuser-mouseinput
// ============================================================================

import { logger } from '../logger'

// ── Win32 Constants ─────────────────────────────────────────────────────────

/** INPUT type: mouse event */
export const INPUT_MOUSE = 0
/** INPUT type: keyboard event */
export const INPUT_KEYBOARD = 1
/** INPUT type: hardware (gamepad) event */
export const INPUT_HARDWARE = 2

// ── KEYBDINPUT dwFlags ─────────────────────────────────────────────────────

/** Key is being pressed */
export const KEYEVENTF_KEYDOWN = 0x0000
/** Key is being released */
export const KEYEVENTF_KEYUP = 0x0002
/** Scan code, not virtual key */
export const KEYEVENTF_SCANCODE = 0x0008
/** Extended key (e.g., function key, arrow key) */
export const KEYEVENTF_EXTENDEDKEY = 0x0001

// ── MOUSEINPUT dwFlags ─────────────────────────────────────────────────────

/** Mouse movement relative to current position */
export const MOUSEEVENTF_MOVE = 0x0001
/** Absolute mouse movement */
export const MOUSEEVENTF_ABSOLUTE = 0x8000
/** Left button press */
export const MOUSEEVENTF_LEFTDOWN = 0x0002
/** Left button release */
export const MOUSEEVENTF_LEFTUP = 0x0004
/** Right button press */
export const MOUSEEVENTF_RIGHTDOWN = 0x0008
/** Right button release */
export const MOUSEEVENTF_RIGHTUP = 0x0010
/** Middle button press */
export const MOUSEEVENTF_MIDDLEDOWN = 0x0020
/** Middle button release */
export const MOUSEEVENTF_MIDDLEUP = 0x0040
/** X button press */
export const MOUSEEVENTF_XDOWN = 0x0080
/** X button release */
export const MOUSEEVENTF_XUP = 0x0100
/** Mouse wheel */
export const MOUSEEVENTF_WHEEL = 0x0800
/** Horizontal wheel */
export const MOUSEEVENTF_HWHEEL = 0x1000

// ── Virtual Key Codes ──────────────────────────────────────────────────────

export const VK = {
  // Navigation
  BACK: 0x08,
  TAB: 0x09,
  CLEAR: 0x0C,
  RETURN: 0x0D,
  SHIFT: 0x10,
  CONTROL: 0x11,
  MENU: 0x12, // ALT
  PAUSE: 0x13,
  CAPITAL: 0x14, // CAPS LOCK
  ESCAPE: 0x1B,
  SPACE: 0x20,
  PRIOR: 0x21, // PAGE UP
  NEXT: 0x22, // PAGE DOWN
  END: 0x23,
  HOME: 0x24,
  LEFT: 0x25,
  UP: 0x26,
  RIGHT: 0x27,
  DOWN: 0x28,
  SELECT: 0x29,
  PRINT: 0x2A,
  EXECUTE: 0x2B,
  SNAPSHOT: 0x2C, // PRINT SCREEN
  INSERT: 0x2D,
  DELETE: 0x2E,
  HELP: 0x2F,

  // Alphanumeric
  KEY_0: 0x30,
  KEY_1: 0x31,
  KEY_2: 0x32,
  KEY_3: 0x33,
  KEY_4: 0x34,
  KEY_5: 0x35,
  KEY_6: 0x36,
  KEY_7: 0x37,
  KEY_8: 0x38,
  KEY_9: 0x39,
  KEY_A: 0x41,
  KEY_B: 0x42,
  KEY_C: 0x43,
  KEY_D: 0x44,
  KEY_E: 0x45,
  KEY_F: 0x46,
  KEY_G: 0x47,
  KEY_H: 0x48,
  KEY_I: 0x49,
  KEY_J: 0x4A,
  KEY_K: 0x4B,
  KEY_L: 0x4C,
  KEY_M: 0x4D,
  KEY_N: 0x4E,
  KEY_O: 0x4F,
  KEY_P: 0x50,
  KEY_Q: 0x51,
  KEY_R: 0x52,
  KEY_S: 0x53,
  KEY_T: 0x54,
  KEY_U: 0x55,
  KEY_V: 0x56,
  KEY_W: 0x57,
  KEY_X: 0x58,
  KEY_Y: 0x59,
  KEY_Z: 0x5A,

  // Modifiers
  LWIN: 0x5B,
  RWIN: 0x5C,
  APPS: 0x5D,

  // Numpad
  NUMPAD0: 0x60,
  NUMPAD1: 0x61,
  NUMPAD2: 0x62,
  NUMPAD3: 0x63,
  NUMPAD4: 0x64,
  NUMPAD5: 0x65,
  NUMPAD6: 0x66,
  NUMPAD7: 0x67,
  NUMPAD8: 0x68,
  NUMPAD9: 0x69,
  MULTIPLY: 0x6A,
  ADD: 0x6B,
  SEPARATOR: 0x6C,
  SUBTRACT: 0x6D,
  DECIMAL: 0x6E,
  DIVIDE: 0x6F,

  // Function keys
  F1: 0x70,
  F2: 0x71,
  F3: 0x72,
  F4: 0x73,
  F5: 0x74,
  F6: 0x75,
  F7: 0x76,
  F8: 0x77,
  F9: 0x78,
  F10: 0x79,
  F11: 0x7A,
  F12: 0x7B,
  F13: 0x7C,
  F14: 0x7D,
  F15: 0x7E,
  F16: 0x7F,
  F17: 0x80,
  F18: 0x81,
  F19: 0x82,
  F20: 0x83,
  F21: 0x84,
  F22: 0x85,
  F23: 0x86,
  F24: 0x87,

  // Misc
  NUMLOCK: 0x90,
  SCROLL: 0x91,

  // OEM specific
  LSHIFT: 0xA0,
  RSHIFT: 0xA1,
  LCONTROL: 0xA2,
  RCONTROL: 0xA3,
  LMENU: 0xA4, // LALT
  RMENU: 0xA5, // RALT

  // VK gamepad mapping (standard Windows gamepad VK codes)
  // These map XInput buttons to virtual key codes that most games recognize
  GAMEPAD_DPAD_UP: 0x26,    // VK_UP
  GAMEPAD_DPAD_DOWN: 0x28,  // VK_DOWN
  GAMEPAD_DPAD_LEFT: 0x25,  // VK_LEFT
  GAMEPAD_DPAD_RIGHT: 0x27, // VK_RIGHT
  GAMEPAD_START: 0x0D,      // VK_RETURN
  GAMEPAD_BACK: 0x1B,       // VK_ESCAPE
  GAMEPAD_LEFT_THUMB: 0x10, // VK_SHIFT
  GAMEPAD_RIGHT_THUMB: 0x11,// VK_CONTROL
  GAMEPAD_LEFT_SHOULDER: 0x51,  // Q
  GAMEPAD_RIGHT_SHOULDER: 0x45, // E
  GAMEPAD_A: 0x5A,  // Z
  GAMEPAD_B: 0x58,  // X
  GAMEPAD_X: 0x41,  // A
  GAMEPAD_Y: 0x53,  // S
  GAMEPAD_LEFT_TRIGGER: 0x31,  // 1
  GAMEPAD_RIGHT_TRIGGER: 0x32, // 2
} as const

// ── Gamepad button name → VK mapping ───────────────────────────────────────

const GAMEPAD_BUTTON_MAP: Record<string, number> = {
  'a': VK.GAMEPAD_A,
  'b': VK.GAMEPAD_B,
  'x': VK.GAMEPAD_X,
  'y': VK.GAMEPAD_Y,
  'dpad_up': VK.GAMEPAD_DPAD_UP,
  'dpad_down': VK.GAMEPAD_DPAD_DOWN,
  'dpad_left': VK.GAMEPAD_DPAD_LEFT,
  'dpad_right': VK.GAMEPAD_DPAD_RIGHT,
  'start': VK.GAMEPAD_START,
  'back': VK.GAMEPAD_BACK,
  'left_thumb': VK.GAMEPAD_LEFT_THUMB,
  'right_thumb': VK.GAMEPAD_RIGHT_THUMB,
  'left_shoulder': VK.GAMEPAD_LEFT_SHOULDER,
  'right_shoulder': VK.GAMEPAD_RIGHT_SHOULDER,
  'left_trigger': VK.GAMEPAD_LEFT_TRIGGER,
  'right_trigger': VK.GAMEPAD_RIGHT_TRIGGER,
}

// ── Key name → VK mapping ──────────────────────────────────────────────────

const KEY_NAME_MAP: Record<string, number> = {
  'backspace': VK.BACK,
  'tab': VK.TAB,
  'enter': VK.RETURN,
  'return': VK.RETURN,
  'shift': VK.SHIFT,
  'ctrl': VK.CONTROL,
  'control': VK.CONTROL,
  'alt': VK.MENU,
  'pause': VK.PAUSE,
  'capslock': VK.CAPITAL,
  'escape': VK.ESCAPE,
  'esc': VK.ESCAPE,
  'space': VK.SPACE,
  ' ': VK.SPACE,
  'pageup': VK.PRIOR,
  'pagedown': VK.NEXT,
  'end': VK.END,
  'home': VK.HOME,
  'left': VK.LEFT,
  'up': VK.UP,
  'right': VK.RIGHT,
  'down': VK.DOWN,
  'insert': VK.INSERT,
  'delete': VK.DELETE,
  '0': VK.KEY_0, '1': VK.KEY_1, '2': VK.KEY_2, '3': VK.KEY_3, '4': VK.KEY_4,
  '5': VK.KEY_5, '6': VK.KEY_6, '7': VK.KEY_7, '8': VK.KEY_8, '9': VK.KEY_9,
  'a': VK.KEY_A, 'b': VK.KEY_B, 'c': VK.KEY_C, 'd': VK.KEY_D, 'e': VK.KEY_E,
  'f': VK.KEY_F, 'g': VK.KEY_G, 'h': VK.KEY_H, 'i': VK.KEY_I, 'j': VK.KEY_J,
  'k': VK.KEY_K, 'l': VK.KEY_L, 'm': VK.KEY_M, 'n': VK.KEY_N, 'o': VK.KEY_O,
  'p': VK.KEY_P, 'q': VK.KEY_Q, 'r': VK.KEY_R, 's': VK.KEY_S, 't': VK.KEY_T,
  'u': VK.KEY_U, 'v': VK.KEY_V, 'w': VK.KEY_W, 'x': VK.KEY_X, 'y': VK.KEY_Y,
  'z': VK.KEY_Z,
  'f1': VK.F1, 'f2': VK.F2, 'f3': VK.F3, 'f4': VK.F4, 'f5': VK.F5,
  'f6': VK.F6, 'f7': VK.F7, 'f8': VK.F8, 'f9': VK.F9, 'f10': VK.F10,
  'f11': VK.F11, 'f12': VK.F12,
  'numpad0': VK.NUMPAD0, 'numpad1': VK.NUMPAD1, 'numpad2': VK.NUMPAD2,
  'numpad3': VK.NUMPAD3, 'numpad4': VK.NUMPAD4, 'numpad5': VK.NUMPAD5,
  'numpad6': VK.NUMPAD6, 'numpad7': VK.NUMPAD7, 'numpad8': VK.NUMPAD8,
  'numpad9': VK.NUMPAD9,
  'lwin': VK.LWIN, 'rwin': VK.RWIN,
  'lshift': VK.LSHIFT, 'rshift': VK.RSHIFT,
  'lctrl': VK.LCONTROL, 'rctrl': VK.RCONTROL,
  'lalt': VK.LMENU, 'ralt': VK.RMENU,
  'printscreen': VK.SNAPSHOT,
  'scrolllock': VK.SCROLL,
  'numlock': VK.NUMLOCK,
  'apps': VK.APPS,
  'oem_plus': 0xBB,      // = key
  'oem_comma': 0xBC,     // , key
  'oem_minus': 0xBD,     // - key
  'oem_period': 0xBE,    // . key
  'oem_1': 0xBA,         // ;: key
  'oem_2': 0xBF,         // /? key
  'oem_3': 0xC0,         // `~ key
  'oem_4': 0xDB,         // [{ key
  'oem_5': 0xDC,         // \| key
  'oem_6': 0xDD,         // ]} key
  'oem_7': 0xDE,         // '" key
  'oem_102': 0xE2,       // <> or \| on some keyboards
}

// ── Constants ──────────────────────────────────────────────────────────────

/** sizeof(INPUT) on x64 Windows. Type(4) + padding(4) + MOUSEINPUT(28) + padding(4) = 40 */
const SIZEOF_INPUT = 40
/** Offset of the union data within the INPUT structure */
const UNION_OFFSET = 8

// ── State ──────────────────────────────────────────────────────────────────

let sendInputFn: ((cInputs: number, pInputs: Buffer, cbSize: number) => number) | null = null
let loadAttempted = false
let loadError: string | null = null

// ── DLL Loading ────────────────────────────────────────────────────────────

function ensureLoaded(): boolean {
  if (loadAttempted) return sendInputFn !== null
  loadAttempted = true

  if (process.platform !== 'win32') {
    loadError = `Platform not supported: ${process.platform} (SendInput is Win32 only)`
    logger.warn(`[Win32Input] ${loadError}`, 'native')
    return false
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const koffi = require('koffi')
    const user32 = koffi.load('user32.dll')

    // SendInput signature:
    //   UINT SendInput(UINT cInputs, LPINPUT pInputs, int cbSize)
    // We pass the INPUT array as a raw buffer (void*) to avoid complex
    // struct/union definitions with koffi's alignment rules.
    sendInputFn = user32.func('uint32 SendInput(uint32 cInputs, void* pInputs, int cbSize)')

    logger.info('[Win32Input] user32!SendInput loaded successfully', 'native')
    return true
  } catch (err: any) {
    sendInputFn = null
    loadError = `Failed to load user32!SendInput: ${err.message}`
    logger.error(`[Win32Input] ${loadError}`, 'native')
    return false
  }
}

// ── Buffer Construction ────────────────────────────────────────────────────

/**
 * Build a raw INPUT buffer for a keyboard event.
 * sizeof(INPUT) = 40 bytes, union data at offset 8.
 * KEYBDINPUT layout: wVk(2) + wScan(2) + dwFlags(4) + time(4) + dwExtraInfo(8) = 20
 */
function buildKeyboardInput(vk: number, flags: number): Buffer {
  const buf = Buffer.alloc(SIZEOF_INPUT)
  // type = INPUT_KEYBOARD (1)
  buf.writeUInt32LE(INPUT_KEYBOARD, 0)
  // padding bytes 4-7 stay 0
  // KEYBDINPUT at offset 8
  buf.writeUInt16LE(vk, UNION_OFFSET)          // wVk
  buf.writeUInt16LE(0, UNION_OFFSET + 2)        // wScan (0 = use VK)
  buf.writeUInt32LE(flags, UNION_OFFSET + 4)     // dwFlags
  buf.writeUInt32LE(0, UNION_OFFSET + 8)         // time (0 = default)
  buf.writeUInt32LE(0, UNION_OFFSET + 12)        // dwExtraInfo high (ULONG_PTR)
  buf.writeUInt32LE(0, UNION_OFFSET + 16)        // dwExtraInfo low
  return buf
}

/**
 * Build a raw INPUT buffer for a mouse event.
 * MOUSEINPUT layout: dx(4) + dy(4) + mouseData(4) + dwFlags(4) + time(4) + dwExtraInfo(8) = 28
 */
function buildMouseInput(dx: number, dy: number, mouseData: number, flags: number): Buffer {
  const buf = Buffer.alloc(SIZEOF_INPUT)
  // type = INPUT_MOUSE (0)
  buf.writeUInt32LE(INPUT_MOUSE, 0)
  // MOUSEINPUT at offset 8
  buf.writeInt32LE(dx, UNION_OFFSET)             // dx
  buf.writeInt32LE(dy, UNION_OFFSET + 4)          // dy
  buf.writeUInt32LE(mouseData, UNION_OFFSET + 8)  // mouseData
  buf.writeUInt32LE(flags, UNION_OFFSET + 12)     // dwFlags
  buf.writeUInt32LE(0, UNION_OFFSET + 16)         // time
  buf.writeUInt32LE(0, UNION_OFFSET + 20)         // dwExtraInfo low
  buf.writeUInt32LE(0, UNION_OFFSET + 24)         // dwExtraInfo high
  return buf
}

// ── Send Helpers ───────────────────────────────────────────────────────────

/**
 * Inject one or more INPUT events.
 * @param inputs - Array of INPUT buffers to send
 * @returns Number of events successfully injected, or -1 on error
 */
function sendInputs(inputs: Buffer[]): number {
  if (!ensureLoaded() || !sendInputFn) return -1

  try {
    // Concatenate all INPUT buffers into one contiguous block
    const totalSize = inputs.length * SIZEOF_INPUT
    const block = Buffer.alloc(totalSize)
    for (let i = 0; i < inputs.length; i++) {
      inputs[i].copy(block, i * SIZEOF_INPUT)
    }
    return sendInputFn(inputs.length, block, SIZEOF_INPUT)
  } catch (err: any) {
    logger.error(`[Win32Input] sendInputs failed: ${err.message}`, 'native')
    return -1
  }
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Inject a keyboard key press (down + up).
 * @param vk - Virtual key code (e.g., VK.KEY_A, VK.RETURN)
 */
export function pressKey(vk: number): void {
  sendInputs([
    buildKeyboardInput(vk, KEYEVENTF_KEYDOWN),
    buildKeyboardInput(vk, KEYEVENTF_KEYUP),
  ])
}

/**
 * Inject a keyboard key down event (without releasing).
 * @param vk - Virtual key code
 */
export function keyDown(vk: number): void {
  sendInputs([buildKeyboardInput(vk, KEYEVENTF_KEYDOWN)])
}

/**
 * Inject a keyboard key up event (release).
 * @param vk - Virtual key code
 */
export function keyUp(vk: number): void {
  sendInputs([buildKeyboardInput(vk, KEYEVENTF_KEYUP)])
}

/**
 * Inject a keyboard key press by name.
 * @param keyName - Key name (e.g., 'a', 'enter', 'space', 'f1')
 * @param pressed - true to press down, false to release
 */
export function injectKeyboard(keyName: string, pressed: boolean): boolean {
  if (process.platform !== 'win32') return false

  const lower = keyName.toLowerCase()
  const vk = KEY_NAME_MAP[lower]
  if (vk === undefined) {
    logger.warn(`[Win32Input] Unknown key name: ${keyName}`, 'native')
    return false
  }

  if (pressed) {
    keyDown(vk)
  } else {
    keyUp(vk)
  }
  return true
}

/**
 * Inject a mouse button event.
 * @param button - 'left', 'right', 'middle', 'x1', 'x2'
 * @param pressed - true to press down, false to release
 */
export function injectMouseButton(button: string, pressed: boolean): boolean {
  if (process.platform !== 'win32') return false

  const flags: Record<string, { down: number; up: number }> = {
    left: { down: MOUSEEVENTF_LEFTDOWN, up: MOUSEEVENTF_LEFTUP },
    right: { down: MOUSEEVENTF_RIGHTDOWN, up: MOUSEEVENTF_RIGHTUP },
    middle: { down: MOUSEEVENTF_MIDDLEDOWN, up: MOUSEEVENTF_MIDDLEUP },
    x1: { down: MOUSEEVENTF_XDOWN, up: MOUSEEVENTF_XUP },
    x2: { down: MOUSEEVENTF_XDOWN, up: MOUSEEVENTF_XUP },
  }

  const btn = flags[button.toLowerCase()]
  if (!btn) return false

  const flag = pressed ? btn.down : btn.up
  // For X buttons, set mouseData to 1 (X1) or 2 (X2)
  const mouseData = button.toLowerCase() === 'x2' ? 2 : (button.toLowerCase() === 'x1' ? 1 : 0)
  sendInputs([buildMouseInput(0, 0, mouseData, flag)])
  return true
}

/**
 * Inject relative mouse movement.
 * @param dx - Relative X movement in pixels
 * @param dy - Relative Y movement in pixels
 */
export function injectMouseMove(dx: number, dy: number): boolean {
  if (process.platform !== 'win32') return false
  sendInputs([buildMouseInput(dx, dy, 0, MOUSEEVENTF_MOVE)])
  return true
}

/**
 * Inject mouse wheel scroll.
 * @param delta - Positive = scroll up, negative = scroll down
 *                120 = one notch up, -120 = one notch down
 */
export function injectMouseWheel(delta: number): boolean {
  if (process.platform !== 'win32') return false
  sendInputs([buildMouseInput(0, 0, delta, MOUSEEVENTF_WHEEL)])
  return true
}

/**
 * Inject a mouse absolute position event.
 * When MOUSEEVENTF_ABSOLUTE is set, Win32 interprets dx/dy as coordinates
 * on a virtual desktop that is 65535×65535 units.
 *
 * @param x - X coordinate (fractional 0.0-1.0, or raw 0-65535 normalized)
 * @param y - Y coordinate (fractional 0.0-1.0, or raw 0-65535 normalized)
 * @param screenWidth - Optional screen width in pixels (used if x < 1.0)
 * @param screenHeight - Optional screen height in pixels (used if y < 1.0)
 */
export function injectMouseAbsolute(
  x: number,
  y: number,
  screenWidth?: number,
  screenHeight?: number,
): boolean {
  if (process.platform !== 'win32') return false

  let nx: number
  let ny: number

  if (screenWidth && screenHeight && x >= 0 && x <= 1 && y >= 0 && y <= 1) {
    // Fractional coords (0.0-1.0) → normalize to 0-65535
    nx = Math.round(x * 65535)
    ny = Math.round(y * 65535)
  } else {
    // Already normalized 0-65535
    nx = Math.round(x)
    ny = Math.round(y)
  }

  // Clamp to valid range
  nx = Math.max(0, Math.min(65535, nx))
  ny = Math.max(0, Math.min(65535, ny))

  sendInputs([buildMouseInput(nx, ny, 0, MOUSEEVENTF_MOVE | MOUSEEVENTF_ABSOLUTE)])
  return true
}

/**
 * Inject a gamepad button event (mapped to keyboard keys).
 * Uses the GAMEPAD_VK mapping table defined above.
 * @param button - Gamepad button name ('a', 'b', 'x', 'y', 'dpad_up', etc.)
 * @param pressed - true to press, false to release
 */
export function injectGamepadButton(button: string, pressed: boolean): boolean {
  if (process.platform !== 'win32') return false

  const lower = button.toLowerCase()
  const vk = GAMEPAD_BUTTON_MAP[lower]
  if (vk === undefined) {
    logger.warn(`[Win32Input] Unknown gamepad button: ${button}`, 'native')
    return false
  }

  if (pressed) {
    keyDown(vk)
  } else {
    keyUp(vk)
  }
  return true
}

/**
 * Inject a touch event simulated as mouse.
 * @param x - X position (fractional 0.0-1.0 of screen width)
 * @param y - Y position (fractional 0.0-1.0 of screen height)
 * @param action - 'down', 'move', 'up'
 */
export function injectTouch(x: number, y: number, action: 'down' | 'move' | 'up'): boolean {
  if (process.platform !== 'win32') return false

  // Normalize fractional coordinates to absolute screen coordinates
  // MOUSEEVENTF_ABSOLUTE uses 0-65535 normalized coords
  const absX = Math.round(x * 65535)
  const absY = Math.round(y * 65535)

  switch (action) {
    case 'down': {
      // Move to position + left down
      sendInputs([
        buildMouseInput(absX, absY, 0, MOUSEEVENTF_MOVE | MOUSEEVENTF_ABSOLUTE),
        buildMouseInput(0, 0, 0, MOUSEEVENTF_LEFTDOWN),
      ])
      return true
    }
    case 'move': {
      sendInputs([buildMouseInput(absX, absY, 0, MOUSEEVENTF_MOVE | MOUSEEVENTF_ABSOLUTE)])
      return true
    }
    case 'up': {
      // Left up only (don't re-move, stay at current position)
      sendInputs([buildMouseInput(0, 0, 0, MOUSEEVENTF_LEFTUP)])
      return true
    }
  }
}

/**
 * Inject a string of text by pressing each character.
 * Only supports alphanumeric and common keys.
 * @param text - Text to type
 */
export function injectText(text: string): void {
  for (const char of text) {
    const lower = char.toLowerCase()
    // Letter keys
    if (/^[a-z]$/.test(lower)) {
      if (char !== lower) {
        // Uppercase: shift + key
        keyDown(VK.SHIFT)
        pressKey(KEY_NAME_MAP[lower])
        keyUp(VK.SHIFT)
      } else {
        pressKey(KEY_NAME_MAP[char])
      }
    }
    // Number keys
    else if (/^[0-9]$/.test(char)) {
      pressKey(KEY_NAME_MAP[char])
    }
    // Space
    else if (char === ' ') {
      pressKey(VK.SPACE)
    }
    // Enter
    else if (char === '\n') {
      pressKey(VK.RETURN)
    }
    // Tab
    else if (char === '\t') {
      pressKey(VK.TAB)
    }
  }
}

/**
 * Check if the Win32 input injector is available (Windows only).
 */
export function isAvailable(): boolean {
  return ensureLoaded()
}

/**
 * Get the last error message if the injector failed to load.
 */
export function getError(): string | null {
  return loadError
}
