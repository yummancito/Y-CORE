// ============================================================================
// src/modules/library/library.service.ts
// ----------------------------------------------------------------------------
// Library service — proxies requests to the PC host via WebSocket.
// The mobile device requests the host's game library, and we relay
// the request to the PC's WebSocket connection.
// ============================================================================

import type { FastifyInstance } from 'fastify'
import type { WebSocket } from 'ws'

export interface LibraryGameEntry {
  appId: string
  name: string
  installDir: string
  sizeOnDisk: number
  lastPlayed: number | null
  playTime: number
  headerImage: string | null
  isInstalled: boolean
}

/**
 * Request a host's game library via WebSocket relay.
 * Sends a message to the host's WebSocket connection and waits for response.
 */
export async function requestHostLibrary(
  app: FastifyInstance,
  hostId: string,
  _userId: string,
  timeoutMs = 10000,
): Promise<LibraryGameEntry[]> {
  const hostSockets = app.hostWsClients.get(hostId)
  if (!hostSockets || hostSockets.size === 0) {
    throw Object.assign(new Error('El host no está conectado o está offline.'), { statusCode: 503 })
  }

  // Send request to the first available host WebSocket
  const socket: WebSocket | undefined = hostSockets.values().next().value
  if (!socket) {
    throw Object.assign(new Error('El host no está conectado o está offline.'), { statusCode: 503 })
  }

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(Object.assign(new Error('El host no respondió a tiempo.'), { statusCode: 504 }))
    }, timeoutMs)

    // One-time listener for the library response
    const messageHandler = (data: Buffer, isBinary: boolean) => {
      try {
        if (isBinary) return
        const msg = JSON.parse(data.toString())
        if (msg.type === 'library_response') {
          clearTimeout(timer)
          socket.off('message', messageHandler)
          resolve(msg.games as LibraryGameEntry[])
        }
      } catch {
        // Ignore malformed messages
      }
    }

    socket.on('message', messageHandler)
    socket.send(JSON.stringify({ type: 'library_request' }), { binary: false })
  })
}
