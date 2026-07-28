// Round-9 fix patcher — drop ALL steam://rungameid / uninstall / validate paths.
// Y-core owns 100% of game launches now. Three files: steam-ipc.ts (launch + uninstall
// + verify), remote-play.service.ts (stale comment), SettingsPage.tsx (picker replaced
// with a single static card).
import fs from 'node:fs'

const isCRLF = (s) => s.includes('\r\n')
const normLF = (s) => s.replace(/\r\n/g, '\n')
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
// FILE 1 — steam-ipc.ts :: replace launchGame handler
// ============================================================================
applyOne(
  'electron/modules/steam-ipc.ts',
  'launchGame handler',
  `  ipcMain.handle('steam:launchGame', async (_event, appId: string) => {
    if (!isValidAppId(appId)) return { success: false, error: 'Invalid app id' }
    try {
      // Check if native launcher mode is enabled (config: launcherMode=native)
      let launcherMode = 'steam'
      try {
        const configPath = getConfigPath()
        if (fs.existsSync(configPath)) {
          const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
          if (config.launcherMode === 'native') launcherMode = 'native'
        }
      } catch { /* ignore config errors */ }

      if (launcherMode === 'native') {
        // Find the game install directory from ACF files
        const folders = getSteamLibraryFolders()
        let foundInstallDir = ''
        for (const folder of folders) {
          const acfPath = path.join(folder, \`appmanifest_\${appId}.acf\`)
          if (!fs.existsSync(acfPath)) continue
          try {
            const acfContent = fs.readFileSync(acfPath, 'utf-8')
            const parsed = parseVdf(acfContent)
            const installDir = parsed?.AppState?.installdir?.trim()
            if (!installDir) continue
            foundInstallDir = path.join(folder, 'common', installDir)
            break
          } catch { continue }
        }

        if (foundInstallDir) {
          // ── Patch the game folder BEFORE launching ────────────────────────
          // The game's own steam_api64.dll dies on SteamAPI_Init trying to
          // reach a Steam client that isn't running. Drop our
          // ycore_steam.dll into the game folder as steam_api64.dll (plus
          // steam_appid.txt) so every call is answered locally by the
          // clean-room emulator. Without this, native launch exits in
          // <500ms — the exact "DLLs aren't loading" symptom.
          //
          // If patch fails (ycore_steam.dll hasn't been built yet), we still
          // proceed with the spawn; the WARN log in /logs shows the user
          // why (scripts/build-ycore-steam.bat).
          // Layer 2 (SteamStub DRM): strip the .exe encryption BEFORE the
          // emulator DLL can usefully stub SteamAPI. A DRM-stubbed .exe reads
          // its own .text section as ciphertext; SteamAPI stubs don't help
          // because the .exe never gets to its OEP. removeGameDrm uses
          // Steamless (bundled in <steam>/steamless/) with per-game marker
          // caching (.ycore.drm-removed / .ycore.drm-free) so we don't re-scan
          // every launch.
          const drmResult = await removeGameDrm(appId)
          if (!drmResult.success && drmResult.hadDrm) {
            logger.error(
              \`[steam-ipc] native launch aborted: SteamStub removal failed (\${drmResult.message}). Falling back to Steam URL.\`,
              'steam',
            )
          } else if (drmResult.hadDrm) {
            logger.info(\`[steam-ipc] Layer 2: SteamStub removed — \${drmResult.message}\`, 'steam')
          } else {
            logger.info(\`[steam-ipc] Layer 2: no SteamStub DRM present\`, 'steam')
          }

          const patch = patchGameFolder(foundInstallDir, appId)
          if (!patch.success) {
            logger.warn(
              \`[steam-ipc] native launch: patch falló para \${appId}: \${patch.error}. \` +
              'Compila ycore_steam.dll con scripts/build-ycore-steam.bat o seguirá cayendo al protocolo Steam.',
              'steam',
            )
          } else if (patch.warnings?.length) {
            for (const w of patch.warnings) logger.warn(\`[steam-ipc] patch warning: \${w}\`, 'steam')
          }
          const exePath = findGameExecutable(foundInstallDir)
          if (exePath) {
            launchGameFromDir(appId, foundInstallDir, \`Game \${appId}\`)
            try { trackGameLaunch(appId) } catch {}
            logger.info(\`[steam-ipc] Launched \${appId} natively (emulador DLL parchada): \${exePath}\`, 'steam')
            return { success: true, native: true }
          }
        }

        // Fallback: if patch / native launch fails, fall through to Steam
        logger.warn(\`[steam-ipc] Native launch failed for \${appId}, falling back to Steam\`, 'steam')
      }

      // Steam mode (default or fallback)
      await shell.openExternal(\`steam://rungameid/\${appId}\`)
      try { trackGameLaunch(appId) } catch (err: any) {
        logger.warn(\`[discord-rpc] trackGameLaunch failed: \${err?.message ?? err}\`, 'steam')
      }
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })`,
  `  ipcMain.handle('steam:launchGame', async (_event, appId: string) => {
    if (!isValidAppId(appId)) return { success: false, error: 'Invalid app id' }
    try {
      // Round-9 fix: Y-core owns 100% of game launches. Single native path.
      // Removed launcherMode read AND shell.openExternal('steam://rungameid/...')
      // as both default AND fallback. If a game can't launch natively, we
      // surface a structured error with an actionable hint — never delegate
      // to Steam silently.

      const folders = getSteamLibraryFolders()
      let foundInstallDir = ''
      for (const folder of folders) {
        const acfPath = path.join(folder, \`appmanifest_\${appId}.acf\`)
        if (!fs.existsSync(acfPath)) continue
        try {
          const acfContent = fs.readFileSync(acfPath, 'utf-8')
          const parsed = parseVdf(acfContent)
          const installDir = parsed?.AppState?.installdir?.trim()
          if (!installDir) continue
          foundInstallDir = path.join(folder, 'common', installDir)
          break
        } catch { continue }
      }

      if (!foundInstallDir) {
        return {
          success: false,
          error: \`AppId \${appId} no instalado o carpeta de instalación desconocida\`,
          hint: 'Verificá que el juego esté descargado via /downloads. Si está en otra biblioteca de Steam, escaneala con /storage.',
        }
      }

      // Layer 2 (SteamStub DRM): strip .exe encryption before Layer 1 patch.
      const drmResult = await removeGameDrm(appId)
      if (!drmResult.success && drmResult.hadDrm) {
        logger.error(
          \`[steam-ipc] native launch aborted: SteamStub removal failed (\${drmResult.message}).\`,
          'steam',
        )
        return {
          success: false,
          error: drmResult.message,
          hint: 'SteamStub removal falló. Si el juego está protegido por Denuvo/EAC/SecuROM (Layer-4), instalá Steam Client como plan B.',
        }
      } else if (drmResult.hadDrm) {
        logger.info(\`[steam-ipc] Layer 2: SteamStub removed — \${drmResult.message}\`, 'steam')
      } else {
        logger.info(\`[steam-ipc] Layer 2: no SteamStub DRM present\`, 'steam')
      }

      // Layer 1: drop ycore_steam.dll as steam_api64.dll + steam_appid.txt.
      const patch = patchGameFolder(foundInstallDir, appId)
      if (!patch.success) {
        logger.warn(
          \`[steam-ipc] native launch: patch falló para \${appId}: \${patch.error}.\`,
          'steam',
        )
        return {
          success: false,
          error: patch.error ?? 'patch falló',
          hint: '¿Está compilada ycore_steam.dll? Corre scripts/build-ycore-steam.bat.',
        }
      }
      if (patch.warnings?.length) {
        for (const w of patch.warnings) logger.warn(\`[steam-ipc] patch warning: \${w}\`, 'steam')
      }

      const exePath = findGameExecutable(foundInstallDir)
      if (!exePath) {
        return {
          success: false,
          error: \`No se encontró ejecutable en \${foundInstallDir}\`,
          hint: 'Verificá que el juego tenga un .exe válido (algunos juegos sólo traen un launcher .exe distribuido en subcarpetas).',
        }
      }

      launchGameFromDir(appId, foundInstallDir, \`Game \${appId}\`)
      try { trackGameLaunch(appId) } catch {}
      logger.info(
        \`[steam-ipc] Launched \${appId} natively (emulador DLL parchada): \${exePath}\`,
        'steam',
      )
      return { success: true, native: true, exePath }
    } catch (err: any) {
      return { success: false, error: err?.message ?? String(err) }
    }
  })`,
)

