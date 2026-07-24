import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { MeiliSearch } from 'meilisearch'
import { SearchService, toSearchDocument } from '../../src/modules/search/search.service.js'
import type { Media } from '../../src/types/media.js'
import { isMeiliAvailable } from '../setup/servicesAvailable.js'

function makeMedia(overrides: Partial<Media> = {}): Media {
  return {
    id: `media-${Date.now()}-${Math.random()}`,
    type: 'MOVIE',
    title: 'The Matrix',
    originalTitle: null,
    overview: null,
    tagline: null,
    status: 'RELEASED',
    releaseDate: '1999-03-31',
    runtimeMinutes: 136,
    originalLangCode: 'en',
    popularity: 90,
    imdbId: null,
    genres: [{ id: 'g1', slug: 'accion', name: 'Acción' }],
    people: [],
    images: [],
    ratings: [],
    collections: [],
    seasons: [],
    translations: [],
    ...overrides,
  }
}

describe('SearchService (Meilisearch real)', () => {
  let meiliAvailable = false
  let service: SearchService | undefined
  let prisma: PrismaClient | undefined
  const indexedIds: string[] = []

  beforeAll(async () => {
    meiliAvailable = await isMeiliAvailable()
    if (!meiliAvailable) return

    const meili = new MeiliSearch({
      host: process.env.MEILISEARCH_HOST ?? 'http://localhost:7700',
      apiKey: process.env.MEILISEARCH_API_KEY,
    })
    prisma = new PrismaClient()
    service = new SearchService(meili, prisma)
    await service.ensureIndex()
  })

  afterEach(async () => {
    if (!service) return
    for (const id of indexedIds.splice(0)) {
      await service.deleteDocument(id).catch(() => {})
    }
  })

  afterAll(async () => {
    await prisma?.$disconnect()
  })

  it('ensureIndex() es idempotente (llamarlo dos veces no falla)', async () => {
    if (!meiliAvailable || !service) {
      console.warn('[SKIP] Meilisearch no disponible — ver docs/ROADMAP.md Fase 8.')
      return
    }
    await expect(service.ensureIndex()).resolves.not.toThrow()
  })

  it('indexa un documento y lo encuentra por título exacto', async () => {
    if (!meiliAvailable || !service) {
      console.warn('[SKIP] Meilisearch no disponible — ver docs/ROADMAP.md Fase 8.')
      return
    }
    const media = makeMedia({ title: `Unique Title ${Date.now()}` })
    indexedIds.push(media.id)
    await service.indexDocument(toSearchDocument(media))

    // Meilisearch indexa de forma asíncrona — se espera a la task.
    await new Promise((r) => setTimeout(r, 500))

    const result = await service.search({ query: media.title })
    expect(result.items.some((item) => item.id === media.id)).toBe(true)
  })

  it('tolera un typo de una letra en el título (typoTolerance)', async () => {
    if (!meiliAvailable || !service) {
      console.warn('[SKIP] Meilisearch no disponible — ver docs/ROADMAP.md Fase 8.')
      return
    }
    const media = makeMedia({ title: `Interstellar${Date.now()}` })
    indexedIds.push(media.id)
    await service.indexDocument(toSearchDocument(media))
    await new Promise((r) => setTimeout(r, 500))

    const typoQuery = media.title.slice(0, -1) + 'x' // último char reemplazado
    const result = await service.search({ query: typoQuery })
    expect(result.items.some((item) => item.id === media.id)).toBe(true)
  })

  it('filtra por type', async () => {
    if (!meiliAvailable || !service) {
      console.warn('[SKIP] Meilisearch no disponible — ver docs/ROADMAP.md Fase 8.')
      return
    }
    const movie = makeMedia({ title: `FilterTest${Date.now()}`, type: 'MOVIE' })
    indexedIds.push(movie.id)
    await service.indexDocument(toSearchDocument(movie))
    await new Promise((r) => setTimeout(r, 500))

    const result = await service.search({ query: movie.title, type: 'ANIME' })
    expect(result.items.some((item) => item.id === movie.id)).toBe(false)
  })

  it('deleteDocument() lo quita del índice', async () => {
    if (!meiliAvailable || !service) {
      console.warn('[SKIP] Meilisearch no disponible — ver docs/ROADMAP.md Fase 8.')
      return
    }
    const media = makeMedia({ title: `DeleteTest${Date.now()}` })
    await service.indexDocument(toSearchDocument(media))
    await new Promise((r) => setTimeout(r, 500))

    await service.deleteDocument(media.id)
    await new Promise((r) => setTimeout(r, 500))

    const result = await service.search({ query: media.title })
    expect(result.items.some((item) => item.id === media.id)).toBe(false)
  })
})
