import { create } from 'zustand'
import { setLanguage as setI18nLanguage } from '../lib/i18n'

interface SettingsStore {
  showAdult: boolean
  showTools: boolean
  showAddGame: boolean
  logsVisible: boolean
  colorTheme: string
  language: string
  setShowAdult: (v: boolean) => void
  setShowTools: (v: boolean) => void
  setShowAddGame: (v: boolean) => void
  setLogsVisible: (v: boolean) => void
  setColorTheme: (v: string) => void
  setLanguage: (v: string) => void
  loadFromConfig: () => void
}

export const useSettingsStore = create<SettingsStore>((set) => ({
  showAdult: false,
  showTools: false,
  showAddGame: false,
  logsVisible: true,
  colorTheme: 'ct-y-core',
  language: 'es',

  setShowAdult: (v) => set({ showAdult: v }),
  setShowTools: (v) => set({ showTools: v }),
  setShowAddGame: (v) => set({ showAddGame: v }),
  setLogsVisible: (v) => set({ logsVisible: v }),
  setColorTheme: (v) => set({ colorTheme: v }),
  setLanguage: (v) => {
    setI18nLanguage(v)
    set({ language: v })
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
        }
      }).catch(() => {})
    } catch {
      // Non-Electron
    }
  },
}))
