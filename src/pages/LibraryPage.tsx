import { useState, useEffect, useRef, useMemo, useCallback, memo, useId } from 'react'
import {
  Gamepad2,
  Play,
  ArrowUp,
  Search,
  CheckCircle,
  Trash2,
  Loader2,
  FolderOpen,
  AlertTriangle,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  Wrench,
  Wifi,
  Heart,
  Download,
  Shield,
  X,
} from 'lucide-react'
import { t } from '../lib/i18n'
import { parseError } from '../lib/parse-error'
import { useLibraryStore, useFilteredLibraryGames } from '../stores/useLibraryStore'
import { useToastStore } from '../stores/useToastStore'
import { usePageHeader } from '../components/layout/AppShell'

import { useDownloadEngineStore, formatBytes } from '../stores/useDownloadEngineV3Store'
import { ConfirmModal } from '../components/ui/ConfirmModal'
import { useSettingsStore } from '../stores/useSettingsStore'
import { launchDedup } from '../lib/launch-deduper'
import { useGameProcessStore, startProcessPolling, stopProcessPolling } from '../stores/useGameProcessStore'
import { useLibraryV2Store } from '../stores/useLibraryV2Store'
import { GameNotesPanel } from '../components/library/GameNotesPanel'
import { FavoriteButton } from '../components/library/FavoriteButton'
import type { InstalledGame } from '../domain/types'

type PanelTab = 'overview' | 'actions' | 'notes'

type DrmStatus = 'no-drm' | 'drm-removed' | 'drm-present' | 'not-found'

// ── GoldSrc prereq set UI surface ─────────────────────────────────────────
//
// Mirror of the renderer-side constant in `useInstallProcessor`. Used here
// only for the "requires Half-Life first" banner in the GameDetailPanel —
// independent of the install flow so we can show the banner even when the
// user just opens /library without having started an install.
const GOLDSRC_MOD_APP_IDS_UI = new Set([
  '10', '20', '30', '40', '50', '60', '80', '100', '130',
])
const HALF_LIFE_APP_ID_UI = '70'

// Module-scope translated lookups. `sortOptions` is rebuilt here as a
// constant array (consumed by SortDropdown as a prop); `DRM_STATUS_LABEL`
// is exposed via a getter-backed object so t() is re-evaluated on every
// read — this lets sub-components (GameDetailPanel, etc.) and library
// consumers see language updates after the user switches locale, without
// having to thread the labels down as props.

const sortOptions = [
  { key: 'nameAsc', label: t('library.sortNameAsc') },
  { key: 'nameDesc', label: t('library.sortNameDesc') },
  { key: 'recentlyPlayed', label: t('library.recentlyPlayed') },
  { key: 'recentlyInstalled', label: t('library.recentlyInstalled') },
  { key: 'largest', label: t('library.largest') },
] as const

// Note: sortOptions labels are frozen at module load. For default Spanish
// users (the primary audience) this is correct. For users who switch
// language mid-session, SortDropdown won't re-translate until component
// remount. Acceptable trade-off — the alternative (subscribing inside
// the component + threading labels as props to SortDropdown) was tried
// but broke sub-component access to DRM_STATUS_LABEL.

// Getter-backed object: t() is called fresh on every property access,
// so labels stay reactive to current language changes.
const DRM_STATUS_LABEL: { readonly [K in DrmStatus]: string } = {
  'no-drm': 'Sin DRM',
  'drm-removed': 'Ya eliminado',
  'drm-present': 'DRM presente',
  'not-found': 'No encontrado',
}

// Replace the labels with reactive getters. The compiled output still
// has `t('library.drm.noDrm')` evaluated per-access, which means
// GameDetailPanel et al. that consume DRM_STATUS_LABEL see the current
// locale's translation at render time.
Object.entries(DRM_STATUS_LABEL).forEach(([key]) => {
  const k = key as DrmStatus
  Object.defineProperty(DRM_STATUS_LABEL, k, {
    get() { return t(`library.drm.${key === 'no-drm' ? 'noDrm' : key === 'drm-removed' ? 'removed' : key === 'drm-present' ? 'present' : 'notFound'}`) },
    enumerable: true,
    configurable: true,
  })
})

