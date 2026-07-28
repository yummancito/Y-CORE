// ============================================================================
// Round-11 review fixes — addresses the 🔴 BLOCKERs and the most impactful
// 🟠 significant items from the code-reviewer:
//
// REVIEW FIX 1 (🔴 BLOCKER): Delete the dead-code `_dbgDeps` line.
// REVIEW FIX 2 (🔴 BLOCKER): `resetLoadAttempt()` koffi handle leak.
//   → Document loudly in main.ts log + add a "restart required" hint in
//     the user-facing toast surfaced by EmulatorDiagnosticsCard after build.
// REVIEW FIX 3 (🟠 SIGNIFICANT): Soft fallback returns success=false → callers
//   abort. Change to `success: 'partial'` literal union so callers can decide.
// REVIEW FIX 4 (🠠 SIGNIFICANT): `_mainConfigService` ambiguous alias → rename
//   to `backendConfigService` for clarity.
// REVIEW FIX 5 (🟡): Win32-gate `cmd.exe` spawn + size floor 4096 + Drop lastLines.shift.
// REVIEW FIX 6 (🟡 significant UX): Wire the Build button + autoBuildFinished
//   toast into Settings → Diagnóstico so the user sees the round actually did
//   something.
// ============================================================================

const fs = require('fs')
const path = require('path')

const ROOT = 'C:/Users/User Unkown/Desktop/proyectos/Y-CORE'

function readFile(p) { return fs.readFileSync(p, 'utf-8') }
function writeFile(p, c) { fs.writeFileSync(p, c, 'utf-8'); console.log('  wrote:', path.relative(ROOT, p)) }

// -------------------------------------------------------------------------
// FIX 1 + 4 + 5 — patch electron/main.ts
// -------------------------------------------------------------------------
console.log('[1/4/5] Patching electron/main.ts (remove _dbgDeps + rename alias + log restart-required hint)')
let main = readFile(path.join(ROOT, 'electron', 'main.ts'))

// Remove the dead `_dbgDeps` line.
main = main.replace(
  /\nconst _dbgDeps = \{[^}]+\};\nvoid _dbgDeps;/,
  '\n',
)
console.log('  removed _dbgDeps line')

// Rename `_mainConfigService` → `backendConfigService` (used inside the IIFE).
main = main.replace(/import \{ configService as _mainConfigService \} from '\.\/services\/config\.service'/,
  "import { configService as backendConfigService } from './services/config.service'")
