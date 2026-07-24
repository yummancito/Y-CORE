import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { areInfraServicesAvailable } from './setup/servicesAvailable.js'

// Estos tests validan que las constraints declaradas en schema.prisma
// (unique compuesto, FK cascade) realmente se comportan como se espera
// contra Postgres — requieren `npm run docker:up` + migración aplicada.
// Si no están disponibles, se saltan con [SKIP] en vez de fallar (mismo
// patrón que tests/health.test.ts).
describe('constraints de base de datos', () => {
  let prisma: PrismaClient | undefined
  let infraAvailable = false

  beforeAll(async () => {
    infraAvailable = await areInfraServicesAvailable()
    if (!infraAvailable) return
    prisma = new PrismaClient()
    await prisma.$connect()
  })

  afterAll(async () => {
    await prisma?.$disconnect()
  })

  it('rechaza un Favorite duplicado (mismo userId+mediaId)', async () => {
    if (!infraAvailable || !prisma) {
      console.warn('[SKIP] Postgres no disponible — ver docs/ROADMAP.md Fase 2.')
      return
    }

    const user = await prisma.user.create({
      data: { id: randomUUID(), email: `test-${Date.now()}@example.com` },
    })
    const media = await prisma.media.create({
      data: { type: 'MOVIE', title: 'Test Movie' },
    })

    await prisma.favorite.create({ data: { userId: user.id, mediaId: media.id } })

    await expect(
      prisma.favorite.create({ data: { userId: user.id, mediaId: media.id } }),
    ).rejects.toThrow()

    await prisma.media.delete({ where: { id: media.id } })
    await prisma.user.delete({ where: { id: user.id } })
  })

  it('borra en cascada las Season/Episode al borrar el Media padre', async () => {
    if (!infraAvailable || !prisma) {
      console.warn('[SKIP] Postgres no disponible — ver docs/ROADMAP.md Fase 2.')
      return
    }

    const media = await prisma.media.create({
      data: { type: 'SERIES', title: 'Test Series' },
    })
    const season = await prisma.season.create({
      data: { mediaId: media.id, seasonNumber: 1 },
    })
    await prisma.episode.create({
      data: { seasonId: season.id, episodeNumber: 1 },
    })

    await prisma.media.delete({ where: { id: media.id } })

    const orphanSeason = await prisma.season.findUnique({ where: { id: season.id } })
    expect(orphanSeason).toBeNull()
  })
})
