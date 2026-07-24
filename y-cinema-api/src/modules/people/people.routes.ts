import { z } from 'zod'
import type { FastifyInstance } from 'fastify'

const personIdParamsSchema = z.object({ id: z.string().uuid() })

export default async function peopleRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/people/:id',
    { schema: { tags: ['people'], summary: 'Obtiene una persona con su filmografía.' } },
    async (request, reply) => {
      const { id } = personIdParamsSchema.parse(request.params)
      const person = await app.prisma.person.findUnique({
        where: { id },
        include: { media: { include: { media: { select: { title: true } } } } },
      })
      if (!person) {
        return reply.notFound(`No existe persona con id ${id}`)
      }
      return reply.send({
        id: person.id,
        name: person.name,
        profileUrl: person.profileUrl,
        filmography: person.media.map((m) => ({
          mediaId: m.mediaId,
          title: m.media.title,
          role: m.role,
          characterName: m.characterName,
        })),
      })
    },
  )
}
