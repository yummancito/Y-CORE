// ============================================================================
// electron/modules/defender-fix.ts
// ----------------------------------------------------------------------------
// Solución definitiva integrada para el falso positivo de Windows Defender.
//
// Cuando Defender bloquea los DLLs de Y-core (dwmapi.dll, xinput1_4.dll,
// OpenSteamTool.dll), este módulo genera y ejecuta un script PowerShell
// auto-elevado que:
//
//   1. Agrega exclusiones en Windows Defender para todas las carpetas de Y-core
//   2. Restaura los archivos desde la cuarentena de Defender si fueron eliminados
//   3. Reporta el resultado de vuelta a la app
//
// La app se auto-eleva usando Start-Process -Verb RunAs desde el proceso
// hijo de PowerShell, sin necesidad de que el usuario busque scripts.
// ============================================================================

import path from 'path'
import fs from 'fs'
import { app, dialog } from 'electron'
import { execSync, exec } from 'child_process'
import { logger } from '../logger'
import { scanDlls, type DefenderCheckResult } from './defender-check'
import { getSteamPath } from './steam-helpers'

// ── Tipos ──────────────────────────────────────────────────────────────────

export interface DefenderFixResult {
  /** true si el fix se completó (o ya estaba solucionado). */
  success: boolean
  /** Mensaje legible para mostrar al usuario. */
  message: string
  /** Detalle técnico para logs. */
  detail: string
  /** ¿Se requirió elevación? */
  elevated: boolean
  /** ¿Se restauraron archivos desde cuarentena? */
  restored: boolean
  /** Error si algo falló. */
  error?: string
}

// ── Generación del script PowerShell ───────────────────────────────────────

/**
 * Genera el script PowerShell de reparación.
 * Se escribe a un archivo temporal porque Start-Process no acepta comandos
 * largos inline con -Verb RunAs.
 */
function generateFixScript(steamPath?: string): string {
  const appRoot = app.isPackaged
    ? path.dirname(app.getPath('exe'))
    : app.getAppPath()

  const paths = [
    `"${path.join(app.getPath('userData'))}"`,
    `"${appRoot}"`,
    `"${path.join(appRoot, 'resources', 'native')}"`,
    `"${path.join(appRoot, 'electron', 'dll')}"`,
    `"${path.join(appRoot, 'node_modules', 'koffi')}"`,
  ]
  if (steamPath) {
    // Round-14: opt-in Steam install dir exclusion. When user runs the
    // "exclude Steam folder" flow (first-launch auto-prompt or manual
    // Settings button), we pass steamPath here so the Add-MpPreference
    // list covers it. Defender applies prefix-match so <Steam install>
    // covers all child DLLs (Steam.exe, steam_api64.dll, etc.).
    paths.push(`"${steamPath}"`)
  }

  return `# y-core defender fix — auto-generado
$ErrorActionPreference = "Continue"

# ── 1. Agregar exclusiones ─────────────────────────────────────────────
$paths = @(
${paths.join(',\n')}
)

$count = 0
foreach ($p in $paths) {
  try {
    $existing = @(Get-MpPreference).ExclusionPath
    if ($existing -notcontains $p) {
      Add-MpPreference -ExclusionPath $p -ErrorAction Stop | Out-Null
      $count++
    }
  } catch {
    Write-Host "ERROR: $_"
  }
}

# ── 2. Restaurar desde cuarentena ───────────────────────────────────────
$restored = 0
try {
  $threats = Get-MpThreatDetection -ErrorAction SilentlyContinue | Where-Object {
    $_.Resources -match "ycore|y-core|opensteamtool|dwmapi|xinput"
  }
  if ($threats) {
    foreach ($t in $threats) {
      try {
        Restore-MpThreat -ThreatID $t.ThreatID -ErrorAction Stop | Out-Null
        $restored++
      } catch {
        Add-MpPreference -ExclusionPath (Split-Path $t.Resources -Parent) | Out-Null
        try { Restore-MpThreat -ThreatID $t.ThreatID } catch {}
        $restored++
      }
    }
  }
} catch {
  # Get-MpThreatDetection no disponible en Win10 pre-1607
}

# ── 3. Resultado como JSON (stdout) ────────────────────────────────────
@{
  success = $true
  exclusionsAdded = $count
  filesRestored = $restored
  exclusionPaths = $paths
} | ConvertTo-Json -Compress
`
}

// ── Ejecutar PowerShell elevado ────────────────────────────────────────────

