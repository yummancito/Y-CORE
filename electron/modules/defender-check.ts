// ============================================================================
// electron/modules/defender-check.ts
// ----------------------------------------------------------------------------
// Detecta si Windows Defender ha bloqueado o puesto en cuarentena los DLLs
// nativos de Y-core (ycore.dll, OpenSteamTool.dll, dwmapi.dll, xinput1_4.dll).
//
// Estos DLL son marcados como falsos positivos porque usan técnicas de
// DLL sideloading y hooking necesarias para integrarse con Steam.
//
// Este módulo NO intenta desactivar Defender — solo informa al usuario
// y provee el script para agregar exclusiones.
// ============================================================================

import path from 'path'
import fs from 'fs'
import { app, dialog, shell } from 'electron'
import { logger } from '../logger'

// ── DLLs que Defender suele marcar ─────────────────────────────────────────

interface DllInfo {
  /** Ruta absoluta esperada del DLL. */
  path: string
  /** Nombre descriptivo para mostrar en la UI. */
  name: string
  /** ¿Es crítico para el funcionamiento de la app? */
  critical: boolean
  /** ¿Se espera que exista siempre? */
  expectedAlways: boolean
}

/** Retorna la lista de DLLs según el entorno (dev vs empaquetado). */
function getDllList(appRoot: string): DllInfo[] {
  const list: DllInfo[] = []

  if (app.isPackaged) {
    // Empaquetado: resources/native/ycore.dll
    list.push({
      path: path.join(appRoot, 'resources', 'native', 'ycore.dll'),
      name: 'ycore.dll (nativo FFI)',
      critical: false,
      expectedAlways: false,
    })
  } else {
    // Dev: native/ycore/build/ycore.dll
    list.push({
      path: path.join(appRoot, 'native', 'ycore', 'build', 'ycore.dll'),
      name: 'ycore.dll (nativo FFI)',
      critical: false,
      expectedAlways: false,
    })
  }

  // DLL hook de Steam. dll-inject.ts (la fuente de verdad que realmente
  // copia estos archivos a la carpeta de Steam) los lee desde
  // native/opensteamtool/ relativo a app.getAppPath() — que Electron resuelve
  // automáticamente a app.asar.unpacked/native/opensteamtool/ en modo
  // empaquetado porque native/opensteamtool/** está en asarUnpack. Ni
  // electron/dll/ ni <exe dir>/resources/... son la ruta real; ambas fueron
  // intentos previos equivocados que hacían que el escaneo siempre reportara
  // estos 3 DLLs como "faltantes" pese a existir.
  const appPath = app.getAppPath()
  const hookDllDir = path.join(appPath, 'native', 'opensteamtool')
  logger.info(`[DefenderCheck] appPath=${appPath} hookDllDir=${hookDllDir} exists=${fs.existsSync(hookDllDir)}`, 'dll')
  list.push({
    path: path.join(hookDllDir, 'OpenSteamTool.dll'),
    name: 'YCoreTool.dll (hook Steam)',
    critical: false,
    expectedAlways: true,
  })
  list.push({
    path: path.join(hookDllDir, 'dwmapi.dll'),
    name: 'dwmapi.dll (DLL sideload)',
    critical: false,
    expectedAlways: true,
  })
  list.push({
    path: path.join(hookDllDir, 'xinput1_4.dll'),
    name: 'xinput1_4.dll (DLL sideload)',
    critical: false,
    expectedAlways: true,
  })

  return list
}

// ── Tipos públicos ─────────────────────────────────────────────────────────

export interface DllStatus {
  /** Ruta absoluta del DLL. */
  path: string
  /** Nombre descriptivo. */
  name: string
  /** true si el archivo existe en disco. */
  exists: boolean
  /** true si el archivo existe pero está corrupto (0 bytes). */
  isEmpty: boolean
  /** Última fecha de modificación (si existe). */
  mtime: string | null
  /** Tamaño en bytes (si existe). */
  size: number | null
}

export interface DefenderCheckResult {
  /** ¿Algún DLL crítico falta? */
  hasMissingCritical: boolean
  /** ¿Algún DLL esperado falta? */
  hasMissingExpected: boolean
  /** ¿Algún DLL está vacío (0 bytes, posible cuarentena parcial)? */
  hasEmptyDlls: boolean
  /** Estado detallado de cada DLL. */
  dlls: DllStatus[]
  /** ¿Hay archivos .excluded o .txt de Defender? */
  hasDefenderArtifacts: boolean
  /** Sugerencias para el usuario. */
  suggestions: string[]
}

// ── Escaneo ────────────────────────────────────────────────────────────────

/**
 * Escanea todos los DLLs nativos de Y-core y reporta su estado.
 * Útil para diagnosticar problemas de licencia/antivirus.
 */
