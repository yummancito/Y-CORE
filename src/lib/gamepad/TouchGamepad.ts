// ============================================================================
// src/lib/gamepad/TouchGamepad.ts
// ----------------------------------------------------------------------------
// Motor táctil de gamepad virtual. Convierte eventos táctiles (touch/mouse)
// en estados de botones y ejes de gamepad emulado.
//
// Basado en los patrones arquitectónicos de virtual-gamepad-lib
// (GamepadEmulator.ts) pero implementado como código propio:
//   - Configuración declarativa de botones y joysticks
//   - Touch targets mapeados a índices de botón/axis
//   - Soporte para botones on/off y variables (gatillos analógicos)
//   - Joysticks con arrastre y retorno
//   - Zero dependencias
// ============================================================================

import {
  GamepadButtonType,
  GamepadDirection,
  type ButtonMapType,
} from './GamepadButtonMap'

// ── Helpers de tipo para event listeners ──────────────────────────────────

function on<T extends Event>(el: EventTarget, type: string, fn: (e: T) => void, opts?: AddEventListenerOptions): () => void {
  const handler = fn as EventListenerOrEventListenerObject
  el.addEventListener(type, handler, opts)
  return () => el.removeEventListener(type, handler, opts)
}

// ── Tipos de Configuración ─────────────────────────────────────────────────

export interface OnOffButtonTouchConfig {
  type: GamepadButtonType.OnOff
  /** Elemento que recibe los eventos táctiles */
  tapTarget: HTMLElement | SVGElement
  /** Índice del botón en Gamepad.buttons[] a controlar */
  buttonIndex: number | ButtonMapType
  /** Si se setean múltiples botones a la vez (ej: diagonales del D-Pad) */
  buttonIndexes?: (number | ButtonMapType)[]
  /** Bloquea el puntero mientras se presiona */
  lockTargetWhilePressed?: boolean
}

export interface VariableButtonTouchConfig {
  type: GamepadButtonType.Variable
  tapTarget: HTMLElement | SVGElement
  buttonIndex: number | ButtonMapType
  buttonIndexes?: (number | ButtonMapType)[]
  /** Distancia en píxeles para llegar a valor=1 (completamente presionado) */
  dragDistance: number
  lockTargetWhilePressed?: boolean
  /** Direcciones que activan este botón variable */
  directions: {
    [GamepadDirection.Up]?: boolean
    [GamepadDirection.Down]?: boolean
    [GamepadDirection.Left]?: boolean
    [GamepadDirection.Right]?: boolean
  }
}

export type ButtonTouchConfig = OnOffButtonTouchConfig | VariableButtonTouchConfig

export interface JoystickTouchConfig {
  tapTarget: HTMLElement | SVGElement
  /** Distancia máxima de arrastre en píxeles (valor 1 en el eje) */
  dragDistance: number
  /** Índice del eje X en Gamepad.axes[] */
  xAxisIndex?: number
  /** Índice del eje Y en Gamepad.axes[] */
  yAxisIndex?: number
  lockTargetWhilePressed?: boolean
  /** Restringe direcciones del joystick (si se omite, responde a todas) */
  directions?: {
    [GamepadDirection.Up]?: boolean
    [GamepadDirection.Down]?: boolean
    [GamepadDirection.Left]?: boolean
    [GamepadDirection.Right]?: boolean
  }
}

export interface TouchGamepadState {
  buttons: { pressed: boolean; value: number; touched: boolean }[]
  axes: number[]
  connected: boolean
  id: string
  index: number
}

export interface TouchGamepadConfig {
  /** Cantidad de botones (default: 18) */
  buttonCount?: number
  /** Cantidad de ejes (default: 4) */
  axisCount?: number
  /** Umbral para considerar un botón como presionado (0–1) */
  pressThreshold?: number
}

// ── TouchGamepad Engine ────────────────────────────────────────────────────

type PointerState = Map<number, {
  startX: number
  startY: number
  currentX: number
  currentY: number
  active: boolean
}>

/**
 * Motor de gamepad virtual táctil.
 *
 * Toma configuraciones de botones y joysticks (con sus elementos DOM como
 * touch targets) y mantiene un estado interno de gamepad (buttons + axes).
 * Dispara un callback cuando el estado cambia.
 *
 * Arquitectura (inspirada en virtual-gamepad-lib):
 *   TouchGamepad (input + state)  →  GamepadDisplay (output DOM)
 *
 * Zero dependencias externas.
 */
export class TouchGamepad {
  private state: TouchGamepadState
  private pointerState: PointerState = new Map()
  private buttonConfigs: ButtonTouchConfig[] = []
  private joystickConfigs: JoystickTouchConfig[] = []
  private cleanupFns: (() => void)[] = []
  private pressThreshold: number
  private onStateChange: ((state: TouchGamepadState) => void) | null = null
  private emitTimer: ReturnType<typeof requestAnimationFrame> | null = null
  private emitPending = false
  private alive = true

