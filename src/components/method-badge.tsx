// ============================================================================
// src/components/method-badge.tsx
// ----------------------------------------------------------------------------
// V2-only download state pill. Replaces the V1 method-badge that depended on
// `InstallMethod` ('steamcmd'|'steamclient'|'auto'|'steampipe') and
// `SteamCmdState` ('queued'|'downloading'|'complete'|...).
//
// V2 has a single engine so there is no "method" to choose between; the only
// thing worth surfacing on a card is the live download status. This component
// is intentionally minimal: an idle appId hides the badge entirely so cards
// stay clean; an active/failed task shows a colored pill with the V2 state.
// ============================================================================

import type { DownloadState } from '../stores/useDownloadEngineV3Store'

export interface MethodBadgeProps {
  /** V2 engine state for this appId. undefined = no active job, hide badge. */
  liveState?: DownloadState
  size?: 'sm' | 'md'
  onClick?: () => void
  className?: string
  /** Tooltip text. Defaults to a description of the live state. */
  title?: string
}

const ACTIVE_STATES: ReadonlySet<DownloadState> = new Set([
  'connecting', 'preparing', 'downloading', 'verifying',
])

interface Tuple {
  label: string
  classes: string
  title: string
}

function tupleFor(state: DownloadState | undefined): Tuple | null {
  if (!state || state === 'queued' || state === 'paused') return null
  if (state === 'completed') {
    return {
      label: 'Completado',
      classes: 'text-emerald-300 bg-emerald-500/15 border-emerald-500/40',
      title: 'V2: descarga completa',
    }
  }
  if (state === 'failed' || state === 'cancelled') {
    return {
      label: state === 'cancelled' ? 'Cancelado' : 'Falló',
      classes: 'text-red-300 bg-red-500/15 border-red-500/40',
      title: 'V2: descarga falló o fue cancelada',
    }
  }
  if (state === 'stalled') {
    return {
      label: 'Estancado',
      classes: 'text-amber-300 bg-amber-500/15 border-amber-500/40',
      title: 'V2: descarga sin avance (retry en curso)',
    }
  }
  if (ACTIVE_STATES.has(state)) {
    return {
      label: 'Descargando',
      classes: 'text-emerald-300 bg-emerald-500/15 border-emerald-500/40',
      title: 'V2: descarga en curso',
    }
  }
  return null
}

export function MethodBadge({
  liveState,
  size = 'sm',
  onClick,
  className = '',
  title,
}: MethodBadgeProps) {
  const tpl = tupleFor(liveState)
  if (!tpl) return null

  const padding = size === 'md' ? 'px-3 py-1 text-[11px]' : 'px-2.5 py-[3px] text-[10px]'
  const Tag = (onClick ? 'button' : 'span') as 'button' | 'span'
  // Pulse during active states so the user can spot in-progress downloads at a
  // glance. 'stalled' deliberately excluded — stalled should look paused, not
  // jitter around like it's actually moving bytes.
  const pulse = ACTIVE_STATES.has(liveState!) && liveState !== 'stalled' ? 'animate-pulse' : ''

  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      title={title ?? tpl.title}
      className={[
        'inline-flex items-center gap-1 rounded-full border font-semibold tracking-wide uppercase',
        'backdrop-blur-md whitespace-nowrap select-none',
        'transition-transform duration-150',
        padding,
        tpl.classes,
        pulse,
        onClick ? 'cursor-pointer hover:scale-105 active:scale-95' : '',
        className,
      ].join(' ')}
      aria-label={title ?? tpl.title}
    >
      {tpl.label}
    </Tag>
  )
}
