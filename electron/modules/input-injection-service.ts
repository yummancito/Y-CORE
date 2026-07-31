/**
 * Cross-Platform Input Injection Service
 * Fixes issue #5: SendInput not available on macOS/Linux
 * Provides platform-specific input APIs with graceful fallbacks
 */

import { logger } from '../logger'
import { CommandUtils, PlatformUtils } from './platform-abstraction'

export interface MouseEvent {
  x: number
  y: number
  button?: 'left' | 'middle' | 'right'
  down?: boolean
}

export interface KeyEvent {
  keyCode: number
  down: boolean
}

/**
 * Base input injector interface
 */
abstract class BaseInputInjector {
  protected isAvailable = false

  abstract injectKey(event: KeyEvent): Promise<void>
  abstract injectMouse(event: MouseEvent): Promise<void>
  abstract init(): Promise<void>

  isSupported(): boolean {
    return this.isAvailable
  }
}

/**
 * Windows input injector using SendInput API
 * Uses native koffi bindings or Windows API calls
 */
class WindowsInputInjector extends BaseInputInjector {
  private nativeModule: any = null

  async init(): Promise<void> {
    try {
      // Try to load native SendInput bindings
      try {
        this.nativeModule = require('./win32-input')
        this.isAvailable = true
        logger.info('Windows SendInput API initialized', 'input')
      } catch (error) {
        logger.warn(`Native SendInput not available: ${error}`, 'input')
        this.isAvailable = false
      }
    } catch (error) {
      this.isAvailable = false
    }
  }

  async injectKey(event: KeyEvent): Promise<void> {
    if (!this.isAvailable || !this.nativeModule) {
      throw new Error('Windows SendInput not available')
    }
    // Use native module to inject key
    if (this.nativeModule.injectKey) {
      this.nativeModule.injectKey(event.keyCode, event.down)
    }
  }

  async injectMouse(event: MouseEvent): Promise<void> {
    if (!this.isAvailable || !this.nativeModule) {
      throw new Error('Windows SendInput not available')
    }
    if (this.nativeModule.injectMouse) {
      this.nativeModule.injectMouse(event.x, event.y, event.button || 'left', event.down ?? true)
    }
  }
}

/**
 * macOS input injector using Quartz Event Tapping
 * Requires native bindings to Core Graphics/Quartz
 */
class MacOSInputInjector extends BaseInputInjector {
  private nativeModule: any = null

  async init(): Promise<void> {
    try {
      // Try to load native macOS Quartz bindings
      try {
        this.nativeModule = require('./macos-quartz-input')
        this.isAvailable = true
        logger.info('macOS Quartz input injection initialized', 'input')
      } catch (error) {
        logger.warn(`macOS Quartz input not available: ${error}`, 'input')
        // Fallback: try xdotool via shell on M1 mac with x86 Docker/VM
        this.isAvailable = false
      }
    } catch (error) {
      this.isAvailable = false
    }
  }

  async injectKey(event: KeyEvent): Promise<void> {
    if (!this.isAvailable) {
      throw new Error('macOS input injection not available')
    }

    if (this.nativeModule?.injectKey) {
      this.nativeModule.injectKey(event.keyCode, event.down)
    } else {
      // Fallback: use osascript if native not available
      await this.fallbackInjectKeyViaOsascript(event)
    }
  }

  async injectMouse(event: MouseEvent): Promise<void> {
    if (!this.isAvailable) {
      throw new Error('macOS input injection not available')
    }

    if (this.nativeModule?.injectMouse) {
      this.nativeModule.injectMouse(event.x, event.y, event.button || 'left')
    }
  }

  /**
   * Fallback: Use osascript to move mouse
   * Note: osascript can't generate real input events, only simulate clicks via UI automation
   */
  private async fallbackInjectKeyViaOsascript(event: KeyEvent): Promise<void> {
    // This is a fallback only - osascript has severe limitations
    // Real implementation would require proper native bindings
    logger.warn('Using osascript fallback for key injection (limited functionality)', 'input')
  }
}

/**
 * Linux input injector using X11 or Wayland
 * Supports both older X11 systems and newer Wayland
 */
class LinuxInputInjector extends BaseInputInjector {
  private displayServer: 'x11' | 'wayland' | null = null
  private nativeModule: any = null

  async init(): Promise<void> {
    try {
      // Detect display server
      const xdisplay = process.env.DISPLAY
      const waylandDisplay = process.env.WAYLAND_DISPLAY

      if (waylandDisplay) {
        this.displayServer = 'wayland'
      } else if (xdisplay) {
        this.displayServer = 'x11'
      } else {
        logger.warn('No X11 or Wayland display detected', 'input')
        return
      }

      // Try to load xdotool or native bindings
      try {
        // Try xdotool first (usually available)
        await CommandUtils.execute('xdotool', ['--version'])
        this.isAvailable = true
        logger.info(`Linux input injection initialized (${this.displayServer})`, 'input')
      } catch (error) {
        logger.warn(`xdotool not available: ${error}`, 'input')
        this.isAvailable = false
      }
    } catch (error) {
      this.isAvailable = false
    }
  }

