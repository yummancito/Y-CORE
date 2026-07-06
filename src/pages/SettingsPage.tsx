import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  User,
  Shield,
  ScrollText,
  Palette,
  LogOut,
  ChevronRight,
  Eye,
  EyeOff,
  Wrench,
  Mail,
  Camera,
  FlaskConical,
  Globe,
  PlusCircle,
} from 'lucide-react'
import { t } from '../lib/i18n'
import { useAuthStore } from '../stores/useAuthStore'
import { useToastStore } from '../stores/useToastStore'
import { useSettingsStore } from '../stores/useSettingsStore'
import { updateBetaStatus } from '../lib/y-core-api'
import { usePageHeader } from '../components/layout/AppShell'
import { Card } from '../components/ui/Card'
import { CustomizationPanel } from '../components/settings/CustomizationPanel'
import type { LogConfig } from '../domain/types'

type SettingsTab = 'account' | 'content' | 'logs' | 'personalization'

interface TabConfig {
  id: SettingsTab
  label: string
  icon: typeof User
}

const TABS: TabConfig[] = [
  { id: 'account', label: 'settings.tabAccount', icon: User },
  { id: 'content', label: 'settings.tabContent', icon: Shield },
  { id: 'logs', label: 'settings.tabLogs', icon: ScrollText },
  { id: 'personalization', label: 'settings.tabPersonalization', icon: Palette },
]

const COLOR_THEMES = [
  { id: 'ct-y-core', label: 'Y-core' },
  { id: 'ct-heroic', label: 'Heroic Cyan' },
  { id: 'ct-steam', label: 'Steam Blue' },
  { id: 'ct-cosmic', label: 'Cosmic Night' },
  { id: 'ct-neon', label: 'Neon Purple' },
  { id: 'ct-carbon', label: 'Carbon Dark' },
  { id: 'ct-ocean', label: 'Ocean Teal' },
]

