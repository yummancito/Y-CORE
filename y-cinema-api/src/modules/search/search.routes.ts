import type { FastifyInstance } from 'fastify'
import { SearchService } from './search.service.js'
import { searchQuerySchema } from './search.schemas.js'
import { AnalyticsService } from '../analytics/analytics.service.js'

export default async function searchRoutes(app: FastifyInstance): Promise<void> {
  const service = new SearchService(app.meili, app.prisma)
  const analytics = new AnalyticsService(app.prisma)

  app.get(
    '/search',
    {
      schema: {
        tags: ['search'],
        summary: 'Búsqueda fuzzy con autocomplete sobre título, actores, estudios y género.',
      },
    },
    async (request, reply) => {
      const query = searchQuerySchema.parse(request.query)
      const result = await service.search({
        query: query.q,
        ...(query.type ? { type: query.type } : {}),
        ...(query.genre ? { genreSlug: query.genre } : {}),
        limit: query.limit,
      })
      // Fire-and-forget: el registro de analytics nunca debe demorar ni
      // romper la respuesta de búsqueda al usuario.
      analytics.recordEvent({ type: 'search', subject: query.q }).catch(() => {})
      return reply.send(result)
    },
  )
}
