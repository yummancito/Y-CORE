import { useEffect, useRef, useState } from 'react'
import {
  Cpu,
  Monitor,
  ShieldCheck,
  ShieldAlert,
  Loader2,
  RefreshCw,
  Download,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'
import { useRuntimeStore } from '../../stores/useRuntimeStore'

export function RuntimeCenter() {
  const { runtimes, directX, checking, installing, installResult, detectAll, installRuntime, clearInstallResult } =
    useRuntimeStore()
  const [expanded, setExpanded] = useState(true)
  // useRef (not useState) survives React StrictMode unmount-remount so
  // detectAll() fires exactly once per component instance, not twice.
  const startedRef = useRef(false)

  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true
    if (runtimes.length === 0) detectAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const missing = runtimes.filter((r) => !r.installed)
  const installed = runtimes.filter((r) => r.installed)

  return (
    <div
      className="rounded-2xl overflow-hidden transition-all"
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border-color)',
        boxShadow: 'var(--card-shadow)',
      }}
    >
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-5 py-4 cursor-pointer transition-colors hover:bg-white/[0.03]"
      >
        <div className="flex items-center gap-3">
          <Cpu className="w-5 h-5" style={{ color: 'var(--accent)' }} />
          <span className="text-sm font-bold text-text-bright">Game Runtimes</span>
          <span
            className="text-xs font-semibold px-2 py-0.5 rounded-full"
            style={{
              background: missing.length === 0
                ? 'rgba(34,197,94,0.12)'
                : 'rgba(239,68,68,0.12)',
              color: missing.length === 0 ? 'var(--green)' : 'var(--red)',
              border: `1px solid ${
                missing.length === 0
                  ? 'rgba(34,197,94,0.25)'
                  : 'rgba(239,68,68,0.25)'
              }`,
            }}
          >
            {missing.length === 0
              ? 'All installed'
              : `${missing.length} missing`}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation()
              detectAll()
            }}
            className="p-1.5 rounded-lg transition-colors hover:bg-white/[0.08]"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 text-text-dim ${checking ? 'animate-spin' : ''}`} />
          </button>
          {expanded ? (
            <ChevronDown className="w-4 h-4 text-text-dim" />
          ) : (
            <ChevronRight className="w-4 h-4 text-text-dim" />
          )}
        </div>
      </button>

      {/* Content */}
      {expanded && (
        <div className="px-5 pb-5 space-y-1">
          {checking && runtimes.length === 0 ? (
            <div className="flex items-center justify-center py-6 text-text-dim">
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
              <span className="text-sm">Scanning registry...</span>
            </div>
          ) : (
            <>
              {/* DirectX Version */}
              <div className="flex items-center justify-between py-2.5 px-3 rounded-xl bg-white/[0.03]">
                <div className="flex items-center gap-2.5">
                  <Monitor className="w-4 h-4 text-accent" />
                  <span className="text-sm text-text-primary">DirectX</span>
                </div>
                <span className="text-sm font-mono font-semibold" style={{ color: 'var(--accent)' }}>
                  {directX !== 'unknown' ? `DirectX ${directX}` : 'Unknown'}
                </span>
              </div>

              {/* Runtime List */}
              {runtimes.map((runtime, i) => (
                <RuntimeItem
                  key={i}
                  runtime={runtime}
                  installing={installing === runtime.name}
                  onInstall={() => installRuntime(runtime.name)}
                />
              ))}

              {/* Summary */}
              <div
                className="flex items-center justify-between py-3 px-3 rounded-xl mt-2"
                style={{
                  background:
                    missing.length === 0
                      ? 'rgba(34,197,94,0.06)'
                      : 'rgba(239,68,68,0.06)',
                  border: `1px solid ${
                    missing.length === 0
                      ? 'rgba(34,197,94,0.15)'
                      : 'rgba(239,68,68,0.15)'
                  }`,
                }}
              >
                <div className="flex items-center gap-2">
                  {missing.length === 0 ? (
                    <CheckCircle2 className="w-4 h-4" style={{ color: 'var(--green)' }} />
                  ) : (
                    <XCircle className="w-4 h-4" style={{ color: 'var(--red)' }} />
                  )}
                  <span className="text-xs font-medium" style={{ color: 'var(--text-dim)' }}>
                    {installed.length} installed, {missing.length} missing
                  </span>
                </div>
                {missing.length > 0 && (
                  <button
                    onClick={async () => {
                      for (const r of missing) {
                        await installRuntime(r.name)
                      }
                    }}
                    disabled={installing !== null}
                    className="text-xs font-bold px-3 py-1.5 rounded-lg transition-all hover:brightness-110 disabled:opacity-50"
                    style={{
                      background: 'var(--accent)',
                      color: '#fff',
                    }}
                  >
                    {installing ? 'Installing...' : 'Install All'}
                  </button>
                )}
              </div>

              {/* Install Result */}
              {installResult && (
                <div
                  className="flex items-center gap-2 py-2 px-3 rounded-xl text-xs font-medium mt-2"
                  style={{
                    background: installResult.success
                      ? 'rgba(34,197,94,0.1)'
                      : 'rgba(239,68,68,0.1)',
                    color: installResult.success ? 'var(--green)' : 'var(--red)',
                  }}
                >
                  <span>{installResult.message}</span>
                  <button
                    onClick={clearInstallResult}
                    className="ml-auto text-text-dim hover:text-text-bright"
                  >
                    ×
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

function RuntimeItem({
  runtime,
  installing,
  onInstall,
}: {
  runtime: { name: string; installed: boolean; version?: string }
  installing: boolean
  onInstall: () => void
}) {
  const [installStarted, setInstallStarted] = useState(false)

  return (
    <div className="flex items-center justify-between py-2 px-3 rounded-xl hover:bg-white/[0.03] transition-colors">
      <div className="flex items-center gap-2.5 min-w-0">
        {runtime.installed ? (
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--green)' }} />
        ) : (
          <XCircle className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--red)' }} />
        )}
        <div className="min-w-0">
          <p className="text-sm text-text-primary truncate">{runtime.name}</p>
          {runtime.version && (
            <p className="text-xs text-text-dim font-mono">{runtime.version}</p>
          )}
        </div>
      </div>
      {!runtime.installed && (
        <button
          onClick={() => {
            setInstallStarted(true)
            onInstall()
          }}
          disabled={installStarted || installing}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all hover:brightness-110 disabled:opacity-50 flex-shrink-0"
          style={{ background: 'var(--accent)', color: '#fff' }}
        >
          {installing ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <Download className="w-3 h-3" />
          )}
          Install
        </button>
      )}
    </div>
  )
}