// Custom dropdown replacement for the native <select> — the native `<select>`
// popup is rendered by the OS and shows white/black colors regardless of the
// app's dark theme. This component replaces it with a fully-styled, dark
// dropdown that matches the rest of the library UI.
function SortDropdown({
  value,
  options,
  onChange,
}: {
  value: string
  options: readonly { key: string; label: string }[]
  onChange: (v: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [focusIdx, setFocusIdx] = useState(0)
  // Mirror focusIdx in a ref so the keydown listener can read the latest value
  // without re-registering on every focus change (avoids N event listener churn
  // when the user holds an arrow key).
  const focusIdxRef = useRef(0)
  const listboxRef = useRef<HTMLUListElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  // useId() returns a stable, collision-free id per component instance — required
  // if the same SortDropdown is mounted multiple times on the same page.
  const listboxId = useId()
  const current = options.find((o) => o.key === value) ?? options[0]

  // Closes the dropdown and returns focus to the trigger button so keyboard
  // users don't lose their position after Escape / outside-click / option-click.
  // useCallback is required here: the keydown useEffect lists this in its deps
  // to satisfy eslint exhaustive-deps, and without a stable reference the
  // effect would re-register the document listener on every render.
  const closeAndRestoreFocus = useCallback(() => {
    buttonRef.current?.focus()
    setOpen(false)
  }, [])

  // When opening, seed focus index to the currently selected option (or 0)
  // and push focus into the listbox so screen readers + keyboard nav work.
  useEffect(() => {
    if (!open) return
    const idx = options.findIndex((o) => o.key === value)
    const initial = idx >= 0 ? idx : 0
    setFocusIdx(initial)
    focusIdxRef.current = initial
    listboxRef.current?.focus()
  }, [open, value, options])

  // Keyboard navigation while open: ArrowDown/Up move, Enter selects, Esc closes,
  // Home/End jump to ends. Listener is only attached when open so we don't
  // intercept keys elsewhere. Skips events when focus is in an INPUT/TEXTAREA
  // so the search box above stays usable while the dropdown is open.
  // focusIdxRef is mutated synchronously next to each setFocusIdx call so the
  // ref never lags behind state (no separate sync effect needed).
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return
      if (e.key === 'Escape') {
        e.preventDefault()
        closeAndRestoreFocus()
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        const next = (focusIdxRef.current + 1) % options.length
        focusIdxRef.current = next
        setFocusIdx(next)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        const next = (focusIdxRef.current - 1 + options.length) % options.length
        focusIdxRef.current = next
        setFocusIdx(next)
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        const opt = options[focusIdxRef.current]
        if (opt) {
          onChange(opt.key)
          setOpen(false)
        }
      } else if (e.key === 'Home') {
        e.preventDefault()
        focusIdxRef.current = 0
        setFocusIdx(0)
      } else if (e.key === 'End') {
        e.preventDefault()
        const next = options.length - 1
        focusIdxRef.current = next
        setFocusIdx(next)
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, options, onChange, closeAndRestoreFocus])

  return (
    <div className="relative flex-1">
      <button
        ref={buttonRef}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        className="w-full h-7 px-2 rounded-md text-[11.5px] font-semibold text-text-bright bg-white/[0.04] border border-transparent outline-none hover:bg-white/[0.06] cursor-pointer flex items-center justify-between transition-colors"
        title="Ordenar"
      >
        <span className="truncate">{current.label}</span>
        <ChevronDown
          className={`w-3 h-3 text-text-dim transition-transform flex-shrink-0 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <>
          {/* Backdrop captures outside clicks without affecting layout */}
          <div className="fixed inset-0 z-40" onClick={closeAndRestoreFocus} role="presentation" />
          <ul
            ref={listboxRef}
            id={listboxId}
            role="listbox"
            tabIndex={-1}
            aria-modal="true"
            aria-label="Ordenar juegos"
            className="absolute top-full left-0 right-0 mt-1 z-50 rounded-md overflow-hidden focus:outline-none"
            // Popup surface uses hardcoded dark colors — NOT CSS vars — so it
            // stays consistent across all themes (light/dark/y-core/cosmic/etc.).
            // The listbox is an overlay; it should never inherit the theme's
            // --bg-primary (which in .theme-light resolves to near-white and
            // breaks the dark surface). Accent colors (var(--accent)) DO follow
            // the theme so Cosmic/Neon/Carbon users see their chosen accent
            // tint in the selected option instead of generic Steam-blue.
            style={{
              background: 'rgba(15, 17, 22, 0.98)',
              WebkitBackdropFilter: 'blur(20px) saturate(1.2)',
              backdropFilter: 'blur(20px) saturate(1.2)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              boxShadow:
                '0 8px 32px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255,255,255,0.04)',
            }}
          >
            {options.map((opt, idx) => {
              const active = opt.key === value
              const focused = idx === focusIdx
              return (
                <li
                  key={opt.key}
                  role="option"
                  aria-selected={active}
                  onClick={() => {
                    onChange(opt.key)
                    closeAndRestoreFocus()
                  }}
                  onMouseEnter={() => setFocusIdx(idx)}
                  className="px-2.5 py-1.5 text-[11.5px] cursor-pointer transition-colors"
                  // Per-option colors hardcoded so contrast is guaranteed on the
                  // dark popup surface regardless of theme.
                  style={{
                    // Foreground text: accent-tinted on active (theme-aware via
                    // --accent), hardcoded light gray on inactive (guaranteed
                    // contrast on the dark popup surface in every theme).
                    color: active ? 'var(--accent)' : '#e4e4e7',
                    // Active background uses --accent-glow (theme-aware tinted
                    // accent, already defined per-theme at ~20% opacity).
                    // Focused background is a neutral white tint.
                    background: active
                      ? 'var(--accent-glow)'
                      : focused
                        ? 'rgba(255, 255, 255, 0.08)'
                        : 'transparent',
                    // Accent bar on the left, theme-aware. Shown when the option
                    // is focused OR active — when the user keyboard-navigates
                    // back to the currently selected item, the bar must persist
                    // so the affordance stays consistent.
                    boxShadow:
                      focused || active
                        ? 'inset 2px 0 0 var(--accent)'
                        : 'none',
                  }}
                >
                  {opt.label}
                </li>
              )
            })}
          </ul>
        </>
      )}
    </div>
  )
}

// ============================================================================
// src/pages/LibraryPage.tsx
// ----------------------------------------------------------------------------
// Steam-style two-pane library:
//   • Left rail (292px)  — mini app nav (Biblioteca / Tienda) + library
//                          sub-nav (Página principal / Colecciones / Descargas)
//                          + sidebar controls (search / sort / favorites)
//                          + scrollable list of installed games (compact row).
//   • Right pane         — context-aware:
//                          - "games" view      → GameDetailPanel (cover +
//                                                  title + actions + tabs)
//                          - "collections" view → CollectionsContent
//                          - "downloads" view    → DownloadsContent
// ============================================================================

export default function LibraryPage() {
  // ── Stores (showToast extraído con selector estable para evitar re-renders) ──
  const { searchQuery, sortBy, loadGames, setSearchQuery, setSortBy, loading, error } = useLibraryStore()
  const gamesUnfiltered = useFilteredLibraryGames()
  const { showFavoritesOnly, favorites } = useLibraryV2Store()
  const games = useMemo(
    () => (showFavoritesOnly ? gamesUnfiltered.filter((g) => !!favorites[g.appId]) : gamesUnfiltered),
    [gamesUnfiltered, showFavoritesOnly, favorites],
  )
  const [selectedAppId, setSelectedAppId] = useState<string | null>(null)
  const showToast = useToastStore((s) => s.showToast)
  // V2-only: every install goes through the V2 engine. Query live state per
  // appId from the engine store; the badge (now V2-only) and detail panel
  // derive everything they need from this single source of truth.
  const v3Tasks = useDownloadEngineStore((s) => s.tasks)
  const getDownloadState = useCallback(
    (appId: string) => v3Tasks.find((t) => String(t.appId) === String(appId))?.state,
    [v3Tasks],
  )
  const [showScrollTop, setShowScrollTop] = useState(false)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; game: InstalledGame } | null>(null)
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string
    message: string
    onConfirm: () => void
    variant?: 'danger' | 'warning'
    confirmLabel?: string
    cancelLabel?: string
  } | null>(null)
  const initRef = useRef(false)
  const contextMenuRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const setShowFavoritesOnly = useLibraryV2Store((s) => s.setShowFavoritesOnly)

  const [visibleGamesCount, setVisibleGamesCount] = useState(50)
  const sidebarGamesListRef = useRef<HTMLDivElement>(null)
  const loadingMoreGamesRef = useRef(false)

  // ── Effects ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (initRef.current) return
    initRef.current = true
    loadGames()
    startProcessPolling()
    useDownloadEngineStore.getState().init()
    return () => {
      stopProcessPolling()
      useDownloadEngineStore.getState().destroy()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Scroll listener con debounce RAF para no setear estado en cada frame
  useEffect(() => {
    const main = document.querySelector('main')
    if (!main) return
    let ticking = false
    const onScroll = () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          setShowScrollTop(main!.scrollTop > 400)
          ticking = false
        })
        ticking = true
      }
    }
    main.addEventListener('scroll', onScroll, { passive: true })
    return () => main.removeEventListener('scroll', onScroll)
  }, [])

  // Sidebar games list virtual scrolling
  useEffect(() => {
    const sidebar = sidebarGamesListRef.current
    if (!sidebar) return
    let debounceTimer: NodeJS.Timeout | null = null
    const onSidebarScroll = () => {
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        if (!loadingMoreGamesRef.current && sidebar.scrollTop + sidebar.clientHeight >= sidebar.scrollHeight - 300) {
          loadingMoreGamesRef.current = true
          setVisibleGamesCount((prev) => Math.min(prev + 15, games.length))
          setTimeout(() => {
            loadingMoreGamesRef.current = false
          }, 100)
        }
      }, 200)
    }
    sidebar.addEventListener('scroll', onSidebarScroll, { passive: true })
    return () => {
      sidebar.removeEventListener('scroll', onSidebarScroll)
      if (debounceTimer) clearTimeout(debounceTimer)
    }
  }, [games.length])

  const scrollToTop = () => {
    const main = document.querySelector('main')
    if (main) main.scrollTo({ top: 0, behavior: 'smooth' })
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (!contextMenu) return
    const close = () => setContextMenu(null)
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    const onPointerDown = (e: MouseEvent) => {
      if (contextMenuRef.current?.contains(e.target as Node)) return
      close()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onPointerDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onPointerDown)
    }
  }, [contextMenu])

  // ── Handlers ──────────────────────────────────────────────────────────
  // Round-10 (debouncer): launchDedup (src/lib/launch-deduper.ts) is a
  // module-scoped Promise<unknown> tracker shared across LibraryPage and
  // GameDetailPage. The promise lifecycle gates each appId cleanly — no
  // fixed 1500ms timeout, no thrashing on slow Steamless scans.
  const handleLaunchGame = useCallback(async (appId: string) => {
    if (!appId) return
    const result = await launchDedup(appId, () => window.steamtools.launchGame(appId))
    if (result === null) return // already in-flight from another click

    if (result.success) {
      // Friendly baseline toast.
      showToast('success', t('library.launching'))
      // Transparent Steam-state copy — disambiguates "Y-core launched it" vs
      // "Steam was already running independently".
      const wasAlive = result.wasSteamAliveAtLaunch === true
      const wasKilled = result.killedSteamBeforeLaunch === true
      if (wasKilled) {
        showToast(
          'info',
          'Steam estaba activo y fue terminado antes del launch. Y-core corre 100% independiente.',
        )
      } else if (wasAlive) {
        showToast(
          'info',
          'Steam estaba activo en tu sistema pero Y-core lanzó el juego nativamente. Steam NO es el launcher — para verificación visual, activá "Matar Steam antes de cada launch" en Ajustes.',
        )
      } else {
        showToast(
          'info',
          'Steam NO estaba corriendo. El juego se lanzó independientemente desde Y-core.',
        )
      }
    } else {
      showToast('error', parseError(result.error, 'library.launchFailed'))
    }
  }, [showToast])

  const handleDeleteGame = useCallback((game: InstalledGame) => {
    setConfirmDialog({
      title: `¿Desinstalar ${game.name || 'este juego'}?`,
      message: 'Se eliminarán los archivos del juego de tu equipo. Tus partidas guardadas en la nube no se borrarán.',
      variant: 'danger',
      confirmLabel: 'Desinstalar',
      onConfirm: async () => {
        const result = await window.steamtools.deleteGame(game.appId, game.installDir)
        if (result.success) {
          showToast('success', t('library.gameRemoved'))
          await loadGames()
        } else {
          showToast('error', parseError(result.error, 'library.failedRemove'))
        }
      },
    })
  }, [showToast, loadGames])

  const handleOpenLocation = useCallback(async (game: InstalledGame) => {
    const result = await window.steamtools.openGameLocation(game.appId, game.installDir)
    if (!result.success) {
      showToast('error', parseError(result.error, 'library.openFailed'))
    }
  }, [showToast])

  const handleVerifyGame = useCallback(async (game: InstalledGame) => {
    const result = await window.steamtools.verifyGame(game.appId)
    if (result.success) {
      showToast('info', t('library.verifyStart'))
    } else {
      showToast('error', parseError(result.error, 'library.verifyFailed'))
    }
  }, [showToast])

  const handleRepairInstallation = useCallback(async (game: InstalledGame) => {
    const result = await useDownloadEngineStore.getState().repairLocalInstallation(
      game.appId,
      game.installDir,
    )
    const diagnostic = result.result
    if (!result.success || !diagnostic) {
      showToast('error', result.error || 'No se pudo diagnosticar la instalación')
      return
    }

    const repaired = diagnostic.repaired?.length ?? 0
    const issues = diagnostic.issues ?? []
    if (diagnostic.ok) {
      showToast(
        'success',
        repaired > 0
          ? `Fix completado: ${repaired} elemento(s) local(es) reparado(s).`
          : 'Diagnóstico completado: la instalación local está consistente.',
        7000,
      )
    } else {
      showToast(
        'warning',
        `${repaired > 0 ? `Se repararon ${repaired} elemento(s). ` : ''}${issues.join(' · ')}. Los archivos del juego que falten requieren una reinstalación normal; no se aplicó ningún bypass.`,
        10000,
      )
    }
  }, [showToast])

  const handleToggleOnlineFix = useCallback(async (game: InstalledGame) => {
    const status = await window.steamtools.checkOnlineFixStatus(game.appId)
    if (status.enabled) {
      const result = await window.steamtools.disableOnlineFix(game.appId)
      if (result.success) {
        showToast('success', `${t('onlinefix.disabledSuccess')} ${game.name || t('library.unknown')}`)
      } else {
        showToast('error', parseError(result.error, 'onlinefix.disableFailed'))
      }
    } else {
      const result = await window.steamtools.enableOnlineFix(game.appId)
      if (result.success) {
        showToast('success', `${t('onlinefix.enabledSuccess')} ${game.name || t('library.unknown')}`)
      } else {
        showToast('error', parseError(result.error, 'onlinefix.enableFailed'))
      }
    }
  }, [showToast])

  // ── Handlers memoizados con showToast estable ──
  const handleContextMenu = useCallback((e: React.MouseEvent, game: InstalledGame) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, game })
  }, [])

  // ── Page header is intentionally empty here ──
  usePageHeader(null, [])

  // ── Handlers memoizados con store estables ──
  // useToastStore ya no cambia en cada render porque extraemos s.showToast directamente
  // -- esto estabiliza todos los useCallbacks que dependen de showToast

  // Reset visible games count when games array changes (due to search/sort)
  useEffect(() => {
    setVisibleGamesCount(50)
  }, [games.length])

  // ── Derived data ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!selectedAppId && games.length > 0) {
      setSelectedAppId(games[0].appId)
      return
    }
    if (selectedAppId && !games.some((g) => g.appId === selectedAppId)) {
      setSelectedAppId(games[0]?.appId ?? null)
    }
  }, [games, selectedAppId])

  const selectedGame = useMemo(
    () => (selectedAppId ? games.find((g) => g.appId === selectedAppId) ?? null : null),
    [selectedAppId, games],
  )

  // ── Render ──────────────────────────────────────────────────────────
  return (
    <div data-section="Library" className="h-full animate-fade-in flex">
      {/* ── LEFT RAIL: nav + games list (Steam-style) ── */}
      <aside
        className="flex-shrink-0 flex flex-col select-none overflow-hidden"
        style={{
          width: '292px',
          background: 'var(--bg-primary)',
        }}
      >
        {/* Sidebar controls (search + sort + favorites). */}
        <div className="px-3 pt-5 flex flex-col gap-2 flex-shrink-0">
          <div className="group flex items-center relative h-11">
              <div className="absolute left-3 flex items-center pointer-events-none">
                <Search className="w-[18px] h-[18px] text-text-dim transition-colors group-focus-within:text-text-bright" />
              </div>
              <input
                ref={searchRef}
                type="search"
                placeholder={t('library.searchPlaceholder')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-11 pl-10 pr-4 rounded-xl text-[14px] text-text-bright placeholder:text-text-dim bg-white/[0.04] border border-transparent outline-none hover:bg-white/[0.06] focus:bg-white/[0.06]"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <SortDropdown
                value={sortBy}
                options={sortOptions}
                onChange={(v) => setSortBy(v as any)}
              />
              <button
                onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
                title={t('library.favoritesOnly')}
                className="flex items-center justify-center w-7 h-7 rounded-md transition-all"
                style={{
                  background: showFavoritesOnly ? 'var(--red-soft)' : 'rgba(255,255,255,0.04)',
                  color: showFavoritesOnly ? 'var(--red)' : 'var(--text-dim)',
                }}
              >
                <Heart
                  className="w-3.5 h-3.5"
                  fill={showFavoritesOnly ? 'currentColor' : 'none'}
                />
              </button>
            </div>
          </div>

        {/* Games list (vertical compact rows, scrollable) */}
        <div ref={sidebarGamesListRef} className="flex-1 min-h-0 overflow-y-auto px-2 py-3 mt-1">
            {loading && games.length === 0 ? (
              <div className="flex items-center justify-center py-10 text-text-dim">
                <Loader2 className="w-4 h-4 animate-spin" />
              </div>
            ) : games.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-text-dim text-center">
                <Gamepad2 className="w-7 h-7 mb-2 opacity-30" />
                <p className="text-[11px]">
                  {searchQuery ? t('library.noMatches') : t('library.noGamesYet')}
                </p>
              </div>
            ) : (
              games.slice(0, visibleGamesCount).map((game) => (
                <SidebarGameRow
                  key={game.appId}
                  game={game}
                  isSelected={selectedAppId === game.appId}
                  onSelect={() => setSelectedAppId(game.appId)}
                  onContextMenu={(e: React.MouseEvent) => handleContextMenu(e, game)}
                  onLaunch={() => handleLaunchGame(game.appId)}
                />
              ))
            )}
          </div>
      </aside>

      {/* ── MAIN: detail panel ── */}
      <main className="flex-1 min-w-0 overflow-hidden flex flex-col relative">
        {selectedGame ? (
          <GameDetailPanel
            game={selectedGame}
            onLaunch={() => handleLaunchGame(selectedGame.appId)}
            onVerify={() => handleVerifyGame(selectedGame)}
            onRepair={() => handleRepairInstallation(selectedGame)}
            onOpenLocation={() => handleOpenLocation(selectedGame)}
            onToggleOnlineFix={() => handleToggleOnlineFix(selectedGame)}
            onUninstall={() => handleDeleteGame(selectedGame)}
          />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-text-dim animate-fade-in">
            <Gamepad2 className="w-16 h-16 mb-4 opacity-20" />
            <p className="text-sm">{error ?? t('library.noGames')}</p>
          </div>
        )}

      </main>

      {/* Scroll-to-top button */}
      <button
        onClick={scrollToTop}
        title={t('store.scrollToTop')}
        className={`fixed bottom-6 right-6 z-50 flex items-center justify-center w-12 h-12 rounded-full bg-accent text-white shadow-lg shadow-accent/30 hover:scale-105 transition-all duration-300 ${
          showScrollTop ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'
        }`}
      >
        <ArrowUp className="w-5 h-5" />
      </button>

      {/* Context menu (right click on a game row) */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="fixed z-[100] rounded-xl p-1.5 min-w-[200px] animate-fade-in"
          style={{
            left: contextMenu.x,
            top: contextMenu.y,
            background: 'var(--bg-card)',
            border: '1px solid var(--border-color)',
            boxShadow: '0 16px 48px rgba(0,0,0,0.6)',
          }}
          onClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.preventDefault()}
        >
          <button
            onClick={() => {
              handleLaunchGame(contextMenu.game.appId)
              setContextMenu(null)
            }}
            className="flex items-center gap-2 w-full px-2.5 py-2 rounded-md text-[12.5px] font-medium text-text-secondary hover:text-text-bright hover:bg-white/[0.05] transition-colors"
          >
            <Play className="w-3.5 h-3.5" /> Jugar
          </button>
          <button
            onClick={() => {
              handleVerifyGame(contextMenu.game)
              setContextMenu(null)
            }}
            className="flex items-center gap-2 w-full px-2.5 py-2 rounded-md text-[12.5px] font-medium text-text-secondary hover:text-text-bright hover:bg-white/[0.05] transition-colors"
          >
            <Wrench className="w-3.5 h-3.5" /> Verificar
          </button>
          <button
            onClick={() => {
              handleRepairInstallation(contextMenu.game)
              setContextMenu(null)
            }}
            className="flex items-center gap-2 w-full px-2.5 py-2 rounded-md text-[12.5px] font-medium text-text-secondary hover:text-text-bright hover:bg-white/[0.05] transition-colors"
          >
            <Wrench className="w-3.5 h-3.5" /> Reparar metadatos locales
          </button>
          <button
            onClick={() => {
              handleOpenLocation(contextMenu.game)
              setContextMenu(null)
            }}
            className="flex items-center gap-2 w-full px-2.5 py-2 rounded-md text-[12.5px] font-medium text-text-secondary hover:text-text-bright hover:bg-white/[0.05] transition-colors"
          >
            <FolderOpen className="w-3.5 h-3.5" /> Abrir carpeta
          </button>
          <button
            onClick={() => {
              handleToggleOnlineFix(contextMenu.game)
              setContextMenu(null)
            }}
            className="flex items-center gap-2 w-full px-2.5 py-2 rounded-md text-[12.5px] font-medium text-text-secondary hover:text-text-bright hover:bg-white/[0.05] transition-colors"
          >
            <Wifi className="w-3.5 h-3.5" /> OnlineFix
          </button>
          <div className="my-1 h-px" style={{ background: 'var(--border-color)' }} />
          <button
            onClick={() => {
              handleDeleteGame(contextMenu.game)
              setContextMenu(null)
            }}
            className="flex items-center gap-2 w-full px-2.5 py-2 rounded-md text-[12.5px] font-medium text-red hover:bg-red/10 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" /> Desinstalar
          </button>
        </div>
      )}

      {/* Confirm modal */}
      {confirmDialog && (
        <ConfirmModal
          open={!!confirmDialog}
          onClose={() => setConfirmDialog(null)}
          onConfirm={confirmDialog.onConfirm}
          title={confirmDialog.title}
          message={confirmDialog.message}
          variant={confirmDialog.variant}
          confirmLabel={confirmDialog.confirmLabel}
          cancelLabel={confirmDialog.cancelLabel}
        />
      )}
    </div>
  )
}

// ─── Sidebar game row ─────────────────────────────────────────────────
const SidebarGameRow = memo(function SidebarGameRow({
  game,
  isSelected,
  onSelect,
  onContextMenu,
  onLaunch,
}: {
  game: InstalledGame
  isSelected: boolean
  onSelect: () => void
  onContextMenu: (e: React.MouseEvent) => void
  onLaunch: () => void
}) {
  const [hovered, setHovered] = useState(false)
  const [coverStep, setCoverStep] = useState<'primary' | 'fallback' | 'failed'>('primary')
  const installed = !!game.installDir
  const coverPrimary = `https://cdn.akamai.steamstatic.com/steam/apps/${game.appId}/library_600x900.jpg`
  const coverFallback = `https://cdn.akamai.steamstatic.com/steam/apps/${game.appId}/header.jpg`
  return (
    <div
      onClick={onSelect}
      onContextMenu={onContextMenu}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="group flex items-center gap-2.5 px-2 py-2 rounded-lg cursor-pointer transition-colors mb-0.5"
      style={{
        background: isSelected
          ? 'rgba(255,255,255,0.08)'
          : hovered
            ? 'rgba(255,255,255,0.04)'
            : 'transparent',
      }}
    >
      <div
        className="w-[34px] h-[48px] rounded overflow-hidden flex-shrink-0 flex items-center justify-center"
        style={{
          background: 'rgba(255,255,255,0.06)',
          boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.04)',
        }}
      >
        {coverStep === 'failed' ? (
          <Gamepad2 className="w-3.5 h-3.5 opacity-50 text-text-dim" />
        ) : (
          <img
            src={coverStep === 'primary' ? coverPrimary : coverFallback}
            alt=""
            className="w-full h-full object-cover"
            loading="lazy"
            decoding="async"
            onError={() => setCoverStep((s) => (s === 'primary' ? 'fallback' : 'failed'))}
          />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[12.5px] font-semibold text-text-bright truncate leading-tight">{game.name}</p>
        <p className="text-[10px] text-text-dim mt-0.5 flex items-center gap-1.5">
          {game.sizeOnDisk ? <span>{formatBytes(game.sizeOnDisk)}</span> : null}
          {game.playtime ? <span>{Math.round(game.playtime / 60)}h</span> : null}
        </p>
      </div>
      {isSelected && <FavoriteButton appId={game.appId} size={13} />}
      {isSelected && installed && hovered && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onLaunch()
          }}
          className="flex items-center justify-center w-6 h-6 rounded-md text-text-dim hover:text-accent hover:bg-white/[0.08] transition-all"
          title="Jugar"
        >
          <Play className="w-3 h-3 fill-current" />
        </button>
      )}
      {isSelected && !installed && (
        <Download className="w-3.5 h-3.5 text-text-dim opacity-50" />
      )}
    </div>
  )
})

