// ============================================================================
// ycore-native — Puente Node ⇄ ycore.dll vía koffi (FFI)
// ----------------------------------------------------------------------------
// Envuelve el C ABI plano del DLL en una API TypeScript idiomática.
//
// Filosofía de errores (pedida por el usuario):
//   • El detalle TÉCNICO completo va SIEMPRE al log (logger + archivo).
//   • Al usuario se le devuelve un mensaje HUMANO y corto, nunca un stack.
//   • Cada error trae acciones: reintentar / reportar / cerrar.
//   • Si el DLL no está disponible, la app NO crashea: se degrada y el
//     llamador puede usar la implementación JS de siempre (steam-helpers).
// ============================================================================

import path from 'path'
import fs from 'fs'
import { app } from 'electron'
import { logger } from '../logger'

// ---------------------------------------------------------------------------
// Tipos públicos
// ---------------------------------------------------------------------------

/** Códigos de estado que devuelve el DLL (deben coincidir con ycore.h). */
export enum YCoreStatus {
  OK = 0,
  INVALID_ARG = 1,
  NOT_FOUND = 2,
  IO = 3,
  PARSE = 4,
  ACCESS_DENIED = 5,
  BUFFER_TOO_SMALL = 6,
  INTERNAL = 7,
}

/** Acción que la UI puede ofrecer al usuario ante un error. */
export type ErrorAction = 'retry' | 'report' | 'close'

/**
 * Error de la capa nativa, pensado para mostrarse en la UI.
 * `userMessage` es lo ÚNICO que debe verse en pantalla.
 * `technical` va al log y al reporte de Discord, nunca al usuario.
 */
export class YCoreNativeError extends Error {
  readonly code: YCoreStatus | 'UNAVAILABLE'
  /** Mensaje corto y humano, apto para mostrar en un modal. */
  readonly userMessage: string
  /** Detalle técnico completo — para logs y reporte, NO para la UI. */
  readonly technical: string
  /** Botones que tiene sentido ofrecer para este error. */
  readonly actions: ErrorAction[]
  /** Operación que falló, ej. "listar juegos instalados". */
  readonly operation: string

  constructor(opts: {
    code: YCoreStatus | 'UNAVAILABLE'
    userMessage: string
    technical: string
    actions: ErrorAction[]
    operation: string
  }) {
    super(opts.technical)
    this.name = 'YCoreNativeError'
    this.code = opts.code
    this.userMessage = opts.userMessage
    this.technical = opts.technical
    this.actions = opts.actions
    this.operation = opts.operation
  }

  /** Forma serializable para mandar por IPC al renderer. */
  toIpc() {
    return {
      success: false as const,
      code: this.code,
      operation: this.operation,
      // Solo esto se muestra al usuario:
      message: this.userMessage,
      actions: this.actions,
      // Se manda para que el botón "Reportar" tenga qué enviar,
      // pero la UI NO debe renderizarlo.
      technical: this.technical,
    }
  }
}

export interface InstalledApp {
  appId: string
  name: string
  installDir: string
  sizeOnDisk: number
  lastPlayed: number
  libraryPath: string
}

// ---------------------------------------------------------------------------
// Mensajes humanos por código de error
// ---------------------------------------------------------------------------

/**
 * Traduce un código técnico a algo que una persona entiende, con las acciones
 * que tienen sentido. Nada de stacks ni rutas internas aquí.
 */
