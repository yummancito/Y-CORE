// ============================================================================
// electron/modules/hook-auto-repair.ts
// ----------------------------------------------------------------------------
// Background self-healing for the Steam ownership hook (YCoreTool.dll +
// dwmapi.dll + xinput1_4.dll in the Steam directory).
//
// What this replaces: the bounded startup retry in main.ts (30 attempts ×
// 1 min = 30 minutes, then permanent give-up). That meant: if Steam updated
// the client while Y-Core was running, or Defender quarantined a DLL, or the
// user's Steam was closed for longer than 30 minutes, the hook stayed broken
// forever — every game flipped to "Comprar" and no UI told the user why.
//
// Design goals (user requirement):
//   1. "Siempre se instala" — the watcher runs continuously, forever, at a
//      low cadence. It is NOT a bounded retry.
//   2. "Evita falsos positivos" — never reinstalls a healthy, up-to-date
//      hook. Health = all three DLLs present AND build id unchanged.
//   3. "Evita falsos negativos" — a missing dwmapi.dll or xinput1_4.dll is
//      treated as broken just like a missing YCoreTool.dll (the old
//      revalidateHookIfUpdated only checked the hook DLL name, so a missing
//      proxy DLL silently slipped through).
//   4. "Que no pase nada malo" — never force-closes Steam from the
//      background. If Steam is running and the hook is broken, we defer and
//      retry on the next tick. No dialogs, no toasts, no UI.
//   5. Consent gate preserved: without hook_consent.txt (or pre-existing
//      hook DLLs = implied consent) we never background-install.
// ============================================================================

import { app } from 'electron'
import { logger } from '../logger'
import { getSteamPath, isSteamRunning, getSteamBuildId } from './steam-helpers'
import {
  checkSteamVerification,
  readLastBuildId,
  hasHookConsent,
  hookPresent,
  revalidateHookIfUpdated,
} from './dll-inject'

// ============================================================================
// Public types
// ============================================================================

export type HookAutoRepairStatus =
  | 'healthy'            // all DLLs present + build unchanged → nothing to do
  | 'repaired'           // a repair was just performed successfully
  | 'deferred'           // broken but Steam is running → will retry next tick
  | 'no-consent'         // broken + no consent → cannot background-install
  | 'no-steam'           // Steam not found → nothing to watch
  | 'install-failed'     // consent + Steam closed but silent install failed

export interface HookAutoRepairState {
  lastStatus: HookAutoRepairStatus
  lastRunAt: string | null
  missingDlls: string[]
}

// ============================================================================
// Module state
// ============================================================================

let repairTimer: NodeJS.Timeout | null = null
let repairInFlight = false
let lastStatus: HookAutoRepairStatus = 'no-steam'
let lastRunAt: string | null = null
let lastMissingDlls: string[] = []

// Reviewer fix: the perpetual loop must NOT log every 60s while Steam stays
// up with a broken hook ('deferred') or while consent is missing
// ('no-consent') — that would spam the log file forever. Log only on status
// TRANSITIONS, and short-circuit the tick to a no-op while the status is
// unchanged.
let lastLoggedStatus: HookAutoRepairStatus | null = null

function logStatusTransition(status: HookAutoRepairStatus, message: string): void {
  if (status !== lastLoggedStatus) {
    logger.info(message, 'steam')
    lastLoggedStatus = status
  }
}

// ============================================================================
// One repair pass
// ============================================================================

/**
 * Execute a single background repair pass. Returns the resulting status.
 * Safe to call from any tick — it is idempotent and never touches Steam
 * while Steam is running.
 */
