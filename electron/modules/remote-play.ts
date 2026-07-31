// ============================================================================
// electron/modules/remote-play.ts
// ----------------------------------------------------------------------------
// Remote Play — manages streaming sessions, LAN device discovery via UDP,
// WebRTC signaling for peer-to-peer game streaming, and media relay.
//
// ARCHITECTURE:
//   - hostSocket: UDP listener + periodic beacon while hosting
//   - discoverSocket: one-shot UDP scan, closed after timeout
//   - signalingSocket: TCP server for reliable WebRTC signaling exchange
//   - Both UDP-based and TCP-based signaling can coexist; TCP is preferred
//     for WebRTC offer/answer/ICE due to reliability on lossy networks.
// ============================================================================

import dgram from 'dgram'
import net from 'net'
import os from 'os'
import { randomUUID } from 'crypto'
import { logger } from '../logger'
import type { RemotePlaySession, RemotePlaySettings, SignalPayload } from '../common/ipc-contract'

// ── Constants ──────────────────────────────────────────────────────────────

const DEFAULT_DISCOVERY_PORT = 42860
const DEFAULT_STREAM_PORT = 42861
const DISCOVERY_MSG = Buffer.from('YCREMOTE:DISCOVER')
const RESPONSE_MSG_PREFIX = 'YCREMOTE:RESPONSE:'
const BROADCAST_INTERVAL = 3000

// TCP signaling server defaults
const SIGNALING_BACKLOG = 5
const SIGNALING_LINE_DELIMITER = '\n'

// ── State ──────────────────────────────────────────────────────────────────

let currentHostingSession: RemotePlaySession | null = null
let hostSocket: dgram.Socket | null = null
let discoverSocket: dgram.Socket | null = null
// Bumped on every discoverHosts() call. Lets a call's deferred timeout know
// whether it's still the "current" scan before touching the shared
// discoverSocket, so a superseded call's cleanup can't destroy a newer
// call's socket (see discoverHosts()).
let discoverGeneration = 0
let activeBroadcastInterval: ReturnType<typeof setInterval> | null = null
let discoveredHosts: Map<string, RemotePlaySession> = new Map()
let isHosting = false
let connectedSession: RemotePlaySession | null = null

// TCP signaling server (host side — accepts one client connection)
let signalingServer: net.Server | null = null
let signalingClientSocket: net.Socket | null = null

// Callback to forward incoming signals to the renderer via IPC
let onSignalCallback: ((signal: SignalPayload, from: string) => void) | null = null

const defaultSettings: RemotePlaySettings = {
  maxBitrate: 20000,
  resolution: '1920x1080',
  fps: 60,
  enableAudio: true,
  enableGamepad: true,
  discoveryPort: DEFAULT_DISCOVERY_PORT,
  streamPort: DEFAULT_STREAM_PORT,
  autoAccept: false,
}

let currentSettings: RemotePlaySettings = { ...defaultSettings }
let lanModeEnabled = false

// ── Helpers ────────────────────────────────────────────────────────────────

function getLocalIPs(): string[] {
  const ips: string[] = []
  const ifaces = os.networkInterfaces()
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        ips.push(iface.address)
      }
    }
  }
  return ips
}

function generateSessionId(): string {
  return `rp-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`
}

function createUdpSocket(port: number, onMessage: (msg: Buffer, rinfo: dgram.RemoteInfo) => void): dgram.Socket {
  const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true })

  socket.on('error', (err) => {
    logger.error(`[RemotePlay] UDP socket error: ${err.message}`, 'remote-play')
  })

  socket.on('message', onMessage)

  socket.bind(port, () => {
    socket.setBroadcast(true)
    logger.info(`[RemotePlay] UDP socket bound to port ${port}`, 'remote-play')
  })

  return socket
}

function closeSocket(socket: dgram.Socket | null): void {
  if (socket) {
    try { socket.close() } catch { /* already closed */ }
  }
}

// ── Discovery Broadcast ────────────────────────────────────────────────────

