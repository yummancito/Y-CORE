// ============================================================================
// src/lib/gamepad/index.ts
// ----------------------------------------------------------------------------
// Barrel exports for the Y-CORE gamepad module.
// Sistema propio de gamepad virtual táctil — basado en patrones de
// virtual-gamepad-lib pero implementado sin dependencias externas.
// ============================================================================

export {
  PlayStationButtonMap,
  XboxButtonMap,
  StandardButtonMap,
  GamepadAxesMap,
  GamepadButtonType,
  GamepadDirection,
  GamepadEmulationState,
  getPlayStationSymbol,
  getXboxSymbol,
} from './GamepadButtonMap'
export type { ButtonMapType } from './GamepadButtonMap'

export { TouchGamepad } from './TouchGamepad'
export type {
  OnOffButtonTouchConfig,
  VariableButtonTouchConfig,
  ButtonTouchConfig,
  JoystickTouchConfig,
  TouchGamepadState,
  TouchGamepadConfig,
} from './TouchGamepad'

export { GamepadDisplay } from './GamepadDisplay'
export type {
  DisplayOnOffButton,
  DisplayVariableButton,
  DisplayButton,
  DisplayJoystick,
  DisplayConfig,
} from './GamepadDisplay'

export { GamepadDetector, createGamepadDetector, identifyController, hasVibrationSupport } from './GamepadDetector'
export type {
  PhysicalGamepadInfo,
  GamepadDetectorState,
  GamepadChangeCallback,
  GamepadDetectorConfig,
  ControllerIdentification,
  ControllerModel,
  BatteryInfo,
} from './GamepadDetector'