function humanize(
  code: YCoreStatus | 'UNAVAILABLE',
  operation: string
): { userMessage: string; actions: ErrorAction[] } {
  switch (code) {
    case 'UNAVAILABLE':
      return {
        userMessage:
          'No se pudo cargar el componente interno de Y-core. La app seguirá funcionando en modo compatible.',
        actions: ['report', 'close'],
      }
    case YCoreStatus.NOT_FOUND:
      return {
        userMessage:
          'No encontramos tu instalación de Steam. Revisa que Steam esté instalado, o selecciona su carpeta manualmente en Ajustes.',
        actions: ['retry', 'close'],
      }
    case YCoreStatus.ACCESS_DENIED:
      return {
        userMessage:
          'Windows no nos dejó acceder a los archivos de Steam. Prueba a abrir Y-core como administrador.',
        actions: ['retry', 'report', 'close'],
      }
    case YCoreStatus.IO:
      return {
        userMessage:
          'Hubo un problema al leer los archivos de Steam. Puede que un archivo esté en uso o dañado.',
        actions: ['retry', 'report', 'close'],
      }
    case YCoreStatus.PARSE:
      return {
        userMessage:
          'Un archivo de configuración de Steam parece estar dañado. Verificar los archivos desde Steam suele arreglarlo.',
        actions: ['retry', 'report', 'close'],
      }
    case YCoreStatus.INVALID_ARG:
    case YCoreStatus.BUFFER_TOO_SMALL:
    case YCoreStatus.INTERNAL:
    default:
      return {
        userMessage: `Algo salió mal al ${operation}. Puedes reintentar o enviarnos un reporte para que lo arreglemos.`,
        actions: ['retry', 'report', 'close'],
      }
  }
}

// ---------------------------------------------------------------------------
// Carga del DLL (perezosa, tolerante a fallos)
// ---------------------------------------------------------------------------

interface NativeBinding {
  version: () => string
  lastError: () => string
  findSteamPath: (out: (string | null)[]) => number
  getLibraryFolders: (out: (string | null)[]) => number
  listInstalledApps: (out: (string | null)[]) => number
  findManifest: (appId: string, out: (string | null)[]) => number
  vdfToJson: (text: string, out: (string | null)[]) => number
  vdfFileToJson: (p: string, out: (string | null)[]) => number
  isProcessRunning: (exe: string, out: number[]) => number
}

let binding: NativeBinding | null = null
let loadAttempted = false
let loadFailureReason = ''

/** Rutas donde puede vivir el DLL, en orden: empaquetado → dev. */
function candidateDllPaths(): string[] {
  const paths: string[] = []
  try {
    if (app.isPackaged) {
      paths.push(path.join(process.resourcesPath, 'native', 'ycore.dll'))
      paths.push(path.join(process.resourcesPath, 'ycore.dll'))
    }
  } catch {
    // `app` puede no estar listo; no es fatal.
  }
  const root = path.join(__dirname, '..', '..')
  paths.push(path.join(root, 'native', 'ycore', 'build', 'ycore.dll'))
  paths.push(path.join(root, 'resources', 'native', 'ycore.dll'))
  return paths
}

/**
 * Carga el DLL una sola vez. Nunca lanza: si falla, deja `binding` en null y
 * registra el motivo para que los llamadores puedan degradar con elegancia.
 */
