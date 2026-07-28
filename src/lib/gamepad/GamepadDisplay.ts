// ============================================================================
// src/lib/gamepad/GamepadDisplay.ts
// ----------------------------------------------------------------------------
// Renderizador de estado de gamepad virtual a elementos del DOM.
// Toma el estado de un TouchGamepad y actualiza clases CSS y transforms
// en los elementos HTML/SVG configurados.
//
// Basado en los patrones de virtual-gamepad-lib (GamepadDisplay.ts) pero como
// código propio: config-driven, zero dependencias, agnóstico al framework.
// ============================================================================

import {
  GamepadButtonType,
  GamepadDirection,
  type ButtonMapType,
} from './GamepadButtonMap'
import type { TouchGamepadState } from './TouchGamepad'

// ── Tipos de Display ───────────────────────────────────────────────────────

export interface DisplayOnOffButton {
  type: GamepadButtonType.OnOff
  /** Elemento que recibe la clase "touched" / "pressed" */
  highlight: HTMLElement | SVGElement
  /** Dato extra opcional (para uso del consumidor) */
  extraData?: any
}

export interface DisplayVariableButton {
  type: GamepadButtonType.Variable
  /** Elemento que recibe las clases táctiles */
  highlight?: HTMLElement | SVGElement
  /** Elemento que se mueve para representar la presión */
  buttonElement: HTMLElement | SVGElement
  /** Distancia en píxeles del movimiento a valor=1 */
  movementRange: number
  /** Dirección del movimiento */
  direction: GamepadDirection
  /** Elemento de dirección highlight */
  directionHighlight?: HTMLElement | SVGElement
  extraData?: any
}

export type DisplayButton = DisplayOnOffButton | DisplayVariableButton

export interface DisplayJoystick {
  /** Elemento que se mueve con el joystick */
  stickElement: HTMLElement | SVGElement
  /** Rango de movimiento en píxeles por cada unidad de eje */
  movementRange: number
  xAxisIndex?: number
  yAxisIndex?: number
  extraData?: any
}

export interface DisplayConfig {
  /** Índice del gamepad a trackear */
  gamepadIndex: number
  /** Config de botones por índice en Gamepad.buttons[] */
  buttons?: (DisplayButton | null | undefined)[]
  /** Config de joysticks por índice en Gamepad.axes[] */
  sticks?: DisplayJoystick[]
  /** Clase CSS para estado "touched" */
  touchedClass?: string
  /** Clase CSS para estado "pressed" */
  pressedClass?: string
  /** Clase CSS para dirección activa */
  directionClass?: string
}

// ── GamepadDisplay ─────────────────────────────────────────────────────────

/**
 * Renderizador de gamepad virtual.
 *
 * Toma un estado de TouchGamepadState y actualiza los elementos DOM
 * configurados (clases CSS + transforms) para reflejar el estado actual.
 * No dibuja nada por sí mismo — solo manipula el DOM existente.
 */
export class GamepadDisplay {
  private config: DisplayConfig
  private lastState: TouchGamepadState | null = null

  constructor(config: DisplayConfig) {
    this.config = {
      touchedClass: 'is-touched',
      pressedClass: 'is-pressed',
      directionClass: 'is-active',
      ...config,
    }
  }

  /** Actualiza el display con un nuevo estado de gamepad */
  update(state: TouchGamepadState): void {
    const prev = this.lastState
    this.lastState = state

    if (state.index !== this.config.gamepadIndex) return

    // Actualizar botones
    if (this.config.buttons) {
      for (let i = 0; i < this.config.buttons.length; i++) {
        const btnConfig = this.config.buttons[i]
        if (!btnConfig) continue

        const btnState = state.buttons[i]
        if (!btnState) continue

        const prevBtnState = prev?.buttons[i]

        if (btnConfig.type === GamepadButtonType.OnOff) {
          this.updateOnOffButton(btnConfig, btnState, prevBtnState)
        } else {
          this.updateVariableButton(btnConfig, btnState, prevBtnState)
        }
      }
    }

    // Actualizar joysticks
    if (this.config.sticks) {
      for (const stickConfig of this.config.sticks) {
        this.updateJoystick(stickConfig, state)
      }
    }
  }