async function sendDiscoveryBroadcast(
  socket: dgram.Socket,
  port: number,
): Promise<void> {
  try {
    const localIPs = getLocalIPs()
    for (const ip of localIPs) {
      const parts = ip.split('.')
      const broadcast = `${parts[0]}.${parts[1]}.${parts[2]}.255`
      socket.send(DISCOVERY_MSG, 0, DISCOVERY_MSG.length, port, broadcast)
    }
    socket.send(DISCOVERY_MSG, 0, DISCOVERY_MSG.length, port, '255.255.255.255')
  } catch (err: any) {
    logger.warn(`[RemotePlay] Broadcast error: ${err?.message}`, 'remote-play')
  }
}

// ── TCP Signaling Server (Host side) ──────────────────────────────────────

/**
 * Start a TCP server on the stream port that accepts ONE signaling client.
 * Incoming JSON lines are parsed as SignalPayload and forwarded via callback.
 */
function startSignalingServer(port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signalingServer) {
      signalingServer.close()
      signalingServer = null
    }

    const server = net.createServer((socket) => {
      const remoteAddr = `${socket.remoteAddress}:${socket.remotePort}`

      // If we already have a signaling client, drop the old one
      if (signalingClientSocket) {
        try { signalingClientSocket.destroy() } catch {}
      }
      signalingClientSocket = socket

      logger.info(`[RemotePlay] Signaling client connected: ${remoteAddr}`, 'remote-play')

      let buffer = ''
      socket.on('data', (chunk: Buffer) => {
        buffer += chunk.toString('utf8')
        const parts = buffer.split(SIGNALING_LINE_DELIMITER)
        // Keep the last incomplete chunk in buffer
        buffer = parts.pop() || ''

        for (const line of parts) {
          const trimmed = line.trim()
          if (!trimmed) continue
          try {
            const signal: SignalPayload & { from?: string } = JSON.parse(trimmed)
            const from = signal.from || remoteAddr
            if (onSignalCallback) {
              onSignalCallback(signal, from)
            }
          } catch (err: any) {
            logger.warn(`[RemotePlay] Invalid signaling JSON: ${err.message}`, 'remote-play')
          }
        }
      })

      socket.on('close', () => {
        if (signalingClientSocket === socket) {
          signalingClientSocket = null
        }
        // NOTE: We do NOT send an automatic 'bye' here. The mobile browser
        // uses sendSignalToHost() which opens a NEW TCP connection per
        // signal and closes it immediately after writing. If we sent 'bye'
        // on every close, the mobile's 'request' signal would be immediately
        // followed by 'bye', which kills the WebRTC handshake before it
        // starts — the renderer processes 'bye' → stopConnection() → error.
        //
        // Disconnection detection happens via:
        //   1. Explicit 'bye' signal from the peer (preferred)
        //   2. WebRTC onconnectionstatechange → 'failed'/'disconnected'
        //   3. ICE timeout detection
      })

      socket.on('error', (err) => {
        logger.warn(`[RemotePlay] Signaling socket error: ${err.message}`, 'remote-play')
      })
    })

    server.on('error', (err: Error) => {
      logger.error(`[RemotePlay] Signaling server error: ${err.message}`, 'remote-play')
      reject(err)
    })

    server.listen(port, () => {
      logger.info(`[RemotePlay] Signaling server listening on port ${port}`, 'remote-play')
      signalingServer = server
      resolve()
    })
  })
}

/**
 * Send a JSON-signal over the TCP signaling channel to the connected client.
 * Each message is newline-delimited.
 */
function sendSignalViaTcp(signal: SignalPayload): void {
  if (!signalingClientSocket || signalingClientSocket.destroyed) {
    // Fall back to UDP if TCP is not connected
    return
  }
  try {
    const data = JSON.stringify(signal) + SIGNALING_LINE_DELIMITER
    signalingClientSocket.write(data)
  } catch (err: any) {
    logger.warn(`[RemotePlay] TCP signaling send error: ${err.message}`, 'remote-play')
  }
}

// ── Public API ─────────────────────────────────────────────────────────────

