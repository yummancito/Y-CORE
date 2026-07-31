// ============================================================================
// src/app/build.ts
// ----------------------------------------------------------------------------
// Build and configure the Fastify application instance.
// ============================================================================

import Fastify from 'fastify'
import { fastifySwagger } from '@fastify/swagger'
import { fastifySwaggerUi } from '@fastify/swagger-ui'
import { fastifyWebsocket } from '@fastify/websocket'
import sensible from '@fastify/sensible'
import { PrismaClient } from '@prisma/client'
import { Redis } from 'ioredis'
import type { WebSocket } from 'ws'

import type { Env } from '../config/env.js'
import { errorHandler } from '../middleware/errorHandler.js'
import { registerJwtPlugin } from '../plugins/jwt.js'
import { registerSecurityPlugin } from '../plugins/security.js'
import { registerHttpsRedirectPlugin } from '../middleware/https-redirect.js'
import { initializeSecretManager, validateSecrets } from '../config/secrets.js'
import { AuditService } from '../services/audit.service.js'
import { CleanupJobManager } from '../jobs/cleanup.jobs.js'

// Module routes
import { authRoutes } from '../modules/auth/auth.routes.js'
import { hostsRoutes } from '../modules/hosts/hosts.routes.js'
import { devicesRoutes } from '../modules/devices/devices.routes.js'
import { libraryRoutes } from '../modules/library/library.routes.js'
import { launchRoutes } from '../modules/launch/launch.routes.js'
import { registerWsHandler, stopWsHandler } from '../modules/ws/ws.handler.js'

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient
    redis: Redis
    env: Env
    wsClients: Map<string, Set<WebSocket>>
    hostWsClients: Map<string, Set<WebSocket>>
    auditService: AuditService
    cleanupJobManager: CleanupJobManager
  }
  interface FastifyRequest {
    userId?: string
    userRole?: string
  }
}

export async function buildApp(opts: { env: Env }) {
  // ── Validate secrets on startup ──
  const secretValidation = validateSecrets()
  if (!secretValidation.valid) {
    console.error('❌ Security validation failed:')
    for (const error of secretValidation.errors) {
      console.error(`  - ${error}`)
    }
    process.exit(1)
  }
  for (const warning of secretValidation.warnings) {
    console.warn(`⚠️  ${warning}`)
  }

  // ── Initialize secret manager ──
  initializeSecretManager(opts.env.JWT_SECRET)

  const app = Fastify({
    logger: {
      level: opts.env.NODE_ENV === 'production' ? 'info' : 'debug',
      transport: opts.env.NODE_ENV !== 'production'
        ? { target: 'pino-pretty', options: { colorize: true } }
        : undefined,
    },
  })

  // ── Decorate app instances ──
  const prisma = new PrismaClient()
  const redis = new Redis(opts.env.REDIS_URL, {
    maxRetriesPerRequest: 3,
    retryStrategy(times: number) {
      if (times > 10) return null
      return Math.min(times * 100, 3000)
    },
  })

  // ── Initialize services ──
  const auditService = new AuditService(prisma)
  const cleanupJobManager = new CleanupJobManager(prisma, auditService)

  app.decorate('prisma', prisma)
  app.decorate('redis', redis)
  app.decorate('env', opts.env)
  app.decorate('wsClients', new Map<string, Set<WebSocket>>())
  app.decorate('hostWsClients', new Map<string, Set<WebSocket>>())
  app.decorate('auditService', auditService)
  app.decorate('cleanupJobManager', cleanupJobManager)

  // ── Error handler ──
  app.setErrorHandler(errorHandler)

  // ── Plugins ──
  await app.register(sensible)
  await registerSecurityPlugin(app, opts)
  await registerHttpsRedirectPlugin(app, opts)
  await registerJwtPlugin(app, opts)

  // ── Swagger ──
  await app.register(fastifySwagger, {
    openapi: {
      info: {
        title: 'Y-Core Cloud API',
        description: 'Remote Play Anywhere — backend for Y-Core Desktop & Android',
        version: '0.1.0',
      },
      servers: [{ url: `http://localhost:${opts.env.PORT}` }],
    },
  })
  await app.register(fastifySwaggerUi, { routePrefix: '/docs' })

  // ── WebSocket ──
  await app.register(fastifyWebsocket)

  // ── Health check ──
  app.get('/health', async () => ({
    status: 'ok',
    timestamp: Date.now(),
    uptime: process.uptime(),
  }))

  // ── Routes ──
  await app.register(authRoutes, { prefix: '/api/auth' })
  await app.register(hostsRoutes, { prefix: '/api/hosts' })
  await app.register(devicesRoutes, { prefix: '/api/devices' })
  await app.register(libraryRoutes, { prefix: '/api/library' })
  await app.register(launchRoutes, { prefix: '/api/launch' })

  // ── WebSocket ──
  registerWsHandler(app)

  // ── Start cleanup jobs ──
  cleanupJobManager.startAll()

  // ── Graceful shutdown ──
  const shutdown = async () => {
    stopWsHandler()
    cleanupJobManager.stopAll()
    await prisma.$disconnect()
    redis.disconnect()
  }

  app.addHook('onClose', async () => {
    await shutdown()
  })

  return app
}
