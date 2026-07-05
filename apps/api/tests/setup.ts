import Fastify from 'fastify'
import cors from '@fastify/cors'
import jwt from '@fastify/jwt'
import rateLimit from '@fastify/rate-limit'
import authPlugin from '../src/plugins/auth.js'
import authRoutes from '../src/routes/auth.js'
import gameRoutes from '../src/routes/games.js'
import jobRoutes from '../src/routes/jobs.js'
import manifestRoutes from '../src/routes/manifests.js'

export const TEST_JWT_SECRET = 'test-secret-for-ci'

export async function buildTestApp() {
  const fastify = Fastify({ logger: false })

  await fastify.register(cors, {
    origin: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  })

  await fastify.register(jwt, { secret: TEST_JWT_SECRET })

  await fastify.register(rateLimit, {
    max: 1000,
    timeWindow: '1 minute',
  })

  await fastify.register(authPlugin)
  await fastify.register(authRoutes)
  await fastify.register(gameRoutes)
  await fastify.register(jobRoutes)
  await fastify.register(manifestRoutes)

  fastify.get('/health', async () => ({ status: 'ok' }))

  await fastify.ready()
  return fastify
}

export function signTestToken(fastify: any, payload: { userId: string; email: string; username?: string }) {
  return fastify.jwt.sign(payload, { expiresIn: '1h' })
}