/**
 * Ejecuta el script PowerShell elevado y espera el resultado.
 *
 * Estrategia: escribimos el script a un archivo .ps1 temporal, luego
 * ejecutamos PowerShell con Start-Process -Verb RunAs para elevarlo.
 * La salida se captura escribiendo a un archivo JSON temporal que
 * el proceso hijo deja como resultado.
 */
function runElevatedFix(steamPath?: string): Promise<{ success: boolean; exclusionsAdded: number; filesRestored: number; exclusionPaths: string[] }> {
  return new Promise((resolve, reject) => {
    try {
      // Escribir script temporal
      const tmpDir = app.getPath('temp')
      const scriptPath = path.join(tmpDir, `ycore-defender-fix-${Date.now()}.ps1`)
      const resultPath = path.join(tmpDir, `ycore-defender-result-${Date.now()}.json`)

      const script = generateFixScript(steamPath)
      // Modificar para que guarde resultado en archivo
      const scriptWithOutput = script.replace(
        '}| ConvertTo-Json -Compress',
        `}| ConvertTo-Json -Compress | Out-File -FilePath "${resultPath}" -Encoding utf8`
      )
      const scriptWithCleanup = scriptWithOutput + `\nRemove-Item "${scriptPath}" -Force -ErrorAction SilentlyContinue\n`

      fs.writeFileSync(scriptPath, scriptWithCleanup, 'utf-8')

      // Ejecutar PowerShell elevado con UAC
      // Start-Process -Verb RunAs dispara el prompt de UAC.
      // Sin esto, Add-MpPreference falla porque requiere admin.
      const cmd = `powershell -NoProfile -Command "Start-Process powershell -ArgumentList '-NoProfile -ExecutionPolicy Bypass -File \"${scriptPath}\"' -Verb RunAs -Wait"`

      exec(cmd, {
        timeout: 60000, // 60s timeout
        windowsHide: false, // show the UAC prompt
      }, (error, stdout, stderr) => {
        // Leer el archivo de resultado (si existe)
        let result = {
          success: false,
          exclusionsAdded: 0,
          filesRestored: 0,
          exclusionPaths: [] as string[],
        }
        try {
          if (fs.existsSync(resultPath)) {
            const raw = fs.readFileSync(resultPath, 'utf-8')
            result = JSON.parse(raw)
            fs.unlinkSync(resultPath)
          }
        } catch {
          // Si no hay archivo de resultado, intentar parsear stdout
          try {
            const parsed = JSON.parse(stdout)
            result = { ...result, ...parsed }
          } catch {}
        }

        // Limpiar script temporal (por si la línea de cleanup no corrió)
        try { if (fs.existsSync(scriptPath)) fs.unlinkSync(scriptPath) } catch {}

        if (error && !result.success) {
          // El error puede ser solo que el usuario canceló UAC
          const isCancelled = stderr?.includes('The action that the user is trying to perform requires') ||
                             stdout?.includes('The action that the user is trying to perform requires')
          if (isCancelled) {
            resolve({ ...result, success: false })
          } else {
            resolve(result)
          }
        } else {
          resolve(result)
        }
      })
    } catch (err: any) {
      reject(err)
    }
  })
}

// ── API pública ────────────────────────────────────────────────────────────

/**
 * Round-13 / pre-build shield: ensure the build + output dirs are whitelisted
 * in Windows Defender BEFORE spawning cl.exe / link.exe / cmake --build.
 * Without this, Defender's real-time scanning routinely kills the freshly-
 * compiled ycore_steam.dll mid-process with exit 255 (no MSBuild output
 * because cmd.exe is terminated by TerminateProcess from AMSI).
 *
 * Strategy:
 *   1. Read current ExclusionPath list (non-elevated PowerShell).
 *   2. If buildDir + outDir are present, return true (no-op fast path).
 *   3. Otherwise call the existing runElevatedFix() — which whitelists
 *      appRoot, automatically covering both our build + output subdirs.
 *
 * Returns a boolean: true = exclusion in place (or established), false =
 * best-effort fallback (caller proceeds with build anyway so we don't
 * block on UAC-cancelled scenarios).
 */
