// ============================================================================
// src/components/icons/YCoreIcons.tsx
// ----------------------------------------------------------------------------
// Custom SVG icon set for Y-Core. Replaces @fluentui/react-icons (Microsoft).
// Each icon uses currentColor for theme support, 2px stroke, round caps/joins.
// ViewBox: 20x20 for consistency.
// ============================================================================

import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement> & { className?: string }

function createIcon(children: React.ReactNode): React.FC<IconProps> {
  return ({ className, ...props }) => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      width={20}
      height={20}
      {...props}
    >
      {children}
    </svg>
  )
}

// ── Library / Games ─────────────────────────────────────────────────────────
// A shelf with game cases standing side by side.
// Simple, recognizable: like looking at your game collection.
export const YcLibrary = createIcon(
  <>
    <path d="M2 4h16" />
    <path d="M2 16h16" />
    <rect x="3" y="5" width="4" height="10" rx=".5" />
    <rect x="8" y="5" width="4" height="10" rx=".5" />
    <rect x="13" y="5" width="4" height="10" rx=".5" />
  </>
)

// ── Store / Shop ────────────────────────────────────────────────────────────
// Shopping bag with a distinct handle. The handle angles form a subtle 'Y'.
// Clean, recognizable silhouette — you know it's a store instantly.
export const YcStore = createIcon(
  <>
    <path d="M4 7a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7Z" />
    <path d="M7 6V4.5a2.5 2.5 0 0 1 5 0V6" />
    <path d="M5 10h10" />
  </>
)

// ── Downloads / Arrow ───────────────────────────────────────────────────────
// Downward arrow with a tray-like base
export const YcDownload = createIcon(
  <>
    <path d="M10 3v9" />
    <path d="m6 8 4 4 4-4" />
    <path d="M4 15v1a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-1" />
  </>
)

// ── Settings / Gear ─────────────────────────────────────────────────────────
// Stylized gear/cog — simplified to 6 spokes
export const YcSettings = createIcon(
  <>
    <circle cx="10" cy="10" r="2.5" />
    <path d="M10 1.5V4" />
    <path d="M10 16v2.5" />
    <path d="M4.2 4.2l1.8 1.8" />
    <path d="M14 14l1.8 1.8" />
    <path d="M1.5 10H4" />
    <path d="M16 10h2.5" />
    <path d="M4.2 15.8l1.8-1.8" />
    <path d="M14 6l1.8-1.8" />
  </>
)

// ── Add Game / Plus ─────────────────────────────────────────────────────────
// Square with a plus
export const YcAddGame = createIcon(
  <>
    <rect x="3" y="3" width="14" height="14" rx="2" />
    <path d="M10 7v6" />
    <path d="M7 10h6" />
  </>
)

// ── Online Fix / Signal ─────────────────────────────────────────────────────
// Three ascending arcs — signal/broadcast icon
export const YcOnlineFix = createIcon(
  <>
    <path d="M5 12a6 6 0 0 1 10 0" />
    <path d="M7 15a3 3 0 0 1 6 0" />
    <circle cx="10" cy="17" r=".8" />
  </>
)

// ── DRM Remover / Shield ────────────────────────────────────────────────────
// Shield with a checkmark
export const YcDrmRemover = createIcon(
  <>
    <path d="M4 3.5 10 1l6 2.5v5.5a7 7 0 0 1-6 6.5 7 7 0 0 1-6-6.5V3.5Z" />
    <path d="m7 9 2 2 4-4" />
  </>
)

// ── Logs / Document ─────────────────────────────────────────────────────────
// Document with text lines
export const YcLogs = createIcon(
  <>
    <path d="M5 2h6l4 4v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1Z" />
    <path d="M11 2v4h4" />
    <path d="M7 9h6" />
    <path d="M7 12h6" />
    <path d="M7 15h4" />
  </>
)

// ── Gamepad (Quick Launch) ──────────────────────────────────────────────────
// Simplified gamepad/controller
export const YcGamepad = createIcon(
  <>
    <rect x="2" y="6" width="16" height="9" rx="3" />
    <path d="M8 10.5h4" />
    <path d="M10 8.5v4" />
    <circle cx="4.5" cy="10.5" r=".5" />
    <circle cx="15.5" cy="10.5" r=".5" />
  </>
)

// ── Users / Community ───────────────────────────────────────────────────────
// Two people silhouettes
export const YcUsers = createIcon(
  <>
    <circle cx="7" cy="6" r="2.5" />
    <circle cx="14" cy="6" r="2.5" />
    <path d="M2 17c0-2.8 2.2-5 5-5" />
    <path d="M7 12c2.8 0 5 2.2 5 5" />
    <path d="M14 12c2.8 0 5 2.2 5 5" />
  </>
)

// ── Search ─────────────────────────────────────────────────────────────────
export const YcSearch = createIcon(
  <>
    <circle cx="8.5" cy="8.5" r="4.5" />
    <path d="M12 12l4 4" />
  </>
)

// ── Play / Launch ──────────────────────────────────────────────────────────
export const YcPlay = createIcon(
  <>
    <circle cx="10" cy="10" r="8" />
    <path d="m8 6 6 4-6 4V6Z" />
  </>
)

// ── Heart / Favorite ───────────────────────────────────────────────────────
export const YcHeart = createIcon(
  <>
    <path d="M10 17s-7-4-7-8.2c0-2.1 1.7-3.8 3.8-3.8 1.3 0 2.4.6 3.2 1.6a4 4 0 0 1 3.2-1.6c2.1 0 3.8 1.7 3.8 3.8 0 4.2-7 8.2-7 8.2Z" />
  </>
)

// ── Chevron Right ─────────────────────────────────────────────────────────
export const YcChevronRight = createIcon(
  <>
    <path d="m7 4 6 6-6 6" />
  </>
)

// ── Close / X ─────────────────────────────────────────────────────────────
export const YcClose = createIcon(
  <>
    <path d="M5 5l10 10" />
    <path d="M15 5 5 15" />
  </>
)

// ── Full icon set map for easy access ───────────────────────────────────────

export const YC_ICONS = {
  library: YcLibrary,
  store: YcStore,
  download: YcDownload,
  settings: YcSettings,
  addGame: YcAddGame,
  onlineFix: YcOnlineFix,
  drmRemover: YcDrmRemover,
  logs: YcLogs,
  gamepad: YcGamepad,
  users: YcUsers,
  search: YcSearch,
  play: YcPlay,
  heart: YcHeart,
  chevronRight: YcChevronRight,
  close: YcClose,
} as const

export type YcIconName = keyof typeof YC_ICONS
