// ============================================================================
// electron/services/cloud-signaling.service.ts
// ----------------------------------------------------------------------------
// Cloud Signaling Service — connects the Desktop to Y-Core Cloud via WebSocket.
//
// This replaces the old ws-signaling.service.ts (which pointed to the old
// render API's /api/remote-play/signaling endpoint). The new service connects
// to y-core-cloud's /ws endpoint with JWT auth and handles:
//
//   - WebRTC signaling relay (offer/answer/ICE) via signal messages
//   - Library requests from mobile (library_request → library_response)
//   - Launch requests from mobile (launch_request → launch_response)
//   - Heartbeat (server-side, handled by the cloud)
//   - Auto-reconnect on connection loss
// ============================================================================

import WebSocket from 'ws'
import { logger } from '../logger'
import { getGameService } from '../modules/game-helpers'
import type { WsSignalPayload } from '../common/ipc-contract'
import type { InputCommand } from './input-injection.service'

// ── Constants ──────────────────────────────────────────────────────────────

// Y-Core Cloud server URL (configurable via env)
const YCORE_CLOUD_URL = process.env.YCORE_CLOUD_URL || 'http://localhost:3001'
const WS_URL = YCORE_CLOUD_URL.replace(/^http/, 'ws') + '/ws'
const RECONNECT_DELAY_MS = 3000
const MAX_RECONNECT_ATTEMPTS = 10

// ── State ──────────────────────────────────────────────────────────────────

let ws: WebSocket | null = null
let reconnectAttempts = 0
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let shouldReconnect = false
let authToken: string | null = null
let hostId: string | null = null

// Callbacks
let onSignalCallback: ((signal: WsSignalPayload) => void) | null = null
let onConnectionRequestCallback: ((request: any) => void) | null = null
let onInputCommandCallback: ((command: any) => void) | null = null

// ── WebSocket Connection ───────────────────────────────────────────────────

function connectWs(): void {
  if (ws) {
    try { ws.close() } catch {}
    ws = null
  }

  // Build URL with query params for auth (used by y-core-cloud)
  const params = new URLSearchParams()
  if (authToken) params.set('token', authToken)
  if (hostId) params.set('hostId', hostId)
  params.set('role', 'host')

  const url = `${WS_URL}?${params.toString()}`
  logger.info(`[CloudSignaling] Connecting to ${WS_URL}`, 'remote-play')

  ws = new WebSocket(url)

  ws.on('open', () => {
    logger.info('[CloudSignaling] Connected to Y-Core Cloud', 'remote-play')
    reconnectAttempts = 0

    // If we have a token but didn't include it in URL, send auth message
    if (authToken && !url.includes('token=')) {
      ws!.send(JSON.stringify({
        type: 'auth',
        token: authToken,
        data: { role: 'host' },
        hostId,
      }), { binary: false })
    }
  })

  ws.on('message', (data: WebSocket.Data) => {
    try {
      const text = data.toString('utf8')
      const msg = JSON.parse(text)

      // Route message by type
      switch (msg.type) {
        case 'auth_success':
          logger.info('[CloudSignaling] Authenticated successfully', 'remote-play')
          break

        case 'auth_error':
          logger.error(`[CloudSignaling] Auth failed: ${msg.message}`, 'remote-play')
          shouldReconnect = false
          break

        case 'auth_required':
          // Server requires auth — send our token
          if (authToken && ws?.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              type: 'auth',
              token: authToken,
              data: { role: 'host' },
              hostId,
            }), { binary: false })
          }
          break

        case 'ping':
          // Respond with heartbeat
          if (ws?.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'heartbeat' }), { binary: false })
          }
          break

        case 'heartbeat_ack':
          // Server acknowledged heartbeat — nothing to do
          break

        case 'signal': {
          // The Android app's InputSender wraps remote-input events (gamepad
          // button, keyboard key, touch, mouse) inside a 'signal' envelope
          // with signal.type === 'input' — the same envelope used for WebRTC
          // offer/answer/ICE. Route those to the input-injection path instead
          // of the WebRTC signal handler, which only understands
          // offer/answer/ice/bye/request and would otherwise silently drop
          // them (no matching case), leaving the phone's controls dead even
          // though video streams fine.
          const inner = msg.signal
          if (inner && inner.type === 'input') {
            const command = mapMobileInputSignal(inner.data)
            if (command && onInputCommandCallback) {
              onInputCommandCallback(command)
            } else if (!command) {
              logger.warn(`[CloudSignaling] Unrecognized input signal: ${JSON.stringify(inner.data)}`, 'remote-play')
            }
            break
          }

          // WebRTC signaling relay (from mobile)
          if (onSignalCallback) {
            onSignalCallback(msg as WsSignalPayload)
          }
          break
        }

        case 'connection_request': {
          // Pairing request from mobile
          if (onConnectionRequestCallback) {
            onConnectionRequestCallback(msg)
          }
          break
        }

        case 'launch_request': {
          // Mobile wants to launch a game on this PC
          handleLaunchRequest(msg)
          break
        }

        case 'library_request': {
          // Mobile wants our game library
          handleLibraryRequest(msg)
          break
        }

        case 'connection_response': {
          // Acknowledgment of our connection response
          break
        }

        case 'input': {
          // Remote input from mobile (gamepad, keyboard, mouse, touch)
          if (onInputCommandCallback) {
            onInputCommandCallback(msg)
          }
          break
        }

        default:
          logger.warn(`[CloudSignaling] Unknown message type: ${msg.type}`, 'remote-play')
      }
    } catch (err: any) {
      logger.warn(`[CloudSignaling] Invalid message: ${err.message}`, 'remote-play')
    }
  })

  ws.on('close', (code: number, reason: Buffer) => {
    const reasonStr = reason ? reason.toString() : ''
    logger.info(`[CloudSignaling] Disconnected (code=${code} reason=${reasonStr})`, 'remote-play')
    ws = null

    if (shouldReconnect && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      reconnectAttempts++
      const delay = RECONNECT_DELAY_MS * Math.min(reconnectAttempts, 5) // exponential backoff, max 15s
      logger.info(`[CloudSignaling] Reconnecting in ${delay}ms (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`, 'remote-play')
      reconnectTimer = setTimeout(() => connectWs(), delay)
    }
  })

  ws.on('error', (err: Error) => {
    logger.error(`[CloudSignaling] Connection error: ${err.message}`, 'remote-play')
  })
}

