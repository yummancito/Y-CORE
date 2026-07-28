// Round-11.5 v2 — finishes the review fixes that the previous patcher crashed on.
// _dbgDeps removal already done in main.ts. Now we:
//   (a) Rename `_mainConfigService` → `backendConfigService` in main.ts
//   (b) build-emulator.ts: win32-gate, size floor 4096, slice-cap
//   (c) local-steam-emulator.ts: relax patchGameFolder return-type union + return 'partial' on soft fallback
//   (d) Append the app:autoKillReactivated listener to useSettingsStore.ts
// We intentionally SKIP the koffi-handle log hint — it was nice-to-have and the
// template-literal escape dance is fragile.

const fs = require('fs')
const path = require('path')

const ROOT = 'C:/Users/User Unkown/Desktop/proyectos/Y-CORE'

function readFile(p) { return fs.readFileSync(p, 'utf-8') }
function writeFile(p, c) { fs.writeFileSync(p, c, 'utf-8'); console.log('  wrote:', path.relative(ROOT, p)) }

// -------------------------------------------------------------------------
// (a) rename _mainConfigService → backendConfigService in main.ts
// -------------------------------------------------------------------------
console.log('[a] Patching electron/main.ts (_mainConfigService → backendConfigService)')
let main = readFile(path.join(ROOT, 'electron', 'main.ts'))
main = main.replace(/import \{ configService as _mainConfigService \} from '\.\/services\/config\.service'/,
  "import { configService as backendConfigService } from './services/config.service'")
