import type { FastifyInstance } from 'fastify'
import { AnalyticsService } from './analytics.service.js'
import { analyticsQuerySchema } from './analytics.schemas.js'

/** Endpoints de agregación — protegidos por admin, ya que exponen
 * patrones de uso de todos los usuarios, no datos propios de quien pide. */
export default async function analyticsRoutes(app: FastifyInstance): Promise<void> {
  const service = new AnalyticsService(app.prisma)

  app.get(
    '/admin/analytics/top-searches',
    {
      schema: { tags: ['admin'], summary: 'Términos de búsqueda más frecuentes.' },
      preHandler: app.requireAdmin,
    },
    async (request, reply) => {
      const query = analyticsQuerySchema.parse(request.query)
      const top = await service.getTop('search', query.sinceDays, query.limit)
      return reply.send(top)
    },
  )

  app.get(
    '/admin/analytics/top-views',
    {
      schema: { tags: ['admin'], summary: 'Media más vistos (por mediaId).' },
      preHandler: app.requireAdmin,
    },
    async (request, reply) => {
      const query = analyticsQuerySchema.parse(request.query)
      const top = await service.getTop('view', query.sinceDays, query.limit)
      return reply.send(top)
    },
  )

  app.get(
    '/admin/analytics/summary',
    {
      schema: { tags: ['admin'], summary: 'Resumen de actividad: conteo de eventos por tipo.' },
      preHandler: app.requireAdmin,
    },
    async (request, reply) => {
      const query = analyticsQuerySchema.parse(request.query)
      const [searches, views, favorites] = await Promise.all([
        service.getEventCount('search', query.sinceDays),
        service.getEventCount('view', query.sinceDays),
        service.getEventCount('favorite', query.sinceDays),
      ])
      return reply.send({ sinceDays: query.sinceDays, searches, views, favorites })
    },
  )
}
