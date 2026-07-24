// ============================================================================
// local-steam-emulator.ts — Bridge Node ⇄ ycore_steam.dll vía koffi
// ----------------------------------------------------------------------------
// Esta capa carga ycore_steam.dll (clean-room Goldberg-style Steam API
// emulator, compilada por scripts/build-ycore-steam.bat) y la expone al
// resto de Y-core para:
//   1. Patch del juego post-descarga (reemplazar/copiar la DLL al game folder).
//   2. Diagnóstico desde Settings (¿cuál DLL usamos?, ¿qué versión?).
//   3. Pre-flight: ¿el juego tiene los exports mínimos que podemos stubear?
//
// Filosofía (mismo patron que ycore-native.ts):
//   • Nunca lanza. Si la DLL falta o falla al cargar, retorna null y el
//     caller degrada al fallback (OnlineFix + stplug-in legacy).
//   • Carga perezosa, un solo attempt por proceso.
//   • No residualiza memoria entre versiones de DLL.
// ============================================================================

import path from 'path'
import fs from 'fs'
import { app } from 'electron'
import { logger } from '../logger'

// ---------------------------------------------------------------------------
// Tipos públicos
// ---------------------------------------------------------------------------

export interface LocalSteamEmulatorInfo {
  dllPath: string | null
  version: string | null
  loadedAt: string | null
  available: boolean
  failureReason: string | null
}

export interface LocalSteamEmulatorDiagnostics {
  isAvailable: boolean
  dllPath: string | null
  version: string | null
  shortSha: string | null
  appVersion: string | null
  failureReason: string | null
}

interface LocalSteamEmulatorBinding {
  version: () => string
  shortSha: (out: (string | null)[]) => number
  init: () => number
  shutdown: () => void
  restartAppIfNecessary: () => number
  runCallbacks: () => void
  getHSteamUser: () => number
  getHSteamPipe: () => number
  /** Flat accessor para GetAppId — ABI-safe, no depende de slot position. */
  getAppId: () => number
  ifaceUser: () => Buffer
  ifaceUtils: () => Buffer
  ifaceApps: () => Buffer
  ifaceClient: () => Buffer
}

// ---------------------------------------------------------------------------
// Estado de carga
// ---------------------------------------------------------------------------

let binding: LocalSteamEmulatorBinding | null = null
let loadAttempted = false
let loadFailureReason = ''
let loadedDllPath: string | null = null

// ---------------------------------------------------------------------------
// Candidate paths
// ---------------------------------------------------------------------------

/**
 * Dónde puede vivir la DLL, en orden de prioridad:
 *   1. production: resourcesPath/native/vX.Y.Z/ycore_steam.dll (versioned match)
 *   2. production: resourcesPath/native/ycore_steam.dll (legacy)
 *   3. dev: <repoRoot>/resources/native/ycore_steam.dll
 *   4. dev build: <repoRoot>/native/ycore_steam/build/Release/ycore_steam.dll
 *
 * Mismo patron que ycore-native.ts pero con namespace propio (`ycore_steam/`
 * vs `ycore/`) para que no compitan.
 */
function candidateDllPaths(): string[] {
  const paths: string[] = []
  try {
    if (app.isPackaged) {
      const verDir = path.join(process.resourcesPath, 'native', `v${app.getVersion()}`)
      paths.push(path.join(verDir, 'ycore_steam.dll'))
      paths.push(path.join(process.resourcesPath, 'native', 'ycore_steam.dll'))
    }
  } catch {
    // `app` puede no estar listo todavía.
  }
  const root = path.join(__dirname, '..', '..')
  paths.push(path.join(root, 'resources', 'native', 'ycore_steam.dll'))
  paths.push(
    path.join(root, 'native', 'ycore_steam', 'build', 'Release', 'ycore_steam.dll'),
  )
  return paths
}

/** Path al DLL 32-bit. v5: lookup por convención Similar al candidato x64 pero suffix x86. */
function candidateX86DllPath(): string | null {
  const candidates: string[] = []
  try {
    if (app.isPackaged) {
      candidates.push(
        path.join(process.resourcesPath, 'native', 'ycore_steam_x86.dll'),
      )
    }
  } catch {
    // ignore
  }
  const root = path.join(__dirname, '..', '..')
  candidates.push(path.join(root, 'resources', 'native', 'ycore_steam_x86.dll'))
  candidates.push(
    path.join(root, 'native', 'ycore_steam', 'build_x86', 'Release', 'ycore_steam_x86.dll'),
  )
  for (const c of candidates) {
    if (fs.existsSync(c)) return c
  }
  return null
}

// ---------------------------------------------------------------------------
// Carga perezosa y tolerante a fallos
// ---------------------------------------------------------------------------

