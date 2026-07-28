// ============================================================================
// src/lib/gamepad/GamepadDetector.ts
// ----------------------------------------------------------------------------
// Detector automático de mandos físicos usando la Gamepad API del navegador.
//
// Identifica el modelo exacto del mando (DualSense, Xbox Series, Pro
// Controller, etc.), soporta vibración háptica y expone información de
// batería cuando la API lo permite.
//
// Basado en la Gamepad API estándar del navegador:
//   https://developer.mozilla.org/en-US/docs/Web/API/Gamepad_API
// ============================================================================

// ── Constantes de identificación ───────────────────────────────────────────

/** Patrones de Gamepad.id para identificar el modelo exacto de cada mando. */
const CONTROLLER_PATTERNS: { id: string; name: string; vendor: string; model: ControllerModel; icon: string }[] = [
  // Sony PlayStation
  { id: 'DualSense',                          name: 'DualSense',               vendor: 'Sony',     model: 'dualsense',       icon: '🎮' },
  { id: 'Wireless Controller',                 name: 'DualSense',               vendor: 'Sony',     model: 'dualsense',       icon: '🎮' },
  { id: 'PS5',                                 name: 'DualSense',               vendor: 'Sony',     model: 'dualsense',       icon: '🎮' },
  { id: 'DualShock 4',                         name: 'DualShock 4',             vendor: 'Sony',     model: 'dualshock4',      icon: '🎮' },
  { id: 'DUALSHOCK',                           name: 'DualShock 4',             vendor: 'Sony',     model: 'dualshock4',      icon: '🎮' },
  { id: '054c',                                name: 'PlayStation',             vendor: 'Sony',     model: 'generic_sony',    icon: '🎮' },

  // Microsoft Xbox
  { id: 'Xbox Series',                         name: 'Xbox Series X|S',         vendor: 'Microsoft', model: 'xbox_series',     icon: '🎮' },
  { id: 'Xbox One',                            name: 'Xbox One',                vendor: 'Microsoft', model: 'xbox_one',        icon: '🎮' },
  { id: 'Xbox 360',                            name: 'Xbox 360',                vendor: 'Microsoft', model: 'xbox_360',        icon: '🎮' },
  { id: 'Xbox Wireless Controller',            name: 'Xbox Series X|S',         vendor: 'Microsoft', model: 'xbox_series',     icon: '🎮' },
  { id: 'XInput',                              name: 'Xbox Controller',         vendor: 'Microsoft', model: 'xbox_generic',     icon: '🎮' },
  { id: 'Xbox',                                name: 'Xbox Controller',         vendor: 'Microsoft', model: 'xbox_generic',     icon: '🎮' },
  { id: '045e',                                name: 'Xbox Controller',         vendor: 'Microsoft', model: 'xbox_generic',     icon: '🎮' },

  // Nintendo Switch
  { id: 'Pro Controller',                      name: 'Switch Pro Controller',   vendor: 'Nintendo',  model: 'switch_pro',      icon: '🎮' },
  { id: 'Nintendo Switch Pro',                 name: 'Switch Pro Controller',   vendor: 'Nintendo',  model: 'switch_pro',      icon: '🎮' },
  { id: '057e',                                name: 'Nintendo Controller',     vendor: 'Nintendo',  model: 'switch_generic',   icon: '🎮' },
  { id: 'Joy-Con',                             name: 'Joy-Con',                 vendor: 'Nintendo',  model: 'joycon',           icon: '🎮' },

  // Steam
  { id: 'Steam Controller',                    name: 'Steam Controller',        vendor: 'Valve',     model: 'steam_controller', icon: '🎮' },
  { id: 'Steam Deck',                          name: 'Steam Deck',              vendor: 'Valve',     model: 'steam_deck',       icon: '🎮' },
  { id: 'de:00001111',                         name: 'Steam Controller',        vendor: 'Valve',     model: 'steam_controller', icon: '🎮' },
  { id: '28de',                                name: 'Steam Controller',        vendor: 'Valve',     model: 'steam_controller', icon: '🎮' },

  // 8BitDo / Others
  { id: '8BitDo',                              name: '8BitDo',                  vendor: '8BitDo',    model: '8bitdo',           icon: '🎮' },
  { id: '8bitdo',                              name: '8BitDo',                  vendor: '8BitDo',    model: '8bitdo',           icon: '🎮' },
  { id: 'SN30',                                name: '8BitDo SN30',             vendor: '8BitDo',    model: '8bitdo',           icon: '🎮' },
]