  constructor(config?: TouchGamepadConfig) {
    const btnCount = config?.buttonCount ?? 18
    const axisCount = config?.axisCount ?? 4
    this.pressThreshold = config?.pressThreshold ?? 0.1

    this.state = {
      buttons: Array.from({ length: btnCount }, () => ({
        pressed: false,
        value: 0,
        touched: false,
      })),
      axes: new Array(axisCount).fill(0),
      connected: true,
      id: 'TouchGamepad',
      index: 0,
    }
  }

  // ── Configuración ──────────────────────────────────────────────────────

  /** Registra un botón táctil */
  addButton(config: ButtonTouchConfig): void {
    this.buttonConfigs.push(config)
    this.setupButtonListeners(config)
  }

  /** Registra un joystick táctil */
  addJoystick(config: JoystickTouchConfig): void {
    this.joystickConfigs.push(config)
    this.setupJoystickListeners(config)
  }

  /** Escucha cambios de estado */
  onStateChangeCallback(cb: (state: TouchGamepadState) => void): void {
    this.onStateChange = cb
  }

  /** Obtiene el estado actual del gamepad (SHALLOW — referencia al estado interno) */
  getState(): TouchGamepadState {
    return this.state
  }

  /** Resetea todo el estado a valores neutros */
  reset(): void {
    for (let i = 0; i < this.state.buttons.length; i++) {
      this.state.buttons[i] = { pressed: false, value: 0, touched: false }
    }
    for (let i = 0; i < this.state.axes.length; i++) {
      this.state.axes[i] = 0
    }
    this.emitChange()
  }

  /** Limpia todos los listeners y resetea */
  destroy(): void {
    this.alive = false
    for (const fn of this.cleanupFns) fn()
    this.cleanupFns = []
    this.buttonConfigs = []
    this.joystickConfigs = []
    if (this.emitTimer !== null) {
      cancelAnimationFrame(this.emitTimer)
      this.emitTimer = null
    }
    this.reset()
  }

  // ── Setters manuales (para integración con teclado / WebSocket) ────────

  /** Setea el valor de un botón manualmente */
  pressButton(buttonIndex: number, value: number, touched?: boolean): void {
    if (buttonIndex < 0 || buttonIndex >= this.state.buttons.length) return
    const pressed = value > this.pressThreshold
    this.state.buttons[buttonIndex] = {
      pressed,
      value: clamp(value, 0, 1),
      touched: touched ?? pressed,
    }
    this.emitChange()
  }

  /** Setea el valor de un eje manualmente */
  setAxis(axisIndex: number, value: number): void {
    if (axisIndex < 0 || axisIndex >= this.state.axes.length) return
    this.state.axes[axisIndex] = clamp(value, -1, 1)
    this.emitChange()
  }

  // ── Listeners ──────────────────────────────────────────────────────────

