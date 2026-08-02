// ============================================================================
// src/components/diagnostics/PcAnalyzerCard.tsx
// ----------------------------------------------------------------------------
// "Analizar Sistema" card — gathers full Y-Core + Steam diagnostics and
// allows the user to copy or send the report to Discord for support.
// ============================================================================

import { useState, useCallback, useMemo } from 'react'
import {
  Activity,
  Loader2,
  Copy,
  Check,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  ShieldCheck,
  ShieldAlert,
  Monitor,
  HardDrive,
  Cpu,
  Wrench,
  Gamepad2,
  FolderOpen,
  FileText,
  Terminal,
} from 'lucide-react'
import { useToastStore } from '../../stores/useToastStore'
import { sendDiscordReport } from '../../lib/discord-report'

// ── Types (mirrors electron/modules/pc-analyzer.ts) ────────────────────────

interface SystemInfo {
  platform: string
  arch: string
  cpuCores: number
  totalMemoryMB: number
  freeMemoryMB: number
  hostname: string
  userDataPath: string
  appPath: string
}

interface PathInfo {
  path: string
  exists: boolean
  label: string
}

interface SteamInfo {
  found: boolean
  path: string | null
  buildId: string | null
  userId: string | null
  running: boolean
  libraryFolders: string[]
  steamAppsPath: string | null
  configVdf: {
    exists: boolean
    sizeBytes: number | null
    hasDepotsSection: boolean
    depotCount: number
    parseError: string | null
  }
  depotCache: {
    exists: boolean
    fileCount: number
    totalSizeMB: number
  }
  appManifests: {
    totalCount: number
    byLibrary: { libraryPath: string; count: number }[]
    stateSummary: Record<string, number>
    fullyInstalled: number
  }
}

interface HookInfo {
  installed: boolean
  missingDlls: string[]
  ycoreToolExists: boolean
  openSteamToolExists: boolean
  dwmapiExists: boolean
  xinputExists: boolean
  hookConsent: boolean
  lastBuildId: string | null
  failedSignatures: string[]
}

interface EmulatorInfo {
  available: boolean
  dllPath: string | null
  version: string | null
  dllSizeMB: number | null
  failureReason: string | null
  exportCount: number
}

interface NativeInfo {
  available: boolean
  dllPath: string | null
  version: string | null
  failureReason: string | null
}

interface ToolchainInfo {
  cmakeFound: boolean
  cmakeVersion: string | null
  vsFound: boolean
  vsVersion: string | null
  msbuildFound: boolean
}

interface DefenderInfo {
  hasMissingCritical: boolean
  hasMissingExpected: boolean
  hasEmptyDlls: boolean
  hasDefenderArtifacts: boolean
  dlls: { name: string; exists: boolean; isEmpty: boolean; sizeKB: number | null }[]
  suggestions: string[]
}

interface AnalyzerIssue {
  severity: 'critical' | 'warning' | 'info'
  message: string
}

interface AnalyzerReport {
  timestamp: string
  ycoreVersion: string
  electronVersion: string
  system: SystemInfo
  relevantPaths: PathInfo[]
  steam: SteamInfo
  hook: HookInfo
  emulator: EmulatorInfo
  native: NativeInfo
  toolchain: ToolchainInfo
  defender: DefenderInfo
  issues: AnalyzerIssue[]
  health: 'ok' | 'warning' | 'critical'
}

// ── Collapsible section ────────────────────────────────────────────────────

