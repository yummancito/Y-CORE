// ============================================================================
// src/components/remote-play/ConnectionRequestModal.tsx
// ----------------------------------------------------------------------------
// Modal dialog shown when a remote device requests to connect via WAN.
// Displays device info and provides Accept / Reject / Remember actions.
// ============================================================================

import { useState } from 'react'
import {
  Smartphone,
  Monitor,
  Globe,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ShieldCheck,
} from 'lucide-react'
import type { ConnectionRequest } from '../../../electron/common/ipc-contract'

interface ConnectionRequestModalProps {
  request: ConnectionRequest
  onAccept: (requestId: string, rememberDevice: boolean) => void
  onReject: (requestId: string) => void
  processing?: boolean
}

function DeviceIcon({ platform }: { platform: string }) {
  switch (platform) {
    case 'android':
    case 'ios':
      return <Smartphone className="w-10 h-10" />
    default:
      return <Monitor className="w-10 h-10" />
  }
}

export default function ConnectionRequestModal({
  request,
  onAccept,
  onReject,
  processing,
}: ConnectionRequestModalProps) {
  const [rememberDevice, setRememberDevice] = useState(false)

  const deviceName = request.device?.name || 'Unknown Device'
  const platform = request.device?.platform || 'unknown'
  const isTrusted = request.device?.trusted || false

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div
        className="relative w-full max-w-md mx-4 rounded-2xl border border-white/[0.08] shadow-2xl overflow-hidden"
        style={{ background: 'var(--bg-card)' }}
      >
        {/* Gradient header */}
        <div className="h-2" style={{ background: 'linear-gradient(90deg, var(--accent), var(--accent-hover))' }} />

        <div className="p-6 space-y-5">
          {/* Device info */}
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center flex-shrink-0">
              <DeviceIcon platform={platform} />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-bold text-text-bright truncate">
                {deviceName}
              </h3>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[11px] font-medium capitalize text-text-secondary">
                  {platform}
                </span>
                {isTrusted && (
                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-green-500/10 text-green-400">
                    <ShieldCheck className="w-2.5 h-2.5" />
                    Trusted
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Connection info */}
          <div className="rounded-xl p-4 bg-white/[0.03] border border-white/[0.06] space-y-3">
            <div className="flex items-start gap-3">
              <Globe className="w-4 h-4 text-accent mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-text-bright">Remote Connection Request</p>
                <p className="text-xs text-text-dim mt-0.5">
                  This device wants to connect to your PC and stream games.
                </p>
              </div>
            </div>

            {!isTrusted && (
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-4 h-4 text-yellow-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-xs text-text-dim">
                    New device — verify on first connection.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Remember device toggle */}
          <label className="flex items-center gap-3 cursor-pointer group">
            <div
              className={`relative w-10 h-6 rounded-full transition-colors flex-shrink-0 ${
                rememberDevice ? 'bg-accent' : 'bg-white/[0.1]'
              }`}
            >
              <div
                className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                  rememberDevice ? 'translate-x-[18px]' : 'translate-x-0.5'
                }`}
              />
              <input
                type="checkbox"
                checked={rememberDevice}
                onChange={(e) => setRememberDevice(e.target.checked)}
                className="absolute inset-0 opacity-0 cursor-pointer"
              />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-text-bright group-hover:text-accent transition-colors">
                Remember this device
              </p>
              <p className="text-xs text-text-dim mt-0.5">
                Auto-accept future connections from {deviceName}
              </p>
            </div>
          </label>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              onClick={() => onReject(request.id)}
              disabled={processing}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-bold text-white bg-white/[0.08] hover:bg-white/[0.12] border border-white/[0.08] transition-all disabled:opacity-50"
            >
              <XCircle className="w-4 h-4" />
              Reject
            </button>
            <button
              onClick={() => onAccept(request.id, rememberDevice)}
              disabled={processing}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-bold text-white transition-all hover:brightness-110 disabled:opacity-50"
              style={{ background: 'var(--accent)' }}
            >
              {processing ? (
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <CheckCircle2 className="w-4 h-4" />
              )}
              Accept
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
