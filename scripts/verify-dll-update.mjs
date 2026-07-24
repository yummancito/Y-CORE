#!/usr/bin/env node
/**
 * scripts/verify-dll-update.mjs
 *
 * Smoke test for the electron-updater vs ycore.dll staleness fix.
 *
 * Why this exists
 * ---------------
 * electron-updater replaces `app.asar` and unpacked assets under
 * `app.asar.unpacked/`, but it does NOT diff/replace arbitrary native
 * binaries staged outside those paths. The fix in scripts/fix-exe.js
 * (afterPack hook) puts ycore.dll into a uniquely-named versioned
 * directory `resources/native/v${appVersion}/`, so each new release
 * just drops a brand-new folder and never collides with the old one.
 *
 * This script simulates exactly that lifecycle:
 *
 *   1. Stage a fake `ycore.dll` under a temp `win-unpacked/` bundle.
 *   2. Invoke the afterPack hook as if electron-builder did it, with
 *      `packager.appInfo.version = "3.0.1"`. Assert that
 *      `resources/native/v3.0.1/ycore.dll` and `version.json` were
 *      written.
 *   3. Invoke it again with `"3.0.2"` WITHOUT removing the v3.0.1
 *      folder — this emulates a user upgrading from 3.0.1 → 3.0.2.
 *   4. Print a directory diff ("before cleanup"). Assert both
 *      `v3.0.1` and `v3.0.2` coexist.
 *   5. Run the same cleanup logic that
 *      `cleanupStaleNativeVersions()` runs in production
 *      (`resources/native/v*` directories that don't match the current
 *      version get deleted).
 *   6. Print the directory diff ("after cleanup"). Assert that
 *      `v3.0.1` is gone and `v3.0.2` survives.
 *
 * Exit code 0 on success, 1 on any assertion failure.
 */

