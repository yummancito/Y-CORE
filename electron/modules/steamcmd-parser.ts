// electron/modules/steamcmd-parser.ts
//
// Helpers puros de parsing para SteamCMD. Sin dependencias de procesos, IO,
// ni Electron — son funciones determinísticas que reciben input y devuelven
// output. Esto permite:
//   1. Testearlas sin spawn ni fs.
//   2. Reutilizarlas en otros lugares sin arrastrar todo steamcmd-manager.
//   3. Mantener la superficie pública de steamcmd-manager limpia (sin
//      re-exports __test__ que ensucian el bundle y la API pública).
//
// steamcmd-manager.ts las importa para uso interno. Los tests las importan
// directamente desde acá. Si el manager cambia de implementación en el
// futuro, los tests siguen pasando porque apuntan al parser module.

import type { SteamCmdState } from './steamcmd-types'

/**
 * Mapea un string de "Update state (0x...) XXX" a un estado de UI. La
 * implementación actual busca substrings; si Valve agrega variantes en el
 * futuro (ej. "Pre-Allocating"), ajustar el orden de los includes.
 *
 * IMPORTANTE: 'preallocat' se chequea ANTES que 'allocat' porque
 * "Preallocating" contiene ambos substrings. Sin ese orden, "Preallocating"
 * mapea a 'allocating' y el renderer muestra "reservando disco" cuando
 * SteamCMD todavía está preparando los archivos.
 */
export function classifyUpdateState(raw: string, prev: SteamCmdState): SteamCmdState {
  const r = raw.toLowerCase()
  if (r.includes('download')) return 'downloading'
  if (r.includes('verify')) return 'verifying'
  if (r.includes('commit')) return 'committing'
  if (r.includes('preallocat')) return 'preparing'
  if (r.includes('allocat')) return 'allocating'
  return prev
}

/**
 * Extrae un mensaje de error legible de una línea cruda de stderr.
 *   - trim() PRIMERO: la línea cruda llega con whitespace alrededor. Si
 *     no trimamos antes, el replace con /^ERROR!/i no encuentra el prefix
 *     cuando hay espacios leading (e.g. "  ERROR! algo" → no strip).
 *   - Cap a 240 chars para no inflar el payload IPC.
 */
export function extractErrorMessage(line: string): string {
  return line.trim().replace(/^ERROR!\s*/i, '').trim().slice(0, 240)
}

/** Opciones de install que buildArgs consume. */
export interface BuildArgsOptions {
  appId: string
  installDir: string
  betaBranch?: string
  validate?: boolean
}

/**
 * Construye los argumentos que SteamCMD acepta via stdin.
 *   +force_install_dir DIR (requerido — DEBE ir antes de +login; SteamCMD
 *                           rechaza el login con "Please use
 *                           force_install_dir before logon!" si no)
 *   +login anonymous       (siempre anónimo — riesgo de ban con cuenta real)
 *   +app_update APPID      (descarga/actualiza el juego)
 *   validate               (re-valida chunks; default true)
 *   +quit                  (cierra limpio después de instalar)
 *
 * Runtime guard: si installDir está vacío, throw explícito en lugar de
 * enviar `+force_install_dir ''` a SteamCMD (silencioso y debug-eado horrible).
 * El único caller real es startJob que siempre resuelve un installDir antes
 * de llegar acá; el guard atrapa regresiones futuras y misuse de tests.
 */
export function buildArgs(opts: BuildArgsOptions): string[] {
  if (!opts.installDir) {
    throw new Error('buildArgs: installDir is required (startJob contract violated)')
  }
  const args: string[] = ['+force_install_dir', opts.installDir, '+login', 'anonymous']
  if (opts.betaBranch && opts.betaBranch !== 'public') {
    args.push('-beta', opts.betaBranch)
  }
  args.push('+app_update', opts.appId)
  if (opts.validate !== false) {
    args.push('validate')
  }
  args.push('+quit')
  return args
}
