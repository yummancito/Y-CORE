// ============================================================================
// electron/services/remote-play.service.ts
// ----------------------------------------------------------------------------
// RemotePlayService — wraps remote-play module + presence + ws signaling
// + cloud signaling for the Service Registry.
// ============================================================================

import { BrowserWindow } from 'electron'
import * as remotePlay from '../modules/remote-play'
import { logger } from '../logger'
import * as presence from './presence.service'
import * as wsSignaling from './ws-signaling.service'
import * as cloudSignaling from './cloud-signaling.service'
import { gameService } from './game.service'
import type {
  SignalPayload,
  WsSignalPayload,
  HostRegistration,
  RemotePlaySession,
} from '../common/ipc-contract'
import { HOST_RENDERER_FROM } from '../common/ipc-contract'

// Mobile-WS-bridge broadcaster. main.ts wires this to
// broadcastBrowserEvent('remotePlay:signal', ...) once the BrowserBridge
// WS server is up. Stored as a module-level slot because the service is
// imported by electron/main.ts before BrowserBridge is constructed, so the
// wiring happens later. `setMobileBridgeBroadcaster` warns on overwrite
// (HMR / repeated registration) to keep regressions visible.
let mobileBridgeBroadcaster: ((event: string, data: object) => void) | null = null

export const remotePlayService = {
  // ── LAN Remote Play ──
  async startHosting(name: string, port?: number) { return remotePlay.startHosting(name, port) },
  async stopHosting() { return remotePlay.stopHosting() },
  async discoverHosts(timeoutMs?: number) { return remotePlay.discoverHosts(timeoutMs) },
  async connectToHost(host: string, port: number) { return remotePlay.connectToHost(host, port) },
  async disconnect() { return remotePlay.disconnect() },
  async getStatus() { return remotePlay.getStatus() },
  async getSettings() { return remotePlay.getSettings() },
  async updateSettings(settings: Record<string, unknown>) { return remotePlay.updateSettings(settings as any) },

  // ── LAN Signaling ──
  async sendSignal(host: string, port: number, signal: SignalPayload) { return remotePlay.sendSignalToHost(host, port, signal) },
  async startSignalingListener() { return remotePlay.startSignalingListener() },
  async stopSignalingListener() { return remotePlay.stopSignalingListener() },
  setOnSignalCallback(cb: ((signal: SignalPayload, from: string) => void) | null) { remotePlay.setOnSignalCallback(cb) },
  sendSignalRemote(signal: SignalPayload) { remotePlay.sendSignalRemote(signal) },

  /**
   * Setter for the mobile-WS-bridge broadcaster. main.ts wires this to
   * `broadcastBrowserEvent('remotePlay:signal', ...)` once the BrowserBridge
   * WS server is up. We keep the wiring here (not at module load) because
   * the service may be imported before BrowserBridge is constructed.
   *
   * Warn-on-overwrite: HMR / test re-runs / a second `whenReady()`
   * registration could swap the callback without anyone noticing — mobile
   * signals would silently stop reaching WS clients until the next
   * service restart. The warn makes the regression visible in ycore.log
   * the first time it happens.
   */
  setMobileBridgeBroadcaster(cb: ((event: string, data: object) => void) | null) {
    if (mobileBridgeBroadcaster && mobileBridgeBroadcaster !== cb) {
      logger.warn(
        '[RemotePlay] setMobileBridgeBroadcaster: overwriting existing broadcaster — ' +
        'previous subscribers will no longer receive broadcasts. ' +
        'This usually means main.ts was invoked twice or HMR re-loaded the module.',
        'remote-play',
      )
    }
    mobileBridgeBroadcaster = cb
  },

  // ── Multiplexed signal outbound (Camino A fix) ────────────────────────────
  // See the broadcastSignal doc in electron/common/ipc-contract.ts for the
  // full "why" — short version: sendSignal(host, port) opens a throwaway
  // TCP, destroying the existing LAN/mobile signalingClientSocket in the
  // process. broadcasting to LAN + WS bridge + IPC in parallel routes the
  // offer/answer/ICE to whichever peer transport is actually live.
  async broadcastSignal(signal: SignalPayload): Promise<void> {
    // (1) Live LAN TCP peer (peer desktop opened a persistent connection
    //     to this host's streamPort+1 signalingServer). sendSignalRemote
    //     is a no-op when signalingClientSocket is null/destroyed, which
    //     is fine — there simply is no LAN peer to forward to in that case.
    try {
      remotePlay.sendSignalRemote(signal)
    } catch (err: any) {
      logger.warn(
        `[RemotePlay] broadcastSignal: sendSignalRemote failed (LAN TCP): ${err?.message ?? err}`,
        'remote-play',
      )
    }

    // (2) Mobile browser subscribed via BrowserBridge WS :42863. Routed
    //     through the broadcaster that main.ts installed via
    //     setMobileBridgeBroadcaster. Idempotent wrt subscribers — the
    //     browser-bridge only fans out to clients that have sent a
    //     {type:'subscribe', event:'remotePlay:signal'} frame.
    // eslint-disable-next-line no-console
    if (signal.type === 'offer' || signal.type === 'answer') {
      console.log(`[trace] broadcastSignal: type=${signal.type}, sending to WS bridge (broadcaster=${!!mobileBridgeBroadcaster})`)
    }
    try {
      if (mobileBridgeBroadcaster) {
        mobileBridgeBroadcaster('remotePlay:signal', { ...signal, from: HOST_RENDERER_FROM })
      } else {
        if (signal.type === 'offer' || signal.type === 'answer') {
          console.warn('[trace] broadcastSignal: mobileBridgeBroadcaster is NULL — WS clients will NOT receive this signal!')
        }
      }
    } catch (err: any) {
      logger.warn(
        `[RemotePlay] broadcastSignal: mobileBridgeBroadcaster failed: ${err?.message ?? err}`,
        'remote-play',
      )
    }

    // (3) Every BrowserWindow — secondary renderer windows (login, splash,
    //     devtools-open-tab-with-renderer, multi-monitor layouts) and any
    //     OTHER desktop instance pick up the signal too. Wrapped in the
    //     same defensive try/catch as launchFromMobile's broadcast because
    //     a "client destroyed" race shouldn't take the whole chain down.
    try {
      if (typeof BrowserWindow?.getAllWindows === 'function') {
        for (const win of BrowserWindow.getAllWindows()) {
          try {
            win.webContents.send('remotePlay:signal', { ...signal, from: HOST_RENDERER_FROM })
          } catch (perWinErr: any) {
            logger.warn(
              `[RemotePlay] broadcastSignal: window notify failed: ${perWinErr?.message ?? perWinErr}`,
              'remote-play',
            )
          }
        }
      } else {
        logger.warn(
          '[RemotePlay] broadcastSignal: BrowserWindow.getAllWindows unavailable — skipping IPC fanout',
          'remote-play',
        )
      }
    } catch (broadcastErr: any) {
      logger.warn(
        `[RemotePlay] broadcastSignal: outer try/catch swallowed: ${broadcastErr?.message ?? broadcastErr}`,
        'remote-play',
      )
    }
  },

  // ── QR mobile-connect tokens ───────────────────────────────────────────
  // Host issues a token after startHosting resolves; mobile browser calls
  // resolveMobileToken via gateway.call to map the URL back to {host, port}.
  // Single-use, 10-minute TTL.
  async getMobileConnectToken(baseUrl: string) { return remotePlay.getMobileConnectToken(baseUrl) },
  resolveMobileToken(token: string) { return remotePlay.resolveMobileToken(token) },

  // ── Mobile-initiated game launch ──────────────────────────────────────
  // Single-tap "Play from phone" flow:
  //   1. Start hosting if not already (creates session with LAN IP)
  //   2. START the TCP SIGNALING listener so the mobile client's 'request'
  //      signal has a server to connect to. Without this, sendSignalToHost()
  //      gets ECONNREFUSED and the WebRTC handshake never starts.
  //   3. Launch the requested appId via Y-core's native launcher (gameService.launchGame → removeGameDrm → patchGameFolder → spawn)
  //   4. Tell every BrowserWindow to start capturing screen + listen for
  //      mobile clients (Renderer subscribes via `remotePlay:mobileLaunch` IPC
  //      and triggers the existing capture-then-WebRTC flow). The mobile
  //      client gets the session info back, sends a WebRTC REQUEST, the host
  //      answers with an OFFER, and the stream flows.
  //   5. Return the active session so the mobile client can navigate to its
  //      /play route.
  //
  // Why all-in-one: the renderer-side screen capture normally needs a user
  // gesture (Chrome's `getDisplayMedia` picker). The renderer's
  // HostRemotePlayAuto component uses Electron's `desktopCapturer` +
  // `chromeMediaSource` constraint trick to bypass the picker; this service
  // method is the host-side companion that gets the capture stream ready.
  //
  // Throws if not hosting (after `startHosting`), so callers can show a
  // friendly error like "Couldn't reach your PC — make sure Y-Core is open".
  async launchFromMobile(appId: string, options: { sessionName?: string } = {}): Promise<RemotePlaySession> {
    // Use the session returned directly from startHosting instead of a
    // post-await getStatus() round-trip — fewer TOCTOU surprises if
    // startHosting is ever made concurrent-safe, and one less IPC hop.
    let sess: RemotePlaySession
    const existing = remotePlay.getStatus().session
    if (existing) {
      sess = existing
    } else {
      sess = await remotePlay.startHosting(options.sessionName || 'Y-Core Mobile')
    }
    if (!sess?.host) {
      throw new Error('Failed to start hosting session — no LAN IP available')
    }

    // CRITICAL: Start the TCP signaling listener so the mobile's WebRTC
    // 'request' signal has somewhere to go. Without this, sendSignalToHost()
    // opens a TCP connection to port 42862 where nothing is listening →
    // ECONNREFUSED → the host never receives 'request' → no offer is ever
    // created → the mobile stays on "Cargando..." forever with a black screen.
    // Idempotent: startSignalingListener() closes any existing server before
    // creating a new one, so calling it unconditionally is safe — it's a no-op
    // in terms of resource leaks, and the brief close+reopen is transparent
    // because signaling connections are one-shot TCP (connect → write → destroy).
    try {
      await remotePlay.startSignalingListener()
    } catch (sigErr: any) {
      logger.warn(
        `[RemotePlay] launchFromMobile: startSignalingListener failed: ${sigErr?.message ?? sigErr}`,
        'remote-play',
      )
      // Non-fatal: if the listener is already running on this port,
      // the mobile's signals will still be received. Carry on.
    }

    const launch = await gameService.launchGame(String(appId))
    if (!launch?.success) {
      throw new Error(launch?.error || `Failed to launch game ${appId} on host`)
    }

    // Broadcast to every BrowserWindow so the renderer's auto-capture
    // listener can pick it up regardless of which window is focused.
    // Wrapped in a defensive try/catch because "is not defined" ReferenceErrors
    // inside the loop have been the symptom of a few subtle bugs (Vite HMR
    // not repicking up remote-play.service.ts changes, missing import after
    // a rebase, sandboxed renderer in some Electron builds, etc.) and the
    // broadcast MUST NOT take down the whole launchFromMobile flow that already
    // brought up hosting + launched the game on the player's PC. If the
    // broadcast fails, the mobile client has the session in hand and can keep
    // trying — the desktop side will simply need to be refreshed by the user.
    try {
      if (typeof BrowserWindow?.getAllWindows === 'function') {
        for (const win of BrowserWindow.getAllWindows()) {
          try {
            win.webContents.send('remotePlay:mobileLaunch', { appId, sessionId: sess.id })
          } catch (perWinErr: any) {
            logger.warn(
              `[RemotePlay] launchFromMobile: window broadcast failed (win may be mid-teardown): ${perWinErr?.message ?? perWinErr}`,
              'remote-play',
            )
          }
        }
      } else {
        logger.warn(
          '[RemotePlay] launchFromMobile: BrowserWindow.getAllWindows unavailable — skipping renderer broadcast. Mobile client still has the session.',
          'remote-play',
        )
      }
      // Also broadcast to the WS bridge so the mobile client receives
      // signaling events directly even if auto-capture hasn't started yet.
      try {
        mobileBridgeBroadcaster?.('remotePlay:signal', {
          type: 'system',
          data: { event: 'sessionReady', sessionId: sess.id },
          from: 'host-system',
        })
      } catch {}
    } catch (broadcastErr: any) {
      logger.warn(
        `[RemotePlay] launchFromMobile: outer broadcast try/catch swallowed: ${broadcastErr?.message ?? broadcastErr}`,
        'remote-play',
      )
    }
    return sess
  },

  // ── Presence (WAN Registration) ──
  async registerHost(name: string, username?: string): Promise<HostRegistration> { return presence.registerHost(name, username) },
  async unregisterHost() { return presence.unregisterHost() },
  async sendHeartbeat() { return presence.sendHeartbeat() },
  async getPendingRequests() { return presence.getPendingRequests() },
  async respondToRequest(requestId: string, accept: boolean, rememberDevice?: boolean) { return presence.respondToRequest(requestId, accept, rememberDevice) },
  async getTrustedDevices() { return presence.getTrustedDevices() },
  async removeTrustedDevice(deviceId: string) { return presence.removeTrustedDevice(deviceId) },
  setOnConnectionRequestCallback(cb: any) { presence.setOnConnectionRequestCallback(cb) },

  // ── WebSocket Signaling (WAN via old API) ──
  async connectWsSignaling(token: string) { return wsSignaling.connectWsSignaling(token) },
  async disconnectWsSignaling() { return wsSignaling.disconnectWsSignaling() },
  async sendWsSignal(signal: WsSignalPayload) { return wsSignaling.sendWsSignal(signal) },
  setOnWsSignalCallback(cb: any) { wsSignaling.setOnSignalCallback(cb) },

  // ── Y-Core Cloud Signaling (new) ──
  async connectToCloud(token: string, hostUuid: string) { return cloudSignaling.connectToCloud(token, hostUuid) },
  async disconnectFromCloud() { return cloudSignaling.disconnectFromCloud() },
  async sendCloudSignal(signal: WsSignalPayload) { return cloudSignaling.sendCloudSignal(signal) },
  isCloudConnected() { return cloudSignaling.isConnected() },
  setOnCloudSignalCallback(cb: ((signal: WsSignalPayload) => void) | null) { cloudSignaling.setOnSignalCallback(cb) },
  setOnCloudConnectionRequestCallback(cb: ((request: any) => void) | null) { cloudSignaling.setOnConnectionRequestCallback(cb) },
}
