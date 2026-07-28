// Round-10 follow-up — LibraryPage still has the old useRef<Set> +
// setTimeout(1500) deduper. The fix patcher's str_replace failed because
// the matched comment text drifted when the previous patcher wrote it.
// Replace the OLD block with launchDedup-based code by regex anchor.

import fs from 'node:fs'
const file = 'src/pages/LibraryPage.tsx'
const raw = fs.readFileSync(file, 'utf8')
const isCRLF = raw.includes('\r\n')
const src = raw.replace(/\r\n/g, '\n')

// Anchor: from "const launchInFlightRef" up to (and including) the closing
// `}, [showToast])` of handleLaunchGame. Regex non-greedy with [^\n]* keeps
// it intra-line; we still need DOTALL for the multiline block.
const re = /  \/\/ Round-10[\s\S]*?setTimeout\(\(\) => \{ launchInFlightRef\.current\.delete\(appId\) \}, 1500\)\n    \}\n  \}, \[showToast\]\)/

if (!re.test(src)) {
  console.error('FAIL — old launchInFlightRef block not found in', file)
  process.exit(1)
}

const replacement = `  // Round-10 (debouncer): launchDedup (src/lib/launch-deduper.ts) is a
  // module-scoped Promise<unknown> tracker shared across LibraryPage and
  // GameDetailPage. The promise lifecycle gates each appId cleanly — no
  // fixed 1500ms timeout, no thrashing on slow Steamless scans.
  const handleLaunchGame = useCallback(async (appId: string) => {
    if (!appId) return
    const result = await launchDedup(appId, () => window.steamtools.launchGame(appId))
    if (result === null) return // already in-flight from another click

    if (result.success) {
      // Friendly baseline toast.
      showToast('success', t('library.launching'))
      // Transparent Steam-state copy — disambiguates "Y-core launched it" vs
      // "Steam was already running independently".
      const wasAlive = result.wasSteamAliveAtLaunch === true
      const wasKilled = result.killedSteamBeforeLaunch === true
      if (wasKilled) {
        showToast(
          'info',
          'Steam estaba activo y fue terminado antes del launch. Y-core corre 100% independiente.',
        )
      } else if (wasAlive) {
        showToast(
          'info',
          'Steam estaba activo en tu sistema pero Y-core lanzó el juego nativamente. Steam NO es el launcher — para verificación visual, activá "Matar Steam antes de cada launch" en Ajustes.',
        )
      } else {
        showToast(
          'info',
          'Steam NO estaba corriendo. El juego se lanzó independientemente desde Y-core.',
        )
      }
    } else {
      showToast('error', parseError(result.error, 'library.launchFailed'))
    }
  }, [showToast])`

const out = src.replace(re, replacement)
const finalOut = isCRLF ? out.replace(/\n/g, '\r\n') : out
fs.writeFileSync(file, finalOut, 'utf8')
console.log('OK  LibraryPage.tsx :: handleLaunchGame switch to launchDedup')