// ─── Game detail panel ─────────────────────────────────────────────────
// Steam-style page with hero block on top (portrait cover + status pill +
// title + actions), tabbed content area below (Resumen / Acciones / Notas).
// ──────────────────────────────────────────────────────────────────────
function onlinefixDesc(enabled: boolean | null): string {
  if (enabled === null) return t('library.onlinefixChecking')
  if (enabled) return t('library.onlinefixActive')
  return t('library.onlinefixInactive')
}

// Steam's about_the_game returns HTML (<h2>, <p>, <br>, &amp;, &quot;...).
// Strip tags + decode common entities so it renders as plain text in the panel.
function stripSteamHtml(input: string | undefined | null): string {
  if (!input) return ''
  return input
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

const GameDetailPanel = memo(function GameDetailPanel({
  game,
  onLaunch,
  onVerify,
  onRepair,
  onOpenLocation,
  onToggleOnlineFix,
  onUninstall,
}: {
  game: InstalledGame
  onLaunch: () => void
  onVerify: () => void
  onRepair: () => void
  onOpenLocation: () => void
  onToggleOnlineFix: () => void
  onUninstall: () => void
}) {
  const installed = !!game.installDir
  // V2-only: a card is "downloading" if the engine has an active task for it.
  // We re-read the live state inside the panel so it reacts to engine events.
  const v3Tasks = useDownloadEngineStore((s) => s.tasks)
  const downloading = useMemo(() => {
    const t = v3Tasks.find((x) => String(x.appId) === String(game.appId))
    if (!t) return false
    return (
      t.state === 'downloading' ||
      t.state === 'preparing' ||
      t.state === 'connecting' ||
      t.state === 'verifying'
    )
  }, [v3Tasks, game.appId])
  // GoldSrc prereq banner: si el juego seleccionado es un mod de GoldSrc y
  // Half-Life NO está instalado, mostramos un banner explicando que el mod
  // requiere HL1. La instalación se enruta vía createGoldSrcInstall en el
  // install processor cuando el usuario hace clic en Instalar.
  const installedGamesForPrereq = useLibraryStore((s) => s.games)
  const isGoldSrcMod = useMemo(
    () => GOLDSRC_MOD_APP_IDS_UI.has(String(game.appId)),
    [game.appId],
  )
  const hl1Installed = useMemo(
    () => installedGamesForPrereq.some((g) => g.appId === HALF_LIFE_APP_ID_UI),
    [installedGamesForPrereq],
  )
  // También detectamos un task `blocked-prereq` para mostrar el mensaje
  // específico (el prereq ya intentó descargarse y falló).
  const blockedPrereqTask = useMemo(() => {
    if (!isGoldSrcMod) return null
    return v3Tasks.find((t) => String(t.appId) === String(game.appId) && t.state === 'blocked-prereq') ?? null
  }, [v3Tasks, game.appId, isGoldSrcMod])
  const showGoldSrcPrereqBanner = isGoldSrcMod && !installed && (
    !hl1Installed || !!blockedPrereqTask || downloading
  )
  const portraitUrl = `https://cdn.akamai.steamstatic.com/steam/apps/${game.appId}/library_600x900.jpg`
  const lastPlayedStr = game.lastPlayed
    ? new Date(game.lastPlayed * 1000).toLocaleDateString()
    : null
  const playtimeStr = game.playtime ? `${Math.round(game.playtime / 60)} h jugadas` : null
  const locationTail = game.installDir ? game.installDir.split(/[\\/]/).slice(-2).join('/') : null
  const { showToast } = useToastStore()
  const [activeTab, setActiveTab] = useState<PanelTab>('overview')
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [onlinefixEnabled, setOnlinefixEnabled] = useState<boolean | null>(null)
  const [onlinefixBusy, setOnlinefixBusy] = useState(false)
  const [drmStatus, setDrmStatus] = useState<DrmStatus | null>(null)
  const [drmBusy, setDrmBusy] = useState(false)
  const [steamDetails, setSteamDetails] = useState<
    import('../../electron/common/ipc-contract').SteamAppDetails | null
  >(null)
  const [detailsLoading, setDetailsLoading] = useState(false)

  // Latest appId this panel instance is showing. Read via ref (not the
  // `game` closure captured when an async toggle started) so an in-flight
  // OnlineFix/DRM toggle can detect the user switched to a different game
  // before it resolves and discard its result instead of applying it to
  // whatever game is now displayed.
  const currentAppIdRef = useRef(game.appId)
  useEffect(() => {
    currentAppIdRef.current = game.appId
  }, [game.appId])

  useEffect(() => {
    let cancelled = false
    setOnlinefixEnabled(null)
    setDrmStatus(null)
    setOnlinefixBusy(false)
    setDrmBusy(false)
    ;(async () => {
      try {
        const s = await window.steamtools.checkOnlineFixStatus(game.appId)
        if (!cancelled) setOnlinefixEnabled(s?.enabled ?? false)
      } catch {
        if (!cancelled) setOnlinefixEnabled(false)
        showToast('error', 'No se pudo consultar el estado de OnlineFix')
      }
      try {
        const s = await window.steamtools.checkDrmStatus(game.appId)
        const status = s?.status as DrmStatus | undefined
        if (!cancelled) {
          setDrmStatus(
            status === 'no-drm' ||
              status === 'drm-removed' ||
              status === 'drm-present' ||
              status === 'not-found'
              ? status
              : 'not-found',
          )
        }
      } catch {
        if (!cancelled) setDrmStatus('not-found')
        showToast('error', 'No se pudo consultar el estado de DRM')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [game.appId])

  // Fetch Steam Store details (description, devs, genres, release) on game change.
  // The main process caches by appId — no network thrash on re-select.
  useEffect(() => {
    let cancelled = false
    setSteamDetails(null)
    setDetailsLoading(true)
    const gate = (window as any).steamtools?.gateway
    if (!gate || typeof gate.call !== 'function') {
      setDetailsLoading(false)
      return
    }
    gate
      .call('game', 'getSteamDetails', game.appId)
      .then((d: import('../../electron/common/ipc-contract').SteamAppDetails | null) => {
        if (cancelled) return
        setSteamDetails(d || null)
        setDetailsLoading(false)
      })
      .catch(() => {
        if (cancelled) return
        setSteamDetails(null)
        setDetailsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [game.appId])

  const handleOnlineFixToggle = async () => {
    if (onlinefixBusy || onlinefixEnabled === null) return
    const gameIdAtEntry = game.appId
    setOnlinefixBusy(true)
    try {
      const willEnable = !onlinefixEnabled
      const r = onlinefixEnabled
        ? await window.steamtools.disableOnlineFix(gameIdAtEntry)
        : await window.steamtools.enableOnlineFix(gameIdAtEntry)
      // Game switched mid-toggle: drop this result, the new game's useEffect refetches.
      if (gameIdAtEntry !== currentAppIdRef.current) return
      const name = game.name || 'este juego'
      if (r.success) {
        setOnlinefixEnabled(willEnable)
        showToast(
          'success',
          willEnable ? `OnlineFix activado · ${name}` : `OnlineFix desactivado · ${name}`,
        )
      } else {
        showToast(
          'error',
          r?.message ?? (onlinefixEnabled ? 'No se pudo desactivar OnlineFix' : 'No se pudo activar OnlineFix'),
        )
      }
    } catch {
      if (gameIdAtEntry !== currentAppIdRef.current) return
      showToast('error', 'No se pudo cambiar OnlineFix')
    } finally {
      if (gameIdAtEntry === currentAppIdRef.current) setOnlinefixBusy(false)
    }
  }

  const handleRemoveDrm = async () => {
    if (drmBusy || drmStatus !== 'drm-present') return
    const gameIdAtEntry = game.appId
    setDrmBusy(true)
    try {
      const r = await window.steamtools.removeDrm(gameIdAtEntry)
      if (gameIdAtEntry !== currentAppIdRef.current) return
      const name = game.name || 'este juego'
      if (r.success) {
        setDrmStatus('drm-removed')
        showToast('success', `DRM eliminado · ${name}`)
      } else {
        showToast('error', r?.message ?? 'No se pudo eliminar el DRM')
      }
    } catch {
      if (gameIdAtEntry !== currentAppIdRef.current) return
      showToast('error', 'No se pudo eliminar el DRM')
    } finally {
      if (gameIdAtEntry === currentAppIdRef.current) setDrmBusy(false)
    }
  }

  const tabs: { key: PanelTab; label: string }[] = [
    { key: 'overview', label: 'Resumen' },
    { key: 'actions', label: 'Acciones rápidas' },
    { key: 'notes', label: 'Notas' },
  ]

  // Pre-compute a truncated single-line short description for the hero overlay.
  // Steam's short_description is typically <200 chars; truncate + ellipsis so
  // the hero doesn't break on longer copy. Computed once per render, no useMemo needed
  // (stripSteamHtml is O(n) cheap; no expensive parsing to cache).
  const trimmedShort = steamDetails?.short_description
    ? (() => {
        const cleaned = stripSteamHtml(steamDetails.short_description)
        return cleaned.length > 280 ? cleaned.slice(0, 280).trimEnd() + '…' : cleaned
      })()
    : null

  return (
    <div className="flex-1 flex flex-col overflow-y-auto animate-fade-in">
      {/* HERO — Steam-style: full-width hero background, overlay title + giant play button */}
      <section className="flex-shrink-0 relative w-full h-[360px] overflow-hidden">
        {/* Background hero image with gradient overlay (placeholder bg in case CDN fails) */}
        <div className="absolute inset-0 z-0" style={{ background: 'var(--bg-card)' }}>
          <img
            key={game.appId}
            src={`https://cdn.akamai.steamstatic.com/steam/apps/${game.appId}/library_hero.jpg`}
            alt=""
            loading="eager"
            className="w-full h-full object-cover"
            onError={(e) => {
              const img = e.target as HTMLImageElement
              // library_hero.jpg doesn't exist for every appId (older/smaller
              // games) — fall through header.jpg → capsule_616x353.jpg before
              // giving up. The old 2-step chain hid the <img> outright on the
              // second failure, leaving the bare `background: var(--bg-card)`
              // div visible — a flat black/near-black rectangle with nothing
              // in it, which is exactly the "images don't load" symptom.
              if (img.dataset.fallback === undefined) {
                img.dataset.fallback = 'header'
                img.src = `https://cdn.akamai.steamstatic.com/steam/apps/${game.appId}/header.jpg`
              } else if (img.dataset.fallback === 'header') {
                img.dataset.fallback = 'capsule'
                img.src = `https://cdn.akamai.steamstatic.com/steam/apps/${game.appId}/capsule_616x353.jpg`
              } else {
                img.style.display = 'none'
              }
            }}
          />
          {/* Store-style 2-layer gradient: left-dark fade right (text readability on the right side) + bottom-dark fade top (pulled-in feel) */}
          <div className="absolute inset-0" style={{ background: 'linear-gradient(to right, rgba(9,9,11,0.92) 0%, rgba(9,9,11,0.55) 45%, transparent 80%)' }} />
          <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(9,9,11,0.7), transparent 45%)' }} />
        </div>

        <div className="relative z-10 w-full h-full px-10 pb-6 flex flex-col justify-end items-start">
          <div className="flex gap-7 items-end w-full">
            {/* Portrait cover (smaller, store-style accent) */}
            <img
              key={game.appId}
              src={portraitUrl}
              alt=""
              className="w-[160px] flex-shrink-0 rounded-[var(--radius-md)] object-cover shadow-2xl"
              style={{
                aspectRatio: '2/3',
                border: '1px solid rgba(255,255,255,0.1)',
                background: 'rgba(255,255,255,0.04)',
              }}
              onError={(e) => {
                const img = e.target as HTMLImageElement
                if (img.dataset.fallback === undefined) {
                  img.dataset.fallback = 'header'
                  img.src = `https://cdn.akamai.steamstatic.com/steam/apps/${game.appId}/header.jpg`
                } else if (img.dataset.fallback === 'header') {
                  img.dataset.fallback = 'capsule'
                  img.src = `https://cdn.akamai.steamstatic.com/steam/apps/${game.appId}/capsule_616x353.jpg`
                } else {
                  img.style.display = 'none'
                }
              }}
            />

            {/* Title + status + details + giant actions */}
            <div className="flex-1 min-w-0 pb-1">
              <span
                className="inline-block text-[11px] font-bold tracking-[0.1em] uppercase mb-2 px-2.5 py-1 rounded-md backdrop-blur-md"
                style={{
                  color: downloading ? 'var(--accent)' : installed ? '#84cc49' : 'var(--text-dim)',
                  background: downloading
                    ? 'rgba(102,192,244,0.15)'
                    : installed
                      ? 'rgba(91,163,43,0.15)'
                      : 'rgba(255,255,255,0.1)',
                  border: `1px solid ${
                    downloading
                      ? 'rgba(102,192,244,0.3)'
                      : installed
                        ? 'rgba(91,163,43,0.3)'
                        : 'rgba(255,255,255,0.15)'
                  }`,
                }}
              >
                {downloading ? 'Descargando…' : installed ? 'INSTALADO' : 'NO INSTALADO'}
              </span>
              <h1
                className="font-extrabold text-white leading-[1.05] mb-2.5"
                style={{ fontSize: 'clamp(32px, 4vw, 44px)', letterSpacing: '-0.02em', textShadow: '0 4px 20px rgba(0,0,0,0.5)' }}
              >
                {game.name || `App ${game.appId}`}
              </h1>
              {/* Short description (Steam Store API) — Store-style: single line under the title */}
              {trimmedShort && (
                <p
                  className="text-[13.5px] leading-relaxed mb-4 max-w-[640px]"
                  style={{ color: '#d4d4d8', textShadow: '0 2px 8px rgba(0,0,0,0.4)' }}
                >
                  {trimmedShort}
                </p>
              )}
              <p className="text-[13px] flex flex-wrap gap-x-5 gap-y-1 mb-5 text-white/80 drop-shadow-md font-medium">
                <span className="font-mono">AppID {game.appId}</span>
                {game.sizeOnDisk ? <span>{formatBytes(game.sizeOnDisk)}</span> : null}
                {lastPlayedStr ? <span>Última sesión: {lastPlayedStr}</span> : null}
                {playtimeStr ? <span>{playtimeStr}</span> : null}
              </p>

              <div className="flex gap-4 flex-wrap items-center">
                {installed ? (
                  <button
                    onClick={onLaunch}
                    className="flex items-center gap-3 px-10 py-4 rounded-xl text-[18px] font-bold text-white border-none cursor-pointer transition-all hover:scale-105 active:scale-95"
                    style={{
                      background: 'linear-gradient(135deg, var(--green), var(--green-hover))',
                      boxShadow: '0 8px 32px var(--green-glow)',
                    }}
                  >
                    <Play className="w-[24px] h-[24px] fill-current" />
                    {t('library.play')}
                  </button>
                ) : (
                  <button
                    disabled
                    className="flex items-center gap-3 px-10 py-4 rounded-xl text-[18px] font-bold text-white/50 border-none cursor-default backdrop-blur-md"
                    style={{ background: 'rgba(255,255,255,0.1)' }}
                  >
                    <Download className="w-[24px] h-[24px]" />
                    No instalado
                  </button>
                )}
                {/* V2-only: no install-method badge needed; the dl-progress card
                    on the right side reflects V2 engine state live. */}
                <FavoriteButton appId={game.appId} size={22} />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Tab strip (Steam-style: thin underline on active) */}
      <div
        className="flex-shrink-0 flex items-center gap-1 px-10 pt-1"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
      >
        {tabs.map((tab) => {
          const active = activeTab === tab.key
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2.5 text-[12.5px] font-bold uppercase tracking-wider transition-all ${
                active ? 'text-text-bright' : 'text-text-dim hover:text-text-bright'
              }`}
              style={active ? { boxShadow: 'inset 0 -2px 0 var(--accent)' } : undefined}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Tab content */}
      <div className="flex-1 px-10 py-7">
        {showGoldSrcPrereqBanner && (
          <div
            data-section="GoldSrcPrereqBanner"
            className="mb-6 flex items-start gap-3.5 px-5 py-4 rounded-xl animate-fade-in"
            style={{
              background: 'rgba(245, 158, 11, 0.10)',
              border: '1px solid rgba(245, 158, 11, 0.35)',
              boxShadow: '0 4px 16px rgba(245, 158, 11, 0.15)',
            }}
          >
            <AlertTriangle
              className="w-5 h-5 flex-shrink-0 mt-0.5"
              style={{ color: '#f59e0b' }}
              strokeWidth={1.8}
            />
            <div className="flex-1 min-w-0">
              <p className="text-[13.5px] font-bold mb-1" style={{ color: '#fbbf24' }}>
                Requiere Half-Life primero
              </p>
              <p className="text-[12.5px] leading-relaxed" style={{ color: '#d4d4d8' }}>
                {blockedPrereqTask
                  ? `Este mod no se instaló porque Half-Life (appId 70) terminó en estado no exitoso. Vuelve a añadir este juego después de instalar o reinstalar Half-Life.`
                  : downloading
                    ? `Half-Life se está descargando ahora (prerrequisito) y luego descargaremos ${game.name}. Espera a que termine la cola actual.`
                    : `Los mods de GoldSource requieren Half-Life (appId 70) instalado en la misma máquina para poder ejecutarse. Al hacer clic en Instalar, primero descargaremos Half-Life y luego este mod.`}
              </p>
            </div>
          </div>
        )}
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-10">
            <div>
              {/* Description — prioritizes game.description (persisted), falls back to live Steam Store API data, then honest fallback */}
              <h2 className="text-[13px] font-bold uppercase tracking-wider text-text-dim mb-3">Sobre este juego</h2>
              {game.description ? (
                <p className="text-[15px] leading-relaxed whitespace-pre-line" style={{ color: '#d4d4d8' }}>
                  {game.description}
                </p>
              ) : (steamDetails?.about_the_game || steamDetails?.short_description) ? (
                <p className="text-[15px] leading-relaxed whitespace-pre-line" style={{ color: '#d4d4d8' }}>
                  {stripSteamHtml(steamDetails.about_the_game || steamDetails.short_description)}
                </p>
              ) : detailsLoading ? (
                <div className="flex items-center gap-2 text-[14.5px] text-text-dim">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Cargando descripción desde Steam…</span>
                </div>
              ) : (
                <div className="text-[14.5px] leading-relaxed text-text-dim">
                  <p className="italic">No se pudo obtener la descripción de Steam para este juego.</p>
                  {lastPlayedStr && (
                    <p className="mt-2">
                      Última partida: {lastPlayedStr}
                      {playtimeStr ? ` · ${playtimeStr}` : ''}
                    </p>
                  )}
                </div>
              )}
              {/* Developers / publishers / genres / release date from Steam API */}
              {steamDetails && !game.description && (steamDetails.developers?.length || steamDetails.publishers?.length || steamDetails.genres?.length || steamDetails.release_date) && (
                <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-1.5 text-[12.5px]">
                  {steamDetails.developers && steamDetails.developers.length > 0 && (
                    <div>
                      <span className="text-text-dim uppercase tracking-wider text-[11px] font-bold">Desarrollador</span>
                      <div className="text-text-bright mt-0.5">{steamDetails.developers.join(', ')}</div>
                    </div>
                  )}
                  {steamDetails.publishers && steamDetails.publishers.length > 0 && (
                    <div>
                      <span className="text-text-dim uppercase tracking-wider text-[11px] font-bold">Editor</span>
                      <div className="text-text-bright mt-0.5">{steamDetails.publishers.join(', ')}</div>
                    </div>
                  )}
                  {steamDetails.genres && steamDetails.genres.length > 0 && (
                    <div className="col-span-2">
                      <span className="text-text-dim uppercase tracking-wider text-[11px] font-bold">Géneros</span>
                      <div className="text-text-bright mt-0.5">{steamDetails.genres.map((g) => g.description).join(', ')}</div>
                    </div>
                  )}
                  {steamDetails.release_date && !steamDetails.release_date.coming_soon && (
                    <div className="col-span-2">
                      <span className="text-text-dim uppercase tracking-wider text-[11px] font-bold">Lanzamiento</span>
                      <div className="text-text-bright mt-0.5">{steamDetails.release_date.date}</div>
                    </div>
                  )}
                </div>
              )}

              {/* Image gallery — placed BELOW description per user request (well-arranged: hero inline + portrait to the right) */}
              <div className="mt-8">
                <h2 className="text-[13px] font-bold uppercase tracking-wider text-text-dim mb-3">Imágenes</h2>
                <div className="grid grid-cols-[1fr_auto] gap-5 items-start max-w-[900px]">
                  <GalleryImage
                    key={`${game.appId}-hero`}
                    appId={game.appId}
                    fallbackInitial={game.name}
                    variant="library_hero"
                    aspectClass="aspect-[616/353] w-full max-h-[220px]"
                  />
                  <GalleryImage
                    key={`${game.appId}-portrait`}
                    appId={game.appId}
                    fallbackInitial={game.name}
                    variant="library_600x900_2x"
                    aspectClass="aspect-[600/900] w-32 sm:w-36"
                  />
                </div>
              </div>

              {/* Capturas — Steam Store API screenshots (horizontal scroll, like Store's "Ver detalles") */}
              {steamDetails?.screenshots && steamDetails.screenshots.length > 0 && (
                <div className="mt-8">
                  <h3 className="text-[13px] font-bold uppercase tracking-wider text-text-dim mb-3">
                    Capturas de pantalla
                    <span className="ml-2 text-text-muted font-medium normal-case tracking-normal text-[11.5px]">
                      · {steamDetails.screenshots.length}
                    </span>
                  </h3>
                  <div
                    className="flex gap-3 overflow-x-auto pb-3 snap-x snap-mandatory"
                    style={{ scrollbarWidth: 'thin' }}
                  >
                    {steamDetails.screenshots.map((shot, i) => (
                      <button
                        key={shot.id}
                        type="button"
                        onClick={() => setLightboxIndex(i)}
                        className="flex-shrink-0 snap-start group relative rounded-lg overflow-hidden border border-white/[0.06] hover:border-white/20 transition-colors cursor-zoom-in"
                        title="Ver captura en tamaño completo"
                      >
                        <img
                          src={shot.path_thumbnail}
                          alt={`Captura ${shot.id}`}
                          loading="lazy"
                          decoding="async"
                          className="h-32 w-auto object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                          style={{ background: 'rgba(255,255,255,0.04)' }}
                        />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <aside className="flex flex-col gap-0 text-[12.5px]">
              <h2 className="text-[13px] font-bold uppercase tracking-wider text-text-dim mb-2">
                Detalles
              </h2>
              <DetailRow label="AppID" value={game.appId} mono />
              {locationTail ? <DetailRow label="Ubicación" value={locationTail} truncate /> : null}
              {game.sizeOnDisk ? <DetailRow label="Tamaño" value={formatBytes(game.sizeOnDisk)} /> : null}
              {playtimeStr ? <DetailRow label="Tiempo jugado" value={playtimeStr} /> : null}
              {lastPlayedStr ? <DetailRow label="Última sesión" value={lastPlayedStr} /> : null}
              {/* V2-only: install method row removed; every install uses the
                  V2 download engine automatically (see Settings → Account). */}
            </aside>
          </div>
        )}
        {activeTab === 'actions' && (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 max-w-6xl">
            {/* OnlineFix card */}
            <div
              className="rounded-2xl p-6"
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
              }}
            >
              <div className="flex items-start gap-3"><div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <Wifi className="w-6 h-6 flex-shrink-0" style={{ color: onlinefixEnabled ? 'var(--green)' : 'var(--text-dim)' }} />
                    <h3 className="text-[16px] font-bold text-text-bright">OnlineFix</h3>
                    <span
                      className="text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-md"
                      style={{
                        background:
                          onlinefixEnabled === null
                            ? 'rgba(255,255,255,0.06)'
                            : onlinefixEnabled
                              ? 'rgba(74,222,128,0.18)'
                              : 'rgba(255,255,255,0.06)',
                        color:
                          onlinefixEnabled === null
                            ? 'var(--text-dim)'
                            : onlinefixEnabled
                              ? 'var(--green)'
                              : 'var(--text-dim)',
                      }}
                    >
                      {onlinefixEnabled === null ? 'Cargando' : onlinefixEnabled ? 'Activado' : 'Desactivado'}
                    </span>
                  </div>
                  <p className="text-[14px] text-text-dim leading-relaxed mb-4">
                    Activa el modo OnlineFix para este juego. Permite jugar multiplayer sin Steam legítimo. El juego se inicia con el parámetro{' '}
                    <code
                      className="font-mono text-[11px] px-1.5 py-0.5 rounded"
                      style={{ background: 'rgba(255,255,255,0.08)' }}
                    >
                      -onlinefix
                    </code>
                    .
                  </p>
                  <button
                    onClick={handleOnlineFixToggle}
                    disabled={onlinefixEnabled === null || onlinefixBusy}
                    className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-bold transition-all w-full"
                    style={{
                      background:
                        onlinefixEnabled === null
                          ? 'rgba(255,255,255,0.04)'
                          : onlinefixEnabled
                            ? 'rgba(239,68,68,0.15)'
                            : 'var(--accent)',
                      color:
                        onlinefixEnabled === null
                          ? 'var(--text-dim)'
                          : onlinefixEnabled
                            ? '#ef4444'
                            : '#fff',
                      border: onlinefixEnabled ? '1px solid rgba(239,68,68,0.3)' : 'none',
                      cursor:
                        onlinefixEnabled === null
                          ? 'not-allowed'
                          : onlinefixBusy
                            ? 'wait'
                            : 'pointer',
                    }}
                  >
                    {onlinefixBusy && <Loader2 className="w-4 h-4 animate-spin" />}
                    {onlinefixEnabled === null
                      ? 'Verificando…'
                      : onlinefixEnabled
                        ? 'Desactivar OnlineFix'
                        : 'Activar OnlineFix'}
                  </button>
                </div>
              </div>
            </div>

            {/* DRM Remover card */}
            <div
              className="rounded-2xl p-6"
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
              }}
            >
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <Shield className="w-6 h-6 flex-shrink-0" style={{ color: drmStatus === 'drm-removed' ? 'var(--green)' : drmStatus === 'drm-present' ? '#ef4444' : 'var(--text-dim)' }} />
                    <h3 className="text-[16px] font-bold text-text-bright">DRM Remover</h3>
                    <span
                      className="text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-md"
                      style={{
                        background:
                          drmStatus === null
                            ? 'rgba(255,255,255,0.06)'
                            : drmStatus === 'drm-removed'
                              ? 'rgba(74,222,128,0.18)'
                              : drmStatus === 'drm-present'
                                ? 'rgba(239,68,68,0.15)'
                                : 'rgba(255,255,255,0.06)',
                        color:
                          drmStatus === null
                            ? 'var(--text-dim)'
                            : drmStatus === 'drm-removed'
                              ? 'var(--green)'
                              : drmStatus === 'drm-present'
                                ? '#ef4444'
                                : 'var(--text-dim)',
                      }}
                    >
                      {drmStatus === null ? 'Verificando' : DRM_STATUS_LABEL[drmStatus]}
                    </span>
                  </div>
                  <p className="text-[14px] text-text-dim leading-relaxed mb-4">
                    Elimina la protección DRM (Steamworks) del ejecutable. Útil para jugar offline. Modifica tu copia local del juego.
                  </p>
                  <button
                    onClick={handleRemoveDrm}
                    disabled={drmStatus !== 'drm-present' || drmBusy}
                    className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-bold transition-all w-full"
                    style={{
                      background:
                        drmStatus === 'drm-present' && !drmBusy
                          ? 'var(--accent)'
                          : 'rgba(255,255,255,0.04)',
                      color: drmStatus === 'drm-present' ? '#fff' : 'var(--text-dim)',
                      cursor:
                        drmStatus === 'drm-present' && !drmBusy ? 'pointer' : 'not-allowed',
                    }}
                  >
                    {drmBusy && <Loader2 className="w-4 h-4 animate-spin" />}
                    {drmStatus === null && 'Verificando…'}
                    {drmStatus === 'no-drm' && 'No requiere acción'}
                    {drmStatus === 'drm-removed' && 'DRM ya eliminado'}
                    {drmStatus === 'drm-present' && !drmBusy && 'Eliminar DRM ahora'}
                    {drmStatus === 'not-found' && 'Juego no encontrado'}
                  </button>
                </div>
              </div>
            </div>

            {/* Errores frecuentes card */}
            <div
              className="xl:col-span-2 rounded-2xl p-6"
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
              }}
            >
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <Wrench className="w-6 h-6 flex-shrink-0" style={{ color: 'var(--text-dim)' }} />
                    <h3 className="text-[16px] font-bold text-text-bright">Errores frecuentes</h3>
                  </div>
                  <p className="text-[14px] text-text-dim leading-relaxed mb-3">
                    Soluciones rápidas a los errores más comunes al lanzar este juego. Tocá la fila para aplicar la solución.
                  </p>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    {[
                        {
                          key: 'err54',
                          Icon: AlertTriangle,
                          iconStyle: { background: 'rgba(239,68,68,0.15)', color: '#ef4444' },
                          title: 'Error 54',
                          desc: 'CDN inalcanzable · verificá integridad',
                          pillStyle: { background: 'rgba(255,255,255,0.05)', color: 'var(--text-dim)' },
                          pillLabel: 'Verificar archivos',
                          action: () => onVerify(),
                          disabled: false,
                        },
                        {
                          key: 'err3',
                          Icon: AlertTriangle,
                          iconStyle: { background: 'rgba(245,158,11,0.15)', color: '#f59e0b' },
                          title: 'Error 3 / DLL faltante',
                          desc: 'Reinstalá los redistributables de C++',
                          pillStyle: { background: 'rgba(255,255,255,0.05)', color: 'var(--text-dim)' },
                          pillLabel: 'Verificar archivos',
                          action: () => onVerify(),
                          disabled: false,
                        },
                        {
                          key: 'app',
                          Icon: Play,
                          iconStyle: { background: 'rgba(102,192,244,0.18)', color: 'var(--accent)' },
                          title: 'App already running',
                          desc: 'Cerrá Steam primero, después reintentá',
                          pillStyle: { background: 'var(--accent)', color: '#0a0b10' },
                          pillLabel: 'Reintentar',
                          action: () => onLaunch(),
                          disabled: false,
                        },
                        {
                          key: 'drm',
                          Icon: Wifi,
                          iconStyle: {
                            background: onlinefixEnabled ? 'rgba(74,222,128,0.18)' : 'rgba(255,255,255,0.06)',
                            color: onlinefixEnabled ? 'var(--green)' : 'var(--text-dim)',
                          },
                          title: 'DRM / Login failed',
                          desc: onlinefixDesc(onlinefixEnabled),
                          pillStyle: {
                            background: onlinefixEnabled ? 'rgba(255,255,255,0.05)' : 'var(--accent)',
                            color: onlinefixEnabled ? 'var(--text-dim)' : '#0a0b10',
                          },
                          pillLabel: onlinefixEnabled ? 'Desactivar' : 'Activar',
                          action: () => onToggleOnlineFix(),
                          disabled: onlinefixBusy || onlinefixEnabled === null,
                        },
                      ].map((row) => {
                      const Icon = row.Icon
                      return (
                        <button
                          key={row.key}
                          onClick={row.action}
                          disabled={row.disabled}
                          className="w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all hover:bg-white/[0.07] group disabled:opacity-50 disabled:cursor-not-allowed"
                          style={{
                            background: 'rgba(255,255,255,0.025)',
                            border: '1px solid rgba(255,255,255,0.06)',
                          }}
                        >
                          <div
                            className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                            style={row.iconStyle}
                          >
                            <Icon className="w-5 h-5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-[14.5px] font-bold text-text-bright mb-0.5">
                              {row.title}
                            </div>
                            <div className="text-[12.5px] text-text-dim leading-tight line-clamp-2">
                              {row.desc}
                            </div>
                          </div>
                          <div
                            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11.5px] font-bold flex-shrink-0"
                            style={row.pillStyle}
                          >
                            {row.pillLabel}
                          </div>
                          <ChevronRight className="w-4 h-4 text-text-dim group-hover:text-text-bright group-hover:translate-x-0.5 transition-all flex-shrink-0" />
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Quick actions row */}
            <div className="xl:col-span-2 pt-2">
              <h3 className="text-[13px] font-bold uppercase tracking-wider text-text-dim mb-3">
                Acciones rápidas
              </h3>
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 max-w-3xl">
                <ActionButton icon={FolderOpen} label="Abrir carpeta" onClick={onOpenLocation} />
                <ActionButton icon={Wrench} label="Verificar archivos" onClick={onVerify} />
                <ActionButton icon={Wrench} label="Reparar metadatos locales" onClick={onRepair} />
                <ActionButton icon={Trash2} label="Desinstalar" onClick={onUninstall} variant="danger" />
              </div>
            </div>
          </div>
        )}
        {activeTab === 'notes' && (
          <GameNotesPanel appId={game.appId} />
        )}
      </div>

      {/* Screenshot lightbox — in-app, matches GameDetailPage's pattern instead of opening a browser tab */}
      {lightboxIndex !== null && steamDetails?.screenshots && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center"
          style={{ background: 'rgba(5,5,7,0.92)', backdropFilter: 'blur(6px)' }}
          onClick={() => setLightboxIndex(null)}
        >
          <button
            onClick={() => setLightboxIndex(null)}
            className="absolute top-5 right-5 w-[46px] h-[46px] rounded-full flex items-center justify-center cursor-pointer transition-colors"
            style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff' }}
          >
            <X className="w-[22px] h-[22px]" />
          </button>
          {steamDetails.screenshots.length > 1 && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                setLightboxIndex((prev) => (prev! - 1 + steamDetails.screenshots!.length) % steamDetails.screenshots!.length)
              }}
              className="absolute left-5 top-1/2 -translate-y-1/2 w-[52px] h-[52px] rounded-full flex items-center justify-center cursor-pointer transition-colors"
              style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff' }}
            >
              <ChevronLeft className="w-[26px] h-[26px]" />
            </button>
          )}
          <img
            src={steamDetails.screenshots[lightboxIndex].path_full || steamDetails.screenshots[lightboxIndex].path_thumbnail}
            alt=""
            className="max-w-[90%] max-h-[90%] object-contain rounded-xl"
            style={{ boxShadow: '0 24px 80px rgba(0,0,0,0.7)' }}
            onClick={(e) => e.stopPropagation()}
          />
          {steamDetails.screenshots.length > 1 && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                setLightboxIndex((prev) => (prev! + 1) % steamDetails.screenshots!.length)
              }}
              className="absolute right-5 top-1/2 -translate-y-1/2 w-[52px] h-[52px] rounded-full flex items-center justify-center cursor-pointer transition-colors"
              style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff' }}
            >
              <ChevronRight className="w-[26px] h-[26px]" />
            </button>
          )}
          <span className="absolute bottom-6 left-1/2 -translate-x-1/2 text-sm font-mono" style={{ color: '#a1a1aa' }}>
            {lightboxIndex + 1} / {steamDetails.screenshots.length}
          </span>
        </div>
      )}
    </div>
  )
})

const ActionButton = memo(function ActionButton({
  icon: Icon,
  label,
  onClick,
  variant = 'normal',
}: {
  icon: any
  label: string
  onClick: () => void
  variant?: 'normal' | 'danger'
}) {
  const isDanger = variant === 'danger'
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-3 px-5 py-3.5 rounded-xl text-[14.5px] font-semibold transition-all cursor-pointer text-left ${
        isDanger ? 'text-red hover:bg-red/10' : 'text-text-bright hover:bg-white/[0.06]'
      }`}
      style={{
        background: isDanger ? 'rgba(239,68,68,0.06)' : 'rgba(255,255,255,0.04)',
        border: `1px solid ${isDanger ? 'rgba(239,68,68,0.18)' : 'rgba(255,255,255,0.06)'}`,
      }}
    >
      <Icon className="w-5 h-5" />
      <span>{label}</span>
    </button>
  )
})

const DetailRow = memo(function DetailRow({
  label,
  value,
  mono = false,
  truncate = false,
}: {
  label: string
  value: string
  mono?: boolean
  truncate?: boolean
}) {
  return (
    <div className="flex gap-3 py-1.5">
      <span className="text-text-dim flex-shrink-0 w-[110px]">{label}</span>
      <span
        className={`text-text-bright flex-1 ${mono ? 'font-mono' : ''} ${truncate ? 'truncate' : ''}`}
        title={truncate ? value : undefined}
      >
        {value}
      </span>
    </div>
  )
})

// ─── Gallery image (Steam CDN with placeholder fallback) ──────────
const GalleryImage = memo(function GalleryImage({
  appId,
  variant,
  aspectClass,
  fallbackInitial,
}: {
  appId: string
  variant: string
  aspectClass: string
  fallbackInitial?: string
}) {
  // Variant-aware source chain: portrait variants get portrait-first, others get hero-first.
  const isPortrait = variant.startsWith('library_600x900')
  const sources = isPortrait
    ? [
        `https://cdn.akamai.steamstatic.com/steam/apps/${appId}/library_600x900_2x.jpg`,
        `https://cdn.akamai.steamstatic.com/steam/apps/${appId}/library_600x900.jpg`,
        `https://cdn.akamai.steamstatic.com/steam/apps/${appId}/header.jpg`,
        `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/library_600x900.jpg`,
      ]
    : [
        `https://cdn.akamai.steamstatic.com/steam/apps/${appId}/library_hero.jpg`,
        `https://cdn.akamai.steamstatic.com/steam/apps/${appId}/library_600x900_2x.jpg`,
        `https://cdn.akamai.steamstatic.com/steam/apps/${appId}/header.jpg`,
        `https://cdn.akamai.steamstatic.com/steam/apps/${appId}/${variant}.jpg`,
        `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/library_hero.jpg`,
      ]
  const [idx, setIdx] = useState(0)
  const [failed, setFailed] = useState(false)
  // Defensive reset when appId changes — protects against missing `key` prop.
  // MUST stay before any early return to comply with Rules of Hooks.
  useEffect(() => {
    setIdx(0)
    setFailed(false)
  }, [appId])
  if (failed || !appId) {
    // Hooks order is preserved above — this early return only renders JSX, no hooks below.
    const initial = (fallbackInitial || '?').trim().slice(0, 2).toUpperCase()
    return (
      <div
        className={`${aspectClass} rounded-xl border border-white/[0.08] flex items-center justify-center relative overflow-hidden`}
        style={{
          background:
            'linear-gradient(135deg, color-mix(in srgb, var(--green) 12%, transparent) 0%, color-mix(in srgb, var(--accent) 12%, transparent) 50%, rgba(168,85,247,0.10) 100%)',
        }}
      >
        <div className="flex flex-col items-center gap-2">
          <Gamepad2 className="w-10 h-10 text-[var(--accent)]" />
          <span className="text-[14px] font-bold text-text-bright uppercase tracking-wider">
            {initial}
          </span>
        </div>
        <span className="absolute bottom-2 right-3 text-[11px] uppercase tracking-wider text-text-dim font-mono">
          sin imagen
        </span>
      </div>
    )
  }
  return (
    <img
      src={sources[idx]}
      alt=""
      className={`${aspectClass} rounded-xl object-cover border border-white/[0.04]`}
      style={{ background: 'rgba(255,255,255,0.04)' }}
      loading="eager"
      decoding="async"
      onError={() => {
        if (idx < sources.length - 1) setIdx(idx + 1)
        else setFailed(true)
      }}
    />
  )
})