function ensureLoaded(): boolean {
  if (loadAttempted) return binding !== null

  // v1: solo Windows. Igual que ycore-native.ts.
  if (process.platform !== 'win32') {
    loadFailureReason = `Plataforma no soportada: ${process.platform} (clean-room emulator v1 solo Windows)`
    logger.info(`[local-steam-emulator] ${loadFailureReason}`, 'emulator')
    loadAttempted = true
    return false
  }

  let dllPath = ''
  for (const p of candidateDllPaths()) {
    if (fs.existsSync(p)) {
      dllPath = p
      break
    }
  }
  if (!dllPath) {
    loadFailureReason = `ycore_steam.dll no encontrada. Rutas probadas: ${candidateDllPaths().join(' | ')}. ¿Corriste scripts/build-ycore-steam.bat?`
    logger.info(`[local-steam-emulator] ${loadFailureReason}`, 'emulator')
    loadAttempted = true
    return false
  }

  loadedDllPath = dllPath

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const koffi = require('koffi')
    const lib = koffi.load(dllPath)

    // short_sha retorna un string C en heap propio — disposable lo libera.
    const freeStr = lib.func('void ycore_steam_free_string(void*)')
    koffi.disposable('EmuStr', 'char*', freeStr)

    binding = {
      version: lib.func('const char* ycore_steam_version()'),
      shortSha: lib.func('int ycore_steam_short_sha(_Out_ EmuStr* out)'),
      init: lib.func('int ycore_steam_init()'),
      shutdown: lib.func('void ycore_steam_shutdown()'),
      restartAppIfNecessary: lib.func('int ycore_steam_restart_app_if_necessary()'),
      runCallbacks: lib.func('void ycore_steam_run_callbacks()'),
      getHSteamUser: lib.func('unsigned int ycore_steam_get_h_steam_user()'),
      getHSteamPipe: lib.func('unsigned int ycore_steam_get_h_steam_pipe()'),
      /** Flat accessor para GetAppId — ABI-safe. */
      getAppId: lib.func('unsigned int ycore_steam_get_app_id()'),
      ifaceUser: lib.func('const void* ycore_steam_iface_user()'),
      ifaceUtils: lib.func('const void* ycore_steam_iface_utils()'),
      ifaceApps: lib.func('const void* ycore_steam_iface_apps()'),
      ifaceClient: lib.func('const void* ycore_steam_iface_client()'),
    }

    logger.info(
      `[local-steam-emulator] DLL cargada v${binding.version()} desde ${dllPath}`,
      'emulator',
    )
    return true
  } catch (err: any) {
    binding = null
    loadFailureReason = `Fallo al cargar ${dllPath}: ${err?.message ?? err}`
    logger.error(
      `[local-steam-emulator] ${loadFailureReason}\n${err?.stack ?? ''}`,
      'emulator',
    )
    return false
  } finally {
    loadAttempted = true
  }
}

// ---------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------

export function isLocalSteamEmulatorAvailable(): boolean {
  return ensureLoaded()
}

export function getLocalSteamEmulatorVersion(): string | null {
  if (!ensureLoaded() || !binding) return null
  try {
    return binding.version()
  } catch {
    return null
  }
}

/**
 * Patch del juego: copia nuestra DLL al lado del ejecutable del juego
 * Y genera steam_appid.txt si no existe. Devuelve éxito/fracaso.
 *
 * Después de llamar a esto, game.exe cargará nuestro ycore_steam.dll
 * (renombrado a steam_api64.dll / steam_api.dll según PE machine) en
 * lugar del real. Todo el flow de OnlineFix/post-process entra acá.
 *
 * IMPORTANTE: solo llamar DESPUÉS de que el juego esté descargado en
 * ${userDataDir}/Library/<appId>/. No aplica al download path.
 */
