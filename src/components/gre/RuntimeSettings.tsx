import { useEffect, useRef, useState } from 'react'
import {
  Settings2,
  ShieldCheck,
  Activity,
  Save,
  Clock,
  Bell,
  RotateCcw,
  Loader2,
  RefreshCw,
  CheckCircle2,
} from 'lucide-react'
import { useSettingsStore } from '../../stores/useSettingsStore'
import { useRuntimeStore } from '../../stores/useRuntimeStore'
import { RuntimeCenter } from './RuntimeCenter'
import { configService } from '../../services/config.service'

interface RuntimeSettingsConfig {
  autoDetect: boolean
  pollingInterval: number
  autoBackup: boolean
  backupIntervalHours: number
  keepBackups: number
  showInLibrary: boolean
  showInGameDetail: boolean
}

const DEFAULT_RUNTIME_CONFIG: RuntimeSettingsConfig = {
  autoDetect: true,
  pollingInterval: 30,
  autoBackup: false,
  backupIntervalHours: 24,
  keepBackups: 10,
  showInLibrary: true,
  showInGameDetail: true,
}

export function RuntimeSettings() {
  const { runtimes, detectAll, checking } = useRuntimeStore()
  const [config, setConfig] = useState<RuntimeSettingsConfig>(DEFAULT_RUNTIME_CONFIG)
  const [saved, setSaved] = useState(false)
  // useRef (not useState) survives React StrictMode unmount-remount so
  // detectAll() fires exactly once per component instance, not twice.
  const startedRef = useRef(false)

  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true
    if (runtimes.length === 0) detectAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSave = async () => {
    // Persist to config service
    try {
      await configService.write({
        ...(await configService.read()),
        runtimeSettings: config,
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch {
      // Fallback for non-electron
    }
  }

  const missingRuntimes = runtimes.filter((r) => !r.installed)
  const totalRuntimes = runtimes.length

  return (
    <div className="space-y-5">
      {/* Runtime Detection Summary */}
      <div className="flex items-center gap-3 py-3 px-4 rounded-xl" style={{
        background: missingRuntimes.length === 0
          ? 'rgba(34,197,94,0.08)'
          : 'rgba(239,68,68,0.08)',
        border: `1px solid ${
          missingRuntimes.length === 0
            ? 'rgba(34,197,94,0.2)'
            : 'rgba(239,68,68,0.2)'
        }`,
      }}>
        {totalRuntimes > 0 ? (
          <>
            <ShieldCheck className="w-5 h-5" style={{
              color: missingRuntimes.length === 0 ? 'var(--green)' : 'var(--red)',
            }} />
            <div className="flex-1">
              <p className="text-sm font-semibold text-text-bright">
                {missingRuntimes.length === 0
                  ? 'All runtimes installed'
                  : `${missingRuntimes.length} runtime(s) missing`}
              </p>
              <p className="text-xs text-text-dim">
                {totalRuntimes - missingRuntimes.length} of {totalRuntimes} runtimes detected
              </p>
            </div>
            <button
              onClick={detectAll}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-text-dim hover:text-text-bright hover:bg-white/[0.06] transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${checking ? 'animate-spin' : ''}`} />
              Rescan
            </button>
          </>
        ) : checking ? (
          <div className="flex items-center gap-2 text-text-dim">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">Scanning system...</span>
          </div>
        ) : (
          <p className="text-sm text-text-dim">Runtime detection requires a scan</p>
        )}
      </div>

      {/* Runtime Center (collapsible) */}
      <RuntimeCenter />

      {/* Settings */}
      <div className="rounded-2xl overflow-hidden" style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border-color)',
        boxShadow: 'var(--card-shadow)',
      }}>
        <div className="flex items-center gap-2.5 px-5 py-4 border-b border-white/[0.06]">
          <Settings2 className="w-5 h-5" style={{ color: 'var(--accent)' }} />
          <span className="text-sm font-bold text-text-bright">Runtime Settings</span>
        </div>

        <div className="px-5 py-4 space-y-5">
          {/* Auto-detect */}
          <ToggleSetting
            icon={<ShieldCheck className="w-4 h-4" />}
            label="Auto-detect runtimes on game launch"
            description="Check runtimes before launching a game and warn if something is missing"
            checked={config.autoDetect}
            onChange={(v) => setConfig((c) => ({ ...c, autoDetect: v }))}
          />

          {/* Polling interval */}
          <RangeSetting
            icon={<Activity className="w-4 h-4" />}
            label="Process polling interval"
            description="How often to check running game processes (seconds)"
            value={config.pollingInterval}
            min={5}
            max={120}
            step={5}
            unit="s"
            onChange={(v) => setConfig((c) => ({ ...c, pollingInterval: v }))}
          />

          {/* Auto-backup */}
          <ToggleSetting
            icon={<Save className="w-4 h-4" />}
            label="Auto-backup saves"
            description="Automatically create save file backups on a schedule"
            checked={config.autoBackup}
            onChange={(v) => setConfig((c) => ({ ...c, autoBackup: v }))}
          />

          {config.autoBackup && (
            <>
              <RangeSetting
                icon={<Clock className="w-4 h-4" />}
                label="Backup interval"
                description="How often to create automatic save backups"
                value={config.backupIntervalHours}
                min={1}
                max={168}
                step={1}
                unit="h"
                onChange={(v) => setConfig((c) => ({ ...c, backupIntervalHours: v }))}
              />

              <RangeSetting
                icon={<Bell className="w-4 h-4" />}
                label="Keep backups"
                description="Maximum number of backups to keep per game"
                value={config.keepBackups}
                min={1}
                max={50}
                step={1}
                unit=""
                onChange={(v) => setConfig((c) => ({ ...c, keepBackups: v }))}
              />
            </>
          )}

          {/* Display settings */}
          <ToggleSetting
            icon={<RotateCcw className="w-4 h-4" />}
            label="Show runtime badge in Library"
            description="Display runtime status next to game cards in your library"
            checked={config.showInLibrary}
            onChange={(v) => setConfig((c) => ({ ...c, showInLibrary: v }))}
          />

          <ToggleSetting
            icon={<RotateCcw className="w-4 h-4" />}
            label="Show runtime section in Game Details"
            description="Display full runtime center, launch profiles, and save manager on game pages"
            checked={config.showInGameDetail}
            onChange={(v) => setConfig((c) => ({ ...c, showInGameDetail: v }))}
          />

          {/* Save button */}
          <div className="flex justify-end pt-2 border-t border-white/[0.06]">
            <button
              onClick={handleSave}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white transition-all hover:brightness-110"
              style={{ background: 'var(--accent)' }}
            >
              {saved ? (
                <CheckCircle2 className="w-4 h-4" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              {saved ? 'Saved!' : 'Save Settings'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function ToggleSetting({
  icon, label, description, checked, onChange,
}: {
  icon: React.ReactNode
  label: string
  description: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label className="flex items-start gap-3 cursor-pointer group">
      <div className="flex-shrink-0 mt-0.5" style={{ color: checked ? 'var(--accent)' : 'var(--text-dim)' }}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-text-bright group-hover:text-accent transition-colors">{label}</p>
        <p className="text-xs text-text-dim mt-0.5">{description}</p>
      </div>
      <div
        className={`relative w-10 h-6 rounded-full transition-colors flex-shrink-0 ${
          checked ? 'bg-accent' : 'bg-white/[0.1]'
        }`}
      >
        <div
          className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-[18px]' : 'translate-x-0.5'
          }`}
        />
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="absolute inset-0 opacity-0 cursor-pointer"
        />
      </div>
    </label>
  )
}

function RangeSetting({
  icon, label, description, value, min, max, step, unit, onChange,
}: {
  icon: React.ReactNode
  label: string
  description: string
  value: number
  min: number
  max: number
  step: number
  unit: string
  onChange: (v: number) => void
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex-shrink-0 mt-0.5" style={{ color: 'var(--text-dim)' }}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-text-bright">{label}</p>
          <span className="text-xs font-mono font-semibold text-accent">
            {value}{unit}
          </span>
        </div>
        <p className="text-xs text-text-dim mt-0.5 mb-2">{description}</p>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseInt(e.target.value))}
          className="w-full"
        />
      </div>
    </div>
  )
}
