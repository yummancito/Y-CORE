#!/usr/bin/env node
// Y-core CLI — H1.8.b
//
// Router de subcomandos para uso en terminal. NO requiere Electron cargado.
// Reutiliza electron-context, steamcmd-manager y logger para tener la misma
// lógica que usa el renderer pero sin pasar por IPC.
//
// Modos de salida:
//   default              → progresiva (humana): estado | bytes | % | ETA | speed
//   --no-progress        → silencia progreso; activa JSONL (1 línea JSON por evento)
//   --jsonl              → fuerza JSONL (alternativa explícita)
//
// Subcomandos:
//   --help / -h          texto de ayuda
//   status               paths resueltos + queue snapshot
//   install <appId>      start SteamCMD + poll hasta done/failed
//   cancel <appId>       cancelación limpia
//   queue list           alias detallado de status
//   fetch-steamcmd       placeholder (H1.5)
//   logs [--tail=N]      tail de ycore.log
//
// Salida cuando --no-progress o --jsonl estén presentes: 1 línea JSON por evento
// (pipeable a `jq`).

import path from 'path'
import fs from 'fs'
import { logger } from '../electron/logger'
import {
  isElectronContext,
  isElectronPackaged,
  getUserDataDir,
  getLibraryRoot,
  getLogDir,
  getHome,
  getAppPath,
} from '../electron/modules/electron-context'
import {
  startSteamCmdInstall,
  cancelSteamCmdInstall,
  isSteamCmdAvailable,
  getSteamCmdPath,
  getActiveJobs,
  getActiveJobFor,
  getTotalActiveBytes,
} from '../electron/modules/steamcmd-manager'
import type {
  SteamCmdProgress,
  StartResult,
  CancelResult,
} from '../electron/modules/steamcmd-manager'

const VERSION = '0.1.0-h1.8.b'
const POLL_INTERVAL_MS = 250
const PRINT_INTERVAL_MS = 1000

// ============================================================
// Flag parsing (sin deps externas)
// ============================================================

type InstallMethod = 'steamcmd' | 'client' | 'auto'

interface Flags {
  noProgress: boolean
  jsonl: boolean
  method: InstallMethod
  beta: string | undefined
  noValidate: boolean
  tail: number
  help: boolean
}

function parseFlags(args: string[]): Flags {
  const flags: Flags = {
    noProgress: false,
    jsonl: false,
    method: 'auto',
    beta: undefined,
    noValidate: false,
    tail: 50,
    help: false,
  }
  for (const arg of args) {
    if (arg === '--no-progress') {
      flags.noProgress = true
      flags.jsonl = true
    } else if (arg === '--jsonl') {
      flags.jsonl = true
    } else if (arg === '--no-validate') {
      flags.noValidate = true
    } else if (arg === '--help' || arg === '-h') {
      flags.help = true
    } else if (arg.startsWith('--method=')) {
      const v = arg.slice('--method='.length)
      if (v === 'steamcmd' || v === 'client' || v === 'auto') {
        flags.method = v
      }
    } else if (arg.startsWith('--beta=')) {
      flags.beta = arg.slice('--beta='.length)
    } else if (arg.startsWith('--tail=')) {
      const n = parseInt(arg.slice('--tail='.length), 10)
      if (!Number.isNaN(n) && n > 0) flags.tail = n
    }
  }
  return flags
}

function isJsonl(flags: Flags): boolean {
  return flags.jsonl || flags.noProgress
}

// ============================================================
// Help
// ============================================================

const HELP = `ycore v${VERSION} — command line interface de Y-core

Uso:
  ycore install <appId> [--method=...] [--beta=...] [--no-validate]
  ycore status
  ycore queue list
  ycore cancel <appId>
  ycore fetch-steamcmd
  ycore logs [--tail=N]

Flags:
  --no-progress           silencia progreso; activa JSONL
  --jsonl                 fuerza salida JSONL
  --no-validate           skip 'validate' en SteamCMD (updates incrementales)
  --method=steamcmd|client|auto   método de instalación (default: auto)
  --beta=<branch>         beta branch en SteamCMD (e.g. experimental)
  --tail=N                líneas a mostrar en 'logs' (default 50)
  --help, -h              este mensaje

Salida por default: progresiva con bytes/ETA/estado.
Salida con --no-progress / --jsonl: 1 línea JSON por evento.

Path por defecto (CLI puro):
  userData = ${getUserDataDir()}
  Library  = ${getLibraryRoot()}
  logs     = ${getLogDir()}

Ejemplos:
  ycore install 1245620
  ycore install 1245620 --method=client
  ycore status
  ycore cancel 1245620
`

