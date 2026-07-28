// ============================================================================
// src/services/remote-play.service.ts
// ----------------------------------------------------------------------------
// Frontend RemotePlayService — wraps Gateway calls for Remote Play.
// ============================================================================

import { BaseService, subscribeToEvent } from './gateway'
import type {
  RemotePlaySession,
  RemotePlaySettings,
  SignalPayload,
} from '../../electron/common/ipc-contract'

class RemotePlayService extends BaseService {
  protected serviceName = 'remotePlay' as const

  async startHosting(name: string, port?: number): Promise<RemotePlaySession> {
    return this.call('startHosting', name, port)
  }

  async stopHosting(): Promise<void> {
    return this.call('stopHosting')
  }

  async discoverHosts(timeoutMs?: number): Promise<RemotePlaySession[]> {
    return this.call('discoverHosts', timeoutMs)
  }

  async connectToHost(host: string, port: number): Promise<RemotePlaySession> {
    return this.call('connectToHost', host, port)
  }

  async disconnect(): Promise<void> {
    return this.call('disconnect')
  }

  async getStatus(): Promise<{ status: string; session: RemotePlaySession | null }> {
    return this.call('getStatus')
  }

  async getSettings(): Promise<RemotePlaySettings> {
    return this.call('getSettings')
  }

  async updateSettings(settings: Partial<RemotePlaySettings>): Promise<void> {
    return this.call('updateSettings', settings)
  }

  // ── Mobile QR Auto-connect (Camino A web client) ──

  /**
   * Issues a one-time (well, reusable within TTL) mobile-connect token for
   * the current hosting session, plus a `http://<lan-ip>:5173/#/remote-mobile?token=…`
   * URL the host page can render as a QR for an iPhone / Android scanner.
   */
  async getMobileConnectToken(
    baseUrl: string,
  ): Promise<{ url: string; token: string; expiresAt: number }> {
    return this.call('getMobileConnectToken', baseUrl)
  }

  /**
   * Resolves a mobile-connect token (issued by `getMobileConnectToken`) into
   * the LAN host + UDP port the browser should target. Returns `null` when
   * the token is unknown, expired, or revoked. Reusable while in TTL.
   */
  async resolveMobileToken(
    token: string,
  ): Promise<{ host: string; port: number } | null> {
    return this.call('resolveMobileToken', token)
  }

  // ── Mobile-initiated game launch (Camino A — Phase 2) ────────────────

  /**
   * Tells the host to (a) start a hosting session if one isn't already
   * running, (b) launch the requested appId via Steam, and (c) trigger the
   * renderer's headless screen-capture listener. Returns the active
   * `RemotePlaySession` so the mobile client knows where to connect.
   *
   * Throws on any failure (no LAN IP, Steam not running, game not
   * installed, capture failed, etc.) — caller should map the error to a
   * user-visible banner.
   */
  async launchFromMobile(
    appId: string,
    options?: { sessionName?: string },
  ): Promise<RemotePlaySession> {
    return this.call('launchFromMobile', appId, options)
  }

  // ── WebRTC Signaling ──

  async sendSignal(host: string, port: number, signal: SignalPayload): Promise<void> {
    return this.call('sendSignal', host, port, signal)
  }

  /**
   * Host-side outbound signal fan-out. Replaces `sendSignal(host, port)` —
   * see `BroadcastSignal` in electron/common/ipc-contract.ts for the long
   * explanation. Routinely used by HostRemotePlayAuto and the LAN HostTab
   * so the SDP offer actually reaches the peer instead of being eaten by a
   * throwaway TCP loopback. Fire-and-forget; resolves when the main process
   * has finished pushing to all reachable transports.
   */
  async broadcastSignal(signal: SignalPayload): Promise<void> {
    return this.call('broadcastSignal', signal)
  }

  async startSignalingListener(): Promise<void> {
    return this.call('startSignalingListener')
  }

  async stopSignalingListener(): Promise<void> {
    return this.call('stopSignalingListener')
  }

  /** Subscribe to remote signaling events. Returns unsubscribe function. */
  onSignal(handler: (signal: SignalPayload & { from: string; port: number }) => void): () => void {
    return subscribeToEvent('remotePlay:signal', handler)
  }

  /**
   * Subscribe to mobile-launched game events. The main process broadcasts
   * `remotePlay:mobileLaunch` to every BrowserWindow right after
   * `launchFromMobile` succeeds in launching the game on the host. The
   * renderer-side `HostRemotePlayAuto` component listens for this and
   * auto-starts capture + signaling so the phone's stream arrives without
   * the desktop user touching Remote Play.
   */
  onMobileLaunch(
    handler: (payload: { appId: string; sessionId: string }) => void,
  ): () => void {
    return subscribeToEvent('remotePlay:mobileLaunch', handler)
  }
}

export const remotePlayService = new RemotePlayService()
