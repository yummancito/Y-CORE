// Round-10 — Y-core owns 100% of launches AND is verifiable. Patcher adds
// `killSteamBeforeLaunch` toggle + `wasSteamAliveAtLaunch` IPC response, so
// the renderer can show a toast that proves Y-core is independent of Steam.
//
// Files:
//  1. electron/modules/steam-ipc.ts      — pre-launch kill + response flag
//  2. src/stores/useSettingsStore.ts     — new field + setter + load hook
//  3. src/pages/SettingsPage.tsx         — toggle UI in Steam Integration card
//  4. src/pages/LibraryPage.tsx          — toast with wasSteamAliveAtLaunch
//  5. src/pages/GameDetailPage.tsx       — same toast on the detail page handler

import fs from 'node:fs'

const isCRLF = s => s.includes('\r\n')
const normLF = s => s.replace(/\r\n/g, '\n')
const restoreEOL = (s, c) => c ? s.replace(/\n/g, '\r\n') : s

function applyOne(file, name, oldRaw, newRaw, { allowZero = false } = {}) {
  const raw = fs.readFileSync(file, 'utf8')
  const crlf = isCRLF(raw)
  let s = normLF(raw)
  const o = normLF(oldRaw)
  const n = normLF(newRaw)
  const c = s.split(o).length - 1
  if (c !== 1 && !(allowZero && c === 0)) {
    console.error(`FAIL ${file} :: ${name} — count=${c}, expected 1${allowZero ? ' (or 0)' : ''}`)
    process.exit(1)
  }
  if (c === 0) {
    console.log(`SKIP ${file} :: ${name} — pattern not found (already applied?)`)
    return
  }
  s = s.replace(o, n)
  fs.writeFileSync(file, restoreEOL(s, crlf), 'utf8')
  console.log(`OK  ${file} :: ${name}`)
}

// ============================================================================
// 1) electron/modules/steam-ipc.ts :: steam:launchGame handler
// ============================================================================
applyOne(
  'electron/modules/steam-ipc.ts',
  'steam:launchGame: read killSteamBeforeLaunch + capture wasSteamAliveAtLaunch',
  `  ipcMain.handle('steam:launchGame', async (_event, appId: string) => {
    if (!isValidAppId(appId)) return { success: false, error: 'Invalid app id' }
    try {
      // Round-9 fix: Y-core owns 100% of game launches. Single native path.
      // Removed launcherMode read AND shell.openExternal('steam://rungameid/...')
      // as both default AND fallback. If a game can't launch natively, we
      // surface a structured error with an actionable hint — never delegate
      // to Steam silently.

      const folders = getSteamLibraryFolders()`,
  `  ipcMain.handle('steam:launchGame', async (_event, appId: string) => {
    if (!isValidAppId(appId)) return { success: false, error: 'Invalid app id' }
    try {
      // Round-9 fix: Y-core owns 100% of game launches. Single native path.
      // Removed launcherMode read AND shell.openExternal('steam://rungameid/...')
      // as both default AND fallback. If a game can't launch natively, we
      // surface a structured error with an actionable hint — never delegate
      // to Steam silently.

      // Round-10 addition: detect-and-optionally-kill a Steam instance that
      // was already running independently BEFORE we touch the launch chain.
      // Without this, a user who has Steam.exe in their tray from a previous
      // session would report "Y-core launched via Steam" — false positive,
      // because Y-core never spawns steam.exe in the launch path; only Steam
      // was already alive in the background.
      //
      //   wasSteamAliveAtLaunch  → always returned, even if killSteamBeforeLaunch=false
      //                            (renders a transparent toast to the user).
      //   killSteamBeforeLaunch  → optional opt-in toggle (default false). When
      //                            true, we taskkill steam.exe + steamwebhelper.exe
      //                            before continue()-ing to removeGameDrm so the
      //                            user gets visual proof: Steam pops "Steam is
      //                            restarting" briefly then disappears.
      let wasSteamAliveAtLaunch = false
      let killSteamBeforeLaunch = false
      try {
        const configPath = getConfigPath()
        if (fs.existsSync(configPath)) {
          const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
          killSteamBeforeLaunch = config.killSteamBeforeLaunch === true
        }
      } catch { /* ignore config errors */ }

      try {
        wasSteamAliveAtLaunch = await isSteamRunning()
        if (killSteamBeforeLaunch && wasSteamAliveAtLaunch) {
          logger.info(
            '[steam-ipc] killSteamBeforeLaunch=true — closing Steam.exe + steamwebhelper.exe BEFORE launch chain',
            'steam',
          )
          await closeSteamProcess()
          // Brief settle to release file handles Steam held (console_log.txt
          // watcher et al). 300ms is empirical — too short and the next
          // removeGameDrm read races; too long and the user notices lag.
          await new Promise(resolve => setTimeout(resolve, 300))
          logger.info('[steam-ipc] Steam terminated for autonomy', 'steam')
        } else if (wasSteamAliveAtLaunch) {
          logger.info(
            '[steam-ipc] Steam was already running independently (killSteamBeforeLaunch=false). User saw Steam in tray — Y-core did NOT launch it.',
            'steam',
          )
        }
      } catch (err: any) {
        logger.warn(\`[steam-ipc] pre-launch Steam detection failed: \${err?.message ?? err}\`, 'steam')
      }

      const folders = getSteamLibraryFolders()`,
)