  private setupButtonListeners(config: ButtonTouchConfig): void {
    const el = config.tapTarget as HTMLElement
    el.style.touchAction = 'none'
    let activePointerId: number | null = null

    const unsubDown = on<PointerEvent>(el, 'pointerdown', (e) => {
      e.preventDefault()
      activePointerId = e.pointerId
      this.pointerState.set(e.pointerId, {
        startX: e.clientX,
        startY: e.clientY,
        currentX: e.clientX,
        currentY: e.clientY,
        active: true,
      })

      const indexes = config.buttonIndexes ?? [config.buttonIndex]

      if (config.type === GamepadButtonType.Variable) {
        // Botón variable (gatillo): empieza en 0, sube con arrastre
        for (const idx of indexes) {
          const numIdx = typeof idx === 'number' ? idx : (idx as unknown as number)
          this.state.buttons[numIdx] = { pressed: false, value: 0, touched: false }
        }
      } else {
        // Botón on/off: se activa inmediatamente al tocar
        for (const idx of indexes) {
          const numIdx = typeof idx === 'number' ? idx : (idx as unknown as number)
          this.state.buttons[numIdx] = { pressed: true, value: 1, touched: true }
        }
      }

      if (config.lockTargetWhilePressed) {
        el.setPointerCapture(e.pointerId)
      }
      this.emitChange()
    })

    const unsubUp = on<PointerEvent>(document, 'pointerup', (e) => {
      if (e.pointerId !== activePointerId) return
      const ps = this.pointerState.get(e.pointerId)
      if (!ps?.active) return
      ps.active = false
      activePointerId = null

      const indexes = config.buttonIndexes ?? [config.buttonIndex]
      for (const idx of indexes) {
        const numIdx = typeof idx === 'number' ? idx : (idx as unknown as number)
        this.state.buttons[numIdx] = { pressed: false, value: 0, touched: false }
      }

      if (config.lockTargetWhilePressed) {
        try { el.releasePointerCapture(e.pointerId) } catch { /* ignore */ }
      }
      this.emitChange()
    })

    const unsubMove = on<PointerEvent>(document, 'pointermove', (e) => {
      if (e.pointerId !== activePointerId) return
      const ps = this.pointerState.get(e.pointerId)
      if (!ps?.active) return
      ps.currentX = e.clientX
      ps.currentY = e.clientY

      if (config.type === GamepadButtonType.Variable) {
        const dx = e.clientX - ps.startX
        const dy = e.clientY - ps.startY
        const vc = config as VariableButtonTouchConfig
        const { dragDistance, directions } = vc

        // Respetar direcciones configuradas (si solo se permite up, ignorar left/right)
        let value = 0
        if (directions[GamepadDirection.Up] && dy < 0) value = Math.min(1, Math.abs(dy) / dragDistance)
        else if (directions[GamepadDirection.Down] && dy > 0) value = Math.min(1, dy / dragDistance)
        else if (directions[GamepadDirection.Left] && dx < 0) value = Math.min(1, Math.abs(dx) / dragDistance)
        else if (directions[GamepadDirection.Right] && dx > 0) value = Math.min(1, dx / dragDistance)

        const indexes = config.buttonIndexes ?? [config.buttonIndex]
        for (const idx of indexes) {
          const numIdx = typeof idx === 'number' ? idx : (idx as unknown as number)
          this.state.buttons[numIdx] = {
            pressed: value > this.pressThreshold,
            value,
            touched: value > 0,
          }
        }
        this.emitChange()
      }
    })

    this.cleanupFns.push(() => {
      unsubDown()
      unsubUp()
      unsubMove()
      el.style.touchAction = ''
    })
  }

  private setupJoystickListeners(config: JoystickTouchConfig): void {
    const el = config.tapTarget as HTMLElement
    el.style.touchAction = 'none'
    let activePointerId: number | null = null

    const unsubDown = on<PointerEvent>(el, 'pointerdown', (e) => {
      e.preventDefault()
      activePointerId = e.pointerId
      this.pointerState.set(e.pointerId, {
        startX: e.clientX,
        startY: e.clientY,
        currentX: e.clientX,
        currentY: e.clientY,
        active: true,
      })
      if (config.lockTargetWhilePressed) {
        el.setPointerCapture(e.pointerId)
      }
    })

    const unsubMove = on<PointerEvent>(document, 'pointermove', (e) => {
      if (e.pointerId !== activePointerId) return
      const ps = this.pointerState.get(e.pointerId)
      if (!ps?.active) return
      ps.currentX = e.clientX
      ps.currentY = e.clientY

      const dx = e.clientX - ps.startX
      const dy = e.clientY - ps.startY
      const dist = Math.sqrt(dx * dx + dy * dy)
      const maxDist = config.dragDistance

      // Respetar restricciones de dirección del joystick
      const dirs = config.directions
      const allowX = !dirs || dirs[GamepadDirection.Left] || dirs[GamepadDirection.Right]
      const allowY = !dirs || dirs[GamepadDirection.Up] || dirs[GamepadDirection.Down]

      if (config.xAxisIndex !== undefined && allowX) {
        this.state.axes[config.xAxisIndex] = clamp(dist > 0 ? dx / maxDist : 0, -1, 1)
      }
      if (config.yAxisIndex !== undefined && allowY) {
        this.state.axes[config.yAxisIndex] = clamp(dist > 0 ? dy / maxDist : 0, -1, 1)
      }
      this.emitChange()
    })

    const unsubUp = on<PointerEvent>(document, 'pointerup', (e) => {
      if (e.pointerId !== activePointerId) return
      activePointerId = null
      const ps = this.pointerState.get(e.pointerId)
      if (ps) ps.active = false

      if (config.xAxisIndex !== undefined) this.state.axes[config.xAxisIndex] = 0
      if (config.yAxisIndex !== undefined) this.state.axes[config.yAxisIndex] = 0

      if (config.lockTargetWhilePressed) {
        try { el.releasePointerCapture(e.pointerId) } catch { /* ignore */ }
      }
      this.emitChange()
    })

    this.cleanupFns.push(() => {
      unsubDown()
      unsubMove()
      unsubUp()
      el.style.touchAction = ''
    })
  }

  private emitChange(): void {
    if (this.emitPending || !this.alive) return
    this.emitPending = true
    this.emitTimer = requestAnimationFrame(() => {
      this.emitPending = false
      if (!this.alive) return
      this.onStateChange?.(this.state)
    })
  }
}

// ── Utilidad ───────────────────────────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}
