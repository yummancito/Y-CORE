// ============================================================================
// src/components/ui/LogConsole.tsx
// ----------------------------------------------------------------------------
// Floating real-time log console — siempre visible en la parte inferior
// de la AppShell. Muestra las últimas entradas de log a medida que llegan,
// con código de colores por nivel. Click para expandir/colapsar.
//
// Resuelve: "los logs no llegan en tiempo real" — el usuario ve los logs
// desde cualquier página, no solo en /logs.
// ============================================================================

import { useState, useEffect, useRef, useCallback } from 'react'
import { ChevronUp, ChevronDown, Terminal, Info, AlertTriangle, XCircle } from 'lucide-react'
import type { LogEntry } from '../../domain/types'

type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR'

const LEVEL_COLORS: Record<string, string> = {
  DEBUG: 'text-gray-400',
  INFO: 'text-blue-400',
  WARN: 'text-yellow-400',
  ERROR: 'text-red-400',
}

const LEVEL_ICONS: Record<string, typeof Info> = {
  DEBUG: Info,
  INFO: Info,
  WARN: AlertTriangle,
  ERROR: XCircle,
}

const MAX_VISIBLE_ENTRIES_COMPACT = 3
const MAX_VISIBLE_ENTRIES_EXPANDED = 20
const DEFAULT_AUTO_HIDE_MS = 8_000

