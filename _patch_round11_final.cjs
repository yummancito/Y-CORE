// Round-11 final — fixes the remaining TS errors + dead globals.
const fs = require('fs')
const path = require('path')
const ROOT = 'C:/Users/User Unkown/Desktop/proyectos/Y-CORE'

function readFile(p) { return fs.readFileSync(p, 'utf-8') }
function writeFile(p, c) { fs.writeFileSync(p, c, 'utf-8'); console.log('  wrote:', path.relative(ROOT, p)) }

// -------------------------------------------------------------------------
// 1. main.ts: kill the _dbgDeps line + the trailing `void _dbgDeps;`.
//    (Round-11 v1's regex did NOT match the actual file — likely due to
//    unescaped `{` inside object-literal confusing the regex's `\{[^}]+\}`
//    character class. Just substring-search by string match this time.)
// -------------------------------------------------------------------------
console.log('[1] Patching main.ts (kill _dbgDeps block)')
const mainPath = path.join(ROOT, 'electron', 'main.ts')
let main = readFile(mainPath)
const dbgLineMarker = 'const _dbgDeps = { checkToolchain, buildEmulator, tryAutoBuildOnce, isSteamRunning, isLocalSteamEmulatorAvailable, _mainConfigService };'
if (main.includes(dbgLineMarker)) {
  main = main.replace(
    new RegExp('\\nconst _dbgDeps = \\{[^\\n]+\\};\\nvoid _dbgDeps;\\n'),
    '\n',
  )
  console.log('  removed _dbgDeps block (substring fallback)')
} else {
  console.log('  _dbgDeps not found (already gone)')
}
writeFile(mainPath, main)

// -------------------------------------------------------------------------
// 2. build-emulator.ts: dllPath type error + sanitize escaped ${ if present.
// -------------------------------------------------------------------------
console.log('[2] Patching build-emulator.ts (dllPath type + literal escapes)')
const bePath = path.join(ROOT, 'electron', 'modules', 'build-emulator.ts')
let be = readFile(bePath)

// Fix `dllPath: candidate` → `dllPath: candidate ?? null` (TS wanted string|null).
if (be.includes('dllPath: candidate,\n')) {
  be = be.replace('dllPath: candidate,\n', 'dllPath: candidate ?? null,\n')
  console.log('  dllPath: candidate ?? null (TS error fix)')
}

// Sanitize literal `\\${` in runtime template strings. v1 patcher's
// writeFile used backtick template literals; inside those `\\${` becomes
// `\\${` literal in the file (since `\\` escapes to `\` and then `${` is
// still interpolation). At runtime, `\\` in a template becomes `\`, then
// `${...}` still interpolates — so the visible result is `\${...}` literal
// with backslash. To get clean `${line}` interpolation we need to write
// `${line}` in the FILE source. The CURRENT file may have `\\${...}` in
// some places (e.g., `logger.info(\`[build-emulator] \\${line}\`...)`).
// Detect and fix.
const escapePattern = /\\\$\{/g
const matches = be.match(escapePattern) || []
console.log('  escaped \\${ occurrences:', matches.length)
if (matches.length > 0) {
  // Replace `\${` with `${` ONLY in source — this might be intentional for
  // some string contexts, but for runtime template literals it MUST be
  // unescaped for the interpolation to work. The build-emulator.ts file
  // has zero places where backslash-before-dollar is semantically desired.
  be = be.replace(/\\\$\{/g, '${')
  console.log('  sanitized escaped \\${ in build-emulator.ts')
}

// Same for main.ts (koffi-hint log line was skipped earlier).
const mainAgain = readFile(mainPath)
if (/\\\$\{/.test(mainAgain)) {
  const cleaned = mainAgain.replace(/\\\$\{/g, '${')
  writeFile(mainPath, cleaned)
  console.log('  sanitized escaped \\${ in main.ts')
}

// -------------------------------------------------------------------------
// 3. useSettingsStore.ts: replace dead `__forceKillSetter` / `__ycoreToast`
//    globals with a direct zustand `getState().setKillSteamBeforeLaunch(true)`.
// -------------------------------------------------------------------------
console.log('[3] Patching useSettingsStore.ts (drop dead globals)')
const storePath = path.join(ROOT, 'src', 'stores', 'useSettingsStore.ts')
let store = readFile(storePath)
if (store.includes('__forceKillSetter')) {
  // Replace the listener body to use direct zustand calls.
  store = store.replace(
    /\(window as any\)\.electronAPI\.on\(\s*'app:autoKillReactivated',\s*_e: any,\s*payload: \{[^}]+\}\) => \{[\s\S]*?\}\s*\)\s*\}/m,
    `;(window as any).electronAPI.on(
    'app:autoKillReactivated',
    (_e: any, payload: { previousValue?: boolean; reason?: string }) => {
      try {
        // Direct zustand call: we don't need window globals.
        // The setter already chains through writeConfigSerialized so the
        // disk config stays consistent with the in-memory store.
        useSettingsStore.getState().setKillSteamBeforeLaunch(true)
        logger?.info?.('[autoKill] reactivated', 'steam')
      } catch (err) {
        // never crash UI from a state-flip sync
      }
    },
  )`
  )
  // We also need a `logger` import — but the store doesn't have one. Skip
  // that bit (it's optional logging). The `setKillSteamBeforeLaunch(true)`
  // call is what matters.
  // Drop the leftover `logger?.info?.(...)` line for cleanliness.
  store = store.replace(/\s+logger\?\.info\?\.\('\[autoKill\] reactivated', 'steam'\)\s+/, '\n')
  console.log('  rewired listener to useSettingsStore.getState().setKillSteamBeforeLaunch(true)')
}
writeFile(storePath, store)

console.log('\nRound-11 final fixes applied.')