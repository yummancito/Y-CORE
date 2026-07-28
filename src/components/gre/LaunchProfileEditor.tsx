import { useState, useEffect } from 'react'
import {
  Settings2,
  Plus,
  Trash2,
  Check,
  Star,
  Loader2,
  Play,
  Terminal,
  Layers,
  Monitor,
  Globe,
} from 'lucide-react'
import type { LaunchProfile } from '../../domain/types'
import { useLaunchProfileStore } from '../../stores/useLaunchProfileStore'

interface LaunchProfileEditorProps {
  gameId: string
  gamePath?: string
}

export function LaunchProfileEditor({ gameId, gamePath }: LaunchProfileEditorProps) {
  const { profiles, selectedProfile, error, loadProfiles, createProfile, updateProfile, deleteProfile, setDefault, selectProfile } =
    useLaunchProfileStore()
  const [loaded, setLoaded] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [editingName, setEditingName] = useState<string | null>(null)

  useEffect(() => {
    if (!loaded) {
      loadProfiles(gameId).then(() => setLoaded(true))
    }
  }, [loadProfiles, gameId, loaded])

  const activeProfile = profiles.find((p) => p.name === selectedProfile) || profiles[0]

  const handleCreate = async () => {
    if (!newName.trim()) return
    const profile: LaunchProfile = {
      name: newName.trim(),
      args: '',
      envVars: {},
      resolution: null,
      compatLayer: null,
      preLaunch: [],
      postLaunch: [],
      isDefault: profiles.length === 0,
    }
    await createProfile(gameId, profile)
    setNewName('')
    setCreating(false)
  }

  const handleFieldUpdate = (field: string, value: any) => {
    if (!activeProfile) return
    updateProfile(gameId, activeProfile.name, { [field]: value })
  }

  const handleArgUpdate = (value: string) => {
    if (!activeProfile) return
    updateProfile(gameId, activeProfile.name, { args: value })
  }

  const handleEnvVarAdd = () => {
    if (!activeProfile) return
    const key = prompt('Variable name:')
    if (!key) return
    const val = prompt('Value:')
    if (val === null) return
    updateProfile(gameId, activeProfile.name, {
      envVars: { ...activeProfile.envVars, [key]: val },
    })
  }

  const handleEnvVarRemove = (key: string) => {
    if (!activeProfile) return
    const vars = { ...activeProfile.envVars }
    delete vars[key]
    updateProfile(gameId, activeProfile.name, { envVars: vars })
  }

  if (!loaded && profiles.length === 0) {
    return (
      <div className="flex items-center justify-center py-8 text-text-dim">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        <span className="text-sm">Loading profiles...</span>
      </div>
    )
  }

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border-color)',
        boxShadow: 'var(--card-shadow)',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
        <div className="flex items-center gap-2.5">
          <Settings2 className="w-5 h-5" style={{ color: 'var(--accent)' }} />
          <span className="text-sm font-bold text-text-bright">Launch Profiles</span>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all hover:brightness-110"
          style={{ background: 'var(--accent)', color: '#fff' }}
        >
          <Plus className="w-3.5 h-3.5" />
          New Profile
        </button>
      </div>

      {/* Profile selector tabs */}
      <div className="px-5 pt-3 pb-1 flex gap-2 overflow-x-auto">
        {profiles.map((profile) => (
          <button
            key={profile.name}
            onClick={() => selectProfile(profile.name)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex-shrink-0 ${
              activeProfile?.name === profile.name
                ? 'text-white'
                : 'text-text-dim hover:text-text-primary'
            }`}
            style={{
              background:
                activeProfile?.name === profile.name
                  ? 'var(--accent)'
                  : 'rgba(255,255,255,0.05)',
              border: `1px solid ${
                activeProfile?.name === profile.name
                  ? 'var(--accent)'
                  : 'var(--border-color)'
              }`,
            }}
          >
            {profile.isDefault && <Star className="w-3 h-3" />}
            {profile.name}
          </button>
        ))}
        {creating && (
          <div className="flex items-center gap-1">
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              className="w-28 px-2 py-1.5 rounded-lg text-xs bg-white/[0.06] border border-white/[0.12] outline-none text-text-bright"
              placeholder="Profile name"
            />
            <button onClick={handleCreate} className="p-1.5 rounded-lg text-green hover:bg-white/[0.06]">
              <Check className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => setCreating(false)} className="p-1.5 rounded-lg text-red hover:bg-white/[0.06]">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Editor */}
      {activeProfile && (
        <div className="px-5 py-4 space-y-4">
          {/* Launch Args */}
          <div>
            <label className="flex items-center gap-2 text-xs font-semibold text-text-dim mb-1.5">
              <Terminal className="w-3.5 h-3.5" />
              Launch Arguments
            </label>
            <input
              value={activeProfile.args}
              onChange={(e) => handleArgUpdate(e.target.value)}
              className="w-full px-3 py-2 rounded-xl text-sm bg-white/[0.05] border border-white/[0.08] outline-none text-text-bright placeholder:text-text-dim transition-all focus:border-accent/30 font-mono"
              placeholder="-windowed -noborder -high"
            />
          </div>

          {/* Environment Variables */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="flex items-center gap-2 text-xs font-semibold text-text-dim">
                <Globe className="w-3.5 h-3.5" />
                Environment Variables
              </label>
              <button
                onClick={handleEnvVarAdd}
                className="text-xs text-accent hover:underline"
              >
                + Add
              </button>
            </div>
            <div className="space-y-1">
              {Object.entries(activeProfile.envVars || {}).map(([key, val]) => (
                <div key={key} className="flex items-center gap-2">
                  <span className="text-xs font-mono text-text-primary min-w-[80px]">{key}</span>
                  <span className="text-xs font-mono text-text-dim flex-1 truncate">={val}</span>
                  <button
                    onClick={() => handleEnvVarRemove(key)}
                    className="p-0.5 rounded text-red/60 hover:text-red"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
              {Object.keys(activeProfile.envVars || {}).length === 0 && (
                <p className="text-xs text-text-dim italic">No environment variables</p>
              )}
            </div>
          </div>

          {/* Resolution */}
          <div>
            <label className="flex items-center gap-2 text-xs font-semibold text-text-dim mb-1.5">
              <Monitor className="w-3.5 h-3.5" />
              Resolution Override
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={activeProfile.resolution?.width || ''}
                onChange={(e) =>
                  handleFieldUpdate('resolution', {
                    width: parseInt(e.target.value) || 0,
                    height: activeProfile.resolution?.height || 0,
                    fullscreen: activeProfile.resolution?.fullscreen || false,
                  })
                }
                className="w-20 px-2 py-1.5 rounded-lg text-xs bg-white/[0.05] border border-white/[0.08] outline-none text-text-bright font-mono"
                placeholder="Width"
              />
              <span className="text-text-dim">×</span>
              <input
                type="number"
                value={activeProfile.resolution?.height || ''}
                onChange={(e) =>
                  handleFieldUpdate('resolution', {
                    width: activeProfile.resolution?.width || 0,
                    height: parseInt(e.target.value) || 0,
                    fullscreen: activeProfile.resolution?.fullscreen || false,
                  })
                }
                className="w-20 px-2 py-1.5 rounded-lg text-xs bg-white/[0.05] border border-white/[0.08] outline-none text-text-bright font-mono"
                placeholder="Height"
              />
              <label className="flex items-center gap-1.5 ml-2">
                <input
                  type="checkbox"
                  checked={activeProfile.resolution?.fullscreen || false}
                  onChange={(e) =>
                    handleFieldUpdate('resolution', {
                      width: activeProfile.resolution?.width || 0,
                      height: activeProfile.resolution?.height || 0,
                      fullscreen: e.target.checked,
                    })
                  }
                  className="rounded"
                />
                <span className="text-xs text-text-dim">Fullscreen</span>
              </label>
            </div>
          </div>

          {/* Compat Layer */}
          <div>
            <label className="flex items-center gap-2 text-xs font-semibold text-text-dim mb-1.5">
              <Layers className="w-3.5 h-3.5" />
              Compatibility Layer
            </label>
            <div className="flex gap-1.5">
              {['none', 'proton', 'wine', 'dxvk', 'vkd3d'].map((type) => (
                <button
                  key={type}
                  onClick={() =>
                    handleFieldUpdate('compatLayer', {
                      type,
                      version: activeProfile.compatLayer?.version,
                      path: activeProfile.compatLayer?.path,
                    })
                  }
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all capitalize ${
                    activeProfile.compatLayer?.type === type
                      ? 'text-white'
                      : 'text-text-dim hover:text-text-primary'
                  }`}
                  style={{
                    background:
                      activeProfile.compatLayer?.type === type
                        ? 'var(--accent)'
                        : 'rgba(255,255,255,0.05)',
                    border: `1px solid ${
                      activeProfile.compatLayer?.type === type
                        ? 'var(--accent)'
                        : 'var(--border-color)'
                    }`,
                  }}
                >
                  {type}
                </button>
              ))}
            </div>
            {activeProfile.compatLayer && activeProfile.compatLayer.type !== 'none' && (
              <div className="mt-2 flex gap-2">
                <input
                  value={activeProfile.compatLayer.version || ''}
                  onChange={(e) =>
                    handleFieldUpdate('compatLayer', {
                      ...activeProfile.compatLayer,
                      version: e.target.value,
                    })
                  }
                  className="flex-1 px-2 py-1.5 rounded-lg text-xs bg-white/[0.05] border border-white/[0.08] outline-none text-text-bright font-mono"
                  placeholder="Version (e.g., 8.0-5)"
                />
                <input
                  value={activeProfile.compatLayer.path || ''}
                  onChange={(e) =>
                    handleFieldUpdate('compatLayer', {
                      ...activeProfile.compatLayer,
                      path: e.target.value,
                    })
                  }
                  className="flex-[2] px-2 py-1.5 rounded-lg text-xs bg-white/[0.05] border border-white/[0.08] outline-none text-text-bright font-mono"
                  placeholder="Custom path (optional)"
                />
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between pt-2 border-t border-white/[0.06]">
            <div className="flex items-center gap-2">
              {!activeProfile.isDefault && (
                <button
                  onClick={() => setDefault(gameId, activeProfile.name)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-text-dim hover:text-text-bright hover:bg-white/[0.06] transition-colors"
                >
                  <Star className="w-3.5 h-3.5" />
                  Set Default
                </button>
              )}
              {profiles.length > 1 && (
                <button
                  onClick={() => deleteProfile(gameId, activeProfile.name)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-red/60 hover:text-red hover:bg-red/10 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete
                </button>
              )}
            </div>
            {gamePath && (
              <div
                className="flex items-center gap-1.5 text-xs text-text-dim px-2 py-1 rounded-lg bg-white/[0.04]"
              >
                <Play className="w-3 h-3" />
                <span className="font-mono truncate max-w-[200px]">{gamePath}</span>
              </div>
            )}
          </div>

          {error && (
            <p className="text-xs text-red mt-2">{error}</p>
          )}
        </div>
      )}
    </div>
  )
}
