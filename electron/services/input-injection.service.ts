// ============================================================================
// electron/services/input-injection.service.ts
// ----------------------------------------------------------------------------
// InputInjectionService — receives remote input commands from the cloud
// signaling WebSocket and injects them into the Windows input system via
// Win32 SendInput API.
//
// ARCHITECTURE:
//   Cloud WebSocket ──(input message)──→ cloud-signaling.service.ts
//                                           ↓
//                                     InputInjectionService
//                                           ↓
//                                     win32-input.ts (koffi → user32.dll)
//                                           ↓
//                                     Windows SendInput → Game
//
// Supported input types:
//   - keyboard: key name + pressed state
//   - mouse: move (dx,dy), button (name + pressed), wheel (delta)
//   - gamepad: button name + pressed state (mapped to keyboard VKs)
//   - touch: fractional (x,y) + action (down/move/up)
// ============================================================================

import { logger } from '../logger'
import * as win32Input from '../modules/win32-input'

// ── Types ──────────────────────────────────────────────────────────────────

export interface InputCommand {
  /** Type of input event */
  type: 'keyboard' | 'mouse' | 'gamepad' | 'touch' | 'text'
  /** Timestamp of the event (from source device) */
  timestamp?: number
  /** Source device identifier */
  sourceDeviceId?: string
  /** Session identifier */
  sessionId?: string
  /** Payload (varies by type) */
  data: KeyboardData | MouseData | GamepadData | TouchData | TextData
}

export interface KeyboardData {
  /** Key name (e.g., 'a', 'enter', 'space', 'f1', 'shift') */
  key: string
  /** true = pressed, false = released */
  pressed: boolean
}

export interface MouseData {
  /** Type of mouse action */
  action: 'move' | 'button' | 'wheel' | 'absolute'
  /** Relative X movement or absolute X */
  dx?: number
  /** Relative Y movement or absolute Y */
  dy?: number
  /** Button name for button actions: 'left', 'right', 'middle' */
  button?: string
  /** Press state for button actions */
  pressed?: boolean
  /** Wheel delta (positive=up, negative=down) */
  delta?: number
}

export interface GamepadData {
  /** Gamepad button name ('a', 'b', 'x', 'y', 'dpad_up', etc.) */
  button: string
  /** true = pressed, false = released */
  pressed: boolean
  /** Analog value (0.0-1.0) for triggers/thumbsticks */
  value?: number
}

export interface TouchData {
  /** X position (fractional 0.0-1.0 of screen width) */
  x: number
  /** Y position (fractional 0.0-1.0 of screen height) */
  y: number
  /** Touch action */
  action: 'down' | 'move' | 'up'
  /** Touch identifier for multitouch */
  id?: number
}

export interface TextData {
  /** Text to type */
  text: string
}

// ── Service Object ─────────────────────────────────────────────────────────

export const inputInjectionService = {
  /**
   * Check if input injection is available (Windows + user32.dll).
   */
  isAvailable(): boolean {
    return win32Input.isAvailable()
  },

  /**
   * Get the load error if injection is unavailable.
   */
  getError(): string | null {
    return win32Input.getError()
  },

  /**
   * Inject a keyboard key press.
   * @param key - Key name ('a', 'enter', 'space', 'f1', etc.)
   * @param pressed - true to press down, false to release
   */
  injectKeyboard(key: string, pressed: boolean): boolean {
    if (!win32Input.isAvailable()) {
      logger.warn(`[InputInjection] injectKeyboard: Win32Input not available`, 'remote-play')
      return false
    }
    return win32Input.injectKeyboard(key, pressed)
  },

  /**
   * Inject a mouse event.
   * @param action - Mouse action type ('move', 'button', 'wheel', 'absolute')
   * @param opts - Action parameters
   */
  injectMouse(
    action: 'move' | 'button' | 'wheel' | 'absolute',
    opts: { dx?: number; dy?: number; button?: string; pressed?: boolean; delta?: number },
  ): boolean {
    if (!win32Input.isAvailable()) return false

    switch (action) {
      case 'move':
        return win32Input.injectMouseMove(opts.dx ?? 0, opts.dy ?? 0)
      case 'button':
        return win32Input.injectMouseButton(opts.button ?? 'left', opts.pressed ?? false)
      case 'wheel':
        return win32Input.injectMouseWheel(opts.delta ?? 0)
      case 'absolute':
        return win32Input.injectMouseAbsolute(opts.dx ?? 0, opts.dy ?? 0)
      default:
        logger.warn(`[InputInjection] Unknown mouse action: ${action}`, 'remote-play')
        return false
    }
  },

  /**
   * Inject a gamepad button press (mapped to keyboard keys).
   * @param button - Gamepad button name ('a', 'b', 'x', 'y', 'dpad_up', etc.)
   * @param pressed - true to press, false to release
   */
  injectGamepadButton(button: string, pressed: boolean): boolean {
    if (!win32Input.isAvailable()) return false
    return win32Input.injectGamepadButton(button, pressed)
  },

  /**
   * Inject a touch event simulated as mouse.
   * @param x - X position (fractional 0.0-1.0)
   * @param y - Y position (fractional 0.0-1.0)
   * @param action - 'down', 'move', 'up'
   */
  injectTouch(x: number, y: number, action: 'down' | 'move' | 'up'): boolean {
    if (!win32Input.isAvailable()) return false
    return win32Input.injectTouch(x, y, action)
  },

  /**
   * Type a string of text.
   * @param text - Text to type
   */
  injectText(text: string): void {
    if (!win32Input.isAvailable()) return
    win32Input.injectText(text)
  },

  /**
   * Process an InputCommand from a remote device.
   * This is the main entry point for incoming input from cloud signaling.
   * @param command - The input command received via WebSocket
   */
  processCommand(command: InputCommand): boolean {
    try {
      switch (command.type) {
        case 'keyboard': {
          const d = command.data as KeyboardData
          return this.injectKeyboard(d.key, d.pressed)
        }
        case 'mouse': {
          const d = command.data as MouseData
          return this.injectMouse(d.action, d)
        }
        case 'gamepad': {
          const d = command.data as GamepadData
          return this.injectGamepadButton(d.button, d.pressed)
        }
        case 'touch': {
          const d = command.data as TouchData
          return this.injectTouch(d.x, d.y, d.action)
        }
        case 'text': {
          const d = command.data as TextData
          this.injectText(d.text)
          return true
        }
        default:
          logger.warn(`[InputInjection] Unknown command type: ${(command as InputCommand).type}`, 'remote-play')
          return false
      }
    } catch (err: any) {
      logger.error(`[InputInjection] Failed to process command: ${err.message}`, 'remote-play')
      return false
    }
  },

  /**
   * Inject a key-down (press, hold).
   */
  injectKeyDown(vk: number): void {
    if (!win32Input.isAvailable()) return
    win32Input.keyDown(vk)
  },

  /**
   * Inject a key-up (release).
   */
  injectKeyUp(vk: number): void {
    if (!win32Input.isAvailable()) return
    win32Input.keyUp(vk)
  },

  /**
   * Inject a single key press (down + up).
   */
  injectPressKey(vk: number): void {
    if (!win32Input.isAvailable()) return
    win32Input.pressKey(vk)
  },
}
