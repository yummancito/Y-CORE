// ============================================================================
// electron/services/fix-installer.service.ts
// ============================================================================
// Descarga y aplica game fixes desde DepotBox directamente a carpeta del juego
// Soporta: OnlineFix (bypass), BetaFix, NoSteam
// ============================================================================

import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { logger } from '../logger'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)
const DEPOTBOX_API = 'https://depotbox.org/api'
const DEPOTBOX_API_KEY = process.env.DEPOTBOX_API_KEY || ''

interface FixInstallResult {
  success: boolean
  message: string
  filesApplied?: string[]
  error?: string
}

export const fixInstallerService = {
  /**
   * Descarga un fix desde DepotBox e integra directamente en carpeta del juego
   */
  async downloadAndApplyFix(
    fixId: string,
    gameInstallDir: string,
    fixType: 'online' | 'bypass' | 'hypervisor' = 'online'
  ): Promise<FixInstallResult> {
    try {
      // Validar que la carpeta del juego existe
      if (!fs.existsSync(gameInstallDir)) {
        return {
          success: false,
          message: `Game installation directory not found: ${gameInstallDir}`,
          error: 'INSTALL_DIR_NOT_FOUND',
        }
      }

      logger.info(`[FixInstaller] Starting fix installation for ${fixId}`, 'fix-installer')
      logger.info(`[FixInstaller] Target directory: ${gameInstallDir}`, 'fix-installer')

      // Step 1: Descargar fix desde DepotBox
      const downloadResult = await this.downloadFix(fixId)
      if (!downloadResult.success || !downloadResult.filePath) {
        return {
          success: false,
          message: 'Failed to download fix from DepotBox',
          error: downloadResult.error,
        }
      }

      const fixArchivePath = downloadResult.filePath
      logger.info(`[FixInstaller] Downloaded fix to: ${fixArchivePath}`, 'fix-installer')

      // Step 2: Extraer el archivo
      const extractDir = path.join(os.tmpdir(), `y-core-fix-${Date.now()}`)
      const extractResult = await this.extractArchive(fixArchivePath, extractDir)
      if (!extractResult.success) {
        return {
          success: false,
          message: 'Failed to extract fix archive',
          error: extractResult.error,
        }
      }

      logger.info(`[FixInstaller] Extracted to: ${extractDir}`, 'fix-installer')

      // Step 3: Validar contenido del fix
      const filesInArchive = this.listFilesRecursive(extractDir)
      logger.info(`[FixInstaller] Found ${filesInArchive.length} files in archive`, 'fix-installer')

      // Step 4: Copiar archivos al directorio del juego
      const appliedFiles: string[] = []
      for (const file of filesInArchive) {
        const relativePath = path.relative(extractDir, file)
        const targetPath = path.join(gameInstallDir, relativePath)

        // Crear directorio si no existe
        const targetDir = path.dirname(targetPath)
        if (!fs.existsSync(targetDir)) {
          fs.mkdirSync(targetDir, { recursive: true })
        }

        // Copiar archivo
        try {
          fs.copyFileSync(file, targetPath)
          appliedFiles.push(relativePath)
          logger.info(`[FixInstaller] Applied: ${relativePath}`, 'fix-installer')
        } catch (err: any) {
          logger.warn(`[FixInstaller] Failed to apply ${relativePath}: ${err.message}`, 'fix-installer')
        }
      }

      // Step 5: Limpiar archivos temporales
      try {
        this.deleteDirectoryRecursive(extractDir)
        fs.unlinkSync(fixArchivePath)
        logger.info(`[FixInstaller] Cleaned temporary files`, 'fix-installer')
      } catch (err: any) {
        logger.warn(`[FixInstaller] Could not clean temp files: ${err.message}`, 'fix-installer')
      }

      const message = `Fix installed successfully! Applied ${appliedFiles.length} files.`
      logger.info(`[FixInstaller] SUCCESS: ${message}`, 'fix-installer')

      return {
        success: true,
        message,
        filesApplied: appliedFiles,
      }
    } catch (err: any) {
      const errorMsg = err.message || 'Unknown error'
      logger.error(`[FixInstaller] Fatal error: ${errorMsg}`, 'fix-installer')
      return {
        success: false,
        message: 'Failed to install fix',
        error: errorMsg,
      }
    }
  },

  /**
   * Descarga el fix desde DepotBox API
   */
  async downloadFix(fixId: string): Promise<{ success: boolean; filePath?: string; error?: string }> {
    try {
      const url = `${DEPOTBOX_API}/game-fixes/download?id=${fixId}`
      const headers: Record<string, string> = {
        'User-Agent': 'Y-core/4.3.1',
      }

      if (DEPOTBOX_API_KEY) {
        headers['X-API-Key'] = DEPOTBOX_API_KEY
      }

      logger.info(`[FixInstaller] Downloading from: ${url}`, 'fix-installer')

      const response = await fetch(url, { headers })
      if (!response.ok) {
        return {
          success: false,
          error: `HTTP ${response.status}`,
        }
      }

      // Detectar nombre del archivo del header
      const contentDisposition = response.headers.get('content-disposition')
      let fileName = `fix-${fixId}.rar`
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="?([^"]+)"?/)
        if (match) {
          fileName = match[1]
        }
      }

      // Guardar en temp
      const tempDir = os.tmpdir()
      const filePath = path.join(tempDir, fileName)

      const buffer = await response.arrayBuffer()
      fs.writeFileSync(filePath, Buffer.from(buffer))

      logger.info(`[FixInstaller] Downloaded: ${filePath} (${buffer.byteLength} bytes)`, 'fix-installer')

      return {
        success: true,
        filePath,
      }
    } catch (err: any) {
      return {
        success: false,
        error: err.message,
      }
    }
  },

  /**
   * Extrae archivo RAR/ZIP
   */
  async extractArchive(archivePath: string, outputDir: string): Promise<{ success: boolean; error?: string }> {
    try {
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true })
      }

      const ext = path.extname(archivePath).toLowerCase()

      if (ext === '.rar') {
        // Usar WinRAR si está disponible
        const winrarPath = 'C:\\Program Files\\WinRAR\\UnRAR.exe'
        if (fs.existsSync(winrarPath)) {
          await execAsync(`"${winrarPath}" x "${archivePath}" "${outputDir}"`)
          logger.info(`[FixInstaller] Extracted RAR with WinRAR`, 'fix-installer')
          return { success: true }
        } else {
          logger.warn(`[FixInstaller] WinRAR not found, trying 7-Zip`, 'fix-installer')
          // Intentar con 7-Zip
          await execAsync(`7z x "${archivePath}" -o"${outputDir}"`)
          logger.info(`[FixInstaller] Extracted RAR with 7-Zip`, 'fix-installer')
          return { success: true }
        }
      } else if (ext === '.zip') {
        // Para ZIP, usar módulo nativo
        const AdmZip = require('adm-zip')
        const zip = new AdmZip(archivePath)
        zip.extractAllTo(outputDir, true)
        logger.info(`[FixInstaller] Extracted ZIP`, 'fix-installer')
        return { success: true }
      }

      return {
        success: false,
        error: `Unsupported archive format: ${ext}`,
      }
    } catch (err: any) {
      logger.error(`[FixInstaller] Extract failed: ${err.message}`, 'fix-installer')
      return {
        success: false,
        error: err.message,
      }
    }
  },

  /**
   * Listar archivos recursivamente
   */
  listFilesRecursive(dir: string): string[] {
    const files: string[] = []

    const walkDir = (currentPath: string) => {
      try {
        const items = fs.readdirSync(currentPath)
        for (const item of items) {
          const fullPath = path.join(currentPath, item)
          const stat = fs.statSync(fullPath)
          if (stat.isFile()) {
            files.push(fullPath)
          } else if (stat.isDirectory()) {
            walkDir(fullPath)
          }
        }
      } catch (err: any) {
        logger.warn(`[FixInstaller] Error reading directory ${currentPath}: ${err.message}`, 'fix-installer')
      }
    }

    walkDir(dir)
    return files
  },

  /**
   * Eliminar directorio recursivamente
   */
  deleteDirectoryRecursive(dirPath: string): void {
    if (!fs.existsSync(dirPath)) return

    const files = fs.readdirSync(dirPath)
    for (const file of files) {
      const filePath = path.join(dirPath, file)
      const stat = fs.statSync(filePath)

      if (stat.isDirectory()) {
        this.deleteDirectoryRecursive(filePath)
      } else {
        fs.unlinkSync(filePath)
      }
    }

    fs.rmdirSync(dirPath)
  },
}