// ── Tipos ──────────────────────────────────────────────────────────────────

export type ControllerModel =
  | 'dualsense' | 'dualshock4' | 'generic_sony'
  | 'xbox_series' | 'xbox_one' | 'xbox_360' | 'xbox_generic'
  | 'switch_pro' | 'switch_generic' | 'joycon'
  | 'steam_controller' | 'steam_deck'
  | '8bitdo'
  | 'generic'

export interface ControllerIdentification {
  /** Nombre comercial del mando (DualSense, Xbox Series X|S, etc.) */
  name: string
  /** Fabricante (Sony, Microsoft, Nintendo, Valve, etc.) */
  vendor: string
  /** Modelo específico para lógica interna */
  model: ControllerModel
  /** Icono/emoji representativo */
  icon: string
  /** true si el modelo se identificó con certeza */
  confident: boolean
  /** Vendor ID en hex (si se pudo extraer del Gamepad.id) */
  vendorId?: string
  /** Product ID en hex (si se pudo extraer del Gamepad.id) */
  productId?: string
}

export interface BatteryInfo {
  /** Nivel de batería 0–1, undefined si no disponible */
  level?: number
  /** true si se está cargando, undefined si no disponible */
  charging?: boolean
  /** Tiempo restante en segundos, undefined si no disponible */
  chargingTime?: number
  /** Tiempo restante de descarga en segundos, undefined si no disponible */
  dischargingTime?: number
}

export interface PhysicalGamepadInfo {
  index: number
  id: string
  mapping: 'standard' | 'xr-standard' | ''
  buttonCount: number
  axisCount: number
  connected: boolean
  timestamp: number
  /** Identificación del modelo del mando */
  controller: ControllerIdentification
  /** Info de batería (si está disponible) */
  battery?: BatteryInfo
  /** true si el mando soporta vibración háptica */
  hasVibration: boolean
}

export type GamepadChangeCallback = (state: GamepadDetectorState) => void

export interface GamepadDetectorState {
  /** true si hay al menos un mando físico conectado */
  hasPhysicalGamepad: boolean
  /** Lista de mandos conectados con info detallada */
  connected: PhysicalGamepadInfo[]
}

export interface GamepadDetectorConfig {
  pollInterval?: number
  onStateChange?: GamepadChangeCallback
  /** Intervalo de vibración por defecto en ms (default: 200) */
  defaultVibrationDuration?: number
}

// ── GamepadDetector ────────────────────────────────────────────────────────

export class GamepadDetector {
  private _state: GamepadDetectorState = {
    hasPhysicalGamepad: false,
    connected: [],
  }

  private pollTimer: ReturnType<typeof setInterval> | null = null
  private pollIntervalMs: number
  private onStateChange: GamepadChangeCallback | null = null
  private cleanupFns: (() => void)[] = []
  private alive = true
  private _nativeGamepads: (Gamepad | null)[] = []
  private defaultVibrationMs: number

  constructor(config?: GamepadDetectorConfig) {
    this.pollIntervalMs = config?.pollInterval ?? 1000
    this.onStateChange = config?.onStateChange ?? null
    this.defaultVibrationMs = config?.defaultVibrationDuration ?? 200

    this.setupEventListeners()
    this.startPolling()
    this.scanGamepads()
  }

  // ── Getters ────────────────────────────────────────────────────────────

  get hasPhysicalGamepad(): boolean {
    return this._state.hasPhysicalGamepad
  }

  get connectedGamepads(): PhysicalGamepadInfo[] {
    return [...this._state.connected]
  }

  get state(): GamepadDetectorState {
    return { ...this._state, connected: [...this._state.connected] }
  }

  onStateChangeCallback(cb: GamepadChangeCallback): void {
    this.onStateChange = cb
    if (this.alive) cb(this.state)
  }

  // ── Vibración Háptica ──────────────────────────────────────────────────

