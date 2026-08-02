// electron/modules/electron-context.ts
//
// Detecta si estamos corriendo dentro del main process de Electron (vs Node
// puro para la CLI Y-core, H1.8.b) y expone helpers portables entre los dos
// contextos.
//
// Cualquier módulo que hoy importe `app` o `BrowserWindow` directamente de
// 'electron' debería consumir estos helpers en su lugar para poder reusarse
// también desde la CLI sin requerir Electron cargado en runtime.
//
// H1.8.a: plumbing puro. Sin cambios funcionales en el código existente más
// allá del reemplazo de imports.

import path from 'path'
import os from 'os'

/** Interfaz mínima que necesitamos de Electron.app. Tipada a mano para
 *  evitar acoplar el resto del proyecto a `import type * as Electron from
 *  'electron'` y para detectar cambios en la API real. */
interface ElectronAppLike {
  // `name` relajado a string para no bloquear usos legítimos de cache,
  // sessionData, crashDumps, codeCache, etc. La API real valida en runtime.
  getPath(name: string): string
  getAppPath(): string
  isPackaged: boolean
}

interface ElectronWebContentsLike {
  isDestroyed(): boolean
  send(event: string, payload: unknown): void
}

interface ElectronBrowserWindowLike {
  getAllWindows(): Array<{ webContents: ElectronWebContentsLike }>
}

/** true cuando el módulo se carga dentro del main process de Electron. */
export const isElectronContext =
  typeof process !== 'undefined' && Boolean(process.versions?.electron)

let electronApp: ElectronAppLike | null = null
let electronBrowserWindow: ElectronBrowserWindowLike | null = null

if (isElectronContext) {
  try {
    // Lazy require: en Node puro este require lanza 'Cannot find module'
    // porque 'electron' no está disponible fuera de su runtime. Eso cae
    // dentro del catch y mantenemos las referencias en null, que es el
    // modo CLI.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const electron = require('electron')
    electronApp = electron.app
    electronBrowserWindow = electron.BrowserWindow
  } catch {
    electronApp = null
    electronBrowserWindow = null
  }
}

// ============================================================
// Path resolvers
// ============================================================

/** userData root con fallback chain Electron → CLI.
 *  En Electron: app.getPath('userData').
 *  En CLI: %LOCALAPPDATA%\Y-core (Win), ~/Library/Application Support/Y-core
 *  (macOS), ~/.local/share/Y-core (Linux). */
export function getUserDataDir(): string {
  if (electronApp) {
    try { return electronApp.getPath('userData') } catch { return fallbackUserData() }
  }
  return fallbackUserData()
}

function fallbackUserData(): string {
  const localAppData = process.env.LOCALAPPDATA ?? path.join(os.homedir(), '.local', 'share')
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'Y-core')
  }
  return path.join(localAppData, 'Y-core')
}

/** Subdirectorio donde se descargan los juegos. */
export function getLibraryRoot(): string {
  return path.join(getUserDataDir(), 'Library')
}

/** Subdirectorio donde se escriben logs (ycore.log + log-config.json). */
export function getLogDir(): string {
  return path.join(getUserDataDir(), 'logs')
}

/** HOME del usuario. En Electron via app.getPath('home'), en CLI os.homedir. */
export function getHome(): string {
  if (electronApp) {
    try { return electronApp.getPath('home') } catch { return os.homedir() }
  }
  return os.homedir()
}

/** true sólo cuando estamos en Electron y la app está empaquetada
 *  (production build). En dev o CLI siempre false. */
export function isElectronPackaged(): boolean {
  return Boolean(electronApp?.isPackaged)
}

/** App path. En Electron: app.getAppPath(). En CLI: process.cwd(). */
export function getAppPath(): string {
  if (electronApp) {
    try { return electronApp.getAppPath() } catch { return process.cwd() }
  }
  return process.cwd()
}

// ============================================================
// IPC emit
// ============================================================

/** Emite un evento IPC a todas las ventanas de Electron que sigan vivas.
 *  No-op en CLI puro.
 *
 *  Si `webContents.send` tira en una ventana destruida, se invoca `onError`
 *  con el error. Por defecto silencioso (matching el comportamiento
 *  histórico del logger). El caller decide si loguear. */
export function emitToRenderers(
  eventName: string,
  payload: unknown,
  onError?: (err: unknown) => void,
): void {
  if (!electronBrowserWindow) return
  for (const win of electronBrowserWindow.getAllWindows()) {
    if (win.webContents.isDestroyed()) continue
    try {
      win.webContents.send(eventName, payload)
    } catch (err) {
      if (onError) onError(err)
    }
  }
}

/** Versión que devuelve `true` si al menos una ventana recibió el evento.
 *  Usada por el logger cuando necesita saber si la notificación llegó. */
export function safeEmitToRenderers(eventName: string, payload: unknown): boolean {
  if (!electronBrowserWindow) return false
  let delivered = false
  for (const win of electronBrowserWindow.getAllWindows()) {
    if (win.webContents.isDestroyed()) continue
    try {
      win.webContents.send(eventName, payload)
      delivered = true
    } catch {
      // ignore — ventana cerrada entre getAllWindows() y send()
    }
  }
  return delivered
}
