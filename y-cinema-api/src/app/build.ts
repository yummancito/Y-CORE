import Fastify, { type FastifyInstance } from 'fastify'
import type { Env } from '../config/env.js'

declare module 'fastify' {
  interface FastifyInstance {
    env: Env
  }
}
import sensiblePlugin from '../plugins/sensible.js'
import securityPlugin from '../plugins/security.js'
import swaggerPlugin from '../plugins/swagger.js'
import prismaPlugin from '../plugins/prisma.js'
import redisPlugin from '../plugins/redis.js'
import meilisearchPlugin from '../plugins/meilisearch.js'
import jwtPlugin from '../plugins/jwt.js'
import healthRoutes from '../routes/health.js'
import mediaRoutes from '../modules/media/media.routes.js'
import searchRoutes from '../modules/search/search.routes.js'
import authRoutes from '../modules/auth/auth.routes.js'
import genresRoutes from '../modules/genres/genres.routes.js'
import peopleRoutes from '../modules/people/people.routes.js'
import studiosRoutes from '../modules/studios/studios.routes.js'
import collectionsRoutes from '../modules/collections/collections.routes.js'
import favoritesRoutes from '../modules/favorites/favorites.routes.js'
import watchlistRoutes from '../modules/watchlist/watchlist.routes.js'
import historyRoutes from '../modules/history/history.routes.js'
import adminRoutes from '../admin/admin.routes.js'
import analyticsRoutes from '../modules/analytics/analytics.routes.js'
import { errorHandler } from '../middleware/errorHandler.js'

export interface BuildAppOptions {
  env: Env
}

/** Construye la instancia de Fastify sin arrancar el listener — permite
 * testear con `app.inject()` y reutilizar la misma factory en producción. */
export async function buildApp(opts: BuildAppOptions): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: opts.env.LOG_LEVEL,
      transport:
        opts.env.NODE_ENV === 'development'
          ? { target: 'pino-pretty', options: { colorize: true } }
          : undefined,
    },
  })

  app.setErrorHandler(errorHandler)
  app.decorate('env', opts.env)

  await app.register(sensiblePlugin)
  await app.register(prismaPlugin)
  await app.register(redisPlugin, { env: opts.env })
  await app.register(meilisearchPlugin, { env: opts.env })
  await app.register(jwtPlugin, { env: opts.env })
  // security depende de app.redis (store de rate limit) y app.jwt
  // (clasificar requester por rol) — debe registrarse después de ambos.
  await app.register(securityPlugin, { env: opts.env, redis: app.redis })
  if (opts.env.EXPOSE_DOCS) {
    await app.register(swaggerPlugin)
  }

  await app.register(healthRoutes)
  await app.register(mediaRoutes, { prefix: '/api/v1' })
  await app.register(searchRoutes, { prefix: '/api/v1' })
  await app.register(authRoutes, { prefix: '/api/v1' })
  await app.register(genresRoutes, { prefix: '/api/v1' })
  await app.register(peopleRoutes, { prefix: '/api/v1' })
  await app.register(studiosRoutes, { prefix: '/api/v1' })
  await app.register(collectionsRoutes, { prefix: '/api/v1' })
  await app.register(favoritesRoutes, { prefix: '/api/v1' })
  await app.register(watchlistRoutes, { prefix: '/api/v1' })
  await app.register(historyRoutes, { prefix: '/api/v1' })
  await app.register(adminRoutes, { prefix: '/api/v1' })
  await app.register(analyticsRoutes, { prefix: '/api/v1' })

  return app
}