function ensureLoaded(): boolean {
  if (loadAttempted) return binding !== null
  loadAttempted = true

  if (process.platform !== 'win32') {
    loadFailureReason = `Plataforma no soportada: ${process.platform} (el DLL es solo Windows)`
    logger.info(`[ycore-native] ${loadFailureReason}`, 'native')
    return false
  }

  let dllPath = ''
  for (const p of candidateDllPaths()) {
    if (fs.existsSync(p)) { dllPath = p; break }
  }
  if (!dllPath) {
    loadFailureReason = `ycore.dll no encontrado. Rutas probadas: ${candidateDllPaths().join(' | ')}`
    logger.warn(`[ycore-native] ${loadFailureReason}`, 'native')
    return false
  }

  try {
    // require perezoso: si koffi falta, no queremos romper el arranque.
    const koffi = require('koffi')
    const lib = koffi.load(dllPath)

    // El DLL entrega strings en heap propio. `disposable` hace que koffi los
    // decodifique a string de JS y luego llame a ycore_free_string por nosotros
    // — sin esto cada llamada filtraría memoria (verificado con test de estrés).
    const freeStr = lib.func('void ycore_free_string(void*)')
    koffi.disposable('YStr', 'char*', freeStr)

    binding = {
      version: lib.func('const char* ycore_version()'),
      lastError: lib.func('const char* ycore_last_error()'),
      findSteamPath: lib.func('int ycore_find_steam_path(_Out_ YStr* out)'),
      getLibraryFolders: lib.func('int ycore_get_library_folders(_Out_ YStr* out)'),
      listInstalledApps: lib.func('int ycore_list_installed_apps(_Out_ YStr* out)'),
      findManifest: lib.func('int ycore_find_manifest(const char* id, _Out_ YStr* out)'),
      vdfToJson: lib.func('int ycore_vdf_to_json(const char* t, _Out_ YStr* out)'),
      vdfFileToJson: lib.func('int ycore_vdf_file_to_json(const char* p, _Out_ YStr* out)'),
      isProcessRunning: lib.func('int ycore_is_process_running(const char* e, _Out_ int* out)'),
    }

    logger.info(`[ycore-native] DLL cargado v${binding.version()} desde ${dllPath}`, 'native')
    return true
  } catch (err: any) {
    binding = null
    loadFailureReason = `Fallo al cargar ${dllPath}: ${err?.message ?? err}`
    // Detalle completo al log; el usuario nunca ve esto.
    logger.error(`[ycore-native] ${loadFailureReason}\n${err?.stack ?? ''}`, 'native')
    return false
  }
}

/** ¿Está el DLL nativo disponible? Útil para decidir si usar el fallback JS. */
export function isNativeAvailable(): boolean {
  return ensureLoaded()
}