export function LogConsole() {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [expanded, setExpanded] = useState(false)
  const [autoHide, setAutoHide] = useState(true)
  const scrollerRef = useRef<HTMLDivElement>(null)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Cargar logs iniciales
  useEffect(() => {
    if (typeof window !== 'undefined' && window.steamtools?.getLogs) {
      window.steamtools.getLogs({ limit: MAX_VISIBLE_ENTRIES_EXPANDED }).then((entries: LogEntry[]) => {
        setLogs(entries)
      }).catch(() => {
        // No Electron context
      })
    }
  }, [])

  // Suscribirse a logs en tiempo real
  useEffect(() => {
    if (typeof window === 'undefined' || !window.steamtools?.onLogEntry) return

    const unsubscribe = window.steamtools.onLogEntry((entry: LogEntry) => {
      setLogs(prev => {
        const next = [...prev, entry]
        return next.slice(-MAX_VISIBLE_ENTRIES_EXPANDED)
      })

      // Si hay una nueva entry, resetear el timer de auto-ocultamiento
      if (autoHide && entry.level === 'ERROR' || entry.level === 'WARN') {
        // Los errores/warnings mantienen el console visible más tiempo
        resetAutoHideTimer(12_000)
      } else if (autoHide) {
        resetAutoHideTimer(DEFAULT_AUTO_HIDE_MS)
      }
    })

    return () => {
      unsubscribe()
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current)
      }
    }
  }, [autoHide])

  // Resetear timer de auto-ocultamiento
  const resetAutoHideTimer = useCallback((ms: number) => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current)
    }
    if (autoHide) {
      hideTimerRef.current = setTimeout(() => {
        setExpanded(false)
      }, ms)
    }
  }, [autoHide])

  // Auto-scroll al último log
  useEffect(() => {
    if (scrollerRef.current) {
      scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight
    }
  }, [logs])

  // Mostrar/ocultar al pasar el mouse
  const [hovered, setHovered] = useState(false)

  const visibleLogs = expanded
    ? logs.slice(-MAX_VISIBLE_ENTRIES_EXPANDED)
    : logs.slice(-MAX_VISIBLE_ENTRIES_COMPACT)

  const formatTime = (iso: string) => {
    const d = new Date(iso)
    return d.toLocaleTimeString('en-US', { hour12: false }) + '.' + String(d.getMilliseconds()).padStart(3, '0')
  }

  if (logs.length === 0) return null

  return (
    <div
      className={`fixed bottom-0 left-0 right-0 z-50 transition-all duration-300 ease-out ${
        hovered || expanded ? 'translate-y-0' : 'translate-y-[calc(100%-32px)]'
      }`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Peek bar — siempre visible */}
      <div
        className="relative h-8 px-4 flex items-center gap-3 cursor-pointer bg-[#0d1117]/95 backdrop-blur-xl border-t border-[#30363d] hover:bg-[#161b22]/95 transition-colors select-none"
        onClick={() => {
          setExpanded(!expanded)
          if (autoHide && hideTimerRef.current) {
            clearTimeout(hideTimerRef.current)
          }
        }}
      >
        <Terminal className="w-3.5 h-3.5 text-text-dim flex-shrink-0" />
        <div className="flex-1 flex items-center gap-2 overflow-hidden">
          {visibleLogs.slice(0, expanded ? MAX_VISIBLE_ENTRIES_EXPANDED : MAX_VISIBLE_ENTRIES_COMPACT).map((entry, i) => {
            const Icon = LEVEL_ICONS[entry.level] || Info
            const isLast = i === Math.min(visibleLogs.length - 1, MAX_VISIBLE_ENTRIES_COMPACT - 1)
            return (
              <span
                key={`${entry.timestamp}-${i}`}
                className={`flex items-center gap-1 text-[11px] font-mono whitespace-nowrap ${
                  isLast ? '' : 'opacity-50'
                }`}
              >
                <Icon className={`w-3 h-3 ${LEVEL_COLORS[entry.level]}`} />
                <span className={LEVEL_COLORS[entry.level]}>
                  {entry.message.length > 50 ? entry.message.slice(0, 50) + '…' : entry.message}
                </span>
              </span>
            )
          })}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={(e) => {
              e.stopPropagation()
              setAutoHide(!autoHide)
            }}
            className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
              autoHide ? 'text-text-dim bg-white/5' : 'text-accent bg-accent/15'
            }`}
            title={autoHide ? 'Auto-ocultar activado' : 'Auto-ocultar desactivado'}
          >
            {autoHide ? 'AUTO' : 'PIN'}
          </button>
          <span className="text-[10px] text-text-dim font-mono">{logs.length} entries</span>
          {expanded ? (
            <ChevronDown className="w-3.5 h-3.5 text-text-dim" />
          ) : (
            <ChevronUp className="w-3.5 h-3.5 text-text-dim" />
          )}
        </div>
      </div>

      {/* Expanded log viewer */}
      {expanded && (
        <div
          ref={scrollerRef}
          className="h-48 overflow-y-auto bg-[#0d1117]/95 backdrop-blur-xl border-t border-[#30363d] px-4 py-2 font-mono text-xs space-y-0.5"
        >
          {visibleLogs.map((entry, i) => {
            const Icon = LEVEL_ICONS[entry.level] || Info
            return (
              <div
                key={`${entry.timestamp}-${i}`}
                className="flex items-start gap-2 py-0.5 hover:bg-white/[0.03] rounded px-1 transition-colors"
              >
                <span className="text-text-dim flex-shrink-0 text-[10px] select-none w-24 text-right">
                  {formatTime(entry.timestamp)}
                </span>
                <Icon className={`w-3 h-3 mt-0.5 flex-shrink-0 ${LEVEL_COLORS[entry.level]}`} />
                <span className={`font-bold flex-shrink-0 ${LEVEL_COLORS[entry.level]} text-[10px]`}>
                  [{entry.level}]
                </span>
                {entry.source && (
                  <span className="text-purple-400 flex-shrink-0 text-[10px]">
                    ({entry.source})
                  </span>
                )}
                <span className="text-text-primary break-all">
                  {entry.message}
                </span>
              </div>
            )
          })}
          {visibleLogs.length === 0 && (
            <div className="text-text-dim text-center py-4 text-[11px]">No log entries yet</div>
          )}
        </div>
      )}
    </div>
  )
}
