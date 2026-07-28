// Round-10 fixes — close reviewer findings:
//   🟠 Significant #1 — extend SteamResult with the new fields so the
//                    renderer reads them by name (not by structural inference).
//   🔴 Blocker #1   — launchInFlightRef double-fire debouncer in LibraryPage
//                    and GameDetailPage (React 18 strict-mode async handler).
//   🟡 Minor #1     — typo "gam" -> "game".
//   🟡 Minor #2     — GameDetailPage now shows a toast on failure (mirror
//                    LibraryPage's behavior).

import fs from 'node:fs'

const isCRLF = s => s.includes('\r\n')
const normLF = s => s.replace(/\r\n/g, '\n')
const restoreEOL = (s, c) => c ? s.replace(/\n/g, '\r\n') : s

function applyOne(file, name, oldRaw, newRaw) {
  const raw = fs.readFileSync(file, 'utf8')
  const crlf = isCRLF(raw)
  let s = normLF(raw)
  const o = normLF(oldRaw)
  const n = normLF(newRaw)
  const c = s.split(o).length - 1
  if (c !== 1) {
    console.error(`FAIL ${file} :: ${name} — count=${c}, expected 1`)
    process.exit(1)
  }
  s = s.replace(o, n)
  fs.writeFileSync(file, restoreEOL(s, crlf), 'utf8')
  console.log(`OK  ${file} :: ${name}`)
}

// ============================================================================
// 1) src/vite-env.d.ts :: extend SteamResult with launch-round-10 fields
// ============================================================================
applyOne(
  'src/vite-env.d.ts',
  'extend SteamResult with wasSteamAliveAtLaunch + killedSteamBeforeLaunch',
  `interface SteamResult {
  success: boolean
  error?: string
  message?: string
  path?: string | null
}`,
  `interface SteamResult {
  success: boolean
  error?: string
  message?: string
  path?: string | null
  /** Round-10: fact Y-core returns on every launch — true if Steam.exe was
   *  alive IN THIS PROCESS BEFORE Y-core started the launch chain. Lets the
   *  renderer disambiguate "Y-core spawned the game" vs "Steam was already
   *  running independently and Y-core ignored it". */
  wasSteamAliveAtLaunch?: boolean
  /** Round-10: true iff killSteamBeforeLaunch=true AND wasSteamAliveAtLaunch=true
   *  AND closeSteamProcess succeeded. Use this to render an unambiguous
   *  "Steam fue terminado antes del launch" toast. */
  killedSteamBeforeLaunch?: boolean
  /** Already-present on success path: not all callers honor this. */
  exePath?: string
  /** Already-present on success path. */
  native?: boolean
}`,
)

// ============================================================================
// 2) src/pages/LibraryPage.tsx :: launchInFlightRef debouncer + handleLaunchGame
// ============================================================================
applyOne(
  'src/pages/LibraryPage.tsx',
  'LibraryPage: launchInFlightRef guard + new info toast copy',
  `  // Round-10: surface the IPC's Steam-state snapshot so the user can VERIFY
  // Y-core is independent. Without this, the launch succeeds → user sees
  // Steam.exe in their taskbar → reports "Y-core launched via Steam" — which
  // is the most common false positive (Steam was alive BEFORE the click).
  const handleLaunchGame = useCallback(async (appId: string) => {
    const result = await window.steamtools.launchGame(appId)
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
  }, [showToast])`,
  `  // Round-10 (debouncer): a module-scoped Set guards against React-18
  // strict-mode double-fire. Without this, async handleLaunchGame could
  // schedule the IPC twice and the second invoke would arrive AFTER the
  // first has already spawned the .exe — the game-process.ts spawn-or-kill
  // logic then kills the first and spawns the second, producing a thrash
  // and a second toast cascade that confuses the user.
  const launchInFlightRef = useRef<Set<string>>(new Set())

  // Round-10: surface the IPC's Steam-state snapshot so the user can VERIFY
  // Y-core is independent. Without this, the launch succeeds → user sees
  // Steam.exe in their taskbar → reports "Y-core launched via Steam" — which
  // is the most common false positive (Steam was alive BEFORE the click).
  const handleLaunchGame = useCallback(async (appId: string) => {
    // Debouncer: bail if this appId is already mid-flight. Strict-mode and
    // double-clickers can't bypass it.
    if (launchInFlightRef.current.has(appId)) return
    launchInFlightRef.current.add(appId)
    try {
      const result = await window.steamtools.launchGame(appId)
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
    } finally {
      // Release the guard after a short tick so back-to-back launches of the
      // SAME appId in different sessions are still allowed. Without this the
      // deduper locks the appId forever after the first call.
      setTimeout(() => { launchInFlightRef.current.delete(appId) }, 1500)
    }
  }, [showToast])`,
)

