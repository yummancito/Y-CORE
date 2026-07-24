import type { FastifyInstance } from 'fastify'

export default async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/health',
    {
      schema: {
        tags: ['health'],
        summary: 'Liveness check — el proceso está arriba.',
        response: {
          200: {
            type: 'object',
            properties: { status: { type: 'string' } },
          },
        },
      },
    },
    async () => ({ status: 'ok' }),
  )

  app.get(
    '/health/ready',
    {
      schema: {
        tags: ['health'],
        summary: 'Readiness check — DB y Redis responden.',
        response: {
          200: {
            type: 'object',
            properties: {
              status: { type: 'string' },
              checks: {
                type: 'object',
                properties: {
                  database: { type: 'string' },
                  redis: { type: 'string' },
                },
              },
            },
          },
          503: {
            type: 'object',
            properties: {
              status: { type: 'string' },
              checks: {
                type: 'object',
                properties: {
                  database: { type: 'string' },
                  redis: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const checks = { database: 'unknown', redis: 'unknown' }
      let healthy = true

      try {
        await request.server.prisma.$queryRaw`SELECT 1`
        checks.database = 'ok'
      } catch {
        checks.database = 'error'
        healthy = false
      }

      try {
        const pong = await request.server.redis.ping()
        checks.redis = pong === 'PONG' ? 'ok' : 'error'
        if (pong !== 'PONG') healthy = false
      } catch {
        checks.redis = 'error'
        healthy = false
      }

      const status = healthy ? 'ok' : 'degraded'
      reply.status(healthy ? 200 : 503).send({ status, checks })
    },
  )
}