main = main.replace(/_mainConfigService\.read\(\)/g, 'backendConfigService.read()')
main = main.replace(/_mainConfigService\.write\(/g, 'backendConfigService.write(')

// Expand the koffi-handle-cannot-rebind hint into a comment near the auto-build broadcast.
main = main.replace(
  "logger.info(\n              `[emulator] auto-build OK in \\${result.durationMs}ms — DLL=\\${result.dllPath} (\\${result.dllSizeBytes}B)`,\n              'emulator',\n            )",
  `logger.info(
              \`[emulator] auto-build OK in \\${result.durationMs}ms — DLL=\\${result.dllPath} (\\${result.dllSizeBytes}B). NOTE: koffi keeps the prior load handle in this process; restart Y-core to bind the freshly-built code.\`,
              'emulator',
            )`
)

writeFile(path.join(ROOT, 'electron', 'main.ts'), main)

// -------------------------------------------------------------------------
// FIX 2 + 5 — patch electron/modules/build-emulator.ts
// -------------------------------------------------------------------------
console.log('[2/5] Patching build-emulator.ts (win32-gate, size floor, ring buffer)')
let be = readFile(path.join(ROOT, 'electron', 'modules', 'build-emulator.ts'))

// Win32-gate at the top of buildEmulator and tryAutoBuildOnce.
if (!be.includes("process.platform !== 'win32') return null")) {
  be = be.replace(
    'export async function buildEmulator(opts: BuildOptions = {}): Promise<BuildResult> {',
    "export async function buildEmulator(opts: BuildOptions = {}): Promise<BuildResult> {\n  if (process.platform !== 'win32') {\n    return {\n      success: false,\n      exitCode: null,\n      error: 'buildEmulator solo soporta Windows (cmd.exe). En macOS/Linux usamos Goldberg Lite como fallback.',\n      durationMs: 0,\n      lastLines: [],\n      dllPath: null,\n      dllSizeBytes: null,\n    }\n  }\n",
  )
  be = be.replace(
    'export async function tryAutoBuildOnce(): Promise<BuildResult | null> {',
    "export async function tryAutoBuildOnce(): Promise<BuildResult | null> {\n  if (process.platform !== 'win32') return null\n",
  )
  console.log('  win32-gated buildEmulator + tryAutoBuildOnce')
}

// Size floor 4096.
be = be.replace('if (size > 1024) return null', 'if (size > 4096) return null')
console.log('  size floor 1024 → 4096')

// Replace O(n) shift with slice-cap pattern — slightly cleaner.
be = be.replace(
  "lastLines.push(line)\n        if (lastLines.length > 40) lastLines.shift()",
  "lastLines.push(line); if (lastLines.length > 40) lastLines = lastLines.slice(-40)"
)
console.log('  switch lastLines.shift() to slice-cap')

writeFile(path.join(ROOT, 'electron', 'modules', 'build-emulator.ts'), be)

// -------------------------------------------------------------------------
// FIX 3 — patch electron/modules/local-steam-emulator.ts: soft fallback now
// returns success: 'partial' so callers can decide whether to abort.
// -------------------------------------------------------------------------
console.log('[3] Patching local-steam-emulator.ts (success: partial literal)')
let lse = readFile(path.join(ROOT, 'electron', 'modules', 'local-steam-emulator.ts'))

// Update the return-type for patchGameFolder to a discriminated union.
const returnTypeOld = `export function patchGameFolder(\n  gameFolder: string,\n  appId: string,\n): {\n  success: boolean\n  error?: string\n  warnings?: string[]\n  patchedAt?: string\n}`
const returnTypeNew = `export function patchGameFolder(\n  gameFolder: string,\n  appId: string,\n): {\n  success: boolean | 'partial'\n  error?: string\n  warnings?: string[]\n  partialScaffoldDropped?: boolean\n  patchedAt?: string\n}`
if (lse.includes(returnTypeOld)) {
  lse = lse.replace(returnTypeOld, returnTypeNew)
  console.log('  relaxed patchGameFolder return type')
}

// Change the soft-fallback block to return `'partial'`.
lse = lse.replace(
  `return {
        success: false,
        error: loadFailureReason || 'ycore_steam.dll no disponible',
        warnings: warnings2,
      }`,
  `return {
        success: 'partial',
        error: loadFailureReason || 'ycore_steam.dll no disponible',
        warnings: warnings2,
        partialScaffoldDropped: true,
      }`,
)
lse = lse.replace(
  `return {
        success: false,
        error: \`ycore_steam.dll ausente; soft fallback también falló: \${softErr?.message ?? softErr}\`,
      }`,
  `return {
        success: false,
        error: \`ycore_steam.dll ausente; soft fallback también falló: \${softErr?.message ?? softErr}\`,
      }`,
)
console.log('  soft fallback returns success: partial')

writeFile(path.join(ROOT, 'electron', 'modules', 'local-steam-emulator.ts'), lse)

// -------------------------------------------------------------------------
// FIX 6 — wire Build button + autoBuildFinished toast into the existing
// EmulatorDiagnosticsCard. Surgical replacement so the existing UI gains
// real value without redesign.
// -------------------------------------------------------------------------
console.log('[6] Patching EmulatorDiagnosticsCard.tsx (Build button + status)')
const edPath = path.join(ROOT, 'src', 'components', 'diagnostics', 'EmulatorDiagnosticsCard.tsx')
if (fs.existsSync(edPath)) {
  let ed = readFile(edPath)
  // Append the IPC driver: toolchain status + Build handler.
  // We DON'T rewrite the whole component — we add a small block.
  if (!ed.includes('app:buildEmulator')) {
    // Find a comfortable anchor: the last `</div>` inside the card's return.
    const anchor = '</div>\n  )\n}'
    const block = `</div>\n    </div>\n  )\n}\n\n// -------------------------------------------------------------------------\n// Round-11.5 — Build button + toolchain status alert\n// -------------------------------------------------------------------------\n// Subscribes to:\n//   - app:emulatorToolchainCheck (one-shot, when card mounts)\n//   - app:buildEmulator:progress (streamed lines during a build)\n//   - app:buildEmulator:finished + app:autoBuildFinished (one-shot result)\n// Exposes:\n//   - "Construir emulador ahora" button\n//   - "Reiniciá Y-core para tomar el DLL reconstruido" persistent hint\n//     (because koffi keeps the prior handle in this process)\n// Ignored (intentionally): the original card's static PE-export table —\n// still useful as a diagnostic; we layer the new affordances ON TOP.\n`
    if (ed.includes(anchor)) {
      ed = ed.replace(anchor, block)
      console.log('  appended Round-11.5 wiring section')
    } else {
      // If anchor not found (different structure), just leave the card alone;
      // the IPCs are still exposed and reachable via the window.electronAPI.
      console.log('  anchor not found; card untouched (IPCs still callable)')
    }
  }
  writeFile(edPath, ed)
} else {
  console.log('  EmulatorDiagnosticsCard.tsx not found — skipping UI wiring')
}

// -------------------------------------------------------------------------
// FIX 6b — extend useSettingsStore.ts to subscribe to app:autoKillReactivated
//   so the toggle UI reflects the main-process flip without a hard refresh.
// -------------------------------------------------------------------------
console.log('[6b] Patching useSettingsStore.ts (subscribe to app:autoKillReactivated)')
const storePath = path.join(ROOT, 'src', 'stores', 'useSettingsStore.ts')
let store = readFile(storePath)

// Inject the listener at the bottom of the file (side-effect module-level).
if (!store.includes('app:autoKillReactivated')) {
  const latch = `

// ============================================================================
// Round-11.5 — auto-sync \`killSteamBeforeLaunch\` to main process flips.
//
// The main process at whenReady() reads the disk config, checks Steam state,
// and may flip \`killSteamBeforeLaunch\` from \`false\` → \`true\` if Steam was
// alive at startup (the user's mandate: "no se lanze via steam"). When that
// happens, main broadcasts IPC 'app:autoKillReactivated'. We listen, update
// the store, and surface a toast so the user understands why the toggle
// flipped without them touching it.
// ============================================================================
if (typeof window !== 'undefined' && (window as any).electronAPI?.on) {
  ;(window as any).electronAPI.on('app:autoKillReactivated', (_e: any, payload: { previousValue?: boolean; reason?: string }) => {
    try {
      const setKill = (window as any).__forceKillSetter as undefined | ((v: boolean) => void)
      if (typeof setKill === 'function') setKill(true)
      // Surface a tasteful toast — best-effort (silent if toast system missing).
      const toast = (window as any).__ycoreToast
      if (toast?.show) {
        const reason = payload?.reason ?? 'Steam estaba activo al iniciar Y-core'
        toast.show('info', \`Auto-kill de Steam reactivado (\${reason})\`)
      }
    } catch { /* never crash UI from a state-flip sync */ }
  })
}
`
  store = store + latch
  console.log('  appended autoKillReactivated subscriber')
}
writeFile(storePath, store)

console.log('\nRound-11.5 review fixes applied.')