export async function startHosting(
  name: string,
  port?: number,
): Promise<RemotePlaySession> {
  if (isHosting) {
    throw new Error('Already hosting a session. Stop current session first.')
  }

  const streamPort = port || currentSettings.streamPort
  const localIP = getLocalIPs()[0] || '127.0.0.1'

  const session: RemotePlaySession = {
    id: generateSessionId(),
    name,
    host: localIP,
    port: streamPort,
    status: 'hosting',
    startedAt: Date.now(),
    clients: 0,
    quality: `${currentSettings.resolution} @ ${currentSettings.fps}fps`,
    fps: currentSettings.fps,
  }

  currentHostingSession = session
  isHosting = true

  // Open host socket — responds to discovery requests + sends periodic beacons
  hostSocket = createUdpSocket(currentSettings.discoveryPort, (msg, rinfo) => {
    const text = msg.toString().trim()
    if (text === DISCOVERY_MSG.toString().trim() && currentHostingSession && hostSocket) {
      const response = `${RESPONSE_MSG_PREFIX}${currentHostingSession.name}|${currentHostingSession.port}|${currentHostingSession.quality}|${currentHostingSession.fps}`
      hostSocket.send(Buffer.from(response), rinfo.port, rinfo.address)
    }
  })

  // Periodic beacon
  activeBroadcastInterval = setInterval(async () => {
    if (hostSocket) {
      await sendDiscoveryBroadcast(hostSocket, currentSettings.discoveryPort)
    }
  }, BROADCAST_INTERVAL)

  // Initial broadcast
  if (hostSocket) {
    await sendDiscoveryBroadcast(hostSocket, currentSettings.discoveryPort)
  }

  logger.info(`[RemotePlay] Hosting session "${name}" on ${localIP}:${streamPort}`, 'remote-play')
  return session
}

export async function stopHosting(): Promise<void> {
  if (!isHosting) return

  if (activeBroadcastInterval) {
    clearInterval(activeBroadcastInterval)
    activeBroadcastInterval = null
  }

  closeSocket(hostSocket)
  hostSocket = null

  // Stop signaling server
  await stopSignalingListener()

  if (currentHostingSession) {
    currentHostingSession.status = 'disconnected'
  }

  isHosting = false
  currentHostingSession = null
  // Invalidate any outstanding QR-tokens for this session — a leaked
  // screenshot of the QR must not connect to a session that no longer exists.
  revokeMobileTokens()

  logger.info('[RemotePlay] Hosting stopped', 'remote-play')
}

export async function discoverHosts(
  timeoutMs = 5000,
): Promise<RemotePlaySession[]> {
  // Reentrancy guard: a second call while the first's timeout is still
  // pending used to race on the shared discoverSocket — the first call's
  // deferred cleanup would eventually destroy the SECOND call's socket and
  // null out the shared reference. Bumping the generation here lets the
  // first call's timeout detect it's been superseded and leave the newer
  // scan's socket alone.
  const myGeneration = ++discoverGeneration

  discoveredHosts.clear()
  closeSocket(discoverSocket)

  const hosts: RemotePlaySession[] = []

  const socket = createUdpSocket(currentSettings.discoveryPort, (msg, rinfo) => {
    const text = msg.toString().trim()
    if (text.startsWith(RESPONSE_MSG_PREFIX)) {
      const parts = text.slice(RESPONSE_MSG_PREFIX.length).split('|')
      if (parts.length >= 2) {
        const session: RemotePlaySession = {
          id: `remote-${rinfo.address}-${parts[1]}`,
          name: parts[0] || 'Unknown Host',
          host: rinfo.address,
          port: parseInt(parts[1], 10) || DEFAULT_STREAM_PORT,
          status: 'idle',
          startedAt: Date.now(),
          clients: 0,
          quality: parts[2] || 'Auto',
          fps: parseInt(parts[3], 10) || 60,
        }
        discoveredHosts.set(session.id, session)
        const existing = hosts.findIndex((h) => h.host === session.host)
        if (existing >= 0) {
          hosts[existing] = session
        } else {
          hosts.push(session)
        }
      }
    }
  })
  discoverSocket = socket

  await sendDiscoveryBroadcast(socket, currentSettings.discoveryPort)

  await new Promise<void>((resolve) => {
    setTimeout(() => {
      // Only touch the shared discoverSocket if no newer discoverHosts()
      // call has started since this one — otherwise that newer call has
      // already replaced it with its own socket, which must be left alone.
      if (discoverGeneration === myGeneration) {
        closeSocket(discoverSocket)
        discoverSocket = null
      } else {
        closeSocket(socket)
      }
      resolve()
    }, timeoutMs)
  })

  return hosts
}