  /**
   * Activa la vibración en todos los mandos conectados que la soporten.
   * @returns true si al menos un mando vibra
   *
   * @example
   * ```ts
   * detector.rumble(1.0, 0.5, 300)  // Débil fuerte, fuerte suave, 300ms
   * ```
   */
  rumble(
    weakMagnitude = 0.5,
    strongMagnitude = 0.5,
    durationMs = this.defaultVibrationMs,
  ): boolean {
    let anyRumbled = false

    for (let i = 0; i < this._nativeGamepads.length; i++) {
      const gp = this._nativeGamepads[i]
      if (!gp || !gp.connected) continue

      const actuator = (gp as any).vibrationActuator as GamepadHapticActuator | undefined
      if (!actuator) continue

      try {
        actuator.playEffect('dual-rumble', {
          startDelay: 0,
          duration: durationMs,
          weakMagnitude: Math.max(0, Math.min(1, weakMagnitude)),
          strongMagnitude: Math.max(0, Math.min(1, strongMagnitude)),
        })
        anyRumbled = true
      } catch {
        // Navegador/bloqueado por OS
      }
    }

    return anyRumbled
  }

  /**
   * Vibración corta de confirmación (como un click háptico).
   */
  rumbleClick(): boolean {
    return this.rumble(0.8, 0.3, 50)
  }

  /**
   * Vibración de error (patrón largo + fuerte)
   */
  rumbleError(): boolean {
    this.rumble(1.0, 1.0, 400)
    setTimeout(() => this.rumble(0.5, 0.5, 200), 500)
    return true
  }

  // ── Escaneo ────────────────────────────────────────────────────────────

  scanGamepads(): void {
    if (!this.alive) return
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return

    let nativeGamepads: (Gamepad | null)[]
    try {
      nativeGamepads = navigator.getGamepads()
    } catch {
      return
    }

    this._nativeGamepads = nativeGamepads

    const connected: PhysicalGamepadInfo[] = []

    for (let i = 0; i < nativeGamepads.length; i++) {
      const gp = nativeGamepads[i]
      if (!gp || !gp.connected) continue

      const controller = identifyController(gp.id)
      const hasVibration = hasVibrationSupport(gp)

      connected.push({
        index: gp.index,
        id: gp.id,
        mapping: gp.mapping as 'standard' | 'xr-standard' | '',
        buttonCount: gp.buttons.length,
        axisCount: gp.axes.length,
        connected: true,
        timestamp: gp.timestamp ?? performance.now(),
        controller,
        hasVibration,
      })
    }

    // Actualizar batería en cada escaneo (por si entra nuevo mando)
    void this.updateBatteryInfo(connected)

    const hasChanged =
      connected.length !== this._state.connected.length ||
      connected.some(gp => {
        const prev = this._state.connected.find(p => p.index === gp.index)
        return !prev
          || prev.id !== gp.id
          || prev.controller.model !== gp.controller.model
          || prev.buttonCount !== gp.buttonCount
          || prev.axisCount !== gp.axisCount
          || prev.mapping !== gp.mapping
          || prev.hasVibration !== gp.hasVibration
      })

    if (hasChanged) {
      this._state = { hasPhysicalGamepad: connected.length > 0, connected }
      this.emitChange()
    }
  }

  // ── Limpieza ───────────────────────────────────────────────────────────

  destroy(): void {
    this.alive = false
    for (const fn of this.cleanupFns) fn()
    this.cleanupFns = []
    if (this.pollTimer !== null) {
      clearInterval(this.pollTimer)
      this.pollTimer = null
    }
    this._nativeGamepads = []
    this.onStateChange = null
  }

  // ── Internals ──────────────────────────────────────────────────────────

  private setupEventListeners(): void {
    if (typeof window === 'undefined') return

    const onConnected = () => setTimeout(() => this.scanGamepads(), 50)
    const onDisconnected = () => setTimeout(() => this.scanGamepads(), 50)

    window.addEventListener('gamepadconnected', onConnected)
    window.addEventListener('gamepaddisconnected', onDisconnected)

    this.cleanupFns.push(() => {
      window.removeEventListener('gamepadconnected', onConnected)
      window.removeEventListener('gamepaddisconnected', onDisconnected)
    })
  }

  private startPolling(): void {
    if (typeof setInterval === 'undefined') return

    this.pollTimer = setInterval(() => this.scanGamepads(), this.pollIntervalMs)

    this.cleanupFns.push(() => {
      if (this.pollTimer !== null) {
        clearInterval(this.pollTimer)
        this.pollTimer = null
      }
    })
  }

  private emitChange(): void {
    if (!this.alive) return
    this.onStateChange?.(this.state)
  }

