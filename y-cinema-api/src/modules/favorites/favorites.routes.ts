import { z } from 'zod'
import type { FastifyInstance } from 'fastify'
import { favoriteBodySchema } from './favorites.schemas.js'
import { AnalyticsService } from '../analytics/analytics.service.js'

const mediaIdParamsSchema = z.object({ mediaId: z.string().uuid() })

export default async function favoritesRoutes(app: FastifyInstance): Promise<void> {
  const analytics = new AnalyticsService(app.prisma)

  app.get(
    '/favorites',
    {
      schema: { tags: ['favorites'], summary: 'Lista los favoritos del usuario autenticado.' },
      preHandler: app.authenticate,
    },
    async (request, reply) => {
      const favorites = await app.prisma.favorite.findMany({
        where: { userId: request.jwtUser!.sub },
        include: { media: { select: { title: true } } },
        orderBy: { createdAt: 'desc' },
      })
      return reply.send(favorites.map((f) => ({ mediaId: f.mediaId, title: f.media.title, addedAt: f.createdAt })))
    },
  )

  app.post(
    '/favorites',
    {
      schema: { tags: ['favorites'], summary: 'Agrega un media a favoritos.' },
      preHandler: app.authenticate,
    },
    async (request, reply) => {
      const body = favoriteBodySchema.parse(request.body)
      const media = await app.prisma.media.findUnique({
        where: { id: body.mediaId },
        select: { id: true },
      })
      if (!media) {
        return reply.notFound(`No existe media con id ${body.mediaId}`)
      }
      await app.prisma.favorite.upsert({
        where: { userId_mediaId: { userId: request.jwtUser!.sub, mediaId: body.mediaId } },
        update: {},
        create: { userId: request.jwtUser!.sub, mediaId: body.mediaId },
      })
      analytics
        .recordEvent({ type: 'favorite', subject: body.mediaId, userId: request.jwtUser!.sub })
        .catch(() => {})
      return reply.status(201).send({ mediaId: body.mediaId })
    },
  )

  app.delete(
    '/favorites/:mediaId',
    {
      schema: { tags: ['favorites'], summary: 'Quita un media de favoritos.' },
      preHandler: app.authenticate,
    },
    async (request, reply) => {
      const { mediaId } = mediaIdParamsSchema.parse(request.params)
      await app.prisma.favorite
        .delete({ where: { userId_mediaId: { userId: request.jwtUser!.sub, mediaId } } })
        .catch(() => {}) // idempotente: borrar algo que no existe no es un error
      return reply.status(204).send()
    },
  )
}
