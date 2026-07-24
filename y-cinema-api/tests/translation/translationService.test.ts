import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { TranslationService } from '../../src/services/translation/translation.service.js'
import { areInfraServicesAvailable } from '../setup/servicesAvailable.js'

describe('TranslationService', () => {
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

  async function makeMedia(originalLangCode: string | null = 'ja'): Promise<string> {
    const media = await prisma!.media.create({
      data: { type: 'ANIME', title: 'Test Anime', originalLangCode },
    })
    createdMediaIds.push(media.id)
    return media.id
  }

  it('resolve() devuelve null y registra un gap cuando no hay ninguna traducción', async () => {
    if (!infraAvailable || !prisma) {
      console.warn('[SKIP] Postgres no disponible — ver docs/ROADMAP.md Fase 6.')
      return
    }
    const service = new TranslationService(prisma)
    const mediaId = await makeMedia()

    const result = await service.resolve(mediaId, 'OVERVIEW')

    expect(result).toBeNull()
    const gap = await prisma.translationGap.findFirst({ where: { mediaId, field: 'OVERVIEW' } })
    expect(gap).not.toBeNull()
    expect(gap?.wantedLng).toBe('es')
  })

  it('resolve() prioriza español sobre inglés cuando ambos existen', async () => {
    if (!infraAvailable || !prisma) {
      console.warn('[SKIP] Postgres no disponible — ver docs/ROADMAP.md Fase 6.')
      return
    }
    const service = new TranslationService(prisma)
    const mediaId = await makeMedia()

    await service.record({
      mediaId,
      languageCode: 'en',
      field: 'OVERVIEW',
      value: 'An English synopsis.',
      providerSlug: 'tmdb',
    })
    await service.record({
      mediaId,
      languageCode: 'es',
      field: 'OVERVIEW',
      value: 'Una sinopsis en español.',
      providerSlug: 'tmdb',
    })

    const result = await service.resolve(mediaId, 'OVERVIEW')

    expect(result?.value).toBe('Una sinopsis en español.')
    expect(result?.languageCode).toBe('es')
    expect(result?.isFallback).toBe(false)
  })

  it('resolve() cae a inglés cuando no hay español', async () => {
    if (!infraAvailable || !prisma) {
      console.warn('[SKIP] Postgres no disponible — ver docs/ROADMAP.md Fase 6.')
      return
    }
    const service = new TranslationService(prisma)
    const mediaId = await makeMedia()

    await service.record({
      mediaId,
      languageCode: 'en',
      field: 'OVERVIEW',
      value: 'English only synopsis.',
      providerSlug: 'tmdb',
    })

    const result = await service.resolve(mediaId, 'OVERVIEW')

    expect(result?.languageCode).toBe('en')
    expect(result?.isFallback).toBe(true)
  })

  it('resolve() cae al idioma original cuando no hay ES ni EN', async () => {
    if (!infraAvailable || !prisma) {
      console.warn('[SKIP] Postgres no disponible — ver docs/ROADMAP.md Fase 6.')
      return
    }
    const service = new TranslationService(prisma)
    const mediaId = await makeMedia('ja')

    await service.record({
      mediaId,
      languageCode: 'ja',
      field: 'OVERVIEW',
      value: '日本語のあらすじ。',
      providerSlug: 'anilist',
    })

    const result = await service.resolve(mediaId, 'OVERVIEW')

    expect(result?.languageCode).toBe('ja')
    expect(result?.isFallback).toBe(true)
  })

  it('record() no sobrescribe una traducción de mayor calidad con una peor', async () => {
    if (!infraAvailable || !prisma) {
      console.warn('[SKIP] Postgres no disponible — ver docs/ROADMAP.md Fase 6.')
      return
    }
    const service = new TranslationService(prisma)
    const mediaId = await makeMedia()

    await service.record({
      mediaId,
      languageCode: 'es',
      field: 'OVERVIEW',
      value: 'Una sinopsis larga y detallada que describe correctamente la trama completa.',
      providerSlug: 'tmdb',
    })
    // Mismo proveedor, un valor mucho más corto/pobre no debería pisar el anterior
    await service.record({
      mediaId,
      languageCode: 'es',
      field: 'OVERVIEW',
      value: '...',
      providerSlug: 'tmdb',
    })

    const result = await service.resolve(mediaId, 'OVERVIEW')
    expect(result?.value).toBe(
      'Una sinopsis larga y detallada que describe correctamente la trama completa.',
    )
  })

  it('record() resuelve un gap abierto cuando llega la traducción faltante', async () => {
    if (!infraAvailable || !prisma) {
      console.warn('[SKIP] Postgres no disponible — ver docs/ROADMAP.md Fase 6.')
      return
    }
    const service = new TranslationService(prisma)
    const mediaId = await makeMedia(null)

    await service.resolve(mediaId, 'TAGLINE') // crea el gap
    let gap = await prisma.translationGap.findFirst({ where: { mediaId, field: 'TAGLINE' } })
    expect(gap?.resolvedAt).toBeNull()

    await service.record({
      mediaId,
      languageCode: 'es',
      field: 'TAGLINE',
      value: 'Un eslogan en español.',
      providerSlug: 'tmdb',
    })

    gap = await prisma.translationGap.findFirst({ where: { mediaId, field: 'TAGLINE' } })
    expect(gap?.resolvedAt).not.toBeNull()
  })

  it('guarda traducciones de distintos proveedores para el mismo idioma+campo sin colisionar', async () => {
    if (!infraAvailable || !prisma) {
      console.warn('[SKIP] Postgres no disponible — ver docs/ROADMAP.md Fase 6.')
      return
    }
    const service = new TranslationService(prisma)
    const mediaId = await makeMedia()

    await service.record({
      mediaId,
      languageCode: 'es',
      field: 'TITLE',
      value: 'Título desde TMDB',
      providerSlug: 'tmdb',
    })
    await service.record({
      mediaId,
      languageCode: 'es',
      field: 'TITLE',
      value: 'Título desde AniList',
      providerSlug: 'anilist',
    })

    const rows = await prisma.translation.findMany({ where: { mediaId, field: 'TITLE' } })
    expect(rows).toHaveLength(2)
  })
})