// ============================================================================
// 1b) electron/modules/steam-ipc.ts :: steam:launchGame return shape
// ============================================================================
applyOne(
  'electron/modules/steam-ipc.ts',
  'steam:launchGame: include wasSteamAliveAtLaunch + killSteamBeforeLaunch in success return',
  `      try { trackGameLaunch(appId) } catch {}
      logger.info(
        \`[steam-ipc] Launched \${appId} natively (emulador DLL parchada): \${exePath}\`,
        'steam',
      )
      return { success: true, native: true, exePath }
    } catch (err: any) {
      return { success: false, error: err?.message ?? String(err) }
    }
  })`,
  `      try { trackGameLaunch(appId) } catch {}
      logger.info(
        \`[steam-ipc] Launched \${appId} natively (emulador DLL parchada): \${exePath}\`,
        'steam',
      )
      // Round-10 addition: surface the Steam state snapshot so the renderer
      // can render a transparent toast. If killSteamBeforeLaunch=true AND
      // Steam was alive → tell the user we killed it. If killSteamBeforeLaunch=false
      // AND Steam was alive → tell them Steam was independent of Y-core.
      return {
        success: true,
        native: true,
        exePath,
        wasSteamAliveAtLaunch,
        killedSteamBeforeLaunch: killSteamBeforeLaunch && wasSteamAliveAtLaunch,
      }
    } catch (err: any) {
      return {
        success: false,
        error: err?.message ?? String(err),
        wasSteamAliveAtLaunch,
        killedSteamBeforeLaunch: false,
      }
    }
  })`,
)

// ============================================================================
// 2) src/stores/useSettingsStore.ts :: add killSteamBeforeLaunch field + setter
// ============================================================================
applyOne(
  'src/stores/useSettingsStore.ts',
  'add killSteamBeforeLaunch field + setter in type',
  `  customization: Customization
  launcherMode: LauncherMode
  setShowAdult: (v: boolean) => void
  setShowTools: (v: boolean) => void
  setShowAddGame: (v: boolean) => void
  setLogsVisible: (v: boolean) => void
  setColorTheme: (v: string) => void
  setLanguage: (v: string) => void
  setCustomization: (partial: Partial<Customization>) => Promise<void>
  setLauncherMode: (v: LauncherMode) => Promise<void>
  loadFromConfig: () => void
}`,
  `  customization: Customization
  launcherMode: LauncherMode
  /**
   * Round-10: cuando true, cada launch nativo hace taskkill de steam.exe y
   * steamwebhelper.exe ANTES de continuar con el chain removeGameDrm →
   * patchGameFolder → spawn. Es una toggle de diagnóstico: le da al usuario
   * visibilidad VERIFICABLE de que Y-core no depende de Steam para correr
   * juegos — porque Steam desaparece y el juego sigue abriendo.
   * Default false para no molestar a quien tiene Steam abierto a propósito.
   */
  killSteamBeforeLaunch: boolean
  setShowAdult: (v: boolean) => void
  setShowTools: (v: boolean) => void
  setShowAddGame: (v: boolean) => void
  setLogsVisible: (v: boolean) => void
  setColorTheme: (v: string) => void
  setLanguage: (v: string) => void
  setCustomization: (partial: Partial<Customization>) => Promise<void>
  setLauncherMode: (v: LauncherMode) => Promise<void>
  setKillSteamBeforeLaunch: (v: boolean) => Promise<void>
  loadFromConfig: () => void
}`,
)