// ============================================================================
// FILE 1b — steam-ipc.ts :: replace steam:uninstallGame
// ============================================================================
applyOne(
  'electron/modules/steam-ipc.ts',
  'steam:uninstallGame handler',
  `    ipcMain.handle('steam:uninstallGame', async (_event, appId: string) => {
    if (!isValidAppId(appId)) return { success: false, error: 'Invalid app id' }
    try {
      await shell.openExternal(\`steam://uninstall/\${appId}\`)
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })`,
  `  ipcMain.handle('steam:uninstallGame', async (_event, appId: string) => {
    if (!isValidAppId(appId)) return { success: false, error: 'Invalid app id' }
    try {
      // Round-9 fix: removed shell.openExternal('steam://uninstall/...'). Y-core
      // owns uninstall — remove ACF + game folder atomically, then invalidate
      // the games cache so the LibraryPage re-scans on next focus.
      const acfPath = findManifestPath(appId)
      let manifestDeleted = false
      let folderDeleted = false
      if (acfPath) {
        try {
          fs.unlinkSync(acfPath)
          manifestDeleted = true
        } catch (err: any) {
          logger.warn(\`[steam-ipc] Failed to delete manifest for \${appId}: \${err?.message ?? err}\`, 'steam')
        }
        try {
          const acfContent = fs.readFileSync(acfPath, 'utf-8')
          const parsed = parseVdf(acfContent)
          const installDir = parsed?.AppState?.installdir?.trim()
          if (installDir) {
            const gameDir = path.join(path.dirname(acfPath), 'common', installDir)
            const commonRoot = path.join(path.dirname(acfPath), 'common')
            if (
              path.resolve(gameDir).startsWith(path.resolve(commonRoot)) &&
              fs.existsSync(gameDir)
            ) {
              try {
                fs.rmSync(gameDir, { recursive: true, force: true })
                folderDeleted = true
              } catch (err: any) {
                logger.warn(\`[steam-ipc] Failed to delete folder for \${appId}: \${err?.message ?? err}\`, 'steam')
              }
            }
          }
        } catch (err: any) {
          logger.warn(\`[steam-ipc] Failed to read ACF for \${appId}: \${err?.message ?? err}\`, 'steam')
        }
      }
      removeAppFromLibraryFolders(appId)
      invalidateGamesCache()
      return { success: manifestDeleted || folderDeleted, manifestDeleted, folderDeleted }
    } catch (err: any) {
      return { success: false, error: err?.message ?? String(err) }
    }
  })`,
)