const LANGUAGES = [
  { id: 'es', label: 'Español' },
  { id: 'en', label: 'English' },
  { id: 'fr', label: 'Français' },
  { id: 'pt', label: 'Português' },
  { id: 'de', label: 'Deutsch' },
  { id: 'zh', label: '中文' },
  { id: 'hi', label: 'हिन्दी' },
]

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`relative w-11 h-6 rounded-full transition-colors duration-200 flex-shrink-0 ${
        checked ? 'bg-accent' : 'bg-white/[0.12]'
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  )
}

function SettingRow({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-4 p-4 rounded-xl bg-white/[0.03] border border-white/[0.04]">
      <div className="flex items-start gap-3 min-w-0 flex-1">
        <div className="w-10 h-10 rounded-lg bg-white/[0.06] flex items-center justify-center flex-shrink-0">
          <Icon className="w-5 h-5 text-text-secondary" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-text-bright truncate">{title}</p>
          {description && <p className="text-xs text-text-dim mt-0.5">{description}</p>}
        </div>
      </div>
      {children}
    </div>
  )
}

export default function SettingsPage() {
  const navigate = useNavigate()
  const { user, logout, isBetaTester, setIsBetaTester } = useAuthStore()
  const { showToast } = useToastStore()
  const { showAdult, showTools, showAddGame, logsVisible, colorTheme, language, setShowAdult, setShowTools, setShowAddGame, setLogsVisible, setColorTheme, setLanguage, loadFromConfig } = useSettingsStore()
  const [activeTab, setActiveTab] = useState<SettingsTab>('account')

  // Logs settings
  const [logConfig, setLogConfig] = useState<LogConfig | null>(null)
  const [logConfigLoading, setLogConfigLoading] = useState(false)

  // Profile image
  const [profileImage, setProfileImage] = useState<string | null>(null)
  const [appVersion, setAppVersion] = useState('')

  usePageHeader(
    <div className="flex items-center gap-4 h-11">
      <h1 className="text-xl font-bold text-text-bright leading-none">{t('settings.title')}</h1>
      <p className="text-[11px] text-text-dim">{t('settings.subtitle')}</p>
    </div>,
    []
  )

  // Load config on mount
  useEffect(() => {
    loadFromConfig()
    window.steamtools?.getLogConfig?.().then((cfg) => {
      setLogConfig(cfg)
    }).catch(() => {})
    window.steamtools?.readConfig?.().then((cfg: any) => {
      if (cfg?.profileImage) setProfileImage(cfg.profileImage)
    }).catch(() => {})
    window.steamtools?.getVersion?.().then((v) => setAppVersion(v)).catch(() => {})
  }, [loadFromConfig])

  const saveConfig = useCallback(async (partial: Record<string, unknown>) => {
    try {
      const current = (await window.steamtools?.readConfig?.()) as Record<string, unknown> | null
      await window.steamtools?.writeConfig?.({ ...(current || {}), ...partial })
    } catch {
      // Non-Electron environment
    }
  }, [])

  const handleShowAdult = async (v: boolean) => {
    setShowAdult(v)
    await saveConfig({ showAdult: v })
  }

  const handleShowTools = async (v: boolean) => {
    setShowTools(v)
    await saveConfig({ showTools: v })
  }

  const handleShowAddGame = async (v: boolean) => {
    setShowAddGame(v)
    await saveConfig({ showAddGame: v })
  }

  const handleColorTheme = async (themeId: string) => {
    setColorTheme(themeId)
    const root = document.documentElement
    COLOR_THEMES.forEach((ct) => root.classList.remove(ct.id))
    root.classList.add(themeId)
    await saveConfig({ colorTheme: themeId })
  }

  const handleLanguage = async (lang: string) => {
    setLanguage(lang)
    await saveConfig({ language: lang })
  }

  const handleLogEnabled = async (v: boolean) => {
    if (!logConfig) return
    setLogConfigLoading(true)
    try {
      const updated = await window.steamtools?.setLogConfig?.({ enabled: v })
      setLogConfig(updated || null)
    } catch {
      showToast('error', t('common.failed'))
    }
    setLogConfigLoading(false)
  }

  const handleLogLevel = async (level: string) => {
    if (!logConfig) return
    setLogConfigLoading(true)
    try {
      const updated = await window.steamtools?.setLogConfig?.({ minLevel: level })
      setLogConfig(updated || null)
    } catch {
      showToast('error', t('common.failed'))
    }
    setLogConfigLoading(false)
  }

  const handleLogsVisible = async (v: boolean) => {
    setLogsVisible(v)
    await saveConfig({ logsVisible: v })
  }

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      showToast('error', t('common.invalidFile'))
      return
    }
    const reader = new FileReader()
    reader.onload = async () => {
      const base64 = reader.result as string
      setProfileImage(base64)
      await saveConfig({ profileImage: base64 })
      showToast('success', t('settings.imageUpdated'))
    }
    reader.readAsDataURL(file)
  }

  const handleLogout = async () => {
    await logout()
    showToast('info', t('settings.logout'))
    navigate('/login')
  }

  const handleBetaToggle = async (v: boolean) => {
    try {
      const updated = await updateBetaStatus(v)
      setIsBetaTester(updated.is_beta_tester ?? false)
      showToast('success', v ? t('settings.betaEnabled') : t('settings.betaDisabled'))
    } catch {
      showToast('error', t('common.failed'))
    }
  }

  return (
    <div className="max-w-5xl mx-auto p-8 space-y-8">
      {/* Tab selector */}
      <div className="flex gap-1 p-1 rounded-xl bg-white/[0.04] border border-white/[0.06]">
        {TABS.map((tab) => {
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 flex-1 justify-center ${
                activeTab === tab.id
                  ? 'bg-white/[0.08] text-text-bright shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]'
                  : 'text-text-secondary hover:text-text-bright hover:bg-white/[0.04]'
              }`}
            >
              <Icon className="w-5 h-5" />
              {t(tab.label)}
            </button>
          )
        })}
      </div>

      {/* Account tab */}
      {activeTab === 'account' && (
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-bold text-text-bright">{t('settings.account')}</h2>
            <p className="text-xs text-text-dim mt-0.5">{t('settings.accountInfo')}</p>
          </div>

          <Card>
            <div className="space-y-6">
              {/* Profile header */}
              <div className="flex items-center gap-5">
                <label className="avatar avatar-online cursor-pointer group relative">
                  <div className="w-32 rounded-full ring-2 ring-white/[0.08] ring-offset-4 ring-offset-bg-primary">
                    {profileImage ? (
                      <img src={profileImage} alt="Profile" />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-accent to-accent-dark flex items-center justify-center text-4xl font-bold text-white">
                        {(user?.email?.[0] || '?').toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                    <Camera className="w-7 h-7 text-white" />
                  </div>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleImageChange}
                  />
                </label>
                <div className="min-w-0 flex-1">
                  <p className="text-base font-semibold text-text-bright truncate">
                    {user?.email || '—'}
                  </p>
                  <p className="text-xs text-text-dim mt-1">
                    {t('settings.username')}: {user?.username || user?.id?.slice(0, 12) || '—'}
                  </p>
                  <span className="inline-flex items-center mt-2 px-3 py-1 rounded-full text-xs font-medium bg-green-500/15 text-green-400 border border-green-500/20">
                    {t('settings.activeAccount')}
                  </span>
                </div>
              </div>

              {/* Account details */}
              <div className="space-y-2">
                <div className="flex items-center gap-3 p-4 rounded-xl bg-white/[0.03] border border-white/[0.04]">
                  <div className="w-10 h-10 rounded-lg bg-white/[0.06] flex items-center justify-center flex-shrink-0">
                    <Mail className="w-5 h-5 text-text-secondary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-text-dim">{t('settings.email')}</p>
                    <p className="text-sm font-medium text-text-bright truncate">
                      {user?.email || '—'}
                    </p>
                  </div>
                </div>

                <SettingRow
                  icon={FlaskConical}
                  title={t('settings.betaTitle')}
                  description={t('settings.betaDesc')}
                >
                  <Toggle checked={isBetaTester} onChange={handleBetaToggle} />
                </SettingRow>
              </div>

              {/* Logout */}
              <button
                type="button"
                onClick={handleLogout}
                className="w-full flex items-center justify-center gap-3 p-4 rounded-xl bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/15 transition-colors text-base font-medium"
              >
                <LogOut className="w-5 h-5" />
                {t('settings.logout')}
              </button>

            </div>
          </Card>
        </div>
      )}

      {/* Content tab */}
      {activeTab === 'content' && (
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-bold text-text-bright">{t('settings.content')}</h2>
            <p className="text-xs text-text-dim mt-0.5">{t('settings.contentDesc')}</p>
          </div>

          <Card>
            <div className="space-y-3">
              <SettingRow
                icon={showAdult ? Eye : EyeOff}
                title={t('settings.showAdult')}
                description={t('settings.showAdultDesc')}
              >
                <Toggle checked={showAdult} onChange={handleShowAdult} />
              </SettingRow>

              <SettingRow
                icon={Wrench}
                title={t('settings.showTools')}
                description={t('settings.showToolsDesc')}
              >
                <Toggle checked={showTools} onChange={handleShowTools} />
              </SettingRow>

              <SettingRow
                icon={PlusCircle}
                title={t('settings.showAddGame')}
                description={t('settings.showAddGameDesc')}
              >
                <Toggle checked={showAddGame} onChange={handleShowAddGame} />
              </SettingRow>
            </div>
          </Card>
        </div>
      )}

      {/* Logs tab */}
      {activeTab === 'logs' && (
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-bold text-text-bright">{t('settings.logs')}</h2>
            <p className="text-xs text-text-dim mt-0.5">{t('settings.logsEnabledDesc')}</p>
          </div>

          <Card>
            <div className="space-y-3">
              <SettingRow
                icon={ScrollText}
                title={t('settings.logsEnabled')}
                description={t('settings.logsEnabledDesc')}
              >
                <Toggle
                  checked={logConfig?.enabled ?? true}
                  onChange={handleLogEnabled}
                />
              </SettingRow>

              <SettingRow
                icon={Eye}
                title={t('settings.logsVisible')}
                description={t('settings.logsVisibleDesc')}
              >
                <Toggle checked={logsVisible} onChange={handleLogsVisible} />
              </SettingRow>

              <SettingRow icon={ScrollText} title={t('settings.logLevel')}>
                <select
                  value={logConfig?.minLevel || 'INFO'}
                  onChange={(e) => handleLogLevel(e.target.value)}
                  disabled={logConfigLoading || !logConfig?.enabled}
                  className="bg-white/[0.06] border border-white/[0.08] rounded-lg px-3 py-1.5 text-sm text-text-bright focus:outline-none focus:border-accent/50 disabled:opacity-50"
                >
                  {['DEBUG', 'INFO', 'WARN', 'ERROR'].map((lvl) => (
                    <option key={lvl} value={lvl} className="bg-bg-primary">
                      {lvl}
                    </option>
                  ))}
                </select>
              </SettingRow>

              <button
                onClick={() => navigate('/logs')}
                className="flex items-center justify-between w-full p-4 rounded-xl bg-white/[0.03] border border-white/[0.04] hover:bg-white/[0.05] transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-white/[0.06] flex items-center justify-center">
                    <ScrollText className="w-5 h-5 text-text-secondary" />
                  </div>
                  <span className="text-sm font-medium text-text-bright">
                    {t('settings.viewLogs')}
                  </span>
                </div>
                <ChevronRight className="w-4 h-4 text-text-dim group-hover:text-text-bright transition-colors" />
              </button>
            </div>
          </Card>
        </div>
      )}

      {/* Personalization tab */}
      {activeTab === 'personalization' && (
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-bold text-text-bright">{t('settings.personalization')}</h2>
            <p className="text-xs text-text-dim mt-0.5">{t('settings.personalizationDesc')}</p>
          </div>

          <Card>
            <div className="space-y-4">
              {/* Color theme */}
              <div>
                <p className="text-sm font-medium text-text-bright mb-2">
                  {t('settings.colorTheme')}
                </p>
                <p className="text-xs text-text-dim mb-3">{t('settings.colorThemeDesc')}</p>
                <select
                  value={colorTheme}
                  onChange={(e) => handleColorTheme(e.target.value)}
                  className="select select-ghost w-full"
                >
                  {COLOR_THEMES.map((ct) => (
                    <option key={ct.id} value={ct.id} className="bg-bg-primary text-text-bright">
                      {ct.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Language */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Globe className="w-5 h-5 text-text-secondary" />
                  <p className="text-sm font-medium text-text-bright">
                    {t('settings.language')}
                  </p>
                </div>
                <p className="text-xs text-text-dim mb-3">{t('settings.languageDesc')}</p>
                <select
                  value={language}
                  onChange={(e) => handleLanguage(e.target.value)}
                  className="select select-ghost w-full"
                >
                  {LANGUAGES.map((lang) => (
                    <option key={lang.id} value={lang.id} className="bg-bg-primary text-text-bright">
                      {lang.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* About */}
              <div className="pt-2 border-t border-white/[0.06]">
                <div className="flex items-center justify-between p-3">
                  <span className="text-sm text-text-dim">{t('settings.version')}</span>
                  <span className="text-sm font-mono text-text-secondary">{appVersion || '—'}</span>
                </div>
              </div>
            </div>
          </Card>

          {/* Advanced customization */}
          <CustomizationPanel />
        </div>
      )}

    </div>
  )
}