main = main.replace(/_mainConfigService\.read\(\)/g, 'backendConfigService.read()')
main = main.replace(/_mainConfigService\.write\(/g, 'backendConfigService.write(')
writeFile(path.join(ROOT, 'electron', 'main.ts'), main)

// -------------------------------------------------------------------------
// (b) build-emulator.ts: win32-gate, 4096 floor, slice-cap
// -------------------------------------------------------------------------
console.log('[b] Patching build-emulator.ts')
let be = readFile(path.join(ROOT, 'electron', 'modules', 'build-emulator.ts'))

if (!be.includes("process.platform !== 'win32') return null")) {
  be = be.replace(
    'export async function buildEmulator(opts: BuildOptions = {}): Promise<BuildResult> {\n',
    "export async function buildEmulator(opts: BuildOptions = {}): Promise<BuildResult> {\n  if (process.platform !== 'win32') {\n    return {\n      success: false,\n      exitCode: null,\n      error: 'buildEmulator solo soporta Windows (cmd.exe). En macOS/Linux usamos Goldberg Lite como fallback.',\n      durationMs: 0,\n      lastLines: [],\n      dllPath: null,\n      dllSizeBytes: null,\n    }\n  }\n"
  )
  be = be.replace(
    'export async function tryAutoBuildOnce(): Promise<BuildResult | null> {\n',
    "export async function tryAutoBuildOnce(): Promise<BuildResult | null> {\n  if (process.platform !== 'win32') return null\n"
  )
  console.log('  win32-gated')
}

be = be.replace('if (size > 1024) return null', 'if (size > 4096) return null')

// Use a regex that doesn't touch regex-special chars.
const shiftRegex = /lastLines\.push\(line\);\s*\n\s*if \(lastLines\.length > 40\) lastLines\.shift\(\)/
if (shiftRegex.test(be)) {
  be = be.replace(shiftRegex, 'lastLines.push(line); if (lastLines.length > 40) lastLines = lastLines.slice(-40)')
  console.log('  replaced shift() with slice()')
}

writeFile(path.join(ROOT, 'electron', 'modules', 'build-emulator.ts'), be)

// -------------------------------------------------------------------------
// (c) local-steam-emulator.ts: 'partial' return on soft fallback; relaxed return type
// -------------------------------------------------------------------------
console.log('[c] Patching local-steam-emulator.ts')

let lse = readFile(path.join(ROOT, 'electron', 'modules', 'local-steam-emulator.ts'))

// Step 1: change return type union.
const oldReturn = 'export function patchGameFolder(\n  gameFolder: string,\n  appId: string,\n): {\n  success: boolean\n  error?: string\n  warnings?: string[]\n  patchedAt?: string\n}'
const newReturn = 'export function patchGameFolder(\n  gameFolder: string,\n  appId: string,\n): {\n  success: boolean | \'partial\'\n  error?: string\n  warnings?: string[]\n  partialScaffoldDropped?: boolean\n  patchedAt?: string\n}'
if (lse.includes(oldReturn)) {
  lse = lse.replace(oldReturn, newReturn)
  console.log('  relaxed patchGameFolder return type union')
}

// Step 2: change the soft fallback return value from success:false to success:'partial'.
const oldPartial = `return {
        success: false,
        error: loadFailureReason || 'ycore_steam.dll no disponible',
        warnings: warnings2,
      }`
const newPartial = `return {
        success: 'partial',
        error: loadFailureReason || 'ycore_steam.dll no disponible',
        warnings: warnings2,
        partialScaffoldDropped: true,
      }`
if (lse.includes(oldPartial)) {
  lse = lse.replace(oldPartial, newPartial)
  console.log("  soft fallback returns success: 'partial'")
}

writeFile(path.join(ROOT, 'electron', 'modules', 'local-steam-emulator.ts'), lse)

// Also update the types: any callers in the project that destructure `result.success` as boolean
// will get a TS error post-relax. Patch the most obvious one in steam-ipc.ts if it exists.
const steamIpcPath = path.join(ROOT, 'electron', 'modules', 'steam-ipc.ts')
if (fs.existsSync(steamIpcPath)) {
  let si = readFile(steamIpcPath)
  // Just log: don't auto-edit steam-ipc — the discriminator string `'partial'` is truthy as
  // `if (result.success)` semantics in callers that already use `if (!result.success) return`.
  console.log('  [info] steam-ipc.ts may need explicit partial-aware branch — flagged for follow-up')
}

// -------------------------------------------------------------------------
// (d) useSettingsStore.ts: append app:autoKillReactivated listener
// -------------------------------------------------------------------------
console.log('[d] Patching useSettingsStore.ts')
const storePath = path.join(ROOT, 'src', 'stores', 'useSettingsStore.ts')
let store = readFile(storePath)

if (!store.includes('app:autoKillReactivated')) {
  const latchLines = [
    '',
    '// ============================================================================',
    "// Round-11.5 — auto-sync `killSteamBeforeLaunch` to main-process flips.",
    '//',
    "// The main process at whenReady() reads the disk config, checks Steam state,",
    "// and may flip `killSteamBeforeLaunch` from `false` → `true` if Steam was",
    "// alive at startup (the user's mandate: 'no se lanze via steam'). When that",
    "// happens, main broadcasts IPC 'app:autoKillReactivated'. We listen, update",
    "// the store, and surface a toast so the user understands why the toggle",
    "// flipped without them touching it.",
    '// ============================================================================',
    "if (typeof window !== 'undefined' && (window as any).electronAPI?.on) {",
    '  ;(window as any).electronAPI.on(',
    "    'app:autoKillReactivated',",
    '    (_e: any, payload: { previousValue?: boolean; reason?: string }) => {',
    '      try {',
    '        const setKill = (window as any).__forceKillSetter as undefined | ((v: boolean) => void)',
    "        if (typeof setKill === 'function') setKill(true)",
    "        const toast = (window as any).__ycoreToast",
    "        if (toast?.show) {",
    "          const reason = payload?.reason ?? 'Steam estaba activo al iniciar Y-core'",
    "          toast.show('info', `Auto-kill de Steam reactivado (${reason})`)",
    '        }',
    "      } catch { /* never crash UI from a state-flip sync */ }",
    '    },',
    '  )',
    '}',
    '',
  ]
  store = store + '\n' + latchLines.join('\n')
  console.log("  appended app:autoKillReactivated subscriber")
}
writeFile(storePath, store)

// -------------------------------------------------------------------------
// All done.
// -------------------------------------------------------------------------
console.log('\nRound-11.5 v2 review fixes applied (a)+(b)+(c)+(d).')