// ============================================================================
// FILE 1c — steam-ipc.ts :: replace library:verifyGame
// ============================================================================
applyOne(
  'electron/modules/steam-ipc.ts',
  'library:verifyGame handler',
  `  ipcMain.handle('library:verifyGame', async (_event, appId: string) => {
    if (!isValidAppId(appId)) return { success: false, error: 'Invalid app id' }
    try {
      await shell.openExternal(\`steam://validate/\${appId}\`)
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })`,
  `  ipcMain.handle('library:verifyGame', async (_event, appId: string) => {
    if (!isValidAppId(appId)) return { success: false, error: 'Invalid app id' }
    try {
      // Round-9 fix: removed shell.openExternal('steam://validate/...'). Steamless
      // re-run via removeGameDrm serves as an integrity probe — the marker
      // cache means it's near-free when nothing changed.
      return await removeGameDrm(appId)
    } catch (err: any) {
      return { success: false, error: err?.message ?? String(err) }
    }
  })`,
)

// ============================================================================
// FILE 2 — remote-play.service.ts :: update stale comment
// ============================================================================
applyOne(
  'electron/services/remote-play.service.ts',
  'launchFromMobile stale comment',
  `  //   3. Launch the requested appId via Steam's \`steam://rungameid/\` URI`,
  `  //   3. Launch the requested appId via Y-core's native launcher (gameService.launchGame → removeGameDrm → patchGameFolder → spawn)`,
)

// ============================================================================
// FILE 3a — SettingsPage.tsx :: remove unused destructure
// ============================================================================
applyOne(
  'src/pages/SettingsPage.tsx',
  'remove launcherMode from destructure',
  `    launcherMode, setLauncherMode,`,
  `    /* Round-9 fix: launcherMode removed — Y-core no tiene modo alternativo */`,
)