function Section({
  title,
  icon: Icon,
  status,
  defaultOpen = false,
  children,
}: {
  title: string
  icon: React.ComponentType<{ className?: string }>
  status?: 'ok' | 'warning' | 'critical' | 'info'
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  const statusColor = status === 'critical' ? 'text-status-error' : status === 'warning' ? 'text-status-warning' : status === 'info' ? 'text-text-dim' : 'text-status-success'
  const statusBg = status === 'critical' ? 'bg-status-error/15' : status === 'warning' ? 'bg-status-warning/15' : status === 'info' ? 'bg-white/[0.06]' : 'bg-status-success/15'

  return (
    <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/[0.04] transition-colors"
      >
        {open ? <ChevronDown className="w-4 h-4 text-text-dim" /> : <ChevronRight className="w-4 h-4 text-text-dim" />}
        <Icon className="w-5 h-5 text-text-secondary" />
        <span className="text-sm font-medium text-text-bright flex-1 text-left">{title}</span>
        {status && (
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${statusColor} ${statusBg}`}>
            {status === 'critical' ? 'CRÍTICO' : status === 'warning' ? 'ATENCIÓN' : 'OK'}
          </span>
        )}
      </button>
      {open && (
        <div className="px-4 pb-3 space-y-1.5 border-t border-white/[0.04] pt-3">
          {children}
        </div>
      )}
    </div>
  )
}

function KV({ label, value, ok }: { label: string; value: React.ReactNode; ok?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <span className="text-xs text-text-dim">{label}</span>
      <span className={`text-xs font-mono text-right ${ok === false ? 'text-status-error' : ok === true ? 'text-status-success' : 'text-text-secondary'}`}>
        {value}
      </span>
    </div>
  )
}

function Badge({ label, color }: { label: string; color: 'green' | 'red' | 'yellow' | 'gray' }) {
  const colors = {
    green: 'bg-status-success/15 text-status-success border-status-success/20',
    red: 'bg-status-error/15 text-status-error border-status-error/20',
    yellow: 'bg-status-warning/15 text-status-warning border-status-warning/20',
    gray: 'bg-white/[0.06] text-text-dim border-white/[0.08]',
  }
  return (
    <span className={`inline-flex text-[10px] font-semibold px-1.5 py-0.5 rounded border ${colors[color]}`}>
      {label}
    </span>
  )
}

// ── Format report as readable text ─────────────────────────────────────────

function formatReport(report: AnalyzerReport): string {
  const lines: string[] = []
  const h = (s: string) => { lines.push(`\n=== ${s} ===`) }

  h('Y-CORE DIAGNÓSTICO COMPLETO')
  lines.push(`Timestamp: ${report.timestamp}`)
  lines.push(`Versión: ${report.ycoreVersion} | Electron: ${report.electronVersion}`)
  lines.push(`Salud: ${report.health.toUpperCase()} (${report.issues.length} issues)`)

  h('SISTEMA')
  lines.push(`OS: ${report.system.platform} ${report.system.arch}`)
  lines.push(`CPU: ${report.system.cpuCores} cores | RAM: ${report.system.totalMemoryMB}MB (${report.system.freeMemoryMB}MB libre)`)
  lines.push(`Hostname: ${report.system.hostname}`)

  h('STEAM')
  lines.push(`Encontrado: ${report.steam.found ? 'SI' : 'NO'}`)
  if (report.steam.path) lines.push(`Ruta: ${report.steam.path}`)
  lines.push(`Build ID: ${report.steam.buildId || 'N/A'}`)
  lines.push(`Ejecutándose: ${report.steam.running ? 'SI' : 'NO'}`)
  lines.push(`Librerías: ${report.steam.libraryFolders.length}`)
  lines.push(`config.vdf: ${report.steam.configVdf.exists ? `SI (${report.steam.configVdf.sizeBytes}B, depots:${report.steam.configVdf.hasDepotsSection ? 'SI' : 'NO'}, claves:${report.steam.configVdf.depotCount})` : 'NO'}`)
  lines.push(`depotcache: ${report.steam.depotCache.exists ? `${report.steam.depotCache.fileCount} archivos (${report.steam.depotCache.totalSizeMB}MB)` : 'NO'}`)
  lines.push(`AppManifests: ${report.steam.appManifests.totalCount} total, ${report.steam.appManifests.fullyInstalled} instalados`)
  if (Object.keys(report.steam.appManifests.stateSummary).length > 0) {
    lines.push(`  Estados: ${Object.entries(report.steam.appManifests.stateSummary).map(([k, v]) => `StateFlags=${k}→${v}`).join(', ')}`)
  }

  h('HOOK STEAM')
  lines.push(`Instalado: ${report.hook.installed ? 'SI' : 'NO'}`)
  if (!report.hook.installed) lines.push(`Faltantes: ${report.hook.missingDlls.join(', ')}`)
  lines.push(`YCoreTool.dll: ${report.hook.ycoreToolExists ? 'SI' : 'NO'} | dwmapi.dll: ${report.hook.dwmapiExists ? 'SI' : 'NO'} | xinput1_4.dll: ${report.hook.xinputExists ? 'SI' : 'NO'}`)
  lines.push(`Consentimiento: ${report.hook.hookConsent ? 'SI' : 'NO'} | LastBuildId: ${report.hook.lastBuildId || 'N/A'}`)
  if (report.hook.failedSignatures.length > 0) lines.push(`Firmas fallidas: ${report.hook.failedSignatures.length}`)

  h('EMULADOR')
  lines.push(`ycore_steam.dll: ${report.emulator.available ? `SI v${report.emulator.version} (${report.emulator.dllSizeMB ?? '?'}MB, ${report.emulator.exportCount} exports)` : `NO — ${report.emulator.failureReason || 'desconocido'}`}`)

  h('NATIVO')
  lines.push(`ycore.dll: ${report.native.available ? `SI v${report.native.version}` : `NO — ${report.native.failureReason || 'desconocido'}`}`)

  h('TOOLCHAIN')
  lines.push(`cmake: ${report.toolchain.cmakeFound ? `SI v${report.toolchain.cmakeVersion}` : 'NO'} | VS: ${report.toolchain.vsFound ? `SI v${report.toolchain.vsVersion}` : 'NO'} | msbuild: ${report.toolchain.msbuildFound ? 'SI' : 'NO'}`)

  h('DEFENDER')
  lines.push(`Críticos: ${report.defender.hasMissingCritical ? 'SI' : 'NO'} | Esperados: ${report.defender.hasMissingExpected ? 'SI' : 'NO'} | Vacíos: ${report.defender.hasEmptyDlls ? 'SI' : 'NO'}`)
  if (report.defender.dlls.length > 0) {
    for (const d of report.defender.dlls) {
      lines.push(`  ${d.name}: ${d.exists ? (d.isEmpty ? 'VACIO' : `OK (${d.sizeKB}KB)`) : 'FALTA'}`)
    }
  }

  if (report.issues.length > 0) {
    h('ISSUES')
    for (const issue of report.issues) {
      lines.push(`[${issue.severity.toUpperCase()}] ${issue.message}`)
    }
  }

  return lines.join('\n')
}

// ── Main component ─────────────────────────────────────────────────────────

export default function PcAnalyzerCard() {
  const { showToast } = useToastStore()
  const [report, setReport] = useState<AnalyzerReport | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [sending, setSending] = useState(false)
  const [copied, setCopied] = useState(false)

  const runAnalysis = useCallback(async () => {
    setAnalyzing(true)
    setReport(null)
    try {
      const result = await window.steamtools?.analyzePc?.()
      if (result) {
        setReport(result)
      } else {
        showToast('error', 'No se pudo ejecutar el análisis. ¿Estás en Electron?')
      }
    } catch (err: any) {
      showToast('error', 'Error al analizar: ' + (err?.message ?? 'desconocido'))
    } finally {
      setAnalyzing(false)
    }
  }, [showToast])

  const copyReport = useCallback(async () => {
    if (!report) return
    const text = formatReport(report)
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      showToast('success', 'Reporte copiado al portapapeles')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      showToast('error', 'No se pudo copiar al portapapeles')
    }
  }, [report, showToast])

  const sendToDiscord = useCallback(async () => {
    if (!report) return
    setSending(true)
    try {
      const text = formatReport(report)
      const fields = [
        { name: 'Salud', value: report.health.toUpperCase(), inline: true },
        { name: 'Versión', value: report.ycoreVersion, inline: true },
        { name: 'OS', value: `${report.system.platform} ${report.system.arch}`, inline: true },
        { name: 'Steam', value: report.steam.found ? `Build ${report.steam.buildId || '?'}` : 'NO ENCONTRADO', inline: true },
        { name: 'Hook', value: report.hook.installed ? 'INSTALADO' : `FALTA: ${report.hook.missingDlls.join(', ') || 'ninguno'}`, inline: true },
        { name: 'Emulador', value: report.emulator.available ? `v${report.emulator.version}` : 'NO DISPONIBLE', inline: true },
        { name: 'Issues', value: `${report.issues.length} (${report.issues.filter(i => i.severity === 'critical').length} críticos)`, inline: true },
      ]

      const result = await sendDiscordReport(
        'Diagnóstico del Sistema',
        `\`\`\`\n${text.slice(0, 1800)}\n\`\`\``,
        fields,
      )
      if (result.success) {
        showToast('success', 'Reporte enviado a Discord ✅')
      } else {
        showToast('error', 'Error al enviar: ' + (result.error || 'desconocido'))
      }
    } catch (err: any) {
      showToast('error', 'Error: ' + (err?.message ?? 'desconocido'))
    } finally {
      setSending(false)
    }
  }, [report, showToast])

  const issueCounts = useMemo(() => {
    if (!report) return { critical: 0, warning: 0, info: 0 }
    return {
      critical: report.issues.filter(i => i.severity === 'critical').length,
      warning: report.issues.filter(i => i.severity === 'warning').length,
      info: report.issues.filter(i => i.severity === 'info').length,
    }
  }, [report])

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-accent/15 flex items-center justify-center">
          <Activity className="w-5 h-5 text-accent" />
        </div>
        <div>
          <h3 className="text-base font-semibold text-text-bright">Diagnóstico del Sistema</h3>
          <p className="text-xs text-text-dim mt-0.5">
            Analiza Y-Core y Steam para detectar problemas. El reporte se puede enviar a Discord para recibir ayuda.
          </p>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-2">
        <button
          onClick={runAnalysis}
          disabled={analyzing}
          className="flex items-center gap-2 px-5 py-3 rounded-xl bg-accent text-white hover:bg-accent/80 disabled:opacity-50 transition-all text-sm font-semibold shadow-lg shadow-accent/20"
        >
          {analyzing ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Analizando...
            </>
          ) : (
            <>
              <Activity className="w-5 h-5" />
              Analizar Sistema
            </>
          )}
        </button>

        {report && (
          <>
            <button
              onClick={copyReport}
              className="flex items-center gap-2 px-4 py-3 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] transition-colors text-sm font-medium text-text-bright border border-white/[0.08]"
            >
              {copied ? <Check className="w-4 h-4 text-status-success" /> : <Copy className="w-4 h-4" />}
              {copied ? 'Copiado' : 'Copiar Reporte'}
            </button>
            <button
              onClick={sendToDiscord}
              disabled={sending}
              className="flex items-center gap-2 px-4 py-3 rounded-xl bg-[#5865F2]/20 hover:bg-[#5865F2]/30 disabled:opacity-50 transition-colors text-sm font-medium text-[#a5b3ff] border border-[#5865F2]/30"
            >
              {sending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <ExternalLink className="w-4 h-4" />
              )}
              {sending ? 'Enviando...' : 'Enviar a Discord'}
            </button>
          </>
        )}
      </div>

      {/* Health summary */}
      {report && (
        <div className={`flex items-center gap-3 p-3 rounded-xl border ${
          report.health === 'critical'
            ? 'bg-status-error/[0.06] border-status-error/20'
            : report.health === 'warning'
              ? 'bg-status-warning/[0.06] border-status-warning/20'
              : 'bg-status-success/[0.06] border-status-success/20'
        }`}>
          {report.health === 'critical' ? (
            <ShieldAlert className="w-6 h-6 text-status-error shrink-0" />
          ) : report.health === 'warning' ? (
            <AlertTriangle className="w-6 h-6 text-status-warning shrink-0" />
          ) : (
            <ShieldCheck className="w-6 h-6 text-status-success shrink-0" />
          )}
          <div>
            <p className={`text-sm font-bold ${
              report.health === 'critical' ? 'text-status-error' : report.health === 'warning' ? 'text-status-warning' : 'text-status-success'
            }`}>
              {report.health === 'critical' ? 'Sistema con problemas críticos' : report.health === 'warning' ? 'Sistema con advertencias' : 'Sistema saludable'}
            </p>
            <p className="text-xs text-text-dim">
              {issueCounts.critical > 0 && `${issueCounts.critical} crítico(s), `}
              {issueCounts.warning > 0 && `${issueCounts.warning} advertencia(s), `}
              {issueCounts.info > 0 && `${issueCounts.info} info`}
              {issueCounts.critical === 0 && issueCounts.warning === 0 && issueCounts.info === 0 && 'Sin problemas detectados'}
            </p>
          </div>
        </div>
      )}

      {/* Detailed sections */}
      {report && (
        <div className="space-y-2 animate-fade-in">
          {/* System */}
          <Section title="Sistema" icon={Monitor} status="ok" defaultOpen={false}>
            <KV label="SO" value={`${report.system.platform} ${report.system.arch}`} />
            <KV label="CPU" value={`${report.system.cpuCores} núcleos`} />
            <KV label="RAM" value={`${report.system.totalMemoryMB}MB (${report.system.freeMemoryMB}MB libre)`} />
            <KV label="Hostname" value={report.system.hostname} />
            <KV label="Y-Core" value={`v${report.ycoreVersion} (Electron ${report.electronVersion})`} />
          </Section>

          {/* Steam */}
          <Section
            title="Steam"
            icon={Gamepad2}
            status={report.steam.found && report.steam.configVdf.hasDepotsSection ? 'ok' : report.steam.found ? 'warning' : 'critical'}
          >
            <KV label="Encontrado" value={report.steam.found ? 'SI' : 'NO'} ok={report.steam.found} />
            {report.steam.path && <KV label="Ruta" value={<span className="text-[10px]">{report.steam.path}</span>} />}
            <KV label="Build ID" value={report.steam.buildId || 'N/A'} />
            <KV label="Ejecutándose" value={report.steam.running ? 'SI' : 'NO'} />
            <KV label="Librerías" value={`${report.steam.libraryFolders.length}`} />
            <KV label="config.vdf" value={report.steam.configVdf.exists ? `${report.steam.configVdf.sizeBytes}B` : 'NO'} ok={report.steam.configVdf.exists} />
            <KV label="  └ Depots" value={report.steam.configVdf.hasDepotsSection ? `SI (${report.steam.configVdf.depotCount} claves)` : 'NO'} ok={report.steam.configVdf.hasDepotsSection} />
            <KV label="depotcache" value={report.steam.depotCache.exists ? `${report.steam.depotCache.fileCount} archivos (${report.steam.depotCache.totalSizeMB}MB)` : 'NO'} />
            <KV label="AppManifests" value={`${report.steam.appManifests.totalCount} total, ${report.steam.appManifests.fullyInstalled} listos`} />
          </Section>

          {/* Hook */}
          <Section
            title="Hook de Steam"
            icon={Wrench}
            status={report.hook.installed ? 'ok' : 'warning'}
          >
            <KV label="Instalado" value={report.hook.installed ? 'SI' : 'NO'} ok={report.hook.installed} />
            {!report.hook.installed && report.hook.missingDlls.length > 0 && (
              <KV label="Faltantes" value={report.hook.missingDlls.join(', ')} ok={false} />
            )}
            <div className="flex flex-wrap gap-1 py-1">
              {report.hook.ycoreToolExists ? <Badge label="YCoreTool.dll" color="green" /> : <Badge label="YCoreTool.dll" color="red" />}
              {report.hook.openSteamToolExists ? <Badge label="OpenSteamTool.dll" color="green" /> : <Badge label="OpenSteamTool.dll" color="gray" />}
              {report.hook.dwmapiExists ? <Badge label="dwmapi.dll" color="green" /> : <Badge label="dwmapi.dll" color="red" />}
              {report.hook.xinputExists ? <Badge label="xinput1_4.dll" color="green" /> : <Badge label="xinput1_4.dll" color="red" />}
            </div>
            <KV label="Consentimiento" value={report.hook.hookConsent ? 'SI' : 'NO'} ok={report.hook.hookConsent} />
            <KV label="Last Build ID" value={report.hook.lastBuildId || 'N/A'} />
            {report.hook.failedSignatures.length > 0 && (
              <KV label="Firmas fallidas" value={String(report.hook.failedSignatures.length)} ok={false} />
            )}
          </Section>

          {/* Emulator */}
          <Section
            title="Emulador (ycore_steam.dll)"
            icon={Terminal}
            status={report.emulator.available ? 'ok' : 'warning'}
          >
            <KV label="Disponible" value={report.emulator.available ? `SI v${report.emulator.version}` : 'NO'} ok={report.emulator.available} />
            {!report.emulator.available && (
              <KV label="Razón" value={report.emulator.failureReason || 'desconocido'} ok={false} />
            )}
            {report.emulator.available && (
              <>
                <KV label="Tamaño" value={`${report.emulator.dllSizeMB}MB`} />
                <KV label="Exports" value={String(report.emulator.exportCount)} />
              </>
            )}
          </Section>

          {/* Native */}
          <Section
            title="Nativo (ycore.dll)"
            icon={Cpu}
            status={report.native.available ? 'ok' : 'info'}
          >
            <KV label="Disponible" value={report.native.available ? `SI v${report.native.version}` : 'NO (fallback JS)'} ok={report.native.available} />
          </Section>

          {/* Toolchain */}
          <Section
            title="Toolchain (cmake + VS)"
            icon={Terminal}
            status={report.toolchain.cmakeFound ? 'ok' : 'warning'}
          >
            <KV label="cmake" value={report.toolchain.cmakeFound ? `SI v${report.toolchain.cmakeVersion}` : 'NO'} ok={report.toolchain.cmakeFound} />
            <KV label="Visual Studio" value={report.toolchain.vsFound ? `SI v${report.toolchain.vsVersion}` : 'NO'} ok={report.toolchain.vsFound} />
            <KV label="msbuild" value={report.toolchain.msbuildFound ? 'SI' : 'NO'} ok={report.toolchain.msbuildFound} />
          </Section>

          {/* Defender */}
          <Section
            title="Windows Defender"
            icon={ShieldAlert}
            status={report.defender.hasMissingCritical || report.defender.hasMissingExpected ? 'critical' : 'ok'}
          >
            <KV label="Críticos faltantes" value={report.defender.hasMissingCritical ? 'SI' : 'NO'} ok={!report.defender.hasMissingCritical} />
            <KV label="Esperados faltantes" value={report.defender.hasMissingExpected ? 'SI' : 'NO'} ok={!report.defender.hasMissingExpected} />
            <KV label="DLLs vacíos" value={report.defender.hasEmptyDlls ? 'SI' : 'NO'} ok={!report.defender.hasEmptyDlls} />
            {report.defender.dlls.length > 0 && (
              <div className="space-y-0.5 mt-1">
                {report.defender.dlls.map((d, i) => (
                  <div key={i} className="flex items-center gap-2 text-[10px]">
                    <span className={d.exists && !d.isEmpty ? 'text-status-success' : 'text-status-error'}>
                      {d.exists && !d.isEmpty ? '●' : '○'}
                    </span>
                    <span className="text-text-dim flex-1 truncate">{d.name}</span>
                    {d.exists && <span className="text-text-dim">{d.sizeKB}KB</span>}
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* Issues */}
          {report.issues.length > 0 && (
            <Section
              title="Problemas detectados"
              icon={AlertTriangle}
              status={issueCounts.critical > 0 ? 'critical' : issueCounts.warning > 0 ? 'warning' : 'ok'}
              defaultOpen={true}
            >
              {report.issues.map((issue, i) => (
                <div key={i} className="flex items-start gap-2 py-1">
                  <span className={`mt-0.5 shrink-0 ${
                    issue.severity === 'critical' ? 'text-status-error' : issue.severity === 'warning' ? 'text-status-warning' : 'text-text-dim'
                  }`}>
                    {issue.severity === 'critical' ? '🔴' : issue.severity === 'warning' ? '🟡' : '🔵'}
                  </span>
                  <span className="text-xs text-text-secondary leading-relaxed">{issue.message}</span>
                </div>
              ))}
            </Section>
          )}
        </div>
      )}
    </div>
  )
}