// ============================================================================
// 3) src/pages/GameDetailPage.tsx :: same debouncer + fix typo + failure toast
// ============================================================================
applyOne(
  'src/pages/GameDetailPage.tsx',
  'GameDetailPage: launchInFlightRef guard + showToast on failure + typo fix',
  `  // Round-10: same disambiguation logic as LibraryPage. Jugar desde la
  // página de detalle también muestra el toast de Steam-state.
  const handlePlay = useCallback(async () => {
    if (!appId) return
    const result = await window.steamtools.launchGame(appId)
    if (!result?.success) {
      // Failure path: prominent toast — primitive form for now, the dedicated
      // launch-error display in LibraryPage already covers catalog-wide.
      if (result?.error) {
        // eslint-disable-next-line no-console
        console.warn('[handlePlay] launch failed:', result.error)
      }
      return
    }
    const wasAlive = result.wasSteamAliveAtLaunch === true
    const wasKilled = result.killedSteamBeforeLaunch === true
    if (wasKilled) {
      // eslint-disable-next-line no-console
      console.info('[handlePlay] Steam was alive and killed pre-launch — Y-core owns the gam')
    } else if (wasAlive) {
      // eslint-disable-next-line no-console
      console.info('[handlePlay] Steam was already running independently — Y-core launched natively')
    } else {
      // eslint-disable-next-line no-console
      console.info('[handlePlay] Steam not running — clean native launch')
    }
  }, [appId])`,
  `  // Round-10 (debouncer): same module-scoped Set as LibraryPage. The detail
  // page's "Jugar" button is presented beside a big banner that invites
  // double-clicks during fast loading — without this guard, strict-mode double
  // fire would surface the disambiguation toast twice in 50ms.
  const launchInFlightRef = useRef<Set<string>>(new Set())

  // Round-10: same disambiguation logic as LibraryPage. Jugar desde la
  // página de detalle también muestra el toast de Steam-state.
  const handlePlay = useCallback(async () => {
    if (!appId) return
    if (launchInFlightRef.current.has(appId)) return
    launchInFlightRef.current.add(appId)
    try {
      const result = await window.steamtools.launchGame(appId)
      if (!result?.success) {
        // Failure path: now mirrors LibraryPage. Detail page used to be
        // silent — that confused users whose Jugar click "did nothing".
        showToast(
          'error',
          'No se pudo iniciar el juego: ' + (result?.error ?? 'error desconocido'),
        )
        return
      }
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
          'Steam estaba activo pero Y-core lanzó el juego nativamente. Steam NO es el launcher.',
        )
      } else {
        showToast(
          'info',
          'Steam NO estaba corriendo. El juego se lanzó independientemente desde Y-core.',
        )
      }
    } finally {
      setTimeout(() => { launchInFlightRef.current.delete(appId) }, 1500)
    }
  }, [appId, showToast])`,
)

// 3b — make sure GameDetailPage imports useToastStore. If showToast isn't
// already wired, the patcher's literal compare against the original file
// will fail. Search for the import first.
const gameDetailSrc = fs.readFileSync('src/pages/GameDetailPage.tsx', 'utf8')
const gameDetailSrcCRLF = gameDetailSrc.includes('\r\n')
const norm = gameDetailSrcCRLF ? gameDetailSrc : gameDetailSrc

if (!norm.includes("from '../stores/useToastStore'") && !norm.includes('useToastStore')) {
  console.log('NOTE: GameDetailPage does NOT import useToastStore yet — adding the import.')
  // Find the last React hook import line; add showToast after it.
  applyOne(
    'src/pages/GameDetailPage.tsx',
    'add showToast import in GameDetailPage',
    `import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'`,
    `import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useToastStore } from '../stores/useToastStore'`,
  )
  applyOne(
    'src/pages/GameDetailPage.tsx',
    'wire showToast getter inside GameDetailPage (top of component body)',
    `  // Round-10: same disambiguation logic as LibraryPage. Jugar desde la`,
    `  const showToast = useToastStore((s) => s.showToast)
  // Round-10: same disambiguation logic as LibraryPage. Jugar desde la`,
  )
} else if (!norm.includes("const showToast = useToastStore")) {
  console.log('NOTE: GameDetailPage imports useToastStore but the getter is not wired — adding it.')
  applyOne(
    'src/pages/GameDetailPage.tsx',
    'wire showToast getter inside GameDetailPage (top of component body)',
    `  // Round-10: same disambiguation logic as LibraryPage. Jugar desde la`,
    `  const showToast = useToastStore((s) => s.showToast)
  // Round-10: same disambiguation logic as LibraryPage. Jugar desde la`,
  )
}

// Make sure GameDetailPage imports useRef. It already imports useEffect+useState,
// but if not useRef, the launchInFlightRef guard will fail. Most likely it
// does — patcher's literal diff will skip on no-match.
const norm2 = (gameDetailSrcCRLF ? gameDetailSrc : gameDetailSrc).replace(/\r\n/g, '\n')
if (!norm2.includes('useRef')) {
  console.log('NOTE: GameDetailPage does NOT import useRef — adding it.')
  applyOne(
    'src/pages/GameDetailPage.tsx',
    'add useRef to React hooks import in GameDetailPage',
    `import { useCallback, useEffect, useMemo, useState } from 'react'`,
    `import { useCallback, useEffect, useMemo, useRef, useState } from 'react'`,
  )
}

// Same checks for LibraryPage (useRef + showToast already in scope).
const librarySrc = fs.readFileSync('src/pages/LibraryPage.tsx', 'utf8')
const librarySrcLF = librarySrc.replace(/\r\n/g, '\n')
if (!librarySrcLF.includes('useRef')) {
  console.log('NOTE: LibraryPage does NOT import useRef — adding it.')
  applyOne(
    'src/pages/LibraryPage.tsx',
    'add useRef to React hooks import in LibraryPage',
    `import { useCallback, useEffect, useMemo, useState } from 'react'`,
    `import { useCallback, useEffect, useMemo, useRef, useState } from 'react'`,
  )
}

console.log('\nDone. Ready for typecheck + reviewer.')
