import { useState, useEffect } from 'react'
import { ImageIcon, Eye, EyeOff, RotateCcw, GripVertical, Palette, Layers, SlidersHorizontal, FolderOpen, Check } from 'lucide-react'
import { t } from '../../lib/i18n'
import { Card } from '../ui/Card'
import { useSettingsStore, DEFAULT_CUSTOMIZATION } from '../../stores/useSettingsStore'
import type { NavItemConfig } from '../../stores/useSettingsStore'

const NAV_ITEM_LABELS: Record<string, string> = {
  library: 'library.title',
  store: 'store.title',
  onlinefix: 'nav.onlinefix',
  addgame: 'nav.addGame',
  logs: 'nav.logs',
  settings: 'nav.settings',
}

const SIZE_OPTIONS: Array<{ value: 'cover' | 'contain' | 'auto'; key: string; icon: string }> = [
  { value: 'cover', key: 'custom.sizeCover', icon: '⬛' },
  { value: 'contain', key: 'custom.sizeContain', icon: '🔲' },
  { value: 'auto', key: 'custom.sizeAuto', icon: '📐' },
]

const POSITION_OPTIONS: Array<{ value: 'center' | 'top' | 'bottom' | 'left' | 'right'; label: string }> = [
  { value: 'center', label: '⊙' },
  { value: 'top', label: '⬆' },
  { value: 'bottom', label: '⬇' },
  { value: 'left', label: '⬅' },
  { value: 'right', label: '➡' },
]

function Slider({ label, value, min, max, onChange, suffix, hint }: {
  label: string
  value: number
  min: number
  max: number
  onChange: (v: number) => void
  suffix?: string
  hint?: string
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-sm text-text-bright">{label}</span>
          {hint && <p className="text-[11px] text-text-muted">{hint}</p>}
        </div>
        <span className="text-sm font-mono text-accent bg-accent/10 px-2 py-0.5 rounded-md">{value}{suffix || ''}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="custom-range"
      />
    </div>
  )
}

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${on ? 'bg-accent' : 'bg-white/[0.12]'}`}
    >
      <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${on ? 'translate-x-5' : ''}`} />
    </button>
  )
}

function SectionHeader({ icon: Icon, title, desc, enabled, onToggle }: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  desc: string
  enabled?: boolean
  onToggle?: () => void
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex items-start gap-3">
        <div className="p-2.5 rounded-xl bg-white/[0.04] border border-white/[0.06]">
          <Icon className="w-6 h-6 text-accent" />
        </div>
        <div>
          <p className="text-base font-semibold text-text-bright">{title}</p>
          <p className="text-xs text-text-dim mt-0.5">{desc}</p>
        </div>
      </div>
      {onToggle && (
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className={`text-xs font-medium ${enabled ? 'text-accent' : 'text-text-muted'}`}>
            {enabled ? t('common.enabled') : t('common.disabled')}
          </span>
          <Toggle on={!!enabled} onClick={onToggle} />
        </div>
      )}
    </div>
  )
}

