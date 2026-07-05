import { useState, useEffect, useRef, useCallback } from 'react'
import {
  ScrollText,
  Search,
  Trash2,
  Download,
  RefreshCw,
  Bug,
  Info,
  AlertTriangle,
  XCircle,
  ChevronDown,
  Copy,
  Check,
} from 'lucide-react'
import { t } from '../lib/i18n'
import { useToastStore } from '../stores/useToastStore'
import { usePageHeader } from '../components/layout/AppShell'
import { Input } from '../components/ui/Input'
import { Button } from '../components/ui/Button'
import type { LogEntry } from '../domain/types'

const LEVEL_COLORS: Record<string, string> = {
  DEBUG: 'text-gray-400',
  INFO: 'text-blue-400',
  WARN: 'text-yellow-400',
  ERROR: 'text-red-400',
}

const LEVEL_BG: Record<string, string> = {
  DEBUG: 'bg-gray-500/15 border-gray-500',
  INFO: 'bg-blue-500/15 border-blue-500',
  WARN: 'bg-yellow-500/15 border-yellow-500',
  ERROR: 'bg-red-500/15 border-red-500',
}

const LEVEL_ICONS: Record<string, typeof Bug> = {
  DEBUG: Bug,
  INFO: Info,
  WARN: AlertTriangle,
  ERROR: XCircle,
}

const LEVELS = ['DEBUG', 'INFO', 'WARN', 'ERROR'] as const

