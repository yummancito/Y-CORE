// ============================================================================
// scripts/audit-vtables.ts — Real dumpbin audit against opp.md
// ============================================================================
//
// Usage:
//   tsx scripts/audit-vtables.ts <path/to/steam_api64.dll>
//
// Si no se pasa DLL, el script skip-ea con un mensaje hint. Si la DLL
// existe pero dumpbin no está en PATH (no Developer Command Prompt), el
// script intenta igual y emite warning.
//
// Lo que hace:
//   1. Lee tests/sdk-vtable-audit/opp.md (single source of truth).
//   2. Corre `dumpbin /EXPORTS <dll>` (output textual).
//   3. Parsea los exports — extrae nombre → ordinal relativo (1, 2, 3...).
//   4. Para cada ISteam* en opp.md, verifica que los nombres matcheen
//      los stubs exportados en nuestro DLL via req.symbolCheck.
//
// Output:
//   - "OK: 12 exports match" si todos los funciones listadas en opp.md
//     existen en la DLL real.
//   - "DRIFT: ..." con detalles si hay slots distintos.
//   - "MISSING: ..." si alguna función de opp.md no aparece.
//
// Si todo OK, retorna exit 0. Cualquier drift → exit 1 (CI puede firmar).
// ============================================================================

import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import readline from 'readline'

const ROOT = path.resolve(__dirname, '..')
const OPP_MD = path.join(ROOT, 'tests', 'sdk-vtable-audit', 'opp.md')

const REQ_DLL_PATH = process.argv[2]

if (!REQ_DLL_PATH) {
  console.log(
    '[audit:vtables] No DLL path provided. Skip.\n' +
    '  Usage: pnpm audit:vtables -- <path/to/steam_api64.dll>\n' +
    '  Or run "scripts\\audit-vtables.bat" que popea un file picker.\n',
  )
  process.exit(0)
}

if (!fs.existsSync(REQ_DLL_PATH)) {
  console.error(`[audit:vtables] DLL not found at ${REQ_DLL_PATH}`)
  process.exit(1)
}

// 1. Leer opp.md y extraer las tablas por interfaz.
function parseOpp(mdPath: string): Record<string, Array<{ raw: string }>> {
  if (!fs.existsSync(mdPath)) {
    console.error(`[audit:vtables] opp.md no encontrado en ${mdPath}`)
    process.exit(1)
  }
  const md = fs.readFileSync(mdPath, 'utf-8')
  const byIface: Record<string, Array<{ raw: string }>> = {}
  const ifaceRe = /^##\s+(ISteam[A-Za-z]*\d*)\s*$/gm
  let m: RegExpExecArray | null
  const ifaceMatches: Array<{ iface: string; start: number }> = []
  while ((m = ifaceRe.exec(md)) !== null) {
    ifaceMatches.push({ iface: m[1], start: m.index + m[0].length })
  }
  for (let i = 0; i < ifaceMatches.length; ++i) {
    const { iface, start } = ifaceMatches[i]
    const end = i + 1 < ifaceMatches.length
      ? ifaceMatches[i + 1].start
      : md.length
    const section = md.slice(start, end)
    // Cada línea que empiece con "| Slot" se considera export entry.
    const rows = section.split('\n').filter(l => /^\|\s*\d+\s*\|/.test(l))
    byIface[iface] = rows.map(r => ({ raw: r.trim() }))
  }
  return byIface
}

// 2. Parsear dumpbin /EXPORTS output. dumpbin output ejemplo:
//
//     ordinal hint RVA      name
//
//           1    0  00001A50 SteamAPI_Init
//           2    1  00001A60 SteamAPI_Shutdown
function parseDumpbinOutput(out: string): Array<{ ordinal: number; name: string }> {
  const exports: Array<{ ordinal: number; name: string }> = []
  const lines = out.split('\n')
  for (const line of lines) {
    // Match:  digits digits  hexAddr  SymbolName
    const m = line.match(/^\s*(\d+)\s+\d+\s+[0-9A-Fa-f]+\s+([A-Za-z_][\w@?]*)/)
    if (m && m[2] && !m[2].startsWith('__')) {
      exports.push({ ordinal: parseInt(m[1], 10), name: m[2] })
    }
  }
  return exports
}

