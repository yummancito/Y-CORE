// ============================================================================
// src/modules/auth/auth.routes.ts
// ----------------------------------------------------------------------------
// Authentication routes — register, login, refresh, logout.
// ============================================================================

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { registerUser, loginUser, refreshAccessToken, logoutUser } from './auth.service.js'
import { rateLimiterService, RATE_LIMIT_CONFIGS } from '../../services/rate-limiter.service.js'
import { getClientIp } from '../../middleware/https-redirect.js'

// ============================================================================
// Enhanced password validation
// Minimum 12 characters, mixed case, numbers, and special characters
// ============================================================================
const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[a-zA-Z\d@$!%*?&]{12,}$/

const registerSchema = z.object({
  email: z
    .string()
    .email('Email inválido.')
    .toLowerCase()
    .refine((email) => !email.endsWith('@example.com'), 'Email de prueba no permitido'),
  password: z
    .string()
    .min(12, 'La contraseña debe tener al menos 12 caracteres.')
    .regex(
      passwordRegex,
      'La contraseña debe contener mayúsculas, minúsculas, números y caracteres especiales.',
    ),
})

const loginSchema = z.object({
  email: z.string().email('Email inválido.').toLowerCase(),
  password: z.string().min(1, 'La contraseña es requerida.'),
})

const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token requerido.'),
})

export async function authRoutes(app: FastifyInstance): Promise<void> {
  // ── Register ──
  app.post('/register', async (request, reply) => {
    const clientIp = getClientIp(request)

    // Rate limiting: 3 requests per hour per IP
    const limitCheck = rateLimiterService.checkLimit(
      clientIp,
      '/api/auth/register',
      RATE_LIMIT_CONFIGS.AUTH_REGISTER,
    )

    if (!limitCheck.allowed) {
      reply.status(429).header('Retry-After', Math.ceil((limitCheck.resetAt.getTime() - Date.now()) / 1000)).send({
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Demasiados intentos de registro. Intenta más tarde.',
          retryAfter: limitCheck.resetAt.toISOString(),
        },
      })
      return
    }

    try {
      const { email, password } = registerSchema.parse(request.body)
      const user = await registerUser(app.prisma, email, password)

      // Audit log
      await app.auditService.logAuthEvent(user.id, 'REGISTER', clientIp, 'SUCCESS')

      reply.status(201).send({ user })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Registration failed'
      await app.auditService.logAuthEvent(undefined, 'REGISTER', clientIp, 'FAILURE', errorMessage)
      throw error
    }
  })

  // ── Login ──
  app.post('/login', async (request, reply) => {
    const clientIp = getClientIp(request)

    // Rate limiting: 10 requests per minute per IP
    const limitCheck = rateLimiterService.checkLimit(
      clientIp,
      '/api/auth/login',
      RATE_LIMIT_CONFIGS.AUTH_LOGIN,
    )

    if (!limitCheck.allowed) {
      reply.status(429).header('Retry-After', Math.ceil((limitCheck.resetAt.getTime() - Date.now()) / 1000)).send({
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Demasiados intentos de inicio de sesión. Intenta más tarde.',
          retryAfter: limitCheck.resetAt.toISOString(),
        },
      })
      return
    }

    try {
      const { email, password } = loginSchema.parse(request.body)
      const result = await loginUser(app, app.prisma, email, password)

      // Audit log
      await app.auditService.logAuthEvent(result.user.id, 'LOGIN', clientIp, 'SUCCESS')

      reply.send(result)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Login failed'
      await app.auditService.logAuthEvent(undefined, 'LOGIN_FAILED', clientIp, 'FAILURE', errorMessage)
      throw error
    }
  })

  // ── Refresh Token ──
  app.post('/refresh', async (request, reply) => {
    const clientIp = getClientIp(request)

    // Rate limiting: 30 per minute per user (once authenticated)
    const limitIdentifier = request.userId || clientIp
    const limitCheck = rateLimiterService.checkLimit(
      limitIdentifier,
      '/api/auth/refresh',
      RATE_LIMIT_CONFIGS.AUTH_REFRESH,
    )

    if (!limitCheck.allowed) {
      reply.status(429).header('Retry-After', Math.ceil((limitCheck.resetAt.getTime() - Date.now()) / 1000)).send({
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Demasiados intentos de renovación de token. Intenta más tarde.',
          retryAfter: limitCheck.resetAt.toISOString(),
        },
      })
      return
    }

    try {
      const { refreshToken } = refreshSchema.parse(request.body)
      const result = await refreshAccessToken(app, app.prisma, refreshToken)

      // Audit log
      await app.auditService.logAuthEvent(result.user.id, 'TOKEN_REFRESH', clientIp, 'SUCCESS')

      reply.send(result)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Token refresh failed'
      await app.auditService.logAuthEvent(undefined, 'TOKEN_REFRESH', clientIp, 'FAILURE', errorMessage)
      throw error
    }
  })

  // ── Logout ──
  app.post('/logout', async (request, reply) => {
    const clientIp = getClientIp(request)

    try {
      const { refreshToken } = refreshSchema.parse(request.body)
      await logoutUser(app.prisma, refreshToken)

      // Audit log
      await app.auditService.logAuthEvent(request.userId, 'LOGOUT', clientIp, 'SUCCESS')

      reply.status(204).send()
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Logout failed'
      await app.auditService.logAuthEvent(request.userId, 'LOGOUT', clientIp, 'FAILURE', errorMessage)
      throw error
    }
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
