// Round-11 preload + listener wiring. Use simple string concatenation to
// avoid backtick-escape pitfalls inside patcher template literals.
const fs = require('fs')
const path = require('path')
const ROOT = 'C:/Users/User Unkown/Desktop/proyectos/Y-CORE'

function readFile(p) { return fs.readFileSync(p, 'utf-8') }
function writeFile(p, c) { fs.writeFileSync(p, c, 'utf-8'); console.log('  wrote:', path.relative(ROOT, p)) }

// -------------------------------------------------------------------------
// 1. preload.ts: add onAppEvent shim (just below manualDownloadUpdate).
// -------------------------------------------------------------------------
console.log('[1] Patching preload.ts (add onAppEvent shim)')
const preloadPath = path.join(ROOT, 'electron', 'preload.ts')
let pre = readFile(preloadPath)
if (!pre.includes('onAppEvent:')) {
  const anchor = "manualDownloadUpdate: (url: string) => ipcRenderer.invoke('app:manualDownloadUpdate', url),"
  const shim = [
    "manualDownloadUpdate: (url: string) => ipcRenderer.invoke('app:manualDownloadUpdate', url),",
    "  // ── Round-11: generic app:* event subscription shim ───────────────────────",
    "  // Used by useSettingsStore to react to main-process state flips:",
    "  //   app:autoKillReactivated — Steam alive at startup flipped kill-flag to true",
    "  //   app:autoBuildFinished    — silent build attempt at startup completed/failed",
    "  onAppEvent: (event: string, callback: (payload: any) => void) => {",
    "    const channel = `app:${event}`",
    "    const handler = (_e: any, payload: any) => callback(payload)",
    "    ipcRenderer.on(channel, handler)",
    "    return () => ipcRenderer.removeListener(channel, handler)",
    "  },",
  ].join('\n')
  if (pre.includes(anchor)) {
    pre = pre.replace(anchor, shim)
    console.log('  added onAppEvent shim')
  } else {
    console.log('  anchor not found')
  }
}
writeFile(preloadPath, pre)

// -------------------------------------------------------------------------
// 2. useSettingsStore.ts: rewire listener block. Replace the entire old
//    block (the one from previous patcher runs) with a new block that:
//      - Uses (window as any).steamtools.onAppEvent
//      - Calls useSettingsStore.getState().setKillSteamBeforeLaunch(true)
//      - Calls useToastStore.getState().showToast(...) for the autoBuild toast
//      - Has idempotency guard via a module-scope Set
// -------------------------------------------------------------------------
console.log('[2] Patching useSettingsStore.ts (rewire listener + idempotency + toast)')
const storePath = path.join(ROOT, 'src', 'stores', 'useSettingsStore.ts')
let store = readFile(storePath)

// Locate the Round-11.5 block we want to replace.
const oldStartMarker = '// ============================================================================\n// Round-11.5 — auto-sync '
if (store.includes(oldStartMarker)) {
  // Find the start of the block and its end (the last `})` before EOF that's part of this block).
  const startIdx = store.indexOf(oldStartMarker)
  // The block ends at the last `})` followed by EOF or non-Round text.
  // Simpler: cut from startIdx to end-of-file (assume the block is at the tail).
  const newBlock = [
    '',
    '// ============================================================================',
    '// Round-11.5 — auto-sync killSteamBeforeLaunch to main-process flips.',
    '// ============================================================================',
    '',
    '// Idempotency guard so HMR / multi-import does not stack listeners.',
    "const _round11Subscribed = new Set<string>()",
    'function subscribeAppEventOnce(event: string, handler: (payload: any) => void): void {',
    '  if (_round11Subscribed.has(event)) return',
    '  _round11Subscribed.add(event)',
    '  if (typeof window === "undefined") return',
    '  const tools = (window as any).steamtools',
    '  if (!tools?.onAppEvent) return',
    '  try { tools.onAppEvent(event, handler) } catch { /* never crash UI */ }',
    '}',
    '',
    'if (typeof window !== "undefined" && (window as any).steamtools?.onAppEvent) {',
    '  // 1. Steam alive at startup → main flipped killSteamBeforeLaunch false→true.',
    '  subscribeAppEventOnce("app:autoKillReactivated", () => {',
    '    try {',
    '      useSettingsStore.getState().setKillSteamBeforeLaunch(true)',
    '    } catch { /* never crash UI */ }',
    '  })',
    '',
    '  // 2. Silent auto-build at startup completed (or failed). Surface via toast.',
    '  // Lazy-require useToastStore so we never break the store module load.',
    '  subscribeAppEventOnce("app:autoBuildFinished", (payload: any) => {',
    '    try {',
    '      // Dynamic import to avoid circular deps + ensure toast store ready.',
    '      void import("../stores/useToastStore").then((mod: any) => {',
    '        const showToast = mod?.useToastStore?.getState?.()?.showToast',
    '        if (typeof showToast !== "function") return',
    '        if (payload?.success) {',
    '          showToast("success", `Emulador compilado en ${payload.durationMs ?? "?"}ms. Reiniciá Y-core para tomar el DLL nuevo.`)',
    '        } else {',
    '          showToast("error", `Emulador no se compiló: ${payload?.error ?? "error desconocido"}. Instalá cmake 3.20+ y Visual Studio Build Tools 2022.`)',
    '        }',
    '      }).catch(() => { /* silent */ })',
    '    } catch { /* never crash UI */ }',
    '  })',
    '}',
    '',
  ].join('\n')

  store = store.substring(0, startIdx) + newBlock
  console.log('  rewired listener block (steamtools.onAppEvent + idempotency + toast)')
}
writeFile(storePath, store)

console.log('\nRound-11 final-2 (preload + listener) applied.')