#!/usr/bin/env node
/**
 * build-or-download-dll.mjs
 *
 * Fallback builder para ycore_steam.dll:
 *   1. Intenta compilar localmente (scripts/build-ycore-steam.bat)
 *   2. Si falla (antivirus, cmake missing, etc) → descarga pre-compilado
 *   3. Cachea en resources/native/ para reusos
 *
 * Exit codes:
 *   0 = éxito (compilado o descargado)
 *   1 = fallo crítico (no pudo descargar ni compilar)
 */

import { spawn } from 'child_process'
import https from 'https'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { fileURLToPath } from 'url'
import koffi from 'koffi'  // ESM import (require() NO existe en .mjs)

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const nativeDir = path.join(rootDir, 'resources', 'native')
const dllPath = path.join(nativeDir, 'ycore_steam.dll')

// URL del DLL pre-compilado (GitHub releases o CDN).
// Round-13: la v3.0.1 distribuía el DLL BASURA (177,664 bytes, cero exports)
// — NUNCA descargar de una release anterior a v4.2.6. El fallback solo se
// usa cuando no hay DLL válido local y cmake no está disponible.
const PREBUILT_URL = process.env.YCORE_STEAM_DLL_URL ||
  'https://github.com/yummancito/Y-CORE/releases/download/v4.2.6/ycore_steam.dll'

console.log('[build-or-download-dll] Iniciando builder con fallback...')

/**
 * Encuentra cmake en las ubicaciones estándar de Visual Studio
 */
function findCMake() {
  const candidates = [
    'C:\\Program Files\\CMake\\bin\\cmake.exe',
    'C:\\Program Files (x86)\\CMake\\bin\\cmake.exe',
    'C:\\Program Files\\Microsoft Visual Studio\\2022\\Enterprise\\Common7\\IDE\\CommonExtensions\\Microsoft\\CMake\\CMake\\bin\\cmake.exe',
    'C:\\Program Files (x86)\\Microsoft Visual Studio\\2022\\BuildTools\\Common7\\IDE\\CommonExtensions\\Microsoft\\CMake\\CMake\\bin\\cmake.exe',
    'C:\\Program Files\\Microsoft Visual Studio\\2022\\Community\\Common7\\IDE\\CommonExtensions\\Microsoft\\CMake\\CMake\\bin\\cmake.exe',
  ]

  for (const c of candidates) {
    if (fs.existsSync(c)) {
      console.log(`[build-or-download-dll] CMake encontrado: ${c}`)
      return c
    }
  }
  return null
}

/**
 * Intenta compilar localmente
 */
function buildLocally() {
  return new Promise((resolve) => {
    console.log('[build-or-download-dll] Paso 1: Intentando compilar localmente...')

    const batPath = path.join(__dirname, 'build-ycore-steam.bat')

    // Buscar cmake si no está en PATH
    const cmakePath = findCMake()
    const env = process.env
    if (cmakePath) {
      const cmakeDir = path.dirname(cmakePath)
      env.PATH = `${cmakeDir};${env.PATH}`
    }

    const proc = spawn('cmd.exe', ['/c', batPath], {
      stdio: 'inherit',
      cwd: rootDir,
      windowsHide: true,
      env,
    })

    proc.on('close', (code) => {
      if (code === 0) {
        console.log('[build-or-download-dll] ✓ Compilación local exitosa')
        resolve(true)
      } else {
        console.log(`[build-or-download-dll] ✗ Compilación falló (exit=${code})`)
        resolve(false)
      }
    })

    proc.on('error', (err) => {
      console.log(`[build-or-download-dll] ✗ Error ejecutando build: ${err.message}`)
      resolve(false)
    })
  })
}

/**
 * Descarga DLL pre-compilado
 */
function downloadPrebuilt() {
  return new Promise((resolve) => {
    console.log(`[build-or-download-dll] Paso 2: Descargando DLL pre-compilado desde ${PREBUILT_URL}...`)

    if (!fs.existsSync(nativeDir)) {
      fs.mkdirSync(nativeDir, { recursive: true })
    }

    https.get(PREBUILT_URL, (res) => {
      if (res.statusCode !== 200) {
        console.log(`[build-or-download-dll] ✗ HTTP ${res.statusCode} descargando ${PREBUILT_URL}`)
        resolve(false)
        return
      }

      const file = fs.createWriteStream(dllPath)
      res.pipe(file)

      file.on('finish', () => {
        file.close()
        const stats = fs.statSync(dllPath)
        console.log(`[build-or-download-dll] ✓ DLL descargado: ${stats.size} bytes`)
        resolve(true)
      })

      file.on('error', (err) => {
        fs.unlink(dllPath, () => {})
        console.log(`[build-or-download-dll] ✗ Error escribiendo archivo: ${err.message}`)
        resolve(false)
      })
    }).on('error', (err) => {
      console.log(`[build-or-download-dll] ✗ Error descargando: ${err.message}`)
      resolve(false)
    })
  })
}