export function scanDlls(): DefenderCheckResult {
  const appRoot = app.isPackaged
    ? path.dirname(app.getPath('exe'))
    : app.getAppPath()

  const dlls = getDllList(appRoot)
  const statuses: DllStatus[] = []
  const suggestions: string[] = []
  let hasMissingCritical = false
  let hasMissingExpected = false
  let hasEmptyDlls = false
  let hasDefenderArtifacts = false

  for (const dll of dlls) {
    let exists = false
    let isEmpty = false
    let mtime: string | null = null
    let size: number | null = null

    try {
      exists = fs.existsSync(dll.path)
      if (exists) {
        const stat = fs.statSync(dll.path)
        isEmpty = stat.size === 0
        size = stat.size
        mtime = stat.mtime.toISOString()
      }
    } catch {
      exists = false
    }

    if (!exists && dll.expectedAlways) {
      hasMissingExpected = true
      if (dll.critical) hasMissingCritical = true

      // Check if Defender artifacts exist (quarantine markers)
      const dir = path.dirname(dll.path)
      try {
        if (fs.existsSync(dir)) {
          const files = fs.readdirSync(dir)
          for (const file of files) {
            const lower = file.toLowerCase()
            if (
              lower.includes('.excluded') ||
              lower.includes('defender') ||
              lower.includes('quarantine') ||
              lower.includes('mpcmdrun')
            ) {
              hasDefenderArtifacts = true
            }
          }
        }
      } catch {
        // ignore
      }
    }

    if (isEmpty) {
      hasEmptyDlls = true
    }

    statuses.push({
      path: dll.path,
      name: dll.name,
      exists,
      isEmpty,
      mtime,
      size,
    })
  }

  // Generar sugerencias según los hallazgos
  if (hasMissingExpected || hasEmptyDlls) {
    suggestions.push(
      'Windows Defender puede haber puesto en cuarentena los DLLs de Y-core. ' +
      'Abre Windows Security > Virus & threat protection > Protection history ' +
      'y busca "ycore" u "opensteamtool" para restaurarlos.',
    )
    suggestions.push(
      'Ejecuta el script "scripts/add-defender-exclusion.bat" como administrador ' +
      'para agregar una exclusión y evitar que vuelva a ocurrir.',
    )
  }

  if (hasMissingCritical) {
    suggestions.push(
      'Faltan DLLs críticos. Reinstala Y-core o compílalos desde fuente con "pnpm build:native".',
    )
  }

  return {
    hasMissingCritical,
    hasMissingExpected,
    hasEmptyDlls,
    dlls: statuses,
    hasDefenderArtifacts,
    suggestions,
  }
}

// ── Diálogo para el usuario ────────────────────────────────────────────────

/**
 * Muestra un diálogo informativo si se detectan DLLs faltantes,
 * con un botón para abrir la carpeta de exclusión de Defender.
 * Devuelve true si se mostró el diálogo.
 */
export function showDefenderWarningIfNeeded(): boolean {
  try {
    const result = scanDlls()

    // Solo mostrar si falta algún DLL esperado
    if (!result.hasMissingExpected && !result.hasEmptyDlls) {
      return false
    }

    // Construir mensaje
    const missingNames = result.dlls
      .filter((d) => !d.exists || d.isEmpty)
      .map((d) => `  • ${d.name}${d.isEmpty ? ' (vacio / 0 bytes)' : ''}`)

    const detail = [
      'Los siguientes componentes nativos no están disponibles:',
      '',
      ...missingNames,
      '',
      'Causa más probable: Windows Defender ha bloqueado o puesto en',
      'cuarentena los DLLs de Y-core como falsos positivos.',
      '',
      'Para solucionarlo:',
      '  1. Abre Windows Security > Virus & threat protection',
      '  2. Ve a "Protection history"',
      '  3. Busca alertas de "ycore" o "YCoreTool"',
      '  4. Restaura los archivos ("Allow on device")',
      '  5. Ejecuta el script de exclusión para evitar que vuelva a ocurrir',
      '',
      'La app puede funcionar en modo limitado sin estos componentes.',
    ].join('\n')

  dialog.showMessageBox({
      type: 'warning',
      buttons: [
        'Abrir script de exclusión',
        'Entendido (modo limitado)',
      ],
      defaultId: 1,
      cancelId: 1,
      title: 'Y-core — Componentes nativos bloqueados',
      message: 'Windows Defender bloqueó archivos de Y-core',
      detail,
    }).then(({ response }) => {
      if (response === 0) {
        // Abrir la carpeta del script de exclusión
        try {
          const scriptDir = path.join(app.getAppPath(), 'scripts')
          const batPath = path.join(scriptDir, 'add-defender-exclusion.bat')
          if (fs.existsSync(batPath)) {
            shell.openPath(scriptDir)
          } else {
            // Fallback: abrir Windows Security
            shell.openExternal('ms-settings:windowsdefender')
          }
        } catch {
          shell.openExternal('ms-settings:windowsdefender')
        }
      }
    }).catch(() => {})

    logger.warn(
      `[DefenderCheck] DLLs faltantes detectados: ${missingNames.join(', ')}`,
      'dll',
    )

    return true
  } catch (err: any) {
    logger.error(
      `[DefenderCheck] Error al escanear DLLs: ${err?.message ?? err}`,
      'dll',
    )
    return false
  }
}


