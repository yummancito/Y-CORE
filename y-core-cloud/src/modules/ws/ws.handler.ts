// ============================================================================
// src/modules/ws/ws.handler.ts
// ----------------------------------------------------------------------------
// WebSocket handler — the core of Remote Play Anywhere.
//
// ARCHITECTURE:
//   Clients (Desktop hosts, Android devices) connect via WebSocket to
//   /ws after authenticating with JWT. They are categorized as:
//
//     - 'host': A Desktop PC registered as a Remote Play host.
//       Identified by hostId. Can receive: launch_request, library_request,
//       signal (from mobile), connection_request (pairing).
//       Can send: launch_response, library_response, signal (to mobile),
//       connection_request (to mobile).
//
//     - 'client': An Android/iOS device. Identified by deviceId.
//       Can send: signal (to host), launch_request, library_request.
//       Can receive: signal (from host), connection_response.
//
//   All messages are JSON with the shape:
//     { type: string, ... }
//
//   Authentication: JWT in the first message or query param token.
//
// PROTOCOL:
//   see docs/PROTOCOL.md for the full specification.
// ============================================================================

import type { FastifyInstance } from 'fastify'
import type { WebSocket as WsSocket } from 'ws'
import { z } from 'zod'

// ── WebSocket message types ──

const wsMessageSchema = z.object({
  type: z.enum([
    // Auth
    'auth',
    // Signaling
    'signal',
    // Host library
    'library_request',
    'library_response',
    // Launch
    'launch_request',
    'launch_response',
    // Connection pairing
    'connection_request',
    'connection_response',
    // Heartbeat / presence
    'heartbeat',
    'heartbeat_ack',
    // Session management
    'session_update',
  ]),
  // Payload varies by type
  token: z.string().optional(),
  targetHostId: z.string().optional(),
  targetDeviceId: z.string().optional(),
  hostId: z.string().optional(),
  deviceId: z.string().optional(),
  requestId: z.string().optional(),
  sessionId: z.string().optional(),
  gameId: z.string().optional(),
  gameName: z.string().optional(),
  signal: z.any().optional(),
  data: z.any().optional(),
  status: z.string().optional(),
  error: z.string().optional(),
  games: z.any().optional(),
  success: z.boolean().optional(),
  accept: z.boolean().optional(),
  rememberDevice: z.boolean().optional(),
  device: z.any().optional(),
})

type WsMessage = z.infer<typeof wsMessageSchema>

// ── Connection types ──

interface WsConnection {
  ws: WsSocket
  userId: string
  role: 'host' | 'client'
  hostId?: string
  deviceId?: string
  isAlive: boolean
  connectedAt: number
}

// ── Heartbeat interval ──
const HEARTBEAT_INTERVAL = 15000 // 15 seconds
const HEARTBEAT_TIMEOUT = 30000 // 30 seconds without heartbeat = disconnect

let heartbeatTimer: ReturnType<typeof setInterval> | null = null

// ── Store active connections ──
const connections = new Map<WsSocket, WsConnection>()

/**
 * Broadcast a message to all WebSocket connections matching a filter.
 */
function broadcast(
  filter: (conn: WsConnection) => boolean,
  message: Record<string, unknown>,
): void {
  const data = JSON.stringify(message)
  for (const [ws, conn] of connections) {
    if (filter(conn) && ws.readyState === 1) { // WebSocket.OPEN
      ws.send(data, { binary: false })
    }
  }
}

/**
 * Send a message to a specific WebSocket connection.
 */
function send(conn: WsConnection, message: Record<string, unknown>): void {
  if (conn.ws.readyState === 1) {
    conn.ws.send(JSON.stringify(message), { binary: false })
  }
}

/**
 * Send an error message to a connection.
 */
function sendError(conn: WsConnection, code: string, message: string): void {
  send(conn, { type: 'error', code, message })
}

/**
 * Send a raw message directly to a WebSocket (no connection context).
 */
function sendRaw(ws: WsSocket, message: Record<string, unknown>): void {
  if (ws.readyState === 1) {
    ws.send(JSON.stringify(message), { binary: false })
  }
}

/**
 * Parse and validate an incoming WebSocket message.
 */
function parseMessage(data: Buffer): WsMessage | null {
  try {
    const parsed = JSON.parse(data.toString())
    const result = wsMessageSchema.safeParse(parsed)
    if (result.success) return result.data
    return null
  } catch {
    return null
  }
}

