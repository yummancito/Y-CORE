import type { FastifyInstance } from 'fastify'

export default async function studiosRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/studios',
    { schema: { tags: ['studios'], summary: 'Lista todos los estudios conocidos.' } },
    async (_request, reply) => {
      const studios = await app.prisma.studio.findMany({ orderBy: { name: 'asc' } })
      return reply.send(studios)
    },
  )
}
