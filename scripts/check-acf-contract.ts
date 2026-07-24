#!/usr/bin/env -S npx tsx
// scripts/check-acf-contract.ts
//
// Pre-rebuild assertion. Verifica que el call site y la firma de
// `createAppManifestFromLua` estén alineados posición-a-posición.
// Catches the ACF path corruption regression ("appmanifest_<full-path>.acf").
// Standalone: `pnpm check:acf-contract`. Wired into `prebuild`.
// Note: shebang is GNU-coreutils only; on Windows cmd.exe invocá via pnpm.

import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '..')
const CALLER_FILE = path.join(ROOT, 'electron/modules/manifest-sync.ts')
const DEF_FILE = path.join(ROOT, 'electron/modules/acf.ts')
const FUNCNAME = 'createAppManifestFromLua'

interface Part {
  name: string
  optional: boolean
}

/** Splits a parenthesised param/arg list, returning clean (name, optional) pairs. */
function splitParens(body: string): Part[] {
  return body
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((s) => ({
      name: s.split(/[:=?]/)[0].trim().replace(/^['"]|['"]$/g, ''),
      optional: /\?/.test(s) || /=/.test(s),
    }))
}

/**
 * Strip block + line comments so JSDoc `@example` references and inline
 * `// createAppManifestFromLua(...)` notes don't bump the multi-occurrence
 * count. Without this, the moment someone adds documentation showing the
 * signature, the script falsely fails with `found 2`.
 *
 * Note: line comments are only stripped at line start (after newline or
 * start-of-file) to avoid clipping URLs like `https://example.com/foo`.
 */
function stripComments(src: string): string {
  return src
    // Block comments (multi-line, non-greedy).
    .replace(/\/\*[\s\S]*?\*\//g, '')
    // Line comments anchored to start-of-line or just-after-newline.
    .replace(/(^|\n)[ \t]*\/\/[^\n]*/g, '$1')
}

function readSafe(file: string): string {
  try {
    return fs.readFileSync(file, 'utf-8')
  } catch (err) {
    fail(`cannot read ${file}: ${(err as Error).message}`)
  }
}

try {
  const callerSrc = readSafe(CALLER_FILE)
  const defSrc = readSafe(DEF_FILE)

  // Strip comments before counting so JSDoc `@example` snippets and inline
  // `// createAppManifestFromLua(...)` notes don't bump the count.
  const callerNoComments = stripComments(callerSrc)
  const defNoComments = stripComments(defSrc)

  // Multi-occurrence guard: la veracidad del chequeo depende de que haya
  // exactamente 1 call site y 1 def. Si alguien agrega una segunda llamada
  // (helper, JSDoc, etc.), queremos que el script LO SEPA en vez de verificar
  // silenciosamente solo el primero.
  const callCount = (callerNoComments.match(new RegExp(`${FUNCNAME}\\s*\\(`, 'g')) ?? []).length
  const defCount = (defNoComments.match(new RegExp(`export\\s+function\\s+${FUNCNAME}\\s*\\(`, 'g')) ?? []).length
  if (callCount !== 1) fail(`expected exactly 1 call site in ${CALLER_FILE}, found ${callCount}`)
  if (defCount !== 1) fail(`expected exactly 1 def in ${DEF_FILE}, found ${defCount}`)

  const callParts = splitParens(
    callerSrc.match(new RegExp(`${FUNCNAME}\\s*\\(([\\s\\S]*?)\\)`))![1],
  )
  const defParts = splitParens(
    defSrc.match(new RegExp(`export\\s+function\\s+${FUNCNAME}\\s*\\(([\\s\\S]*?)\\)`))![1],
  )

  // The call site cannot pass more args than the def has.
  if (callParts.length > defParts.length) {
    fail(`call passes ${callParts.length} args but def has only ${defParts.length}`)
  }

  // Any def params omitted by the call site must be optional (`?:` or `= default`).
  for (let i = callParts.length; i < defParts.length; i++) {
    if (!defParts[i].optional) {
      fail(
        `call omits REQUIRED tail param '${defParts[i].name}' at position #${i + 1}`,
      )
    }
  }

  // Positional name match — literals (`'anonymous'`, `1024`) skip the name check.
  for (let i = 0; i < callParts.length; i++) {
    const arg = callParts[i].name
    if (Number.isFinite(+arg) || /^['"]/.test(arg)) continue
    if (arg !== defParts[i].name) {
      fail(
        `position #${i + 1} mismatch: call passes '${arg}' but def expects '${defParts[i].name}'\n` +
          `  full call: [${callParts.map((p) => p.name).join(', ')}]\n` +
          `  full def:  [${defParts.map((p) => p.name).join(', ')}]\n` +
          `\n` +
          `This is the ACF path corruption pattern (filename contains the path string).`,
      )
    }
  }

  console.log(
    `✓ check-acf-contract: ${callParts.length}/${defParts.length} params aligned [${callParts.map((p) => p.name).join(', ')}]`,
  )
} catch (err) {
  fail((err as Error).message)
}

function fail(reason: string): never {
  console.error(`✗ check-acf-contract: contract MISMATCH`)
  console.error(`  ${reason}`)
  console.error(`\nResolve: align position N by name in both files.`)
  process.exit(1)
}
