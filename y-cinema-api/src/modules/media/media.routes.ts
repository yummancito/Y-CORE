import type { FastifyInstance } from 'fastify'
import { MediaRepository } from './media.repository.js'
import { MediaService } from './media.service.js'
import { listMediaQuerySchema, mediaIdParamsSchema } from './media.schemas.js'
import { AnalyticsService } from '../analytics/analytics.service.js'

export default async function mediaRoutes(app: FastifyInstance): Promise<void> {
  const repository = new MediaRepository(app.prisma)
  const service = new MediaService(repository, app.redis)
  const analytics = new AnalyticsService(app.prisma)

  app.get(
    '/media',
    {
      schema: {
        tags: ['media'],
        summary:
          'Lista media paginada, con filtros por tipo/género/año. sort=popularity (default) o sort=recent — no hay sort=trending, ver media.schemas.ts.',
      },
    },
    async (request, reply) => {
      const query = listMediaQuerySchema.parse(request.query)
      const result = await service.list({
        ...(query.type ? { type: query.type } : {}),
        ...(query.genre ? { genreSlug: query.genre } : {}),
        ...(query.year ? { year: query.year } : {}),
        sort: query.sort,
        page: query.page,
        pageSize: query.pageSize,
      })
      return reply.send(result)
    },
  )

  app.get(
    '/media/:id',
    {
      schema: {
        tags: ['media'],
        summary: 'Obtiene un Media por id, con todas sus relaciones resueltas.',
      },
    },
    async (request, reply) => {
      const { id } = mediaIdParamsSchema.parse(request.params)
      const media = await service.getById(id)
      if (!media) {
        return reply.notFound(`No existe media con id ${id}`)
      }
      analytics.recordEvent({ type: 'view', subject: id }).catch(() => {})
      return reply.send(media)
    },
  )
}
