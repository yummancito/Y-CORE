import { create } from 'zustand'
import { setLanguage as setI18nLanguage } from '../lib/i18n'

export interface NavItemConfig {
  id: string
  visible: boolean
  order: number
}

function mergeNavItems(defaults: NavItemConfig[], saved: NavItemConfig[]): NavItemConfig[] {
  const savedIds = new Set(saved.map((s) => s.id))
  const merged = [...saved]
  for (const d of defaults) {
    if (!savedIds.has(d.id)) {
      merged.push(d)
    }
  }
  return merged.sort((a, b) => a.order - b.order)
}

export interface BackgroundImageConfig {
  enabled: boolean
  path: string | null
  size: 'cover' | 'contain' | 'auto'
  position: 'center' | 'top' | 'bottom' | 'left' | 'right'
  blur: number
  opacity: number
  overlay: boolean
  overlayOpacity: number
}

export interface AccentColorConfig {
  enabled: boolean
  color: string
}

export interface NavbarConfig {
  sidebarOpacity: number
  titlebarOpacity: number
}

export interface Customization {
  backgroundImage: BackgroundImageConfig
  accentColor: AccentColorConfig
  navbar: NavbarConfig
  navItems: NavItemConfig[]
}

export const DEFAULT_CUSTOMIZATION: Customization = {
  backgroundImage: {
    enabled: true,
    path: 'public/background.jpg',
    size: 'cover',
    position: 'center',
    blur: 0,
    opacity: 100,
    overlay: true,
    overlayOpacity: 60,
  },
  accentColor: {
    enabled: false,
    color: '#3BB2F7',
  },
  navbar: {
    sidebarOpacity: 85,
    titlebarOpacity: 85,
  },
  navItems: [
    { id: 'library', visible: true, order: 0 },
    { id: 'store', visible: true, order: 1 },
    { id: 'downloads', visible: true, order: 2 },
    { id: 'onlinefix', visible: true, order: 3 },
    { id: 'drmremover', visible: true, order: 4 },
    { id: 'addgame', visible: true, order: 5 },
    { id: 'logs', visible: true, order: 6 },
    { id: 'settings', visible: true, order: 7 },
  ],
}

/**
 * H1.3 — método preferido de instalación de juegos.
 *   - 'steamcmd'    → fuerza SteamCMD; si no está disponible, dispatcher cae a cliente.
 *   - 'steamclient' → solo cliente Lua (flujo legacy).
 *   - 'auto'        → SteamCMD si está disponible; sino cliente.
 */
export type InstallMethod = 'steamcmd' | 'steamclient' | 'auto'

/**
 * H1.4 — razón por la que el último install cayó a cliente. Persistido para que
 * SettingsPage pueda mostrar "El último intento con SteamCMD falló por: X"
 * y sugerir al usuario cambiar el método o reintentar manualmente.
 *
 * El array INSTALL_FALLBACK_REASONS es la fuente de verdad del runtime; el
 * tipo se deriva vía `typeof INSTALL_FALLBACK_REASONS[number]` para evitar
 * drift entre el enum y la validación en `loadFromConfig`.
 */
export const INSTALL_FALLBACK_REASONS = [
  'steamcmd-not-available',
  'notAnonymous',
  'stalled',
  'bin-too-small',
  'spawn-failed',
] as const

export type InstallFallbackReason = (typeof INSTALL_FALLBACK_REASONS)[number]

interface SettingsStore {
  showAdult: boolean
  showTools: boolean
  showAddGame: boolean
  logsVisible: boolean
  colorTheme: string
  language: string
  customization: Customization
  installMethod: InstallMethod
  lastInstallFallbackReason: InstallFallbackReason | null
  setShowAdult: (v: boolean) => void
  setShowTools: (v: boolean) => void
  setShowAddGame: (v: boolean) => void
  setLogsVisible: (v: boolean) => void
  setColorTheme: (v: string) => void
  setLanguage: (v: string) => void
  setCustomization: (partial: Partial<Customization>) => Promise<void>
  setInstallMethod: (v: InstallMethod) => Promise<void>
  setInstallFallbackReason: (reason: InstallFallbackReason | null) => Promise<void>
  clearInstallFallbackReason: () => Promise<void>
  loadFromConfig: () => void
}

// ---------------------------------------------------------------------------
// Race-safe persistence
// ---------------------------------------------------------------------------
// setInstallMethod y setInstallFallbackReason pueden dispararse consecutivamente
// durante un fallback (e.g. accept un SteamCMD failure → dispatcher cae a
// steamclient + notifica el motivo). Si cada uno hace read-mutate-write
// independientemente, el segundo read puede ver una versión obsoleta del
// config (sin el campo del primero) y pisar lo escrito.
//
// Solución: encadenar TODAS las writes por un módulo-level pendingWrite.
// Cada setter hace `pendingWrite.then(...).catch(...)` y re-asigna
// pendingWrite a su propia promesa. Independientemente de cuántos setters
// disparen en el mismo tick, se ejecutan en serie preservando todas las
// actualizaciones.

