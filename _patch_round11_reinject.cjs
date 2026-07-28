// Round-11 reinject — CRLF-aware. The file uses Windows-style \r\n line endings;
// my previous anchor used just \n which never matched. This version normalizes
// both ends before matching so the substitution lands regardless.

const fs = require('fs')
const path = require('path')
const ROOT = 'C:/Users/User Unkown/Desktop/proyectos/Y-CORE'

const mainPath = path.join(ROOT, 'electron', 'main.ts')
let raw = fs.readFileSync(mainPath, 'utf-8')

// Detect line ending style
const isCRLF = raw.includes('\r\n')
const NL = isCRLF ? '\r\n' : '\n'
console.log('line ending style:', isCRLF ? 'CRLF' : 'LF')

const anchorLine = `  logger.info('Splash, window and tray created', 'app')`
const anchorWithNL = anchorLine + NL

// Guard: don't double-insert if a previous run already injected the blocks.
const insertionMarker = '[emulator-toolchain] cmake=' + '${t.cmakeFound}'
if (raw.includes('[emulator-toolchain] cmake=')) {
  console.log('  IIFE blocks already present; skipping')
  process.exit(0)
}

const blockLines = [
  '',
  '  // ── Round-11: emulator toolchain check + auto-build kick-off ─────────────',
  '  // Best-effort, never blocks the splash. If cmake + MSVC are present and',
  '  // the DLL is missing in the dev tree, we kick off a silent build. The',
  '  // user gets a one-shot info banner once the build finishes (success or',
  "  // fail) via `app:autoBuildFinished`.",
  '  ;(() => {',
  '    try {',
  '      const t = checkToolchain()',
  '      logger.info(',
  '        `[emulator-toolchain] cmake=${t.cmakeFound} (v${t.cmakeVersion ?? "n/a"}) vs=${t.vsFound} (v${t.vsVersion ?? "n/a"}) msbuild=${t.msbuildFound} buildScript=${t.buildScriptExists}`,',
  "        'emulator',",
  '      )',
  '    } catch (err: any) {',
  '      logger.warn(`[emulator-toolchain] check crash: ${err?.message ?? err}`, "emulator")',
  '    }',
  '  })()',
  '',
  '  if (!isLocalSteamEmulatorAvailable()) {',
  '    setImmediate(() => {',
  '      tryAutoBuildOnce()',
  '        .then(result => {',
  '          if (!result) return // toolchain missing OR DLL already present',
  '          if (result.success) {',
  '            logger.info(',
  '              `[emulator] auto-build OK in ${result.durationMs}ms — DLL=${result.dllPath} (${result.dllSizeBytes}B). NOTE: koffi keeps the prior load handle in this process; restart Y-core to bind the freshly-built code.`,',
  "              'emulator',",
  '            )',
  '            for (const win of BrowserWindow.getAllWindows()) {',
  "              try { win.webContents.send('app:autoBuildFinished', { success: true, dllPath: result.dllPath, durationMs: result.durationMs }) } catch {}",
  '            }',
  '          } else {',
  '            logger.warn(`[emulator] auto-build FAILED: ${result.error} (exit=${result.exitCode})`, "emulator")',
  '            for (const win of BrowserWindow.getAllWindows()) {',
  "              try { win.webContents.send('app:autoBuildFinished', { success: false, error: result.error, exitCode: result.exitCode }) } catch {}",
  '            }',
  '          }',
  '        })',
  '        .catch(err => {',
  '          logger.warn(`[emulator] auto-build crash: ${err?.message ?? err}`, "emulator")',
  '        })',
  '    })',
  '  }',
  '',
  '  // ── Round-11: auto-reactivate killSteamBeforeLaunch when Steam is alive ────',
  "  // The user's mandate: 'no se lanze via steam, solo via app'. The Round-10",
  '  // auto-enable only fired when the disk config had NO key — if the user',
  "  // toggled it OFF previously, the `false` was persisted forever. We now",
  '  // check Steam state at startup: if it\'s alive AND the user hasn\'t already',
  '  // opted in, we force killSteamBeforeLaunch=true for this session and',
  '  // persist immediately. The renderer shows a one-time toast so the user',
  '  // understands why the flag flipped.',
  '  ;(async () => {',
  '    try {',
  '      const alive = await isSteamRunning()',
  "      if (!alive) return // Steam not running — user's preference respected",
  '      const cfg = await backendConfigService.read().catch(() => null as any)',
  '      if (!cfg) return',
  '      const cur = (cfg as any).killSteamBeforeLaunch',
  '      // Only flip if currently false (user previously disabled). The user',
  '      // can still override via Settings after they see the toast.',
  '      if (cur === false) {',
  '        await backendConfigService.write({ ...cfg, killSteamBeforeLaunch: true }).catch(() => {})',
  "        logger.info('[auto-kill] Steam alive at startup + flag was false — reactivated killSteamBeforeLaunch=true.', 'steam')",
  '        for (const win of BrowserWindow.getAllWindows()) {',
  "          try { win.webContents.send('app:autoKillReactivated', { previousValue: false, reason: 'Steam alive at startup' }) } catch {}",
  '        }',
  '      } else if (cur === undefined) {',
  '        // Fresh install: auto-enable for the first time.',
  '        await backendConfigService.write({ ...cfg, killSteamBeforeLaunch: true }).catch(() => {})',
  '        for (const win of BrowserWindow.getAllWindows()) {',
  "          try { win.webContents.send('app:autoKillReactivated', { previousValue: undefined, reason: 'Fresh install: Steam alive at startup' }) } catch {}",
  '        }',
  '      }',
  '    } catch (err: any) {',
  "      logger.warn(`[auto-kill] check crash: ${err?.message ?? err}`, 'steam')",
  '    }',
  '  })()',
  '',
]
const block = blockLines.join(NL)

if (raw.includes(anchorWithNL)) {
  raw = raw.replace(anchorWithNL, anchorWithNL + block)
  fs.writeFileSync(mainPath, raw, 'utf-8')
  console.log('  inserted IIFE blocks after splash/tray line')
} else {
  console.log('  anchor STILL not found — line content might differ')
  console.log('  expected:', JSON.stringify(anchorWithNL))
  // Try fallback: search for the line without \n and insert at the line break
  const altAnchor = anchorLine + NL
  if (raw.includes(altAnchor)) {
    console.log('  alt anchor matched; inserting')
    raw = raw.replace(altAnchor, altAnchor + block)
    fs.writeFileSync(mainPath, raw, 'utf-8')
    console.log('  inserted via alt anchor')
  } else {
    console.log('  no anchor matched; aborting')
    process.exit(1)
  }
}
console.log('  wrote:', path.relative(ROOT, mainPath))