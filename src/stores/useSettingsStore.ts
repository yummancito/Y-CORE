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
    sidebarOpacity: 6,
    titlebarOpacity: 6,
  },
  navItems: [
    { id: 'library', visible: true, order: 0 },
    { id: 'store', visible: true, order: 1 },
    { id: 'onlinefix', visible: true, order: 2 },
    { id: 'drmremover', visible: true, order: 3 },
    { id: 'addgame', visible: true, order: 4 },
    { id: 'logs', visible: true, order: 5 },
    { id: 'settings', visible: true, order: 6 },
  ],
}

interface SettingsStore {
  showAdult: boolean
  showTools: boolean
  showAddGame: boolean
  logsVisible: boolean
  colorTheme: string
  language: string
  customization: Customization
  setShowAdult: (v: boolean) => void
  setShowTools: (v: boolean) => void
  setShowAddGame: (v: boolean) => void
  setLogsVisible: (v: boolean) => void
  setColorTheme: (v: string) => void
  setLanguage: (v: string) => void
  setCustomization: (partial: Partial<Customization>) => Promise<void>
  loadFromConfig: () => void
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  showAdult: false,
  showTools: false,
  showAddGame: false,
  logsVisible: true,
  colorTheme: 'ct-y-core',
  language: 'es',
  customization: DEFAULT_CUSTOMIZATION,

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
    try {
      const existingConfig = (await window.steamtools?.readConfig?.()) as Record<string, unknown> | null
      await window.steamtools?.writeConfig?.({ ...(existingConfig || {}), customization: merged })
    } catch {
      // Non-Electron
    }
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