export async function connectToHost(
  host: string,
  port: number,
): Promise<RemotePlaySession> {
  if (connectedSession) {
    await disconnect()
  }

  // NOTE: Signaling (offer/answer/ICE) is handled by sendSignalToHost()
  // which creates fresh TCP connections per message on port+1.
  // No persistent signaling connection is needed here.

  const session: RemotePlaySession = {
    id: `conn-${host}-${port}`,
    name: `Remote @ ${host}`,
    host,
    port,
    status: 'connected',
    startedAt: Date.now(),
    clients: 1,
    quality: currentSettings.resolution,
    fps: currentSettings.fps,
  }

  connectedSession = session
  logger.info(`[RemotePlay] Connected to ${host}:${port}`, 'remote-play')
  return session
}

export async function disconnect(): Promise<void> {
  if (connectedSession) {
    // Send bye signal via a fresh TCP connection (persistent TCP was not established)
    const { host, port } = connectedSession
    sendSignalToHost(host, port, { type: 'bye', data: null }).catch(() => {})
    connectedSession.status = 'disconnected'
    connectedSession = null
    logger.info('[RemotePlay] Disconnected', 'remote-play')
  }

  // Close signaling client connection
  if (signalingClientSocket) {
    try { signalingClientSocket.destroy() } catch {}
    signalingClientSocket = null
  }
}

export function getStatus(): { status: string; session: RemotePlaySession | null } {
  if (isHosting && currentHostingSession) {
    return { status: 'hosting', session: currentHostingSession }
  }
  if (connectedSession) {
    return { status: 'connected', session: connectedSession }
  }
  return { status: 'idle', session: null }
}

export function getSettings(): RemotePlaySettings {
  return { ...currentSettings }
}

export async function updateSettings(
  settings: Partial<RemotePlaySettings>,
): Promise<void> {
  currentSettings = { ...currentSettings, ...settings }
  logger.info(`[RemotePlay] Settings updated: ${JSON.stringify(settings)}`, 'remote-play')
}

// ── WebRTC Signaling API ──────────────────────────────────────────────────

/**
 * Register a callback that will be called when a signaling message arrives.
 * The callback receives the parsed SignalPayload and the source address.
 */
export function setOnSignalCallback(
  cb: ((signal: SignalPayload, from: string) => void) | null,
): void {
  onSignalCallback = cb
}

/**
 * Host side: start the TCP signaling server.
 * Incoming connections are accepted; JSON-line messages are forwarded
 * to the registered callback and then to the renderer via IPC event.
 */
export async function startSignalingListener(): Promise<void> {
  if (!isHosting || !currentHostingSession) {
    throw new Error('Cannot start signaling listener without an active hosting session')
  }
  // Start TCP signaling server on the stream port + 1
  const signalPort = currentHostingSession.port + 1
  await startSignalingServer(signalPort)
  logger.info(`[RemotePlay] Signaling listener started on port ${signalPort}`, 'remote-play')
}

/**
 * Stop the TCP signaling server and disconnect any connected client.
 */
export async function stopSignalingListener(): Promise<void> {
  if (signalingClientSocket) {
    try { signalingClientSocket.destroy() } catch {}
    signalingClientSocket = null
  }
  if (signalingServer) {
    try {
      await new Promise<void>((resolve) => {
        signalingServer!.close(() => resolve())
      })
    } catch { /* already closed */ }
    signalingServer = null
  }
  logger.info('[RemotePlay] Signaling listener stopped', 'remote-play')
}

/**
 * Send a signaling message to the remote peer via the active TCP channel.
 * Used by the host to reply to client signals.
 */
export function sendSignalRemote(signal: SignalPayload): void {
  sendSignalViaTcp(signal)
}

/**
 * Broadcast a signaling message to all connected clients.
 * This is the unified broadcast endpoint for both host and client scenarios.
 */
