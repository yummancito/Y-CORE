// ============================================================================
// src/plugins/security.ts
// ----------------------------------------------------------------------------
// Security middleware: Helmet, CORS, rate limiting.
// ============================================================================

import fp from 'fastify-plugin'
import helmet from '@fastify/helmet'
import cors from '@fastify/cors'
import rateLimit from '@fastify/rate-limit'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { Env } from '../config/env.js'

function classifyRequester(request: FastifyRequest): 'authenticated' | 'anonymous' {
  const header = request.headers.authorization
  if (!header?.startsWith('Bearer ')) return 'anonymous'
  return 'authenticated'
}

export const registerSecurityPlugin = fp(async (app: FastifyInstance, opts: { env: Env }) => {
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
    max: (request) => {
      const requester = classifyRequester(request)
      if (requester === 'authenticated') return opts.env.RATE_LIMIT_AUTH_MAX
      return opts.env.RATE_LIMIT_MAX
    },
    timeWindow: opts.env.RATE_LIMIT_WINDOW_MS,
    keyGenerator: (request) => {
      if (request.userId) return `user:${request.userId}`
      return request.ip
    },
  })
})
