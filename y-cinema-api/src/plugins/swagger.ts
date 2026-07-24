import fp from 'fastify-plugin'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import type { FastifyInstance } from 'fastify'

export default fp(async (app: FastifyInstance) => {
  await app.register(swagger, {
    openapi: {
      openapi: '3.1.0',
      info: {
        title: 'Y-Cinema API',
        description:
          'Plataforma de datos multimedia para Y-Cinema (películas, series, anime).',
        version: '0.1.0',
      },
      servers: [{ url: '/api/v1', description: 'API v1' }],
      tags: [
        { name: 'health', description: 'Estado del servicio' },
        { name: 'media', description: 'Modelo central de media' },
      ],
    },
  })

  await app.register(swaggerUi, {
    routePrefix: '/docs',
  })
})
