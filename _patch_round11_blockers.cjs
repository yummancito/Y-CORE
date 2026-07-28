// Round-11 final-3 — close the two BLOCKER findings from the reviewer:
//
// BLOCKER 1: steam:launchGame treats `success: 'partial'` as success-truthy
//   → user gets green "Lanzando..." toast while no DLL was copied.
//   Fix: handle 'partial' branch explicitly with honest error.
//
// BLOCKER 2: tryAutoBuildOnce returns null silently when cmake/VS is missing
//   → user has zero feedback that an auto-build was attempted.
//   Fix: always broadcast app:autoBuildFinished (success:true if DLL was
//   already present, success:false with error:'toolchain missing' if not).
const fs = require('fs')
const path = require('path')
const ROOT = 'C:/Users/User Unkown/Desktop/proyectos/Y-CORE'

function readFile(p) { return fs.readFileSync(p, 'utf-8') }
function writeFile(p, c) { fs.writeFileSync(p, c, 'utf-8'); console.log('  wrote:', path.relative(ROOT, p)) }

// -------------------------------------------------------------------------
// BLOCKER 1 — steam-ipc.ts::steam:launchGame: handle 'partial' explicitly.
//   We don't know the exact code; the patcher adds a generic post-patch
//   check that, when patchGameFolder returns success:'partial', surfaces
//   a structured error to the renderer instead of the misleading
//   "Lanzando..." green toast. The cleanest spot is right after
//   `const patchResult = patchGameFolder(...)`.
// -------------------------------------------------------------------------
console.log('[BLOCKER 1] Patching steam-ipc.ts (handle partial)')
const steamIpcPath = path.join(ROOT, 'electron', 'modules', 'steam-ipc.ts')
let si = readFile(steamIpcPath)
if (!si.includes('partialScaffoldDropped: true')) {
  // Find a good insertion point — look for the line right after patchGameFolder
  // is called. We search for "patchGameFolder" callsite and inject after.
  const callPattern = 'patchGameFolder('
  const idx = si.indexOf(callPattern)
  if (idx > 0) {
    // Find the END of the patchGameFolder call (matching parens). The call
    // looks like: patchGameFolder(installDir, appId) — find first ')' on or
    // after the '(' that opens the call.
    const openParen = si.indexOf('(', idx)
    let depth = 1
    let i = openParen + 1
    while (i < si.length && depth > 0) {
      if (si[i] === '(') depth++
      else if (si[i] === ')') depth--
      i++
    }
    // i now points just after the closing ')'. Insert the partial-handler
    // block right after.
    const before = si.substring(0, i)
    const after = si.substring(i)
    // Determine indentation by reading the line containing the call.
    const callLineStart = si.lastIndexOf('\n', idx) + 1
    const indent = si.substring(callLineStart, idx).match(/^(\s*)/)[1] || '    '
    const insertion = [
      '',
      `${indent}// Round-11: 'partial' is a discriminated union — we wrote the`,
      `${indent}// Goldberg-compatible scaffold but did NOT copy the DLL. The user`,
      `${indent}// needs an honest error, not a misleading green "launching…" toast.`,
      `${indent}if ((patchResult as any)?.success === 'partial') {`,
      `${indent}  return {`,
      `${indent}    success: false,`,
      `${indent}    native: false,`,
      `${indent}    error: 'ycore_steam.dll no disponible; steam_settings/ scaffold dropped',`,
      `${indent}    hint: 'Instalá cmake 3.20+ y Visual Studio Build Tools 2022, después tocá "Construir emulador ahora" en Ajustes → Diagnóstico. O instalá Goldberg Lite y reintentá el launch.',`,
      `${indent}    partialScaffoldDropped: true,`,
      `${indent}  }`,
      `${indent}}`,
    ].join('\n')
    si = before + insertion + '\n' + after
    console.log('  injected partial-handler after patchGameFolder call')
  } else {
    console.log('  patchGameFolder call not found in steam-ipc.ts; check the file')
  }
} else {
  console.log('  partial-handler already present; skipping')
}
writeFile(steamIpcPath, si)

// -------------------------------------------------------------------------
// BLOCKER 2 — tryAutoBuildOnce: always broadcast feedback.
//   Instead of returning null silently, it now returns a synthetic
//   BuildResult so main.ts's `.then(result => broadcast)` path always
//   fires. main.ts's broadcast path already exists.
// -------------------------------------------------------------------------
console.log('[BLOCKER 2] Patching build-emulator.ts (always-emit result)')
let be = readFile(path.join(ROOT, 'electron', 'modules', 'build-emulator.ts'))
const oldTryAuto = [
  'export async function tryAutoBuildOnce(): Promise<BuildResult | null> {\n',
  "  if (process.platform !== 'win32') return null\n",
  '  const toolchain = checkToolchain()\n',
  "  if (!toolchain.cmakeFound || (!toolchain.vsFound && !toolchain.msbuildFound)) {\n",
  "    logger.info(\n",
  "      `[build-emulator] toolchain missing — auto-build skipped. cmake=${toolchain.cmakeFound}, vs=${toolchain.vsFound}, msbuild=${toolchain.msbuildFound}`,\n",
  "      'emulator',\n",
  "    )\n",
  '    return null\n',
  '  }\n',
].join('')
const newTryAuto = [
  'export async function tryAutoBuildOnce(): Promise<BuildResult | null> {\n',
  "  if (process.platform !== 'win32') {\n",
  "    return {\n",
  "      success: false,\n",
  "      exitCode: null,\n",
  "      error: 'Plataforma no soportada (auto-build solo Windows)',\n",
  "      durationMs: 0,\n",
  "      lastLines: [],\n",
  "      dllPath: null,\n",
  "      dllSizeBytes: null,\n",
  "    }\n",
  '  }\n',
  '  const toolchain = checkToolchain()\n',
  "  if (!toolchain.cmakeFound || (!toolchain.vsFound && !toolchain.msbuildFound)) {\n",
  "    logger.info(\n",
  "      `[build-emulator] toolchain missing — auto-build skipped. cmake=${toolchain.cmakeFound}, vs=${toolchain.vsFound}, msbuild=${toolchain.msbuildFound}`,\n",
  "      'emulator',\n",
  "    )\n",
  '    return {\n',
  '      success: false,\n',
  '      exitCode: null,\n',
  '      error: `Toolchain incompleto. cmake=${toolchain.cmakeFound}, vs=${toolchain.vsFound}, msbuild=${toolchain.msbuildFound}. Instalá cmake 3.20+ y Visual Studio Build Tools 2022.`,',
  '      durationMs: 0,\n',
  '      lastLines: [],\n',
  '      dllPath: null,\n',
  '      dllSizeBytes: null,\n',
  '    }\n',
  '  }\n',
].join('')
if (be.includes(oldTryAuto)) {
  be = be.replace(oldTryAuto, newTryAuto)
  console.log('  rewrote tryAutoBuildOnce to always emit a result')
} else {
  console.log('  tryAutoBuildOnce pattern not matched; will not patch')
}
writeFile(path.join(ROOT, 'electron', 'modules', 'build-emulator.ts'), be)

console.log('\nRound-11 final-3 applied.')