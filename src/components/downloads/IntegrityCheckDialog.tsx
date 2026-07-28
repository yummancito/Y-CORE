import { useState } from 'react'
import { ShieldCheck, AlertTriangle, Loader2, RefreshCw, X, CheckCircle2, XCircle, Trash2 } from 'lucide-react'
import { useDownloadEngineStore } from '../../stores/useDownloadEngineV3Store'

interface IntegrityCheckDialogProps {
  appId: string
  installDir: string
  open: boolean
  onClose: () => void
}

export function IntegrityCheckDialog({ appId, installDir, open, onClose }: IntegrityCheckDialogProps) {
  const [checking, setChecking] = useState(false)
  const integrityCheck = useDownloadEngineStore((s) => s.integrityCheck)
  const repairFiles = useDownloadEngineStore((s) => s.repairFiles)
  const getCacheStats = useDownloadEngineStore((s) => s.getCacheStats)
  const clearCache = useDownloadEngineStore((s) => s.clearCache)

  const [result, setResult] = useState<{
    totalFiles: number
    verifiedFiles: number
    corruptedFiles: any[]
    missingFiles: string[]
    errors: string[]
  } | null>(null)
  const [repairing, setRepairing] = useState(false)
  const [repairResult, setRepairResult] = useState<{ repaired: number; failed: number } | null>(null)
  const [cacheStats, setCacheStats] = useState<any>(null)
  const [cacheLoading, setCacheLoading] = useState(false)
  const [caching, setCaching] = useState(false)

  if (!open) return null

  const handleCheck = async () => {
    setChecking(true)
    setResult(null)
    setRepairResult(null)
    try {
      const res = await integrityCheck(appId, installDir)
      if (res.success && res.result) setResult(res.result)
      else setResult({ totalFiles: 0, verifiedFiles: 0, corruptedFiles: [], missingFiles: [], errors: [res.error || 'Check failed'] })
    } catch (err: any) {
      setResult({ totalFiles: 0, verifiedFiles: 0, corruptedFiles: [], missingFiles: [], errors: [err.message] })
    } finally {
      setChecking(false)
    }
  }

  const handleRepair = async () => {
    if (!result) return
    setRepairing(true)
    try {
      const res = await repairFiles(
        appId,
        installDir,
        result.corruptedFiles.map((f: any) => f.path),
        result.missingFiles,
      )
      if (res.success) {
        setRepairResult(res.result ?? { repaired: result.corruptedFiles.length + result.missingFiles.length, failed: 0 })
      } else {
        setRepairResult({ repaired: 0, failed: result.corruptedFiles.length + result.missingFiles.length })
      }
    } catch (err: any) {
      setRepairResult({ repaired: 0, failed: 1 })
    } finally {
      setRepairing(false)
    }
  }

  const handleCacheStats = async () => {
    setCacheLoading(true)
    try {
      const res = await getCacheStats()
      if (res.success) setCacheStats(res.stats)
    } finally {
      setCacheLoading(false)
    }
  }

  const handleClearCache = async () => {
    setCaching(true)
    try {
      await clearCache()
      setCacheStats(null)
    } finally {
      setCaching(false)
    }
  }

  const corruptedCount = result ? result.corruptedFiles.length : 0
  const missingCount = result ? result.missingFiles.length : 0
  const hasIssues = corruptedCount > 0 || missingCount > 0
  const allOk = result && !hasIssues && result.errors.length === 0

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center"
      style={{ background: 'rgba(5,5,7,0.85)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl overflow-hidden"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5" style={{ color: 'var(--accent)' }} />
            <span className="font-bold text-text-bright">Integrity Check</span>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-white/[0.08] transition-colors">
            <X className="w-4 h-4 text-text-dim" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Run check button */}
          <button
            onClick={handleCheck}
            disabled={checking}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white transition-all hover:brightness-110 disabled:opacity-40 w-full justify-center"
            style={{ background: 'var(--accent)' }}
          >
            {checking ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            {checking ? 'Verifying files...' : 'Verify File Integrity'}
          </button>

          {/* Results */}
          {result && (
            <div className="space-y-3">
              {allOk ? (
                <div className="flex items-center gap-2 px-4 py-3 rounded-xl" style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)' }}>
                  <CheckCircle2 className="w-4 h-4 text-green" />
                  <span className="text-sm text-green">All {result.totalFiles} files verified successfully</span>
                </div>
              ) : hasIssues ? (
                <div className="flex items-center gap-2 px-4 py-3 rounded-xl" style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)' }}>
                  <AlertTriangle className="w-4 h-4 text-amber" />
                  <span className="text-sm text-amber">
                    {corruptedCount > 0 && `${corruptedCount} corrupted`}
                    {corruptedCount > 0 && missingCount > 0 && ', '}
                    {missingCount > 0 && `${missingCount} missing`}
                    {' file(s) found'}
                  </span>
                </div>
              ) : null}
              {result.errors.length > 0 && (
                <div className="space-y-1">
                  {result.errors.map((e, i) => (
                    <p key={i} className="text-xs text-red px-4 py-2 rounded-lg" style={{ background: 'rgba(239,68,68,0.08)' }}>{e}</p>
                  ))}
                </div>
              )}

              {/* Summary */}
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-xl p-3 text-center" style={{ background: 'rgba(255,255,255,0.04)' }}>
                  <p className="text-lg font-bold text-text-bright">{result.totalFiles}</p>
                  <p className="text-[10px] text-text-dim">Total</p>
                </div>
                <div className="rounded-xl p-3 text-center" style={{ background: 'rgba(34,197,94,0.08)' }}>
                  <p className="text-lg font-bold text-green">{result.verifiedFiles}</p>
                  <p className="text-[10px] text-text-dim">Verified</p>
                </div>
                <div className="rounded-xl p-3 text-center" style={{ background: hasIssues ? 'rgba(245,158,11,0.08)' : 'rgba(255,255,255,0.04)' }}>
                  <p className="text-lg font-bold" style={{ color: hasIssues ? '#f59e0b' : 'var(--text-dim)' }}>
                    {corruptedCount + missingCount}
                  </p>
                  <p className="text-[10px] text-text-dim">Issues</p>
                </div>
              </div>

              {/* Repair button */}
              {hasIssues && (
                <button
                  onClick={handleRepair}
                  disabled={repairing}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white transition-all hover:brightness-110 disabled:opacity-40 w-full justify-center"
                  style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)' }}
                >
                  {repairing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  {repairing ? 'Repairing...' : `Repair ${corruptedCount + missingCount} file(s)`}
                </button>
              )}

              {repairResult && (
                <div className="flex items-center gap-2 px-4 py-3 rounded-xl" style={{
                  background: repairResult.failed > 0 ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)',
                  border: `1px solid ${repairResult.failed > 0 ? 'rgba(239,68,68,0.2)' : 'rgba(34,197,94,0.2)'}`,
                }}>
                  {repairResult.failed > 0 ? <XCircle className="w-4 h-4 text-red" /> : <CheckCircle2 className="w-4 h-4 text-green" />}
                  <span className="text-sm" style={{ color: repairResult.failed > 0 ? '#ef4444' : '#22c55e' }}>
                    Repaired: {repairResult.repaired} / Failed: {repairResult.failed}
                  </span>
                </div>
              )}

              {/* Cache section */}
              <div className="border-t border-white/[0.06] pt-4 mt-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-text-dim">Cache</span>
                  <button onClick={handleCacheStats} className="text-xs text-text-dim hover:text-text-bright underline">
                    {cacheLoading ? 'Loading...' : 'Show stats'}
                  </button>
                </div>
                {cacheStats && (
                  <div className="rounded-xl p-3 mb-2" style={{ background: 'rgba(255,255,255,0.04)' }}>
                    <p className="text-xs text-text-secondary">
                      Entries: {cacheStats.entries ?? 0} · Size: {cacheStats.sizeFormatted ?? '—'}
                    </p>
                  </div>
                )}
                <button
                  onClick={handleClearCache}
                  disabled={caching}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-text-secondary hover:text-text-bright hover:bg-white/[0.08] transition-all w-full justify-center"
                >
                  {caching ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                  {caching ? 'Clearing...' : 'Clear Cache'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
