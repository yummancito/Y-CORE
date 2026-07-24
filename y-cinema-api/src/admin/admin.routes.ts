import { z } from 'zod'
import type { FastifyInstance } from 'fastify'
import { AdminService } from './admin.service.js'
import { createQueues } from '../queue/queues.js'
import {
  addImageBodySchema,
  imageIdParamsSchema,
  jobsQuerySchema,
  mergeDuplicatesBodySchema,
  syncProvidersBodySchema,
  updateMediaBodySchema,
} from './admin.schemas.js'

const mediaIdParamsSchema = z.object({ id: z.string().uuid() })

export default async function adminRoutes(app: FastifyInstance): Promise<void> {
  // BullMQ necesita su propia conexión (no reutiliza el cliente ioredis
  // decorado por plugins/redis.js) — se reconstruye desde REDIS_URL, ya
  // validado por config/env.ts al boot.
  const queues = createQueues({ url: process.env.REDIS_URL })
  const service = new AdminService(app.prisma, queues)

  app.addHook('onClose', async () => {
    await Promise.all(Object.values(queues).map((q) => q.close()))
  })

  app.patch(
    '/admin/media/:id',
    {
      schema: { tags: ['admin'], summary: 'Edita campos de un media (título, sinopsis, etc.).' },
      preHandler: app.requireAdmin,
    },
    async (request, reply) => {
      const { id } = mediaIdParamsSchema.parse(request.params)
      const body = updateMediaBodySchema.parse(request.body)
      const media = await service.updateMedia(id, body).catch(() => null)
      if (!media) {
        return reply.notFound(`No existe media con id ${id}`)
      }
      return reply.send(media)
    },
  )

  app.post(
    '/admin/media/:id/images',
    {
      schema: { tags: ['admin'], summary: 'Agrega una imagen a un media.' },
      preHandler: app.requireAdmin,
    },
    async (request, reply) => {
      const { id } = mediaIdParamsSchema.parse(request.params)
      const body = addImageBodySchema.parse(request.body)
      const image = await service.addImage(id, body)
      return reply.status(201).send(image)
    },
  )

  app.delete(
    '/admin/media/:id/images/:imageId',
    {
      schema: { tags: ['admin'], summary: 'Quita una imagen de un media.' },
      preHandler: app.requireAdmin,
    },
    async (request, reply) => {
      const { id, imageId } = imageIdParamsSchema.parse(request.params)
      await service.removeImage(id, imageId)
      return reply.status(204).send()
    },
  )

  app.post(
    '/admin/sync/providers',
    {
      schema: { tags: ['admin'], summary: 'Dispara una sincronización manual de un proveedor.' },
      preHandler: app.requireAdmin,
    },
    async (request, reply) => {
      const body = syncProvidersBodySchema.parse(request.body)
      const result = await service.triggerSyncProviders(body.providerSlug, body.mediaType, body.page)
      return reply.status(202).send(result)
    },
  )

  app.post(
    '/admin/media/merge',
    {
      schema: { tags: ['admin'], summary: 'Fusiona dos media duplicados (encola el job).' },
      preHandler: app.requireAdmin,
    },
    async (request, reply) => {
      const body = mergeDuplicatesBodySchema.parse(request.body)
      const result = await service.triggerMergeDuplicates(body.mediaIdA, body.mediaIdB)
      return reply.status(202).send(result)
    },
  )

  app.post(
    '/admin/search/reindex',
    {
      schema: { tags: ['admin'], summary: 'Dispara una reconstrucción completa del índice de búsqueda.' },
      preHandler: app.requireAdmin,
    },
    async (_request, reply) => {
      const result = await service.triggerRebuildSearchIndex()
      return reply.status(202).send(result)
    },
  )

  app.get(
    '/admin/jobs',
    {
      schema: { tags: ['admin'], summary: 'Historial de ejecuciones de jobs, con filtros.' },
      preHandler: app.requireAdmin,
    },
    async (request, reply) => {
      const query = jobsQuerySchema.parse(request.query)
      const jobs = await service.listJobs(query)
      return reply.send(jobs)
    },
  )

  app.get(
    '/admin/stats',
    {
      schema: { tags: ['admin'], summary: 'Estadísticas del catálogo: conteos por tipo/proveedor, gaps, fallos.' },
      preHandler: app.requireAdmin,
    },
    async (_request, reply) => {
      const stats = await service.getStats()
      return reply.send(stats)
    },
  )
}
