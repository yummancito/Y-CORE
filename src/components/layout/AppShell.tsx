import { type ReactNode, createContext, useContext, useEffect, useMemo, useState } from 'react'
import { EpicSidebar } from './EpicSidebar'
import { TitleBar } from './TitleBar'
import { OfflineBanner } from '../ui/OfflineBanner'
import { useSteamStore } from '../../stores/useSteamStore'
import { useToastStore } from '../../stores/useToastStore'
import { useSettingsStore } from '../../stores/useSettingsStore'

interface PageHeaderContextValue {
  setHeader: (header: ReactNode) => void
}

const PageHeaderContext = createContext<PageHeaderContextValue>({ setHeader: () => {} })

export function usePageHeader(header: ReactNode, deps: React.DependencyList = []) {
  const { setHeader } = useContext(PageHeaderContext)
  const memoizedHeader = useMemo(() => header, deps)
  useEffect(() => {
    setHeader(memoizedHeader)
    return () => setHeader(null)
  }, [memoizedHeader, setHeader])
}

interface AppShellProps {
  children: ReactNode
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  const r = parseInt(h.substring(0, 2), 16)
  const g = parseInt(h.substring(2, 4), 16)
  const b = parseInt(h.substring(4, 6), 16)
  return [r, g, b]
}

function lightenHex(hex: string, percent: number): string {
  const [r, g, b] = hexToRgb(hex)
  const f = percent / 100
  const nr = Math.min(255, Math.round(r + (255 - r) * f))
  const ng = Math.min(255, Math.round(g + (255 - g) * f))
  const nb = Math.min(255, Math.round(b + (255 - b) * f))
  return `#${nr.toString(16).padStart(2, '0')}${ng.toString(16).padStart(2, '0')}${nb.toString(16).padStart(2, '0')}`
}

function darkenHex(hex: string, percent: number): string {
  const [r, g, b] = hexToRgb(hex)
  const f = 1 - percent / 100
  return `#${Math.round(r * f).toString(16).padStart(2, '0')}${Math.round(g * f).toString(16).padStart(2, '0')}${Math.round(b * f).toString(16).padStart(2, '0')}`
}

function hexToRgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export function AppShell({ children }: AppShellProps) {
  const { showToast } = useToastStore()
  const { init: initSteam } = useSteamStore()
  const { customization, loadFromConfig } = useSettingsStore()
  const [pickMode, setPickMode] = useState(false)
  const [pageHeader, setPageHeader] = useState<ReactNode>(null)
  const [bgDataUrl, setBgDataUrl] = useState<string | null>(null)

  // Load saved config (including customization) on mount
  useEffect(() => {
    loadFromConfig()
  }, [loadFromConfig])

  // Fetch background image as data URL via IPC (avoids file:// CORS issues)
  // Falls back to public asset path when not in Electron
  useEffect(() => {
    if (customization.backgroundImage.enabled && customization.backgroundImage.path) {
      if (window.steamtools?.readImageAsDataURL) {
        window.steamtools.readImageAsDataURL(customization.backgroundImage.path)
        .then((url) => setBgDataUrl(url))
        .catch(() => setBgDataUrl(null))
    } else {
        // Web/dev fallback: use the public path directly
        setBgDataUrl(customization.backgroundImage.path.replace(/^public\//, '/'))
    }
    } else {
      setBgDataUrl(null)
    }
  }, [customization.backgroundImage.enabled, customization.backgroundImage.path])

  // Apply customization CSS variables dynamically
  useEffect(() => {
    const root = document.documentElement

    // Accent color override
    if (customization.accentColor.enabled && customization.accentColor.color) {
      const hex = customization.accentColor.color
      root.style.setProperty('--accent', hex)
      root.style.setProperty('--accent-hover', lightenHex(hex, 20))
      root.style.setProperty('--accent-dark', darkenHex(hex, 20))
      root.style.setProperty('--accent-glow', hexToRgba(hex, 0.2))
      root.style.setProperty('--accent-soft', hexToRgba(hex, 0.08))
    } else {
      root.style.removeProperty('--accent')
      root.style.removeProperty('--accent-hover')
      root.style.removeProperty('--accent-dark')
      root.style.removeProperty('--accent-glow')
      root.style.removeProperty('--accent-soft')
    }

    // Background image
    if (customization.backgroundImage.enabled && customization.backgroundImage.path) {
      root.style.setProperty('--bg-size', customization.backgroundImage.size)
      root.style.setProperty('--bg-position', customization.backgroundImage.position)
      root.style.setProperty('--overlay-opacity', String(customization.backgroundImage.overlayOpacity / 100))
    } else {
      root.style.removeProperty('--bg-size')
      root.style.removeProperty('--bg-position')
      root.style.removeProperty('--overlay-opacity')
    }

    // Navbar opacity
    root.style.setProperty('--sidebar-opacity', String(customization.navbar.sidebarOpacity / 100))
    root.style.setProperty('--titlebar-opacity', String(customization.navbar.titlebarOpacity / 100))
  }, [customization])
  useEffect(() => {
    initSteam()
    const interval = setInterval(() => {
      useSteamStore.getState().loadSteamRunning()
    }, 5000)
    return () => clearInterval(interval)
  }, [initSteam])

  // Global Pick mode: only in development builds
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'p' || e.key === 'P') {
        setPickMode(prev => !prev)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (!pickMode) return
    const onClick = (e: MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const target = e.target as HTMLElement
      // Find nearest section label
      let el: HTMLElement | null = target
      let section = ''
      let gameName = ''
      while (el && el !== document.body) {
        if (!section && el.dataset.section) section = el.dataset.section
        if (!gameName && el.dataset.name) gameName = el.dataset.name
        if (section && gameName) break
        el = el.parentElement
      }
      // Build a short selector
      let selector = target.tagName.toLowerCase()
      if (target.id) selector += `#${target.id}`
      if (target.className && typeof target.className === 'string') {
        const c = target.className.split(' ').filter(Boolean).slice(0, 2)
        if (c.length) selector += `.${c.join('.')}`
      }
      // Format output
      let output = ''
      if (gameName) output += `Game: ${gameName}\n`
      if (section) output += `Section: ${section}\n`
      output += `Element: ${selector}`
      navigator.clipboard.writeText(output)
      showToast('success', gameName ? `Game: ${gameName}` : section ? `Section: ${section}` : selector)
      setPickMode(false)
    }
    window.addEventListener('click', onClick, true)
    return () => window.removeEventListener('click', onClick, true)
  }, [pickMode, showToast])

  return (
    <PageHeaderContext.Provider value={{ setHeader: setPageHeader }}>
      <div className={`flex h-screen w-screen relative overflow-hidden bg-bg-primary ${pickMode ? 'pick-mode' : ''}`}>
        {/* Background image layer */}
        {customization.backgroundImage.enabled && customization.backgroundImage.path && bgDataUrl && (
          <>
            <div
              className="bg-layer"
              style={{
                backgroundImage: `url(${bgDataUrl})`,
                filter: customization.backgroundImage.blur > 0 ? `blur(${customization.backgroundImage.blur}px)` : undefined,
                opacity: customization.backgroundImage.opacity / 100,
              }}
            />
            {customization.backgroundImage.overlay && <div className="bg-overlay" />}
          </>
        )}
        <OfflineBanner />
        <div className="flex h-full w-full relative z-[1]">
          <EpicSidebar />
          <div className="flex flex-col flex-1 h-full min-w-0" data-section="Main Content">
            <TitleBar header={pageHeader} />
            <main className="flex-1 overflow-y-auto overflow-x-hidden">
              {children}
            </main>
          </div>
        </div>
      </div>
    </PageHeaderContext.Provider>
  )
}

