import { z } from 'zod'
import type { FastifyInstance } from 'fastify'

const collectionIdParamsSchema = z.object({ id: z.string().uuid() })

export default async function collectionsRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/collections/:id',
    { schema: { tags: ['collections'], summary: 'Obtiene una colección con sus media, en orden.' } },
    async (request, reply) => {
      const { id } = collectionIdParamsSchema.parse(request.params)
      const collection = await app.prisma.collection.findUnique({
        where: { id },
        include: {
          media: { include: { media: { select: { title: true } } }, orderBy: { sortOrder: 'asc' } },
        },
      })
      if (!collection) {
        return reply.notFound(`No existe colección con id ${id}`)
      }
      return reply.send({
        id: collection.id,
        name: collection.name,
        overview: collection.overview,
        items: collection.media.map((m) => ({ mediaId: m.mediaId, title: m.media.title })),
      })
    },
  )
}