/**
 * Verifica si el DLL ya existe y es válido.
 *
 * Round-13 FIX (bug crítico): antes solo se validaba el TAMAÑO (0-100MB),
 * lo que dejaba pasar cualquier archivo con ese rango — incluyendo el DLL
 * basura de 177,664 bytes que se distribuyó en releases y que NO exportaba
 * ninguna función del emulador (los juegos abrían contra Steam real →
 * "Comprar" en la librería, y el log mostraba "Cannot find function
 * ycore_steam_version"). Ahora se valida que el PE exporte realmente las
 * funciones que el bridge TS (electron/modules/local-steam-emulator.ts)
 * bindea con koffi. Si el DLL es inválido → se fuerza compilar/descargar.
 */
function isDllValid() {
  if (!fs.existsSync(dllPath)) return false
  const stats = fs.statSync(dllPath)
  if (!(stats.size > 0 && stats.size < 100 * 1024 * 1024)) return false

  // Validación de exports reales. koffi lanza "Cannot find function" si un
  // símbolo no existe en el PE (o si el archivo no es un DLL válido).
  // Cada export se bindea UNA sola vez con su firma real — re-bindear el
  // mismo símbolo con otra firma puede lanzar error en koffi.
  const REQUIRED_EXPORTS = [
    ['const char*', 'ycore_steam_version'],
    ['int', 'ycore_steam_short_sha'],
    ['int', 'ycore_steam_init'],
    ['void', 'ycore_steam_shutdown'],
    ['int', 'ycore_steam_restart_app_if_necessary'],
    ['void', 'ycore_steam_run_callbacks'],
    ['unsigned int', 'ycore_steam_get_h_steam_user'],
    ['unsigned int', 'ycore_steam_get_h_steam_pipe'],
    ['unsigned int', 'ycore_steam_get_app_id'],
    ['const void*', 'ycore_steam_iface_user'],
    ['const void*', 'ycore_steam_iface_utils'],
    ['const void*', 'ycore_steam_iface_apps'],
    ['const void*', 'ycore_steam_iface_client'],
    ['const void*', 'ycore_steam_iface_networking'],
  ]
  try {
    const lib = koffi.load(dllPath)
    let versionFn = null
    for (const [ret, name] of REQUIRED_EXPORTS) {
      const fn = lib.func(`${ret} ${name}()`)
      if (name === 'ycore_steam_version') versionFn = fn
    }
    // Sanity check mínimo: version() debe devolver un string no vacío.
    const version = versionFn ? versionFn() : null
    if (!version || !String(version).length) {
      console.log(`[build-or-download-dll] ✗ ycore_steam.dll presente pero version() inválida (${String(version)})`)
      return false
    }
    return true
  } catch (err) {
    console.log(`[build-or-download-dll] ✗ ycore_steam.dll presente pero exports inválidos: ${err?.message ?? err}`)
    return false
  }
}

/**
 * Main flow
 */
async function main() {
  try {
    // Verificar si DLL ya existe y es válido
    if (isDllValid()) {
      const stats = fs.statSync(dllPath)
      console.log(`[build-or-download-dll] DLL ya presente (${stats.size} bytes) — saltando build`)
      process.exit(0)
    }

    // Paso 1: Intentar compilación local
    const localBuildSuccess = await buildLocally()
    if (localBuildSuccess && isDllValid()) {
      console.log('[build-or-download-dll] DONE — ycore_steam.dll (compilado localmente) listo')
      process.exit(0)
    }

    // Paso 2: Fallback a descarga
    const downloadSuccess = await downloadPrebuilt()
    if (downloadSuccess && isDllValid()) {
      console.log('[build-or-download-dll] DONE — ycore_steam.dll (pre-compilado) listo')
      process.exit(0)
    }

    // Paso 3: Fallo total
    console.error('[build-or-download-dll] FATAL: No se pudo compilar ni descargar ycore_steam.dll')
    console.error('[build-or-download-dll] Soluciones:')
    console.error('')
    console.error('  ▶ OPCIÓN 1: Compilar localmente (requiere cmake + Visual Studio)')
    console.error('    1. Instala cmake 3.20+ desde https://cmake.org/download/')
    console.error('    2. Instala Visual Studio Build Tools 2022')
    console.error('    3. Ejecuta: npm run build:native')
    console.error('')
    console.error('  ▶ OPCIÓN 2: Permitir compilación en Defender')
    console.error('    1. Windows Settings → Virus & threat protection')
    console.error('    2. Manage settings → Add exceptions')
    console.error('    3. Agrega: %APPDATA%\\Y-core')
    console.error('    4. Ejecuta: npm run build:native')
    console.error('')
    console.error('  ▶ OPCIÓN 3: Usar DLL pre-compilado personalizado')
    console.error(`    1. Copia ycore_steam.dll a: resources/native/ycore_steam.dll`)
    console.error(`    2. O configura URL: set YCORE_STEAM_DLL_URL=https://tu-servidor/dll`)
    console.error('')
    console.error('  ▶ OPCIÓN 4: Usar Goldberg Lite como emulador alternativo')
    console.error('    (Y-core degradará automáticamente al fallback)')
    console.error('')
    process.exit(1)
  } catch (err) {
    console.error(`[build-or-download-dll] Error inesperado: ${err.message}`)
    process.exit(1)
  }
}

main()
