// ============================================================================
// src/lib/launch-deduper.ts — Round-10 launch-dedup helper
// ----------------------------------------------------------------------------
// Process-scoped single-shot guard for launchGame(appId). Shared across all
// page components so cross-page re-mounts mid-flight (e.g., user clicks Jugar
// in LibraryPage then navigates to DetailPage and clicks again 50ms later)
// also collapse to one IPC and one launchGameFromDir.
// ============================================================================
//
// Why a module-scoped Map instead of useRef<Set<string>> in each component?
//   useRef is component-scoped. LibraryPage and DetailPage are different
//   instances with separate refs. Closing one window + opening the other
//   mid-flight would let a second click go through. The Map is loaded once
//   per renderer process and survives remounts / route changes.
//
// Why Promise<unknown> instead of Set<string> + setTimeout(1500)?
//   Steamless scans can take 30-90s on large .exe files. A fixed delay
//   clears the lock too early and lets the user queue a second IPC that
//   thrashes the first in game-process.ts. Tracking the actual promise
//   lifecycle guarantees cleanup fires when Steamless+patch+spawn complete —
//   no thrash regardless of how slow the chain is.
// ============================================================================

const inflight = new Map<string, Promise<unknown>>()

/**
 * Run `fn()` for the first call per appId. Subsequent calls (even from a
 * different component instance, even after a route change) return null
 * until the original promise settles.
 *
 *   const result = await launchDedup(appId, () => window.steamtools.launchGame(appId))
 *   if (!result) return  // already mid-flight
 *   // ...process result.success / wasSteamAliveAtLaunch etc.
 */
export function launchDedup<T>(
  appId: string,
  fn: () => Promise<T>,
): Promise<T | null> {
  if (inflight.has(appId)) return Promise.resolve(null)
  const promise = Promise.resolve()
    .then(() => fn())
    .finally(() => {
      // Delete on FULLY settled (success or error) so the user can retry
      // immediately on failure, but cannot thrash the live path during a
      // healthy launch chain.
      inflight.delete(appId)
    })
  inflight.set(appId, promise)
  return promise
}

/**
 * Diagnostic for `/logs` / settings debug panel: snapshot of in-flight
 * launches at this instant. Mostly useful when investigating "Y-core
 // won't relaunch" complaints.
 */
export function activeLaunches(): string[] {
  return Array.from(inflight.keys())
}
