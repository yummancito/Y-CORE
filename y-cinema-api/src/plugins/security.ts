import fp from 'fastify-plugin'
import helmet from '@fastify/helmet'
import cors from '@fastify/cors'
import rateLimit from '@fastify/rate-limit'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { Redis } from 'ioredis'
import type { Env } from '../config/env.js'

/** Decodifica el JWT del header (sin verificar firma — solo para decidir
 * el bucket de rate limit; la verificación real ocurre en
 * app.authenticate/requireAdmin de cada ruta protegida) para diferenciar
 * límites por rol. Un usuario anónimo es mucho más barato de generar
 * (bots, scraping) que uno autenticado, y un admin no debería poder
 * saturar sus propias colas de jobs con el límite genérico. */
function classifyRequester(request: FastifyRequest): 'admin' | 'authenticated' | 'anonymous' {
  const header = request.headers.authorization
  if (!header?.startsWith('Bearer ')) return 'anonymous'
  const payload = request.server.decodeSupabaseJwtUnsafe(header.slice('Bearer '.length))
  if (!payload) return 'anonymous'
  return payload.role === 'ADMIN' ? 'admin' : 'authenticated'
}

export default fp(async (app: FastifyInstance, opts: { env: Env; redis?: Redis }) => {
  // Helmet con defaults pensados para servir HTML (CSP, etc.) no aplica a
  // una API JSON pura — se desactiva lo que no tiene sentido acá y se
  // mantiene lo que sí protege (nosniff, frameguard, hsts).
  await app.register(helmet, {
    global: true,
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })

  await app.register(cors, {
    origin: opts.env.CORS_ORIGIN === '*' ? true : opts.env.CORS_ORIGIN.split(','),
    credentials: opts.env.CORS_ORIGIN !== '*',
  })

  await app.register(rateLimit, {
    ...(opts.redis ? { redis: opts.redis } : {}),
    max: (request) => {
      const requester = classifyRequester(request)
      if (requester === 'admin') return opts.env.RATE_LIMIT_ADMIN_MAX
      if (requester === 'authenticated') return opts.env.RATE_LIMIT_AUTHENTICATED_MAX
      return opts.env.RATE_LIMIT_MAX
    },
    timeWindow: opts.env.RATE_LIMIT_WINDOW_MS,
    // Agrupa por usuario cuando hay JWT (evita que varios usuarios detrás
    // de la misma IP/NAT compartan cupo), y por IP para anónimos.
    keyGenerator: (request) => {
      const header = request.headers.authorization
      if (header?.startsWith('Bearer ')) {
        const payload = request.server.decodeSupabaseJwtUnsafe(header.slice('Bearer '.length))
        if (payload?.sub) return `user:${payload.sub}`
      }
      return request.ip
    },
  })
})