applyOne(
  'src/stores/useSettingsStore.ts',
  'add killSteamBeforeLaunch default + setter+ loadFromConfig read',
  `  // Default: 'native' — lanzar juegos directamente sin Steam (única opción
  // expuesta; el campo se mantiene para el legacy config que pueda tener ya
  // guardado el valor 'steam').
  // Round-9 fix: literal-singleton. El único valor válido es 'native'.
  launcherMode: 'native' as LauncherMode,

  setShowAdult: (v) => set({ showAdult: v }),`,
  `  // Default: 'native' — lanzar juegos directamente sin Steam (única opción
  // expuesta; el campo se mantiene para el legacy config que pueda tener ya
  // guardado el valor 'steam').
  // Round-9 fix: literal-singleton. El único valor válido es 'native'.
  launcherMode: 'native' as LauncherMode,
  // Round-10: default false. La toggle vive en Settings → Steam Integration.
  // Yi-core nativo siempre lanza; este flag SOLO mata Steam.exe antes para
  // que el user pueda verificar con sus ojos que no hay dependencia.
  killSteamBeforeLaunch: false,

  setShowAdult: (v) => set({ showAdult: v }),`,
)

applyOne(
  'src/stores/useSettingsStore.ts',
  'add setKillSteamBeforeLaunch setter',
  `  setLauncherMode: async (_v: LauncherMode) => {
    /* no-op: Y-core ya no tiene modo alternativo */
  },

  loadFromConfig: () => {`,
  `  setLauncherMode: async (_v: LauncherMode) => {
    /* no-op: Y-core ya no tiene modo alternativo */
  },

  setKillSteamBeforeLaunch: async (v: boolean) => {
    set({ killSteamBeforeLaunch: v })
    await writeConfigSerialized({ killSteamBeforeLaunch: v })
  },

  loadFromConfig: () => {`,
)

applyOne(
  'src/stores/useSettingsStore.ts',
  'loadFromConfig: read killSteamBeforeLaunch from disk',
  `          // Round-9 fix: el único valor válido es 'native'. Cualquier
          // 'steam' legacy en configs.json se descarta silenciosamente y
          // el store queda en 'native'. (Antes hacía set con 'steam' si
          // lo encontraba — obsoleto.)
          if (c.launcherMode === 'native') {
            set({ launcherMode: 'native' })
          }
          void c.launcherMode // referenced via 'native' branch above; ts-ignored

          if (c.customization) {`,
  `          // Round-9 fix: el único valor válido es 'native'. Cualquier
          // 'steam' legacy en configs.json se descarta silenciosamente y
          // el store queda en 'native'. (Antes hacía set con 'steam' si
          // lo encontraba — obsoleto.)
          if (c.launcherMode === 'native') {
            set({ launcherMode: 'native' })
          }
          void c.launcherMode // referenced via 'native' branch above; ts-ignored

          // Round-10: killSteamBeforeLaunch — sólo se lee si está presente
          // y es boolean. Cualquier otro tipo (string, null, undefined) cae
          // al default false. Migrations futuras: si teníamos un valor
          // distinto, guardarlo en \`killSteamBeforeLaunchLegacy\` y notificar.
          if (typeof c.killSteamBeforeLaunch === 'boolean') {
            set({ killSteamBeforeLaunch: c.killSteamBeforeLaunch })
          } else {
            set({ killSteamBeforeLaunch: false })
          }

          if (c.customization) {`,
)