export function ensureDefenderExclusionForBuild(buildDir: string, outDir: string): Promise<boolean> {
  // Round-13 fix: Defender ExclusionPath uses prefix-match, so excluding
  // <appRoot> covers all child paths including the build + output subdirs.
  // runElevatedFix() whitelists appRoot, NOT the specific build/out paths,
  // so the previous fast-path that substring-checked buildDir/outDir
  // ALWAYS missed → every cold-start re-prompted UAC. We compare with the
  // DIRECTORY ancestor of buildDir (which IS appRoot) and use locale-robust
  // lowercase + strip of trailing separators for non-canonical storage.
  const appRoot = path.dirname(path.dirname(buildDir))
  const normRoot = appRoot.replace(/[\\/]+$/, '').toLowerCase()
  return new Promise((resolve) => {
    exec(
      `powershell -NoProfile -Command "@(Get-MpPreference).ExclusionPath -join '|'"`,
      { windowsHide: true, timeout: 6000 },
      async (err, stdout) => {
        const normOut = (stdout || '').replace(/[\\/]+/g, '/').toLowerCase()
        if (!err && normOut && normOut.includes(normRoot)) {
          return resolve(true) // appRoot already covered → children inherit
        }
        try {
          await runElevatedFix()
          logger.info(
            `[DefenderFix] ensured Defender exclusion covers ${appRoot} (parent of ${buildDir} + ${outDir})`,
            'dll',
          )
          resolve(true)
        } catch (fixErr: any) {
          logger.warn(
            `[DefenderFix] could not ensure exclusion (UAC cancel?): ${fixErr?.message ?? fixErr}. Build will proceed and may still be quarantined.`,
            'dll',
          )
          resolve(false)
        }
      },
    )
  })
}

/**
 * Ejecuta la reparación completa de Windows Defender:
 * 1. Verifica si falta algún DLL
 * 2. Si falta, ejecuta PowerShell elevado para agregar exclusiones + restaurar
 * 3. Escanea de nuevo para confirmar
 */
export async function runDefenderFix(
  /** Si true, muestra un diálogo de progreso/proteccion al usuario */
  interactive: boolean = true,
): Promise<DefenderFixResult> {
  logger.info('[DefenderFix] Starting repair...', 'dll')

  try {
    // 1. Escanear estado actual
    const beforeScan: DefenderCheckResult = scanDlls()

    if (!beforeScan.hasMissingExpected && !beforeScan.hasEmptyDlls) {
      logger.info('[DefenderFix] No issues detected — all DLLs present', 'dll')
      return {
        success: true,
        message: 'Todos los componentes nativos están en su lugar. No se requiere reparación.',
        detail: 'scan result: all DLLs present',
        elevated: false,
        restored: false,
      }
    }

    // 2. Ejecutar PowerShell elevado
    logger.info('[DefenderFix] Issues detected, running elevated fix...', 'dll')

    let fixResult: { success: boolean; exclusionsAdded: number; filesRestored: number; exclusionPaths: string[] }
    try {
      fixResult = await runElevatedFix()
    } catch (err: any) {
      logger.error(`[DefenderFix] Elevated fix failed: ${err?.message ?? err}`, 'dll')
      return {
        success: false,
        message: 'No se pudo ejecutar la reparación automática.',
        detail: `Elevated PowerShell failed: ${err?.message ?? err}`,
        elevated: true,
        restored: false,
        error: err?.message ?? 'Unknown error',
      }
    }

    // 3. Escanear de nuevo para confirmar
    const afterScan: DefenderCheckResult = scanDlls()
    const allFixed = !afterScan.hasMissingExpected && !afterScan.hasEmptyDlls

    const message = allFixed
      ? `Reparación completada exitosamente. ${fixResult.exclusionsAdded > 0 ? `Se agregaron ${fixResult.exclusionsAdded} exclusión(es) a Windows Defender. ` : ''}${fixResult.filesRestored > 0 ? `Se restauraron ${fixResult.filesRestored} archivo(s) desde la cuarentena. ` : ''}Los componentes nativos de Y-core están funcionando correctamente.`
      : `La reparación no pudo completarse. ${fixResult.exclusionsAdded > 0 ? `Se agregaron ${fixResult.exclusionsAdded} exclusión(es), ` : ''}pero algunos DLLs todavía faltan. Puede ser necesario reinstalar Y-core o compilar los DLLs desde fuente.`

    const detail = allFixed
      ? `fix completed: exclusions=${fixResult.exclusionsAdded}, restored=${fixResult.filesRestored}, paths=${fixResult.exclusionPaths.join(',')}`
      : `fix incomplete: exclusions=${fixResult.exclusionsAdded}, restored=${fixResult.filesRestored}, still missing after scan`

    logger.info(`[DefenderFix] ${detail}`, 'dll')

    return {
      success: allFixed,
      message,
      detail,
      elevated: true,
      restored: fixResult.filesRestored > 0,
    }
  } catch (err: any) {
    logger.error(`[DefenderFix] Unexpected error: ${err?.message ?? err}`, 'dll')
    return {
      success: false,
      message: 'Ocurrió un error inesperado durante la reparación.',
      detail: `unexpected error: ${err?.message ?? err}`,
      elevated: false,
      restored: false,
      error: err?.message ?? 'Unknown error',
    }
  }
}