  /** Actualiza info de batería vía Web Bluetooth / Battery API (best-effort) */
  private async updateBatteryInfo(connected: PhysicalGamepadInfo[]): Promise<void> {
    // La Gamepad API estándar NO expone batería.
    // Aquí dejamos el placeholder para cuando la API lo soporte.
    // Posible integración futura: Web Bluetooth → GATT Battery Service (0x180F)
  }
}

// ── Funciones de identificación ────────────────────────────────────────────

/**
 * Parsea el Gamepad.id para identificar el modelo exacto del mando.
 *
 * Patrones conocidos por plataforma:
 *   Windows:  "Xbox Series X Controller (STANDARD GAMEPAD)"
 *             "Wireless Controller (STANDARD GAMEPAD)"
 *   macOS:    "DualSense Wireless Controller"
 *             "Xbox Series X Controller"
 *   Linux:    "Sony Interactive Entertainment Wireless Controller"
 *             "Microsoft Corporation Xbox Series X|S Controller"
 */
export function identifyController(gamepadId: string): ControllerIdentification {
  if (!gamepadId) {
    return { name: 'Unknown', vendor: 'Unknown', model: 'generic', icon: '🎮', confident: false }
  }

  // Buscar por patrón exacto (más específico primero)
  for (const pattern of CONTROLLER_PATTERNS) {
    if (gamepadId.includes(pattern.id)) {
      return {
        name: pattern.name,
        vendor: pattern.vendor,
        model: pattern.model,
        icon: pattern.icon,
        confident: true,
        vendorId: extractVendorId(gamepadId),
        productId: extractProductId(gamepadId),
      }
    }
  }

  // Fallback: buscar por vendor ID en hex
  const vendorId = extractVendorId(gamepadId)
  const productId = extractProductId(gamepadId)

  // Heurística por mapping
  if (gamepadId.includes('STANDARD GAMEPAD')) {
    return {
      name: 'Standard Controller',
      vendor: 'Generic',
      model: 'generic',
      icon: '🎮',
      confident: false,
      vendorId,
      productId,
    }
  }

  return {
    name: 'Unknown Controller',
    vendor: 'Unknown',
    model: 'generic',
    icon: '🎮',
    confident: false,
    vendorId,
    productId,
  }
}

/**
 * Detecta si un gamepad nativo soporta vibración háptica.
 */
export function hasVibrationSupport(gp: Gamepad): boolean {
  return !!(gp as any).vibrationActuator
}

/**
 * Extrae el Vendor ID en hex del Gamepad.id (si está presente).
 * Formato típico: "054c-1234 Wireless Controller" o "vendor: 054c product: 1234"
 */
function extractVendorId(id: string): string | undefined {
  // Formato: "XXXX-XXXX Name" (Windows)
  const dashMatch = id.match(/^([0-9a-fA-F]{4})-([0-9a-fA-F]{4})/)
  if (dashMatch) return dashMatch[1].toLowerCase()

  // Formato: "vendor: XXXX product: XXXX"
  const labelMatch = id.match(/vendor:\s*([0-9a-fA-F]{4})/i)
  if (labelMatch) return labelMatch[1].toLowerCase()

  // Formato: "XXXX:XXXX" (Linux)
  const colonMatch = id.match(/^([0-9a-fA-F]{4}):([0-9a-fA-F]{4})/)
  if (colonMatch) return colonMatch[1].toLowerCase()

  return undefined
}

/**
 * Extrae el Product ID en hex del Gamepad.id (si está presente).
 */
function extractProductId(id: string): string | undefined {
  // Formato: "XXXX-XXXX Name" (Windows)
  const dashMatch = id.match(/^([0-9a-fA-F]{4})-([0-9a-fA-F]{4})/)
  if (dashMatch) return dashMatch[2].toLowerCase()

  // Formato: "vendor: XXXX product: XXXX"
  const labelMatch = id.match(/product:\s*([0-9a-fA-F]{4})/i)
  if (labelMatch) return labelMatch[1].toLowerCase()

  // Formato: "XXXX:XXXX" (Linux)
  const colonMatch = id.match(/^([0-9a-fA-F]{4}):([0-9a-fA-F]{4})/)
  if (colonMatch) return colonMatch[2].toLowerCase()

  return undefined
}

// ── Hook-friendly helper ───────────────────────────────────────────────────

export function createGamepadDetector(config?: GamepadDetectorConfig): GamepadDetector {
  return new GamepadDetector(config)
}
