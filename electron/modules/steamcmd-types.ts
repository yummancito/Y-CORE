// electron/modules/steamcmd-types.ts
//
// Tipos compartidos del dominio SteamCMD. Separados de parser + manager
// para evitar ciclos de import cuando parser crece (próximos hitos:
// más regexes, normalización de chunks binarios, etc).

export type SteamCmdState =
  | 'preparing'
  | 'downloading'
  | 'verifying'
  | 'committing'
  | 'allocating'
  | 'stalled'
  | 'done'
  | 'failed'

export interface SteamCmdProgress {
  appId: string
  state: SteamCmdState
  bytesDownloaded: number
  bytesTotal: number
  percent: number
  speedBytesPerSec: number
  etaSeconds: number
  stderrTail: string[]
  pid?: number
  startedAt?: number
  finishedAt?: number
  errorMessage?: string
  errorKey?: SteamCmdErrorKey
}

export interface SteamCmdInstallOptions {
  appId: string
  /**
   * Carpeta destino. Si se omite, el main process (H1.2 IPC) o el manager
   * en CLI directo usan `${userDataDir}/Library/${appId}`. El renderer no
   * conoce el absoluto y por eso mejor no pasarlo — default server-side.
   */
  installDir?: string
  /** Rama de beta opcional (e.g. 'experimental'). 'public' u omitido = default */
  betaBranch?: string
  /** Re-validar chunks; default true. Pasar false solo para updates incrementales. */
  validate?: boolean
}

/** Clave i18n que el renderer traducirá con `t()`. */
export type SteamCmdErrorKey =
  | 'errors.steamcmd.notFound'
  | 'errors.steamcmd.alreadyRunning'
  | 'errors.steamcmd.spawnFailed'
  | 'errors.steamcmd.installDirCreateFailed'
  | 'errors.steamcmd.notAnonymous'

export type StartResult =
  | { success: true; appId: string; pid: number; queued?: false }
  | { success: true; appId: string; pid: null; queued: true }
  | { success: false; error: string; errorKey: SteamCmdErrorKey }

export interface CancelResult {
  success: boolean
  appId: string
  error?: string
}
