// ============================================================================
// src/components/diagnostics/EmulatorDiagnosticsCard.tsx
// ----------------------------------------------------------------------------
// UI surface for `window.steamtools.getEmulatorDiagnostics()` — shows whether
// ycore_steam.dll exists on disk, reports its named exports, and tells the
// user whether the Layer 3 steam_settings/ scaffold dropped by patchGameFolder
// will actually be consumed by this DLL build.
//
// Style matches the inline DefenderCard family in SettingsPage:
//   • bg-white/[0.03] + border-white/[0.06] for neutral containers
//   • bg-green-500/[0.06] / border-green-500/20 — OK
//   • bg-red-500/[0.06]   / border-red-500/20   — failure
//   • bg-amber-500/[0.06] / border-amber-500/20 — partial / warning
//   • Text: text-text-bright (titles), text-text-dim (hints), text-text-secondary
// ============================================================================

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Cpu,
  RefreshCw,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  ListTree,
  HardDrive,
  Hash,
  Folder,
} from 'lucide-react'

interface PeExportEntry {
  address: string
  name: string
  ordinal: number
}

interface EmulatorDiagnosticsPayload {
  dllPath: string | null
  version: string | null
  dllSizeBytes: number | null
  parseError: string | null
  koffiError: string | null
  exportCount: number
  exports: string[]
  exportsDetailed: PeExportEntry[]
  expectedSettingsFiles: string[]
  goldbergLayoutSupported: string[]
}

type Status =
  | { kind: 'ok'; data: EmulatorDiagnosticsPayload }
  | { kind: 'warn'; data: EmulatorDiagnosticsPayload }
  | { kind: 'fail'; data: EmulatorDiagnosticsPayload }
// Cached between re-fetches so the UI doesn't go blank on retry.
type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; status: Status }

// Round-7 reviewer fix #3: replaced implicit-precedence ternary with explicit
// ifs. Easier for future maintainers to add cases (e.g. fatal-koffi-error).
function classify(data: EmulatorDiagnosticsPayload): Status {
  if (!data.dllPath) return { kind: 'fail', data }
  if (data.parseError && data.exportCount === 0) return { kind: 'fail', data }
  if (data.parseError || data.koffiError) return { kind: 'warn', data }
  return { kind: 'ok', data }
}