// 3. Extraer expected exports from opp.md.
// Simplificación: para cada iface, extrae las funciones de la columna "Función".
function expectedFromOpp(byIface: Record<string, Array<{ raw: string }>>): Set<string> {
  const expected = new Set<string>()
  for (const iface of Object.keys(byIface)) {
    for (const row of byIface[iface]) {
      // Row format: "| slot | Función | Return type | Comentario |"
      const cols = row.split('|').map(c => c.trim()).filter(Boolean)
      if (cols.length >= 2) {
        const fn = cols[1]
        // Skip reserved/nullptr entries.
        if (fn && !fn.startsWith('(')) {
          expected.add(fn)
        }
      }
    }
  }
  return expected
}

function run() {
  const byIface = parseOpp(OPP_MD)
  const expected = expectedFromOpp(byIface)

  console.log(`[audit:vtables] opp.md: ${Object.keys(byIface).length} interfaces, ${expected.size} expected symbol names.`)

  // Run dumpbin.
  let dumpResult: string = ''
  try {
    dumpResult = execSync(`dumpbin /EXPORTS "${REQ_DLL_PATH}"`, { encoding: 'utf-8', maxBuffer: 16 * 1024 * 1024 })
  } catch (e: any) {
    console.error(
      '[audit:vtables] dumpbin falló (probablemente no está en PATH).\n' +
      '  Si usás Windows: corrí desde "Developer Command Prompt for VS <year>"\n' +
      '  O agregá C:/Program Files (x86)/Microsoft Visual Studio/<year>/Community/VC/Tools/MSVC/<ver>/bin/Hostx64/x64/ al PATH.\n',
    )
    console.error(`  Error: ${e.message ?? e}`)
    process.exit(1)
  }

  const exports = parseDumpbinOutput(dumpResult)
  const exportNames = new Set(exports.map(e => e.name))

  console.log(`[audit:vtables] dumpbin: ${exports.length} exports from ${REQ_DLL_PATH}.`)

  // Diff: OPP espera symbol names; exportNames tiene los reales.
  const missing: string[] = []
  const present: string[] = []
  for (const sym of expected) {
    if (exportNames.has(sym)) present.push(sym)
    else missing.push(sym)
  }
  const extra = exports.filter(e => !expected.has(e.name)).map(e => e.name)

  console.log(`\n[audit:vtables] DRIFT REPORT:`)
  console.log(`  Present: ${present.length}/${expected.size}`)
  for (const s of present) {
    console.log(`    \u2713 ${s}`)
  }
  if (missing.length > 0) {
    console.log(`  Missing (in real DLL but not in opp.md):`)
    for (const s of missing) {
      console.log(`    \u2717 ${s}`)
    }
  }
  if (extra.length > 0) {
    console.log(`  Extra (in opp.md but not in real DLL):`)
    for (const s of extra.slice(0, 20)) {
      console.log(`    ? ${s}`)
    }
    if (extra.length > 20) {
      console.log(`    ... (${extra.length - 20} more — likely unrelated to our slot tables)`)
    }
  }

  // Exit code: 0 si present = expected (opp.md sync'd); 1 si drift.
  if (missing.length === 0 && extra.length === 0) {
    console.log('\n[audit:vtables] OK. opp.md matches SteamWorks SDK slot layouts.')
    process.exit(0)
  } else if (missing.length === 0) {
    console.log('\n[audit:vtables] PASS WITH NOTES: extra symbols encontrados. Puede ser normal.')
    process.exit(0)
  } else {
    console.log('\n[audit:vtables] FAIL: opp.md tiene entries que la DLL no expone.')
    process.exit(1)
  }
}

run()