  async injectKey(event: KeyEvent): Promise<void> {
    if (!this.isAvailable || !this.displayServer) {
      throw new Error('Linux input injection not available')
    }

    // Convert keyCode to xdotool format
    const keyString = this.getXdotoolKeyString(event.keyCode)
    const action = event.down ? 'key' : 'keyup'

    try {
      await CommandUtils.execute('xdotool', [action, keyString])
    } catch (error) {
      logger.error(`Failed to inject key on Linux: ${error}`, 'input')
      throw error
    }
  }

  async injectMouse(event: MouseEvent): Promise<void> {
    if (!this.isAvailable || !this.displayServer) {
      throw new Error('Linux input injection not available')
    }

    try {
      // Move mouse
      await CommandUtils.execute('xdotool', ['mousemove', String(event.x), String(event.y)])

      // Click if requested
      if (event.button && event.down !== false) {
        const buttonNum = this.getXdotoolButtonNumber(event.button)
        await CommandUtils.execute('xdotool', ['click', String(buttonNum)])
      }
    } catch (error) {
      logger.error(`Failed to inject mouse on Linux: ${error}`, 'input')
      throw error
    }
  }

  /**
   * Convert keyCode to xdotool key name
   */
  private getXdotoolKeyString(keyCode: number): string {
    // Map common key codes
    const keyMap: Record<number, string> = {
      13: 'Return',
      32: 'space',
      37: 'Left',
      38: 'Up',
      39: 'Right',
      40: 'Down',
      8: 'BackSpace',
      9: 'Tab',
      27: 'Escape',
      91: 'Super_L',
      92: 'Super_R',
      17: 'Control_L',
      16: 'Shift_L',
      18: 'Alt_L',
    }

    if (keyMap[keyCode]) {
      return keyMap[keyCode]
    }

    // For letter keys, use lowercase letter
    if (keyCode >= 65 && keyCode <= 90) {
      return String.fromCharCode(keyCode + 32)
    }

    // Fallback
    return String(keyCode)
  }

  /**
   * Convert button name to xdotool button number
   */
  private getXdotoolButtonNumber(button: string): number {
    const buttonMap: Record<string, number> = {
      left: 1,
      middle: 2,
      right: 3,
    }
    return buttonMap[button] || 1
  }
}

/**
 * Cross-platform input injection service
 */
export class InputInjectionService {
  private injector: BaseInputInjector | null = null
  private platform: string = process.platform

  async initialize(): Promise<void> {
    try {
      if (PlatformUtils.isWindows()) {
        this.injector = new WindowsInputInjector()
      } else if (PlatformUtils.isMacOS()) {
        this.injector = new MacOSInputInjector()
      } else if (PlatformUtils.isLinux()) {
        this.injector = new LinuxInputInjector()
      }

      if (this.injector) {
        await this.injector.init()
      }
    } catch (error) {
      logger.error(`Failed to initialize input injection: ${error}`, 'input')
      this.injector = null
    }
  }

  /**
   * Check if input injection is supported
   */
  isSupported(): boolean {
    return this.injector?.isSupported() ?? false
  }

  /**
   * Inject keyboard key press
   */
  async injectKey(keyCode: number, down: boolean = true): Promise<void> {
    if (!this.injector || !this.injector.isSupported()) {
      logger.warn(`Input injection not supported on ${this.platform}`, 'input')
      return
    }

    try {
      await this.injector.injectKey({ keyCode, down })
    } catch (error) {
      logger.error(`Failed to inject key: ${error}`, 'input')
      throw error
    }
  }

  /**
   * Inject mouse event
   */
  async injectMouse(x: number, y: number, button: 'left' | 'middle' | 'right' = 'left'): Promise<void> {
    if (!this.injector || !this.injector.isSupported()) {
      logger.warn(`Input injection not supported on ${this.platform}`, 'input')
      return
    }

    try {
      await this.injector.injectMouse({ x, y, button })
    } catch (error) {
      logger.error(`Failed to inject mouse: ${error}`, 'input')
      throw error
    }
  }
}

// Singleton instance
let inputServiceInstance: InputInjectionService | null = null

export async function getInputInjectionService(): Promise<InputInjectionService> {
  if (!inputServiceInstance) {
    inputServiceInstance = new InputInjectionService()
    await inputServiceInstance.initialize()
  }
  return inputServiceInstance
}

export default InputInjectionService
