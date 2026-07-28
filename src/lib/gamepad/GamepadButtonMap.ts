// ============================================================================
// src/lib/gamepad/GamepadButtonMap.ts
// ----------------------------------------------------------------------------
// Mapeo de botones de gamepad para diferentes plataformas.
// Basado en los patrones de virtual-gamepad-lib (enums.ts) pero como código
// propio, sin depender del proyecto externo.
//
// Cada enum asigna el nombre del botón al índice que ocupa en el array
// Gamepad.buttons[] de la Gamepad API del navegador.
//
// Uso:
//   import { PlayStationButtonMap } from './GamepadButtonMap'
//   const crossBtn = gamepad.buttons[PlayStationButtonMap.Cross]
// ============================================================================

/** Botones PlayStation (DualShock/DualSense) */
export enum PlayStationButtonMap {
  Cross = 0,
  Circle = 1,
  Square = 2,
  Triangle = 3,
  L1 = 4,
  R1 = 5,
  L2 = 6,
  R2 = 7,
  Share = 8,
  Options = 9,
  LStick = 10,
  RStick = 11,
  DPadUp = 12,
  DPadDown = 13,
  DPadLeft = 14,
  DPadRight = 15,
  PlayStation = 16,
}

/** Botones Xbox */
export enum XboxButtonMap {
  A = 0,
  B = 1,
  X = 2,
  Y = 3,
  LShoulder = 4,
  RShoulder = 5,
  LTrigger = 6,
  RTrigger = 7,
  Back = 8,
  Start = 9,
  LStick = 10,
  RStick = 11,
  DPadUp = 12,
  DPadDown = 13,
  DPadLeft = 14,
  DPadRight = 15,
  Xbox = 16,
}

/** Botones estándar (Gamepad API) */
export enum StandardButtonMap {
  A = 0,
  B = 1,
  X = 2,
  Y = 3,
  LShoulder = 4,
  RShoulder = 5,
  LTrigger = 6,
  RTrigger = 7,
  Back = 8,
  Start = 9,
  LStick = 10,
  RStick = 11,
  DPadUp = 12,
  DPadDown = 13,
  DPadLeft = 14,
  DPadRight = 15,
  Vendor = 16,
}

/** Ejes del gamepad (joysticks) */
export enum GamepadAxesMap {
  LStickX = 0,
  LStickY = 1,
  RStickX = 2,
  RStickY = 3,
}

/** Tipo unión de todos los mapas de botones */
export type ButtonMapType =
  | PlayStationButtonMap
  | XboxButtonMap
  | StandardButtonMap;

/** Tipo de botón: on/off o analógico (variable) */
export enum GamepadButtonType {
  OnOff = 'onOff',
  Variable = 'variable',
}

/** Direcciones para D-Pad y joysticks */
export enum GamepadDirection {
  Up = 'up',
  Down = 'down',
  Left = 'left',
  Right = 'right',
}

/** Estado de emulación de un gamepad */
export enum GamepadEmulationState {
  Real = 'real',
  Emulated = 'emulated',
  Overlay = 'overlay',
}

/**
 * Obtiene el símbolo Unicode para un botón PlayStation dado su índice.
 */
export function getPlayStationSymbol(btnIndex: number): string {
  switch (btnIndex) {
    case PlayStationButtonMap.Cross: return '✕'
    case PlayStationButtonMap.Circle: return '◯'
    case PlayStationButtonMap.Square: return '□'
    case PlayStationButtonMap.Triangle: return '△'
    case PlayStationButtonMap.L1: return 'L1'
    case PlayStationButtonMap.R1: return 'R1'
    case PlayStationButtonMap.L2: return 'L2'
    case PlayStationButtonMap.R2: return 'R2'
    case PlayStationButtonMap.Share: return 'SL'
    case PlayStationButtonMap.Options: return 'ST'
    case PlayStationButtonMap.DPadUp: return '▲'
    case PlayStationButtonMap.DPadDown: return '▼'
    case PlayStationButtonMap.DPadLeft: return '◀'
    case PlayStationButtonMap.DPadRight: return '▶'
    case PlayStationButtonMap.LStick: return 'L3'
    case PlayStationButtonMap.RStick: return 'R3'
    default: return `B${btnIndex}`
  }
}

/**
 * Obtiene el símbolo para un botón Xbox dado su índice.
 */
export function getXboxSymbol(btnIndex: number): string {
  switch (btnIndex) {
    case XboxButtonMap.A: return 'A'
    case XboxButtonMap.B: return 'B'
    case XboxButtonMap.X: return 'X'
    case XboxButtonMap.Y: return 'Y'
    case XboxButtonMap.LShoulder: return 'LB'
    case XboxButtonMap.RShoulder: return 'RB'
    case XboxButtonMap.LTrigger: return 'LT'
    case XboxButtonMap.RTrigger: return 'RT'
    case XboxButtonMap.Back: return '◀'
    case XboxButtonMap.Start: return '▶'
    case XboxButtonMap.DPadUp: return '▲'
    case XboxButtonMap.DPadDown: return '▼'
    case XboxButtonMap.DPadLeft: return '◀'
    case XboxButtonMap.DPadRight: return '▶'
    case XboxButtonMap.LStick: return 'LS'
    case XboxButtonMap.RStick: return 'RS'
    default: return `B${btnIndex}`
  }
}
