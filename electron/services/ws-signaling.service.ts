// ============================================================================
// electron/services/ws-signaling.service.ts
// ----------------------------------------------------------------------------
// WebSocket Signaling Service — replaces LAN TCP signaling with a WebSocket
// relay through the backend server, enabling Remote Play over the Internet.
//
// ARCHITECTURE:
//   connectWsSignaling(token) → WebSocket(url, token)
//     ├── send → { type: 'offer', data: sdp, targetDeviceId }
//     ├── send → { type: 'answer', data: sdp, targetDeviceId }
//     ├── send → { type: 'ice', data: candidate, targetDeviceId }
//     └── recv → onSignalCallback(signal)
//   Connection requests are handled by presence.service.ts (REST API)
//   disconnectWsSignaling() → close()
// ============================================================================

import WebSocket from 'ws'
import { logger } from '../logger'
import type { WsSignalPayload } from '../common/ipc-contract'

// ── Constants ──────────────────────────────────────────────────────────────

const WS_BASE = (process.env.YCORE_API_URL || 'https://y-core-render-api-rxwd.onrender.com')
  .replace(/^http/, 'ws')
const WS_PATH = '/api/remote-play/signaling'
const RECONNECT_DELAY_MS = 3000
const MAX_RECONNECT_ATTEMPTS = 5

// ── State ──────────────────────────────────────────────────────────────────

let ws: WebSocket | null = null
let reconnectAttempts = 0
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let shouldReconnect = false

// Callback to forward incoming signals to the renderer via IPC
let onSignalCallback: ((signal: WsSignalPayload) => void) | null = null

// ── WebSocket Connection ───────────────────────────────────────────────────

function connectWs(url: string): void {
  if (ws) {
    try { ws.close() } catch {}
    ws = null
  }

  logger.info(`[WsSignaling] Connecting to ${url}`, 'remote-play')

  ws = new WebSocket(url)

  ws.on('open', () => {
    logger.info('[WsSignaling] Connected', 'remote-play')
    reconnectAttempts = 0
  })

  ws.on('message', (data: WebSocket.Data) => {
    try {
      const text = data.toString('utf8')
      const signal: WsSignalPayload = JSON.parse(text)

      if (onSignalCallback) {
        onSignalCallback(signal)
      }
    } catch (err: any) {
      logger.warn(`[WsSignaling] Invalid message: ${err.message}`, 'remote-play')
    }
  })

  ws.on('close', (code: number, reason: string) => {
    logger.info(`[WsSignaling] Disconnected (code=${code})`, 'remote-play')
    ws = null

    if (shouldReconnect && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      reconnectAttempts++
      logger.info(`[WsSignaling] Reconnecting in ${RECONNECT_DELAY_MS}ms (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`, 'remote-play')
      reconnectTimer = setTimeout(() => connectWs(url), RECONNECT_DELAY_MS)
    }
  })

  ws.on('error', (err: Error) => {
    logger.error(`[WsSignaling] Error: ${err.message}`, 'remote-play')
  })
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Connect to the WebSocket signaling channel.
 * @param token - Authentication token for the signaling server
 */
export async function connectWsSignaling(token: string): Promise<void> {
  shouldReconnect = true
  reconnectAttempts = 0
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
  const wsUrl = `${WS_BASE}${WS_PATH}?token=${encodeURIComponent(token)}`
  connectWs(wsUrl)
}

export async function disconnectWsSignaling(): Promise<void> {
  shouldReconnect = false
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
  if (ws) { try { ws.close() } catch {}; ws = null }
  logger.info('[WsSignaling] Disconnected', 'remote-play')
}

export async function sendWsSignal(signal: WsSignalPayload): Promise<void> {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    throw new Error('WebSocket not connected')
  }
  try { ws.send(JSON.stringify(signal)) }
  catch (err: any) { logger.error(`[WsSignaling] Send error: ${err.message}`, 'remote-play'); throw err }
}

export function setOnSignalCallback(
  cb: ((signal: WsSignalPayload) => void) | null,
): void { onSignalCallback = cb }

export function cleanup(): void {
  shouldReconnect = false
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
  if (ws) { try { ws.close() } catch {}; ws = null }
  onSignalCallback = null
}

// ── Service Object ─────────────────────────────────────────────────────────

export const wsSignalingService = {
  async connectWsSignaling(token: string) { return connectWsSignaling(token) },
  async disconnectWsSignaling() { return disconnectWsSignaling() },
  async sendWsSignal(signal: WsSignalPayload) { return sendWsSignal(signal) },
  setOnSignalCallback(cb: ((signal: WsSignalPayload) => void) | null) { setOnSignalCallback(cb) },
  cleanup() { cleanup() },
}
