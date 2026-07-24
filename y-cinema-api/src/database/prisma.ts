import { PrismaClient } from '@prisma/client'

let prismaSingleton: PrismaClient | undefined

/** Cliente Prisma compartido — instanciado una vez por proceso. */
export function getPrismaClient(): PrismaClient {
  if (!prismaSingleton) {
    prismaSingleton = new PrismaClient()
  }
  return prismaSingleton
}