// ── Mobile input signal → InputCommand mapping ────────────────────────────
// The Android app's InputSender (y-core-android/app/.../controls/InputSender.kt)
// sends { kind, ... } payloads that don't match InputInjectionService's
// InputCommand shape ({ type, data }) 1:1 — kind→type, and a couple of
// fields need translation (touch action codes, mouse "click" semantics).
// Unrecognized/malformed payloads return null so the caller can log and
// drop them instead of injecting garbage input.
export function mapMobileInputSignal(data: any): InputCommand | null {
  if (!data || typeof data !== 'object') return null
  const kind = data.kind

  switch (kind) {
    case 'gamepad':
      // Button press: { button, pressed }. Axis (thumbstick/trigger) isn't
      // wired to a UI control yet (VirtualGamepad.kt only renders buttons),
      // but the field names already line up with GamepadData so pass it
      // through in case a future stick control starts using it.
      if (typeof data.button === 'string') {
        return { type: 'gamepad', data: { button: data.button, pressed: !!data.pressed, value: data.value } }
      }
      return null

    case 'keyboard':
      if (typeof data.key === 'string') {
        return { type: 'keyboard', data: { key: data.key, pressed: !!data.pressed } }
      }
      return null

    case 'touch': {
      // Android sends numeric action codes (0=down, 1=up, 2=move) per
      // InputSender.sendTouch's doc comment; InputCommand's TouchData wants
      // the string enum win32-input.ts actually switches on.
      const actionMap: Record<number, 'down' | 'move' | 'up'> = { 0: 'down', 1: 'up', 2: 'move' }
      const action = actionMap[data.action]
      if (!action || typeof data.x !== 'number' || typeof data.y !== 'number') return null
      return { type: 'touch', data: { x: data.x, y: data.y, action, id: data.pointerId } }
    }

    case 'mouse':
      if (data.action === 'move' && typeof data.x === 'number' && typeof data.y === 'number') {
        // sendMouseMove sends absolute coordinates, not relative deltas.
        return { type: 'mouse', data: { action: 'absolute', dx: data.x, dy: data.y } }
      }
      // sendMouseClick has no equivalent in MouseData's action union
      // ('move'|'button'|'wheel'|'absolute') — a real click needs a
      // button-down followed by a button-up. KNOWN LIMITATION: this only
      // emits the down half (mapMobileInputSignal returns one InputCommand
      // per call) — nothing currently calls sendMouseClick from the Android
      // UI (VirtualGamepad.kt only wires gamepad buttons), so this is wired
      // for forward-compat but needs InputSender to send explicit down/up
      // signals (like sendGamepadButton does) before a mouse-tap control
      // ships, otherwise the button will appear stuck down.
      if (data.action === 'click' && typeof data.button === 'string') {
        return { type: 'mouse', data: { action: 'button', button: data.button, pressed: true } }
      }
      return null

    default:
      return null
  }
}

// ── Message Handlers ───────────────────────────────────────────────────────