/** Versión del DLL, o null si no está disponible. */
export function getNativeVersion(): string | null {
  if (!ensureLoaded() || !binding) return null
  try {
    return binding.version()
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Helpers internos
// ---------------------------------------------------------------------------

function unavailableError(operation: string): YCoreNativeError {
  const { userMessage, actions } = humanize('UNAVAILABLE', operation)
  return new YCoreNativeError({
    code: 'UNAVAILABLE',
    operation,
    userMessage,
    technical: loadFailureReason || 'El componente nativo no está disponible',
    actions,
  })
}

function statusError(code: number, operation: string): YCoreNativeError {
  // El mensaje técnico del DLL es específico del hilo actual; lo leemos ya.
  let detail = ''
  try {
    detail = binding?.lastError() ?? ''
  } catch {
    detail = ''
  }
  const st = code as YCoreStatus
  const { userMessage, actions } = humanize(st, operation)
  const technical = `[${YCoreStatus[st] ?? code}] ${detail || 'sin detalle del DLL'} (op: ${operation})`

  // SIEMPRE al log, con todo el detalle.
  logger.error(`[ycore-native] ${technical}`, 'native')

  return new YCoreNativeError({ code: st, operation, userMessage, technical, actions })
}

/**
 * Ejecuta una función del DLL que devuelve un string por out-param.
 * El tipo `YStr` (koffi.disposable) ya libera la memoria del DLL al decodificar,
 * así que aquí solo traducimos el estado a error o al valor.
 */
function callStringOut(
  fn: (out: (string | null)[]) => number,
  operation: string
): string {
  if (!ensureLoaded() || !binding) throw unavailableError(operation)

  const out: (string | null)[] = [null]
  let status: number
  try {
    status = fn(out)
  } catch (err: any) {
    const technical = `Excepción en FFI durante "${operation}": ${err?.message ?? err}`
    logger.error(`[ycore-native] ${technical}\n${err?.stack ?? ''}`, 'native')
    const { userMessage, actions } = humanize(YCoreStatus.INTERNAL, operation)
    throw new YCoreNativeError({
      code: YCoreStatus.INTERNAL, operation, userMessage, technical, actions,
    })
  }

  if (status !== YCoreStatus.OK) throw statusError(status, operation)

  const value = out[0]
  if (typeof value !== 'string') throw statusError(YCoreStatus.INTERNAL, operation)
  return value
}

function parseJson<T>(raw: string, operation: string): T {
  try {
    return JSON.parse(raw) as T
  } catch (err: any) {
    const technical = `JSON inválido del DLL en "${operation}": ${err?.message ?? err} — payload: ${raw.slice(0, 200)}`
    logger.error(`[ycore-native] ${technical}`, 'native')
    const { userMessage, actions } = humanize(YCoreStatus.PARSE, operation)
    throw new YCoreNativeError({
      code: YCoreStatus.PARSE, operation, userMessage, technical, actions,
    })
  }
}

// ---------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------

/** Ruta de instalación de Steam. */
export function findSteamPath(): string {
  return callStringOut((out) => binding!.findSteamPath(out), 'detectar la carpeta de Steam')
}

/** Todas las carpetas …/steamapps conocidas por Steam. */
export function getLibraryFolders(): string[] {
  const raw = callStringOut((out) => binding!.getLibraryFolders(out), 'leer las bibliotecas de Steam')
  return parseJson<string[]>(raw, 'leer las bibliotecas de Steam')
}

/** Juegos instalados en todas las bibliotecas. */
export function listInstalledApps(): InstalledApp[] {
  const op = 'listar los juegos instalados'
  const raw = callStringOut((out) => binding!.listInstalledApps(out), op)
  return parseJson<InstalledApp[]>(raw, op)
}

/** Ruta del appmanifest_<appId>.acf. */
export function findManifest(appId: string): string {
  return callStringOut((out) => binding!.findManifest(appId, out), `localizar el juego ${appId}`)
}

/** Parsea texto VDF/ACF a objeto. */
export function vdfToJson<T = Record<string, unknown>>(vdfText: string): T {
  const op = 'leer la configuración de Steam'
  const raw = callStringOut((out) => binding!.vdfToJson(vdfText, out), op)
  return parseJson<T>(raw, op)
}

/** Lee y parsea un archivo VDF/ACF del disco. */
export function vdfFileToJson<T = Record<string, unknown>>(filePath: string): T {
  const op = 'leer un archivo de configuración de Steam'
  const raw = callStringOut((out) => binding!.vdfFileToJson(filePath, out), op)
  return parseJson<T>(raw, op)
}

/** ¿Hay un proceso con ese nombre corriendo? ej. "steam.exe" */
export function isProcessRunning(exeName: string): boolean {
  const op = 'comprobar si el juego está abierto'
  if (!ensureLoaded() || !binding) throw unavailableError(op)

  const out: number[] = [0]
  let status: number
  try {
    status = binding.isProcessRunning(exeName, out)
  } catch (err: any) {
    const technical = `Excepción en FFI durante "${op}": ${err?.message ?? err}`
    logger.error(`[ycore-native] ${technical}`, 'native')
    const { userMessage, actions } = humanize(YCoreStatus.INTERNAL, op)
    throw new YCoreNativeError({ code: YCoreStatus.INTERNAL, operation: op, userMessage, technical, actions })
  }

  if (status !== YCoreStatus.OK) throw statusError(status, op)
  return out[0] === 1
}

// ---------------------------------------------------------------------------
// Envoltorio seguro: nunca lanza, degrada al fallback
// ---------------------------------------------------------------------------

/**
 * Ejecuta una operación nativa y, si falla, registra el detalle y devuelve el
 * resultado del fallback JS. Pensado para los caminos donde la app DEBE seguir
 * funcionando aunque el DLL falle (listar juegos, detectar Steam…).
 */
export function withFallback<T>(
  nativeFn: () => T,
  fallbackFn: () => T,
  operation: string
): T {
  try {
    return nativeFn()
  } catch (err: any) {
    const technical = err instanceof YCoreNativeError ? err.technical : (err?.message ?? String(err))
    logger.warn(
      `[ycore-native] "${operation}" falló en modo nativo, usando implementación de respaldo. Detalle: ${technical}`,
      'native'
    )
    return fallbackFn()
  }
}