function printHelp(): void {
  console.log(HELP)
}

// ============================================================
// Formatting helpers
// ============================================================

function formatBytes(n: number): string {
  if (!n || n <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let i = 0
  let v = n
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  const fixed = v >= 100 ? 0 : v >= 10 ? 1 : 2
  return `${v.toFixed(fixed)} ${units[i]}`
}

function formatEta(seconds: number): string {
  if (!seconds || !isFinite(seconds) || seconds <= 0) return '--'
  if (seconds < 60) return `${Math.ceil(seconds)}s`
  const m = Math.floor(seconds / 60)
  const s = Math.ceil(seconds % 60)
  if (m < 60) return `${m}m${s.toString().padStart(2, '0')}s`
  const h = Math.floor(m / 60)
  return `${h}h${(m % 60).toString().padStart(2, '0')}m`
}

// steamcmd-manager siempre emite etaSeconds:0 (lo calcula el renderer para
// evitar brincos). La CLI lo calcula localmente cuando hay señal.
function effectiveEta(p: SteamCmdProgress): number {
  if (p.etaSeconds > 0) return p.etaSeconds
  if (p.speedBytesPerSec > 0 && p.bytesTotal > p.bytesDownloaded) {
    return (p.bytesTotal - p.bytesDownloaded) / p.speedBytesPerSec
  }
  return 0
}

function printProgress(jsonl: boolean, p: SteamCmdProgress): void {
  if (jsonl) {
    console.log(
      JSON.stringify({
        t: new Date().toISOString(),
        appId: p.appId,
        state: p.state,
        bytesDownloaded: p.bytesDownloaded,
        bytesTotal: p.bytesTotal,
        percent: Math.round(p.percent * 10) / 10,
        speedBytesPerSec: Math.round(p.speedBytesPerSec),
        etaSeconds: Math.round(effectiveEta(p)),
        pid: p.pid,
        errorMessage: p.errorMessage,
        errorKey: p.errorKey,
      }),
    )
    return
  }
  const bytesD = formatBytes(p.bytesDownloaded)
  const bytesT = p.bytesTotal > 0 ? formatBytes(p.bytesTotal) : '?'
  const speed = p.speedBytesPerSec > 0 ? `${formatBytes(p.speedBytesPerSec)}/s` : '--'
  const pct = p.percent.toFixed(1).padStart(5, ' ')
  const eta = formatEta(effectiveEta(p))
  const state = p.state.padEnd(12)
  console.log(`[${state}] ${pct}%  ${bytesD} / ${bytesT}  ${speed}  ETA ${eta}`)
}

// ============================================================
// Subcommands
// ============================================================

function cmdStatus(flags: Flags): number {
  const jsonl = isJsonl(flags)
  const totals = getTotalActiveBytes()

  if (jsonl) {
    console.log(
      JSON.stringify({
        t: new Date().toISOString(),
        isElectronContext,
        electronPackaged: isElectronPackaged(),
        paths: {
          userData: getUserDataDir(),
          library: getLibraryRoot(),
          logs: getLogDir(),
          home: getHome(),
          appPath: getAppPath(),
        },
        steamCmd: {
          available: isSteamCmdAvailable(),
          path: getSteamCmdPath(),
        },
        activeJobs: getActiveJobs(),
        totals,
      }),
    )
    return 0
  }

  console.log('Y-core CLI — status')
  console.log('─'.repeat(60))
  console.log(`  isElectronContext:    ${isElectronContext}`)
  console.log(`  electron packaged:    ${isElectronPackaged()}`)
  console.log(`  userData:             ${getUserDataDir()}`)
  console.log(`  Library:              ${getLibraryRoot()}`)
  console.log(`  logs:                 ${getLogDir()}`)
  console.log(`  HOME:                 ${getHome()}`)
  console.log(`  appPath:              ${getAppPath()}`)
  console.log(`  steamCmd available:   ${isSteamCmdAvailable()}`)
  console.log(`  steamCmd path:        ${getSteamCmdPath() ?? '(no encontrado — corré fetch-steamcmd)'}`)
  console.log('')
  console.log('Queue:')
  const jobs = getActiveJobs()
  if (jobs.length === 0) {
    console.log('  (sin jobs activos)')
  } else {
    console.log(`  activo: ${jobs.length}  ceiling: ${totals.ceiling}`)
    console.log(`  bytes:  ${formatBytes(totals.downloaded)} / ${formatBytes(totals.total)}`)
    for (const j of jobs) {
      console.log(
        `    · ${j.appId.padEnd(10)} [${j.state.padEnd(12)}] ${j.percent.toFixed(1)}%  pid=${j.pid ?? '?'}`,
      )
    }
  }
  return 0
}

async function cmdInstall(appId: string, flags: Flags): Promise<number> {
  if (!appId || !/^\d+$/.test(appId)) {
    console.error('Uso: ycore install <appId>  (appId debe ser numérico)')
    return 2
  }

  const jsonl = isJsonl(flags)

  // Validación de método. En H1.8.b sólo manejamos steamcmd auto/forced;
  // 'client' queda como placeholder hasta que H1.4 enchufe la rama
  // useInstallProcessor hacia el cliente Lua.
  if (flags.method === 'steamcmd' || flags.method === 'auto') {
    if (!isSteamCmdAvailable()) {
      const msg =
        '[ERROR] SteamCMD no disponible. Probá ycore fetch-steamcmd primero, o pasá --method=client.'
      if (jsonl) {
        console.log(
          JSON.stringify({
            t: new Date().toISOString(),
            event: 'start:cannot',
            appId,
            reason: 'steamcmd-not-available',
            hint: 'corré `ycore fetch-steamcmd` o usá --method=client',
          }),
        )
      } else {
        console.error(msg)
      }
      logger.warn(`[cli] install ${appId} abortado: steamcmd-not-available`, 'cli')
      return 3
    }
  }

  if (flags.method === 'client') {
    if (!jsonl) {
      console.log('[INFO] --method=client en H1.8.b no está implementado todavía.')
      console.log('       El dispatch desde useInstallProcessor viene en H1.4.')
    }
    return 3
  }

  const installDir = path.join(getLibraryRoot(), appId)
  if (!jsonl) {
    console.log('[INFO] Iniciando SteamCMD install')
    console.log(`       appId     = ${appId}`)
    console.log(`       installDir= ${installDir}`)
    if (flags.beta) console.log(`       beta      = ${flags.beta}`)
    if (flags.noValidate) console.log('       validate  = false (incremental)')
  }

  // Inicializa logger best-effort. La sesión CLI queda registrada.
  logger.init()
  logger.info(`[cli] install ${appId} start method=${flags.method}`, 'cli')

  let result: StartResult
  try {
    result = await startSteamCmdInstall({
      appId,
      installDir,
      betaBranch: flags.beta,
      validate: !flags.noValidate,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    if (jsonl) {
      console.log(
        JSON.stringify({ t: new Date().toISOString(), event: 'start:threw', appId, error: msg }),
      )
    } else {
      console.error(`[ERROR] startSteamCmdInstall threw: ${msg}`)
    }
    logger.error(`[cli] install ${appId} threw: ${msg}`, 'cli')
    return 1
  }

  if (!result.success) {
    if (jsonl) {
      console.log(
        JSON.stringify({
          t: new Date().toISOString(),
          event: 'start:failed',
          appId,
          error: result.error,
          errorKey: result.errorKey,
        }),
      )
    } else {
      console.error(`[ERROR] start falló: ${result.error}  (key=${result.errorKey})`)
    }
    logger.error(`[cli] install ${appId} failed: ${result.error}`, 'cli')
    return 1
  }

  if (result.queued) {
    if (!jsonl) console.log(`[INFO] Concurrency llena; ${appId} en cola pendiente.`)
  } else if (!jsonl) {
    console.log(`[OK]   forked pid=${result.pid}`)
  }

  // Poll loop. El interval se unref() para que SIGINT lo apague sin colgarse.
  return new Promise<number>((resolve) => {
    let lastPrint = 0
    let resolvedFlag = false
    const doFinish = (code: number, line: string) => {
      if (resolvedFlag) return
      resolvedFlag = true
      clearInterval(interval)
      console.log(line)
      resolve(code)
    }

    const interval = setInterval(() => {
      const p = getActiveJobFor(appId)
      if (!p) {
        doFinish(
          0,
          jsonl
            ? JSON.stringify({ t: new Date().toISOString(), event: 'job:gone', appId })
            : `[INFO] Job para ${appId} ya no está activo (sin detalle done/failed del manager).`,
        )
        return
      }

      const now = Date.now()
      if (now - lastPrint >= PRINT_INTERVAL_MS) {
        printProgress(jsonl, p)
        lastPrint = now
      }

      if (p.state === 'done') {
        const dur = p.finishedAt && p.startedAt ? (p.finishedAt - p.startedAt) / 1000 : 0
        doFinish(
          0,
          jsonl
            ? JSON.stringify({
                t: new Date().toISOString(),
                event: 'final:done',
                appId,
                finishedAt: p.finishedAt,
                durationSec: dur,
              })
            : `[OK] ${appId} completado en ${formatEta(dur)}`,
        )
        return
      }
      if (p.state === 'failed') {
        const err = p.errorMessage ?? 'sin detalle'
        logger.error(`[cli] install ${appId} failed: ${err}`, 'cli')
        doFinish(
          1,
          jsonl
            ? JSON.stringify({
                t: new Date().toISOString(),
                event: 'final:failed',
                appId,
                error: err,
                errorKey: p.errorKey,
              })
            : `[FAIL] ${appId}: ${err}  (key=${p.errorKey ?? 'n/a'})`,
        )
        return
      }
    }, POLL_INTERVAL_MS)

    if (typeof interval.unref === 'function') interval.unref()

    const onSigint = () => {
      logger.warn(`[cli] SIGINT received; cancelling ${appId}`, 'cli')
      try { cancelSteamCmdInstall(appId) } catch { /* ignore */ }
      doFinish(130, `[ABORT] ${appId} cancelado por SIGINT`)
    }
    process.once('SIGINT', onSigint)
  })
}

function cmdCancel(appId: string): number {
  if (!appId || !/^\d+$/.test(appId)) {
    console.error('Uso: ycore cancel <appId>')
    return 2
  }
  const r: CancelResult = cancelSteamCmdInstall(appId)
  if (r.success) {
    console.log(`[OK] ${appId} cancelado`)
    logger.info(`[cli] cancel ${appId} ok`, 'cli')
    return 0
  }
  console.error(`[ERROR] cancel ${appId}: ${r.error}`)
  logger.warn(`[cli] cancel ${appId} failed: ${r.error}`, 'cli')
  return 1
}

function cmdQueue(subcommand: string, flags: Flags): number {
  if (subcommand === 'list') return cmdStatus(flags)
  console.error('Uso: ycore queue list')
  return 2
}

function cmdFetchSteamCmd(): number {
  console.log('fetch-steamcmd aún no implementado (H1.5 pendiente).')
  console.log('Ver scripts/fetch-steamcmd.ts cuando se implemente.')
  logger.info('[cli] fetch-steamcmd called (placeholder)', 'cli')
  return 0
}

function cmdLogs(flags: Flags): number {
  logger.init()
  const logPath = logger.getLogFilePath()
  if (!logPath || !fs.existsSync(logPath)) {
    console.error(`No encontré log file: ${logPath ?? '(no inicializado)'}`)
    return 1
  }
  const lines = fs.readFileSync(logPath, 'utf-8').split(/\r?\n/)
  const tail = lines.slice(-flags.tail).join('\n')
  console.log(tail)
  return 0
}

// ============================================================
// Entrypoint
// ============================================================

async function main(): Promise<number> {
  const argv = process.argv.slice(2)
  if (argv.length === 0) {
    printHelp()
    return 0
  }

  // --help / -h puede aparecer antes o después del subcomando
  // (`ycore --help`, `ycore install --help`). Lo detectamos en argv completo
  // para no caer en el switch default cuando argv[0] ya es el flag.
  if (argv.includes('--help') || argv.includes('-h')) {
    printHelp()
    return 0
  }

  const cmd = argv[0]
  const rest = argv.slice(1)
  const flags = parseFlags(rest)

  switch (cmd) {
    case 'install':
      return await cmdInstall(rest[0] ?? '', flags)
    case 'status':
      return cmdStatus(flags)
    case 'queue':
      return cmdQueue(rest[0] ?? 'list', flags)
    case 'cancel':
      return cmdCancel(rest[0] ?? '')
    case 'fetch-steamcmd':
      return cmdFetchSteamCmd()
    case 'logs':
      return cmdLogs(flags)
    default:
      console.error(`comando desconocido: ${cmd}`)
      printHelp()
      return 2
  }
}

main().then((code) => {
  process.exit(code)
}).catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err)
  console.error(`[FATAL] ${msg}`)
  logger.error(`[cli] fatal: ${msg}`, 'cli')
  process.exit(2)
})