import { mkdtempSync, writeFileSync, copyFileSync, rmSync, existsSync, readFileSync, readdirSync, mkdirSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const __dirname = dirname(fileURLToPath(import.meta.url))

// Import fix-exe.js (CommonJS default export is the hook function).
const fixExe = require(resolve(__dirname, '..', 'scripts', 'fix-exe.js'))
const hook = fixExe.default || fixExe

const FAKE_DLL_BYTES = Buffer.from('FAKE-YCORE-DLL-CONTENT-FOR-VERIFICATION-ONLY\n', 'utf8')
const VERSIONS = ['3.0.1', '3.0.2']
const TARGET_VERSION = VERSIONS[VERSIONS.length - 1]

let failures = 0
function assert(cond, msg) {
  if (cond) {
    console.log(`  ✓ ${msg}`)
  } else {
    console.error(`  ✗ ${msg}`)
    failures += 1
  }
}
function listNativeDir(nativeDir) {
  if (!existsSync(nativeDir)) return []
  return readdirSync(nativeDir).sort()
}
function readJsonSafe(p) {
  try {
    return JSON.parse(readFileSync(p, 'utf8'))
  } catch {
    return null
  }
}

async function runHookFor(version, appOutDir) {
  // `context` mirrors the shape electron-builder hands to afterPack hooks.
  // El campo real que fix-exe.js inspecciona es `electronPlatformName`
  // (no `packager.platform`), por eso lo seteamos explícitamente.
  await hook({
    electronPlatformName: process.platform === 'win32' ? 'win32' : 'win32',
    packager: { appInfo: { version } },
    appOutDir,
  })
}

async function main() {
  // ---------------------------------------------------------------------
  // Stage
  // ---------------------------------------------------------------------
  const tmpRoot = mkdtempSync(join(tmpdir(), 'ycore-verify-'))
  const appOutDir = join(tmpRoot, 'win-unpacked')
  const resourcesDir = join(appOutDir, 'resources')
  const nativeDir = join(resourcesDir, 'native')
  const stagedDll = join(nativeDir, 'ycore.dll')

  mkdirSync(nativeDir, { recursive: true })
  writeFileSync(stagedDll, FAKE_DLL_BYTES)

  console.log(`\n[verify-dll-update] temp staging dir: ${tmpRoot}`)
  console.log(`[verify-dll-update] staged DLL:       ${stagedDll} (${FAKE_DLL_BYTES.length} bytes)\n`)

  // ---------------------------------------------------------------------
  // Run afterPack twice (simulate 3.0.1 release, then 3.0.2 release on top)
  // ---------------------------------------------------------------------
  for (const version of VERSIONS) {
    console.log(`▶ Running afterPack for v${version}…`)
    await runHookFor(version, appOutDir)

    const versionDir = join(nativeDir, `v${version}`)
    const versionedDll = join(versionDir, 'ycore.dll')
    const manifestPath = join(versionDir, 'version.json')

    assert(existsSync(versionDir), `v${version}/ directory was created`)
    assert(existsSync(versionedDll), `v${version}/ycore.dll was written`)
    assert(existsSync(manifestPath), `v${version}/version.json was written`)

    if (existsSync(versionedDll)) {
      const sizeBytes = statSync(versionedDll).sizeBytes || statSync(versionedDll).size
      assert(sizeBytes === FAKE_DLL_BYTES.length, `v${version}/ycore.dll size matches staged source`)
    }
    const manifest = readJsonSafe(manifestPath)
    assert(manifest !== null, `v${version}/version.json is valid JSON`)
    assert(manifest?.packedFor === version, `v${version}/version.json.packedFor === "${version}"`)
    assert(typeof manifest?.dllFileSha256 === 'string' && manifest.dllFileSha256.length === 64,
      `v${version}/version.json.dllFileSha256 is a 64-char hex string`)
  }

  // ---------------------------------------------------------------------
  // BEFORE cleanup: both versioned dirs should coexist
  // ---------------------------------------------------------------------
  console.log(`\n── Directory diff BEFORE cleanup ──`)
  console.log(`  ${nativeDir}`)
  const beforeDirs = listNativeDir(nativeDir)
  beforeDirs.forEach((d) => console.log(`    📁 ${d}/`))
  console.log()
  for (const v of VERSIONS) {
    assert(beforeDirs.includes(`v${v}`), `v${v} present before cleanup (simulating installed state)`)
  }

  // ---------------------------------------------------------------------
  // Simulate cleanupStaleNativeVersions() — same logic, inline so this
  // test doesn't need to import the TS module (electron-only deps).
  // ---------------------------------------------------------------------
  console.log(`▶ Running cleanup logic (keep v${TARGET_VERSION}, delete others)…`)
  for (const entry of beforeDirs) {
    if (entry.startsWith('v') && entry !== `v${TARGET_VERSION}`) {
      const target = join(nativeDir, entry)
      rmSync(target, { recursive: true, force: true })
      console.log(`    🗑  removed ${entry}/`)
    }
  }

  // ---------------------------------------------------------------------
  // AFTER cleanup: only the current version survives
  // ---------------------------------------------------------------------
  console.log(`\n── Directory diff AFTER cleanup ──`)
  console.log(`  ${nativeDir}`)
  const afterDirs = listNativeDir(nativeDir)
  afterDirs.forEach((d) => console.log(`    📁 ${d}/`))
  console.log()

  assert(afterDirs.includes(`v${TARGET_VERSION}`), `v${TARGET_VERSION} survives cleanup`)
  for (const v of VERSIONS) {
    if (v === TARGET_VERSION) continue
    assert(!afterDirs.includes(`v${v}`), `v${v} was removed by cleanup`)
  }

  // ---------------------------------------------------------------------
  // Cleanup the temp dir (no matter what)
  // ---------------------------------------------------------------------
  try { rmSync(tmpRoot, { recursive: true, force: true }) } catch {}

  // ---------------------------------------------------------------------
  // Verdict
  // ---------------------------------------------------------------------
  console.log()
  if (failures === 0) {
    console.log(`✅ All assertions passed. Update simulation works as expected.\n`)
    process.exit(0)
  } else {
    console.error(`❌ ${failures} assertion(s) failed.\n`)
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('[verify-dll-update] fatal:', err)
  process.exit(1)
})