/**
 * Handle authentication via JWT token.
 */
async function handleAuth(
  app: FastifyInstance,
  ws: WsSocket,
  token: string,
  role?: string,
): Promise<WsConnection | null> {
  try {
    const payload = await app.verifyJwt(token)
    const userId = payload.sub

    // Create connection record
    const conn: WsConnection = {
      ws,
      userId,
      role: (role === 'host' ? 'host' : 'client'),
      isAlive: true,
      connectedAt: Date.now(),
    }

    connections.set(ws, conn)

    // Send auth success
    send(conn, {
      type: 'auth_success',
      userId,
      role: conn.role,
    })

    return conn
  } catch {
    sendRaw(ws, { type: 'auth_error', message: 'Token inválido o expirado.' })
    ws.close(4001, 'Authentication failed')
    return null
  }
}

// ── Message handlers ──

async function handleSignal(
  app: FastifyInstance,
  conn: WsConnection,
  msg: WsMessage,
): Promise<void> {
  const { targetHostId, targetDeviceId, signal } = msg

  if (conn.role === 'client' && targetHostId) {
    // Mobile → Server → Host relay
    broadcast(
      (c) => c.hostId === targetHostId,
      {
        type: 'signal',
        fromDeviceId: conn.deviceId,
        signal,
      },
    )
  } else if (conn.role === 'host' && targetDeviceId) {
    // Host → Server → Mobile relay
    broadcast(
      (c) => c.deviceId === targetDeviceId,
      {
        type: 'signal',
        fromHostId: conn.hostId,
        signal,
      },
    )
  } else {
    sendError(conn, 'INVALID_SIGNAL', 'Se requiere targetHostId o targetDeviceId para signal.')
  }
}

async function handleConnectionRequest(
  app: FastifyInstance,
  conn: WsConnection,
  msg: WsMessage,
): Promise<void> {
  if (conn.role !== 'client' || !msg.hostId) {
    sendError(conn, 'INVALID_REQUEST', 'Solo dispositivos móviles pueden enviar connection_request con hostId.')
    return
  }

  // Check if device is already trusted for this host
  const existingRequest = await app.prisma.connectionRequest.findFirst({
    where: {
      hostId: msg.hostId,
      deviceId: conn.deviceId || 'unknown',
      status: 'PENDING',
    },
  })

  if (existingRequest) {
    send(conn, { type: 'connection_status', status: 'pending', requestId: existingRequest.id })
    return
  }

  // Get device info
  const device = conn.deviceId
    ? await app.prisma.device.findFirst({
        where: { id: conn.deviceId },
        select: { id: true, name: true, platform: true, trusted: true },
      })
    : null

  // If device is trusted, auto-accept
  if (device?.trusted) {
    send(conn, { type: 'connection_status', status: 'accepted', autoAccepted: true })

    // Notify host
    broadcast(
      (c) => c.hostId === msg.hostId,
      {
        type: 'connection_request',
        device: { id: device.id, name: device.name, platform: device.platform, trusted: true },
        requestId: 'auto',
        autoAccepted: true,
      },
    )
    return
  }

  // Create a new connection request
  const expiresAt = new Date(Date.now() + 60000) // 1 minute expiry
  const request = await app.prisma.connectionRequest.create({
    data: {
      hostId: msg.hostId,
      deviceId: conn.deviceId || 'unknown',
      status: 'PENDING',
      expiresAt,
    },
    include: {
      device: { select: { id: true, name: true, platform: true, trusted: true } },
    },
  })

  send(conn, {
    type: 'connection_status',
    status: 'pending',
    requestId: request.id,
  })

  // Notify the host
  broadcast(
    (c) => c.hostId === msg.hostId,
    {
      type: 'connection_request',
      device: request.device,
      requestId: request.id,
      autoAccepted: false,
    },
  )
}

