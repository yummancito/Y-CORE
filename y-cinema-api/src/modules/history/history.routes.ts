import type { FastifyInstance } from 'fastify'
import { recordHistoryBodySchema } from './history.schemas.js'

export default async function historyRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/history',
    {
      schema: { tags: ['history'], summary: 'Historial de reproducción del usuario, más reciente primero.' },
      preHandler: app.authenticate,
    },
    async (request, reply) => {
      const entries = await app.prisma.history.findMany({
        where: { userId: request.jwtUser!.sub },
        include: { media: { select: { title: true } } },
        orderBy: { watchedAt: 'desc' },
        take: 100,
      })
      return reply.send(
        entries.map((e) => ({
          mediaId: e.mediaId,
          episodeId: e.episodeId,
          title: e.media.title,
          progressPct: e.progressPct,
          watchedAt: e.watchedAt,
        })),
      )
    },
  )

  app.post(
    '/history',
    {
      schema: { tags: ['history'], summary: 'Registra progreso de reproducción (continuar viendo).' },
      preHandler: app.authenticate,
    },
    async (request, reply) => {
      const body = recordHistoryBodySchema.parse(request.body)
      const media = await app.prisma.media.findUnique({
        where: { id: body.mediaId },
        select: { id: true },
      })
      if (!media) {
        return reply.notFound(`No existe media con id ${body.mediaId}`)
      }
      const entry = await app.prisma.history.create({
        data: {
          userId: request.jwtUser!.sub,
          mediaId: body.mediaId,
          episodeId: body.episodeId,
          progressPct: body.progressPct,
        },
      })
      return reply.status(201).send({ id: entry.id })
    },
  )
}