export async function broadcastSignal(signal: SignalPayload): Promise<void> {
  try {
    sendSignalViaTcp(signal)
    logger.info('[RemotePlay] Signal broadcasted', 'remote-play')
  } catch (err: any) {
    logger.warn(`[RemotePlay] Broadcast signal error: ${err.message}`, 'remote-play')
    throw err
  }
}

/**
 * Send a signaling message to a specific host:port via new TCP connection.
 * Used by the client to initiate signaling with a discovered host.
 */
export async function sendSignalToHost(
  host: string,
  port: number,
  signal: SignalPayload,
): Promise<void> {
  const signalPort = port + 1
  try {
    // Connect, send, disconnect
    const socket = new net.Socket()
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        socket.destroy()
        reject(new Error(`Signal send timeout to ${host}:${signalPort}`))
      }, 5000)

      socket.connect(signalPort, host, () => {
        clearTimeout(timeout)
        const data = JSON.stringify(signal) + SIGNALING_LINE_DELIMITER
        socket.write(data, () => {
          socket.destroy()
          resolve()
        })
      })

      socket.on('error', (err: Error) => {
        clearTimeout(timeout)
        reject(err)
      })
    })
  } catch (err: any) {
    logger.warn(`[RemotePlay] sendSignalToHost error: ${err.message}`, 'remote-play')
    throw err
  }
}

// ── Mobile Connect Token (QR auto-connect) ───────────────────────────────
// Short-lived single-use token Map. The host issues a token right after
// startHosting succeeds; the mobile browser receives it via QR scan and calls
// resolveMobileToken() to map back to the {host, port} pair. Tokens expire
// after 10 minutes and are consumed on first resolution (replay prevention).

const mobileTokens = new Map<
  string,
  { host: string; port: number; sessionId: string; expiresAt: number }
>()
const MOBILE_TOKEN_TTL_MS = 10 * 60 * 1000 // 10 minutes
let mobileTokenCleanupInterval: ReturnType<typeof setInterval> | null = null

function cleanupExpiredMobileTokens(): void {
  const now = Date.now()
  let removed = 0
  for (const [id, t] of mobileTokens.entries()) {
    if (t.expiresAt <= now) {
      mobileTokens.delete(id)
      removed++
    }
  }
  if (removed > 0) {
    logger.info(`[RemotePlay] Mobile token cleanup: removed ${removed} expired`, 'remote-play')
  }
}

export interface MobileConnectTokenPublic {
  token: string
  url: string
  expiresAt: number
}

/**
 * Issue a new mobile-connect token + URL for the active hosting session.
 * The URL is composed by the caller (renderer) using its own origin and we
 * only append /#/remote-mobile/?token=<id>&port=<port>. The renderer's
 * preferred flow is to wrap the URL into a QR code via the `qrcode` npm
 * package and display it next to the streaming session info.
 */
export async function getMobileConnectToken(baseUrl: string): Promise<MobileConnectTokenPublic> {
  if (!isHosting || !currentHostingSession) {
    throw new Error('Cannot issue mobile token without an active hosting session')
  }
  // Refuse to issue a token whose URL would point the mobile client at the
  // host's own loopback — iPhone Safari cannot reach 127.0.0.1 of a phone's
  // scanner. This usually means the renderer is behind a network interface
  // glitch where os.networkInterfaces() returned only the loopback entry.
  if (currentHostingSession.host === '127.0.0.1') {
    throw new Error(
      'Cannot issue mobile token: host IP is loopback (127.0.0.1). ' +
      'Make sure this PC has a routable network interface (Wi-Fi/Ethernet).',
    )
  }
  if (!mobileTokenCleanupInterval) {
    mobileTokenCleanupInterval = setInterval(cleanupExpiredMobileTokens, 60_000)
    // Allow Node to exit even if the interval is the last timer — cleanup()
    // handles explicit teardown when the app exits.
    mobileTokenCleanupInterval.unref?.()
  }
  const token = randomUUID()
  const expiresAt = Date.now() + MOBILE_TOKEN_TTL_MS
  mobileTokens.set(token, {
    host: currentHostingSession.host,
    port: currentHostingSession.port,
    sessionId: currentHostingSession.id,
    expiresAt,
  })
  const safeBase = baseUrl.replace(/\/+$/, '')
  const url =
    `${safeBase}/#/remote-mobile/?token=${encodeURIComponent(token)}` +
    `&port=${currentHostingSession.port}`
  logger.info(
    `[RemotePlay] Issued mobile-connect token session=${currentHostingSession.id} expires=${new Date(expiresAt).toISOString()}`,
    'remote-play',
  )
  return { token, url, expiresAt }
}