async function handleConnectionResponse(
  app: FastifyInstance,
  conn: WsConnection,
  msg: WsMessage,
): Promise<void> {
  if (conn.role !== 'host' || !msg.requestId) {
    sendError(conn, 'INVALID_RESPONSE', 'Solo hosts pueden responder a connection_request.')
    return
  }

  const request = await app.prisma.connectionRequest.findUnique({
    where: { id: msg.requestId },
    include: { device: true },
  })

  if (!request || request.hostId !== conn.hostId) {
    sendError(conn, 'NOT_FOUND', 'Solicitud no encontrada.')
    return
  }

  if (request.status !== 'PENDING') {
    sendError(conn, 'ALREADY_RESPONDED', 'Esta solicitud ya fue respondida.')
    return
  }

  const accepted = msg.accept === true
  const rememberDevice = msg.rememberDevice === true

  // Update the request
  await app.prisma.connectionRequest.update({
    where: { id: request.id },
    data: {
      status: accepted ? 'ACCEPTED' : 'REJECTED',
      respondedAt: new Date(),
    },
  })

  // If remember device, mark it as trusted
  if (accepted && rememberDevice && request.deviceId !== 'unknown') {
    await app.prisma.device.update({
      where: { id: request.deviceId },
      data: { trusted: true, trustedAt: new Date() },
    })
  }

  // Notify the mobile device
  broadcast(
    (c) => c.deviceId === request.deviceId,
    {
      type: 'connection_response',
      requestId: request.id,
      status: accepted ? 'accepted' : 'rejected',
      rememberDevice,
    },
  )

  if (accepted) {
    send(conn, { type: 'connection_accepted', deviceId: request.deviceId })
  }
}

async function handleLaunchRequest(
  app: FastifyInstance,
  conn: WsConnection,
  msg: WsMessage,
): Promise<void> {
  if (conn.role !== 'client' || !msg.hostId || !msg.gameId) {
    sendError(conn, 'INVALID_REQUEST', 'Solo dispositivos móviles pueden enviar launch_request con hostId y gameId.')
    return
  }

  // Forward to host
  broadcast(
    (c) => c.hostId === msg.hostId,
    {
      type: 'launch_request',
      fromDeviceId: conn.deviceId,
      gameId: msg.gameId,
      gameName: msg.gameName,
    },
  )

  // Notify mobile that launch was requested
  send(conn, { type: 'launch_requested', hostId: msg.hostId, gameId: msg.gameId })
}

async function handleLaunchResponse(
  _app: FastifyInstance,
  conn: WsConnection,
  msg: WsMessage,
): Promise<void> {
  if (conn.role !== 'host') {
    sendError(conn, 'INVALID_RESPONSE', 'Solo hosts pueden responder a launch_request.')
    return
  }

  // Forward to the mobile device
  broadcast(
    (c) => c.deviceId === msg.targetDeviceId,
    {
      type: 'launch_response',
      hostId: conn.hostId,
      sessionId: msg.sessionId,
      success: msg.success ?? false,
      error: msg.error,
    },
  )
}

async function handleLibraryRequest(
  _app: FastifyInstance,
  conn: WsConnection,
  msg: WsMessage,
): Promise<void> {
  if (conn.role !== 'client' || !msg.hostId) {
    sendError(conn, 'INVALID_REQUEST', 'Solo dispositivos móviles pueden solicitar library_request.')
    return
  }

  // Forward to host
  broadcast(
    (c) => c.hostId === msg.hostId,
    {
      type: 'library_request',
      fromDeviceId: conn.deviceId,
    },
  )
}

async function handleLibraryResponse(
  _app: FastifyInstance,
  conn: WsConnection,
  msg: WsMessage,
): Promise<void> {
  if (conn.role !== 'host') {
    sendError(conn, 'INVALID_RESPONSE', 'Solo hosts pueden responder a library_request.')
    return
  }

  // Forward to the mobile device that requested it
  broadcast(
    (c) => c.deviceId === msg.targetDeviceId,
    {
      type: 'library_response',
      hostId: conn.hostId,
      games: msg.games,
    },
  )
}

function handleHeartbeat(
  conn: WsConnection,
  _msg: WsMessage,
): void {
  conn.isAlive = true
  send(conn, { type: 'heartbeat_ack' })
}

// ── Main WebSocket handler ──