export function patchGameFolder(
  gameFolder: string,
  appId: string,
): {
  success: boolean
  error?: string
  warnings?: string[]
  patchedAt?: string
} {
  if (!ensureLoaded() || !binding) {
    return {
      success: false,
      error: loadFailureReason || 'ycore_steam.dll no disponible',
    }
  }
  if (!gameFolder || !fs.existsSync(gameFolder)) {
    return { success: false, error: `gameFolder inválido: ${gameFolder}` }
  }

  try {
    // v1: solo 64-bit. Copiamos con el nombre canónico Steam API.
    // Games 64-bit buscan steam_api64.dll al lado del ejecutable.
    // Games 32-bit buscan steam_api.dll — no los cubrimos en v1.
    //
    // Limitación documentada: si el usuario intenta parchear un juego 32-bit,
    // el copy succeed pero el juego fallará LoadLibrary con un mensaje
    // claro. Mejor que copiar la DLL 64-bit como steam_api.dll y romper
    // juegos 64-bit al mismo tiempo.
    //
    // v2: detectar PE header del Game.exe y elegir entre 32/64.
    const warnings: string[] = []
    const src = loadedDllPath!
    const dst64 = path.join(gameFolder, 'steam_api64.dll')

    // v1 detection best-effort: si el Game.exe en gameFolder es 32-bit,
    // emit warning y no lo parchamos (no tenemos DLL de 32 bits todavía).
    const gameExeFilename = fs.readdirSync(gameFolder).find(f =>
      f.toLowerCase().endsWith('.exe'),
    )
    if (gameExeFilename) {
      const gameExe = path.join(gameFolder, gameExeFilename)
      try {
        // v5 (round-8 fix): PE spec dice que IMAGE_FILE_HEADER.Machine vive
        // inmediatamente después de la firma "PE\0\0" (4 bytes), es decir
        // en peOffset + 4 — NO peOffset + 4 + 20 como escribimos en v3.5.
        // +20 leía OptionalHeader.Magic (0x10B/0x20B) en lugar del Machine.
        //
        // Bounds: e_lfanew debe dejar espacio para PE_sig(4) + COFF_HEADER(20)
        // dentro de los 4096 bytes leídos. Con gameExeFilename presente el
        // check es redundante pero barato.
        if (fs.existsSync(gameExe) && fs.statSync(gameExe).isFile()) {
          const fd = fs.openSync(gameExe, 'r')
          try {
            const buf = Buffer.alloc(4096)
            fs.readSync(fd, buf, 0, buf.length, 0)
            const peOffset = buf.readUInt32LE(0x3C)
            if (peOffset + 4 + 24 <= buf.length) {
              const sigOk = buf.slice(peOffset, peOffset + 4).toString('ascii') === 'PE\0\0'
              if (sigOk) {
                const machine = buf.readUInt16LE(peOffset + 4)
                if (machine === 0x14c) {
                  warnings.push('Game.exe detectado como 32-bit (i386); v5 solo soporta 64-bit (AMD64)')
                }
              }
            }
          } finally {
            fs.closeSync(fd)
          }
        }
      } catch {
        // PE header parse failed — fall through to copy silently.
      }
    }

    // v5: 32-bit games buscan steam_api.dll (no steam_api64.dll). Si el
    // PE detected 32-bit, en vez de abortar probamos con el DLL x86 si
    // está empaquetado (build cross-compile). Si no está, mantenemos el
    // copy del x64 como steam_api64.dll — games 32-bit lo ignoran y caen
    // al LoadLibrary fail sin romper el conjunto.
    const x86Src = candidateX86DllPath()
    const isX86 = warnings.some(w => w.includes('32-bit'))
    const targetDllName = 'steam_api64.dll'
    const finalSrc = isX86 && x86Src ? x86Src : src

    const dstPath = isX86 && x86Src
      ? path.join(gameFolder, 'steam_api.dll')
      : dst64
    fs.copyFileSync(finalSrc, dstPath)

    // steam_appid.txt: games lo leen al boot para determinar appId sin
    // consultar a Steam.
    const appIdFile = path.join(gameFolder, 'steam_appid.txt')
    if (!fs.existsSync(appIdFile)) {
      fs.writeFileSync(appIdFile, appId, 'utf-8')
    }

    return {
      success: true,
      warnings: warnings.length > 0 ? warnings : undefined,
      patchedAt: new Date().toISOString(),
    }
  } catch (err: any) {
    return {
      success: false,
      error: err?.message ?? String(err),
    }
  }
}

/**
 * Diagnóstico único — mismo shape que `ycore-native.getNativeDiagnostics()`.
 * Single source of truth para Settings → Diagnóstico + IPC handlers.
 */
export function getLocalSteamEmulatorDiagnostics(): LocalSteamEmulatorDiagnostics {
  const loaded = ensureLoaded()
  const appVer = (() => {
    try {
      return app.getVersion()
    } catch {
      return null
    }
  })()

  let sha: string | null = null
  if (loaded && binding) {
    try {
      const out: (string | null)[] = [null]
      binding.shortSha(out)
      sha = out[0]?.slice(0, 12) ?? null
    } catch {
      sha = null
    }
  }

  return {
    isAvailable: loaded && binding !== null,
    dllPath: loadedDllPath,
    version: loaded ? getLocalSteamEmulatorVersion() : null,
    shortSha: sha,
    appVersion: appVer,
    failureReason: loaded ? null : loadFailureReason || null,
  }
}

/**
 * @deprecated Use `getLocalSteamEmulatorDiagnostics()` — single source of
 * truth. Kept as a slim alias for one minor; callers should migrate.
 */
export function getInfo(): LocalSteamEmulatorInfo {
  const diag = getLocalSteamEmulatorDiagnostics()
  return {
    available: diag.isAvailable,
    dllPath: diag.dllPath,
    version: diag.version,
    loadedAt: diag.isAvailable ? new Date().toISOString() : null,
    failureReason: diag.failureReason,
  }
}
