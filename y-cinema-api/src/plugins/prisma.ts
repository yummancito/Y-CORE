import fp from 'fastify-plugin'
import type { FastifyInstance } from 'fastify'
import type { PrismaClient } from '@prisma/client'
import { getPrismaClient } from '../database/prisma.js'

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient
  }
}

export default fp(async (app: FastifyInstance) => {
  const prisma = getPrismaClient()
  await prisma.$connect()

  app.decorate('prisma', prisma)

  app.addHook('onClose', async (instance) => {
    await instance.prisma.$disconnect()
  })
})