export function CustomizationPanel() {
  const { customization, setCustomization } = useSettingsStore()
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null)

  const bg = customization.backgroundImage
  const accent = customization.accentColor
  const navbar = customization.navbar

  // Fetch preview image as data URL
  useEffect(() => {
    if (bg.path) {
      window.steamtools?.readImageAsDataURL?.(bg.path)
        .then((url) => setPreviewDataUrl(url))
        .catch(() => setPreviewDataUrl(null))
    } else {
      setPreviewDataUrl(null)
    }
  }, [bg.path])

  const handleBrowseImage = async () => {
    const imgPath = await window.steamtools?.openImageDialog?.()
    if (imgPath) {
      setCustomization({
        backgroundImage: { ...bg, path: imgPath, enabled: true },
      })
    }
  }

  const handleReset = () => {
    setCustomization(DEFAULT_CUSTOMIZATION)
  }

  const updateBg = (partial: Partial<typeof bg>) => {
    setCustomization({ backgroundImage: { ...bg, ...partial } })
  }

  const updateAccent = (partial: Partial<typeof accent>) => {
    setCustomization({ accentColor: { ...accent, ...partial } })
  }

  const updateNavbar = (partial: Partial<typeof navbar>) => {
    setCustomization({ navbar: { ...navbar, ...partial } })
  }

  const updateNavItems = (items: NavItemConfig[]) => {
    setCustomization({ navItems: items })
  }

  const toggleNavVisible = (id: string) => {
    updateNavItems(
      customization.navItems.map((item) =>
        item.id === id ? { ...item, visible: !item.visible } : item
      )
    )
  }

  const handleDragStart = (index: number) => setDragIndex(index)
  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    if (dragIndex === null || dragIndex === index) return
    const items = [...customization.navItems].sort((a, b) => a.order - b.order)
    const dragged = items[dragIndex]
    items.splice(dragIndex, 1)
    items.splice(index, 0, dragged)
    updateNavItems(items.map((item, i) => ({ ...item, order: i })))
    setDragIndex(index)
  }
  const handleDragEnd = () => setDragIndex(null)

  const sortedNavItems = [...customization.navItems].sort((a, b) => a.order - b.order)

  const bgPreviewStyle: React.CSSProperties = bg.path && previewDataUrl
    ? {
        backgroundImage: `url(${previewDataUrl})`,
        backgroundSize: bg.size,
        backgroundPosition: bg.position,
        filter: bg.blur > 0 ? `blur(${bg.blur}px)` : undefined,
        opacity: bg.opacity / 100,
      }
    : {}

  return (
    <div className="space-y-4">
      {/* ===== Background Image ===== */}
      <Card>
        <div className="space-y-5">
          <SectionHeader
            icon={ImageIcon}
            title={t('custom.background')}
            desc={t('custom.backgroundDesc')}
            enabled={bg.enabled}
            onToggle={() => updateBg({ enabled: !bg.enabled })}
          />

          {bg.enabled && (
            <>
              {/* Browse button */}
              <button
                onClick={handleBrowseImage}
                className="w-full flex items-center gap-3 p-4 rounded-xl border-2 border-dashed border-white/[0.12] hover:border-accent/40 hover:bg-accent/[0.04] transition-all"
              >
                <div className="p-2.5 rounded-lg bg-white/[0.04]">
                  <FolderOpen className="w-6 h-6 text-accent" />
                </div>
                <div className="text-left flex-1 min-w-0">
                  {bg.path ? (
                    <>
                      <p className="text-sm text-text-bright font-medium">{t('custom.imageSelected')}</p>
                      <p className="text-xs text-text-muted truncate">{bg.path}</p>
                    </>
                  ) : (
                    <>
                      <p className="text-sm text-text-secondary font-medium">{t('custom.browseImage')}</p>
                      <p className="text-xs text-text-muted">{t('custom.browseImageHint')}</p>
                    </>
                  )}
                </div>
                {bg.path && <Check className="w-5 h-5 text-accent flex-shrink-0" />}
              </button>

              {/* Live preview */}
              {bg.path && previewDataUrl && (
                <div className="relative w-full h-40 rounded-xl overflow-hidden border border-white/[0.08] bg-bg-darker">
                  <div className="absolute inset-0" style={bgPreviewStyle} />
                  {bg.overlay && (
                    <div
                      className="absolute inset-0"
                      style={{ background: `linear-gradient(180deg, rgba(0,0,0,${bg.overlayOpacity / 100}) 0%, rgba(0,0,0,${(bg.overlayOpacity / 100) * 0.8}) 100%)` }}
                    />
                  )}
                  <div className="absolute bottom-2 right-2 px-2 py-1 rounded-md bg-black/50 backdrop-blur-sm text-[10px] text-white/80 font-mono">
                    {t('custom.livePreview')}
                  </div>
                </div>
              )}

              {/* Size */}
              <div className="space-y-2">
                <p className="text-sm font-medium text-text-bright">{t('custom.bgSize')}</p>
                <p className="text-[11px] text-text-muted -mt-1">{t('custom.bgSizeHint')}</p>
                <div className="flex gap-2">
                  {SIZE_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => updateBg({ size: opt.value })}
                      className={`flex-1 flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all ${
                        bg.size === opt.value
                          ? 'bg-accent/10 border-accent/40 text-accent'
                          : 'bg-white/[0.03] border-white/[0.06] text-text-dim hover:text-text-bright hover:border-white/[0.12]'
                      }`}
                    >
                      <span className="text-xl">{opt.icon}</span>
                      <span className="text-xs font-medium">{t(opt.key)}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Position */}
              <div className="space-y-2">
                <p className="text-sm font-medium text-text-bright">{t('custom.bgPosition')}</p>
                <div className="flex gap-2">
                  {POSITION_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => updateBg({ position: opt.value })}
                      className={`w-11 h-11 rounded-xl text-lg flex items-center justify-center transition-all ${
                        bg.position === opt.value
                          ? 'bg-accent text-white shadow-sm'
                          : 'bg-white/[0.04] text-text-dim hover:text-text-bright hover:bg-white/[0.06]'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Sliders */}
              <div className="space-y-4 pt-2 border-t border-white/[0.06]">
                <Slider label={t('custom.bgBlur')} hint={t('custom.bgBlurHint')} value={bg.blur} min={0} max={20} suffix="px" onChange={(v) => updateBg({ blur: v })} />
                <Slider label={t('custom.bgOpacity')} hint={t('custom.bgOpacityHint')} value={bg.opacity} min={0} max={100} suffix="%" onChange={(v) => updateBg({ opacity: v })} />
              </div>

              {/* Overlay */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                <div>
                  <span className="text-sm font-medium text-text-bright">{t('custom.bgOverlay')}</span>
                  <p className="text-[11px] text-text-muted">{t('custom.bgOverlayHint')}</p>
                </div>
                <Toggle on={bg.overlay} onClick={() => updateBg({ overlay: !bg.overlay })} />
              </div>
              {bg.overlay && (
                <Slider label={t('custom.bgOverlayOpacity')} value={bg.overlayOpacity} min={0} max={100} suffix="%" onChange={(v) => updateBg({ overlayOpacity: v })} />
              )}
            </>
          )}
        </div>
      </Card>

      {/* ===== Accent Color ===== */}
      <Card>
        <div className="space-y-5">
          <SectionHeader
            icon={Palette}
            title={t('custom.accentColor')}
            desc={t('custom.accentColorDesc')}
            enabled={accent.enabled}
            onToggle={() => updateAccent({ enabled: !accent.enabled })}
          />

          {accent.enabled && (
            <div className="space-y-4">
              <div className="flex items-center gap-4 p-4 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                <input
                  type="color"
                  value={accent.color}
                  onChange={(e) => updateAccent({ color: e.target.value })}
                  className="w-16 h-16 rounded-xl cursor-pointer bg-transparent border-2 border-white/[0.08]"
                />
                <div className="flex-1">
                  <p className="text-sm font-medium text-text-bright mb-1">{t('custom.accentColorPick')}</p>
                  <input
                    type="text"
                    value={accent.color}
                    onChange={(e) => updateAccent({ color: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.06] text-sm font-mono text-text-bright focus:outline-none focus:border-accent/40"
                  />
                </div>
              </div>

              {/* Preview */}
              <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                <p className="text-xs text-text-dim mb-3">{t('custom.accentColorPreview')}</p>
                <div className="flex items-center gap-3">
                  <button className="px-5 py-2.5 rounded-lg text-white text-sm font-medium shadow-sm" style={{ backgroundColor: accent.color }}>
                    {t('custom.accentColorBtnExample')}
                  </button>
                  <span className="text-sm font-medium" style={{ color: accent.color }}>{t('custom.accentColorLinkExample')}</span>
                  <div className="w-10 h-10 rounded-lg border-2" style={{ borderColor: accent.color, backgroundColor: `${accent.color}20` }} />
                </div>
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* ===== Navbar Opacity ===== */}
      <Card>
        <div className="space-y-5">
          <SectionHeader
            icon={SlidersHorizontal}
            title={t('custom.navbarOpacity')}
            desc={t('custom.navbarOpacityDesc')}
          />

          <Slider label={t('custom.sidebarOpacity')} hint={t('custom.sidebarOpacityHint')} value={navbar.sidebarOpacity} min={0} max={100} suffix="%" onChange={(v) => updateNavbar({ sidebarOpacity: v })} />
          <Slider label={t('custom.titlebarOpacity')} hint={t('custom.titlebarOpacityHint')} value={navbar.titlebarOpacity} min={0} max={100} suffix="%" onChange={(v) => updateNavbar({ titlebarOpacity: v })} />
        </div>
      </Card>

      {/* ===== Nav Items reorder/hide ===== */}
      <Card>
        <div className="space-y-5">
          <SectionHeader
            icon={Layers}
            title={t('custom.navItems')}
            desc={t('custom.navItemsDesc')}
          />

          <div className="space-y-2">
            {sortedNavItems.map((item, index) => (
              <div
                key={item.id}
                draggable
                onDragStart={() => handleDragStart(index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDragEnd={handleDragEnd}
                className={`flex items-center gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] transition-all cursor-grab active:cursor-grabbing ${
                  dragIndex === index ? 'opacity-50 scale-[0.98]' : ''
                } ${!item.visible ? 'opacity-60' : ''}`}
              >
                <GripVertical className="w-5 h-5 text-text-muted flex-shrink-0" />
                <span className={`text-sm flex-1 ${item.visible ? 'text-text-bright font-medium' : 'text-text-muted line-through'}`}>
                  {t(NAV_ITEM_LABELS[item.id] || item.id)}
                </span>
                <Toggle on={item.visible} onClick={() => toggleNavVisible(item.id)} />
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-accent/[0.06] border border-accent/[0.12]">
            <GripVertical className="w-4 h-4 text-accent flex-shrink-0" />
            <p className="text-[11px] text-accent/80">{t('custom.dragToReorder')}</p>
          </div>
        </div>
      </Card>

      {/* ===== Reset ===== */}
      <button
        onClick={handleReset}
        className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-medium text-text-dim hover:text-status-error hover:bg-status-error/10 transition-all w-full border border-white/[0.06] hover:border-status-error/20"
      >
        <RotateCcw className="w-5 h-5" />
        {t('custom.resetCustomization')}
      </button>
    </div>
  )
}