function formatSize(bytes: number | null): string {
  if (bytes == null) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

export function EmulatorDiagnosticsCard() {
  const [state, setState] = useState<LoadState>({ kind: 'loading' })
  const [expanded, setExpanded] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  // Round-7 reviewer fix #4: incoming requests get a monotonically increasing
  // id; only the response from the LATEST request applies to state. Two
  // rapid clicks can otherwise let the older response overwrite the newer
  // one for a 1-frame flicker.
  const requestId = useRef(0)

  const refresh = useCallback(async () => {
    const id = ++requestId.current
    setState({ kind: 'loading' })
    try {
      const result = (await window.steamtools.getEmulatorDiagnostics()) as EmulatorDiagnosticsPayload
      if (id !== requestId.current) return // stale response — drop it
      setState({ kind: 'ready', status: classify(result) })
    } catch (err: any) {
      if (id !== requestId.current) return
      setState({
        kind: 'ready',
        status: {
          kind: 'fail',
          data: {
            dllPath: null,
            version: null,
            dllSizeBytes: null,
            parseError: `IPC error: ${err?.message ?? err}`,
            koffiError: null,
            exportCount: 0,
            exports: [],
            exportsDetailed: [],
            expectedSettingsFiles: [
              'force_account_name.txt',
              'offline.txt',
              'appid.txt',
              'disable_overlay.txt',
            ],
            goldbergLayoutSupported: [],
          },
        },
      })
    }
  }, [])

  useEffect(() => {
    refresh().catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey])

  // ── Render helpers ────────────────────────────────────────────────────────
  const renderStatusPill = (status: Status) => {
    const { data } = status
    if (status.kind === 'ok') {
      return (
        <div className="flex items-center gap-3 p-3 rounded-xl border bg-green-500/[0.06] border-green-500/20">
          <ShieldCheck className="w-5 h-5 text-green-400 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-green-400">
              Emulador nativo disponible
            </p>
            <p className="text-[11px] text-text-dim mt-0.5">
              {data.version ? `Versión ${data.version}` : 'Versión desconocida'} ·{' '}
              {data.exportCount} exports · {formatSize(data.dllSizeBytes)}
            </p>
          </div>
        </div>
      )
    }
    if (status.kind === 'warn') {
      return (
        <div className="flex items-center gap-3 p-3 rounded-xl border bg-amber-500/[0.06] border-amber-500/20">
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-amber-300">
              Datos parciales
            </p>
            <p className="text-[11px] text-text-dim mt-0.5 line-clamp-2">
              {(data.parseError ?? data.koffiError) ?? 'Origen no identificado'}
            </p>
          </div>
        </div>
      )
    }
    return (
      <div className="flex items-center gap-3 p-3 rounded-xl border bg-red-500/[0.06] border-red-500/20">
        <ShieldAlert className="w-5 h-5 text-red-400 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-red-400">
            No se pudo cargar ycore_steam.dll
          </p>
          <p className="text-[11px] text-text-dim mt-0.5 whitespace-pre-wrap line-clamp-3">
            {data.parseError ?? 'DLL ausente en las rutas conocidas.'}
          </p>
        </div>
      </div>
    )
  }

  const renderGoldbergRow = (data: EmulatorDiagnosticsPayload) => {
    const supported = data.goldbergLayoutSupported
    const expected = data.expectedSettingsFiles
    const matched = supported.length
    const total = expected.length

    if (data.dllPath == null || data.exportCount === 0) return null

    if (matched === total) {
      return (
        <div className="flex items-start gap-2 p-2.5 rounded-lg bg-green-500/[0.04] border border-green-500/15">
          <Folder className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-green-300">
              Layer 3 scaffold será consumido
            </p>
            <p className="text-[11px] text-text-dim mt-0.5">
              Esta build lee <code className="font-mono text-[10px]">steam_settings/</code>:
              {' '}
              {expected.join(', ')}.
            </p>
          </div>
        </div>
      )
    }

    if (matched === 0) {
      return (
        <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-500/[0.04] border border-amber-500/15">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-amber-300">
              Layer 3 scaffold = bytes muertos
            </p>
            <p className="text-[11px] text-text-dim mt-0.5">
              Exports no exponen funciones tipo <code className="font-mono text-[10px]">user_data</code>,
              {' '}<code className="font-mono text-[10px]">subscribed</code>,
              {' '}<code className="font-mono text-[10px]">settings</code>.
              {' '}Esperados por Goldberg/Goldberg-compat: {expected.join(', ')}.
            </p>
          </div>
        </div>
      )
    }

    return (
      <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-500/[0.04] border border-amber-500/15">
        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-amber-300">
            Layer 3 parcial ({matched}/{total})
          </p>
          <p className="text-[11px] text-text-dim mt-0.5">
            Soportados: {supported.join(', ')}. Faltan en el scaffold drop:{' '}
            {expected.filter((f) => !supported.includes(f)).join(', ')}.
          </p>
        </div>
      </div>
    )
  }

  const renderExportList = (data: EmulatorDiagnosticsPayload) => {
    if (data.exportCount === 0) return null
    const capped = data.exportsDetailed.slice(0, 200)
    return (
      <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] overflow-hidden">
        <button
          type="button"
          onClick={() => setExpanded((x) => !x)}
          className="w-full flex items-center gap-2 px-3 py-2 text-left text-[11px] font-semibold text-text-secondary uppercase tracking-wider hover:bg-white/[0.03] transition-colors"
        >
          {expanded ? (
            <ChevronDown className="w-3 h-3" />
          ) : (
            <ChevronRight className="w-3 h-3" />
          )}
          Exports ({data.exportCount}{data.exportCount > capped.length ? `, mostrando ${capped.length}` : ''})
        </button>
        {expanded && (
          <div className="max-h-72 overflow-y-auto px-3 py-2 font-mono text-[10.5px] text-text-secondary grid gap-0.5">
            {capped.map((e) => (
              <div
                key={`${e.ordinal}-${e.name}`}
                className="flex gap-2 items-baseline"
              >
                <span className="text-text-dim shrink-0 w-12 text-right">
                  [{e.ordinal}]
                </span>
                <span
                  className={
                    e.address.startsWith('→')
                      ? 'text-amber-400 truncate'
                      : 'text-text-dim shrink-0 hidden md:inline'
                  }
                  title={e.address}
                >
                  {e.address}
                </span>
                <span className="truncate">{e.name}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  // ── Main render ───────────────────────────────────────────────────────────
  if (state.kind === 'loading') {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-3 p-3 rounded-xl border bg-white/[0.03] border-white/[0.06]">
          <RefreshCw className="w-5 h-5 text-text-dim animate-pulse" />
          <p className="text-xs text-text-secondary">
            Inspeccionando ycore_steam.dll… (parse PE estático)
          </p>
        </div>
      </div>
    )
  }

  const { status } = state
  const { data } = status

  return (
    <div className="space-y-3">
      {/* Header / status */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-white/[0.04] shrink-0">
          <Cpu className="w-5 h-5 text-accent" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-text-bright">
            Emulador nativo (ycore_steam.dll)
          </p>
          <p className="text-[11px] text-text-dim">
            Capa 1 (stub STEAMAPI) + capa 3 (entitlements Goldberg) — diagnóstico sin abrir Y-core.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setRefreshKey((k) => k + 1)}
          className="p-2 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] transition-colors shrink-0"
          aria-label="Re-escanear"
          title="Re-escanear DLL"
        >
          <RefreshCw className="w-4 h-4 text-text-secondary" />
        </button>
      </div>

      {renderStatusPill(status)}

      {/* Metadata rows */}
      {data.dllPath && (
        <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] divide-y divide-white/[0.04]">
          <dl className="grid grid-cols-1 gap-0 text-xs">
            <div className="flex items-start gap-2 px-3 py-2">
              <HardDrive className="w-3.5 h-3.5 text-text-dim shrink-0 mt-0.5" />
              <dt className="text-text-dim font-medium w-28 shrink-0">Ruta</dt>
              <dd className="font-mono text-[10.5px] text-text-secondary truncate" title={data.dllPath}>
                {data.dllPath}
              </dd>
            </div>
            <div className="flex items-start gap-2 px-3 py-2">
              <Hash className="w-3.5 h-3.5 text-text-dim shrink-0 mt-0.5" />
              <dt className="text-text-dim font-medium w-28 shrink-0">Tamaño</dt>
              <dd className="text-text-secondary">{formatSize(data.dllSizeBytes)}</dd>
            </div>
            <div className="flex items-start gap-2 px-3 py-2">
              <ListTree className="w-3.5 h-3.5 text-text-dim shrink-0 mt-0.5" />
              <dt className="text-text-dim font-medium w-28 shrink-0">Exports</dt>
              <dd className="text-text-secondary">{data.exportCount} símbolos</dd>
            </div>
          </dl>
        </div>
      )}

      {/* Goldberg layer 3 verdict */}
      {renderGoldbergRow(data)}

      {/* Expected scaffold for reference */}
      {data.dllPath && (
        <div className="rounded-lg border border-white/[0.05] bg-white/[0.015] px-3 py-2 text-[11px]">
          <p className="text-text-dim leading-relaxed">
            <span className="font-semibold text-text-secondary">Scaffold esperado</span>{' '}
            (siempre se dropa en{' '}
            <code className="font-mono text-[10px] bg-white/[0.05] px-1 rounded">
              steam_settings/
            </code>
            ): {data.expectedSettingsFiles.map((f) => (
              <code
                key={f}
                className="font-mono text-[10px] bg-white/[0.05] px-1 rounded ml-1"
              >
                {f}
              </code>
            ))}
          </p>
        </div>
      )}

      {/* Collapsible export list */}
      {renderExportList(data)}
    </div>
  )
}
