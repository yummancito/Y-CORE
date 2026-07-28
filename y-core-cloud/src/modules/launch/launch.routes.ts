// ============================================================================
// src/modules/launch/launch.routes.ts
// ----------------------------------------------------------------------------
// Launch routes — request game launch on a remote PC.
// Requires authentication.
// ============================================================================

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { requestLaunch } from './launch.service.js'

const launchSchema = z.object({
  gameId: z.string().min(1, 'gameId requerido.'),
  gameName: z.string().min(1, 'gameName requerido.'),
})

export async function launchRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', app.authenticate)

  // ── Launch a game on a host ──
  app.post('/host/:hostId/launch', async (request, reply) => {
    const { hostId } = z.object({ hostId: z.string().uuid() }).parse(request.params)
    const { gameId, gameName } = launchSchema.parse(request.body)

    // Verify the host belongs to this user
    const host = await app.prisma.host.findFirst({
      where: { id: hostId, userId: request.userId! },
    })
    if (!host) {
      reply.notFound('Host no encontrado.')
      return
    }

    const result = await requestLaunch(app, hostId, request.userId!, gameId, gameName)
    if (result.success) {
      reply.send({ sessionId: result.sessionId, status: 'launching' })
    } else {
      reply.status(500).send({
        error: {
          code: 'LAUNCH_FAILED',
          message: result.error || 'Error al iniciar el juego.',
        },
      })
    }
  })

  // ── Get active sessions ──
  app.get('/sessions', async (request, reply) => {
    const sessions = await app.prisma.activeSession.findMany({
      where: {
        host: { userId: request.userId! },
        status: { in: ['LAUNCHING', 'STREAMING'] },
      },
      include: { host: { select: { name: true } } },
      orderBy: { startedAt: 'desc' },
    })
    reply.send({ sessions })
  })
}
