import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { NormalizerService } from '../../src/services/normalizer/normalizer.service.js'
import type { NormalizedMediaInput } from '../../src/types/media.js'
import { areInfraServicesAvailable } from '../setup/servicesAvailable.js'

function makeInput(overrides: Partial<NormalizedMediaInput> = {}): NormalizedMediaInput {
  return {
    type: 'MOVIE',
    title: 'Test Movie',
    originalTitle: null,
    overview: null,
    tagline: null,
    status: 'RELEASED',
    releaseDate: null,
    runtimeMinutes: null,
    originalLangCode: null,
    popularity: 0,
    genres: [],
    people: [],
    images: [],
    ratings: [],
    seasons: [],
    externalRef: { providerSlug: 'tmdb', externalId: `test-${Date.now()}-${Math.random()}` },
    ...overrides,
  }
}

describe('NormalizerService.upsert', () => {
  let prisma: PrismaClient | undefined
  let infraAvailable = false
  const createdMediaIds: string[] = []

  beforeAll(async () => {
    infraAvailable = await areInfraServicesAvailable()
    if (!infraAvailable) return
    prisma = new PrismaClient()
  })

  afterEach(async () => {
    if (!prisma) return
    for (const id of createdMediaIds.splice(0)) {
      await prisma.media.delete({ where: { id } }).catch(() => {})
    }
  })

  afterAll(async () => {
    await prisma?.$disconnect()
  })

  it('crea un Media nuevo cuando no existe la referencia del proveedor', async () => {
    if (!infraAvailable || !prisma) {
      console.warn('[SKIP] Postgres no disponible — ver docs/ROADMAP.md Fase 5.')
      return
    }
    const service = new NormalizerService(prisma)
    const input = makeInput({ title: 'Nueva Película' })

    const result = await service.upsert(input)
    createdMediaIds.push(result.mediaId)

    expect(result.created).toBe(true)
    const media = await prisma.media.findUnique({ where: { id: result.mediaId } })
    expect(media?.title).toBe('Nueva Película')
  })

  it('reutiliza el mismo Media en un segundo upsert con el mismo provider+externalId', async () => {
    if (!infraAvailable || !prisma) {
      console.warn('[SKIP] Postgres no disponible — ver docs/ROADMAP.md Fase 5.')
      return
    }
    const service = new NormalizerService(prisma)
    const externalId = `dedup-test-${Date.now()}`

    const first = await service.upsert(
      makeInput({ title: 'Título Original', externalRef: { providerSlug: 'tmdb', externalId } }),
    )
    createdMediaIds.push(first.mediaId)

    const second = await service.upsert(
      makeInput({
        title: 'Título Actualizado',
        externalRef: { providerSlug: 'tmdb', externalId },
      }),
    )

    expect(second.created).toBe(false)
    expect(second.mediaId).toBe(first.mediaId)

    const media = await prisma.media.findUnique({ where: { id: first.mediaId } })
    expect(media?.title).toBe('Título Actualizado')

    const totalMediaRows = await prisma.media.count({ where: { id: first.mediaId } })
    expect(totalMediaRows).toBe(1)
  })

  it('no pisa el título de un proveedor de mayor weight con uno de menor weight', async () => {
    if (!infraAvailable || !prisma) {
      console.warn('[SKIP] Postgres no disponible — ver docs/ROADMAP.md Fase 5.')
      return
    }
    const service = new NormalizerService(prisma)

    // Simula: primero llega de TMDB (weight 100), después de Kitsu (weight 50)
    // apuntando a un Media DISTINTO a nivel de fila (distinto provider+id),
    // pero probamos la regla de weight vía el mismo mediaId reutilizando
    // manualmente una segunda ref al mismo media.
    const tmdbResult = await service.upsert(
      makeInput({
        title: 'Título de TMDB (alta confianza)',
        externalRef: { providerSlug: 'tmdb', externalId: `weight-test-tmdb-${Date.now()}` },
      }),
    )
    createdMediaIds.push(tmdbResult.mediaId)

    // Vincula manualmente una ref de Kitsu al MISMO media, simulando que
    // el matcher de duplicados (fuera de alcance de Fase 5) ya identificó
    // que es el mismo título.
    const kitsuProvider = await prisma.provider.findUniqueOrThrow({ where: { slug: 'kitsu' } })
    await prisma.mediaProviderRef.create({
      data: {
        mediaId: tmdbResult.mediaId,
        providerId: kitsuProvider.id,
        externalId: `weight-test-kitsu-${Date.now()}`,
      },
    })

    // Ahora actualiza vía la ref de Kitsu (weight 50 < 100 de TMDB ya vinculado)
    const kitsuRef = await prisma.mediaProviderRef.findFirstOrThrow({
      where: { providerId: kitsuProvider.id, mediaId: tmdbResult.mediaId },
    })
    await service.upsert(
      makeInput({
        title: 'Título de Kitsu (baja confianza, no debería aplicarse)',
        externalRef: { providerSlug: 'kitsu', externalId: kitsuRef.externalId },
      }),
    )

    const media = await prisma.media.findUnique({ where: { id: tmdbResult.mediaId } })
    expect(media?.title).toBe('Título de TMDB (alta confianza)')
  })

  it('sincroniza géneros sin duplicar la fila puente en upserts repetidos', async () => {
    if (!infraAvailable || !prisma) {
      console.warn('[SKIP] Postgres no disponible — ver docs/ROADMAP.md Fase 5.')
      return
    }
    const service = new NormalizerService(prisma)
    const externalId = `genre-test-${Date.now()}`
    const input = makeInput({
      genres: [{ slug: 'accion-test', name: 'Acción Test' }],
      externalRef: { providerSlug: 'tmdb', externalId },
    })

    const first = await service.upsert(input)
    createdMediaIds.push(first.mediaId)
    await service.upsert(input) // mismo input de nuevo

    const links = await prisma.mediaGenre.findMany({ where: { mediaId: first.mediaId } })
    expect(links).toHaveLength(1)
  })
})