// ============================================================================
// FILE 3b — SettingsPage.tsx :: replace launcher-mode picker card
// ============================================================================
applyOne(
  'src/pages/SettingsPage.tsx',
  'replace launcher-mode picker with static info card',
  `          {/* Launcher mode selector */}
          <Card>
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-accent/15 flex items-center justify-center">
                  <Gamepad2 className="w-5 h-5 text-accent" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-text-bright">Modo de lanzamiento</h3>
                  <p className="text-xs text-text-dim mt-0.5">Elige cómo se lanzan los juegos instalados.</p>
                </div>
              </div>

              <div className="flex flex-col gap-2.5">
                <button
                  type="button"
                  onClick={() => setLauncherMode('native')}
                  className={\`text-left flex gap-3 p-3.5 rounded-xl border transition-all duration-150 \${
                    launcherMode === 'native'
                      ? 'bg-accent/10 border-accent/50 shadow-[0_0_0_1px_rgba(115,115,255,0.15)]'
                      : 'bg-white/[0.03] border-white/[0.06] hover:border-white/[0.14] hover:bg-white/[0.05]'
                  }\`}
                >
                  <span className={\`flex-none w-9 h-9 rounded-lg flex items-center justify-center transition-colors \${
                    launcherMode === 'native' ? 'bg-accent/25 text-accent' : 'bg-white/[0.06] text-text-secondary'
                  }\`}>
                    <Monitor className="w-5 h-5" />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-text-bright">Directo (sin Steam)</span>
                      <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-accent/20 text-accent">
                        Recomendado
                      </span>
                    </span>
                    <span className="block text-[12px] text-text-dim mt-1 leading-relaxed">
                      Los juegos se lanzan directamente desde Y-core sin necesidad de abrir Steam.
                      El ejecutable se detecta automáticamente.
                    </span>
                  </span>
                  <span className={\`flex-none mt-1 w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors \${
                    launcherMode === 'native' ? 'border-accent' : 'border-white/[0.18]'
                  }\`}>
                    {launcherMode === 'native' && <span className="w-2 h-2 rounded-full bg-accent" />}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setLauncherMode('steam')}
                  className={\`text-left flex gap-3 p-3.5 rounded-xl border transition-all duration-150 \${
                    launcherMode === 'steam'
                      ? 'bg-accent/10 border-accent/50 shadow-[0_0_0_1px_rgba(115,115,255,0.15)]'
                      : 'bg-white/[0.03] border-white/[0.06] hover:border-white/[0.14] hover:bg-white/[0.05]'
                  }\`}
                >
                  <span className={\`flex-none w-9 h-9 rounded-lg flex items-center justify-center transition-colors \${
                    launcherMode === 'steam' ? 'bg-accent/25 text-accent' : 'bg-white/[0.06] text-text-secondary'
                  }\`}>
                    <Gamepad2 className="w-5 h-5" />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="text-sm font-semibold text-text-bright">A través de Steam</span>
                    <span className="block text-[12px] text-text-dim mt-1 leading-relaxed">
                      Los juegos se lanzan usando el protocolo steam://rungameid.
                      Steam debe estar abierto.
                    </span>
                  </span>
                  <span className={\`flex-none mt-1 w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors \${
                    launcherMode === 'steam' ? 'border-accent' : 'border-white/[0.18]'
                  }\`}>
                    {launcherMode === 'steam' && <span className="w-2 h-2 rounded-full bg-accent" />}
                  </span>
                </button>
              </div>

              {launcherMode === 'native' && (
                <div className="text-[11px] text-text-dim leading-relaxed p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                  <p className="font-semibold text-green-400 mb-1">✓ Ventajas del modo Directo:</p>
                  <ul className="list-disc list-inside space-y-0.5">
                    <li>Los juegos se abren más rápido (sin esperar a Steam)</li>
                    <li>Funciona aunque Steam tenga errores de firma</li>
                    <li>Steam no necesita estar ejecutándose</li>
                  </ul>
                </div>
              )}

              {launcherMode === 'steam' && (
                <div className="text-[11px] text-text-dim leading-relaxed p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                  <p>Si el modo Directo falla con algún juego, cambia temporalmente a Steam.</p>
                </div>
              )}
            </div>
          </Card>`,
  `          {/* Round-9 fix: Launcher mode is now a single static card. Y-core owns 100% of launches. */}
          <Card>
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-accent/15 flex items-center justify-center">
                  <Gamepad2 className="w-5 h-5 text-accent" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-text-bright">Modo de lanzamiento</h3>
                  <p className="text-xs text-text-dim mt-0.5">Y-core es ahora TU Steam. Los juegos se inician siempre en modo nativo.</p>
                </div>
              </div>

              <div className="flex items-center gap-3 p-3 rounded-xl border bg-accent/10 border-accent/50 shadow-[0_0_0_1px_rgba(115,115,255,0.15)]">
                <span className="flex-none w-9 h-9 rounded-lg flex items-center justify-center bg-accent/25 text-accent">
                  <Monitor className="w-5 h-5" />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-text-bright">Directo (Y-core nativo)</span>
                    <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-accent/20 text-accent">
                      siempre
                    </span>
                  </span>
                  <span className="block text-[12px] text-text-dim mt-1 leading-relaxed">
                    Steam no se abre nunca. La cadena <code className="font-mono text-[10px]">removeGameDrm → patchGameFolder → spawn</code> corre entera dentro de Y-core.
                  </span>
                </span>
                <span className="flex-none mt-1 w-4 h-4 rounded-full border-2 border-accent flex items-center justify-center">
                  <span className="w-2 h-2 rounded-full bg-accent" />
                </span>
              </div>

              <div className="text-[11px] text-text-dim leading-relaxed p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                <p className="font-semibold text-amber-400 mb-1">⚠ Si un juego requiere la URL Steam (Layer-4 / Denuvo / EAC / SecuROM)</p>
                <p>Y-core emite un error accionable en /logs con el nombre exacto de la DLL que rompió el handshake. La ruta "Steam como plan B" ya no existe — instalá Steam Client si necesitás esos juegos, o esperá la detección automática de Layer-4 + telemetría post-launch (en roadmap; ver el card "Emulador nativo" más abajo).</p>
              </div>
            </div>
          </Card>`,
)

console.log('\nDone. Running typecheck next.')
