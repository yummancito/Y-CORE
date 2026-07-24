import fp from 'fastify-plugin'
import { createSecretKey, type KeyObject } from 'node:crypto'
import { jwtVerify } from 'jose'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { Env } from '../config/env.js'

export interface JwtPayload {
  sub: string
  email: string
  role: 'USER' | 'ADMIN' | 'BETA_TESTER'
}

declare module 'fastify' {
  interface FastifyInstance {
    verifySupabaseJwt: (token: string) => Promise<JwtPayload>
    decodeSupabaseJwtUnsafe: (token: string) => JwtPayload | null
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>
    requireAdmin: (request: FastifyRequest, reply: FastifyReply) => Promise<void>
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

/** Verifica y decodifica JWTs emitidos por Supabase Auth (HS256, el
 * default de un proyecto Supabase) y expone helpers equivalentes a los
 * que antes daba @fastify/jwt, para minimizar cambios en el resto de la
 * app: las 19 rutas protegidas siguen leyendo request.jwtUser.{sub,role}
 * sin saber que el emisor cambió. */
export default fp(async (app: FastifyInstance, opts: { env: Env }) => {
  const secretKey: KeyObject = createSecretKey(Buffer.from(opts.env.SUPABASE_JWT_SECRET, 'utf-8'))

  async function verify(token: string): Promise<JwtPayload> {
    const { payload } = await jwtVerify(token, secretKey, { audience: 'authenticated' })
    return toJwtPayload(payload as Record<string, unknown>)
  }

  app.decorate('verifySupabaseJwt', verify)

  // Decodifica sin verificar firma — SOLO para clasificar el bucket de
  // rate-limit en plugins/security.ts (barato, sin round-trip a Supabase).
  // La verificación real de identidad ocurre en authenticate/requireAdmin.
  app.decorate('decodeSupabaseJwtUnsafe', (token: string): JwtPayload | null => {
    try {
      const [, payloadB64] = token.split('.')
      if (!payloadB64) return null
      const json = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf-8'))
      return toJwtPayload(json)
    } catch {
      return null
    }
  })

  app.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    const header = request.headers.authorization
    if (!header?.startsWith('Bearer ')) {
      reply.unauthorized('Token inválido o ausente.')
      return
    }
    try {
      request.jwtUser = await app.verifySupabaseJwt(header.slice('Bearer '.length))
    } catch {
      reply.unauthorized('Token inválido o ausente.')
    }
  })

  app.decorate('requireAdmin', async (request: FastifyRequest, reply: FastifyReply) => {
    const header = request.headers.authorization
    if (!header?.startsWith('Bearer ')) {
      reply.unauthorized('Token inválido o ausente.')
      return
    }
    try {
      request.jwtUser = await app.verifySupabaseJwt(header.slice('Bearer '.length))
    } catch {
      reply.unauthorized('Token inválido o ausente.')
      return
    }
    if (request.jwtUser.role !== 'ADMIN') {
      reply.forbidden('Se requiere rol de administrador.')
    }
  })
})
