// ============================================================================
// src/components/layout/AppShell.tsx
// ----------------------------------------------------------------------------
// AppShell with horizontal top navigation — no sidebar.
// ============================================================================

import { type ReactNode, createContext, useContext, useEffect, useMemo, useState } from 'react'
import { TopNav } from './TopNav'
import { OfflineBanner } from '../ui/OfflineBanner'
import { ErrorDialog } from '../ui/ErrorDialog'
import { ConfirmModal } from '../ui/ConfirmModal'
import { SupportChat } from '../ui/SupportChat'
import { useSteamStore } from '../../stores/useSteamStore'
import { useToastStore } from '../../stores/useToastStore'
import { useSettingsStore } from '../../stores/useSettingsStore'
import { useErrorStore } from '../../stores/useErrorStore'
import { useInstallProcessor, type RestartPrompt } from '../../hooks/useInstallProcessor'
import { subscribe as subscribeLanguage } from '../../lib/i18n'
import { HostRemotePlayAuto } from '../remote-play/HostRemotePlayAuto'
import { LogConsole } from '../ui/LogConsole'

// ── PageHeader context (kept for backward compat) ──

interface PageHeaderContextValue {
  setHeader: (header: ReactNode) => void
}

const PageHeaderContext = createContext<PageHeaderContextValue>({ setHeader: () => {} })

/**
 * Push a JSX fragment into AppShell's page-header bar.
 *
 * The hook memoizes the JSX so re-renders triggered by unrelated state don't
 * churn the header (and don't trigger the pageHeader null/undefined flicker).
 *
 * IMPORTANT — language reactivity:
 *   `t()` calls inside the JSX evaluate to plain strings at JSX construction
 *   time, NOT at render time. If we only memoized on `deps`, switching
 *   language would leave the header frozen on whatever locale was active when
 *   the page first mounted, even though the page body below re-renders
 *   correctly. We subscribe to language changes and bump `langTick` so the
 *   memo always reflects the active locale.
 */
export function usePageHeader(header: ReactNode, deps: React.DependencyList = []) {
  const { setHeader } = useContext(PageHeaderContext)
  const [langTick, setLangTick] = useState(0)
  useEffect(
    () => subscribeLanguage(() => setLangTick((n) => n + 1)),
    [],
  )
  // `header` changes on every caller's render, so it MUST be a dep or the
  // memo will silently hand back stale JSX. We spread caller deps after it
  // so pages can still gate re-memoization on their own state.
  const memoizedHeader = useMemo(() => header, [header, ...deps, langTick])
  useEffect(() => {
    setHeader(memoizedHeader)
  }, [memoizedHeader, setHeader])
  // Clear the pageHeader slot ONLY when the page itself unmounts — putting
  // this cleanup inside the memo's useEffect would briefly blank the header
  // every time language (or any dep) changes.
  useEffect(() => {
    return () => setHeader(null)
  }, [])
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
  const { error, open, clearError, retry } = useErrorStore()
  const [pageHeader, setPageHeader] = useState<ReactNode>(null)
  const headerContextValue = useMemo(() => ({ setHeader: setPageHeader }), [])
  const [bgDataUrl, setBgDataUrl] = useState<string | null>(null)
  const [restartPrompt, setRestartPrompt] = useState<RestartPrompt | null>(null)

  // Processes the global download/install queue regardless of which page is mounted.
  useInstallProcessor((prompt) => setRestartPrompt(prompt))

  // Load saved config (including customization) on mount
  useEffect(() => {
    loadFromConfig()
  }, [loadFromConfig])

  // Fetch background image as data URL via IPC (avoids file:// CORS issues)
  // Falls back to public asset path when not in Electron
  useEffect(() => {
    if (customization.backgroundImage.enabled && customization.backgroundImage.path) {
      if (window.steamtools?.readImageAsDataURL) {
        window.steamtools
          .readImageAsDataURL(customization.backgroundImage.path)
          .then((url) => setBgDataUrl(url))
          .catch(() => setBgDataUrl(null))
      } else {
        setBgDataUrl(customization.backgroundImage.path.replace(/^public\//, '/'))
      }
    } else {
      setBgDataUrl(null)
    }
  }, [customization.backgroundImage.enabled, customization.backgroundImage.path])

  // Apply customization CSS variables dynamically
  useEffect(() => {
    const root = document.documentElement

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

    if (customization.backgroundImage.enabled && customization.backgroundImage.path) {
      root.style.setProperty('--bg-size', customization.backgroundImage.size)
      root.style.setProperty('--bg-position', customization.backgroundImage.position)
      root.style.setProperty('--overlay-opacity', String(customization.backgroundImage.overlayOpacity / 100))
    } else {
      root.style.removeProperty('--bg-size')
      root.style.removeProperty('--bg-position')
      root.style.removeProperty('--overlay-opacity')
    }

    root.style.setProperty('--sidebar-opacity', String(customization.navbar.sidebarOpacity / 100))
    root.style.setProperty('--titlebar-opacity', String(customization.navbar.titlebarOpacity / 100))
  }, [customization])

  useEffect(() => {
    initSteam()
    const interval = setInterval(() => {
      useSteamStore.getState().loadSteamRunning()
    }, 5000)
    return () => clearInterval(interval)
  }, [])

  return (
    <PageHeaderContext.Provider value={headerContextValue}>
      <div className="flex flex-col h-screen w-screen relative overflow-hidden">
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
        <ErrorDialog
          error={error}
          open={open}
          onClose={clearError}
          onRetry={retry || undefined}
        />
        {restartPrompt && (
          <ConfirmModal
            open={!!restartPrompt}
            onClose={() => setRestartPrompt(null)}
            onConfirm={restartPrompt.onConfirm}
            title={restartPrompt.title}
            message={restartPrompt.message}
            variant="warning"
            confirmLabel={restartPrompt.confirmLabel}
          />
        )}
        <SupportChat />

        {/* Top navigation */}
        <TopNav />

        {/* Headless host-side manager for "phone launched a game" flows.
            Listens for `remotePlay:mobileLaunch` IPC and auto-starts
            capture + signaling + WebRTC host peer so the stream lands
            even when the desktop user isn't on the Remote Play page.
            Self-disables when the user IS on /remote-play (HostTab owns
            the capture + WebRTC hooks there). Renders null. */}
        <HostRemotePlayAuto />

        {/* Page header bar (set by usePageHeader from pages) — flush with the
            unified app surface, no hairline divider. When pages want tonal
            differentiation (like Library), they wrap their header content with
            their own branded panel. */}
        {pageHeader && (
          <div className="flex-shrink-0 px-6 py-2 relative z-[1]">
            {pageHeader}
          </div>
        )}

        {/* Main content */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden relative z-[1]">
          {children}
        </main>

        {/* Floating real-time log console — shows latest log entries from any page.
            Resolves: "los logs no llegan en tiempo real". Auto-oculta tras 8s de
            inactividad. Pin para mantener visible. */}
        <LogConsole />
      </div>
    </PageHeaderContext.Provider>
  )
}
