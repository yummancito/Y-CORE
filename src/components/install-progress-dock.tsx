// ============================================================================
// src/components/install-progress-dock.tsx
// ----------------------------------------------------------------------------
// V2-only install bridge. Replaces the V1 SteamCMD bridge which subscribed to
// `onSteamCmdProgress` (no longer emitted — there is no SteamCMD path now).
//
// This mount point still exists because App.tsx renders it once at startup
// so the V2 download engine store is initialized on the first renderer tick.
// Useful: it ensures the live task list, history, and engine status are
// ready before the user opens /downloads, and the IPC subscriptions stay
// alive even if the user navigates away from the page.
// ============================================================================

import { useEffect } from 'react'
import { useDownloadEngineStore } from '../stores/useDownloadEngineV3Store'

/**
 * Mounted once from App.tsx. Initializes the V2 engine store which subscribes
 * to `download:progress|completed|failed|queue-changed|engine-status` IPC events.
 * Safe to call multiple times — the store's `init()` is idempotent.
 */
export function InstallProgressDockMount() {
  const init = useDownloadEngineStore((s) => s.init)
  useEffect(() => {
    // Re-init in case the store was recreated (HMR or route teardown).
    // init() also re-subscribes if _unsubs was wiped.
    init().catch(() => { /* engine not available in non-Electron tests */ })
  }, [init])
  return null
}
