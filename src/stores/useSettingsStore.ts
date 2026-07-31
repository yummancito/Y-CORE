import { create } from 'zustand'
import { setLanguage as setI18nLanguage } from '../lib/i18n'
import { configService } from '../services/config.service'
import { useToastStore } from './useToastStore'

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
}// H1.3 — V2-only: no install method toggling. Every game install goes through
// the V2 download engine (real anonymous SteamPipe CDN worker). The legacy
// `installMethod`, `lastInstallFallbackReason`, and SteamCMD/Lua-client
// branches are GONE; their types removed so any remaining callers fail loudly
// at typecheck instead of silently misbehaving.

/**
 * Modo de lanzamiento de juegos.
 *   - 'native' → lanza el .exe directamente desde Y-core sin Steam.
 *
 * Round-9 fix: removido el valor 'steam' / la ruta shell.openExternal
 * 'steam://rungameid/...'. Y-core owns 100% of game launches. Si un juego
 * requiere nivel-4 (Denuvo/EAC), patchGameFolder + removeGameDrm pueden
 * no alcanzar y la app retorna un error accionable en lugar de derivar
 * a Steam. La UI sigue mostrando un único valor "Directo (sin Steam)".
 * El campo persistence se conserva para migrar configs legacy (ver
 * loadFromConfig): si el JSON tenía `launcherMode: 'steam'` se ignora y
 * el store arranca fijo en 'native'.
 */
export type LauncherMode = 'native'

interface SettingsStore {
  showAdult: boolean
  showTools: boolean
  showAddGame: boolean
  logsVisible: boolean
  colorTheme: string
  language: string
  customization: Customization
  launcherMode: LauncherMode
  /**
   * Round-10: cuando true, cada launch nativo hace taskkill de steam.exe y
   * steamwebhelper.exe ANTES de continuar con el chain removeGameDrm →
   * patchGameFolder → spawn. Es una toggle de diagnóstico: le da al usuario
   * visibilidad VERIFICABLE de que Y-core no depende de Steam para correr
   * juegos — porque Steam desaparece y el juego sigue abriendo.
   * Default false para no molestar a quien tiene Steam abierto a propósito.
   */
  killSteamBeforeLaunch: boolean
  setShowAdult: (v: boolean) => void
  setShowTools: (v: boolean) => void
  setShowAddGame: (v: boolean) => void
  setLogsVisible: (v: boolean) => void
  setColorTheme: (v: string) => void
  setLanguage: (v: string) => void
  setCustomization: (partial: Partial<Customization>) => Promise<void>
  setLauncherMode: (v: LauncherMode) => Promise<void>
  setKillSteamBeforeLaunch: (v: boolean) => Promise<void>
  loadFromConfig: () => void
}

// ---------------------------------------------------------------------------
// Race-safe persistence
// ---------------------------------------------------------------------------
// Encadenamos TODAS las writes via pendingWrite. Cualquier setter dispara
// read-mutate-write sobre la config — sin la cadena perderíamos writes
// concurrentes (e.g. cuando el usuario arrastra un color picker a la vez
// que cambia el idioma).

let pendingWrite: Promise<void> = Promise.resolve()

