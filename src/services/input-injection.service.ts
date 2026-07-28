// ============================================================================
// src/services/input-injection.service.ts
// ----------------------------------------------------------------------------
// Frontend InputInjectionService — wraps Gateway calls for remote input
// injection from mobile/Android clients.
// ============================================================================

import { BaseService } from './gateway'

export interface InputCommand {
  type: 'keyboard' | 'mouse' | 'gamepad' | 'touch' | 'text'
  data: Record<string, unknown>
}

class InputInjectionService extends BaseService {
  protected serviceName = 'inputInjection' as const

  /**
   * Check if input injection is available (Windows only).
   */
  async isAvailable(): Promise<boolean> {
    return this.call('isAvailable')
  }

  /**
   * Get the load error if injection is unavailable.
   */
  async getError(): Promise<string | null> {
    return this.call('getError')
  }

  /**
   * Inject a keyboard key press/release.
   */
  async injectKeyboard(key: string, pressed: boolean): Promise<boolean> {
    return this.call('injectKeyboard', key, pressed)
  }

  /**
   * Inject a mouse event.
   */
  async injectMouse(
    action: 'move' | 'button' | 'wheel' | 'absolute',
    opts: { dx?: number; dy?: number; button?: string; pressed?: boolean; delta?: number },
  ): Promise<boolean> {
    return this.call('injectMouse', action, opts)
  }

  /**
   * Inject a gamepad button press/release.
   */
  async injectGamepadButton(button: string, pressed: boolean): Promise<boolean> {
    return this.call('injectGamepadButton', button, pressed)
  }

  /**
   * Inject a touch event (simulated as mouse).
   */
  async injectTouch(x: number, y: number, action: 'down' | 'move' | 'up'): Promise<boolean> {
    return this.call('injectTouch', x, y, action)
  }

  /**
   * Type a string of text.
   */
  async injectText(text: string): Promise<void> {
    return this.call('injectText', text)
  }

  /**
   * Process a remote input command.
   */
  async processCommand(command: InputCommand): Promise<boolean> {
    return this.call('processCommand', command)
  }
}

export const inputInjectionService = new InputInjectionService()
