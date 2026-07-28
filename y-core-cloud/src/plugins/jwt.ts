// ============================================================================
// src/plugins/jwt.ts
// ----------------------------------------------------------------------------
// JWT authentication plugin using jose (no Supabase dependency).
// Generates and verifies JWTs with HS256 using the configured secret.
// ============================================================================

import fp from 'fastify-plugin'
import { SignJWT, jwtVerify } from 'jose'
import { createSecretKey, type KeyObject } from 'node:crypto'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { Env } from '../config/env.js'

export interface JwtPayload {
  sub: string
  email: string
  role: 'USER' | 'ADMIN'
}

declare module 'fastify' {
  interface FastifyInstance {
    signJwt(payload: JwtPayload): Promise<string>
    verifyJwt(token: string): Promise<JwtPayload>
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>
    requireAdmin: (request: FastifyRequest, reply: FastifyReply) => Promise<void>
    optionalAuth: (request: FastifyRequest, reply: FastifyReply) => Promise<void>
  }
  interface FastifyRequest {
    jwtUser?: JwtPayload
  }
}

function toJwtPayload(payload: Record<string, unknown>): JwtPayload {
  return {
    sub: payload.sub as string,
    email: payload.email as string,
    role: (payload.role as JwtPayload['role']) ?? 'USER',
  }
}

export const registerJwtPlugin = fp(async (app: FastifyInstance, opts: { env: Env }) => {
  const secretKey: KeyObject = createSecretKey(Buffer.from(opts.env.JWT_SECRET, 'utf-8'))

  async function sign(payload: JwtPayload): Promise<string> {
    return new SignJWT({ ...payload })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(payload.sub)
      .setIssuedAt()
      .setExpirationTime(opts.env.JWT_EXPIRES_IN)
      .sign(secretKey)
  }

  async function verify(token: string): Promise<JwtPayload> {
    const { payload } = await jwtVerify(token, secretKey)
    return toJwtPayload(payload as Record<string, unknown>)
  }

  app.decorate('signJwt', sign)
  app.decorate('verifyJwt', verify)

  app.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    const header = request.headers.authorization
    if (!header?.startsWith('Bearer ')) {
      reply.unauthorized('Token inválido o ausente.')
      return
    }
    try {
      const payload = await app.verifyJwt(header.slice('Bearer '.length))
      request.jwtUser = payload
      request.userId = payload.sub
      request.userRole = payload.role
    } catch {
      reply.unauthorized('Token inválido o expirado.')
    }
  })

  app.decorate('requireAdmin', async (request: FastifyRequest, reply: FastifyReply) => {
    const header = request.headers.authorization
    if (!header?.startsWith('Bearer ')) {
      reply.unauthorized('Token inválido o ausente.')
      return
    }
    try {
      const payload = await app.verifyJwt(header.slice('Bearer '.length))
      request.jwtUser = payload
      request.userId = payload.sub
      request.userRole = payload.role
    } catch {
      reply.unauthorized('Token inválido o expirado.')
      return
    }
    if (request.jwtUser.role !== 'ADMIN') {
      reply.forbidden('Se requiere rol de administrador.')
    }
  })

  app.decorate('optionalAuth', async (request: FastifyRequest, _reply: FastifyReply) => {
    const header = request.headers.authorization
    if (!header?.startsWith('Bearer ')) return
    try {
      const payload = await app.verifyJwt(header.slice('Bearer '.length))
      request.jwtUser = payload
      request.userId = payload.sub
      request.userRole = payload.role
    } catch {
      // Optional auth — token invalid just means unauthenticated
    }
  })
})
