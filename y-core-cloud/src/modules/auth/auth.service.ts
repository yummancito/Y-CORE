// ============================================================================
// src/modules/auth/auth.service.ts
// ----------------------------------------------------------------------------
// Authentication service — register, login, refresh token.
// Uses bcryptjs for password hashing and jose for JWT.
// ============================================================================

import bcrypt from 'bcryptjs'
import { createHash, randomBytes } from 'node:crypto'
import type { PrismaClient } from '@prisma/client'
import type { FastifyInstance } from 'fastify'

const SALT_ROUNDS = 12
const REFRESH_TOKEN_BYTES = 48

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export async function registerUser(
  prisma: PrismaClient,
  email: string,
  password: string,
) {
  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    throw Object.assign(new Error('El email ya está registrado.'), { statusCode: 409 })
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS)
  const user = await prisma.user.create({
    data: { email, passwordHash },
  })

  return { id: user.id, email: user.email, role: user.role }
}

export async function loginUser(
  app: FastifyInstance,
  prisma: PrismaClient,
  email: string,
  password: string,
) {
  const user = await prisma.user.findUnique({ where: { email } })
  if (!user) {
    throw Object.assign(new Error('Credenciales inválidas.'), { statusCode: 401 })
  }

  const valid = await bcrypt.compare(password, user.passwordHash)
  if (!valid) {
    throw Object.assign(new Error('Credenciales inválidas.'), { statusCode: 401 })
  }

  // Generate tokens
  const jwtPayload = { sub: user.id, email: user.email, role: user.role }
  const accessToken = await app.signJwt(jwtPayload)

  // Generate refresh token
  const refreshToken = randomBytes(REFRESH_TOKEN_BYTES).toString('base64url')
  const tokenHash = hashToken(refreshToken)
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days

  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash,
      expiresAt,
    },
  })

  return {
    accessToken,
    refreshToken,
    user: { id: user.id, email: user.email, role: user.role },
    expiresIn: '24h',
  }
}

export async function refreshAccessToken(
  app: FastifyInstance,
  prisma: PrismaClient,
  refreshToken: string,
) {
  const tokenHash = hashToken(refreshToken)
  const stored = await prisma.refreshToken.findUnique({ where: { tokenHash } })

  if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
    throw Object.assign(new Error('Refresh token inválido o expirado.'), { statusCode: 401 })
  }

  // Revoke old token (rotation)
  await prisma.refreshToken.update({
    where: { id: stored.id },
    data: { revokedAt: new Date() },
  })

  const user = await prisma.user.findUnique({ where: { id: stored.userId } })
  if (!user) {
    throw Object.assign(new Error('Usuario no encontrado.'), { statusCode: 404 })
  }

  // Generate new tokens
  const jwtPayload = { sub: user.id, email: user.email, role: user.role }
  const newAccessToken = await app.signJwt(jwtPayload)

  const newRefreshToken = randomBytes(REFRESH_TOKEN_BYTES).toString('base64url')
  const newTokenHash = hashToken(newRefreshToken)
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)

  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: newTokenHash,
      expiresAt,
    },
  })

  return {
    accessToken: newAccessToken,
    refreshToken: newRefreshToken,
    user: { id: user.id, email: user.email, role: user.role },
    expiresIn: '24h',
  }
}

export async function logoutUser(
  prisma: PrismaClient,
  refreshToken: string,
): Promise<void> {
  const tokenHash = hashToken(refreshToken)
  await prisma.refreshToken.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  })
}
