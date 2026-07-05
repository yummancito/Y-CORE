import fs from 'fs'
import path from 'path'
import { app, BrowserWindow } from 'electron'

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR'

export interface LogEntry {
  timestamp: string
  level: LogLevel
  message: string
  source?: string
}

export interface LogConfig {
  enabled: boolean
  minLevel: LogLevel
  maxFileSize: number
  maxBackups: number
}

const LEVEL_ORDER: Record<LogLevel, number> = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
}

const CONFIG_FILE = 'log-config.json'
const LOG_FILE = 'ycore.log'

let config: LogConfig = {
  enabled: true,
  minLevel: 'INFO',
  maxFileSize: 5 * 1024 * 1024,
  maxBackups: 3,
}

let logFilePath: string = ''
let configFilePath: string = ''
let inMemoryLogs: LogEntry[] = []
const MAX_IN_MEMORY = 500

function getLogDir(): string {
  const userDataPath = app.getPath('userData')
  const logDir = path.join(userDataPath, 'logs')
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true })
  }
  return logDir
}

function loadConfig(): void {
  try {
    configFilePath = path.join(getLogDir(), CONFIG_FILE)
    if (fs.existsSync(configFilePath)) {
      const raw = fs.readFileSync(configFilePath, 'utf-8')
      config = { ...config, ...JSON.parse(raw) }
    }
  } catch {
  }
}

function saveConfig(): void {
  try {
    fs.writeFileSync(configFilePath, JSON.stringify(config, null, 2), 'utf-8')
  } catch {
  }
}

function rotateLogs(): void {
  if (!fs.existsSync(logFilePath)) return
  const stats = fs.statSync(logFilePath)
  if (stats.size < config.maxFileSize) return

  for (let i = config.maxBackups; i > 0; i--) {
    const oldFile = `${logFilePath}.${i}`
    const newFile = `${logFilePath}.${i + 1}`
    if (fs.existsSync(oldFile)) {
      if (i === config.maxBackups) {
        fs.unlinkSync(oldFile)
      } else {
        fs.renameSync(oldFile, newFile)
      }
    }
  }

  if (fs.existsSync(logFilePath)) {
    fs.renameSync(logFilePath, `${logFilePath}.1`)
  }
}

function writeToLog(entry: LogEntry): void {
  if (!config.enabled) return
  if (LEVEL_ORDER[entry.level] < LEVEL_ORDER[config.minLevel]) return

  try {
    rotateLogs()
    const line = `[${entry.timestamp}] [${entry.level}]${entry.source ? ` [${entry.source}]` : ''} ${entry.message}\n`
    fs.appendFileSync(logFilePath, line, 'utf-8')
  } catch {
  }
}

function notifyRenderers(entry: LogEntry): void {
  inMemoryLogs.push(entry)
  if (inMemoryLogs.length > MAX_IN_MEMORY) {
    inMemoryLogs = inMemoryLogs.slice(-MAX_IN_MEMORY)
  }

  for (const win of BrowserWindow.getAllWindows()) {
    try {
      win.webContents.send('log:entry', entry)
    } catch {
    }
  }
}

function log(level: LogLevel, message: string, source?: string): void {
  if (!config.enabled) return
  if (LEVEL_ORDER[level] < LEVEL_ORDER[config.minLevel]) return

  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    source: source || undefined,
  }

  writeToLog(entry)
  notifyRenderers(entry)

  const consoleMsg = `[${entry.level}] ${message}`
  if (level === 'ERROR') console.error(consoleMsg)
  else if (level === 'WARN') console.warn(consoleMsg)
  else if (level === 'DEBUG') console.debug(consoleMsg)
  else console.log(consoleMsg)
}

export const logger = {
  init(): void {
    loadConfig()
    logFilePath = path.join(getLogDir(), LOG_FILE)
    log('INFO', 'Logger initialized', 'logger')
  },

  debug(message: string, source?: string): void {
    log('DEBUG', message, source)
  },

  info(message: string, source?: string): void {
    log('INFO', message, source)
  },

  warn(message: string, source?: string): void {
    log('WARN', message, source)
  },

  error(message: string, source?: string): void {
    log('ERROR', message, source)
  },

  getEntries(filter?: { level?: LogLevel; search?: string; limit?: number }): LogEntry[] {
    let entries = [...inMemoryLogs]
    if (filter?.level) {
      entries = entries.filter(e => LEVEL_ORDER[e.level] >= LEVEL_ORDER[filter.level!])
    }
    if (filter?.search) {
      const q = filter.search.toLowerCase()
      entries = entries.filter(e =>
        e.message.toLowerCase().includes(q) ||
        e.source?.toLowerCase().includes(q) ||
        e.level.toLowerCase().includes(q)
      )
    }
    const limit = filter?.limit || 200
    return entries.slice(-limit)
  },

  getAllEntries(): LogEntry[] {
    return [...inMemoryLogs]
  },

  clear(): void {
    inMemoryLogs = []
    try {
      if (fs.existsSync(logFilePath)) {
        fs.writeFileSync(logFilePath, '', 'utf-8')
      }
      for (let i = 1; i <= config.maxBackups; i++) {
        const backup = `${logFilePath}.${i}`
        if (fs.existsSync(backup)) fs.unlinkSync(backup)
      }
    } catch {
    }
    log('INFO', 'Logs cleared', 'logger')
  },

  export(targetPath: string): { success: boolean; error?: string } {
    try {
      let content = ''
      if (fs.existsSync(logFilePath)) {
        content = fs.readFileSync(logFilePath, 'utf-8')
      }
      for (let i = 1; i <= config.maxBackups; i++) {
        const backup = `${logFilePath}.${i}`
        if (fs.existsSync(backup)) {
          content = fs.readFileSync(backup, 'utf-8') + '\n' + content
        }
      }
      fs.writeFileSync(targetPath, content, 'utf-8')
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  },

  getConfig(): LogConfig {
    return { ...config }
  },

  setConfig(partial: Partial<LogConfig>): LogConfig {
    config = { ...config, ...partial }
    saveConfig()
    log('INFO', `Log config updated: ${JSON.stringify(partial)}`, 'logger')
    return { ...config }
  },

  getLogFilePath(): string {
    return logFilePath
  },
}
