// ============================================================================
// src/modules/launch/launch.service.ts
// ----------------------------------------------------------------------------
// Launch service — send game launch commands to PC hosts via WebSocket relay.
// ============================================================================

import type { FastifyInstance } from 'fastify'
import type { WebSocket } from 'ws'

export interface LaunchResult {
  success: boolean
  sessionId: string
  error?: string
}

/**
 * Send a launch command to a host via WebSocket relay.
 * The host will start the game and begin streaming.
 */
export async function requestLaunch(
  app: FastifyInstance,
  hostId: string,
  _userId: string,
  gameId: string,
  gameName: string,
  timeoutMs = 15000,
): Promise<LaunchResult> {
  const hostSockets = app.hostWsClients.get(hostId)
  if (!hostSockets || hostSockets.size === 0) {
    throw Object.assign(new Error('El host no está conectado o está offline.'), { statusCode: 503 })
  }

  const socket: WebSocket | undefined = hostSockets.values().next().value
  if (!socket) {
    throw Object.assign(new Error('El host no está conectado o está offline.'), { statusCode: 503 })
  }

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(Object.assign(new Error('El host no respondió a la solicitud de lanzamiento.'), { statusCode: 504 }))
    }, timeoutMs)

    const messageHandler = (data: Buffer, isBinary: boolean) => {
      try {
        if (isBinary) return
        const msg = JSON.parse(data.toString())
        if (msg.type === 'launch_response') {
          clearTimeout(timer)
          socket.off('message', messageHandler)
          resolve({
            success: msg.success,
            sessionId: msg.sessionId,
            error: msg.error,
          })
        }
      } catch {
        // Ignore malformed messages
      }
    }

    socket.on('message', messageHandler)

    // Create the session record immediately
    app.prisma.activeSession.create({
      data: {
        hostId,
        gameId,
        gameName,
        status: 'LAUNCHING',
      },
    }).catch(() => {})

    socket.send(JSON.stringify({
      type: 'launch_request',
      gameId,
      gameName,
    }), { binary: false })
  })
}

/**
 * Create a session record in the database.
 */
export async function createSession(
  app: FastifyInstance,
  hostId: string,
  gameId: string,
  gameName: string,
  deviceId?: string,
) {
  return app.prisma.activeSession.create({
    data: {
      hostId,
      deviceId,
      gameId,
      gameName,
      status: 'STREAMING',
    },
  })
}

/**
 * End an active session.
 */
export async function endSession(
  app: FastifyInstance,
  sessionId: string,
) {
  return app.prisma.activeSession.update({
    where: { id: sessionId },
    data: {
      status: 'ENDED',
      endedAt: new Date(),
    },
  })
}
