import type { FastifyInstance } from 'fastify'
import {
  AuthService,
  EmailAlreadyRegisteredError,
  InvalidCredentialsError,
  InvalidRefreshTokenError,
} from './auth.service.js'
import { loginBodySchema, logoutBodySchema, refreshBodySchema, registerBodySchema } from './auth.schemas.js'

export default async function authRoutes(app: FastifyInstance): Promise<void> {
  const service = new AuthService(app.env)

  app.post(
    '/auth/register',
    { schema: { tags: ['auth'], summary: 'Crea una cuenta y devuelve tokens de sesión.' } },
    async (request, reply) => {
      const body = registerBodySchema.parse(request.body)
      try {
        const result = await service.register(body.email, body.password)
        return reply.status(201).send(result)
      } catch (err) {
        if (err instanceof EmailAlreadyRegisteredError) {
          return reply.conflict(err.message)
        }
        throw err
      }
    },
  )

  app.post(
    '/auth/login',
    { schema: { tags: ['auth'], summary: 'Autentica con email+contraseña.' } },
    async (request, reply) => {
      const body = loginBodySchema.parse(request.body)
      try {
        const result = await service.login(body.email, body.password)
        return reply.send(result)
      } catch (err) {
        if (err instanceof InvalidCredentialsError) {
          return reply.unauthorized(err.message)
        }
        throw err
      }
    },
  )

  app.post(
    '/auth/refresh',
    { schema: { tags: ['auth'], summary: 'Cambia un refresh token vigente por un par nuevo (rotación).' } },
    async (request, reply) => {
      const body = refreshBodySchema.parse(request.body)
      try {
        const tokens = await service.refresh(body.refreshToken)
        return reply.send(tokens)
      } catch (err) {
        if (err instanceof InvalidRefreshTokenError) {
          return reply.unauthorized(err.message)
        }
        throw err
      }
    },
  )

  app.post(
    '/auth/logout',
    { schema: { tags: ['auth'], summary: 'Revoca la sesión asociada a un access token.' } },
    async (request, reply) => {
      const body = logoutBodySchema.parse(request.body)
      await service.logout(body.accessToken)
      return reply.status(204).send()
    },
  )

  app.get(
    '/auth/me',
    {
      schema: { tags: ['auth'], summary: 'Devuelve el usuario autenticado.' },
      preHandler: app.authenticate,
    },
    async (request, reply) => {
      return reply.send(request.jwtUser)
    },
  )
}
