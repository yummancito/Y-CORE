// ============================================================================
// src/modules/library/library.routes.ts
// ----------------------------------------------------------------------------
// Library routes — proxy the remote host's game library.
// Requires authentication.
// ============================================================================

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { requestHostLibrary } from './library.service.js'

export async function libraryRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', app.authenticate)

  // ── Get host's game library ──
  app.get('/host/:hostId/games', async (request, reply) => {
    const { hostId } = z.object({ hostId: z.string().uuid() }).parse(request.params)

    // Verify the host belongs to this user
    const host = await app.prisma.host.findFirst({
      where: { id: hostId, userId: request.userId! },
    })
    if (!host) {
      reply.notFound('Host no encontrado.')
      return
    }

    const games = await requestHostLibrary(app, hostId, request.userId!)
    reply.send({ games })
  })

  // ── Get host info with game count ──
  app.get('/host/:hostId', async (request, reply) => {
    const { hostId } = z.object({ hostId: z.string().uuid() }).parse(request.params)

    const host = await app.prisma.host.findFirst({
      where: { id: hostId, userId: request.userId! },
      select: {
        id: true,
        name: true,
        os: true,
        version: true,
        status: true,
        gameCount: true,
        capabilities: true,
        lastHeartbeatAt: true,
      },
    })
    if (!host) {
      reply.notFound('Host no encontrado.')
      return
    }
    reply.send({ host })
  })
}
