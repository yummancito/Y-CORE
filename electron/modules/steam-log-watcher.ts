import { ipcMain, BrowserWindow } from 'electron'
import fs from 'fs'
import path from 'path'
import { logger } from '../logger'
import { getSteamPath } from './steam-helpers'

interface ErrorPattern {
  regex: RegExp
  type: string
  message: string
  solution: string
}

const ERROR_PATTERNS: ErrorPattern[] = [
  {
    regex: /No connection to Steam servers|Could not connect to Steam network/i,
    type: 'no_connection',
    message: 'Steam no puede conectar a los servidores.',
    solution: 'restart_steam',
  },
  {
    regex: /Failed to load library|DLL not found|unable to load/i,
    type: 'dll_missing',
    message: 'Falta una DLL o librería de Steam.',
    solution: 'verify_steam',
  },
  {
    regex: /Steam\.exe has stopped working|crash/i,
    type: 'crash',
    message: 'Steam ha crasheado.',
    solution: 'restart_steam',
  },
  {
    regex: /Disk write error/i,
    type: 'disk_write',
    message: 'Error de escritura en disco.',
    solution: 'check_disk',
  },
  {
    regex: /Fatal error|Failed to initialize/i,
    type: 'fatal',
    message: 'Steam ha encontrado un error fatal.',
    solution: 'restart_steam',
  },
]

let watcher: fs.FSWatcher | null = null
let retryTimer: NodeJS.Timeout | null = null
let lastByteOffset = 0
let lastErrorByType = new Map<string, number>()
const SPAM_COOLDOWN_MS = 30000

function getConsoleLogPath(): string | null {
  const steamPath = getSteamPath()
  if (!steamPath) return null
  return path.join(steamPath, 'logs', 'console_log.txt')
}

function checkLine(line: string): void {
  for (const pattern of ERROR_PATTERNS) {
    if (pattern.regex.test(line)) {
      const now = Date.now()
      const lastTime = lastErrorByType.get(pattern.type)
      if (lastTime && now - lastTime < SPAM_COOLDOWN_MS) return
      lastErrorByType.set(pattern.type, now)

      const errorData = {
        type: pattern.type,
        message: pattern.message,
        solution: pattern.solution,
        rawLine: line.trim(),
      }

      logger.warn(`[Steam Log Watcher] ${line.trim()}`, 'steam-watcher')

      for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.send('steam:error', errorData)
      }
      return
    }
  }
}

function tailFile(filePath: string): void {
  try {
    const stat = fs.statSync(filePath)
    if (stat.size < lastByteOffset) {
      // File was truncated/rotated
      lastByteOffset = 0
    }

    if (stat.size === lastByteOffset) return

    const fd = fs.openSync(filePath, 'r')
    const length = stat.size - lastByteOffset
    const buffer = Buffer.alloc(length)
    fs.readSync(fd, buffer, 0, length, lastByteOffset)
    fs.closeSync(fd)

    lastByteOffset = stat.size

    const content = buffer.toString('utf-8')
    const lines = content.split('\n')
    for (const line of lines) {
      if (line.trim()) checkLine(line)
    }
  } catch (err: any) {
    logger.warn(`[Steam Log Watcher] tailFile error: ${err.message}`, 'steam-watcher')
  }
}

export function startSteamLogWatcher(): void {
  const logPath = getConsoleLogPath()
  if (!logPath) {
    logger.warn('[Steam Log Watcher] Steam path not found, cannot start watcher', 'steam-watcher')
    return
  }

  if (watcher) {
    logger.info('[Steam Log Watcher] Already running', 'steam-watcher')
    return
  }

  const startWatching = () => {
    if (!fs.existsSync(logPath)) {
      retryTimer = setTimeout(startWatching, 5000)
      return
    }

    // Initialize offset to end of file
    try {
      const stat = fs.statSync(logPath)
      lastByteOffset = stat.size
    } catch {}

    watcher = fs.watch(logPath, (eventType) => {
      if (eventType === 'change') {
        tailFile(logPath)
      }
    })

    watcher.on('error', (err) => {
      logger.warn(`[Steam Log Watcher] Watch error: ${err.message}`, 'steam-watcher')
      stopSteamLogWatcher()
      retryTimer = setTimeout(startWatching, 5000)
    })

    logger.info('[Steam Log Watcher] Started monitoring console_log.txt', 'steam-watcher')
  }

  startWatching()
}

export function stopSteamLogWatcher(): void {
  if (watcher) {
    watcher.close()
    watcher = null
  }
  if (retryTimer) {
    clearTimeout(retryTimer)
    retryTimer = null
  }
  logger.info('[Steam Log Watcher] Stopped', 'steam-watcher')
}

export function registerSteamLogWatcherHandlers(): void {
  ipcMain.handle('steam-log-watcher:start', async () => {
    startSteamLogWatcher()
    return { success: true }
  })

  ipcMain.handle('steam-log-watcher:stop', async () => {
    stopSteamLogWatcher()
    return { success: true }
  })
}