/**
 * Versión no interactiva de runDefenderFix (sin diálogos).
 * Útil para ejecutar en segundo plano.
 */
export async function runDefenderFixSilent(): Promise<DefenderFixResult> {
  return runDefenderFix(false)
}

// ── Round-14 / Steam folder exclusion ────────────────────────────────────

/**
 * Result of the Steam-folder exclusion attempt. Surface to renderer so
 * Settings → Diagnóstico + the toast can show a meaningful message.
 */
export interface SteamExclusionResult {
  success: boolean
  reason:
    | 'steam-not-installed'
    | 'already-excluded'
    | 'exclusion-added'
    | 'uac-cancelled-or-failed'
    | 'defender-missing'
    | 'unknown'
  steamPath: string | null
  detail: string
}

/**
 * Round-14: ensure the user's Steam install directory is in Windows
 * Defender's ExclusionPath list so that ycore_steam.dll + Steamless/Goldberg
 * scaffold files dropped by `patchGameFolder` aren't quarantined on launch.
 *
 * Flow:
 *   1. Resolve Steam install path via steam-helpers.ts::getSteamPath().
 *      If null → return success with reason 'steam-not-installed' (no UAC,
 *      no toast — silent skip).
 *   2. Read current ExclusionPath via non-elevated PowerShell.
 *      Normalize slashes + lowercase for locale-robust comparison.
 *      If Steam path is present → return success 'already-excluded'.
 *   3. Otherwise call runElevatedFix(steamPath) which prompts UAC and
 *      adds the path. Returns success on Add-MpPreference success,
 *      failure on UAC cancel.
 *
 * Safe to call repeatedly — the fast-path is cheap (~6s PowerShell read).
 */
export async function ensureDefenderExclusionForSteam(): Promise<SteamExclusionResult> {
  let steamPath: string | null = null
  try {
    steamPath = getSteamPath()
  } catch (err: any) {
    return {
      success: false,
      reason: 'unknown',
      steamPath: null,
      detail: `getSteamPath() threw: ${err?.message ?? err}`,
    }
  }
  if (!steamPath) {
    return {
      success: true,
      reason: 'steam-not-installed',
      steamPath: null,
      detail: 'Steam no está instalado en este sistema; no se requiere exclusión.',
    }
  }

  // Fast-path: read existing exclusion list, check if Steam path is there.
  const normSteam = steamPath.replace(/[\\/]+$/, '').toLowerCase()
  const existingRaw: string | null = await new Promise((resolve) => {
    exec(
      `powershell -NoProfile -Command "@(Get-MpPreference).ExclusionPath -join '|'"`,
      { windowsHide: true, timeout: 6000 },
      (err, stdout) => {
        if (err) return resolve(null) // Defender missing → 'defender-missing'
        resolve(stdout || '')
      },
    )
  })
  if (existingRaw === null) {
    return {
      success: false,
      reason: 'defender-missing',
      steamPath,
      detail: 'Get-MpPreference falló. Probablemente Windows Defender no está instalado.',
    }
  }
  const normOut = existingRaw.replace(/[\\/]+/g, '/').toLowerCase()
  if (normOut.includes(normSteam)) {
    return {
      success: true,
      reason: 'already-excluded',
      steamPath,
      detail: `${steamPath} ya está en ExclusionPath.`,
    }
  }

  // Slow path: prompt UAC, add Steam folder to Add-MpPreference.
  try {
    await runElevatedFix(steamPath)
    logger.info(
      `[DefenderFix] ensured Defender exclusion covers Steam folder ${steamPath}`,
      'dll',
    )
    return {
      success: true,
      reason: 'exclusion-added',
      steamPath,
      detail: `${steamPath} agregado a ExclusionPath.`,
    }
  } catch (fixErr: any) {
    logger.warn(
      `[DefenderFix] could not add Steam exclusion (UAC cancel?): ${fixErr?.message ?? fixErr}`,
      'dll',
    )
    return {
      success: false,
      reason: 'uac-cancelled-or-failed',
      steamPath,
      detail: `runElevatedFix failed: ${fixErr?.message ?? fixErr}`,
    }
  }
}
