// ============================================================================
// src/modules/auth/auth.routes.ts
// ----------------------------------------------------------------------------
// Authentication routes — register, login, refresh, logout.
// ============================================================================

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { registerUser, loginUser, refreshAccessToken, logoutUser } from './auth.service.js'

const registerSchema = z.object({
  email: z.string().email('Email inválido.'),
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres.'),
})

const loginSchema = z.object({
  email: z.string().email('Email inválido.'),
  password: z.string().min(1, 'La contraseña es requerida.'),
})

const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token requerido.'),
})

export async function authRoutes(app: FastifyInstance): Promise<void> {
  // ── Register ──
  app.post('/register', async (request, reply) => {
    const { email, password } = registerSchema.parse(request.body)
    const user = await registerUser(app.prisma, email, password)
    reply.status(201).send({ user })
  })

  // ── Login ──
  app.post('/login', async (request, reply) => {
    const { email, password } = loginSchema.parse(request.body)
    const result = await loginUser(app, app.prisma, email, password)
    reply.send(result)
  })

  // ── Refresh Token ──
  app.post('/refresh', async (request, reply) => {
    const { refreshToken } = refreshSchema.parse(request.body)
    const result = await refreshAccessToken(app, app.prisma, refreshToken)
    reply.send(result)
  })

  // ── Logout ──
  app.post('/logout', async (request, reply) => {
    const { refreshToken } = refreshSchema.parse(request.body)
    await logoutUser(app.prisma, refreshToken)
    reply.status(204).send()
  })

  // ── Me (get current user info) ──
  app.get('/me', { preHandler: [app.authenticate] }, async (request, reply) => {
    const user = await app.prisma.user.findUnique({
      where: { id: request.userId },
      select: { id: true, email: true, role: true, createdAt: true },
    })
    if (!user) {
      reply.notFound('Usuario no encontrado.')
      return
    }
    reply.send({ user })
  })
}