async function writeConfigSerialized(updates: Record<string, unknown>): Promise<void> {
  const myWrite = pendingWrite.then(async () => {
    try {
      const existingConfig = await configService.read()
      await configService.write({
        ...(existingConfig || {}),
        ...updates,
      })
    } catch {
      // Non-Electron tests / CLI: bridge no disponible, no persistimos.
    }
  })
  pendingWrite = myWrite.catch(() => {})
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
  // Default: 'native' — lanzar juegos directamente sin Steam (única opción
  // expuesta; el campo se mantiene para el legacy config que pueda tener ya
  // guardado el valor 'steam').
  // Round-9 fix: literal-singleton. El único valor válido es 'native'.
  launcherMode: 'native' as LauncherMode,
  // Round-10: default false. La toggle vive en Settings → Steam Integration.
  // Yi-core nativo siempre lanza; este flag SOLO mata Steam.exe antes para
  // que el user pueda verificar con sus ojos que no hay dependencia.
  killSteamBeforeLaunch: false,

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

  // Round-9 fix: setLauncherMode se mantiene en el type por back-compat
  // pero se vuelve no-op—— no hay más estado que cambiar. Si una parte
  // legacy del renderer todavía lo llama, simplemente no persiste nada.
  setLauncherMode: async (_v: LauncherMode) => {
    /* no-op: Y-core ya no tiene modo alternativo */
  },

  setKillSteamBeforeLaunch: async (v: boolean) => {
    set({ killSteamBeforeLaunch: v })
    await writeConfigSerialized({ killSteamBeforeLaunch: v })
  },

  loadFromConfig: () => {
    try {
      configService.read().then((cfg) => {
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

          // V1-only fields: silently ignored. Old configs may contain
          // installMethod / lastInstallFallbackReason / installFallbackReason;
          // we don't read them because V2 doesn't honor those knobs.
          void c.installMethod
          void c.lastInstallFallbackReason
          void c.installFallbackReason

          // Round-9 fix: el único valor válido es 'native'. Cualquier
          // 'steam' legacy en configs.json se descarta silenciosamente y
          // el store queda en 'native'. (Antes hacía set con 'steam' si
          // lo encontraba — obsoleto.)
          if (c.launcherMode === 'native') {
            set({ launcherMode: 'native' })
          }
          void c.launcherMode // referenced via 'native' branch above; ts-ignored

          // Round-10 (auto-enable for fresh installs): the user explicitly
          // reported "games still launch via Steam" — so for users whose
          // disk config has never set killSteamBeforeLaunch, we default to
          // TRUE on first read. Power users can disable the toggle in
          // Settings → Steam Integration. The previous default of `false`
          // ignored the most common false positive (Steam was already alive
          // when the user clicked Jugar) — making the user's complaint
          // appear unaddressed even after the patches landed.
          //
          // Behavior:
          //   disk has true/false   → honor it (no override)
          //   disk is missing key   → auto-enable, persist `true`, fire toast on first launch
          if (typeof c.killSteamBeforeLaunch === 'boolean') {
            set({ killSteamBeforeLaunch: c.killSteamBeforeLaunch })
          } else {
            set({ killSteamBeforeLaunch: true })
            // Fire-and-forget persist so a subsequent load finds `true` set.
            // Errors swallowed because the user already opted in by default
            // and we'll re-attempt on next launch.
            writeConfigSerialized({ killSteamBeforeLaunch: true }).catch(() => {})
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



// ============================================================================
// Round-11.5 — auto-sync killSteamBeforeLaunch to main-process flips.
// ============================================================================

// Idempotency guard so HMR / multi-import does not stack listeners.
const _round11Subscribed = new Set<string>()
function subscribeAppEventOnce(event: string, handler: (payload: any) => void): void {
  if (_round11Subscribed.has(event)) return
  _round11Subscribed.add(event)
  if (typeof window === "undefined") return
  const tools = (window as any).steamtools
  if (!tools?.onAppEvent) return
  try { tools.onAppEvent(event, handler) } catch { /* never crash UI */ }
}

if (typeof window !== "undefined" && (window as any).steamtools?.onAppEvent) {
  // 1. Steam alive at startup → main flipped killSteamBeforeLaunch false→true.
  subscribeAppEventOnce("app:autoKillReactivated", () => {
    try {
      useSettingsStore.getState().setKillSteamBeforeLaunch(true)
    } catch { /* never crash UI */ }
  })

  // 2. Silent auto-build at startup completed (or failed). Surface via toast.
  subscribeAppEventOnce("app:autoBuildFinished", (payload: any) => {
    try {
      const showToast = useToastStore.getState()?.showToast
      if (typeof showToast !== "function") return
      if (payload?.success) {
        showToast("success", `Emulador compilado en ${payload.durationMs ?? "?"}ms. Reiniciá Y-core para tomar el DLL nuevo.`)
      } else {
        showToast("error", `Emulador no se compiló: ${payload?.error ?? "error desconocido"}. Instalá cmake 3.20+ y Visual Studio Build Tools 2022.`)
      }
    } catch { /* never crash UI */ }
  })

  // 3. Round-12.5: auto-install of cmake finished (success OR failure).
  // On success: short "Instalando dependencias…" toast since the build
  // chain fires next and produces its own toast. On failure: persistent
  // error with manual-install instructions.
  subscribeAppEventOnce("app:installToolchain:finished", (payload: any) => {
    try {
      const showToast = useToastStore.getState()?.showToast
      if (typeof showToast !== "function") return
      if (payload?.success) {
        const secs = Math.round((payload?.durationMs ?? 0) / 1000)
        showToast("info", `cmake instalado vía ${payload.installedFrom ?? "auto-install"} (${secs}s). Compilando emulador…`)
      } else {
        showToast(
          "error",
          `No se pudo instalar cmake automáticamente. ${payload?.error ?? "Error desconocido"}. Instalá manualmente desde cmake.org/download (marcá "Add to PATH") y reiniciá Y-core.`,
        )
      }
    } catch { /* never crash UI */ }
  })

  // 4. Round-12.5: live install progress — already streamed by main-process
  // logger to the /logs page via its own IPC (electron/logger.ts → log:entry).
  // We intentionally do NOT pipe from renderer to avoid double-logging and
  // to avoid coupling renderer stores to circular deps. Console.debug keeps
  // the line available for devtools only — no UI toast (would be spammy).
  subscribeAppEventOnce("app:installToolchain:progress", (payload: any) => {
    try {
      const line = payload?.line
      if (typeof line !== "string" || !line) return
      // eslint-disable-next-line no-console
      console.debug("[toolchain-install]", line)
    } catch { /* never crash UI */ }
  })
}