  /** Resetea todos los elementos a su estado neutro */
  reset(): void {
    if (this.config.buttons) {
      for (const btnConfig of this.config.buttons) {
        if (!btnConfig) continue
        if (btnConfig.type === GamepadButtonType.OnOff) {
          const el = btnConfig.highlight
          el.classList.remove(this.config.touchedClass ?? '')
          el.classList.remove(this.config.pressedClass ?? '')
        } else {
          if (btnConfig.highlight) {
            btnConfig.highlight.classList.remove(this.config.touchedClass ?? '')
            btnConfig.highlight.classList.remove(this.config.pressedClass ?? '')
          }
          btnConfig.buttonElement.style.transform = ''
          if (btnConfig.directionHighlight) {
            btnConfig.directionHighlight.classList.remove(this.config.directionClass ?? '')
          }
        }
      }
    }
    if (this.config.sticks) {
      for (const stickConfig of this.config.sticks) {
        stickConfig.stickElement.style.transform = ''
      }
    }
    this.lastState = null
  }

  /** Limpia referencias internas */
  destroy(): void {
    this.reset()
    this.config.buttons = []
    this.config.sticks = []
  }

  // ── Internals ──────────────────────────────────────────────────────────

  private updateOnOffButton(
    config: DisplayOnOffButton,
    state: { pressed: boolean; touched: boolean },
    prev?: { pressed: boolean; touched: boolean },
  ): void {
    const el = config.highlight
    const tc = this.config.touchedClass
    const pc = this.config.pressedClass

    if (tc) {
      if (state.touched && (!prev || !prev.touched)) {
        el.classList.add(tc)
      } else if (!state.touched && prev?.touched) {
        el.classList.remove(tc)
      }
    }
    if (pc) {
      if (state.pressed && (!prev || !prev.pressed)) {
        el.classList.add(pc)
      } else if (!state.pressed && prev?.pressed) {
        el.classList.remove(pc)
      }
    }
  }

  private updateVariableButton(
    config: DisplayVariableButton,
    state: { pressed: boolean; value: number; touched: boolean },
    prev?: { pressed: boolean; value: number; touched: boolean },
  ): void {
    const tc = this.config.touchedClass
    const pc = this.config.pressedClass
    const dc = this.config.directionClass

    if (config.highlight && tc) {
      if (state.touched && (!prev || !prev.touched)) {
        config.highlight.classList.add(tc)
      } else if (!state.touched && prev?.touched) {
        config.highlight.classList.remove(tc)
      }
    }
    if (config.highlight && pc) {
      if (state.pressed && (!prev || !prev.pressed)) {
        config.highlight.classList.add(pc)
      } else if (!state.pressed && prev?.pressed) {
        config.highlight.classList.remove(pc)
      }
    }

    // Mover el botón según valor
    const isX = config.direction === GamepadDirection.Left || config.direction === GamepadDirection.Right
    const isPositive = config.direction === GamepadDirection.Right || config.direction === GamepadDirection.Down
    const offset = state.value * config.movementRange
    const sign = isPositive ? '' : '-'
    config.buttonElement.style.transform = `translate${isX ? 'X' : 'Y'}(${sign}${offset}px)`

    // Direction highlight
    if (config.directionHighlight && dc) {
      if (state.pressed && (!prev || !prev.pressed)) {
        config.directionHighlight.classList.add(dc)
      } else if (!state.pressed && prev?.pressed) {
        config.directionHighlight.classList.remove(dc)
      }
    }
  }

  private updateJoystick(
    config: DisplayJoystick,
    state: TouchGamepadState,
  ): void {
    const xValue = config.xAxisIndex !== undefined ? (state.axes[config.xAxisIndex] ?? 0) : 0
    const yValue = config.yAxisIndex !== undefined ? (state.axes[config.yAxisIndex] ?? 0) : 0

    if (xValue !== 0 || yValue !== 0 || this.lastState !== state) {
      config.stickElement.style.transform = `translate(${xValue * config.movementRange}px, ${yValue * config.movementRange}px)`
    }
  }
}