export default function LogsPage() {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [search, setSearch] = useState('')
  const [activeLevels, setActiveLevels] = useState<Set<string>>(new Set(['DEBUG', 'INFO', 'WARN', 'ERROR']))
  const [autoScroll, setAutoScroll] = useState(true)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)
  const logContainerRef = useRef<HTMLDivElement>(null)
  const { showToast } = useToastStore()

  const loadLogs = useCallback(async () => {
    setLoading(true)
    const result = await window.steamtools.getLogs({ limit: 500 })
    setLogs(result)
    setLoading(false)
  }, [])

  useEffect(() => {
    loadLogs()
  }, [loadLogs])

  useEffect(() => {
    const unsubscribe = window.steamtools.onLogEntry((entry: LogEntry) => {
      setLogs(prev => {
        const next = [...prev, entry]
        return next.slice(-500)
      })
    })
    return unsubscribe
  }, [])

  useEffect(() => {
    if (autoScroll && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight
    }
  }, [logs, autoScroll])

  const filtered = logs.filter(entry => {
    if (!activeLevels.has(entry.level)) return false
    if (search) {
      const q = search.toLowerCase()
      return entry.message.toLowerCase().includes(q) ||
        entry.source?.toLowerCase().includes(q) ||
        entry.level.toLowerCase().includes(q)
    }
    return true
  })

  const toggleLevel = (level: string) => {
    setActiveLevels(prev => {
      const next = new Set(prev)
      if (next.has(level)) next.delete(level)
      else next.add(level)
      return next
    })
  }

  const handleClear = async () => {
    await window.steamtools.clearLogs()
    setLogs([])
    showToast('success', 'Logs cleared')
  }

  const handleExport = async () => {
    const result = await window.steamtools.exportLogs()
    if (result.success) {
      showToast('success', 'Logs exported')
    } else {
      showToast('error', result.error || 'Export failed')
    }
  }

  const handleCopy = async () => {
    const text = filtered.map(e => `[${e.timestamp}] [${e.level}]${e.source ? ` (${e.source})` : ''} ${e.message}`).join('\n')
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      showToast('success', 'Logs copied to clipboard')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      showToast('error', 'Failed to copy')
    }
  }

  const formatTime = (iso: string) => {
    const d = new Date(iso)
    return d.toLocaleTimeString('en-US', { hour12: false }) + '.' + String(d.getMilliseconds()).padStart(3, '0')
  }

  usePageHeader(
    <div className="flex items-center justify-between h-11">
      <div className="flex items-center gap-4">
        <h1 className="text-xl font-bold text-text-bright leading-none">{t('logs.title')}</h1>
        <p className="text-[11px] text-text-dim">{t('logs.description')}</p>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="secondary" size="md" icon={copied ? Check : Copy} onClick={handleCopy} title={t('logs.copy')}>
          {t('logs.copy')}
        </Button>
        <Button variant="secondary" size="md" icon={RefreshCw} onClick={loadLogs} title={t('logs.refresh')}>
          {t('logs.refresh')}
        </Button>
        <Button variant="secondary" size="md" icon={Download} onClick={handleExport} title={t('logs.export')}>
          {t('logs.export')}
        </Button>
        <Button variant="danger" size="md" icon={Trash2} onClick={handleClear} title={t('logs.clear')}>
          {t('logs.clear')}
        </Button>
      </div>
    </div>,
    [copied, logs, loadLogs, handleCopy, handleExport, handleClear]
  )

  return (
    <div data-section="Logs" className="space-y-3 animate-fade-in p-6">
      {/* Filters bar */}
      <div className="flex items-center gap-3 flex-wrap px-3 py-2 bg-surface border border-border rounded-lg">
        <Input
          variant="search"
          placeholder={t('logs.search')}
          value={search}
          onClear={() => setSearch('')}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-48"
        />

        <div className="flex items-center gap-1">
          {LEVELS.map(level => {
            const Icon = LEVEL_ICONS[level]
            const isActive = activeLevels.has(level)
            return (
              <button
                key={level}
                onClick={() => toggleLevel(level)}
                className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors cursor-pointer ${
                  isActive
                    ? `${LEVEL_BG[level]} ${LEVEL_COLORS[level]}`
                    : 'text-text-dim opacity-40 hover:opacity-70'
                }`}
              >
                <Icon className="w-3 h-3" />
                {level}
              </button>
            )
          })}
        </div>

        <button
          onClick={() => setAutoScroll(!autoScroll)}
          className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors cursor-pointer ${
            autoScroll
              ? 'bg-accent/15 text-accent'
              : 'text-text-dim hover:text-text-primary'
          }`}
        >
          <ChevronDown className="w-3 h-3" />
          {t('logs.autoScroll')}
        </button>
      </div>

      {/* Terminal window */}
      <div className="rounded-lg overflow-hidden border border-border bg-[#010409] shadow-lg">
        {/* Terminal title bar */}
        <div className="flex items-center gap-2 px-4 py-2 bg-surface-light border-b border-border">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-[#ff5f56]" />
            <div className="w-3 h-3 rounded-full bg-[#ffbd2e]" />
            <div className="w-3 h-3 rounded-full bg-[#27c93f]" />
          </div>
          <span className="text-xs text-text-dim font-mono ml-2">y-core — log — {filtered.length} entries</span>
        </div>

        {/* Terminal body */}
        <div
          ref={logContainerRef}
          className="overflow-y-auto font-mono text-xs leading-relaxed"
          style={{ maxHeight: 'calc(100vh - 280px)' }}
        >
          {loading ? (
            <div className="flex items-center gap-2 px-4 py-8 text-text-dim">
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>{t('logs.loading')}</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-4 py-8 text-text-dim text-center">
              <ScrollText className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p>{t('logs.noEntries')}</p>
            </div>
          ) : (
            <div className="py-1">
              {filtered.map((entry, i) => {
                const Icon = LEVEL_ICONS[entry.level] || Info
                return (
                  <div
                    key={i}
                    className="flex items-start gap-2 px-4 py-0.5 hover:bg-white/5 transition-colors"
                  >
                    <span className="text-text-dim flex-shrink-0 select-none">
                      {formatTime(entry.timestamp)}
                    </span>
                    <span className={`flex-shrink-0 font-bold ${LEVEL_COLORS[entry.level]}`}>
                      [{entry.level}]
                    </span>
                    {entry.source && (
                      <span className="flex-shrink-0 text-purple-400">
                        ({entry.source})
                      </span>
                    )}
                    <span className="text-text-primary">
                      {entry.message}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
