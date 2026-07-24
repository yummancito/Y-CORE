#!/usr/bin/env node
// scripts/fetch-steamcmd.ts
//
// CLI wrapper que invoca electron/modules/steamcmd-fetcher.
// Uso:
//   npx tsx scripts/fetch-steamcmd.ts
//   node ./bin/dist/scripts/fetch-steamcmd.js  (post-compile)
//
// Exit codes:
//   0 — fetch OK (cache hit, fresh, o forced)
//   1 — fetch falló (network, zip inválido, extract, etc.) — error printed
//   2 — fatal/crash
//
// Por default es idempotente: si cache hit + binario > 500 KB → exit 0 sin
// re-bajar. Pasá `--force` para forzar re-download.

import {
  fetchSteamCmd,
  getSteamCmdCacheDir,
  getExpectedBinPath,
  getExpectedBinName,
} from '../electron/modules/steamcmd-fetcher'
import { logger } from '../electron/logger'

interface CliFlags {
  force: boolean
  jsonl: boolean
}

function parseFlags(argv: string[]): CliFlags {
  return {
    force: argv.includes('--force'),
    jsonl: argv.includes('--jsonl'),
  }
}

function emitEvt(jsonl: boolean, payload: Record<string, unknown>): void {
  if (jsonl) {
    console.log(JSON.stringify({ t: new Date().toISOString(), ...payload }))
  } else {
    const msg = String(payload.msg ?? payload.message ?? '')
    if (payload.kind === 'progress') process.stdout.write(`\r${msg.padEnd(60, ' ')}`)
    else console.log(`\n${msg}`)
  }
}

async function main(): Promise<number> {
  const flags = parseFlags(process.argv.slice(2))
  logger.init()

  const binName = getExpectedBinName()
  const dstPath = getExpectedBinPath()
  const cacheDir = getSteamCmdCacheDir()

  emitEvt(flags.jsonl, { kind: 'info', msg: `[INFO] Fetching SteamCMD`, binName, dstPath, cacheDir })

  if (flags.force) emitEvt(flags.jsonl, { kind: 'info', msg: '[INFO] --force: re-download aún si cache hit' })

  let lastPctLogged = -1
  const result = await fetchSteamCmd({
    force: flags.force,
    onProgress: ({ bytesDownloaded, bytesTotal }) => {
      const downloadedKb = (bytesDownloaded / 1024).toFixed(0)
      const totalKb = bytesTotal ? (bytesTotal / 1024).toFixed(0) : null
      if (bytesTotal) {
        const pct = Math.floor((bytesDownloaded / bytesTotal) * 100)
        if (pct - lastPctLogged >= 10) {
          emitEvt(flags.jsonl, {
            kind: 'progress',
            msg: `[PROGRESS] ${pct}%  ${downloadedKb} / ${totalKb} KB`,
            pct,
            bytesDownloaded,
            bytesTotal,
          })
          lastPctLogged = pct
        }
      } else {
        emitEvt(flags.jsonl, {
          kind: 'progress',
          msg: `[PROGRESS] ${downloadedKb} KB downloaded`,
          bytesDownloaded,
        })
      }
    },
  })

  // Limpia el carriage return del último progress.
  if (!flags.jsonl) process.stdout.write('\n')

  if (!result.success) {
    emitEvt(flags.jsonl, {
      kind: 'fail',
      msg: `[FAIL] ${result.error ?? 'sin detalle'}  (key=${result.errorKey ?? 'n/a'})`,
      error: result.error,
      errorKey: result.errorKey,
    })
    return 1
  }

  emitEvt(flags.jsonl, {
    kind: 'done',
    success: true,
    binPath: result.binPath,
    shortSha: result.shortSha,
    byteSize: result.byteSize,
    elapsedMs: result.elapsedMs,
    source: result.source,
  })

  if (result.source === 'cache') {
    console.log(`[OK] cache hit — SteamCMD ya estaba en ${result.binPath}`)
  } else {
    console.log(`[OK] fetched ${result.source} → ${result.binPath}`)
  }
  if (result.byteSize !== undefined) console.log(`     size = ${result.byteSize} bytes`)
  if (result.shortSha) console.log(`     sha  = ${result.shortSha}…`)
  if (result.elapsedMs !== undefined) console.log(`     time = ${result.elapsedMs}ms`)
  return 0
}

main().then((code) => process.exit(code)).catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err)
  console.error('[FATAL]', msg)
  process.exit(2)
})
