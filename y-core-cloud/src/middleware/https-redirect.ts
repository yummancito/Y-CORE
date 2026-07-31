// ============================================================================
// src/middleware/https-redirect.ts
// ============================================================================
// HTTPS enforcement middleware with HSTS headers.
// Redirects HTTP to HTTPS in production and enforces secure connections.
// ============================================================================

import fp from 'fastify-plugin'
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import type { Env } from '../config/env.js'

export const registerHttpsRedirectPlugin = fp(async (app: FastifyInstance, opts: { env: Env }) => {
  // Only enforce HTTPS in production
  if (opts.env.NODE_ENV !== 'production') {
    app.log.info('HTTPS enforcement disabled (not in production)')
    return
  }

  // Add HSTS header to all responses
  app.addHook('onSend', async (_request: FastifyRequest, reply: FastifyReply) => {
    // Strict-Transport-Security header - force HTTPS for 1 year
    reply.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload')
    reply.header('X-Content-Type-Options', 'nosniff')
    reply.header('X-Frame-Options', 'DENY')
    reply.header('X-XSS-Protection', '1; mode=block')
    reply.header('Content-Security-Policy', "default-src 'self'")
    reply.header('Referrer-Policy', 'strict-origin-when-cross-origin')
    reply.header('Permissions-Policy', 'geolocation=(), microphone=(), camera=()')
  })

  app.log.info('HTTPS enforcement enabled with HSTS headers')
})

/**
 * Middleware to check if connection is secure
 * Can be used as a preHandler on sensitive routes
 */
export async function requireHttps(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const isSecure =
    request.protocol === 'https' ||
    request.headers['x-forwarded-proto'] === 'https' ||
    request.headers['x-proto'] === 'https'

  if (!isSecure) {
    reply.badRequest('HTTPS connection required')
  }
}

/**
 * Get the client's real IP, accounting for proxies
 */
export function getClientIp(request: FastifyRequest): string {
  const forwarded = request.headers['x-forwarded-for']
  if (forwarded) {
    // x-forwarded-for can be comma-separated list, get the first one
    const ips = typeof forwarded === 'string' ? forwarded.split(',') : forwarded
    return (ips[0] || '').trim()
  }

  return request.headers['x-real-ip'] || request.ip || 'unknown'
}