export function registerWsHandler(app: FastifyInstance): void {
  app.get('/ws', { websocket: true }, (socket, request) => {
    // Try to get JWT from query params (for WebSocket connections)
    const token = (request.query as Record<string, string>)?.token

    // If no token, send auth required and wait
    if (!token) {
      socket.send(JSON.stringify({ type: 'auth_required' }), { binary: false })
    }

    // Parse the token if provided
    let conn: WsConnection | null = null

    if (token) {
      handleAuth(app, socket, token, (request.query as Record<string, string>)?.role)
        .then((c) => {
          conn = c
          if (c && (request.query as Record<string, string>)?.role === 'host') {
            // Register as host connection
            const hostId = (request.query as Record<string, string>)?.hostId
            if (hostId) {
              c.hostId = hostId
              const existing = app.hostWsClients.get(hostId) || new Set()
              existing.add(socket)
              app.hostWsClients.set(hostId, existing)
            }
          }
          if (c && (request.query as Record<string, string>)?.role === 'client') {
            const deviceId = (request.query as Record<string, string>)?.deviceId
            if (deviceId) {
              c.deviceId = deviceId
            }
          }
        })
        .catch((err: unknown) => {
          app.log.warn({ err }, 'WebSocket initial auth failed')
        })
    }

    // Handle incoming messages
    socket.on('message', async (data: Buffer) => {
      const msg = parseMessage(data)
      if (!msg) {
        sendRaw(socket, { type: 'error', code: 'INVALID_MESSAGE', message: 'Mensaje JSON inválido.' })
        return
      }

      // Handle auth message
      if (msg.type === 'auth') {
        conn = await handleAuth(app, socket, msg.token || '', msg.data?.role)
        if (conn) {
          if (msg.data?.role === 'host' && msg.hostId) {
            conn.hostId = msg.hostId
            const existing = app.hostWsClients.get(msg.hostId) || new Set()
            existing.add(socket)
            app.hostWsClients.set(msg.hostId, existing)
          }
          if (msg.data?.role === 'client' && msg.deviceId) {
            conn.deviceId = msg.deviceId
          }
        }
        return
      }

      // If not authenticated, reject
      if (!conn) {
        sendRaw(socket, { type: 'error', code: 'UNAUTHORIZED', message: 'Debes autenticarte primero.' })
        return
      }

      // Route message by type
      try {
        switch (msg.type) {
          case 'signal':
            await handleSignal(app, conn, msg)
            break
          case 'connection_request':
            await handleConnectionRequest(app, conn, msg)
            break
          case 'connection_response':
            await handleConnectionResponse(app, conn, msg)
            break
          case 'launch_request':
            await handleLaunchRequest(app, conn, msg)
            break
          case 'launch_response':
            await handleLaunchResponse(app, conn, msg)
            break
          case 'library_request':
            await handleLibraryRequest(app, conn, msg)
            break
          case 'library_response':
            await handleLibraryResponse(app, conn, msg)
            break
          case 'heartbeat':
            handleHeartbeat(conn, msg)
            break
          default:
            send(conn, { type: 'error', code: 'UNKNOWN_TYPE', message: `Tipo de mensaje desconocido: ${msg.type}` })
        }
      } catch (err: any) {
        sendError(conn, 'HANDLER_ERROR', err.message || 'Error procesando mensaje.')
      }
    })

    // Handle disconnection
    socket.on('close', () => {
      if (conn) {
        connections.delete(socket)
        if (conn.hostId) {
          const existing = app.hostWsClients.get(conn.hostId)
          if (existing) {
            existing.delete(socket)
            if (existing.size === 0) {
              app.hostWsClients.delete(conn.hostId)
            }
          }
        }
      }
    })

    // Handle errors
    socket.on('error', () => {
      if (conn) {
        connections.delete(socket)
        if (conn.hostId) {
          app.hostWsClients.delete(conn.hostId)
        }
      }
    })
  })

  // ── Heartbeat interval ──
  if (!heartbeatTimer) {
    heartbeatTimer = setInterval(() => {
      const now = Date.now()
      for (const [ws, conn] of connections) {
        if (ws.readyState !== 1) continue
        if (now - conn.connectedAt > HEARTBEAT_TIMEOUT && !conn.isAlive) {
          ws.terminate()
          connections.delete(ws)
          if (conn.hostId) {
            app.hostWsClients.delete(conn.hostId)
            // Mark host as offline
            app.prisma.host.update({
              where: { id: conn.hostId },
              data: { status: 'OFFLINE' },
            }).catch(() => {})
          }
          continue
        }
        conn.isAlive = false
        try {
          ws.send(JSON.stringify({ type: 'ping' }), { binary: false })
        } catch {
          ws.terminate()
          connections.delete(ws)
        }
      }
    }, HEARTBEAT_INTERVAL)
  }
}

export function stopWsHandler(): void {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer)
    heartbeatTimer = null
  }
  for (const [ws] of connections) {
    ws.close(1001, 'Server shutting down')
  }
  connections.clear()
}