let pendingWrite: Promise<void> = Promise.resolve()

async function writeConfigSerialized(updates: Record<string, unknown>): Promise<void> {
  const myWrite = pendingWrite.then(async () => {
    try {
      const existingConfig = (await window.steamtools?.readConfig?.()) as Record<string, unknown> | null
      await window.steamtools?.writeConfig?.({
        ...(existingConfig || {}),
        ...updates,
      })
    } catch {
      // Non-Electron tests / CLI: bridge no disponible, no persistimos.
    }
  })
  // Chain the NEXT write after mine (sin importar el éxito de este).
  pendingWrite = myWrite.catch(() => {})
  // El caller no ve mis errores (puede chainear la suya), pero await myWrite
  // por API contract.
  await myWrite.catch(() => {})
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  showAdult: false,
  showTools: false,
  showAddGame: false,
  logsVisible: true,
  colorTheme: 'ct-y-core',
  language: 'es',
  customization: DEFAULT_CUSTOMIZATION,
  // H1.3 — default 'auto' para no romper usuarios que ya usan Y-core.
  installMethod: 'auto' as InstallMethod,
  lastInstallFallbackReason: null,

  setShowAdult: (v) => set({ showAdult: v }),
  setShowTools: (v) => set({ showTools: v }),
  setShowAddGame: (v) => set({ showAddGame: v }),
  setLogsVisible: (v) => set({ logsVisible: v }),
  setColorTheme: (v) => set({ colorTheme: v }),
  setLanguage: (v) => {
    setI18nLanguage(v)
    set({ language: v })
  },

  setCustomization: async (partial) => {
    const current = get().customization
    const merged: Customization = {
      backgroundImage: { ...current.backgroundImage, ...(partial.backgroundImage || {}) },
      accentColor: { ...current.accentColor, ...(partial.accentColor || {}) },
      navbar: { ...current.navbar, ...(partial.navbar || {}) },
      navItems: partial.navItems || current.navItems,
    }
    set({ customization: merged })
    await writeConfigSerialized({ customization: merged })
  },

  // H1.3: setter de método. Limpia el fallback reason si lo había (el
  // operador está retomando el control).
  setInstallMethod: async (v: InstallMethod) => {
    set({ installMethod: v, lastInstallFallbackReason: null })
    await writeConfigSerialized({
      installMethod: v,
      lastInstallFallbackReason: null,
    })
  },

  // H1.4: store-side para que el processor notifique "fallé por X" sin que
  // el processor toque directamente el bridge de config.
  setInstallFallbackReason: async (reason: InstallFallbackReason | null) => {
    set({ lastInstallFallbackReason: reason })
    await writeConfigSerialized({ lastInstallFallbackReason: reason })
  },

  clearInstallFallbackReason: async () => {
    set({ lastInstallFallbackReason: null })
    await writeConfigSerialized({ lastInstallFallbackReason: null })
  },

  loadFromConfig: () => {
    try {
      window.steamtools?.readConfig?.().then((cfg) => {
        if (cfg) {
          const c = cfg as any
          if (c.showAdult !== undefined) set({ showAdult: c.showAdult })
          if (c.showTools !== undefined) set({ showTools: c.showTools })
          if (c.showAddGame !== undefined) set({ showAddGame: c.showAddGame })
          if (c.logsVisible !== undefined) set({ logsVisible: c.logsVisible })
          if (c.colorTheme) set({ colorTheme: c.colorTheme })
          if (c.language) {
            setI18nLanguage(c.language)
            set({ language: c.language })
          }

          // H1.3 — hydra installMethod desde config. Valores fuera del enum caen al default sin efecto.
          if (c.installMethod === 'steamcmd' || c.installMethod === 'steamclient' || c.installMethod === 'auto') {
            set({ installMethod: c.installMethod })
          }

          // H1.4 — hydra lastInstallFallbackReason si está presente y válido. Usa
          // el array derivable del tipo para no duplicar el enum.
          if (
            c.lastInstallFallbackReason &&
            (INSTALL_FALLBACK_REASONS as readonly string[]).includes(c.lastInstallFallbackReason)
          ) {
            set({ lastInstallFallbackReason: c.lastInstallFallbackReason as InstallFallbackReason })
          }

          if (c.customization) {
            const cu = c.customization
            set({
              customization: {
                backgroundImage: { ...DEFAULT_CUSTOMIZATION.backgroundImage, ...(cu.backgroundImage || {}) },
                accentColor: { ...DEFAULT_CUSTOMIZATION.accentColor, ...(cu.accentColor || {}) },
                navbar: { ...DEFAULT_CUSTOMIZATION.navbar, ...(cu.navbar || {}) },
                navItems: mergeNavItems(DEFAULT_CUSTOMIZATION.navItems, cu.navItems || []),
              },
            })
          }
        }
      }).catch((e) => console.warn('[useSettingsStore] readConfig failed:', e))
    } catch {
      // Non-Electron
    }
  },
}))