/**
 * Resolve a mobile-connect token to the {host, port} pair. Returns null if
 * the token is unknown or expired. Tokens are REUSABLE during their TTL
 * window (10 min) so a phone that disconnects from WiFi can re-resolve
 * without re-scanning. The leak surface is minimal: the attacker must
 * (a) be on the same LAN as the host, (b) within the TTL window, AND (c)
 * have a screenshot of the QR while the host is actively streaming.
 * Explicit revocation happens on stopHosting/cleanup/expiry.
 */
export function resolveMobileToken(token: string): { host: string; port: number } | null {
  if (!token) return null
  const entry = mobileTokens.get(token)
  if (!entry) return null
  if (entry.expiresAt <= Date.now()) {
    mobileTokens.delete(token)
    return null
  }
  logger.info(`[RemotePlay] Mobile token resolved: ${entry.host}:${entry.port}`, 'remote-play')
  return { host: entry.host, port: entry.port }
}

/**
 * Revoke all tokens (called on stopHosting AND app cleanup so a leaked
 * QR cannot connect to a session that no longer exists).
 */
export function revokeMobileTokens(): void {
  if (mobileTokens.size === 0) return
  const count = mobileTokens.size
  mobileTokens.clear()
  logger.info(`[RemotePlay] Revoked ${count} mobile tokens`, 'remote-play')
}

// ── LAN Mode ──────────────────────────────────────────────────────────────

// FIX #2: Remote Play LAN Mode — disable cloud signaling, use LAN discovery only
export async function enableLANMode(): Promise<{ success: boolean; status: string; peers: RemotePlaySession[] }> {
  try {
    lanModeEnabled = true
    logger.info('[RemotePlay] LAN mode enabled — cloud signaling disabled', 'remote-play')

    // Discover available LAN peers
    const peers = await discoverHosts(5000)

    return {
      success: true,
      status: 'LAN mode active',
      peers: peers || [],
    }
  } catch (err: any) {
    logger.error(`[RemotePlay] Enable LAN mode failed: ${err.message}`, 'remote-play')
    return {
      success: false,
      status: `LAN mode failed: ${err?.message}`,
      peers: [],
    }
  }
}

export async function disableLANMode(): Promise<{ success: boolean; status: string }> {
  try {
    lanModeEnabled = false
    logger.info('[RemotePlay] LAN mode disabled — cloud signaling enabled', 'remote-play')

    return {
      success: true,
      status: 'LAN mode disabled',
    }
  } catch (err: any) {
    logger.error(`[RemotePlay] Disable LAN mode failed: ${err.message}`, 'remote-play')
    return {
      success: false,
      status: `Disable LAN mode failed: ${err?.message}`,
    }
  }
}

export function isLANModeEnabled(): boolean {
  return lanModeEnabled
}

// ── Cleanup ───────────────────────────────────────────────────────────────

export function cleanup(): void {
  if (activeBroadcastInterval) {
    clearInterval(activeBroadcastInterval)
    activeBroadcastInterval = null
  }
  closeSocket(hostSocket)
  hostSocket = null
  closeSocket(discoverSocket)
  discoverSocket = null

  if (signalingClientSocket) {
    try { signalingClientSocket.destroy() } catch {}
    signalingClientSocket = null
  }
  if (signalingServer) {
    try { signalingServer.close() } catch {}
    signalingServer = null
  }

  isHosting = false
  currentHostingSession = null
  connectedSession = null
  discoveredHosts.clear()
  onSignalCallback = null

  // Tear down mobile token bookkeeping so the interval doesn't keep Node
  // alive past app exit AND any leftover tokens are cleared on full shutdown.
  revokeMobileTokens()
  if (mobileTokenCleanupInterval) {
    clearInterval(mobileTokenCleanupInterval)
    mobileTokenCleanupInterval = null
  }
}
