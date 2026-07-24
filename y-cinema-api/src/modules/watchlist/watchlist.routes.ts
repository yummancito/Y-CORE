import { z } from 'zod'
import type { FastifyInstance } from 'fastify'

const watchlistBodySchema = z.object({ mediaId: z.string().uuid() })
const mediaIdParamsSchema = z.object({ mediaId: z.string().uuid() })

export default async function watchlistRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/watchlist',
    {
      schema: { tags: ['watchlist'], summary: 'Lista la watchlist del usuario autenticado.' },
      preHandler: app.authenticate,
    },
    async (request, reply) => {
      const items = await app.prisma.watchlist.findMany({
        where: { userId: request.jwtUser!.sub },
        include: { media: { select: { title: true } } },
        orderBy: { createdAt: 'desc' },
      })
      return reply.send(items.map((i) => ({ mediaId: i.mediaId, title: i.media.title, addedAt: i.createdAt })))
    },
  )

  app.post(
    '/watchlist',
    {
      schema: { tags: ['watchlist'], summary: 'Agrega un media a la watchlist.' },
      preHandler: app.authenticate,
    },
    async (request, reply) => {
      const body = watchlistBodySchema.parse(request.body)
      const media = await app.prisma.media.findUnique({
        where: { id: body.mediaId },
        select: { id: true },
      })
      if (!media) {
        return reply.notFound(`No existe media con id ${body.mediaId}`)
      }
      await app.prisma.watchlist.upsert({
        where: { userId_mediaId: { userId: request.jwtUser!.sub, mediaId: body.mediaId } },
        update: {},
        create: { userId: request.jwtUser!.sub, mediaId: body.mediaId },
      })
      return reply.status(201).send({ mediaId: body.mediaId })
    },
  )

  app.delete(
    '/watchlist/:mediaId',
    {
      schema: { tags: ['watchlist'], summary: 'Quita un media de la watchlist.' },
      preHandler: app.authenticate,
    },
    async (request, reply) => {
      const { mediaId } = mediaIdParamsSchema.parse(request.params)
      await app.prisma.watchlist
        .delete({ where: { userId_mediaId: { userId: request.jwtUser!.sub, mediaId } } })
        .catch(() => {})
      return reply.status(204).send()
    },
  )
}