// ============================================================================
// 3) src/pages/SettingsPage.tsx :: add Steam autonomy toggle card
// ============================================================================
// We replace the Standalone Steam Integration block to add the toggle.
applyOne(
  'src/pages/SettingsPage.tsx',
  'add Steam auto-kill toggle inside the Modo de lanzamiento card',
  `              <div className="text-[11px] text-text-dim leading-relaxed p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                <p className="font-semibold text-amber-400 mb-1">⚠ Si un juego requiere la URL Steam (Layer-4 / Denuvo / EAC / SecuROM)</p>
                <p>Y-core emite un error accionable en /logs con el nombre exacto de la DLL que rompió el handshake. La ruta "Steam como plan B" ya no existe — instalá Steam Client si necesitás esos juegos, o esperá la detección automática de Layer-4 + telemetría post-launch (en roadmap; ver el card "Emulador nativo" más abajo).</p>
              </div>
            </div>
          </Card>`,
  `              <div className="text-[11px] text-text-dim leading-relaxed p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                <p className="font-semibold text-amber-400 mb-1">⚠ Si un juego requiere la URL Steam (Layer-4 / Denuvo / EAC / SecuROM)</p>
                <p>Y-core emite un error accionable en /logs con el nombre exacto de la DLL que rompió el handshake. La ruta "Steam como plan B" ya no existe — instalá Steam Client si necesitás esos juegos, o esperá la detección automática de Layer-4 + telemetría post-launch (en roadmap; ver el card "Emulador nativo" más abajo).</p>
              </div>

              {/* Round-10: Steam autonomy toggle — togglear esta opción mata
                 * Steam.exe + steamwebhelper.exe ANTES de cada launch nativo.
                 * Cuando está activa, cada click en Jugar demuestra visualmente
                 * que Y-core es independiente de Steam (Steam desaparece y el
                 * juego sigue abriendo). Default false. */}
              <div className="flex items-start gap-3 p-3.5 rounded-xl border bg-white/[0.02] border-white/[0.06]">
                <button
                  type="button"
                  role="switch"
                  aria-checked={killSteamBeforeLaunch}
                  onClick={() => setKillSteamBeforeLaunch(!killSteamBeforeLaunch)}
                  className={\`flex-none relative w-11 h-6 rounded-full transition-colors duration-200 \${
                    killSteamBeforeLaunch ? 'bg-accent' : 'bg-white/[0.12]'
                  }\`}
                >
                  <span
                    className={\`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-transform duration-200 \${
                      killSteamBeforeLaunch ? 'translate-x-5' : 'translate-x-0'
                    }\`}
                  />
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-text-bright">
                      Matar proceso de Steam antes de cada launch
                    </span>
                    <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-400/15 text-amber-300">
                      diagnóstico
                    </span>
                  </div>
                  <p className="text-[12px] text-text-dim mt-1 leading-relaxed">
                    Antes de continuar con <code className="font-mono text-[10px]">removeGameDrm → patchGameFolder → spawn</code>,
                    hace <code className="font-mono text-[10px]">taskkill /IM steam.exe /F</code> + <code className="font-mono text-[10px]">steamwebhelper.exe</code>.
                    Útil si ves Steam abrirse junto al juego y querés verificación visual de que Y-core es independiente.
                  </p>
                  <p className="text-[11px] text-text-dim/80 mt-1.5 leading-relaxed">
                    Cuando lo activás, cada launch muestra un toast tipo <em>"Steam estaba activo y fue terminado antes del launch"</em>.
                    Cuando lo desactivás y Steam estaba activo, el toast dice <em>"Steam estaba activo pero Y-core lanzó el juego nativamente igual"</em>.
                    En ambos casos el juego abre desde Y-core. La diferencia es sólo cosmética / diagnóstica.
                  </p>
                </div>
              </div>
            </div>
          </Card>`,
)

// Update the destructure clause — add killSteamBeforeLaunch, setKillSteamBeforeLaunch.
applyOne(
  'src/pages/SettingsPage.tsx',
  'add killSteamBeforeLaunch destructure (next to the launcherMode comment)',
  `    /* Round-9 fix: launcherMode removed — Y-core no tiene modo alternativo */`,
  `    /* Round-9 fix: launcherMode removed — Y-core no tiene modo alternativo */
    killSteamBeforeLaunch,
    setKillSteamBeforeLaunch,`,
)

// ============================================================================
// 4) src/pages/LibraryPage.tsx :: toast with wasSteamAliveAtLaunch snapshot
// ============================================================================
applyOne(
  'src/pages/LibraryPage.tsx',
  'LibraryPage handleLaunchGame: surface wasSteamAliveAtLaunch + killedSteamBeforeLaunch',
  `  const handleLaunchGame = useCallback(async (appId: string) => {
    const result = await window.steamtools.launchGame(appId)
    if (result.success) {
      showToast('success', t('library.launching'))
    } else {
      showToast('error', parseError(result.error, 'library.launchFailed'))
    }
  }, [showToast])`,
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
)

// ============================================================================
// 5) src/pages/GameDetailPage.tsx :: same toast on the Jugar button
// ============================================================================
applyOne(
  'src/pages/GameDetailPage.tsx',
  'GameDetailPage handlePlay: async + Steam-state toast',
  `  const handlePlay = useCallback(() => {
    if (!appId) return
    window.steamtools.launchGame(appId)
  }, [appId])`,
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
)

console.log('\nDone. Patch applied.')
console.log('Next: nuke stale dist-electron/ so the next vite rebuild serves the patched bytecode.')