export async function runHookAutoRepairPass(): Promise<HookAutoRepairStatus> {
  const steamPath = getSteamPath()
  if (!steamPath) {
    lastStatus = 'no-steam'
    lastRunAt = new Date().toISOString()
    return lastStatus
  }

  // Full-trio presence check (stricter than the old single-name probe):
  // YCoreTool.dll + dwmapi.dll + xinput1_4.dll, legacy names included.
  const ver = checkSteamVerification()
  lastMissingDlls = ver.missing

  // False-positive guard: if the full trio is present AND the Steam build id
  // hasn't changed since the last successful install, do nothing.
  if (ver.installed) {
    const currentBuild = getSteamBuildId()
    const lastBuild = readLastBuildId(steamPath)
    if (!(currentBuild && lastBuild && currentBuild !== lastBuild)) {
      lastStatus = 'healthy'
      lastRunAt = new Date().toISOString()
      logStatusTransition('healthy', '[hook-auto-repair] Steam ownership hook is healthy and up to date')
      return lastStatus
    }
  }

  // Never force-close Steam from the background. If Steam is running the
  // files are locked anyway — defer and retry on the next tick. Log only on
  // transition so a Steam-forever-running + broken hook can't spam logs.
  const running = await isSteamRunning()
  if (running) {
    lastStatus = 'deferred'
    lastRunAt = new Date().toISOString()
    logStatusTransition(
      'deferred',
      `[hook-auto-repair] hook needs repair (${ver.missing.join(', ') || 'build changed'}) but Steam is running — deferring, will retry.`,
    )
    return lastStatus
  }

  // Consent gate: silent background install requires explicit consent
  // (hook_consent.txt) OR pre-existing hook DLLs (implied consent).
  if (!hasHookConsent(steamPath) && !hookPresent(steamPath)) {
    lastStatus = 'no-consent'
    lastRunAt = new Date().toISOString()
    logStatusTransition(
      'no-consent',
      '[hook-auto-repair] hook broken but no consent recorded — skipping silent install. Use Settings → Steam → Verify to authorize.',
    )
    return lastStatus
  }

  // Reviewer fix (race window): Steam could have launched between the check
  // above and this install — re-verify right before touching the files so a
  // locked-file failure doesn't masquerade as 'install-failed'.
  if (await isSteamRunning()) {
    lastStatus = 'deferred'
    lastRunAt = new Date().toISOString()
    logStatusTransition('deferred', '[hook-auto-repair] Steam came up during repair — deferring.')
    return lastStatus
  }

  // Reviewer fix: the in-progress message must NOT set lastLoggedStatus,
  // otherwise the transition guard swallows the "repaired successfully" log
  // below. It is gated on `lastStatus !== 'install-failed'` so a persistently
  // failing repair (e.g. signature not yet cached, Defender re-quarantine)
  // can't spam the log every 60s. The result below stays transition-gated.
  if (lastStatus !== 'install-failed') {
    logger.info(`[hook-auto-repair] repairing hook silently (missing: ${ver.missing.join(', ') || 'stale build'})…`, 'steam')
  }
  try {
    const ok = await revalidateHookIfUpdated(steamPath)
    if (ok) {
      lastStatus = 'repaired'
      logStatusTransition('repaired', '[hook-auto-repair] hook repaired successfully')
    } else {
      // Reviewer fix: warn only on the TRANSITION into 'install-failed' so a
      // persistently-failing repair (signature never cached, Defender
      // re-quarantine) can't spam the log every 60s.
      if (lastStatus !== 'install-failed') {
        logger.warn('[hook-auto-repair] silent repair returned false (signature not yet cached / install skipped)')
      }
      lastStatus = 'install-failed'
    }
  } catch (err: any) {
    lastStatus = 'install-failed'
    logger.warn(`[hook-auto-repair] repair failed: ${err?.message ?? err}`, 'steam')
  }
  lastRunAt = new Date().toISOString()
  return lastStatus
}

// ============================================================================
// Watchdog lifecycle
// ============================================================================

/**
 * Start the background watchdog. Runs one pass immediately, then every
 * `intervalMs` (default 60s). The timer is unref'd so it never keeps the app
 * alive, and the loop is bounded per tick (repairInFlight) so overlapping
 * passes can't stack. Never shows UI.
 */
export function startHookAutoRepair(opts?: { intervalMs?: number }): void {
  if (repairTimer) return
  const intervalMs = opts?.intervalMs ?? 60_000

  const run = async () => {
    if (repairInFlight) return
    repairInFlight = true
    try {
      await runHookAutoRepairPass()
    } catch (err: any) {
      logger.warn(`[hook-auto-repair] pass error: ${err?.message ?? err}`, 'steam')
    } finally {
      repairInFlight = false
    }
  }

  void run() // immediate first pass
  repairTimer = setInterval(() => void run(), intervalMs)
  repairTimer.unref?.()
  logger.info(`[hook-auto-repair] background watchdog started (every ${intervalMs}ms)`, 'steam')
}

export function stopHookAutoRepair(): void {
  if (repairTimer) {
    clearInterval(repairTimer)
    repairTimer = null
  }
}

/** Read-only state snapshot (for logs / diagnostics, not UI). */
export function getHookAutoRepairState(): HookAutoRepairState {
  return {
    lastStatus,
    lastRunAt,
    missingDlls: [...lastMissingDlls],
  }
}

// Ensure the module tears down its timer on quit.
app.on('before-quit', stopHookAutoRepair)
