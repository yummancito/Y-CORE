import type { FastifyInstance } from 'fastify'

export default async function genresRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/genres',
    { schema: { tags: ['genres'], summary: 'Lista todos los géneros conocidos.' } },
    async (_request, reply) => {
      const genres = await app.prisma.genre.findMany({ orderBy: { name: 'asc' } })
      return reply.send(genres)
    },
  )
}