async function handleLibraryRequest(msg: any): Promise<void> {
  logger.info('[CloudSignaling] Library request received from mobile', 'remote-play')

  try {
    // Get installed games from the game service
    const gameService = await getGameService()
    const result = await gameService.listInstalled()

    const games = (result.games || []).map((g: any) => ({
      appId: g.appId,
      name: g.name || 'Unknown',
      installDir: g.installDir || '',
      sizeOnDisk: g.sizeOnDisk || 0,
      lastPlayed: g.lastPlayed || null,
      playTime: g.playTime || 0,
      headerImage: g.headerImage || null,
      isInstalled: true,
    }))

    sendToCloud({
      type: 'library_response',
      targetDeviceId: msg.fromDeviceId,
      hostId,
      games,
    })
  } catch (err: any) {
    logger.error(`[CloudSignaling] Library request failed: ${err.message}`, 'remote-play')
    sendToCloud({
      type: 'library_response',
      targetDeviceId: msg.fromDeviceId,
      hostId,
      games: [],
      error: err.message,
    })
  }
}

async function handleLaunchRequest(msg: any): Promise<void> {
  const { gameId, gameName, fromDeviceId } = msg
  logger.info(`[CloudSignaling] Launch request: ${gameName} (${gameId}) from ${fromDeviceId}`, 'remote-play')

  try {
    const gameService = await getGameService()
    const result = await gameService.launchGame(gameId)

    const sessionId = `session-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`

    sendToCloud({
      type: 'launch_response',
      targetDeviceId: fromDeviceId,
      hostId,
      sessionId,
      success: result.success,
      error: result.error,
    })
  } catch (err: any) {
    logger.error(`[CloudSignaling] Launch failed: ${err.message}`, 'remote-play')
    sendToCloud({
      type: 'launch_response',
      targetDeviceId: fromDeviceId,
      hostId,
      sessionId: '',
      success: false,
      error: err.message,
    })
  }
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Connect to the Y-Core Cloud WebSocket server.
 * @param token - JWT access token for authentication
 * @param hostUuid - The host UUID registered via POST /api/hosts/register
 */
export async function connectToCloud(token: string, hostUuid: string): Promise<void> {
  shouldReconnect = true
  reconnectAttempts = 0
  authToken = token
  hostId = hostUuid

  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }

  connectWs()
}

/**
 * Disconnect from the Y-Core Cloud WebSocket server.
 */
export async function disconnectFromCloud(): Promise<void> {
  shouldReconnect = false
  authToken = null
  hostId = null

  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }

  if (ws) {
    try { ws.close(1000, 'Client shutting down') } catch {}
    ws = null
  }

  logger.info('[CloudSignaling] Disconnected from Y-Core Cloud', 'remote-play')
}

/**
 * Send a signaling message to the cloud (which relays to the mobile client).
 */
export async function sendToCloud(message: Record<string, unknown>): Promise<void> {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    throw new Error('Cloud WebSocket not connected')
  }
  try {
    ws.send(JSON.stringify(message), { binary: false })
  } catch (err: any) {
    logger.error(`[CloudSignaling] Send error: ${err.message}`, 'remote-play')
    throw err
  }
}

/**
 * Send a WebRTC signaling message to a specific mobile device via cloud relay.
 */
export async function sendCloudSignal(signal: WsSignalPayload): Promise<void> {
  await sendToCloud({
    type: 'signal',
    targetDeviceId: signal.targetDeviceId,
    signal: { type: signal.type, data: signal.data },
  })
}

export function setOnSignalCallback(
  cb: ((signal: WsSignalPayload) => void) | null,
): void {
  onSignalCallback = cb
}

export function setOnConnectionRequestCallback(
  cb: ((request: any) => void) | null,
): void {
  onConnectionRequestCallback = cb
}

export function setOnInputCommandCallback(
  cb: ((command: any) => void) | null,
): void {
  onInputCommandCallback = cb
}

export function isConnected(): boolean {
  return ws !== null && ws.readyState === WebSocket.OPEN
}

export function cleanup(): void {
  shouldReconnect = false
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
  if (ws) {
    try { ws.close() } catch {}
    ws = null
  }
  authToken = null
  hostId = null
  onSignalCallback = null
  onConnectionRequestCallback = null
  onInputCommandCallback = null
}

// ── Service Object ─────────────────────────────────────────────────────────

export const cloudSignalingService = {
  async connectToCloud(token: string, hostUuid: string) { return connectToCloud(token, hostUuid) },
  async disconnectFromCloud() { return disconnectFromCloud() },
  async sendToCloud(message: Record<string, unknown>) { return sendToCloud(message) },
  async sendCloudSignal(signal: WsSignalPayload) { return sendCloudSignal(signal) },
  setOnSignalCallback(cb: ((signal: WsSignalPayload) => void) | null) { setOnSignalCallback(cb) },
  setOnConnectionRequestCallback(cb: ((request: any) => void) | null) { setOnConnectionRequestCallback(cb) },
  setOnInputCommandCallback(cb: ((command: any) => void) | null) { setOnInputCommandCallback(cb) },
  isConnected() { return isConnected() },
  cleanup() { cleanup() },
}
