// src/components/method-badge.tsx
//
// Pequeño chip reutilizable que refleja installMethod + state activo del job.
// Se monta en 2 superfícies:
//   - LibraryPage cards (top-right del cover image).
//   - GameDetailPage header (junto al Install button).
//
// Variantes:
//   • method="steamcmd"   + state=idle        → "SteamCMD"     green
//   • method="steamcmd"   + state=active/stalled → stale "Descargando"/"Estancado" amber
//   • method="steamcmd"   + state=complete    → "Completado"   muted green
//   • method="steamcmd"   + state=failed      → "Falló"        red
//   • method="steamclient" → "Steam"          blue
//   • method="auto"      → "Auto"            neutral
//
// Estilado con Tailwind + tokens del proyecto (--accent, surface-1, etc).
//
// El botón es clickeable y emite onClick — el caller decide qué hacer
// (normalmente navega a /downloads). Por defecto es no-op.

import { t } from '../lib/i18n'
import type { InstallMethod } from '../stores/useSettingsStore'
import type { SteamCmdState } from '../stores/useSteamCmdJobsStore'

export interface MethodBadgeProps {
  method: InstallMethod
  /** Estado del job SteamCMD si hay uno activo. Sin active job: undefined. */
  liveState?: SteamCmdState
  size?: 'sm' | 'md'
  onClick?: () => void
  className?: string
  /** Tip para hover accesible (describe el método). */
  title?: string
}

type Tuple = { label: string; classes: string; title: string }

function tupleFor(
  method: InstallMethod,
  liveState: SteamCmdState | undefined,
  explicitTitle?: string
): Tuple {
  if (liveState === 'stalled') {
    return {
      label: t('installDock.pill.stalled'),
      classes: 'text-amber-300 bg-amber-500/15 border-amber-500/40',
      title: explicitTitle ?? t('installDock.pill.stalledTip'),
    }
  }
  if (liveState === 'failed') {
    return {
      label: t('installDock.pill.failed'),
      classes: 'text-red-300 bg-red-500/15 border-red-500/40',
      title: explicitTitle ?? t('installDock.pill.failedTip'),
    }
  }
  if (liveState === 'complete') {
    return {
      label: t('installDock.pill.complete'),
      classes: 'text-emerald-300 bg-emerald-500/15 border-emerald-500/40',
      title: explicitTitle ?? t('installDock.pill.completeTip'),
    }
  }
  if (liveState === 'downloading' || liveState === 'verifying' || liveState === 'preallocating' ||
      liveState === 'allocating' || liveState === 'preparing') {
    return {
      label: t('installDock.pill.downloading'),
      classes: 'text-emerald-300 bg-emerald-500/15 border-emerald-500/40',
      title: explicitTitle ?? t('installDock.pill.downloadingTip'),
    }
  }

  switch (method) {
    case 'steamcmd':
      return {
        label: 'SteamCMD',
        classes: 'text-emerald-300 bg-emerald-500/15 border-emerald-500/40',
        title: explicitTitle ?? t('installDock.badge.steamcmdTip'),
      }
    case 'steamclient':
      return {
        label: 'Steam',
        classes: 'text-sky-300 bg-sky-500/15 border-sky-500/40',
        title: explicitTitle ?? t('installDock.badge.steamclientTip'),
      }
    case 'auto':
    default:
      return {
        label: t('installDock.badge.auto'),
        classes: 'text-text-secondary bg-white/[0.06] border-white/[0.10]',
        title: explicitTitle ?? t('installDock.badge.autoTip'),
      }
  }
}

export function MethodBadge({
  method,
  liveState,
  size = 'sm',
  onClick,
  className = '',
  title,
}: MethodBadgeProps) {
  const tpl = tupleFor(method, liveState, title)
  const padding = size === 'md' ? 'px-3 py-1 text-[11px]' : 'px-2.5 py-[3px] text-[10px]'
  const Tag = (onClick ? 'button' : 'span') as 'button' | 'span'
  // Pulse cuando hay un job activo en uno de los estados de descarga real.
  // Excluimos 'stalled' deliberadamente: stalled+jittering se confunde con
  // "trabajando" cuando en realidad el job está parado. Para stalled usamos
  // el color ámbar del pill, que ya comunica claramente el problema.
  const pulse = liveState === 'downloading' || liveState === 'verifying' ||
    liveState === 'preallocating' || liveState === 'allocating'
      ? 'animate-pulse'
      : ''

  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      title={tpl.title}
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
      aria-label={tpl.title}
    >
      {tpl.label}
    </Tag>
  )
}
